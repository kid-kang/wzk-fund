const STORAGE_KEY = 'wzk-fund-config'
const {todayDateStr, normalizeBuyDate} = require('./tradingCalendar')
const {normalizeSipCycle} = require('./tradeMath')

const DEFAULT_CONFIG = {
  settings: {showGold: true, profitSince: ''},
  funds: {},
  gold: {holding: 0, avgPrice: 0, buyFeeRate: 0, sellFeeRate: 0},
  profitLog: [],
  trades: [],
  sipPlans: [],
}

function cloneDefault() {
  return {
    settings: {showGold: true, profitSince: ''},
    funds: {},
    gold: {holding: 0, avgPrice: 0, buyFeeRate: 0, sellFeeRate: 0},
    profitLog: [],
    trades: [],
    sipPlans: [],
  }
}

function newLocalId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

function roundMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 100) / 100
}

function normalizeDateKey(raw) {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
}

function normalizeProfitRow(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.source === 'demo') return null
  const date = normalizeDateKey(raw.date)
  if (!date) return null
  const pnl = Number(raw.pnl)
  if (!Number.isFinite(pnl)) return null
  const amount = Number(raw.amount)
  return {
    date,
    pnl: roundMoney(pnl),
    amount: Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0,
    source: 'live',
  }
}

function normalizeProfitLog(raw) {
  if (!Array.isArray(raw)) return []
  const map = new Map()
  for (const item of raw) {
    const row = normalizeProfitRow(item)
    if (!row) continue
    if (row.date >= todayDateStr()) continue
    map.set(row.date, row)
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function normalizeFeeRate(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  // 买入费率须 < 100%，否则无法反推实付成本
  if (n >= 100) return 99.99
  return Math.round(n * 10000) / 10000
}

function normalizeHolding(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 10000) / 10000
}

/** 持仓成本（元）。未填或无效视为 0，列表不展示收益率。 */
function normalizeCost(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function normalizeFund(raw, prev) {
  const code = String(raw.code || '').padStart(6, '0')
  const now = new Date().toISOString()
  const type =
    raw.type === 'hold' || raw.type === 'watch'
      ? raw.type
      : (prev && prev.type) || 'watch'
  const buyRaw = raw.buyDate != null ? raw.buyDate : prev && prev.buyDate
  return {
    code,
    name: raw.name != null ? raw.name : prev && prev.name != null ? prev.name : code,
    fundKey: raw.fundKey != null ? raw.fundKey : (prev && prev.fundKey) || '',
    type,
    shares: Number(raw.shares != null ? raw.shares : (prev && prev.shares) || 0) || 0,
    cost: normalizeCost(raw.cost != null ? raw.cost : prev && prev.cost),
    buyDate: normalizeBuyDate(buyRaw),
    sectors: Array.isArray(raw.sectors) ? raw.sectors : (prev && prev.sectors) || [],
    fundType: raw.fundType || (prev && prev.fundType) || '',
    ftype: raw.ftype != null ? raw.ftype : (prev && prev.ftype) || '',
    createdAt: (prev && prev.createdAt) || raw.createdAt || now,
    updatedAt: now,
  }
}

function normalizeTradeType(raw) {
  if (raw === 'sell' || raw === 'sip' || raw === 'buy' || raw === 'exit') return raw
  return ''
}

function normalizeTrade(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = normalizeTradeType(raw.type)
  if (!type) return null
  const date = normalizeDateKey(raw.date)
  if (!date) return null
  const code = String(raw.code || '').padStart(6, '0')
  if (!/^\d{6}$/.test(code)) return null
  const confirmDate = normalizeDateKey(raw.confirmDate) || date
  const nav = Number(raw.nav)
  const shares = Number(raw.shares)
  return {
    id: String(raw.id || newLocalId('tr')),
    code,
    name: String(raw.name || ''),
    type,
    date,
    session: raw.session === 'after15' ? 'after15' : 'before15',
    confirmDate,
    nav: Number.isFinite(nav) && nav > 0 ? nav : 0,
    amount: roundMoney(raw.amount),
    shares: Number.isFinite(shares) && shares > 0 ? shares : 0,
    fee: roundMoney(raw.fee),
    feeRate: normalizeFeeRate(raw.feeRate),
    cycle: String(raw.cycle || ''),
    sipId: String(raw.sipId || ''),
    scheduleDate: normalizeDateKey(raw.scheduleDate) || date,
    pending: raw.pending === true,
    createdAt: String(raw.createdAt || new Date().toISOString()),
  }
}

function normalizeTrades(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const row = normalizeTrade(item)
    if (!row) continue
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  out.sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d) return d
    return String(b.createdAt).localeCompare(String(a.createdAt))
  })
  return out.slice(0, 2000)
}

