const {
  shouldShowConfirmedUpdatedBadge,
  normalizeNetValueDate,
} = require('./tradingCalendar')
const {
  Decimal,
  amountFromShares,
  pnlFromShares,
  round2,
  truncPnl2,
} = require('./money')

function latestEstimateNav(quote) {
  if (quote.estimateNetValue != null && quote.estimateNetValue > 0) {
    return quote.estimateNetValue
  }
  const trend = quote.trend || []
  for (let i = trend.length - 1; i >= 0; i--) {
    const nv = trend[i] && trend[i].netValue
    if (nv != null && nv > 0) return nv
  }
  return null
}

function resolveNavPair(quote) {
  const confirmedNav = quote.netValue != null && quote.netValue > 0 ? quote.netValue : null
  const prev =
    quote.prevNetValue != null && quote.prevNetValue > 0 ? quote.prevNetValue : null
  const estimateNav = latestEstimateNav(quote)

  if (quote.percentSource === 'confirmed' && confirmedNav != null && prev != null) {
    return {prevNav: prev, currNav: confirmedNav}
  }
  if (estimateNav != null) {
    return {prevNav: prev != null ? prev : confirmedNav, currNav: estimateNav}
  }
  if (confirmedNav != null && prev != null) {
    return {prevNav: prev, currNav: confirmedNav}
  }
  return {prevNav: null, currNav: null}
}

function calcHoldings(localFunds, quotes) {
  const quoteMap = new Map((quotes || []).map((q) => [q.code, q]))
  const rows = []
  const persistPatches = []
  let totalAmount = new Decimal(0)
  let totalPnl = new Decimal(0)

  for (const raw of localFunds || []) {
    const q = quoteMap.get(raw.code) || {}
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

    const sectors = raw.sectors && raw.sectors.length
      ? raw.sectors
      : q.sectors && q.sectors.length
        ? q.sectors
        : []

    const patch = {code: raw.code}
    let needPersist = false
    if (!(raw.sectors && raw.sectors.length) && sectors.length) {
      patch.sectors = sectors
      needPersist = true
    }
    if (needPersist) persistPatches.push(patch)

    rows.push(
      Object.assign({}, raw, {
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
        amount: displayAmount,
        liveAmount,
        pnl,
        sectors,
        shares,
        type: raw.type,
        code: raw.code,
        confirmedUpdated: shouldShowConfirmedUpdatedBadge({
          percentSource: q.percentSource || null,
          netValueDate: navDay || q.netValueDate || '',
        }),
      }),
    )
  }

  const totalAmountNum = round2(totalAmount)
  for (const row of rows) {
    row.weight =
      totalAmountNum > 0
        ? round2(new Decimal(row.amount).div(totalAmount).mul(100))
        : 0
  }

  let bodTotal = new Decimal(0)
  for (const row of rows) {
    if (row.shares > 0 && row.prevNetValue != null && row.prevNetValue > 0) {
      bodTotal = bodTotal.plus(amountFromShares(row.shares, row.prevNetValue))
    } else {
      bodTotal = bodTotal.plus(new Decimal(row.amount || 0).minus(row.pnl || 0))
    }
  }
  const bodTotalNum = round2(bodTotal)
  const totalPnlNum = round2(totalPnl)

  return {
    summary: {
      totalAmount: totalAmountNum,
      bodTotal: bodTotalNum,
      totalPnl: totalPnlNum,
      totalPnlPercent:
        bodTotalNum > 0
          ? round2(new Decimal(totalPnlNum).div(bodTotalNum).mul(100))
          : 0,
    },
    list: rows.sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    persistPatches,
  }
}

function mergeWatchlist(localFunds, quotes) {
  const quoteMap = new Map((quotes || []).map((q) => [q.code, q]))
  const persistPatches = []
  const list = (localFunds || []).map((f) => {
    const q = quoteMap.get(f.code) || {}
    const sectors = f.sectors && f.sectors.length
      ? f.sectors
      : q.sectors && q.sectors.length
        ? q.sectors
        : []
    if (!(f.sectors && f.sectors.length) && sectors.length) {
      persistPatches.push({code: f.code, sectors})
    }
    const navDay = normalizeNetValueDate(q.netValueDate)
    return Object.assign({}, f, {
      name: q.name || f.name,
      percent: q.percent ?? q.estimateGrowth ?? q.dayGrowth ?? null,
      estimateGrowth: q.estimateGrowth,
      dayGrowth: q.dayGrowth,
      percentSource: q.percentSource || null,
      netValueDate: navDay || q.netValueDate || '',
      time: q.time,
      trend: q.trend || [],
      sectors,
      confirmedUpdated: shouldShowConfirmedUpdatedBadge({
        percentSource: q.percentSource || null,
        netValueDate: navDay || q.netValueDate || '',
      }),
    })
  })
  return {list, persistPatches}
}

module.exports = {
  truncPnl2,
  resolveNavPair,
  calcHoldings,
  mergeWatchlist,
}
