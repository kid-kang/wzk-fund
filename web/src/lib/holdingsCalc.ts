import type {FundQuoteRow, FundRecord, HoldingsPayload} from '@/lib/api'

export function todayDateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function round2(n: number) {
  return Math.round(Number(n) * 100) / 100
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
  time?: string | null
  trend?: {time: string; growth: number | null}[]
  sectors?: string[]
}

type RolledFund = FundRecord & {_preRollAmount?: number}

/**
 * 晚间确认涨跌后，自动把持仓金额滚到新确认市值：
 * amount_new = amount * (1 + dayGrowth/100)，并记录 amountAsOf = 净值日
 * （纯计算，不写存储；调用方负责持久化）
 */
export function rollConfirmedAmount(fund: FundRecord, quote: QuoteLike | undefined): RolledFund {
  if (fund.type !== 'hold') return fund
  const dayGrowth = quote?.dayGrowth
  const navDay = String(quote?.netValueDate || '').slice(0, 10)
  if (dayGrowth == null || !navDay) return fund
  if (quote?.percentSource !== 'confirmed') return fund

  const amount = Number(fund.amount) || 0
  if (amount <= 0) return fund

  let amountAsOf = String(fund.amountAsOf || '').slice(0, 10)
  if (!amountAsOf) {
    amountAsOf = navDay === todayDateStr() ? '1970-01-01' : navDay
    if (amountAsOf === navDay) {
      return {...fund, amountAsOf: navDay}
    }
  }

  if (navDay <= amountAsOf) return {...fund, amountAsOf}

  const nextAmount = round2(amount * (1 + dayGrowth / 100))
  return {
    ...fund,
    amount: nextAmount,
    amountAsOf: navDay,
    _preRollAmount: amount,
  }
}

export function calcHoldings(
  localFunds: FundRecord[],
  quotes: QuoteLike[],
): HoldingsPayload & {
  persistPatches: Array<{
    code: string
    amount?: number
    amountAsOf?: string
    sectors?: string[]
  }>
} {
  const quoteMap = new Map(quotes.map((q) => [q.code, q]))
  const rows: FundQuoteRow[] = []
  const persistPatches: Array<{
    code: string
    amount?: number
    amountAsOf?: string
    sectors?: string[]
  }> = []
  let totalAmount = 0
  let totalPnl = 0
  const today = todayDateStr()

  for (const raw of localFunds) {
    const q = quoteMap.get(raw.code) || ({} as QuoteLike)
    const f = rollConfirmedAmount(raw, q)
    const percent = q.percent ?? q.estimateGrowth ?? q.dayGrowth ?? null
    const amount = Number(f.amount) || 0
    const preRoll = f._preRollAmount

    let pnl = 0
    let displayAmount = amount
    if (percent != null && amount > 0) {
      if (
        f.amountAsOf === today &&
        String(q.netValueDate || '').slice(0, 10) === today &&
        q.dayGrowth != null
      ) {
        const prev = preRoll != null ? preRoll : amount / (1 + q.dayGrowth / 100)
        pnl = amount - prev
        displayAmount = amount
      } else {
        pnl = amount * (percent / 100)
        displayAmount = amount
      }
    }

    const liveAmount =
      displayAmount > 0 && percent != null
        ? f.amountAsOf === today && q.dayGrowth != null
          ? displayAmount
          : displayAmount * (1 + percent / 100)
        : displayAmount

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
      sectors?: string[]
    } = {code: f.code}
    let needPersist = false
    if (f.amount !== raw.amount || f.amountAsOf !== (raw.amountAsOf || '')) {
      patch.amount = f.amount
      patch.amountAsOf = f.amountAsOf || ''
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
      netValueDate: q.netValueDate || '',
      time: q.time,
      trend: q.trend || [],
      amount: round2(displayAmount),
      amountAsOf: f.amountAsOf || '',
      liveAmount: round2(liveAmount),
      pnl: round2(pnl),
      sectors,
      shares: f.shares,
      type: f.type,
      code: f.code,
    })
  }

  for (const row of rows) {
    row.weight = totalAmount > 0 ? round2((row.amount / totalAmount) * 100) : 0
  }

  let bodTotal = 0
  for (const row of rows) {
    if (row.amountAsOf === today && row.pnl != null) {
      bodTotal += (row.amount || 0) - (row.pnl || 0)
    } else {
      bodTotal += row.amount || 0
    }
  }
  bodTotal = round2(bodTotal)

  return {
    summary: {
      totalAmount: round2(totalAmount),
      bodTotal,
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
