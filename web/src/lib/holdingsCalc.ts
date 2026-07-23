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
    sectors?: string[]
  }>
} {
  const quoteMap = new Map(quotes.map((q) => [q.code, q]))
  const rows: FundQuoteRow[] = []
  const persistPatches: Array<{
    code: string
    sectors?: string[]
  }> = []
  let totalAmount = 0
  let totalPnl = 0

  for (const raw of localFunds) {
    const q = quoteMap.get(raw.code) || ({} as QuoteLike)
    const percent = q.percent ?? q.estimateGrowth ?? q.dayGrowth ?? null
    const {prevNav, currNav} = resolveNavPair(q)

    const navDay = normalizeNetValueDate(q.netValueDate)
    const shares = Number(raw.shares) || 0

    const usingEstimate =
      q.percentSource === 'estimate' ||
      (q.percentSource !== 'confirmed' && latestEstimateNav(q) != null)

    let pnl = 0
    if (shares > 0 && prevNav != null && currNav != null) {
      pnl = truncPnl2(shares * (currNav - prevNav))
    }

    // 展示用市值实时计算：估值期看最新确认净值；确认期看当日确认净值。
    let displayAmount = 0
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

    const sectors = raw.sectors?.length
      ? raw.sectors
      : q.sectors?.length
        ? q.sectors
        : []

    const patch: {
      code: string
      sectors?: string[]
    } = {code: raw.code}
    let needPersist = false

    if (!raw.sectors?.length && sectors.length) {
      patch.sectors = sectors
      needPersist = true
    }
    if (needPersist) persistPatches.push(patch)

    rows.push({
      ...raw,
      name: q.name || raw.name,
      fundKey: q.fundKey || raw.fundKey,
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
      liveAmount: round2(liveAmount),
      pnl,
      sectors,
      shares,
      type: raw.type,
      code: raw.code,
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
