const {Decimal, toDecimal, round2, roundShares} = require('./money')
const {todayDateStr, addCalendarDays} = require('./tradingCalendar')

const SIP_FREQS = [
  {key: 'weekly', label: '每周'},
  {key: 'biweekly', label: '每两周'},
  {key: 'monthly', label: '每月'},
  {key: 'daily', label: '每日'},
]

const SIP_WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五']

function sipMonthDayLabels() {
  const labels = []
  for (let i = 1; i <= 28; i++) labels.push(`${i}日`)
  return labels
}

function sipSecondLabels(freqKey) {
  if (freqKey === 'monthly') return sipMonthDayLabels()
  if (freqKey === 'daily') return ['每天']
  return SIP_WEEKDAY_LABELS.slice()
}

function sipCycleRangeFor(freqKey) {
  return [SIP_FREQS.map((f) => f.label), sipSecondLabels(freqKey)]
}

function parseCycleKey(raw) {
  const s = String(raw || '').trim()
  if (s === 'daily') {
    return {key: 'daily', kind: 'daily', label: '每日'}
  }
  const week = s.match(/^(weekly|biweekly)-([1-5])$/)
  if (week) {
    const kind = week[1]
    const weekday = Number(week[2])
    const freqLabel = kind === 'biweekly' ? '每两周' : '每周'
    return {
      key: `${kind}-${weekday}`,
      kind,
      weekday,
      label: `${freqLabel}${SIP_WEEKDAY_LABELS[weekday - 1]}`,
    }
  }
  const month = s.match(/^monthly-(\d{1,2})$/)
  if (month) {
    const monthDay = Math.min(28, Math.max(1, Number(month[1])))
    return {
      key: `monthly-${monthDay}`,
      kind: 'monthly',
      monthDay,
      label: `每月${monthDay}日`,
    }
  }
  return parseCycleKey('weekly-1')
}

function getSipCycle(key) {
  return parseCycleKey(key)
}

function normalizeSipCycle(raw) {
  return parseCycleKey(raw).key
}

function cycleKeyFromPicker(freqIdx, secondIdx) {
  const freq = SIP_FREQS[freqIdx] || SIP_FREQS[0]
  if (freq.key === 'daily') return 'daily'
  if (freq.key === 'monthly') {
    const day = Math.min(28, Math.max(1, Number(secondIdx) + 1))
    return `monthly-${day}`
  }
  const weekday = Math.min(5, Math.max(1, Number(secondIdx) + 1))
  return `${freq.key}-${weekday}`
}

function pickerStateFromCycle(cycleKey) {
  const spec = parseCycleKey(cycleKey)
  const freqIdx = Math.max(0, SIP_FREQS.findIndex((f) => f.key === spec.kind))
  let secondIdx = 0
  if (spec.kind === 'monthly') secondIdx = Math.max(0, (spec.monthDay || 1) - 1)
  else if (spec.kind === 'weekly' || spec.kind === 'biweekly') {
    secondIdx = Math.max(0, (spec.weekday || 1) - 1)
  }
  return {
    sipCycleRange: sipCycleRangeFor(spec.kind),
    sipCycleValue: [freqIdx, secondIdx],
    sipCycleLabel: spec.label,
    sipCycleKey: spec.key,
  }
}

function parseFeeRate(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  if (n >= 100) return 99.99
  return n
}

function parsePayAmount(raw) {
  const n = Number(String(raw || '').trim())
  if (!Number.isFinite(n) || n <= 0) return 0
  return round2(n)
}

function parseSharesInput(raw) {
  const n = Number(String(raw || '').trim())
  if (!Number.isFinite(n) || n <= 0) return 0
  return roundShares(n)
}

/** 申购内扣：确认金额 = 支付 / (1+费率)，手续费 = 支付 − 确认金额 */
function estimateBuyFee(payAmount, feeRatePct) {
  const pay = toDecimal(payAmount)
  if (pay.lte(0)) return {fee: 0, net: 0, pay: 0}
  const r = toDecimal(parseFeeRate(feeRatePct)).div(100)
  if (r.lte(0)) {
    const p = round2(pay)
    return {fee: 0, net: p, pay: p}
  }
  const net = pay.div(r.plus(1))
  const fee = pay.minus(net)
  return {fee: round2(fee), net: round2(net), pay: round2(pay)}
}

function applyBuyToHolding(holding, {payAmount, feeRate, nav}) {
  const pay = toDecimal(payAmount)
  if (pay.lte(0)) throw new Error('请输入买入金额')
  const navD = toDecimal(nav)
  if (navD.lte(0)) throw new Error('暂无净值，无法记账')
  const r = toDecimal(parseFeeRate(feeRate)).div(100)
  if (r.gte(1)) throw new Error('买入费率须小于 100%')
  const net = r.lte(0) ? pay : pay.div(r.plus(1))
  const addShares = net.div(navD).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
  if (addShares.lte(0)) throw new Error('确认份额为 0，请检查金额与净值')
  const prevShares = toDecimal(holding && holding.shares)
  const prevCost = toDecimal((holding && holding.cost) || 0)
  return {
    shares: roundShares(prevShares.plus(addShares)),
    cost: round2(prevCost.plus(pay)),
    addShares: addShares.toNumber(),
    fee: round2(pay.minus(net)),
    net: round2(net),
    pay: round2(pay),
  }
}

