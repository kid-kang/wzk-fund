import type {FundQuoteRow, FundRecord, HoldingsPayload} from '@/lib/api'
import {classifyFundType, isRealtimeHolding} from '@/lib/fundCategory'
import {
  shouldShowConfirmedUpdatedBadge,
  normalizeNetValueDate,
  isDelayedNavFund,
  formatOfficialDiscloseTime,
} from '@/lib/tradingCalendar'
import {
  Decimal,
  amountFromShares,
  pnlFromShares,
  round2,
  truncPnl2,
} from '@/lib/money'

export {truncPnl2, isRealtimeHolding}

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
  ftype?: string
}

export type HoldGroupSummary = HoldingsPayload['summary']

export type HoldGroup = {
  list: FundQuoteRow[]
  summary: HoldGroupSummary
}

export type HoldingsGroups = {
  realtime: HoldGroup
  delayed: HoldGroup
}

function cleanSectors(list: string[] | undefined | null): string[] {
  return (Array.isArray(list) ? list : []).filter((s) => {
    const t = String(s || '').trim()
    return !!t && t !== '--' && t !== '-'
  })
}

function pickSectors(local: string[] | undefined, remote: string[] | undefined): string[] {
  const fromRemote = cleanSectors(remote)
  if (fromRemote.length) return fromRemote
  return cleanSectors(local)
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

type PersistPatch = {
  code: string
  sectors?: string[]
  fundType?: string
  ftype?: string
}

export function calcHoldings(
  localFunds: FundRecord[],
  quotes: QuoteLike[],
): HoldingsPayload & {
  persistPatches: PersistPatch[]
} {
  const quoteMap = new Map(quotes.map((q) => [q.code, q]))
  const rows: FundQuoteRow[] = []
  const persistPatches: PersistPatch[] = []
  let totalAmount = new Decimal(0)
  let totalPnl = new Decimal(0)

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
      pnl = pnlFromShares(shares, currNav, prevNav)
    }

    // 展示用市值实时计算：估值期看最新确认净值；确认期看当日确认净值。
    let displayAmount = 0
    if (shares > 0) {
      if (usingEstimate && prevNav != null) {
        displayAmount = amountFromShares(shares, prevNav)
      } else if (currNav != null) {
        displayAmount = amountFromShares(shares, currNav)
      } else if (prevNav != null) {
        displayAmount = amountFromShares(shares, prevNav)
      }
    }

    const liveAmount =
      shares > 0 && currNav != null ? amountFromShares(shares, currNav) : displayAmount

    totalAmount = totalAmount.plus(displayAmount)
    totalPnl = totalPnl.plus(pnl)

    const sectors = pickSectors(raw.sectors, q.sectors)
    const name = q.name || raw.name
    const ftype = q.ftype || raw.ftype || ''
    const fundType = raw.fundType || classifyFundType(ftype, name)

    const patch: PersistPatch = {code: raw.code}
    let needPersist = false
    const localClean = cleanSectors(raw.sectors)
    const hadJunkSectors = (raw.sectors || []).length > 0 && !localClean.length
    if (sectors.join() !== localClean.join() || hadJunkSectors) {
      patch.sectors = sectors
      needPersist = true
    }
    if (!raw.fundType && fundType) {
      patch.fundType = fundType
      needPersist = true
    }
    if (ftype && ftype !== raw.ftype) {
      patch.ftype = ftype
      needPersist = true
    }
    if (needPersist) persistPatches.push(patch)

    rows.push({
      ...raw,
      name,
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
      amount: displayAmount,
      liveAmount,
      pnl,
      sectors,
      fundType,
      ftype,
      shares,
      type: raw.type,
      code: raw.code,
      ...(() => {
        const badgeQuote = {
          percentSource: q.percentSource || null,
          netValueDate: navDay || q.netValueDate || '',
          dayGrowth: q.dayGrowth,
          percent,
          fundType,
          ftype,
          name,
        }
        const confirmedUpdated = shouldShowConfirmedUpdatedBadge(badgeQuote)
        const delayed = isDelayedNavFund(badgeQuote)
        return {
          confirmedUpdated,
          discloseTimeText:
            delayed && confirmedUpdated
              ? formatOfficialDiscloseTime(badgeQuote.netValueDate, q.time)
              : '',
        }
      })(),
    })
  }

  const totalAmountNum = round2(totalAmount)
  for (const row of rows) {
    row.weight =
      totalAmountNum > 0 ? round2(new Decimal(row.amount).div(totalAmount).mul(100)) : 0
  }

  let bodTotal = new Decimal(0)
  for (const row of rows) {
    // 开盘前基数 = 份额 × 昨净值（与涨幅无关）
    if (row.shares > 0 && row.prevNetValue != null && row.prevNetValue > 0) {
      bodTotal = bodTotal.plus(amountFromShares(row.shares, row.prevNetValue))
    } else {
      bodTotal = bodTotal.plus(new Decimal(row.amount || 0).minus(row.pnl || 0))
    }
  }
  const bodTotalNum = round2(bodTotal)
  const totalPnlNum = round2(totalPnl)

  const list = rows.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
  return {
    summary: {
      totalAmount: totalAmountNum,
      bodTotal: bodTotalNum,
      // 总收益 = 各基金已取分收益之和（与支付宝单只加总一致）
      totalPnl: totalPnlNum,
      totalPnlPercent:
        bodTotalNum > 0 ? round2(new Decimal(totalPnlNum).div(bodTotalNum).mul(100)) : 0,
    },
    list,
    groups: splitHoldingsByRealtime(list),
    persistPatches,
  }
}

