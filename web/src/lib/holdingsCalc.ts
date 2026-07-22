import type {FundQuoteRow, FundRecord, HoldingsPayload} from '@/lib/api'
import {
  shouldShowConfirmedUpdatedBadge,
  normalizeNetValueDate,
} from '@/lib/tradingCalendar'

function round2(n: number) {
  return Math.round(Number(n) * 100) / 100
}

/** 收益取分：与支付宝一致，舍去厘（向 0 截断），不用四舍五入 */
export function truncPnl2(n: number) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return (x >= 0 ? Math.floor(x * 100) : Math.ceil(x * 100)) / 100
}

/** 份额保留 4 位，减少金额反推误差 */
export function roundShares(n: number) {
  return Math.round(Number(n) * 10000) / 10000
}

export function deriveShares(amount: number, netValue: number | null | undefined) {
  if (!(amount > 0) || !(netValue != null && netValue > 0)) return 0
  return roundShares(amount / netValue)
}

/**
 * 由「持仓金额」反推份额时用的确认净值。
 * 绝不能用估值净值（盘中会变，且会把份额永久算错）。
 *
 * - 确认会话且金额已滚到本净值日 → 金额是今确认市值 → 今确认净值
 * - 其余（盘中估值 / 尚未滚仓）→ 金额是上一确认市值 → 昨确认净值
 *
 * 注意：盘中 amountAsOf 常等于 netValueDate（同为上一确认日），
 * 不能据此当成「已用今净值计价」去用估值净值反推。
 */
export function resolveSharesBasisNav(
  fund: {amountAsOf?: string},
  quote: QuoteLike,
): number | null {
  const navDay = normalizeNetValueDate(quote.netValueDate)
  const amountAsOf =
    normalizeNetValueDate(fund.amountAsOf) || String(fund.amountAsOf || '').slice(0, 10)
  const confirmedNav =
    quote.netValue != null && quote.netValue > 0 ? quote.netValue : null
  const prev =
    quote.prevNetValue != null && quote.prevNetValue > 0 ? quote.prevNetValue : null

  const rolledToConfirmedDay =
    quote.percentSource === 'confirmed' &&
    !!navDay &&
    !!amountAsOf &&
    amountAsOf >= navDay

  if (rolledToConfirmedDay && confirmedNav != null) return confirmedNav
  if (prev != null) return prev
  if (confirmedNav != null) return confirmedNav
  return null
}

/** 金额与份额×确认净值偏差超过 5 分时，按金额重算份额（修复历史锁死的错误份额） */
export function reconcileShares(
  amount: number,
  shares: number,
  basisNav: number | null,
): number {
  if (!(amount > 0) || !(basisNav != null && basisNav > 0)) return shares
  const implied = deriveShares(amount, basisNav)
  if (implied <= 0) return shares
  if (shares <= 0) return implied
  if (Math.abs(round2(shares * basisNav) - round2(amount)) > 0.05) {
    return implied
  }
  return shares
}

export type QuoteLike = {
  code: string
  name?: string
  fundKey?: string
  percent?: number | null
  percentSource?: 'estimate' | 'confirmed' | null
  estimateGrowth?: number | null
  dayGrowth?: number | null
  netValueDate?: string
  netValue?: number | null
  estimateNetValue?: number | null
  prevNetValue?: number | null
  time?: string | null
  trend?: {time: string; growth: number | null; netValue?: number | null}[]
  sectors?: string[]
}

type RolledFund = FundRecord & {_preRollAmount?: number}

/**
 * 晚间确认后滚仓：持仓金额 = 份额 × 今净值，并把 amountAsOf 写成净值日。
 * 若 amountAsOf >= 净值日，说明本确认日已滚过，直接跳过（刷新不再写 localStorage）。
 */
