function pctClass(v) {
  if (v == null || Number.isNaN(v)) return 'flat'
  if (v > 0) return 'rise'
  if (v < 0) return 'fall'
  return 'flat'
}

function formatPct(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  const sign = v > 0 ? '+' : ''
  return `${sign}${Number(v).toFixed(digits)}%`
}

function formatMoney(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  const sign = v > 0 ? '+' : ''
  return `${sign}${Number(v).toFixed(digits)}`
}

/** 无正负号金额（涨跌靠色块/三角表达） */
function formatMoneyAbs(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  return Math.abs(Number(v)).toFixed(digits)
}

/** 无正负号涨跌幅 */
function formatPctAbs(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  return `${Math.abs(Number(v)).toFixed(digits)}%`
}

function formatAmount(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  return Number(v).toFixed(digits)
}

/**
 * 走势图横轴日期标签（天级点距时用）。
 * 近3月等：MM-DD；更长周期由 chartOptions 抽稀后另标。
 */
function formatTrendAxisDate(date, range) {
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

module.exports = {
  pctClass,
  formatPct,
  formatPctAbs,
  formatMoney,
  formatMoneyAbs,
  formatAmount,
  formatTrendAxisDate,
}
