import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function pctClass(v: number | null | undefined) {
  if (v == null || Number.isNaN(v)) return 'flat';
  if (v > 0) return 'rise';
  if (v < 0) return 'fall';
  return 'flat';
}

export function formatPct(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}%`;
}

/** 金额/收益：不使用千分位逗号 */
export function formatMoney(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(digits)}`;
}

/** 持仓金额等：不使用千分位逗号 */
export function formatAmount(v: number | null | undefined, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--';
  return v.toFixed(digits);
}

/** tab 名义跨度（年）；成立来等未知周期用数据首尾推算 */
const RANGE_YEARS: Record<string, number> = {
  '1m': 1 / 12,
  '3m': 3 / 12,
  '6m': 6 / 12,
  '1y': 1,
  '3y': 3,
}

/**
 * 按 tab 时间跨度抽稀：
 * - 1 年以下：每个交易日
 * - [1,2)：每 2 日；[2,3)：每 3 日；[3,4)：每 4 日；以此类推
 */
export type TrendSamplePlan =
  | {mode: 'day'; years: number}
  | {mode: 'stride'; stride: number; years: number}

function pointDateKey(p: {date?: string | null; time?: string | null}) {
  const s = String(p?.date || p?.time || '').trim()
  return s.length >= 10 ? s.slice(0, 10) : ''
}

function yearsFromPoints(
  points: Array<{date?: string | null; time?: string | null}> | undefined,
): number {
  const list = points || []
  let first = ''
  let last = ''
  for (const p of list) {
    const d = pointDateKey(p)
    if (!d) continue
    if (!first) first = d
    last = d
  }
  if (!first || !last) return 0
  const a = new Date(`${first}T00:00:00`)
  const b = new Date(`${last}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.max(0, (b.getTime() - a.getTime()) / (365.25 * 86400000))
}

function resolveRangeYears(
  range: string,
  points?: Array<{date?: string | null; time?: string | null}>,
): number {
  if (RANGE_YEARS[range] != null) return RANGE_YEARS[range]
  return yearsFromPoints(points)
}

export function resolveTrendSamplePlan(
  range: string,
  points?: Array<{date?: string | null; time?: string | null}>,
): TrendSamplePlan {
  const years = resolveRangeYears(range, points)
  if (!(years >= 1)) return {mode: 'day', years: years || 0}
  const stride = Math.floor(years) + 1
  return {mode: 'stride', stride, years}
}

/** @deprecated 使用 resolveTrendSamplePlan */
export function resolveTrendSampleMode(
  range: string,
  points?: Array<{date?: string | null; time?: string | null}>,
): 'day' | 'stride' {
  return resolveTrendSamplePlan(range, points).mode
}

/** 按周期抽稀走势点（保证首尾点） */
export function sampleTrendPoints<T extends {date?: string | null; time?: string | null}>(
  points: T[],
  range: string,
): T[] {
  const list = (points || []).filter(Boolean)
  if (list.length <= 2) return list
  const plan = resolveTrendSamplePlan(range, list)
  if (plan.mode === 'day') return list

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

/**
 * 走势图横轴日期标签（天级点距时用）。
 * 抽稀后的刻度由 formatSampledTrendAxisLabels 生成。
 */
export function formatTrendAxisDate(
  date: string | null | undefined,
  range: string,
): string {
  const s = String(date || '').trim()
  if (s.length < 10) return s
  if (range === '3y' || range === 'since') {
    return s.slice(0, 4)
  }
  if (range === '1y' || range === '6m') {
    return s.slice(5, 7)
  }
  return s.slice(5)
}

/** 抽稀后稀疏横轴：约 3 年以下标月，更长标年 */
export function formatSampledTrendAxisLabels(
  dates: Array<string | null | undefined>,
  range: string,
): string[] {
  const asPoints = dates.map((d) => ({date: d}))
  const plan = resolveTrendSamplePlan(range, asPoints)
  const full = dates.map((d) => String(d || ''))
  if (plan.mode === 'day') {
    return full.map((d) => formatTrendAxisDate(d, range))
  }

  const unit: 'year' | 'month' = plan.years >= 3 ? 'year' : 'month'
  const maxTicks = unit === 'year' ? (plan.years >= 6 ? 7 : 5) : 8
  const labels = full.map(() => '')
  const idxs: number[] = []
  let lastKey = ''
  full.forEach((d, i) => {
    const key = unit === 'year' ? d.slice(0, 4) : d.slice(0, 7)
    if (!key || key === lastKey) return
    if (unit === 'year' && key.length < 4) return
    if (unit === 'month' && key.length < 7) return
    lastKey = key
    idxs.push(i)
    labels[i] = unit === 'year' ? key : key.slice(5)
  })
  if (full.length) {
    const lastI = full.length - 1
    const lastS = full[lastI]
    const lastLabel = unit === 'year' ? lastS.slice(0, 4) : lastS.slice(5, 7)
    if (lastLabel) {
      labels[lastI] = lastLabel
      if (idxs[idxs.length - 1] !== lastI) idxs.push(lastI)
    }
  }
  if (idxs.length <= maxTicks) return labels
  const keep = new Set([idxs[0], idxs[idxs.length - 1]])
  const inner = maxTicks - 2
  for (let k = 1; k <= inner; k++) {
    const t = k / (inner + 1)
    keep.add(idxs[Math.round(t * (idxs.length - 1))])
  }
  return labels.map((l, i) => (keep.has(i) ? l : ''))
}

/** 基金周期 tab 最短成立天数（自然日） */
export const FUND_RANGE_MIN_AGE_DAYS: Record<'3m' | '6m' | '1y' | '3y', number> = {
  '3m': 90,
  '6m': 180,
  '1y': 365,
  '3y': 365 * 3,
}

export function calendarDaysBetween(
  fromDate: string,
  toDate = new Date(),
): number | null {
  const s = String(fromDate || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate())
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000))
}

export function isFundRangeAvailable(
  range: '3m' | '6m' | '1y' | '3y' | 'since',
  ageDays: number | null | undefined,
): boolean {
  if (range === 'since') return true
  if (ageDays == null || !Number.isFinite(ageDays)) return true
  return ageDays >= FUND_RANGE_MIN_AGE_DAYS[range]
}

/** 成立时长：如「成立3年2月」 */
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
