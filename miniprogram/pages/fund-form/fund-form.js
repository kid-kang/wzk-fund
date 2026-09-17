const api = require('../../utils/api')
const store = require('../../utils/portfolioStore')
const {sanitizeDecimalInput} = require('../../utils/money')
const {todayDateStr, addCalendarDays} = require('../../utils/tradingCalendar')
const navTradingDays = require('../../utils/navTradingDays')
const {getThemeViewState, syncNavigationBar, navigateTo} = require('../../utils/theme')
const Toast = require('@vant/weapp/toast/toast').default

function isFundCodeReady(code) {
  return /^\d{6}$/.test(String(code || ''))
}

function shouldSuggest(raw) {
  const q = String(raw || '').trim()
  if (!q) return false
  if (/^\d+$/.test(q)) return q.length >= 2 && q.length < 6
  return q.length >= 2
}

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

Page({
  data: {
    ...themeView,
    navTitle: '基金',
    mode: 'hold',
    code: '',
    codeInput: '',
    name: '',
    nameHint: '',
    codeLocked: false,
    codeReady: false,
    suggests: [],
    suggestOpen: false,
    suggesting: false,
    suggestEmpty: false,
    amount: '',
    cost: '',
    buyDate: '',
    today: todayDateStr(),
    buyDatePickerEnd: addCalendarDays(todayDateStr(), 14),
    resolving: false,
    saving: false,
    error: '',
  },

  _resolveTimer: null,
  _suggestTimer: null,
  _resolveSeq: 0,
  _suggestSeq: 0,
  _buyDateSeq: 0,
  _prefilledAmount: '',

  onLoad(query) {
    const themePatch = getThemeViewState()
    syncNavigationBar(themePatch.theme)
    const mode = query.mode === 'watch' ? 'watch' : 'hold'
    const code = query.code ? String(query.code).padStart(6, '0') : ''
    const name = query.name ? decodeURIComponent(query.name) : ''
    const navTitle =
      mode === 'watch' ? (code ? '编辑自选' : '添加自选') : '添加持仓'

    if (mode === 'hold' && code) {
      wx.redirectTo({
        url: `/pages/fund-ops/fund-ops?code=${code}`,
      })
      return
    }

    const patch = {
      ...themePatch,
      navTitle,
      mode,
      code,
      codeInput: code,
      name,
      codeLocked: !!code,
      codeReady: isFundCodeReady(code),
    }

    if (code && mode === 'hold') {
      const local = store.getFund(code)
      const amountFromQuery =
        query.amount != null && String(query.amount) !== ''
          ? String(query.amount)
          : ''
      const costFromQuery =
        query.cost != null && Number(query.cost) > 0 ? String(query.cost) : ''
      const costFromLocal =
        local && Number(local.cost) > 0 ? String(local.cost) : ''
      patch.amount = amountFromQuery
      patch.cost = costFromLocal || costFromQuery
      patch.buyDate = (local && local.buyDate) || ''
      if (!patch.name && local && local.name) patch.name = local.name
      this._prefilledAmount = patch.amount
    }

    this.setData(patch)
    if (mode === 'hold') this.prefetchTradingDays()

    if (code && mode === 'hold') {
      this.refreshHoldAmount(code)
      if (!patch.name) this.resolveName(code)
    } else if (code) {
      this.resolveName(code)
    }
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
  },

  prefetchTradingDays() {
    navTradingDays.prefetch()
  },

  onOpenAddGuide() {
    navigateTo('/pages/fund-qa/fund-qa?q=add-hold')
  },

  onUnload() {
    this._buyDateSeq += 1
    this._suggestSeq += 1
    if (this._resolveTimer) clearTimeout(this._resolveTimer)
    if (this._suggestTimer) clearTimeout(this._suggestTimer)
  },

  async refreshHoldAmount(code) {
    try {
      const holdings = await api.fetchHoldings()
      const row = (holdings.list || []).find((f) => f.code === code)
      if (!row) return
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
      if (!this.data.buyDate && row.buyDate) patch.buyDate = row.buyDate
      if (Object.keys(patch).length) this.setData(patch)
    } catch (e) {
      // 列表已带入金额；刷新失败不挡编辑
    }
  },

  clearSuggest() {
    if (this._suggestTimer) {
      clearTimeout(this._suggestTimer)
      this._suggestTimer = null
    }
    this._suggestSeq += 1
    this.setData({
      suggests: [],
      suggestOpen: false,
      suggesting: false,
      suggestEmpty: false,
    })
  },

  applyTypedCode(code) {
    const ready = isFundCodeReady(code)
    this.setData({
      code,
      codeInput: code,
      error: '',
      nameHint: '',
      codeReady: ready,
      buyDate: ready ? this.data.buyDate : '',
    })
    if (this.data.codeLocked) return
    if (this._resolveTimer) clearTimeout(this._resolveTimer)
    if (ready) {
      this._resolveTimer = setTimeout(() => this.resolveName(code), 280)
      if (this.data.mode === 'hold') this.warnIfHeld(code)
    } else {
      this.setData({name: '', resolving: false})
    }
  },

  onCodeInput(e) {
    const raw =
      typeof e.detail === 'object' && e.detail
        ? e.detail.value
        : e.detail
    if (this.data.codeLocked) {
      const code = String(raw || '').replace(/\D/g, '').slice(0, 6)
      return code
    }
    const query = String(raw || '').replace(/\s+/g, ' ').slice(0, 24)
    const compact = query.trim()
    if (/^\d{6}$/.test(compact)) {
      this.clearSuggest()
      this.applyTypedCode(compact)
      return compact
    }

    this.setData({
      codeInput: query,
      code: '',
      name: '',
      nameHint: '',
      error: '',
      codeReady: false,
      buyDate: '',
      resolving: false,
    })
    if (this._resolveTimer) clearTimeout(this._resolveTimer)
    if (this._suggestTimer) clearTimeout(this._suggestTimer)

    if (!shouldSuggest(compact)) {
      this.setData({
        suggests: [],
        suggestOpen: false,
        suggesting: false,
        suggestEmpty: false,
      })
      return query
    }

    this.setData({suggesting: true, suggestOpen: true, suggestEmpty: false})
    this._suggestTimer = setTimeout(() => this.runSuggest(compact), 280)
    return query
  },

  onCodeFocus() {
    if (this.data.suggests.length || this.data.suggesting) {
      this.setData({suggestOpen: true})
    }
  },

  onCodeConfirm() {
    const first = (this.data.suggests || [])[0]
    if (first) this.pickSuggest(first.code, first.name)
  },

  async runSuggest(query) {
    const seq = ++this._suggestSeq
    try {
      const rows = await api.suggestFunds(query)
      if (seq !== this._suggestSeq) return
      const suggests = Array.isArray(rows) ? rows : []
      this.setData({
        suggests,
        suggesting: false,
        suggestOpen: true,
        suggestEmpty: suggests.length === 0,
      })
    } catch (e) {
      if (seq !== this._suggestSeq) return
      this.setData({
        suggests: [],
        suggesting: false,
        suggestOpen: true,
        suggestEmpty: true,
        nameHint: (e && e.message) || '检索失败',
      })
    }
  },

  onPickSuggest(e) {
    const ds = e.currentTarget.dataset || {}
    this.pickSuggest(ds.code, ds.name)
  },

  pickSuggest(code, name) {
    const next = String(code || '').padStart(6, '0')
    if (!isFundCodeReady(next)) return
    this.clearSuggest()
    this.setData({
      code: next,
      codeInput: next,
      name: String(name || '').trim(),
      nameHint: '',
      error: '',
      codeReady: true,
      resolving: false,
    })
    if (this.data.mode === 'hold') this.warnIfHeld(next)
  },

  warnIfHeld(code) {
    const key = String(code || '').padStart(6, '0')
    const existing = store.getFund(key)
    if (existing && existing.type === 'hold') {
      this.setData({error: '该基金已在持仓中，请到持仓页操作'})
      Toast('该基金已在持仓中')
      return true
    }
    return false
  },

  async resolveName(code) {
    const seq = ++this._resolveSeq
    this.setData({resolving: true, nameHint: ''})
    try {
      const meta = await api.resolveFund({
        code,
        type: this.data.mode === 'hold' ? 'hold' : 'watch',
      })
      if (seq !== this._resolveSeq) return
      const name = (meta && meta.name) || ''
      this.setData({
        name,
        resolving: false,
        nameHint: name ? '' : '未识别到名称，仍可保存',
        code: (meta && meta.code) || code,
        codeInput: (meta && meta.code) || code,
      })
    } catch (e) {
      if (seq !== this._resolveSeq) return
      this.setData({
        resolving: false,
        nameHint: (e && e.message) || '名称识别失败',
      })
    }
  },

  onAmountInput(e) {
    const raw =
      typeof e.detail === 'object' && e.detail
        ? e.detail.value
        : e.detail
    const amount = sanitizeDecimalInput(raw, 2)
    this.setData({amount})
    return amount
  },

  onCostInput(e) {
    const raw =
      typeof e.detail === 'object' && e.detail
        ? e.detail.value
        : e.detail
    const cost = sanitizeDecimalInput(raw, 2)
    this.setData({cost})
    return cost
  },

  async latestNavDate(code) {
    const meta = await api.resolveFund({code, type: 'hold'})
    return String((meta && meta.netValueDate) || '').slice(0, 10)
  },

  async checkBuyDate(day, code) {
    if (!isFundCodeReady(code)) {
      return {ok: false, toast: '请先填写基金代码'}
    }
    const trading = await navTradingDays.isBuyTradingDay(day)
    if (!trading) return {ok: false, toast: '所选日期不是交易日，已清空'}
    const max = await navTradingDays.getMaxBuyDate()
    if (max && day > max) {
      return {ok: false, toast: '请在买入净值确认后再添加持仓'}
    }
    if (max && day === max) {
      const prev = await navTradingDays.getPrevTradingDay(day)
      const navDate = await this.latestNavDate(code)
      if (!prev || !navDate || navDate < prev) {
        return {ok: false, toast: '请在当日净值确认后添加持仓'}
      }
    }
    return {ok: true}
  },

  onBuyDateBlocked() {
    Toast('请先填写基金代码')
  },

  async onBuyDateChange(e) {
    const value =
      typeof e.detail === 'object' && e.detail
        ? e.detail.value
        : e.detail
    const day = String(value || '').trim().slice(0, 10)
    const seq = ++this._buyDateSeq
    if (!day) {
      this.setData({buyDate: ''})
      return
    }
    const code = String(this.data.code || '').padStart(6, '0')
    try {
      const result = await this.checkBuyDate(day, code)
      if (seq !== this._buyDateSeq) return
      if (!result.ok) {
        this.setData({buyDate: ''})
        Toast(result.toast)
        return
      }
      this.setData({buyDate: day})
    } catch (err) {
      if (seq !== this._buyDateSeq) return
      this.setData({buyDate: ''})
      Toast((err && err.message) || '交易日校验失败')
    }
  },

  onClearBuyDate() {
    this.setData({buyDate: ''})
  },

  parseCost() {
    const n = Number(String(this.data.cost || '').trim())
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.round(n * 100) / 100
  },

  async onSubmit() {
    if (this.data.saving) return
    const mode = this.data.mode
    const code = String(this.data.code || '').padStart(6, '0')
    if (!/^\d{6}$/.test(code)) {
      this.setData({
        error: this.data.suggestOpen || this.data.codeInput
          ? '请从检索结果中点选一只基金，或输入 6 位代码'
          : '请输入6位基金代码',
      })
      return
    }

    if (mode === 'hold' && this.warnIfHeld(code)) return

    if (mode === 'hold' && !(this.parseCost() > 0)) {
      this.setData({error: '请填写投入成本'})
      Toast('请填写投入成本')
      return
    }

    if (mode === 'hold' && this.data.buyDate) {
      try {
        const result = await this.checkBuyDate(this.data.buyDate, code)
        if (!result.ok) {
          this.setData({buyDate: ''})
          Toast(result.toast)
          return
        }
      } catch (err) {
        Toast((err && err.message) || '交易日校验失败')
        return
      }
    }

    this.setData({saving: true, error: ''})
    try {
      if (this.data.codeLocked) {
        if (mode === 'hold') {
          await api.updateFund(code, {
            amount: Number(this.data.amount) || 0,
            cost: this.parseCost(),
            buyDate: this.data.buyDate || '',
          })
        }
      } else {
        await api.createFund({
          code,
          type: mode,
          name: this.data.name || undefined,
          amount: mode === 'hold' ? Number(this.data.amount) || 0 : undefined,
          cost: mode === 'hold' ? this.parseCost() : undefined,
          buyDate: mode === 'hold' ? this.data.buyDate || '' : undefined,
        })
      }
      Toast.success('已保存')
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      this.setData({
        error: (e && e.message) || '保存失败',
      })
    } finally {
      this.setData({saving: false})
    }
  },
})