export function rollConfirmedAmount(fund: FundRecord, quote: QuoteLike | undefined): RolledFund {
  if (fund.type !== 'hold') return fund
  const navDay = normalizeNetValueDate(quote?.netValueDate)
  const confirmedNav = quote?.netValue
  if (!navDay) return fund
  if (quote?.percentSource !== 'confirmed') return fund
  if (!(confirmedNav != null && confirmedNav > 0)) return fund

  const amount = Number(fund.amount) || 0
  const amountAsOf =
    normalizeNetValueDate(fund.amountAsOf) || String(fund.amountAsOf || '').slice(0, 10)

  // 滚仓前先按金额对齐份额（禁止用估值净值）
  const basisBeforeRoll = resolveSharesBasisNav(fund, quote)
  let shares = reconcileShares(amount, Number(fund.shares) || 0, basisBeforeRoll)

  // 本净值日已滚仓：不再改金额，只允许修正份额
  if (amountAsOf && amountAsOf >= navDay) {
    return shares !== (Number(fund.shares) || 0) ? {...fund, shares} : fund
  }

  if (shares <= 0) return fund

  const nextAmount = round2(shares * confirmedNav)
  return {
    ...fund,
    shares,
    amount: nextAmount,
    amountAsOf: navDay,
    _preRollAmount: amount,
  }
}

/** 从估值分时末点取净值（比涨幅更精确） */
function latestEstimateNav(quote: QuoteLike): number | null {
  if (quote.estimateNetValue != null && quote.estimateNetValue > 0) {
    return quote.estimateNetValue
  }
  const trend = quote.trend || []
  for (let i = trend.length - 1; i >= 0; i--) {
    const nv = trend[i]?.netValue
    if (nv != null && nv > 0) return nv
  }
  return null
}

/**
 * 解析昨净值 / 今净值。
 * 金钱一律用净值差；涨幅只用于展示，禁止用涨幅反推净值。
 *
 * - 确认会话 → 昨/今均为披露净值
 * - 有估值净值 → 昨=上一确认，今=估值（盘中实时）
 * - 否则有披露净值对 → QDII 等延迟净值仍按披露差计算
 */
export function resolveNavPair(quote: QuoteLike): {
  prevNav: number | null
  currNav: number | null
} {
  const confirmedNav = quote.netValue != null && quote.netValue > 0 ? quote.netValue : null
  const prev =
    quote.prevNetValue != null && quote.prevNetValue > 0 ? quote.prevNetValue : null
  const estimateNav = latestEstimateNav(quote)

  if (quote.percentSource === 'confirmed' && confirmedNav != null && prev != null) {
    return {prevNav: prev, currNav: confirmedNav}
  }
  if (estimateNav != null) {
    return {prevNav: prev ?? confirmedNav, currNav: estimateNav}
  }
  if (confirmedNav != null && prev != null) {
    return {prevNav: prev, currNav: confirmedNav}
  }
  return {prevNav: null, currNav: null}
}

