/** A 股简易交易日：仅跳过周末（不含法定节假日） */

function todayDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function normalizeNetValueDate(raw, now = new Date()) {
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

function parseDateStr(s) {
  const [y, m, day] = s.split('-').map(Number)
  return new Date(y, m - 1, day)
}

function nextTradingDay(dateStr) {
  const normalized = normalizeNetValueDate(dateStr) || dateStr
  const d = parseDateStr(normalized)
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return todayDateStr(d)
}

function isTradingDayStarted(dateStr, now = new Date()) {
  const day = normalizeNetValueDate(dateStr, now) || dateStr
  const today = todayDateStr(now)
  if (today > day) return true
  if (today < day) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 9 * 60 + 15
}

/** QDII / 海外：净值多为 T+1 披露，不套用 A 股确认会话窗 */
function isDelayedNavFund(quote = {}) {
  if (quote.delayedDisclosure === true) return true
  return /QDII|海外/.test(
    `${quote.fundType || ''} ${quote.ftype || ''} ${quote.name || ''}`,
  )
}

/**
 * 官方披露日期展示：MM-DD（与右侧官方涨跌幅同一净值日口径）
 */
function formatOfficialDiscloseTime(netValueDate, _time, now = new Date()) {
  const navDay = normalizeNetValueDate(netValueDate, now)
  if (!navDay) return ''
  const month = Number(navDay.slice(5, 7))
  const day = Number(navDay.slice(8, 10))
  if (!month || !day) return ''
  return `${month}月${day}日`
}

/**
 * 迷你走势对应的行情时段，如「26 21:30→04:30」。
 * QDII 跟隔夜外盘，画的既不是今天也未必是官方净值日，标出起止才看得懂这条线。
 * 净值披露快慢因基金公司而异，标注不跟着净值日走——忽有忽无比偶尔重复更难读。
 * 迷你图就巴掌大，日期只留日号——看盘时月份从不构成歧义。
 * short 只剩日号，窄屏放不下时段也要先保住「这是哪天的行情」。
 * 非 QDII 的走势就是当日、与右侧同源，返回空串不占版面。
 */
function formatTrendSessionDate(quote = {}, now = new Date()) {
  const empty = {text: '', short: ''}
  if (!isDelayedNavFund(quote)) return empty
  const day = normalizeNetValueDate(quote.trendDate, now)
  if (!day) return empty
  const md = day.slice(8, 10)
  const points = quote.trend || []
  const from = points.length ? points[0].time : ''
  const to = points.length ? points[points.length - 1].time : ''
  if (!from || !to) return {text: `${md} 行情`, short: md}
  return {text: `${md} ${from}→${to}`, short: md}
}

/**
 * 晚间已拉到官方确认涨跌：展示「已更新」。
 * 国内：净值日下一交易日开盘清除。
 * QDII/海外：只要有最新官方披露（净值日+涨跌）即展示，不套会话窗。
 */
function shouldShowConfirmedUpdatedBadge(quote, now = new Date()) {
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

function isWeekday(d = new Date()) {
  const day = d.getDay()
  return day !== 0 && day !== 6
}

function addCalendarDays(dateStr, n) {
  const d = parseDateStr(dateStr)
  d.setDate(d.getDate() + n)
  return todayDateStr(d)
}

/** YYYY-MM-DD；非法日期返回空。最多允许未来 14 个自然日（覆盖周五→下周一） */
function normalizeBuyDate(raw, now = new Date()) {
  const s = String(raw || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return ''
  const cap = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  cap.setDate(cap.getDate() + 14)
  if (dt > cap) return ''
  return s
}

/** 买入日到今天的日历天数；未填或非法返回 null；未来买入日按 0 天 */
function holdDays(buyDate, now = new Date()) {
  const s = normalizeBuyDate(buyDate, now)
  if (!s) return null
  const start = parseDateStr(s)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.max(0, Math.round((end - start) / 86400000))
}

/** 周末/长假后的净值日最多向后找这么多天，避免把区间起点误标成买入 */
const BUY_NAV_LAG_DAYS = 21

function calendarDaysBetween(from, to) {
  return Math.round((parseDateStr(to) - parseDateStr(from)) / 86400000)
}

/** 买入日对应的净值日：当天有净值用当天，否则用之后最近一个交易日 */
function matchBuyNavDate(dates, buyDate, now = new Date()) {
  const want = normalizeBuyDate(buyDate, now)
  if (!want) return ''
  const keys = (dates || [])
    .map((d) => String(d || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  if (keys.indexOf(want) >= 0) return want
  let best = ''
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] < want) continue
    if (!best || keys[i] < best) best = keys[i]
  }
  if (!best) return ''
  const lag = calendarDaysBetween(want, best)
  if (lag < 0 || lag > BUY_NAV_LAG_DAYS) return ''
  return best
}

module.exports = {
  todayDateStr,
  isWeekday,
  addCalendarDays,
  normalizeBuyDate,
  holdDays,
  matchBuyNavDate,
  normalizeNetValueDate,
  isDelayedNavFund,
  formatOfficialDiscloseTime,
  formatTrendSessionDate,
  shouldShowConfirmedUpdatedBadge,
}
