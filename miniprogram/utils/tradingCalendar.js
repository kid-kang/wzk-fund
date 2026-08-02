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
  return `${navDay.slice(5, 7)}-${navDay.slice(8, 10)}`
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

module.exports = {
  normalizeNetValueDate,
  isDelayedNavFund,
  formatOfficialDiscloseTime,
  shouldShowConfirmedUpdatedBadge,
}
