const {request} = require('./request')
const {calcHoldings, mergeWatchlist} = require('./holdingsCalc')
const {sharesFromAmount: sharesFromAmountExact} = require('./money')
const store = require('./portfolioStore')

function assertOk(data) {
  if (data && data.success === false) {
    throw new Error(data.message || '请求失败')
  }
  return data
}

async function fetchHoldings() {
  const funds = store.listFunds('hold')
  const data = await request({
    url: '/api/funds/quotes',
    method: 'POST',
    data: {type: 'hold', funds},
  })
  assertOk(data)
  const result = calcHoldings(funds, (data.data && data.data.quotes) || [])
  if (result.persistPatches.length) store.patchFunds(result.persistPatches)
  return {summary: result.summary, list: result.list}
}

async function fetchWatchlist() {
  const funds = store.listFunds('watch')
  const data = await request({
    url: '/api/funds/quotes',
    method: 'POST',
    data: {type: 'watch', funds},
  })
  assertOk(data)
  const {list, persistPatches} = mergeWatchlist(
    funds,
    (data.data && data.data.quotes) || [],
  )
  if (persistPatches.length) store.patchFunds(persistPatches)
  return list
}

async function fetchIndices() {
  const data = await request({url: '/api/indices'})
  return data.data
}

async function fetchIndexHistory(code, range = '1m') {
  const data = await request({
    url: `/api/indices/${encodeURIComponent(code)}/history`,
    data: {range},
  })
  assertOk(data)
  return data.data
}

async function fetchFundHistory(code, range = '3m') {
  const data = await request({
    url: `/api/funds/${encodeURIComponent(code)}/history`,
    data: {range},
  })
  assertOk(data)
  return data.data
}

async function fetchFundQuote(code) {
  const data = await request({
    url: `/api/funds/${encodeURIComponent(code)}/quote`,
  })
  assertOk(data)
  return data.data
}

async function fetchMarketOverview() {
  const data = await request({url: '/api/market/overview'})
  return data.data
}

async function fetchGold() {
  const gold = store.loadConfig().gold
  const data = await request({
    url: '/api/gold/quote',
    method: 'POST',
    data: gold,
  })
  assertOk(data)
  return Object.assign({}, data.data, {
    holding: gold.holding,
    avgPrice: gold.avgPrice,
    show: store.getSettings().showGold !== false,
  })
}

async function fetchGoldHistory(range = '1m') {
  const data = await request({
    url: '/api/gold/history',
    data: {range},
  })
  assertOk(data)
  return data.data
}

async function resolveFund(payload) {
  const data = await request({
    url: '/api/funds/resolve',
    method: 'POST',
    data: payload,
  })
  return assertOk(data).data
}

function sharesFromAmount(amount, netValue) {
  if (!(amount > 0) || !(netValue != null && netValue > 0)) return 0
  return sharesFromAmountExact(amount, netValue)
}

function deriveHoldShares(amount, basis, meta) {
  if (!(amount > 0)) return 0
  if (basis === 'today') {
    if (!meta.confirmedSession) {
      throw new Error('今日净值尚未确认，请改选「昨日结算」，或等确认净值出来后再试')
    }
    if (!(meta.netValue != null && meta.netValue > 0)) {
      throw new Error('暂无今日确认净值，请稍后重试')
    }
    return sharesFromAmount(amount, meta.netValue)
  }
  const nav =
    meta.prevNetValue != null && meta.prevNetValue > 0
      ? meta.prevNetValue
      : meta.netValue
  if (!(nav != null && nav > 0)) {
    throw new Error('暂无确认净值，无法按金额反推份额，请稍后重试')
  }
  return sharesFromAmount(amount, nav)
}

async function createFund(payload) {
  const meta = await resolveFund({
    code: payload.code,
    type: payload.type || 'watch',
    name: payload.name,
    sectors: payload.sectors,
  })
  const amount = payload.amount != null ? payload.amount : 0
  const basis = payload.amountBasis === 'today' ? 'today' : 'prev'

  let shares = 0
  if (payload.type === 'hold') {
    shares = deriveHoldShares(amount, basis, meta)
  }

  return store.upsertFund({
    code: meta.code,
    name: payload.name || meta.name,
    fundKey: meta.fundKey,
    type: payload.type || 'watch',
    shares,
    sectors: payload.sectors && payload.sectors.length ? payload.sectors : meta.sectors,
  })
}

async function updateFund(code, payload) {
  const amount = payload.amount
  const amountBasis = payload.amountBasis
  const rest = Object.assign({}, payload)
  delete rest.amount
  delete rest.amountBasis
  const patch = rest

  if (amount != null) {
    const meta = await resolveFund({code, type: 'hold'})
    const basis = amountBasis === 'today' ? 'today' : 'prev'
    patch.shares = deriveHoldShares(Number(amount) || 0, basis, meta)
  }

  return store.updateFund(code, patch)
}

async function removeFund(code) {
  store.removeFund(code)
}

async function updateGoldConfig(payload) {
  return store.updateGold(payload)
}

async function fetchSettings() {
  return store.getSettings()
}

async function updateSettings(payload) {
  return store.updateSettings(payload)
}

async function exportConfig() {
  return store.loadConfig()
}

async function importConfig(payload) {
  return store.importLocalConfig(payload)
}

async function healthCheck() {
  return request({url: '/api/health'})
}

module.exports = {
  fetchHoldings,
  fetchWatchlist,
  fetchIndices,
  fetchIndexHistory,
  fetchFundHistory,
  fetchFundQuote,
  fetchMarketOverview,
  fetchGold,
  fetchGoldHistory,
  resolveFund,
  createFund,
  updateFund,
  removeFund,
  updateGoldConfig,
  fetchSettings,
  updateSettings,
  exportConfig,
  importConfig,
  healthCheck,
}