function normalizeSipPlan(raw) {
  if (!raw || typeof raw !== 'object') return null
  const code = String(raw.code || '').padStart(6, '0')
  if (!/^\d{6}$/.test(code)) return null
  const firstDate = normalizeDateKey(raw.firstDate)
  if (!firstDate) return null
  const amount = roundMoney(raw.amount)
  if (!(amount > 0)) return null
  return {
    id: String(raw.id || newLocalId('sip')),
    code,
    name: String(raw.name || ''),
    amount,
    feeRate: normalizeFeeRate(raw.feeRate),
    cycle: normalizeSipCycle(raw.cycle),
    firstDate,
    active: raw.active !== false && raw.paused !== true && raw.status !== 'paused',
    paused: raw.paused === true || raw.status === 'paused',
    createdAt: String(raw.createdAt || new Date().toISOString()),
    updatedAt: String(raw.updatedAt || raw.createdAt || new Date().toISOString()),
  }
}

function normalizeSipPlans(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    const row = normalizeSipPlan(item)
    if (!row) continue
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

function normalizeConfig(payload) {
  const fundsIn = payload && payload.funds && typeof payload.funds === 'object' ? payload.funds : {}
  const funds = {}
  for (const [key, raw] of Object.entries(fundsIn)) {
    const code = String((raw && raw.code) || key).padStart(6, '0')
    if (!/^\d{6}$/.test(code)) continue
    funds[code] = normalizeFund(Object.assign({}, raw, {code}))
  }
  return {
    settings: {
      showGold:
        payload && payload.settings && typeof payload.settings.showGold === 'boolean'
          ? payload.settings.showGold
          : DEFAULT_CONFIG.settings.showGold,
      profitSince: normalizeDateKey(
        payload && payload.settings && payload.settings.profitSince,
      ),
    },
    funds,
    gold: {
      holding: normalizeHolding(payload && payload.gold && payload.gold.holding),
      avgPrice: Number((payload && payload.gold && payload.gold.avgPrice) || 0) || 0,
      buyFeeRate: normalizeFeeRate(
        payload && payload.gold ? payload.gold.buyFeeRate : 0,
      ),
      sellFeeRate: normalizeFeeRate(
        payload && payload.gold ? payload.gold.sellFeeRate : 0,
      ),
    },
    profitLog: normalizeProfitLog(payload && payload.profitLog),
    trades: normalizeTrades(payload && payload.trades),
    sipPlans: normalizeSipPlans(payload && payload.sipPlans),
  }
}

function loadConfig() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw) return cloneDefault()
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const next = normalizeConfig(parsed)
    const serialized = JSON.stringify(next)
    const prevStr = typeof raw === 'string' ? raw : JSON.stringify(raw)
    if (prevStr !== serialized) {
      wx.setStorageSync(STORAGE_KEY, serialized)
    }
    return next
  } catch (e) {
    return cloneDefault()
  }
}

function saveConfig(config) {
  const next = normalizeConfig(config)
  wx.setStorageSync(STORAGE_KEY, JSON.stringify(next))
  return next
}

function listFunds(type) {
  const {funds} = loadConfig()
  const ordered = Object.keys(funds).map((key, idx) =>
    Object.assign({}, funds[key], {_order: idx}),
  )
  function stripOrder(f) {
    const next = Object.assign({}, f)
    delete next._order
    return next
  }
  if (type === 'hold') {
    return ordered.filter((f) => f.type === 'hold').map(stripOrder)
  }
  if (type === 'watch') {
    // 自选排序改由页面按基金类型分组；此处仅过滤
    return ordered.filter((f) => f.type === 'watch').map(stripOrder)
  }
  return ordered.map(stripOrder)
}

function upsertFund(payload) {
  const config = loadConfig()
  const code = String(payload.code).padStart(6, '0')
  if (!/^\d{6}$/.test(code)) throw new Error('基金代码须为6位数字')
  const prev = config.funds[code]
  const next = normalizeFund(Object.assign({}, payload, {code}), prev)
  config.funds[code] = next
  saveConfig(config)
  return next
}

function getFund(code) {
  const key = String(code).padStart(6, '0')
  return loadConfig().funds[key] || null
}

