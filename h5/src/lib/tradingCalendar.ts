/** A 股简易交易日：仅跳过周末（不含法定节假日） */

export function todayDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isTradingDay(d = new Date()) {
  const day = d.getDay()
  return day !== 0 && day !== 6
}

export function normalizeNetValueDate(raw: string | null | undefined, now = new Date()) {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const md = s.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!md) return ''
  const month = Number(md[1])
  const day = Number(md[2])
  if (!month || !day) return ''
  let year = now.getFullYear()
  const candidate = new Date(year, month - 1, day)
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (candidate > todayOnly) year -= 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseDateStr(s: string): Date {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

export function nextTradingDay(dateStr: string): string {
  const normalized = normalizeNetValueDate(dateStr) || dateStr
  const d = parseDateStr(normalized)
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return todayDateStr(d)
}

export function isTradingDayStarted(dateStr: string, now = new Date()): boolean {
  const day = normalizeNetValueDate(dateStr, now) || dateStr
  const today = todayDateStr(now)
  if (today > day) return true
  if (today < day) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 9 * 60 + 15
}

export function isDelayedNavFund(quote: {
  delayedDisclosure?: boolean
  fundType?: string | null
  ftype?: string | null
  name?: string | null
}): boolean {
  if (quote.delayedDisclosure === true) return true
  return /QDII|海外/.test(
    `${quote.fundType || ''} ${quote.ftype || ''} ${quote.name || ''}`,
  )
}

/** 官方披露日期：MM-DD（与右侧涨跌幅同一净值日口径） */
export function formatOfficialDiscloseTime(
  netValueDate?: string | null,
  _time?: string | null,
  now = new Date(),
): string {
  const navDay = normalizeNetValueDate(netValueDate, now)
  if (!navDay) return ''
  return `${navDay.slice(5, 7)}-${navDay.slice(8, 10)}`
}

export function shouldShowConfirmedUpdatedBadge(
  quote: {
    percentSource?: 'estimate' | 'confirmed' | null
    netValueDate?: string | null
    dayGrowth?: number | null
    percent?: number | null
    delayedDisclosure?: boolean
    fundType?: string | null
    ftype?: string | null
    name?: string | null
  },
  now = new Date(),
): boolean {
  const navDay = normalizeNetValueDate(quote.netValueDate, now)
  if (!navDay) return false

  if (isDelayedNavFund(quote)) {
    return (
      quote.dayGrowth != null ||
      quote.percentSource === 'confirmed' ||
      (quote.percent != null && quote.percentSource !== 'estimate')
    )
  }

  if (quote.percentSource !== 'confirmed') return false
  const next = nextTradingDay(navDay)
  return !isTradingDayStarted(next, now)
}
