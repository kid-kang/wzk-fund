import Router from '@koa/router'
import {
  searchFund,
  getFundsQuotes,
  getFundQuote,
  getFundMatiaria,
  fetchFundNavHistory,
  fetchFundSectorsQueued,
  getFundHistory,
  isConfirmedSessionActive,
} from './services/fund.js'
import {getIndices, getIndexHistory, getMarketOverview} from './services/market.js'
import {getGoldRealtime} from './services/gold.js'

const router = new Router({prefix: '/api'})

function normalizeFundInput(raw = {}) {
  const code = String(raw.code || '').padStart(6, '0')
  return {
    code,
    name: raw.name || code,
    fundKey: raw.fundKey || '',
    type: raw.type === 'hold' ? 'hold' : 'watch',
    shares: Number(raw.shares) || 0,
    sectors: Array.isArray(raw.sectors) ? raw.sectors : [],
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || '',
  }
}

router.get('/health', (ctx) => {
  ctx.body = {ok: true, time: new Date().toISOString()}
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

/**
 * 添加基金时补全名称/板块/净值日，不落库
 * body: { code, type?, name?, sectors? }
 */
router.post('/funds/resolve', async (ctx) => {
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

    let netValue = null
    let prevNetValue = null
    let prevNetValueDate = ''
    let netValueDate = ''
    if ((body.type || 'watch') === 'hold') {
      try {
        const hist = await fetchFundNavHistory(meta.code || code, 5)
        if (hist.length) {
          netValue = hist[0].netValue
          netValueDate = hist[0].date || ''
          if (hist[1]?.netValue != null) prevNetValue = hist[1].netValue
          if (hist[1]?.date) prevNetValueDate = hist[1].date
        }
      } catch {
        // fall through
      }
      try {
        if (netValue == null || !netValueDate) {
          const m = await getFundMatiaria(meta.code || code)
          netValue = netValue ?? m.netValue ?? null
          netValueDate = netValueDate || m.netValueDate || ''
        }
      } catch {
        // keep empty
      }
      if (netValue == null && meta.netValue != null) netValue = meta.netValue

      // 「昨日结算」反推份额用的净值：
      // - 确认会话内：金额是今确认前市值 → 用上一交易日净值 hist[1]
      // - 盘中估值期：金额是最新确认市值 → 用最新披露净值 hist[0]
      //   （此时绝不能再用 hist[1]，否则份额系统性偏大）
      if (netValue != null && netValueDate && !isConfirmedSessionActive(netValueDate)) {
        prevNetValue = netValue
        prevNetValueDate = netValueDate
      }
    }

    ctx.body = {
      success: true,
      data: {
        code: meta.code || code,
        name: body.name || meta.name || code,
        fundKey: meta.fundKey || body.fundKey || '',
        sectors: sectors || [],
        netValue,
        prevNetValue,
        prevNetValueDate,
        netValueDate,
        /** 是否处于今日净值已确认会话（可选「今日结算」） */
        confirmedSession: !!(netValueDate && isConfirmedSessionActive(netValueDate)),
      },
    }
  } catch (e) {
    ctx.status = 400
    ctx.body = {success: false, message: e.message}
  }
})

/**
 * 无状态行情：客户端传入基金列表
 * body: { type: 'hold'|'watch', funds: FundRecord[] }
 * 返回原始 quotes（持仓汇总由前端按 shares 实时计算）
 */
router.post('/funds/quotes', async (ctx) => {
  try {
    const body = ctx.request.body || {}
    const type = body.type === 'watch' ? 'watch' : 'hold'
    const funds = Array.isArray(body.funds)
      ? body.funds.map(normalizeFundInput).filter((f) => /^\d{6}$/.test(f.code))
      : []

    const quotes = await getFundsQuotes(funds)
    ctx.body = {success: true, data: {type, quotes, funds}}
  } catch (e) {
    ctx.status = 500
    ctx.body = {success: false, message: e.message}
  }
})

router.get('/funds/:code/quote', async (ctx) => {
  try {
    const local = {
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

router.get('/funds/:code/history', async (ctx) => {
  try {
    const range = String(ctx.query.range || '3m')
    const data = await getFundHistory(ctx.params.code, range)
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

/**
 * 无状态黄金行情
 * body: { holding?, avgPrice? }
 */
router.post('/gold/quote', async (ctx) => {
  try {
    const body = ctx.request.body || {}
    const cfg = {
      holding: Number(body.holding) || 0,
      avgPrice: Number(body.avgPrice) || 0,
    }
    const data = await getGoldRealtime(cfg)
    ctx.body = {success: true, data}
  } catch (e) {
    ctx.status = 500
    ctx.body = {success: false, message: e.message}
  }
})

export default router
