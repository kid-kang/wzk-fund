import Router from '@koa/router'
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

function normalizeFundInput(raw = {}) {
  const code = String(raw.code || '').padStart(6, '0')
  return {
    code,
    name: raw.name || code,
    fundKey: raw.fundKey || '',
    type: raw.type === 'hold' ? 'hold' : 'watch',
    amount: Number(raw.amount) || 0,
    amountAsOf: raw.amountAsOf || '',
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

    let amountAsOf = body.amountAsOf || ''
    if ((body.type || 'watch') === 'hold' && !amountAsOf) {
      try {
        const m = await getFundMatiaria(meta.code || code)
        amountAsOf = String(m.netValueDate || '').slice(0, 10)
      } catch {
        amountAsOf = ''
      }
    }

    ctx.body = {
      success: true,
      data: {
        code: meta.code || code,
        name: body.name || meta.name || code,
        fundKey: meta.fundKey || body.fundKey || '',
        sectors: sectors || [],
        amountAsOf,
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
 * 返回原始 quotes（持仓汇总与滚仓由前端计算）
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
