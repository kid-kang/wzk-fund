import type {AppConfig, AppSettings, FundRecord} from '@/lib/api'

const STORAGE_KEY = 'wzk-fund-config'

export const DEFAULT_CONFIG: AppConfig = {
  settings: {showGold: true},
  funds: {},
  gold: {holding: 0, avgPrice: 0},
}

function normalizeFund(raw: Partial<FundRecord> & {code: string}, prev?: FundRecord): FundRecord {
  const code = String(raw.code || '').padStart(6, '0')
  const now = new Date().toISOString()
  return {
    code,
    name: raw.name ?? prev?.name ?? code,
    fundKey: raw.fundKey ?? prev?.fundKey ?? '',
    type: raw.type === 'hold' || raw.type === 'watch' ? raw.type : prev?.type || 'watch',
    shares: Number(raw.shares ?? prev?.shares ?? 0) || 0,
    sectors: Array.isArray(raw.sectors) ? raw.sectors : prev?.sectors || [],
    fundType: raw.fundType || prev?.fundType || '',
    ftype: raw.ftype != null ? raw.ftype : prev?.ftype || '',
    createdAt: prev?.createdAt || raw.createdAt || now,
    updatedAt: now,
  }
}

export function normalizeConfig(payload: Partial<AppConfig> | null | undefined): AppConfig {
  const fundsIn = payload?.funds && typeof payload.funds === 'object' ? payload.funds : {}
  const funds: Record<string, FundRecord> = {}
  for (const [key, raw] of Object.entries(fundsIn)) {
    const code = String(raw?.code || key).padStart(6, '0')
    if (!/^\d{6}$/.test(code)) continue
    funds[code] = normalizeFund({...raw, code})
  }
  return {
    settings: {
      showGold:
        typeof payload?.settings?.showGold === 'boolean'
          ? payload.settings.showGold
          : DEFAULT_CONFIG.settings.showGold,
    },
    funds,
    gold: {
      holding: Number(payload?.gold?.holding ?? 0) || 0,
      avgPrice: Number(payload?.gold?.avgPrice ?? 0) || 0,
    },
  }
}

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_CONFIG)
    const next = normalizeConfig(JSON.parse(raw) as AppConfig)
    const serialized = JSON.stringify(next)
    if (raw !== serialized) {
      localStorage.setItem(STORAGE_KEY, serialized)
    }
    return next
  } catch {
    return structuredClone(DEFAULT_CONFIG)
  }
}

export function saveConfig(config: AppConfig): AppConfig {
  const next = normalizeConfig(config)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function listFunds(type?: 'hold' | 'watch'): FundRecord[] {
  const {funds} = loadConfig()
  const ordered = Object.entries(funds).map(([_, f], idx) => ({...f, _order: idx}))
  if (type === 'hold') {
    return ordered
      .filter((f) => f.type === 'hold')
      .map(({_order, ...rest}) => rest)
  }
  if (type === 'watch') {
    return ordered
      .filter((f) => f.type === 'watch')
      .sort((a, b) => {
        const ac = a.createdAt || ''
        const bc = b.createdAt || ''
        if (ac && bc && ac !== bc) return ac < bc ? -1 : 1
        return a._order - b._order
      })
      .map(({_order, ...rest}) => rest)
  }
  return ordered.map(({_order, ...rest}) => rest)
}

export function upsertFund(payload: Partial<FundRecord> & {code: string}): FundRecord {
  const config = loadConfig()
  const code = String(payload.code).padStart(6, '0')
  if (!/^\d{6}$/.test(code)) throw new Error('基金代码须为6位数字')
  const prev = config.funds[code]
  const next = normalizeFund({...payload, code}, prev)
  config.funds[code] = next
  saveConfig(config)
  return next
}

export function getFund(code: string): FundRecord | null {
  const key = String(code).padStart(6, '0')
  return loadConfig().funds[key] || null
}

export function updateFund(code: string, patch: Partial<FundRecord>): FundRecord {
  const config = loadConfig()
  const key = String(code).padStart(6, '0')
  if (!config.funds[key]) throw new Error('基金不存在')
  const next = normalizeFund({...config.funds[key], ...patch, code: key}, config.funds[key])
  config.funds[key] = next
  saveConfig(config)
  return next
}

export function removeFund(code: string) {
  const config = loadConfig()
  const key = String(code).padStart(6, '0')
  if (!config.funds[key]) throw new Error('基金不存在')
  delete config.funds[key]
  saveConfig(config)
}

export function updateGold(patch: {holding?: number; avgPrice?: number}) {
  const config = loadConfig()
  config.gold = {
    holding: Number(patch.holding ?? config.gold.holding ?? 0) || 0,
    avgPrice: Number(patch.avgPrice ?? config.gold.avgPrice ?? 0) || 0,
  }
  saveConfig(config)
  return config.gold
}

export function getSettings(): AppSettings {
  return loadConfig().settings
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const config = loadConfig()
  if (typeof patch.showGold === 'boolean') {
    config.settings.showGold = patch.showGold
  }
  saveConfig(config)
  return config.settings
}

export function importLocalConfig(payload: AppConfig): AppConfig {
  if (!payload?.funds || typeof payload.funds !== 'object') {
    throw new Error('配置缺少 funds')
  }
  return saveConfig(normalizeConfig(payload))
}

/** 批量补全可从行情识别出的基金板块 / 类型 */
export function patchFunds(
  patches: Array<{
    code: string
    sectors?: string[]
    fundType?: string
    ftype?: string
  }>,
) {
  if (!patches.length) return
  const config = loadConfig()
  let anyChanged = false
  for (const p of patches) {
    const key = String(p.code).padStart(6, '0')
    const prev = config.funds[key]
    if (!prev) continue
    const next = {...prev}
    let changed = false
    if (
      p.sectors &&
      (!prev.sectors?.length || p.sectors.join() !== prev.sectors.join())
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
