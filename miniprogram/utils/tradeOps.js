const store = require('./portfolioStore')
const navTradingDays = require('./navTradingDays')
const {
  applyBuyToHolding,
  applySellToHolding,
  parsePayAmount,
  parseSharesInput,
  parseFeeRate,
  sipScheduleDates,
  getSipCycle,
  followingCycleDate,
  nextCycleDate,
  normalizeSipCycle,
} = require('./tradeMath')
const {todayDateStr, addCalendarDays, isDelayedNavFund} = require('./tradingCalendar')

function getApi() {
  return require('./api')
}

function padCode(code) {
  return String(code || '').padStart(6, '0')
}

function defaultSession(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes >= 15 * 60 ? 'after15' : 'before15'
}

function sessionKey(raw) {
  return raw === 'after15' ? 'after15' : 'before15'
}

async function resolveConfirmDate(tradeDate, session) {
  const day = String(tradeDate || '').slice(0, 10)
  if (sessionKey(session) === 'after15') {
    const next = await navTradingDays.getNextTradingDay(day)
    return next || day
  }
  return day
}

function findHistNav(points, date) {
  const want = String(date || '').slice(0, 10)
  const list = points || []
  for (let i = 0; i < list.length; i++) {
    const d = String((list[i] && list[i].date) || '').slice(0, 10)
    if (d === want && list[i].netValue > 0) return Number(list[i].netValue)
  }
  return 0
}

function findHistNavOnOrAfter(points, date, maxLag) {
  const want = String(date || '').slice(0, 10)
  const cap = addCalendarDays(want, maxLag)
  let best = null
  const list = points || []
  for (let i = 0; i < list.length; i++) {
    const d = String((list[i] && list[i].date) || '').slice(0, 10)
    const nav = Number(list[i] && list[i].netValue)
    if (!d || !(nav > 0) || d < want || d > cap) continue
    if (!best || d < best.date) best = {nav, date: d}
  }
  return best
}

async function loadHistoryPoints(code, confirmDate) {
  const api = getApi()
  const key = padCode(code)
  const day = String(confirmDate || '').slice(0, 10)
  const today = todayDateStr()
  const ranges = day < addCalendarDays(today, -300) ? ['3y', 'since'] : ['1y', '3y']
  for (let i = 0; i < ranges.length; i++) {
    try {
      const hist = await api.fetchFundHistory(key, ranges[i])
      if (hist && hist.points && hist.points.length) return hist.points
    } catch (e) {
      // 换更长周期再试
    }
  }
  return []
}

/**
 * 只认已公布的申请日净值，绝不拿更早净值顶替。
 * A 股 / QDII 都是 15:00 切点：3 点前用当天，3 点后用下一交易日。
 * QDII 同一申请日净值通常 T+1 晚才披露，未披露前保持待确认；
 * 不把份额确认日（常见 T+2）当成成交净值日。
 */