export function calcHoldings(
  localFunds: FundRecord[],
  quotes: QuoteLike[],
): HoldingsPayload & {
  persistPatches: Array<{
    code: string
    amount?: number
    amountAsOf?: string
    shares?: number
    sectors?: string[]
  }>
} {
  const quoteMap = new Map(quotes.map((q) => [q.code, q]))
  const rows: FundQuoteRow[] = []
  const persistPatches: Array<{
    code: string
    amount?: number
    amountAsOf?: string
    shares?: number
    sectors?: string[]
  }> = []
  let totalAmount = 0
  let totalPnl = 0

  for (const raw of localFunds) {
    const q = quoteMap.get(raw.code) || ({} as QuoteLike)
    const f = rollConfirmedAmount(raw, q)
    const percent = q.percent ?? q.estimateGrowth ?? q.dayGrowth ?? null
    const {prevNav, currNav} = resolveNavPair(q)

    const navDay = normalizeNetValueDate(q.netValueDate)
    const amount = Number(f.amount) || 0

    // 按确认净值对齐份额；已有错误份额也会在金额对不上时重算
    const basisNav = resolveSharesBasisNav(f, q)
    let shares = reconcileShares(amount, Number(f.shares) || 0, basisNav)

    const usingEstimate =
      q.percentSource === 'estimate' ||
      (q.percentSource !== 'confirmed' && latestEstimateNav(q) != null)

    let pnl = 0
    if (shares > 0 && prevNav != null && currNav != null) {
      pnl = truncPnl2(shares * (currNav - prevNav))
    }

    // 展示用市值：估值期看昨确认；确认期看今确认（与 localStorage 滚仓结果一致）
    let displayAmount = amount
    if (shares > 0) {
      if (usingEstimate && prevNav != null) {
        displayAmount = round2(shares * prevNav)
      } else if (currNav != null) {
        displayAmount = round2(shares * currNav)
      } else if (prevNav != null) {
        displayAmount = round2(shares * prevNav)
      }
    }

    const liveAmount =
      shares > 0 && currNav != null ? round2(shares * currNav) : displayAmount

    totalAmount += displayAmount
    totalPnl += pnl

    const sectors = f.sectors?.length
      ? f.sectors
      : q.sectors?.length
        ? q.sectors
        : []

    const patch: {
      code: string
      amount?: number
      amountAsOf?: string
      shares?: number
      sectors?: string[]
    } = {code: f.code}
    let needPersist = false

    // 只在真正滚仓（或补写份额）时写 localStorage，刷新不重复滚
    if (f.amount !== raw.amount || f.amountAsOf !== (raw.amountAsOf || '')) {
      patch.amount = f.amount
      patch.amountAsOf = f.amountAsOf || ''
      needPersist = true
    }
    if (shares > 0 && shares !== (Number(raw.shares) || 0)) {
      patch.shares = shares
      needPersist = true
    }
    if (!raw.sectors?.length && sectors.length) {
      patch.sectors = sectors
      needPersist = true
    }
    if (needPersist) persistPatches.push(patch)

    rows.push({
      ...f,
      name: q.name || f.name,
      fundKey: q.fundKey || f.fundKey,
      percent,
      percentSource: q.percentSource || null,
      estimateGrowth: q.estimateGrowth,
      dayGrowth: q.dayGrowth,
      netValueDate: navDay || q.netValueDate || '',
      netValue: q.netValue ?? null,
      estimateNetValue: latestEstimateNav(q),
      prevNetValue: prevNav,
      time: q.time,
      trend: q.trend || [],
      amount: round2(displayAmount),
      amountAsOf: f.amountAsOf || '',
      liveAmount: round2(liveAmount),
      pnl,
      sectors,
      shares,
      type: f.type,
      code: f.code,
      confirmedUpdated: shouldShowConfirmedUpdatedBadge({
        percentSource: q.percentSource || null,
        netValueDate: navDay || q.netValueDate || '',
      }),
    })
  }

  for (const row of rows) {
    row.weight = totalAmount > 0 ? round2((row.amount / totalAmount) * 100) : 0
  }

  let bodTotal = 0
  for (const row of rows) {
    // 开盘前基数 = 份额 × 昨净值（与涨幅无关）
    if (row.shares > 0 && row.prevNetValue != null && row.prevNetValue > 0) {
      bodTotal += round2(row.shares * row.prevNetValue)
    } else {
      bodTotal += (row.amount || 0) - (row.pnl || 0)
    }
  }
  bodTotal = round2(bodTotal)

  return {
    summary: {
      totalAmount: round2(totalAmount),
      bodTotal,
      // 总收益 = 各基金已截尾收益之和（与支付宝单只加总一致）
      totalPnl: round2(totalPnl),
      totalPnlPercent: bodTotal > 0 ? round2((totalPnl / bodTotal) * 100) : 0,
    },
    list: rows.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
    persistPatches,
  }
}

export function mergeWatchlist(
  localFunds: FundRecord[],
  quotes: QuoteLike[],
): {list: FundQuoteRow[]; persistPatches: Array<{code: string; sectors?: string[]}>} {
  const quoteMap = new Map(quotes.map((q) => [q.code, q]))
  const persistPatches: Array<{code: string; sectors?: string[]}> = []
  const list = localFunds.map((f) => {
    const q = quoteMap.get(f.code) || ({} as QuoteLike)
    const sectors = f.sectors?.length
      ? f.sectors
      : q.sectors?.length
        ? q.sectors
        : []
    if (!f.sectors?.length && sectors.length) {
      persistPatches.push({code: f.code, sectors})
    }
    return {
      ...f,
      name: q.name || f.name,
      percent: q.percent ?? q.estimateGrowth ?? q.dayGrowth ?? null,
      estimateGrowth: q.estimateGrowth,
      dayGrowth: q.dayGrowth,
      time: q.time,
      trend: q.trend || [],
      sectors,
    } as FundQuoteRow
  })
  return {list, persistPatches}
}
