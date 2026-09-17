const api = require('./api')
const {todayDateStr, normalizeBuyDate} = require('./tradingCalendar')

const CACHE_KEY = 'wzk-fund-szse-days'

let memory = Object.create(null)
const loading = Object.create(null)

function monthOf(day) {
  return String(day || '').slice(0, 7)
}

function readStoredMonth(month, today) {
  try {
    const raw = wx.getStorageSync(CACHE_KEY)
    const row = raw && raw.months && raw.months[month]
    if (!row || !row.days || typeof row.days !== 'object') return null
    if (month === today.slice(0, 7) && row.asOf !== today) return null
    return row.days
  } catch (e) {
    return null
  }
}

function writeStoredMonth(month, days, today) {
  try {
    const raw = wx.getStorageSync(CACHE_KEY) || {}
    const months = raw.months && typeof raw.months === 'object' ? raw.months : {}
    months[month] = {asOf: today, days}
    wx.setStorageSync(CACHE_KEY, {months})
  } catch (e) {
    // 存储满时忽略
  }
}

function shiftMonth(month, delta) {
  const [y, m] = String(month || '').split('-').map(Number)
  if (!y || !m) return ''
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function loadMonth(month, now = new Date()) {
  if (memory[month]) return memory[month]
  const today = todayDateStr(now)
  const cached = readStoredMonth(month, today)
  if (cached) {
    memory[month] = cached
    return cached
  }
  if (loading[month]) return loading[month]
  loading[month] = api
    .fetchTradingDays(month)
    .then((data) => {
      const days = (data && data.days) || {}
      memory[month] = days
      writeStoredMonth(month, days, today)
      delete loading[month]
      return days
    })
    .catch((err) => {
      delete loading[month]
      throw err
    })
  return loading[month]
}

function isReady(day) {
  const month = monthOf(day || todayDateStr())
  return !!memory[month]
}

function prefetch(now = new Date()) {
  const month = todayDateStr(now).slice(0, 7)
  return Promise.all([
    loadMonth(month, now),
    loadMonth(shiftMonth(month, 1), now),
  ]).catch(() => null)
}

async function getNextTradingDay(fromDate, now = new Date()) {
  const from = String(fromDate || todayDateStr(now)).slice(0, 10)
  const months = [monthOf(from), shiftMonth(monthOf(from), 1)].filter(Boolean)
  for (let i = 0; i < months.length; i++) {
    const days = await loadMonth(months[i], now)
    const hit = Object.keys(days)
      .filter((d) => days[d] === true && d > from)
      .sort()[0]
    if (hit) return hit
  }
  return ''
}

/** 最多选到「今天之后的下一个交易日」 */
async function getMaxBuyDate(now = new Date()) {
  const today = todayDateStr(now)
  return (await getNextTradingDay(today, now)) || today
}

async function getPrevTradingDay(fromDate, now = new Date()) {
  const from = String(fromDate || '').slice(0, 10)
  if (!from) return ''
  const months = [monthOf(from), shiftMonth(monthOf(from), -1)].filter(Boolean)
  for (let i = 0; i < months.length; i++) {
    const days = await loadMonth(months[i], now)
    const hit = Object.keys(days)
      .filter((d) => days[d] === true && d < from)
      .sort()
      .pop()
    if (hit) return hit
  }
  return ''
}

/** 深交所月历：不限制未来天数，供定投扣款日判断 */
async function isTradingDay(dateStr, now = new Date()) {
  const day = String(dateStr || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const days = await loadMonth(monthOf(day), now)
  return days[day] === true
}

/** 深交所月历：jybz=1 为交易日，覆盖周末、法定休市，含尚未公布净值的当天 */
async function isBuyTradingDay(dateStr, now = new Date()) {
  const day = normalizeBuyDate(dateStr, now)
  if (!day) return false
  return isTradingDay(day, now)
}

module.exports = {
  isReady,
  prefetch,
  getNextTradingDay,
  getMaxBuyDate,
  getPrevTradingDay,
  isTradingDay,
  isBuyTradingDay,
}
