const api = require('../../utils/api')
const store = require('../../utils/portfolioStore')
const navTradingDays = require('../../utils/navTradingDays')
const tradeOps = require('../../utils/tradeOps')
const {
  SIP_FREQS,
  estimateBuyFee,
  sharesByFraction,
  formatShares,
  parseFeeRate,
  cycleKeyFromPicker,
  pickerStateFromCycle,
  sipSecondLabels,
} = require('../../utils/tradeMath')
const {todayDateStr, addCalendarDays, isDelayedNavFund} = require('../../utils/tradingCalendar')
const {formatPct, pctClass, formatAmount} = require('../../utils/format')
const {round2, toDecimal, sanitizeDecimalInput} = require('../../utils/money')
const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')
const Toast = require('@vant/weapp/toast/toast').default
const Dialog = require('@vant/weapp/dialog/dialog').default

const TABS = [
  {key: 'edit', label: '持仓信息'},
  {key: 'buy', label: '加仓'},
  {key: 'sell', label: '减仓'},
  {key: 'sip', label: '定投'},
]

const FRACTIONS = [
  {key: 'q', n: 1, d: 4, label: '1/4'},
  {key: 't', n: 1, d: 3, label: '1/3'},
  {key: 'h', n: 1, d: 2, label: '1/2'},
  {key: 'tt', n: 2, d: 3, label: '2/3'},
  {key: 'tq', n: 3, d: 4, label: '3/4'},
  {key: 'all', n: 1, d: 1, label: '清仓'},
]

const defaultPicker = pickerStateFromCycle('daily')

function sessionLabel(day, session) {
  if (!day) return '请选择'
  return `${day} ${session === 'after15' ? '下午3点后' : '下午3点前'}`
}

function sipStatusOf(plan) {
  if (!plan) return 'none'
  if (plan.paused) return 'paused'
  if (plan.active) return 'active'
  return 'none'
}

function submitLabel(tab, sipStatus, saving) {
  if (saving) return '保存中…'
  if (tab === 'buy') return '确认加仓'
  if (tab === 'sell') return '确认减仓'
  if (tab === 'sip') return sipStatus === 'none' ? '确认定投' : '管理定投'
  return '保存'
}

function moneyText(raw) {
  const n = Number(String(raw || '').trim())
  if (!Number.isFinite(n) || n <= 0) return ''
  return formatAmount(n)
}

function ledgerPatch(amount, cost) {
  const amountText = moneyText(amount)
  const costText = moneyText(cost)
  const a = Number(String(amount || '').trim())
  const c = Number(String(cost || '').trim())
  let yieldText = '--'
  let yieldClass = 'flat'
  let yieldFilled = false
  if (Number.isFinite(a) && a > 0 && Number.isFinite(c) && c > 0) {
    const pnl = round2(toDecimal(a).minus(c))
    const pct = round2(toDecimal(pnl).div(c).mul(100))
    yieldText = formatPct(pct)
    yieldClass = pctClass(pct)
    yieldFilled = true
  }
  return {
    amountText: amountText || '--',
    amountFilled: !!amountText,
    costText: costText || '未填',
    costFilled: !!costText,
    yieldText,
    yieldClass,
    yieldFilled,
  }
}

const TYPE_META = {
  buy: {label: '加仓', tone: 'buy'},
  sell: {label: '减仓', tone: 'sell'},
  sip: {label: '定投', tone: 'sip'},
  exit: {label: '清仓', tone: 'exit'},
}

function sessionText(session) {
  return session === 'after15' ? '下午3点后' : '下午3点前'
}

function mapOpsTrade(t) {
  const meta = TYPE_META[t.type] || {label: '交易', tone: 'buy'}
  const pending = !!t.pending
  const sharesText = pending ? '待确认' : `${formatShares(t.shares)}份`
  const side = t.type === 'sell' || t.type === 'exit' ? '卖出' : '买入'
  return {
    id: t.id,
    typeLabel: pending ? `${meta.label}·待确认` : meta.label,
    tone: pending ? 'pending' : meta.tone,
    amountText:
      pending && !(Number(t.amount) > 0) ? '待确认' : formatAmount(t.amount),
    metaText: pending
      ? `${t.date} · ${sessionText(t.session)} · 等${t.confirmDate || t.date}净值`
      : `${t.date} · ${side} ${sharesText}`,
  }
}

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

