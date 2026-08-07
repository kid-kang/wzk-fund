/** 基金周期 tab：成立不足该天数则不展示（成立来始终展示） */
const RANGE_MIN_AGE_DAYS = {
  '1m': 30,
  '3m': 90,
  '1y': 365,
  '3y': 365 * 3,
}

const ALL_RANGES = [
  {key: '1m', label: '近1月'},
  {key: '3m', label: '近3月'},
  {key: '1y', label: '近1年'},
  {key: '3y', label: '近3年'},
  {key: 'since', label: '成立来'},
]

function isRangeAvailable(key, ageDays) {
  if (key === 'since') return true
  if (ageDays == null || !Number.isFinite(Number(ageDays))) return true
  const min = RANGE_MIN_AGE_DAYS[key]
  if (min == null) return true
  return Number(ageDays) >= min
}

function availableFundRanges(ageDays) {
  return ALL_RANGES.filter((t) => isRangeAvailable(t.key, ageDays))
}

/** 进页默认近1年；成立不足时回退到可用的最长较短周期 */
function defaultFundRange(ageDays) {
  if (isRangeAvailable('1y', ageDays)) return '1y'
  if (isRangeAvailable('3m', ageDays)) return '3m'
  if (isRangeAvailable('1m', ageDays)) return '1m'
  const list = availableFundRanges(ageDays)
  return (list[0] && list[0].key) || 'since'
}

/**
 * 成立时长：优先按成立日算整年整月，否则用 ageDays 近似。
 * @returns {string} 如「成立3年2月」
 */
function formatFundAge(establishDate, ageDays) {
  let years = 0
  let months = 0
  const raw = String(establishDate || '').trim().slice(0, 10)
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

module.exports = {
  isRangeAvailable,
  availableFundRanges,
  defaultFundRange,
  formatFundAge,
}
