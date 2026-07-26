import Decimal from 'decimal.js'

/** 基金金钱运算：十进制，避免 IEEE754 误差 */
Decimal.set({precision: 28, rounding: Decimal.ROUND_HALF_UP})

export {Decimal}

export function toDecimal(n: Decimal.Value): Decimal {
  try {
    const d = new Decimal(n)
    return d.isFinite() ? d : new Decimal(0)
  } catch {
    return new Decimal(0)
  }
}

/** 金额/收益四舍五入到分（与支付宝展示一致；负数 .005 远离 0） */
export function round2(n: Decimal.Value): number {
  return toDecimal(n).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
}

/** 收益取分（历史命名保留，语义同 round2） */
export function truncPnl2(n: Decimal.Value): number {
  return round2(n)
}

/** 份额：金额 ÷ 净值，四舍五入到 4 位小数 */
export function sharesFromAmount(amount: Decimal.Value, netValue: Decimal.Value): number {
  const a = toDecimal(amount)
  const nav = toDecimal(netValue)
  if (a.lte(0) || nav.lte(0)) return 0
  return a.div(nav).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber()
}

/** 份额 × 净值 → 金额（分） */
export function amountFromShares(shares: Decimal.Value, netValue: Decimal.Value): number {
  const s = toDecimal(shares)
  const nav = toDecimal(netValue)
  if (s.lte(0) || nav.lte(0)) return 0
  return round2(s.mul(nav))
}

/** 份额 × (今净值 − 昨净值) → 收益（四舍五入到分） */
export function pnlFromShares(
  shares: Decimal.Value,
  currNav: Decimal.Value,
  prevNav: Decimal.Value,
): number {
  const s = toDecimal(shares)
  if (s.lte(0)) return 0
  return round2(s.mul(toDecimal(currNav).minus(toDecimal(prevNav))))
}