/** 对一组持仓重算组内权重与汇总 */
export function summarizeHoldGroup(rows: FundQuoteRow[]): HoldGroup {
  let totalAmount = new Decimal(0)
  let totalPnl = new Decimal(0)
  let bodTotal = new Decimal(0)
  for (const row of rows || []) {
    totalAmount = totalAmount.plus(row.amount || 0)
    totalPnl = totalPnl.plus(row.pnl || 0)
    if (row.shares > 0 && row.prevNetValue != null && row.prevNetValue > 0) {
      bodTotal = bodTotal.plus(amountFromShares(row.shares, row.prevNetValue))
    } else {
      bodTotal = bodTotal.plus(new Decimal(row.amount || 0).minus(row.pnl || 0))
    }
  }
  const totalAmountNum = round2(totalAmount)
  const totalPnlNum = round2(totalPnl)
  const bodTotalNum = round2(bodTotal)
  const list = (rows || [])
    .map((row) => ({
      ...row,
      weight:
        totalAmountNum > 0
          ? round2(new Decimal(row.amount || 0).div(totalAmount).mul(100))
          : 0,
    }))
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))

  return {
    list,
    summary: {
      totalAmount: totalAmountNum,
      bodTotal: bodTotalNum,
      totalPnl: totalPnlNum,
      totalPnlPercent:
        bodTotalNum > 0
          ? round2(new Decimal(totalPnlNum).div(bodTotalNum).mul(100))
          : 0,
    },
  }
}

/** 可实时估值 / 非实时（QDII·海外）分组 */
export function splitHoldingsByRealtime(list: FundQuoteRow[]): HoldingsGroups {
  const live: FundQuoteRow[] = []
  const delayed: FundQuoteRow[] = []
  for (const row of list || []) {
    if (isRealtimeHolding(row)) live.push(row)
    else delayed.push(row)
  }
  return {
    realtime: summarizeHoldGroup(live),
    delayed: summarizeHoldGroup(delayed),
  }
}

export function mergeWatchlist(
  localFunds: FundRecord[],
  quotes: QuoteLike[],
): {list: FundQuoteRow[]; persistPatches: PersistPatch[]} {
  const quoteMap = new Map(quotes.map((q) => [q.code, q]))
  const persistPatches: PersistPatch[] = []
  const list = localFunds.map((f) => {
    const q = quoteMap.get(f.code) || ({} as QuoteLike)
    const sectors = pickSectors(f.sectors, q.sectors)
    const name = q.name || f.name
    const ftype = q.ftype || f.ftype || ''
    const fundType = f.fundType || classifyFundType(ftype, name)
    const patch: PersistPatch = {code: f.code}
    let needPersist = false
    const localClean = cleanSectors(f.sectors)
    const hadJunkSectors = (f.sectors || []).length > 0 && !localClean.length
    if (sectors.join() !== localClean.join() || hadJunkSectors) {
      patch.sectors = sectors
      needPersist = true
    }
    if (!f.fundType && fundType) {
      patch.fundType = fundType
      needPersist = true
    }
    if (ftype && ftype !== f.ftype) {
      patch.ftype = ftype
      needPersist = true
    }
    if (needPersist) persistPatches.push(patch)
    const navDay = normalizeNetValueDate(q.netValueDate)
    const percent = q.percent ?? q.estimateGrowth ?? q.dayGrowth ?? null
    const badgeQuote = {
      percentSource: q.percentSource || null,
      netValueDate: navDay || q.netValueDate || '',
      dayGrowth: q.dayGrowth,
      percent,
      fundType,
      ftype,
      name,
    }
    const confirmedUpdated = shouldShowConfirmedUpdatedBadge(badgeQuote)
    const delayed = isDelayedNavFund(badgeQuote)
    return {
      ...f,
      name,
      percent,
      percentSource: q.percentSource || null,
      estimateGrowth: q.estimateGrowth,
      dayGrowth: q.dayGrowth,
      netValueDate: navDay || q.netValueDate || '',
      time: q.time,
      trend: q.trend || [],
      sectors,
      fundType,
      ftype,
      confirmedUpdated,
      discloseTimeText:
        delayed && confirmedUpdated
          ? formatOfficialDiscloseTime(badgeQuote.netValueDate, q.time)
          : '',
    } as FundQuoteRow
  })
  return {list, persistPatches}
}
