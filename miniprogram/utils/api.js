const {request} = require('./request')
const {calcHoldings, mergeWatchlist} = require('./holdingsCalc')
const {sharesFromAmount: sharesFromAmountExact} = require('./money')
const {classifyFundType} = require('./fundCategory')
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
  // 请求期间用户可能已删/改持仓：始终按当前本地配置重算，避免过期结果把已删基金写回列表
  const fundsNow = store.listFunds('hold')
  const result = calcHoldings(fundsNow, (data.data && data.data.quotes) || [])
  if (result.persistPatches.length) store.patchFunds(result.persistPatches)
  return {
    list: result.list,
    groups: result.groups,
  }
}

async function fetchWatchlist() {
  const funds = store.listFunds('watch')
  const data = await request({
    url: '/api/funds/quotes',
    method: 'POST',
    data: {type: 'watch', funds},
  })
  assertOk(data)
  const fundsNow = store.listFunds('watch')
  const {list, persistPatches} = mergeWatchlist(
    fundsNow,
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

async function fetchIndustryFunds(mappingCode) {
  const data = await request({
    url: '/api/market/boards/funds',
    data: {mappingCode},
  })
  assertOk(data)
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
    buyFeeRate: gold.buyFeeRate || 0,
    sellFeeRate: gold.sellFeeRate || 0,
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

/**
 * 按最新官方公布净值反推份额（不用盘中估值）。
 * 金额口径 = 份额 × 最新披露单位净值。
 */
function deriveHoldShares(amount, meta) {
  if (!(amount > 0)) return 0
  const nav =
    meta.netValue != null && meta.netValue > 0
      ? meta.netValue
      : meta.prevNetValue != null && meta.prevNetValue > 0
        ? meta.prevNetValue
        : null
  if (!(nav != null && nav > 0)) {
    throw new Error('暂无最新公布净值，无法按金额反推份额，请稍后重试')
  }
  return sharesFromAmountExact(amount, nav)
}

async function createFund(payload) {
  const meta = await resolveFund({
    code: payload.code,
    type: payload.type || 'watch',
    name: payload.name,
    sectors: payload.sectors,
  })
  const amount = payload.amount != null ? payload.amount : 0

  let shares = 0
  if (payload.type === 'hold') {
    shares = deriveHoldShares(amount, meta)
  }

  const name = payload.name || meta.name
  const ftype = meta.ftype || ''
  return store.upsertFund({
    code: meta.code,
    name,
    fundKey: meta.fundKey,
    type: payload.type || 'watch',
    shares,
    sectors: payload.sectors && payload.sectors.length ? payload.sectors : meta.sectors,
    ftype,
    fundType: classifyFundType(ftype, name),
  })
}

async function updateFund(code, payload) {
  const amount = payload.amount
  const rest = Object.assign({}, payload)
  delete rest.amount
  delete rest.amountBasis
  const patch = rest

  if (amount != null) {
    const meta = await resolveFund({code, type: 'hold'})
    patch.shares = deriveHoldShares(Number(amount) || 0, meta)
  }

  return store.updateFund(code, patch)
}

async function removeFund(code) {
  store.removeFund(code)
}

async function clearFunds(scope) {
  return store.clearFunds(scope)
}

async function fetchFundHoldings(code) {
  const data = await request({
    url: `/api/funds/${encodeURIComponent(code)}/holdings`,
  })
  assertOk(data)
  return data.data
}

async function fetchFundStageStats(code) {
  const data = await request({
    url: `/api/funds/${encodeURIComponent(code)}/stage-stats`,
  })
  assertOk(data)
  return data.data
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
  fetchIndustryFunds,
  fetchGold,
  fetchGoldHistory,
  resolveFund,
  createFund,
  updateFund,
  removeFund,
  clearFunds,
  fetchFundHoldings,
  fetchFundStageStats,
  updateGoldConfig,
  fetchSettings,
  updateSettings,
  exportConfig,
  importConfig,
  healthCheck,
}