function updateFund(code, patch) {
  const config = loadConfig()
  const key = String(code).padStart(6, '0')
  if (!config.funds[key]) throw new Error('基金不存在')
  const next = normalizeFund(
    Object.assign({}, config.funds[key], patch, {code: key}),
    config.funds[key],
  )
  config.funds[key] = next
  saveConfig(config)
  return next
}

function dropSipForCodes(config, codes) {
  const drop = new Set((codes || []).map((c) => String(c).padStart(6, '0')))
  if (!drop.size) return
  config.sipPlans = (config.sipPlans || []).filter((p) => p && !drop.has(p.code))
}

function dropLedgerForCodes(config, codes) {
  const drop = new Set((codes || []).map((c) => String(c).padStart(6, '0')))
  if (!drop.size) return
  config.trades = (config.trades || []).filter((t) => t && !drop.has(t.code))
  dropSipForCodes(config, codes)
}

function removeFund(code) {
  const config = loadConfig()
  const key = String(code).padStart(6, '0')
  if (!config.funds[key]) throw new Error('基金不存在')
  delete config.funds[key]
  dropSipForCodes(config, [key])
  saveConfig(config)
}

/**
 * 持仓侧滑删除：清掉该基金交易/定投/买卖点并转入自选。
 * 收益记录按日独立存放，不随单只基金删除。
 */
function removeHoldingToWatch(code) {
  const config = loadConfig()
  const key = String(code).padStart(6, '0')
  const fund = config.funds[key]
  if (!fund) throw new Error('基金不存在')
  if (fund.type !== 'hold') throw new Error('仅持仓可这样删除')
  dropLedgerForCodes(config, [key])
  config.funds[key] = normalizeFund(
    Object.assign({}, fund, {
      type: 'watch',
      shares: 0,
      cost: 0,
      buyDate: '',
    }),
    fund,
  )
  saveConfig(config)
  return config.funds[key]
}

/**
 * 一键清空本地基金配置。
 * hold：删持仓及这些基金的交易/定投。
 * watch：删自选和定投，保留交易流水与买卖点。
 * all：清空基金、交易、定投。
 * @param {'hold'|'watch'|'all'} scope
 */
function clearFunds(scope) {
  const config = loadConfig()
  if (scope === 'all') {
    config.funds = {}
    config.trades = []
    config.sipPlans = []
  } else if (scope === 'hold' || scope === 'watch') {
    const dropped = []
    const next = {}
    for (const [key, fund] of Object.entries(config.funds)) {
      if (fund && fund.type === scope) dropped.push(key)
      else if (fund) next[key] = fund
    }
    config.funds = next
    if (scope === 'hold') dropLedgerForCodes(config, dropped)
    else dropSipForCodes(config, dropped)
  } else {
    throw new Error('清空范围无效')
  }
  saveConfig(config)
  return config
}

function updateGold(patch) {
  const config = loadConfig()
  // 黄金只改持仓口径，不写交易记录 / 定投 / 买卖点
  config.gold = {
    holding: normalizeHolding(
      patch.holding != null ? patch.holding : config.gold.holding,
    ),
    avgPrice: Number(patch.avgPrice != null ? patch.avgPrice : config.gold.avgPrice || 0) || 0,
    buyFeeRate: normalizeFeeRate(
      patch.buyFeeRate != null ? patch.buyFeeRate : config.gold.buyFeeRate,
    ),
    sellFeeRate: normalizeFeeRate(
      patch.sellFeeRate != null ? patch.sellFeeRate : config.gold.sellFeeRate,
    ),
  }
  saveConfig(config)
  return config.gold
}

function getSettings() {
  return loadConfig().settings
}

function updateSettings(patch) {
  const config = loadConfig()
  if (typeof patch.showGold === 'boolean') {
    config.settings.showGold = patch.showGold
  }
  if (patch.profitSince != null) {
    config.settings.profitSince = normalizeDateKey(patch.profitSince)
  }
  saveConfig(config)
  return config.settings
}

function ensureProfitSince() {
  const config = loadConfig()
  if (config.settings && config.settings.profitSince) return config.settings.profitSince
  const day = todayDateStr()
  config.settings.profitSince = day
  // 功能上线前的收益一律不算（含开发期 demo / 旧 30 天回填）
  config.profitLog = (config.profitLog || []).filter((row) => row && row.date >= day)
  saveConfig(config)
  return day
}

