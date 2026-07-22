import Router from '@koa/router'
import {
  listFunds,
  upsertFund,
  updateFund,
  deleteFund,
  getGoldConfig,
  updateGoldConfig,
  getConfig,
  importConfig,
  getSettings,
  updateSettings,
} from './store.js'
import {
  searchFund,
  getFundsQuotes,
  getFundQuote,
  getFundMatiaria,
  fetchFundSectorsQueued,
} from './services/fund.js'
import {getIndices, getIndexHistory, getMarketOverview} from './services/market.js'
import {getGoldRealtime} from './services/gold.js'

const router = new Router({prefix: '/api'})

function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 晚间确认涨跌后，自动把持仓金额滚到新确认市值：
 * amount_new = amount * (1 + dayGrowth/100)，并记录 amountAsOf = 净值日
 */
function rollConfirmedAmount(fund, quote) {
  if (fund.type !== 'hold') return fund
  const dayGrowth = quote?.dayGrowth
  const navDay = String(quote?.netValueDate || '').slice(0, 10)
  if (dayGrowth == null || !navDay) return fund
  if (quote?.percentSource !== 'confirmed') return fund

  const amount = Number(fund.amount) || 0
  if (amount <= 0) return fund

  let amountAsOf = String(fund.amountAsOf || '').slice(0, 10)
  // 存量无标记：若今天已确认，视为金额仍是确认日前市值，允许滚一次
  if (!amountAsOf) {
    amountAsOf = navDay === todayDateStr() ? '1970-01-01' : navDay
    if (amountAsOf === navDay) {
      try {
        updateFund(fund.code, {amountAsOf: navDay})
      } catch {
        // ignore
      }
      return {...fund, amountAsOf: navDay}
    }
  }

  if (navDay <= amountAsOf) return {...fund, amountAsOf}

  const nextAmount = round2(amount * (1 + dayGrowth / 100))
  try {
    updateFund(fund.code, {amount: nextAmount, amountAsOf: navDay})
  } catch {
    return fund
  }
  return {
    ...fund,
    amount: nextAmount,
    amountAsOf: navDay,
    _preRollAmount: amount,
  }
}

