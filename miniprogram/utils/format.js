function pctClass(v) {
  if (v == null || Number.isNaN(v)) return 'flat'
  if (v > 0) return 'rise'
  if (v < 0) return 'fall'
  return 'flat'
}

/**
 * 卡片右侧该显示哪个涨跌。
 * 官方净值已确认时用它——才和上方徽章的净值日、下方按净值算出的盈亏同一口径；
 * 否则用实时估值。QDII 的官方净值是 T-1 的，它昨夜的实时行情另由迷你图标签标注。
 */
function cardPercent(row) {
  if (!row) return null
  if (row.percentSource === 'confirmed' && row.percent != null) {
    const official = Number(row.percent)
    if (Number.isFinite(official)) return official
  }
  if (row.realtimePercent != null) {
    const live = Number(row.realtimePercent)
    if (Number.isFinite(live)) return live
  }
  if (row.percent == null) return null
  const pct = Number(row.percent)
  return Number.isFinite(pct) ? pct : null
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

function formatAmount(v, digits = 2) {
  if (v == null || Number.isNaN(v)) return '--'
  return Number(v).toFixed(digits)
}

/** 基金规模（亿元） */
function formatScaleYi(v, digits = 2) {
  if (v == null || Number.isNaN(Number(v))) return '--'
  return `${Number(v).toFixed(digits)}亿`
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
  cardPercent,
  formatPct,
  formatMoney,
  formatAmount,
  formatScaleYi,
  formatTrendAxisDate,
}
