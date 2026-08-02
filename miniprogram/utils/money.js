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

/** 份额：金额 ÷ 净值，四舍五入到 4 位小数 */
function sharesFromAmount(amount, netValue) {
  const a = toDecimal(amount)
  const nav = toDecimal(netValue)
  if (a.lte(0) || nav.lte(0)) return 0
  return a.div(nav).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber()
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

module.exports = {
  Decimal,
  round2,
  sharesFromAmount,
  amountFromShares,
  pnlFromShares,
}
