import fs from 'fs'
import path from 'path'
import {fileURLToPath} from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.resolve(__dirname, '../../data')
const STORE_PATH = path.join(DATA_DIR, 'store.json')

const DEFAULT_STORE = {
  settings: {
    showGold: true,
  },
  funds: {},
  gold: {
    holding: 0,
    avgPrice: 0,
  },
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive: true})
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8')
  }
}

function normalizeStore(data = {}) {
  return {
    settings: {
      ...DEFAULT_STORE.settings,
      ...(data.settings || {}),
    },
    funds: data.funds && typeof data.funds === 'object' ? data.funds : {},
    gold: {
      ...DEFAULT_STORE.gold,
      ...(data.gold || {}),
    },
  }
}

export function readStore() {
  ensureStore()
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8')
    return normalizeStore(JSON.parse(raw))
  } catch {
    return structuredClone(DEFAULT_STORE)
  }
}

export function writeStore(store) {
  ensureStore()
  const next = normalizeStore(store)
  fs.writeFileSync(STORE_PATH, JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function getConfig() {
  return readStore()
}

export function importConfig(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('配置格式无效')
  }
  const funds = payload.funds && typeof payload.funds === 'object' ? payload.funds : null
  if (!funds) throw new Error('配置缺少 funds')

  const normalizedFunds = {}
  for (const [key, raw] of Object.entries(funds)) {
    const code = String(raw?.code || key).padStart(6, '0')
    if (!/^\d{6}$/.test(code)) continue
    normalizedFunds[code] = {
      code,
      name: raw.name || code,
      fundKey: raw.fundKey || '',
      type: raw.type === 'hold' ? 'hold' : 'watch',
      amount: Number(raw.amount) || 0,
      amountAsOf: raw.amountAsOf || '',
      shares: Number(raw.shares) || 0,
      sectors: Array.isArray(raw.sectors) ? raw.sectors : [],
      updatedAt: raw.updatedAt || new Date().toISOString(),
    }
  }

  const next = normalizeStore({
    settings: payload.settings,
    funds: normalizedFunds,
    gold: payload.gold,
  })
  return writeStore(next)
}

export function getSettings() {
  return readStore().settings
}

export function updateSettings(patch = {}) {
  const store = readStore()
  if (typeof patch.showGold === 'boolean') {
    store.settings.showGold = patch.showGold
  }
  writeStore(store)
  return store.settings
}

export function listFunds({type} = {}) {
  const store = readStore()
  let list = Object.values(store.funds)
  if (type === 'hold') list = list.filter((f) => f.type === 'hold')
  if (type === 'watch') list = list.filter((f) => f.type === 'watch')
  return list.sort((a, b) => (a.code > b.code ? 1 : -1))
}

export function upsertFund(payload) {
  const store = readStore()
  const code = String(payload.code || '').padStart(6, '0')
  if (!/^\d{6}$/.test(code)) throw new Error('基金代码须为6位数字')

  const prev = store.funds[code] || {}
  const next = {
    code,
    name: payload.name ?? prev.name ?? code,
    fundKey: payload.fundKey ?? prev.fundKey ?? '',
    type: payload.type ?? prev.type ?? 'watch',
    amount: Number(payload.amount ?? prev.amount ?? 0) || 0,
    // 持仓金额对应的净值确认日；晚间确认后按涨跌自动滚动
    amountAsOf:
      payload.amountAsOf !== undefined
        ? String(payload.amountAsOf || '')
        : prev.amountAsOf || '',
    shares: Number(payload.shares ?? prev.shares ?? 0) || 0,
    sectors: Array.isArray(payload.sectors)
      ? payload.sectors
      : prev.sectors || [],
    updatedAt: new Date().toISOString(),
  }

  store.funds[code] = next
  writeStore(store)
  return next
}

export function updateFund(code, patch) {
  const store = readStore()
  const key = String(code).padStart(6, '0')
  if (!store.funds[key]) throw new Error('基金不存在')
  const nextPatch = {...patch}
  if (nextPatch.sectors != null && !Array.isArray(nextPatch.sectors)) {
    delete nextPatch.sectors
  }
  store.funds[key] = {
    ...store.funds[key],
    ...nextPatch,
    code: key,
    updatedAt: new Date().toISOString(),
  }
  writeStore(store)
  return store.funds[key]
}

export function deleteFund(code) {
  const store = readStore()
  const key = String(code).padStart(6, '0')
  if (!store.funds[key]) throw new Error('基金不存在')
  delete store.funds[key]
  writeStore(store)
  return true
}

export function getGoldConfig() {
  return readStore().gold
}

export function updateGoldConfig(patch) {
  const store = readStore()
  store.gold = {
    holding: Number(patch.holding ?? store.gold.holding ?? 0) || 0,
    avgPrice: Number(patch.avgPrice ?? store.gold.avgPrice ?? 0) || 0,
  }
  writeStore(store)
  return store.gold
}
