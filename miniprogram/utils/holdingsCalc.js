const {
  shouldShowConfirmedUpdatedBadge,
  normalizeNetValueDate,
  isDelayedNavFund,
  formatOfficialDiscloseTime,
} = require('./tradingCalendar')
const {
  Decimal,
  amountFromShares,
  pnlFromShares,
  round2,
} = require('./money')
const {classifyFundType, isRealtimeHolding} = require('./fundCategory')

function cleanSectors(list) {
  return (Array.isArray(list) ? list : []).filter((s) => {
    const t = String(s || '').trim()
    return !!t && t !== '--' && t !== '-'
  })
}

function pickSectors(local, remote) {
  const fromRemote = cleanSectors(remote)
  if (fromRemote.length) return fromRemote
  return cleanSectors(local)
}

function normalizeSectorItems(items, fallbackNames) {
  if (Array.isArray(items) && items.length) {
    return items
      .map((row) => {
        if (!row) return null
        if (typeof row === 'string') {
          const name = String(row).trim()
          if (!name || name === '--' || name === '-') return null
          return {name, sectorCode: '', mappingCode: ''}
        }
        const name = String(row.name || '').trim()
        if (!name || name === '--' || name === '-') return null
        return {
          name,
          sectorCode: String(row.sectorCode || '').trim(),
          mappingCode: String(row.mappingCode || '').trim(),
        }
      })
      .filter(Boolean)
  }
  return cleanSectors(fallbackNames).map((name) => ({
    name,
    sectorCode: '',
    mappingCode: '',
  }))
}

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

    const sectors = pickSectors(raw.sectors, q.sectors)
    const sectorItems = normalizeSectorItems(q.sectorItems, sectors)
    const name = q.name || raw.name
    const ftype = q.ftype || raw.ftype || ''
    const fundType =
      raw.fundType || classifyFundType(ftype, name)

    const patch = {code: raw.code}
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

    rows.push(
      Object.assign({}, raw, {
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
        sectorItems,
        fundType,
        ftype,
        shares,
        type: raw.type,
        code: raw.code,
        time: q.time || null,
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

  const list = rows.sort((a, b) => (b.amount || 0) - (a.amount || 0))
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
    list,
    groups: splitHoldingsByRealtime(list),
    persistPatches,
  }
}

/** 对一组持仓重算组内权重与汇总 */
function summarizeHoldGroup(rows) {
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
    .map((row) =>
      Object.assign({}, row, {
        weight:
          totalAmountNum > 0
            ? round2(new Decimal(row.amount || 0).div(totalAmount).mul(100))
            : 0,
      }),
    )
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
function splitHoldingsByRealtime(list) {
  const live = []
  const delayed = []
  for (const row of list || []) {
    if (isRealtimeHolding(row)) live.push(row)
    else delayed.push(row)
  }
  return {
    realtime: summarizeHoldGroup(live),
    delayed: summarizeHoldGroup(delayed),
  }
}

function mergeWatchlist(localFunds, quotes) {
  const quoteMap = new Map((quotes || []).map((q) => [q.code, q]))
  const persistPatches = []
  const list = (localFunds || []).map((f) => {
    const q = quoteMap.get(f.code) || {}
    const sectors = pickSectors(f.sectors, q.sectors)
    const sectorItems = normalizeSectorItems(q.sectorItems, sectors)
    const name = q.name || f.name
    const ftype = q.ftype || f.ftype || ''
    const fundType = f.fundType || classifyFundType(ftype, name)
    const patch = {code: f.code}
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
    return Object.assign({}, f, {
      name,
      percent: q.percent ?? q.estimateGrowth ?? q.dayGrowth ?? null,
      estimateGrowth: q.estimateGrowth,
      dayGrowth: q.dayGrowth,
      percentSource: q.percentSource || null,
      netValueDate: navDay || q.netValueDate || '',
      trend: q.trend || [],
      sectors,
      sectorItems,
      fundType,
      ftype,
      time: q.time || null,
      ...(() => {
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
          confirmedUpdated,
          discloseTimeText:
            delayed && confirmedUpdated
              ? formatOfficialDiscloseTime(badgeQuote.netValueDate, q.time)
              : '',
        }
      })(),
    })
  })
  return {list, persistPatches}
}

module.exports = {
  calcHoldings,
  mergeWatchlist,
}