async function resolvePublishedNav(code, confirmDate, fundMeta) {
  const api = getApi()
  const key = padCode(code)
  const day = String(confirmDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const quote = await api.fetchFundQuote(key)
  const latestDate = String((quote && quote.netValueDate) || '').slice(0, 10)
  const latestNav = quote && quote.netValue != null ? Number(quote.netValue) : 0
  if (latestDate === day && latestNav > 0) {
    return {nav: latestNav, navDate: latestDate}
  }

  const points = await loadHistoryPoints(key, day)
  const exact = findHistNav(points, day)
  if (exact > 0) return {nav: exact, navDate: day}

  const delayed = isDelayedNavFund({
    fundType: fundMeta && fundMeta.fundType,
    ftype: fundMeta && fundMeta.ftype,
    name: (fundMeta && fundMeta.name) || (quote && quote.name),
    delayedDisclosure: quote && quote.delayedDisclosure,
  })
  // 最新披露日还没走到申请日：继续等，不用旧净值。
  if (delayed && latestDate && latestDate < day) return null
  // 申请日可能因境外休市无净值：仅在序列已经走过该日后，取其后最近一条。
  if (delayed && latestDate && latestDate > day) {
    const hit = findHistNavOnOrAfter(points, day, 7)
    if (hit) return {nav: hit.nav, navDate: hit.date}
  }
  return null
}

async function checkTradeDate(day, code) {
  if (!/^\d{6}$/.test(padCode(code))) {
    return {ok: false, toast: '请先填写基金代码'}
  }
  const trading = await navTradingDays.isBuyTradingDay(day)
  if (!trading) return {ok: false, toast: '所选日期不是交易日，已清空'}
  const max = await navTradingDays.getMaxBuyDate()
  if (max && day > max) {
    return {ok: false, toast: '不能晚于下一个交易日'}
  }
  return {ok: true}
}

function earliestHoldDate(fund) {
  let min = fund && fund.buyDate ? String(fund.buyDate).slice(0, 10) : ''
  const trades = store.listTrades({code: fund && fund.code}).filter(
    (t) => t.type === 'buy' || t.type === 'sip',
  )
  for (let i = 0; i < trades.length; i++) {
    const d = String(trades[i].date || '').slice(0, 10)
    if (d && (!min || d < min)) min = d
  }
  return min
}

async function checkSellDate(day, fund) {
  const base = await checkTradeDate(day, fund && fund.code)
  if (!base.ok) return base
  const min = earliestHoldDate(fund)
  if (min && day < min) {
    return {ok: false, toast: '卖出日期不能早于买入日期'}
  }
  return {ok: true}
}

async function resolveNextSipDebitDate(cycleKey, fromDate) {
  const cycle = normalizeSipCycle(cycleKey)
  const from = String(fromDate || addCalendarDays(todayDateStr(), 1)).slice(0, 10)
  const cal = nextCycleDate(from, cycle)
  if (!cal) throw new Error('无法计算首次扣款日期')
  const trading = await navTradingDays.isTradingDay(cal)
  if (trading) return {scheduleDate: cal, debitDate: cal}
  const spec = getSipCycle(cycle)
  const next = await navTradingDays.getNextTradingDay(cal)
  if (!next) throw new Error('无法计算首次扣款日期')
  if (spec.kind === 'daily') return {scheduleDate: next, debitDate: next}
  return {scheduleDate: cal, debitDate: next}
}

async function checkSipDate(day) {
  const date = String(day || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {ok: false, toast: '无法计算首次扣款日期'}
  }
  if (date < todayDateStr()) {
    return {ok: false, toast: '首次扣款日期不能早于今天'}
  }
  const trading = await navTradingDays.isTradingDay(date)
  if (!trading) return {ok: false, toast: '首次扣款日期不是交易日'}
  return {ok: true}
}

function requireHold(code) {
  const fund = store.getFund(padCode(code))
  if (!fund || fund.type !== 'hold') throw new Error('请先添加持仓')
  return fund
}

function persistBuyDate(fund, tradeDate) {
  if (fund && fund.buyDate) return {}
  return {buyDate: tradeDate}
}

function finishCleared(fund, cleared) {
  if (!cleared) return
  store.deactivateSipPlans(fund.code)
}

async function executeBuy({code, amount, feeRate, date, session}) {
  const fund = requireHold(code)
  const pay = parsePayAmount(amount)
  if (!(pay > 0)) throw new Error('请输入买入金额')
  const day = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('请选择买入时间')
  const sess = sessionKey(session)
  const check = await checkTradeDate(day, fund.code)
  if (!check.ok) throw new Error(check.toast)
  const confirmDate = await resolveConfirmDate(day, sess)
  const published = await resolvePublishedNav(fund.code, confirmDate, fund)
  if (!published) {
    store.applyFundTrade(fund.code, null, {
      type: 'buy',
      code: fund.code,
      name: fund.name,
      date: day,
      session: sess,
      confirmDate,
      nav: 0,
      amount: pay,
      shares: 0,
      fee: 0,
      feeRate: parseFeeRate(feeRate),
      pending: true,
    })
    return {pending: true, pay, confirmDate}
  }
  const next = applyBuyToHolding(fund, {
    payAmount: pay,
    feeRate: parseFeeRate(feeRate),
    nav: published.nav,
  })
  store.applyFundTrade(
    fund.code,
    Object.assign({shares: next.shares, cost: next.cost}, persistBuyDate(fund, day)),
    {
      type: 'buy',
      code: fund.code,
      name: fund.name,
      date: day,
      session: sess,
      confirmDate,
      nav: published.nav,
      amount: next.pay,
      shares: next.addShares,
      fee: next.fee,
      feeRate: parseFeeRate(feeRate),
      pending: false,
    },
  )
  return Object.assign(next, {pending: false, confirmDate})
}

async function executeSell({code, shares, feeRate, date, session}) {
  const fund = requireHold(code)
  const sellShares = parseSharesInput(shares)
  if (!(sellShares > 0)) throw new Error('请输入卖出份额')
  const day = String(date || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('请选择卖出时间')
  const sess = sessionKey(session)
  const check = await checkSellDate(day, fund)
  if (!check.ok) throw new Error(check.toast)
  const confirmDate = await resolveConfirmDate(day, sess)
  const willClear = sellShares >= Number(fund.shares) || sellShares - Number(fund.shares) > -1e-8
  const published = await resolvePublishedNav(fund.code, confirmDate, fund)
  if (!published) {
    store.applyFundTrade(fund.code, null, {
      type: willClear ? 'exit' : 'sell',
      code: fund.code,
      name: fund.name,
      date: day,
      session: sess,
      confirmDate,
      nav: 0,
      amount: 0,
      shares: sellShares,
      fee: 0,
      feeRate: parseFeeRate(feeRate),
      pending: true,
    })
    return {pending: true, sellShares, confirmDate, cleared: false}
  }
  const next = applySellToHolding(fund, {
    sellShares,
    feeRate: parseFeeRate(feeRate),
    nav: published.nav,
  })
  const cleared = !(next.shares > 0)
  store.applyFundTrade(
    fund.code,
    cleared
      ? {shares: 0, cost: 0, type: 'watch'}
      : {shares: next.shares, cost: next.cost},
    {
      type: cleared ? 'exit' : 'sell',
      code: fund.code,
      name: fund.name,
      date: day,
      session: sess,
      confirmDate,
      nav: published.nav,
      amount: next.gross,
      shares: next.sellShares,
      fee: next.fee,
      feeRate: parseFeeRate(feeRate),
      pending: false,
    },
  )
  finishCleared(fund, cleared)
  return Object.assign(next, {pending: false, cleared, confirmDate})
}

async function settleOneTrade(trade) {
  if (!trade || !trade.pending) return null
  const fund = store.getFund(trade.code)
  if (!fund || fund.type !== 'hold') return null
  const published = await resolvePublishedNav(trade.code, trade.confirmDate || trade.date, fund)
  if (!published) return null
  if (trade.type === 'buy' || trade.type === 'sip') {
    const pay = parsePayAmount(trade.amount)
    if (!(pay > 0)) return null
    const next = applyBuyToHolding(fund, {
      payAmount: pay,
      feeRate: trade.feeRate,
      nav: published.nav,
    })
    store.patchTrade(
      trade.id,
      {
        pending: false,
        nav: published.nav,
        shares: next.addShares,
        fee: next.fee,
        amount: next.pay,
        confirmDate: published.navDate || trade.confirmDate,
      },
      Object.assign({shares: next.shares, cost: next.cost}, persistBuyDate(fund, trade.date)),
    )
    return next
  }
  if (trade.type === 'sell' || trade.type === 'exit') {
    const next = applySellToHolding(fund, {
      sellShares: trade.shares,
      feeRate: trade.feeRate,
      nav: published.nav,
    })
    const cleared = !(next.shares > 0)
    store.patchTrade(
      trade.id,
      {
        pending: false,
        type: cleared ? 'exit' : 'sell',
        nav: published.nav,
        amount: next.gross,
        shares: next.sellShares,
        fee: next.fee,
        confirmDate: published.navDate || trade.confirmDate,
      },
      cleared
        ? {shares: 0, cost: 0, type: 'watch'}
        : {shares: next.shares, cost: next.cost},
    )
    finishCleared(fund, cleared)
    return next
  }
  return null
}

let settleInflight = null

async function settlePendingTrades() {
  if (settleInflight) return settleInflight
  settleInflight = (async () => {
    const pending = store.listTrades().filter((t) => t.pending)
    const settled = []
    for (let i = 0; i < pending.length; i++) {
      try {
        const row = await settleOneTrade(pending[i])
        if (row) settled.push(row)
      } catch (e) {
        // 净值仍未出或持仓已不在，下次再试
      }
    }
    return settled
  })().finally(() => {
    settleInflight = null
  })
  return settleInflight
}

async function executeSipDebit(plan, settleDate, scheduleDate) {
  const fund = store.getFund(plan.code)
  if (!fund || fund.type !== 'hold') return null
  const sched = String(scheduleDate || settleDate || '').slice(0, 10)
  const settle = String(settleDate || '').slice(0, 10)
  if (!settle) return null
  const existed = store.listTrades({
    code: plan.code,
    sipId: plan.id,
  })
  for (let i = 0; i < existed.length; i++) {
    const t = existed[i]
    if (t.date === settle || (sched && t.scheduleDate === sched)) return null
  }
  const published = await resolvePublishedNav(plan.code, settle, fund)
  if (!published) {
    store.applyFundTrade(plan.code, null, {
      type: 'sip',
      code: plan.code,
      name: fund.name || plan.name,
      date: settle,
      session: 'before15',
      confirmDate: settle,
      nav: 0,
      amount: plan.amount,
      shares: 0,
      fee: 0,
      feeRate: plan.feeRate,
      cycle: plan.cycle,
      sipId: plan.id,
      scheduleDate: sched || settle,
      pending: true,
    })
    return {pending: true, confirmDate: settle}
  }
  const next = applyBuyToHolding(fund, {
    payAmount: plan.amount,
    feeRate: plan.feeRate,
    nav: published.nav,
  })
  store.applyFundTrade(
    plan.code,
    Object.assign({shares: next.shares, cost: next.cost}, persistBuyDate(fund, settle)),
    {
      type: 'sip',
      code: plan.code,
      name: fund.name || plan.name,
      date: settle,
      session: 'before15',
      confirmDate: settle,
      nav: published.nav,
      amount: next.pay,
      shares: next.addShares,
      fee: next.fee,
      feeRate: plan.feeRate,
      cycle: plan.cycle,
      sipId: plan.id,
      scheduleDate: sched || settle,
      pending: false,
    },
  )
  return next
}

async function applyDueSips(code) {
  const today = todayDateStr()
  const plans = store.listSipPlans(code).filter((p) => p.active)
  const applied = []
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i]
    const spec = getSipCycle(plan.cycle)
    const trades = store.listTrades({
      code: plan.code,
      sipId: plan.id,
    })
    let lastSchedule = ''
    for (let t = 0; t < trades.length; t++) {
      const s = trades[t].scheduleDate || trades[t].date
      if (s > lastSchedule) lastSchedule = s
    }
    const start = lastSchedule
      ? followingCycleDate(lastSchedule, plan.cycle)
      : plan.firstDate
    if (!start || start > today) continue
    const calendarDates = sipScheduleDates(start, plan.cycle, today)
    const seenSettle = Object.create(null)
    for (let j = 0; j < calendarDates.length; j++) {
      const cal = calendarDates[j]
      let settle = cal
      try {
        const trading = await navTradingDays.isTradingDay(cal)
        if (!trading) {
          if (spec.kind === 'daily') continue
          settle = await navTradingDays.getNextTradingDay(cal)
        }
      } catch (e) {
        continue
      }
      if (!settle || settle > today) continue
      if (seenSettle[settle]) continue
      seenSettle[settle] = true
      try {
        const row = await executeSipDebit(plan, settle, cal)
        if (row) applied.push(row)
      } catch (e) {
        // 净值未出时跳过这一期，下次打开再记
      }
    }
  }
  return applied
}