/**
 * 减仓：份额×净值记为卖出金额。
 * 成本按「回本」扣减：剩余成本 = max(0, 原成本 − 卖出金额)。
 * 卖出金额 ≥ 成本时剩余成本为 0，列表不再显示收益率。
 */
function applySellToHolding(holding, {sellShares, feeRate, nav}) {
  const have = toDecimal(holding && holding.shares)
  let sell = toDecimal(sellShares).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
  if (have.lte(0)) throw new Error('没有可卖份额')
  if (sell.lte(0)) throw new Error('请输入卖出份额')
  if (sell.gt(have)) {
    if (sell.minus(have).lte('0.00005')) sell = have
    else throw new Error('超过可卖份额')
  }
  const navD = toDecimal(nav)
  if (navD.lte(0)) throw new Error('暂无净值，无法记账')
  const gross = sell.mul(navD)
  const r = toDecimal(parseFeeRate(feeRate)).div(100)
  if (r.gte(1)) throw new Error('卖出费率须小于 100%')
  const fee = r.lte(0) ? new Decimal(0) : gross.mul(r)
  const net = gross.minus(fee)
  if (net.lt(0)) throw new Error('手续费超过卖出金额')
  const prevCost = toDecimal((holding && holding.cost) || 0)
  const remainShares = have.minus(sell)
  const nextCost = remainShares.lte(0)
    ? new Decimal(0)
    : Decimal.max(0, prevCost.minus(gross))
  return {
    shares: roundShares(remainShares),
    cost: round2(nextCost),
    gross: round2(gross),
    fee: round2(fee),
    net: round2(net),
    sellShares: sell.toNumber(),
  }
}

function sharesByFraction(total, n, d) {
  const have = toDecimal(total)
  if (have.lte(0)) return 0
  if (!d || n >= d) return roundShares(have)
  return roundShares(have.mul(n).div(d))
}

function formatShares(n) {
  const d = toDecimal(n)
  if (d.lte(0)) return '0'
  const four = d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP)
  const text = four.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
  return text || '0'
}

function parseYmd(s) {
  const [y, m, d] = String(s || '')
    .slice(0, 10)
    .split('-')
    .map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return null
  }
  return dt
}

function monthDate(year, monthIndex, day) {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  return todayDateStr(new Date(year, monthIndex, Math.min(day, last)))
}

function nextCycleDate(fromInclusive, cycleKey) {
  const spec = getSipCycle(cycleKey)
  const start = parseYmd(fromInclusive) || parseYmd(todayDateStr())
  const from = todayDateStr(start)
  if (spec.kind === 'daily') return from
  if (spec.kind === 'weekly' || spec.kind === 'biweekly') {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate())
    for (let i = 0; i < 8; i++) {
      if (d.getDay() === spec.weekday) return todayDateStr(d)
      d.setDate(d.getDate() + 1)
    }
    return from
  }
  if (spec.kind === 'monthly') {
    const day = spec.monthDay || 1
    const thisMonth = monthDate(start.getFullYear(), start.getMonth(), day)
    if (thisMonth >= from) return thisMonth
    const next = start.getMonth() === 11
      ? monthDate(start.getFullYear() + 1, 0, day)
      : monthDate(start.getFullYear(), start.getMonth() + 1, day)
    return next
  }
  return from
}

function followingCycleDate(afterDate, cycleKey) {
  const spec = getSipCycle(cycleKey)
  const after = String(afterDate || '').slice(0, 10)
  if (spec.kind === 'daily') return addCalendarDays(after, 1)
  if (spec.kind === 'weekly') return addCalendarDays(after, 7)
  if (spec.kind === 'biweekly') return addCalendarDays(after, 14)
  if (spec.kind === 'monthly') {
    const d = parseYmd(after)
    if (!d) return addCalendarDays(after, 1)
    const day = spec.monthDay || d.getDate()
    if (d.getMonth() === 11) return monthDate(d.getFullYear() + 1, 0, day)
    return monthDate(d.getFullYear(), d.getMonth() + 1, day)
  }
  return addCalendarDays(after, 1)
}

function sipScheduleDates(firstDate, cycleKey, untilDate) {
  const until = String(untilDate || '').slice(0, 10)
  const first = String(firstDate || '').slice(0, 10)
  if (!until || !first || first > until) return []
  const dates = []
  let d = first
  while (d && d <= until && dates.length < 520) {
    dates.push(d)
    d = followingCycleDate(d, cycleKey)
    if (!d || d <= dates[dates.length - 1]) break
  }
  return dates
}

module.exports = {
  SIP_FREQS,
  sipCycleRangeFor,
  sipSecondLabels,
  parseCycleKey,
  getSipCycle,
  normalizeSipCycle,
  cycleKeyFromPicker,
  pickerStateFromCycle,
  parseFeeRate,
  parsePayAmount,
  parseSharesInput,
  estimateBuyFee,
  applyBuyToHolding,
  applySellToHolding,
  sharesByFraction,
  formatShares,
  nextCycleDate,
  followingCycleDate,
  sipScheduleDates,
}
