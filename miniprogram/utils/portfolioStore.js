const STORAGE_KEY = 'wzk-fund-config'

const DEFAULT_CONFIG = {
  settings: {showGold: true},
  funds: {},
  gold: {holding: 0, avgPrice: 0},
}

function cloneDefault() {
  return {
    settings: {showGold: true},
    funds: {},
    gold: {holding: 0, avgPrice: 0},
  }
}

function normalizeFund(raw, prev) {
  const code = String(raw.code || '').padStart(6, '0')
  const now = new Date().toISOString()
  return {
    code,
    name: raw.name != null ? raw.name : prev && prev.name != null ? prev.name : code,
    fundKey: raw.fundKey != null ? raw.fundKey : (prev && prev.fundKey) || '',
    type:
      raw.type === 'hold' || raw.type === 'watch'
        ? raw.type
        : (prev && prev.type) || 'watch',
    shares: Number(raw.shares != null ? raw.shares : (prev && prev.shares) || 0) || 0,
    sectors: Array.isArray(raw.sectors) ? raw.sectors : (prev && prev.sectors) || [],
    fundType: raw.fundType || (prev && prev.fundType) || '',
    ftype: raw.ftype != null ? raw.ftype : (prev && prev.ftype) || '',
    createdAt: (prev && prev.createdAt) || raw.createdAt || now,
    updatedAt: now,
  }
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
    },
    funds,
    gold: {
      holding: Number((payload && payload.gold && payload.gold.holding) || 0) || 0,
      avgPrice: Number((payload && payload.gold && payload.gold.avgPrice) || 0) || 0,
    },
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

function removeFund(code) {
  const config = loadConfig()
  const key = String(code).padStart(6, '0')
  if (!config.funds[key]) throw new Error('基金不存在')
  delete config.funds[key]
  saveConfig(config)
}

function updateGold(patch) {
  const config = loadConfig()
  config.gold = {
    holding: Number(patch.holding != null ? patch.holding : config.gold.holding || 0) || 0,
    avgPrice: Number(patch.avgPrice != null ? patch.avgPrice : config.gold.avgPrice || 0) || 0,
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
  saveConfig(config)
  return config.settings
}

function importLocalConfig(payload) {
  if (!payload || !payload.funds || typeof payload.funds !== 'object') {
    throw new Error('配置缺少 funds')
  }
  return saveConfig(normalizeConfig(payload))
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
  STORAGE_KEY,
  DEFAULT_CONFIG,
  normalizeConfig,
  loadConfig,
  saveConfig,
  listFunds,
  upsertFund,
  getFund,
  updateFund,
  removeFund,
  updateGold,
  getSettings,
  updateSettings,
  importLocalConfig,
  patchFunds,
}
