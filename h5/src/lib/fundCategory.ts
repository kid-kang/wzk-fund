/** 自选页分组顺序与展示名 */
export const CATEGORY_ORDER = [
  'QDII',
  '指数型',
  '股票型',
  '混合型',
  '债券型',
  '货币型',
  '其他',
] as const

export type FundCategory = (typeof CATEGORY_ORDER)[number]

/**
 * 根据东财 FTYPE / 基金名归类。
 * 「指数型-海外股票」等海外品种统一归入 QDII。
 */
export function classifyFundType(ftype = '', name = ''): FundCategory {
  const f = String(ftype || '').trim()
  const n = String(name || '').trim()
  const hay = `${f} ${n}`

  if (/QDII|海外/.test(hay)) return 'QDII'
  if (/货币|理财型/.test(f)) return '货币型'
  if (/债券|债基|固收/.test(f)) return '债券型'
  if (/指数/.test(f)) return '指数型'
  if (/股票/.test(f)) return '股票型'
  if (/混合/.test(f)) return '混合型'

  // 无 FTYPE 时按名称兜底
  if (/QDII|海外/.test(n)) return 'QDII'
  if (/货币|现金宝/.test(n)) return '货币型'
  if (/债券|纯债|短债|中长久期|固收/.test(n)) return '债券型'
  if (/指数|ETF|联接/.test(n)) return '指数型'
  if (/混合/.test(n)) return '混合型'
  if (/股票/.test(n)) return '股票型'
  return '其他'
}

export function resolveFundCategory(row: {
  fundType?: string | null
  ftype?: string | null
  name?: string | null
  code?: string | null
} = {}): FundCategory {
  const cached = String(row.fundType || '').trim()
  if ((CATEGORY_ORDER as readonly string[]).includes(cached)) {
    return cached as FundCategory
  }
  return classifyFundType(row.ftype || '', row.name || row.code || '')
}

/**
 * 将扁平自选列表按类型分组；组内按涨跌幅降序。
 */
export function groupWatchlistByCategory<T extends {
  fundType?: string | null
  ftype?: string | null
  name?: string | null
  code?: string | null
  percent?: number | null
}>(list: T[] = []): {key: string; title: string; list: T[]}[] {
  const buckets = new Map<string, T[]>()
  for (const item of list) {
    const key = resolveFundCategory(item)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(item)
  }

  const groups: {key: string; title: string; list: T[]}[] = []
  for (const key of CATEGORY_ORDER) {
    const rows = buckets.get(key)
    if (!rows?.length) continue
    rows.sort((a, b) => {
      const ap =
        a.percent == null || Number.isNaN(Number(a.percent))
          ? -Infinity
          : Number(a.percent)
      const bp =
        b.percent == null || Number.isNaN(Number(b.percent))
          ? -Infinity
          : Number(b.percent)
      if (bp !== ap) return bp - ap
      return String(a.code || '').localeCompare(String(b.code || ''))
    })
    groups.push({
      key,
      title: `${key}(${rows.length})`,
      list: rows,
    })
  }
  return groups
}

/** 持仓是否可盘中实时估值（QDII / 海外为否） */
export function isRealtimeHolding(row: {
  fundType?: string | null
  ftype?: string | null
  name?: string | null
  code?: string | null
} = {}): boolean {
  const fundType = resolveFundCategory(row)
  if (fundType === 'QDII') return false
  const hay = `${row.ftype || ''} ${row.name || ''}`
  if (/QDII|海外/.test(hay)) return false
  return true
}