async function saveSipPlan({code, amount, feeRate, cycle}) {
  const fund = requireHold(code)
  const pay = parsePayAmount(amount)
  if (!(pay > 0)) throw new Error('请输入定投金额')
  const cycleKey = normalizeSipCycle(cycle)
  const existing = store.currentSipPlan(fund.code)
  const cycleChanged = !!(existing && existing.cycle !== cycleKey)
  const keepPaused = !!(existing && existing.paused && !cycleChanged)
  const resolved = await resolveNextSipDebitDate(cycleKey)
  const plan = store.upsertSipPlan(
    {
      id: cycleChanged ? undefined : existing && existing.id,
      code: fund.code,
      name: fund.name,
      amount: pay,
      feeRate: parseFeeRate(feeRate),
      cycle: cycleKey,
      firstDate: cycleChanged || !existing ? resolved.scheduleDate : existing.firstDate,
      active: !keepPaused,
      paused: keepPaused,
    },
    {fresh: cycleChanged || !existing},
  )
  if (!keepPaused) await applyDueSips(fund.code)
  return plan
}

async function pauseSip(code) {
  const plan = store.pauseSipPlan(code)
  if (!plan) throw new Error('没有进行中的定投')
  return plan
}

async function resumeSip(code) {
  const plan = store.resumeSipPlan(code)
  if (!plan) throw new Error('没有可恢复的定投')
  await applyDueSips(code)
  return plan
}

function stopSip(code) {
  store.stopSipPlan(code)
}

module.exports = {
  defaultSession,
  sessionKey,
  resolveConfirmDate,
  resolvePublishedNav,
  checkTradeDate,
  checkSellDate,
  checkSipDate,
  resolveNextSipDebitDate,
  executeBuy,
  executeSell,
  saveSipPlan,
  pauseSip,
  resumeSip,
  stopSip,
  applyDueSips,
  settlePendingTrades,
}