function importLocalConfig(payload) {
  if (!payload || !payload.funds || typeof payload.funds !== 'object') {
    throw new Error('配置缺少 funds')
  }
  return saveConfig(normalizeConfig(payload))
}

function listProfitLog() {
  const config = loadConfig()
  const all = config.profitLog || []
  const since = config.settings && config.settings.profitSince
  if (!since) return all.slice()
  return all.filter((row) => row && row.date >= since)
}

function upsertProfitDay(entry) {
  const row = normalizeProfitRow(
    Object.assign({}, entry, {source: (entry && entry.source) || 'live'}),
  )
  if (!row) return listProfitLog()
  const config = loadConfig()
  const prev = (config.profitLog || []).find((item) => item.date === row.date)
  if (
    prev &&
    prev.pnl === row.pnl &&
    prev.amount === row.amount &&
    prev.source === row.source
  ) {
    return config.profitLog
  }
  config.profitLog = normalizeProfitLog([...(config.profitLog || []), row])
  saveConfig(config)
  return config.profitLog
}

function upsertProfitDays(entries) {
  if (!entries || !entries.length) return listProfitLog()
  const config = loadConfig()
  const merged = [...(config.profitLog || [])]
  for (const entry of entries) {
    const row = normalizeProfitRow(
      Object.assign({}, entry, {source: (entry && entry.source) || 'live'}),
    )
    if (row) merged.push(row)
  }
  const next = normalizeProfitLog(merged)
  const prevStr = JSON.stringify(config.profitLog || [])
  const nextStr = JSON.stringify(next)
  if (prevStr === nextStr) return config.profitLog
  config.profitLog = next
  saveConfig(config)
  return config.profitLog
}

function listTrades(filter) {
  const all = loadConfig().trades || []
  if (!filter) return all.slice()
  return all.filter((t) => {
    if (filter.code && t.code !== String(filter.code).padStart(6, '0')) return false
    if (filter.type && t.type !== filter.type) return false
    if (filter.sipId && t.sipId !== filter.sipId) return false
    if (filter.pending != null && !!t.pending !== !!filter.pending) return false
    return true
  })
}

function addTrade(payload) {
  const row = normalizeTrade(Object.assign({}, payload, {id: payload.id || newLocalId('tr')}))
  if (!row) throw new Error('交易记录无效')
  const config = loadConfig()
  config.trades = normalizeTrades([row, ...(config.trades || [])])
  saveConfig(config)
  return row
}

/** 份额/成本与流水同一次写入。待确认交易只记账、不改持仓。 */
function applyFundTrade(code, patch, trade) {
  const key = String(code).padStart(6, '0')
  const row = normalizeTrade(Object.assign({}, trade, {id: trade.id || newLocalId('tr'), code: key}))
  if (!row) throw new Error('交易记录无效')
  const config = loadConfig()
  if (!config.funds[key]) throw new Error('基金不存在')
  if (patch && !row.pending) {
    config.funds[key] = normalizeFund(
      Object.assign({}, config.funds[key], patch, {code: key}),
      config.funds[key],
    )
  }
  config.trades = normalizeTrades([row, ...(config.trades || [])])
  saveConfig(config)
  return {fund: config.funds[key], trade: row}
}

function patchTrade(id, tradePatch, fundPatch) {
  const config = loadConfig()
  const trades = config.trades || []
  const idx = trades.findIndex((t) => t && t.id === id)
  if (idx < 0) return null
  const prev = trades[idx]
  const next = normalizeTrade(Object.assign({}, prev, tradePatch, {id: prev.id, code: prev.code}))
  if (!next) return null
  trades[idx] = next
  if (fundPatch && config.funds[prev.code]) {
    config.funds[prev.code] = normalizeFund(
      Object.assign({}, config.funds[prev.code], fundPatch, {code: prev.code}),
      config.funds[prev.code],
    )
  }
  config.trades = normalizeTrades(trades)
  saveConfig(config)
  return {fund: config.funds[prev.code] || null, trade: next}
}

function listSipPlans(code) {
  const all = loadConfig().sipPlans || []
  if (!code) return all.slice()
  const key = String(code).padStart(6, '0')
  return all.filter((p) => p.code === key)
}

function currentSipPlan(code) {
  const list = listSipPlans(code)
  return list.find((p) => p.active) || list.find((p) => p.paused) || null
}

