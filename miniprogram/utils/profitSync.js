const api = require('./api')
const store = require('./portfolioStore')
const {round2, pnlFromShares, amountFromShares} = require('./money')
const {todayDateStr, addCalendarDays} = require('./tradingCalendar')

let inflight = null

function indexSeries(points, valueKey) {
  const sorted = (points || [])
    .map((p) => ({
      date: String((p && p.date) || '').slice(0, 10),
      value: Number(p && (p[valueKey] != null ? p[valueKey] : p.netValue)),
    }))
    .filter((p) => p.date && p.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const map = new Map()
  for (let i = 0; i < sorted.length; i++) {
    map.set(sorted[i].date, {
      value: sorted[i].value,
      prev: i > 0 ? sorted[i - 1].value : null,
    })
  }
  return map
}

function missingWeekdays(fromDate, endExclusive, liveDates) {
  const out = []
  const [y, m, d] = String(fromDate).split('-').map(Number)
  if (!y || !m || !d) return out
  const cur = new Date(y, m - 1, d)
  while (todayDateStr(cur) < endExclusive) {
    const ds = todayDateStr(cur)
    const wd = cur.getDay()
    if (wd !== 0 && wd !== 6 && !liveDates.has(ds)) out.push(ds)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function lastLiveDate(rows) {
  let last = ''
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].date > last) last = rows[i].date
  }
  return last
}

async function runBackfill() {
  const since = store.ensureProfitSince()
  const holds = store.listFunds('hold').filter((f) => Number(f.shares) > 0)
  const settings = store.getSettings()
  const gold = store.loadConfig().gold || {}
  const goldHold = settings.showGold !== false ? Number(gold.holding) || 0 : 0
  if (!holds.length && !(goldHold > 0)) return store.listProfitLog()

  const today = todayDateStr()
  const live = (store.listProfitLog() || []).filter(
    (row) => row.source !== 'demo' && row.date >= since,
  )
  const liveDates = new Set(live.map((row) => row.date))
  let dates = []
  if (live.length) {
    const next = addCalendarDays(lastLiveDate(live), 1)
    const fromDate = next > since ? next : since
    if (fromDate && fromDate < today) {
      dates = missingWeekdays(fromDate, today, liveDates)
    }
  } else {
    // 上线后还没有记录：只记昨天，不倒填历史
    const yesterday = addCalendarDays(today, -1)
    if (yesterday >= since) {
      dates = missingWeekdays(yesterday, today, liveDates)
    }
  }
  if (!dates.length) return store.listProfitLog()

  const fundMaps = []
  const fundResults = await Promise.allSettled(
    holds.map((fund) =>
      api.fetchFundHistory(fund.code, '1m').then((data) => ({
        shares: Number(fund.shares) || 0,
        map: indexSeries((data && data.points) || [], 'netValue'),
      })),
    ),
  )
  for (const result of fundResults) {
    if (result.status === 'fulfilled' && result.value.shares > 0) {
      fundMaps.push(result.value)
    }
  }

  let goldMap = null
  if (goldHold > 0) {
    try {
      const hist = await api.fetchGoldHistory('1m')
      goldMap = indexSeries((hist && hist.points) || [], 'close')
    } catch (e) {
      goldMap = null
    }
  }

  const rows = []
  for (const date of dates) {
    let pnl = 0
    let amount = 0
    let used = false
    for (let i = 0; i < fundMaps.length; i++) {
      const shares = fundMaps[i].shares
      const cell = fundMaps[i].map.get(date)
      if (!cell || !(cell.value > 0) || !(cell.prev > 0)) continue
      pnl += pnlFromShares(shares, cell.value, cell.prev)
      amount += amountFromShares(shares, cell.prev)
      used = true
    }
    if (goldMap && goldHold > 0) {
      const cell = goldMap.get(date)
      if (cell && cell.value > 0 && cell.prev > 0) {
        pnl += round2(goldHold * (cell.value - cell.prev))
        amount += round2(goldHold * cell.prev)
        used = true
      }
    }
    if (!used) continue
    rows.push({
      date,
      pnl: round2(pnl),
      amount: round2(amount),
      source: 'live',
    })
  }
  if (rows.length) store.upsertProfitDays(rows)
  return store.listProfitLog()
}

function backfillProfitLog() {
  if (inflight) return inflight
  inflight = runBackfill().finally(() => {
    inflight = null
  })
  return inflight
}

module.exports = {
  backfillProfitLog,
}