function calcHoldings(localFunds, quotes) {
  const quoteMap = new Map(quotes.map((q) => [q.code, q]))
  const rows = []
  let totalAmount = 0
  let totalPnl = 0
  const today = todayDateStr()

  for (const raw of localFunds) {
    const q = quoteMap.get(raw.code) || {}
    const f = rollConfirmedAmount(raw, q)
    const percent = q.percent ?? q.estimateGrowth ?? q.dayGrowth
    const amount = Number(f.amount) || 0
    const preRoll = f._preRollAmount

    // 当日收益：始终相对「今日开盘前确认市值」
    // - 未滚仓：amount 即上一确认市值，pnl = amount × 涨跌
    // - 刚/已滚到今日：amount 已含今日确认涨跌，需还原
    let pnl = 0
    let displayAmount = amount
    if (percent != null && amount > 0) {
      if (
        f.amountAsOf === today &&
        String(q.netValueDate || '').slice(0, 10) === today &&
        q.dayGrowth != null
      ) {
        const prev =
          preRoll != null ? preRoll : amount / (1 + q.dayGrowth / 100)
        pnl = amount - prev
        displayAmount = amount
      } else {
        pnl = amount * (percent / 100)
        displayAmount = amount
      }
    }

    const liveAmount =
      displayAmount > 0 && percent != null
        ? // 展示用确认金额；liveAmount 仅作兼容字段
        f.amountAsOf === today && q.dayGrowth != null
          ? displayAmount
          : displayAmount * (1 + percent / 100)
        : displayAmount

    totalAmount += displayAmount
    totalPnl += pnl

    const sectors = f.sectors?.length
      ? f.sectors
      : q.sectors?.length
        ? q.sectors
        : []

    if (!raw.sectors?.length && sectors.length) {
      try {
        updateFund(f.code, {sectors})
      } catch {
        // ignore persistence failure
      }
    }

    rows.push({
      ...f,
      name: q.name || f.name,
      fundKey: q.fundKey || f.fundKey,
      percent,
      percentSource: q.percentSource || null,
      estimateGrowth: q.estimateGrowth,
      dayGrowth: q.dayGrowth,
      netValueDate: q.netValueDate || '',
      time: q.time,
      trend: q.trend || [],
      amount: round2(displayAmount),
      amountAsOf: f.amountAsOf || '',
      liveAmount: round2(liveAmount),
      pnl: round2(pnl),
      sectors,
    })
  }

  for (const row of rows) {
    row.weight =
      totalAmount > 0 ? round2((row.amount / totalAmount) * 100) : 0
  }

  // 当日收益率相对开盘前确认市值
  let bodTotal = 0
  for (const row of rows) {
    if (row.amountAsOf === today && row.pnl != null) {
      bodTotal += (row.amount || 0) - (row.pnl || 0)
    } else {
      bodTotal += row.amount || 0
    }
  }
  bodTotal = round2(bodTotal)

  return {
    summary: {
      // 总持仓金额：各基金上一确认点金额之和
      totalAmount: round2(totalAmount),
      /** 开盘前确认市值合计，用于算当日收益率 */
      bodTotal,
      totalPnl: round2(totalPnl),
      totalPnlPercent:
        bodTotal > 0 ? round2((totalPnl / bodTotal) * 100) : 0,
    },
    list: rows.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
  }
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

router.get('/health', (ctx) => {
  ctx.body = {ok: true, time: new Date().toISOString()}
})

router.get('/config', (ctx) => {
  ctx.body = {success: true, data: getConfig()}
})

router.put('/config', async (ctx) => {
  try {
    const data = importConfig(ctx.request.body || {})
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/settings', (ctx) => {
  ctx.body = {success: true, data: getSettings()}
})

router.put('/settings', (ctx) => {
  try {
    const body = ctx.request.body || {}
    const data = updateSettings({
      showGold: typeof body.showGold === 'boolean' ? body.showGold : undefined,
    })
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/funds', (ctx) => {
  const type = ctx.query.type
  ctx.body = {success: true, data: listFunds({type})}
})

router.get('/funds/search', async (ctx) => {
  try {
    const code = ctx.query.code
    if (!code) {
      ctx.status = 400
      ctx.body = {success: false, message: '缺少 code'}
      return
    }
    const data = await searchFund(code)
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/funds/quotes', async (ctx) => {
  try {
    const type = ctx.query.type // hold | watch | all
    const funds = listFunds({
      type: type === 'all' || !type ? undefined : type,
    })
    const quotes = await getFundsQuotes(funds)

    if (type === 'hold') {
      ctx.body = {success: true, data: calcHoldings(funds, quotes)}
      return
    }

    if (type === 'watch') {
      const quoteMap = new Map(quotes.map((q) => [q.code, q]))
      const list = funds.map((f) => {
        const q = quoteMap.get(f.code) || {}
        const sectors = f.sectors?.length
          ? f.sectors
          : q.sectors?.length
            ? q.sectors
            : []
        if (!f.sectors?.length && sectors.length) {
          try {
            updateFund(f.code, {sectors})
          } catch {
            // ignore
          }
        }
        return {
          ...f,
          name: q.name || f.name,
          percent: q.percent ?? q.estimateGrowth ?? q.dayGrowth,
          estimateGrowth: q.estimateGrowth,
          dayGrowth: q.dayGrowth,
          time: q.time,
          trend: q.trend || [],
          sectors,
        }
      })
      // 自选顺序由 listFunds 按添加顺序固定，不再按涨跌幅重排
      ctx.body = {
        success: true,
        data: {list},
      }
      return
    }

    ctx.body = {success: true, data: {quotes, funds}}
  } catch (e) {
    ctx.status = 500
    ctx.body = {success: false, message: e.message}
  }
})

router.post('/funds', async (ctx) => {
  try {
    const body = ctx.request.body || {}
    const code = String(body.code || '').trim()
    if (!code) {
      ctx.status = 400
      ctx.body = {success: false, message: '缺少基金代码'}
      return
    }

    let meta = {}
    try {
      meta = await searchFund(code)
    } catch (e) {
      if (!body.name) {
        ctx.status = 400
        ctx.body = {success: false, message: e.message || '搜索基金失败'}
        return
      }
    }

    let sectors = Array.isArray(body.sectors) ? body.sectors : null
    if (!sectors?.length) {
      try {
        sectors = await fetchFundSectorsQueued(
          meta.code || code,
          body.name || meta.name,
        )
      } catch {
        sectors = []
      }
    }

    // 添加持仓时金额=当前已确认市值，标记 amountAsOf 为最新净值日
    let amountAsOf = body.amountAsOf || ''
    if ((body.type || 'watch') === 'hold' && !amountAsOf) {
      try {
        const m = await getFundMatiaria(meta.code || code)
        amountAsOf = String(m.netValueDate || '').slice(0, 10)
      } catch {
        amountAsOf = ''
      }
    }

    const saved = upsertFund({
      code: meta.code || code,
      name: body.name || meta.name,
      fundKey: meta.fundKey || body.fundKey,
      type: body.type || 'watch',
      amount: body.amount,
      amountAsOf,
      shares: body.shares,
      sectors,
    })
    ctx.body = {success: true, data: saved}
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

router.put('/funds/:code', async (ctx) => {
  try {
    const patch = ctx.request.body || {}
    // 编辑时只允许改金额等本地字段；名称/板块由公开接口维护
    const allowed = {}
    if (patch.amount != null) {
      allowed.amount = Number(patch.amount) || 0
      // 手动改金额：锚定到当前最新净值日，避免被立刻再滚一次
      if (patch.amountAsOf) {
        allowed.amountAsOf = String(patch.amountAsOf).slice(0, 10)
      } else {
        try {
          const m = await getFundMatiaria(ctx.params.code)
          allowed.amountAsOf = String(m.netValueDate || '').slice(0, 10)
        } catch {
          // keep previous
        }
      }
    }
    if (patch.shares != null) allowed.shares = Number(patch.shares) || 0
    if (patch.type === 'hold' || patch.type === 'watch') allowed.type = patch.type
    if (Array.isArray(patch.sectors)) allowed.sectors = patch.sectors
    if (patch.name) allowed.name = patch.name
    const data = updateFund(ctx.params.code, allowed)
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

router.delete('/funds/:code', async (ctx) => {
  try {
    deleteFund(ctx.params.code)
    ctx.body = {success: true}
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/funds/:code/quote', async (ctx) => {
  try {
    const funds = listFunds()
    const local = funds.find((f) => f.code === ctx.params.code) || {
      code: ctx.params.code,
      name: '',
      fundKey: '',
      sectors: [],
    }
    const data = await getFundQuote(local)
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 500
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/indices', async (ctx) => {
  try {
    const data = await getIndices()
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 500
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/indices/:code/history', async (ctx) => {
  try {
    const range = String(ctx.query.range || '1m')
    const data = await getIndexHistory(ctx.params.code, range)
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/market/overview', async (ctx) => {
  try {
    const data = await getMarketOverview()
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 500
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/gold', async (ctx) => {
  try {
    const cfg = getGoldConfig()
    const data = await getGoldRealtime(cfg)
    ctx.body = {success: true, data: {...data, show: getSettings().showGold !== false}}
  } catch (e) {
    ctx.status = 500
    ctx.body = {success: false, message: e.message}
  }
})

router.put('/gold/config', async (ctx) => {
  try {
    const data = updateGoldConfig(ctx.request.body || {})
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

export default router
