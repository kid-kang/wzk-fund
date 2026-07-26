/** A 股简易交易日：仅跳过周末（不含法定节假日） */

export function todayDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 是否为交易日（仅排除周末，不含法定节假日） */
export function isTradingDay(d = new Date()) {
  const day = d.getDay()
  return day !== 0 && day !== 6
}

/** 统一成 YYYY-MM-DD（兼容 MM-DD） */
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

/** 给定交易日之后的下一个交易日（周末顺延） */
export function nextTradingDay(dateStr: string): string {
  const normalized = normalizeNetValueDate(dateStr) || dateStr
  const d = parseDateStr(normalized)
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return todayDateStr(d)
}

/**
 * 「下一交易日是否已开始」：日历到达该日，且本地时间 ≥ 09:15
 */
export function isTradingDayStarted(dateStr: string, now = new Date()): boolean {
  const day = normalizeNetValueDate(dateStr, now) || dateStr
  const today = todayDateStr(now)
  if (today > day) return true
  if (today < day) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 9 * 60 + 15
}

/**
 * 晚间已拉到官方确认涨跌：展示「已更新」；
 * 该净值日的下一交易日开盘后抹去。
 */
export function shouldShowConfirmedUpdatedBadge(
  quote: {
    percentSource?: 'estimate' | 'confirmed' | null
    netValueDate?: string | null
  },
  now = new Date(),
): boolean {
  if (quote.percentSource !== 'confirmed') return false
  const navDay = normalizeNetValueDate(quote.netValueDate, now)
  if (!navDay) return false
  const next = nextTradingDay(navDay)
  return !isTradingDayStarted(next, now)
}
