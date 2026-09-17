const Decimal = require('./vendor/decimal')

/** 基金金钱运算：十进制，避免 IEEE754 误差 */
Decimal.set({precision: 28, rounding: Decimal.ROUND_HALF_UP})

function toDecimal(n) {
  try {
    const d = new Decimal(n)
    return d.isFinite() ? d : new Decimal(0)
  } catch (e) {
    return new Decimal(0)
  }
}

/** 金额/收益四舍五入到分（与支付宝展示一致） */
function round2(n) {
  return toDecimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
}

/** 份额四舍五入到 4 位小数 */
function roundShares(n) {
  return toDecimal(n).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber()
}

/** 份额：金额 ÷ 净值，四舍五入到 4 位小数 */
function sharesFromAmount(amount, netValue) {
  const a = toDecimal(amount)
  const nav = toDecimal(netValue)
  if (a.lte(0) || nav.lte(0)) return 0
  return roundShares(a.div(nav))
}

/** 份额 × 净值 → 金额（分） */
function amountFromShares(shares, netValue) {
  const s = toDecimal(shares)
  const nav = toDecimal(netValue)
  if (s.lte(0) || nav.lte(0)) return 0
  return round2(s.mul(nav))
}

/** 份额 × (今净值 − 昨净值) → 收益（四舍五入到分） */
function pnlFromShares(shares, currNav, prevNav) {
  const s = toDecimal(shares)
  if (s.lte(0)) return 0
  return round2(s.mul(toDecimal(currNav).minus(toDecimal(prevNav))))
}

function eventText(e) {
  if (e == null) return ''
  if (typeof e.detail === 'string' || typeof e.detail === 'number') return String(e.detail)
  if (e.detail && e.detail.value != null) return String(e.detail.value)
  return ''
}

/**
 * 金额/份额/费率输入：只留数字和一个小数点。
 * type=digit 在开发者工具、粘贴时仍可能带入字母，需在 bindinput 里过滤并 return。
 */
function sanitizeDecimalInput(raw, maxDecimals) {
  let s = String(raw == null ? '' : raw)
  s = s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248))
  s = s.replace(/[。．]/g, '.')
  s = s.replace(/[^\d.]/g, '')
  const dot = s.indexOf('.')
  if (dot >= 0) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '')
    if (maxDecimals != null && maxDecimals >= 0) {
      s = s.slice(0, dot + 1 + maxDecimals)
    }
  }
  if (s.startsWith('.')) s = `0${s}`
  return s
}

module.exports = {
  Decimal,
  toDecimal,
  round2,
  roundShares,
  sharesFromAmount,
  amountFromShares,
  pnlFromShares,
  eventText,
  sanitizeDecimalInput,
}