Page({
  data: {
    ...themeView,
    navTitle: '操作',
    tabs: TABS,
    tab: 'edit',
    fractions: FRACTIONS,
    sipCycleRange: defaultPicker.sipCycleRange,
    sipCycleValue: defaultPicker.sipCycleValue,
    sipCycleLabel: defaultPicker.sipCycleLabel,
    sipCycleKey: defaultPicker.sipCycleKey,
    code: '',
    name: '',
    isDelayed: false,
    maxShares: 0,
    maxSharesText: '0',
    amount: '',
    amountText: '--',
    amountFilled: false,
    cost: '',
    costText: '未填',
    costFilled: false,
    yieldText: '--',
    yieldClass: 'flat',
    yieldFilled: false,
    buyDate: '',
    today: todayDateStr(),
    buyDatePickerEnd: addCalendarDays(todayDateStr(), 14),
    buyAmount: '',
    buyFeeRate: '0',
    buyFeeText: '0.00',
    buyDateVal: todayDateStr(),
    buySession: 'before15',
    buyDateLabel: sessionLabel(todayDateStr(), 'before15'),
    sellShares: '',
    sellFeeRate: '0',
    sellFrac: '',
    sellDateVal: todayDateStr(),
    sellSession: 'before15',
    sellDateLabel: sessionLabel(todayDateStr(), 'before15'),
    sipAmount: '',
    sipFeeRate: '0',
    sipFeeText: '0',
    sipStatus: 'none',
    sipStatusText: '',
    submitLabel: '保存',
    opsTrades: [],
    saving: false,
    error: '',
  },

  _prefilledAmount: '',
  _dateSeq: 0,
  _leaving: false,

  onLoad(query) {
    const themePatch = getThemeViewState()
    syncNavigationBar(themePatch.theme)
    const code = query.code ? String(query.code).padStart(6, '0') : ''
    const tab = TABS.some((t) => t.key === query.tab) ? query.tab : 'edit'
    const today = todayDateStr()
    const sess = tradeOps.defaultSession()
    const local = code ? store.getFund(code) : null
    if (!local || local.type !== 'hold') {
      this.setData({
        ...themePatch,
        code,
        error: '未找到该持仓',
      })
      return
    }

    const amount =
      query.amount != null && String(query.amount) !== ''
        ? String(query.amount)
        : ''
    const cost = Number(local.cost) > 0 ? String(local.cost) : ''
    const existing = store.currentSipPlan(code)
    const picker = pickerStateFromCycle((existing && existing.cycle) || 'daily')
    const sipStatus = sipStatusOf(existing)
    this._prefilledAmount = amount
    this.setData({
      ...themePatch,
      tab,
      code,
      name: local.name || '',
      amount,
      cost,
      ...ledgerPatch(amount, cost),
      buyDate: local.buyDate || '',
      isDelayed: isDelayedNavFund(local),
      maxShares: Number(local.shares) || 0,
      maxSharesText: formatShares(local.shares || 0),
      buyDateVal: today,
      buySession: sess,
      buyDateLabel: sessionLabel(today, sess),
      sellDateVal: today,
      sellSession: sess,
      sellDateLabel: sessionLabel(today, sess),
      sipAmount: existing && existing.amount > 0 ? String(existing.amount) : '',
      sipFeeRate:
        existing && existing.feeRate != null ? String(existing.feeRate) : '0',
      sipStatus,
      sipStatusText: sipStatus === 'paused' ? '已暂停' : sipStatus === 'active' ? '定投中' : '',
      submitLabel: submitLabel(tab, sipStatus, false),
      ...picker,
    })
    if (existing && existing.amount > 0) {
      this.setData(this.sipFeePatch(String(existing.amount), existing.feeRate))
    }
    navTradingDays.prefetch()
    this.loadOpsTrades(code)
    this.refreshHoldAmount(code)
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
    if (this.data.code) {
      this.syncHolding()
      this.loadOpsTrades(this.data.code)
    }
  },

  syncHolding() {
    const local = store.getFund(this.data.code)
    if (!local || local.type !== 'hold') return
    const existing = store.currentSipPlan(this.data.code)
    const sipStatus = sipStatusOf(existing)
    const patch = {
      name: local.name || this.data.name,
      maxShares: Number(local.shares) || 0,
      maxSharesText: formatShares(local.shares || 0),
      isDelayed: isDelayedNavFund(local) || this.data.isDelayed,
      sipStatus,
      sipStatusText: sipStatus === 'paused' ? '已暂停' : sipStatus === 'active' ? '定投中' : '',
      submitLabel: submitLabel(this.data.tab, sipStatus, this.data.saving),
    }
    if (Number(local.cost) > 0 && !this.data.cost) patch.cost = String(local.cost)
    if (local.buyDate && !this.data.buyDate) patch.buyDate = local.buyDate
    this.setData(
      Object.assign(
        patch,
        ledgerPatch(
          this.data.amount,
          patch.cost != null ? patch.cost : this.data.cost,
        ),
      ),
    )
  },

  loadOpsTrades(code) {
    const key = String(code || this.data.code || '').padStart(6, '0')
    if (!/^\d{6}$/.test(key)) {
      this.setData({opsTrades: []})
      return
    }
    this.setData({
      opsTrades: store.listTrades({code: key}).map(mapOpsTrade),
    })
  },

  async refreshHoldAmount(code) {
    try {
      const holdings = await api.fetchHoldings()
      const row = (holdings.list || []).find((f) => f.code === code)
      if (!row) {
        this.loadOpsTrades(code)
        return
      }
      const patch = {}
      const currentAmount = this.data.amount
      if (
        row.amount != null &&
        (!currentAmount || currentAmount === this._prefilledAmount)
      ) {
        patch.amount = String(row.amount)
        this._prefilledAmount = patch.amount
      }
      if (row.name && row.name !== this.data.name) patch.name = row.name
      if (!this.data.cost && Number(row.cost) > 0) patch.cost = String(row.cost)
      patch.maxShares = Number(row.shares) || 0
      patch.maxSharesText = formatShares(row.shares || 0)
      if (isDelayedNavFund(row)) patch.isDelayed = true
      if (Object.keys(patch).length) {
        this.setData(
          Object.assign(
            patch,
            ledgerPatch(
              patch.amount != null ? patch.amount : this.data.amount,
              patch.cost != null ? patch.cost : this.data.cost,
            ),
          ),
        )
      }
      this.loadOpsTrades(code)
    } catch (e) {
      // ignore
    }
  },

  onTab(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.tab) return
    this.setData({
      tab: key,
      error: '',
      submitLabel: submitLabel(key, this.data.sipStatus, false),
    })
  },

  onBuyAmountInput(e) {
    const buyAmount = sanitizeDecimalInput(this.inputValue(e), 2)
    this.setData(Object.assign({buyAmount}, this.buyFeePatch(buyAmount, this.data.buyFeeRate)))
    return buyAmount
  },

  onBuyFeeRateInput(e) {
    const buyFeeRate = sanitizeDecimalInput(this.inputValue(e), 4)
    this.setData(Object.assign({buyFeeRate}, this.buyFeePatch(this.data.buyAmount, buyFeeRate)))
    return buyFeeRate
  },

  buyFeePatch(amount, rate) {
    const est = estimateBuyFee(Number(amount) || 0, parseFeeRate(rate))
    return {buyFeeText: est.fee.toFixed(2)}
  },

  onSellSharesInput(e) {
    const sellShares = sanitizeDecimalInput(this.inputValue(e), 4)
    this.setData({sellShares, sellFrac: ''})
    return sellShares
  },

  onSellFeeRateInput(e) {
    const sellFeeRate = sanitizeDecimalInput(this.inputValue(e), 4)
    this.setData({sellFeeRate})
    return sellFeeRate
  },

  onSellFrac(e) {
    if (!(this.data.maxShares > 0)) {
      Toast('没有可卖份额')
      return
    }
    const key = e.currentTarget.dataset.key
    const item = FRACTIONS.find((f) => f.key === key)
    if (!item) return
    const shares = sharesByFraction(this.data.maxShares, item.n, item.d)
    this.setData({
      sellFrac: key,
      sellShares: shares > 0 ? formatShares(shares) : '',
    })
  },

  onSipAmountInput(e) {
    const sipAmount = sanitizeDecimalInput(this.inputValue(e), 2)
    this.setData(Object.assign({sipAmount}, this.sipFeePatch(sipAmount, this.data.sipFeeRate)))
    return sipAmount
  },

  onSipFeeRateInput(e) {
    const sipFeeRate = sanitizeDecimalInput(this.inputValue(e), 4)
    this.setData(Object.assign({sipFeeRate}, this.sipFeePatch(this.data.sipAmount, sipFeeRate)))
    return sipFeeRate
  },

  sipFeePatch(amount, rate) {
    const est = estimateBuyFee(Number(amount) || 0, parseFeeRate(rate))
    const whole = Math.abs(est.fee - Math.round(est.fee)) < 1e-9
    return {sipFeeText: whole ? String(Math.round(est.fee)) : est.fee.toFixed(2)}
  },

  onSipCycleColumnChange(e) {
    const column = Number(e.detail.column)
    const idx = Number(e.detail.value)
    const value = (this.data.sipCycleValue || [0, 0]).slice()
    value[column] = idx
    if (column !== 0) {
      this.setData({sipCycleValue: value})
      return
    }
    const freq = SIP_FREQS[idx] || SIP_FREQS[0]
    const seconds = sipSecondLabels(freq.key)
    if (value[1] >= seconds.length) value[1] = 0
    this.setData({
      sipCycleRange: [this.data.sipCycleRange[0], seconds],
      sipCycleValue: value,
    })
  },

  onSipCycleChange(e) {
    const pair = e.detail.value || [0, 0]
    const freqIdx = Number(pair[0]) || 0
    const secondIdx = Number(pair[1]) || 0
    const key = cycleKeyFromPicker(freqIdx, secondIdx)
    this.setData(pickerStateFromCycle(key))
  },

  inputValue(e) {
    const raw = typeof e.detail === 'object' && e.detail ? e.detail.value : e.detail
    return raw == null ? '' : String(raw)
  },

  async onBuyDateChange(e) {
    await this.pickTradeDate('buy', e)
  },

  async onSellDateChange(e) {
    await this.pickTradeDate('sell', e)
  },

  onSessionTap(e) {
    const kind = e.currentTarget.dataset.kind
    const session = e.currentTarget.dataset.session === 'after15' ? 'after15' : 'before15'
    if (kind === 'buy') {
      this.setData({
        buySession: session,
        buyDateLabel: sessionLabel(this.data.buyDateVal, session),
      })
      return
    }
    this.setData({
      sellSession: session,
      sellDateLabel: sessionLabel(this.data.sellDateVal, session),
    })
  },

  async pickTradeDate(kind, e) {
    const day = String(this.inputValue(e) || '').slice(0, 10)
    const seq = ++this._dateSeq
    if (!day) return
    try {
      const fund = store.getFund(this.data.code)
      const result =
        kind === 'sell'
          ? await tradeOps.checkSellDate(day, fund)
          : await tradeOps.checkTradeDate(day, this.data.code)
      if (seq !== this._dateSeq) return
      if (!result.ok) {
        Toast(String(result.toast || '').replace('，已清空', ''))
        return
      }
      const today = todayDateStr()
      const session = day === today ? tradeOps.defaultSession() : 'before15'
      if (kind === 'buy') {
        this.setData({
          buyDateVal: day,
          buySession: session,
          buyDateLabel: sessionLabel(day, session),
        })
      } else {
        this.setData({
          sellDateVal: day,
          sellSession: session,
          sellDateLabel: sessionLabel(day, session),
        })
      }
    } catch (err) {
      if (seq !== this._dateSeq) return
      Toast((err && err.message) || '交易日校验失败')
    }
  },

  async onEditBuyDateChange(e) {
    const day = String(this.inputValue(e) || '').slice(0, 10)
    const seq = ++this._dateSeq
    if (!day) {
      this.setData({buyDate: ''})
      return
    }
    try {
      const result = await tradeOps.checkTradeDate(day, this.data.code)
      if (seq !== this._dateSeq) return
      if (!result.ok) {
        this.setData({buyDate: ''})
        Toast(result.toast)
        return
      }
      this.setData({buyDate: day})
    } catch (err) {
      if (seq !== this._dateSeq) return
      this.setData({buyDate: ''})
      Toast((err && err.message) || '交易日校验失败')
    }
  },

  onClearBuyDate() {
    this.setData({buyDate: ''})
  },

  leaveAfterSuccess(title) {
    this._leaving = true
    Toast.success(title)
    setTimeout(() => wx.navigateBack(), 400)
  },

  confirmIrreversible(tab) {
    const delayed = this.data.isDelayed
      ? 'QDII 按申请日净值成交，该净值通常次日晚公布，公布前显示待确认，不会用旧净值落账。'
      : ''
    const messages = {
      buy: `加仓确认后无法撤销！下午3点前按当日净值，3点后按下一交易日净值。${delayed}`,
      sell: `减仓确认后无法撤销！下午3点前按当日净值，3点后按下一交易日净值。${delayed}`,
      sip: `定投确认后无法撤销单笔扣款。按扣款日 15:00 前规则等待当日净值公布后落账。${delayed}`,
    }
    return Dialog.confirm({
      title: '确认交易',
      message: messages[tab] || '确认后无法撤销。',
      confirmButtonText: '确认',
      cancelButtonText: '再看看',
    })
      .then(() => true)
      .catch(() => false)
  },

  async onSubmit() {
    if (this.data.saving || this._leaving) return
    if (!this.data.code) {
      this.setData({error: '未找到该持仓'})
      return
    }
    const tab = this.data.tab
    if (tab === 'sip' && this.data.sipStatus !== 'none') {
      this.openSipManage()
      return
    }
    if (tab === 'buy' || tab === 'sell' || tab === 'sip') {
      const ok = await this.confirmIrreversible(tab)
      if (!ok) return
    }
    this.setData({saving: true, error: '', submitLabel: submitLabel(tab, this.data.sipStatus, true)})
    try {
      if (tab === 'edit') await this.saveEdit()
      else if (tab === 'buy') await this.saveBuy()
      else if (tab === 'sell') await this.saveSell()
      else await this.saveSip()
    } catch (e) {
      this.setData({
        error: (e && e.message) || '保存失败',
        saving: false,
        submitLabel: submitLabel(tab, this.data.sipStatus, false),
      })
    }
  },

  openSipManage() {
    const paused = this.data.sipStatus === 'paused'
    const items = ['修改定投', paused ? '恢复定投' : '暂停定投', '终止定投']
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const idx = res.tapIndex
        if (idx === 0) {
          this.confirmThenRun(
            () =>
              tradeOps.saveSipPlan({
                code: this.data.code,
                amount: this.data.sipAmount,
                feeRate: this.data.sipFeeRate,
                cycle: this.data.sipCycleKey,
              }),
            '定投已保存',
          )
        } else if (idx === 1) {
          if (paused) this.runSipAction(() => tradeOps.resumeSip(this.data.code), '已恢复定投')
          else this.confirmSipPause()
        } else if (idx === 2) this.confirmSipStop()
      },
    })
  },

  confirmThenRun(fn, successText) {
    this.confirmIrreversible('sip').then((ok) => {
      if (!ok) return
      this.runSipAction(fn, successText)
    })
  },

  confirmSipPause() {
    Dialog.confirm({
      title: '暂停定投',
      message: '暂停后不再扣款，已产生的交易记录会保留，可随时恢复。',
      confirmButtonText: '暂停',
    })
      .then(() => this.runSipAction(() => tradeOps.pauseSip(this.data.code), '已暂停定投'))
      .catch(() => {})
  },

  confirmSipStop() {
    Dialog.confirm({
      title: '终止定投',
      message: '终止后不再扣款，已产生的交易记录和买卖点会保留。',
      confirmButtonText: '终止',
      confirmButtonColor: '#d7263d',
    })
      .then(() => this.runSipAction(() => tradeOps.stopSip(this.data.code), '已终止定投'))
      .catch(() => {})
  },

  async runSipAction(fn, successText) {
    if (this.data.saving || this._leaving) return
    this.setData({
      saving: true,
      error: '',
      submitLabel: submitLabel('sip', this.data.sipStatus, true),
    })
    try {
      await fn()
      this.leaveAfterSuccess(successText)
    } catch (e) {
      this.setData({
        error: (e && e.message) || '操作失败',
        saving: false,
        submitLabel: submitLabel('sip', this.data.sipStatus, false),
      })
    }
  },

  async saveEdit() {
    const code = this.data.code
    if (this.data.buyDate) {
      const result = await tradeOps.checkTradeDate(this.data.buyDate, code)
      if (!result.ok) {
        this.setData({
          buyDate: '',
          saving: false,
          submitLabel: submitLabel('edit', this.data.sipStatus, false),
        })
        Toast(result.toast)
        return
      }
    }
    await api.updateFund(code, {
      buyDate: this.data.buyDate || '',
    })
    this.leaveAfterSuccess('已保存')
  },

  async saveBuy() {
    const sold = await tradeOps.executeBuy({
      code: this.data.code,
      amount: this.data.buyAmount,
      feeRate: this.data.buyFeeRate,
      date: this.data.buyDateVal,
      session: this.data.buySession,
    })
    this.leaveAfterSuccess(sold && sold.pending ? '已提交，待确认' : '已加仓')
  },

  async saveSell() {
    const sold = await tradeOps.executeSell({
      code: this.data.code,
      shares: this.data.sellShares,
      feeRate: this.data.sellFeeRate,
      date: this.data.sellDateVal,
      session: this.data.sellSession,
    })
    if (sold && sold.pending) this.leaveAfterSuccess('已提交，待确认')
    else this.leaveAfterSuccess(sold && sold.cleared ? '已清仓' : '已减仓')
  },

  async saveSip() {
    await tradeOps.saveSipPlan({
      code: this.data.code,
      amount: this.data.sipAmount,
      feeRate: this.data.sipFeeRate,
      cycle: this.data.sipCycleKey,
    })
    this.leaveAfterSuccess('定投已保存')
  },
})
