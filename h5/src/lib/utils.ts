import clsx, {type ClassValue} from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function pctClass(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return 'flat'
  if (v > 0) return 'rise'
  if (v < 0) return 'fall'
  return 'flat'
}

export function formatPct(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(digits)}%`
}

export function formatMoney(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(digits)}`
}

export function formatAmount(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  return v.toFixed(digits)
}

export type TrendSamplePlan =
  | {mode: 'day'}
  | {mode: 'stride'; stride: number}
  | {mode: 'month'}

export function resolveTrendSamplePlan(range: string): TrendSamplePlan {
  if (range === 'since') return {mode: 'month'}
  if (range === '3y') return {mode: 'stride', stride: 7}
  if (range === '1y' || range === '6m') return {mode: 'stride', stride: 4}
  return {mode: 'day'}
}

export function sampleTrendPoints<T extends {date?: string | null; time?: string | null}>(
  points: T[],
  range: string,
): T[] {
  const list = (points || []).filter(Boolean)
  if (list.length <= 2) return list
  const plan = resolveTrendSamplePlan(range)
  if (plan.mode === 'day') return list

  const dateKey = (p: T) => {
    const s = String(p?.date || p?.time || '').trim()
    return s.length >= 10 ? s.slice(0, 10) : ''
  }

  if (plan.mode === 'stride') {
    const stride = Math.max(2, plan.stride)
    const picked: T[] = [list[0]]
    for (let i = stride; i < list.length - 1; i += stride) {
      picked.push(list[i])
    }
    if (picked[picked.length - 1] !== list[list.length - 1]) {
      picked.push(list[list.length - 1])
    }
    return picked
  }

  const picked: T[] = []
  let bucket = ''
  for (const p of list) {
    const d = dateKey(p)
    if (!d) {
      picked.push(p)
      continue
    }
    const key = d.slice(0, 7)
    if (picked.length && bucket === key) {
      picked[picked.length - 1] = p
    } else {
      picked.push(p)
      bucket = key
    }
  }

  const first = list[0]
  const last = list[list.length - 1]
  if (picked.length && dateKey(picked[0]) !== dateKey(first)) {
    picked.unshift(first)
  }
  if (picked.length && dateKey(picked[picked.length - 1]) !== dateKey(last)) {
    picked.push(last)
  }
  return picked
}

export function formatTrendAxisDate(
  date: string | null | undefined,
  range: string,
): string {
  const s = String(date || '').trim()
  if (s.length < 10) return s
  if (range === '3y' || range === 'since') return s.slice(0, 4)
  if (range === '1y' || range === '6m') return s.slice(5, 7)
  return s.slice(5)
}

export const FUND_RANGE_MIN_AGE_DAYS: Record<'3m' | '1y' | '3y', number> = {
  '3m': 90,
  '1y': 365,
  '3y': 365 * 3,
}

export const ALL_FUND_RANGES = [
  {key: '3m' as const, label: '近3月'},
  {key: '1y' as const, label: '近1年'},
  {key: '3y' as const, label: '近3年'},
  {key: 'since' as const, label: '成立来'},
]

export function isFundRangeAvailable(
  range: '3m' | '1y' | '3y' | 'since',
  ageDays: number | null | undefined,
): boolean {
  if (range === 'since') return true
  if (ageDays == null || !Number.isFinite(ageDays)) return true
  return ageDays >= FUND_RANGE_MIN_AGE_DAYS[range]
}

export function availableFundRanges(ageDays: number | null | undefined) {
  return ALL_FUND_RANGES.filter((r) => isFundRangeAvailable(r.key, ageDays))
}

export function defaultFundRange(
  ageDays: number | null | undefined,
): '3m' | '1y' | '3y' | 'since' {
  const avail = availableFundRanges(ageDays)
  return avail[0]?.key || 'since'
}

export function formatFundAge(
  establishDate?: string | null,
  ageDays?: number | null,
): string {
  let years = 0
  let months = 0
  const raw = String(establishDate || '')
    .trim()
    .slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number)
    const start = new Date(y, m - 1, d)
    if (!Number.isNaN(start.getTime())) {
      const now = new Date()
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      years = end.getFullYear() - start.getFullYear()
      months = end.getMonth() - start.getMonth()
      if (end.getDate() < start.getDate()) months -= 1
      if (months < 0) {
        years -= 1
        months += 12
      }
      if (years < 0) {
        years = 0
        months = 0
      }
    }
  } else if (ageDays != null && Number.isFinite(Number(ageDays))) {
    const days = Math.max(0, Math.floor(Number(ageDays)))
    years = Math.floor(days / 365)
    months = Math.floor((days % 365) / 30)
  } else {
    return ''
  }
  return `成立${years}年${months}月`
}