function upsertSipPlan(payload, {fresh = false} = {}) {
  const incoming = normalizeSipPlan(
    Object.assign({}, payload, {id: payload.id || newLocalId('sip')}),
  )
  if (!incoming) throw new Error('定投计划无效')
  const config = loadConfig()
  let plans = config.sipPlans || []
  const now = new Date().toISOString()
  if (fresh) {
    plans = plans.filter(
      (p) => !(p && p.code === incoming.code && (p.active || p.paused)),
    )
    plans.push(Object.assign({}, incoming, {updatedAt: now}))
  } else {
    const idx = plans.findIndex(
      (p) =>
        p.id === incoming.id ||
        (p.code === incoming.code && (p.active || p.paused)),
    )
    if (idx >= 0) {
      const prev = plans[idx]
      plans[idx] = Object.assign({}, incoming, {
        id: prev.id,
        createdAt: prev.createdAt,
        updatedAt: now,
      })
    } else {
      plans.push(Object.assign({}, incoming, {updatedAt: now}))
    }
  }
  config.sipPlans = normalizeSipPlans(plans)
  saveConfig(config)
  return currentSipPlan(incoming.code) || incoming
}

function pauseSipPlan(code) {
  const key = String(code || '').padStart(6, '0')
  const config = loadConfig()
  const now = new Date().toISOString()
  let changed = false
  config.sipPlans = (config.sipPlans || []).map((p) => {
    if (!p || p.code !== key || !p.active) return p
    changed = true
    return Object.assign({}, p, {active: false, paused: true, updatedAt: now})
  })
  if (changed) saveConfig(config)
  return currentSipPlan(key)
}

function resumeSipPlan(code) {
  const key = String(code || '').padStart(6, '0')
  const config = loadConfig()
  const now = new Date().toISOString()
  let changed = false
  config.sipPlans = (config.sipPlans || []).map((p) => {
    if (!p || p.code !== key || !p.paused) return p
    changed = true
    return Object.assign({}, p, {active: true, paused: false, updatedAt: now})
  })
  if (changed) saveConfig(config)
  return currentSipPlan(key)
}

function stopSipPlan(code) {
  const key = String(code || '').padStart(6, '0')
  const config = loadConfig()
  const next = (config.sipPlans || []).filter(
    (p) => !(p && p.code === key && (p.active || p.paused)),
  )
  if (next.length === (config.sipPlans || []).length) return
  config.sipPlans = next
  saveConfig(config)
}

function deactivateSipPlans(code) {
  stopSipPlan(code)
}

function listTradeMarks(code) {
  const key = String(code || '').padStart(6, '0')
  const marks = []
  const fund = getFund(key)
  if (fund && fund.buyDate) {
    marks.push({date: fund.buyDate, kind: 'buy'})
  }
  const trades = listTrades({code: key})
  for (const t of trades) {
    if (t.pending) continue
    marks.push({
      date: t.date,
      kind: t.type === 'exit' ? 'exit' : t.type === 'sell' ? 'sell' : 'buy',
    })
  }
  return marks
}

function patchFunds(patches) {
  if (!patches || !patches.length) return
  const config = loadConfig()
  let anyChanged = false
  for (const p of patches) {
    const key = String(p.code).padStart(6, '0')
    const prev = config.funds[key]
    if (!prev) continue
    const next = Object.assign({}, prev)
    let changed = false
    if (
      p.sectors &&
      (!(prev.sectors && prev.sectors.length) || p.sectors.join() !== prev.sectors.join())
    ) {
      next.sectors = p.sectors
      changed = true
    }
    if (p.fundType && p.fundType !== prev.fundType) {
      next.fundType = p.fundType
      changed = true
    }
    if (p.ftype != null && p.ftype !== prev.ftype) {
      next.ftype = p.ftype
      changed = true
    }
    if (changed) {
      next.updatedAt = new Date().toISOString()
      config.funds[key] = next
      anyChanged = true
    }
  }
  if (anyChanged) saveConfig(config)
}

module.exports = {
  loadConfig,
  listFunds,
  upsertFund,
  getFund,
  updateFund,
  removeFund,
  removeHoldingToWatch,
  clearFunds,
  updateGold,
  getSettings,
  updateSettings,
  ensureProfitSince,
  importLocalConfig,
  patchFunds,
  listProfitLog,
  upsertProfitDay,
  upsertProfitDays,
  listTrades,
  addTrade,
  applyFundTrade,
  patchTrade,
  listSipPlans,
  currentSipPlan,
  upsertSipPlan,
  pauseSipPlan,
  resumeSipPlan,
  stopSipPlan,
  deactivateSipPlans,
  listTradeMarks,
}
