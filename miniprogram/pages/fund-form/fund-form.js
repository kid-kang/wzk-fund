const api = require('../../utils/api')
const store = require('../../utils/portfolioStore')
const {isTradingDay} = require('../../utils/tradingCalendar')
const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')
const Toast = require('@vant/weapp/toast/toast').default

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

/** 首屏前就算好，避免非交易日先露出口径单选再隐藏 */
const initialShowAmountBasis = isTradingDay()
const initialAmountBasis = initialShowAmountBasis ? 'prev' : 'today'
const initialAmountPlaceholder = initialShowAmountBasis
  ? '填写与上方口径一致的金额'
  : '填写今日结算的持仓金额'
const initialAmountTip = initialShowAmountBasis
  ? '填写与上方口径一致的金额'
  : '非交易日按今日结算市值填写'

Page({
  data: {
    ...themeView,
    navTitle: '基金',
    mode: 'hold',
    code: '',
    name: '',
    nameHint: '',
    codeLocked: false,
    amount: '',
    amountBasis: initialAmountBasis,
    showAmountBasis: initialShowAmountBasis,
    amountPlaceholder: initialAmountPlaceholder,
    amountTip: initialAmountTip,
    resolving: false,
    saving: false,
    error: '',
  },

  _resolveTimer: null,
  _resolveSeq: 0,

  onLoad(query) {
    const themePatch = getThemeViewState()
    syncNavigationBar(themePatch.theme)
    const mode = query.mode === 'watch' ? 'watch' : 'hold'
    const code = query.code ? String(query.code).padStart(6, '0') : ''
    const name = query.name ? decodeURIComponent(query.name) : ''
    const showAmountBasis = isTradingDay()
    const navTitle = code
      ? mode === 'hold'
        ? '编辑持仓'
        : '编辑自选'
      : mode === 'hold'
        ? '添加持仓'
        : '添加自选'

    const patch = {
      ...themePatch,
      navTitle,
      mode,
      code,
      name,
      codeLocked: !!code,
      showAmountBasis,
      amountBasis: showAmountBasis ? 'prev' : 'today',
      amountPlaceholder: showAmountBasis
        ? '填写与上方口径一致的金额'
        : '填写今日结算的持仓金额',
      amountTip: showAmountBasis
        ? '填写与上方口径一致的金额'
        : '非交易日按今日结算市值填写',
    }

    if (code && mode === 'hold') {
      this.prefillHold(code, name, patch)
    } else {
      this.setData(patch)
      if (code) this.resolveName(code)
    }
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
  },

  onUnload() {
    if (this._resolveTimer) clearTimeout(this._resolveTimer)
  },

  async prefillHold(code, nameFromQuery, patch) {
    try {
      const holdings = await api.fetchHoldings()
      const row = (holdings.list || []).find((f) => f.code === code)
      if (row) {
        patch.amount = row.amount != null ? String(row.amount) : ''
        patch.amountBasis = row.percentSource === 'confirmed' ? 'today' : 'prev'
        patch.name = row.name || nameFromQuery || ''
        if (!isTradingDay()) patch.amountBasis = 'today'
      } else {
        const local = store.getFund(code)
        if (local && local.name) patch.name = local.name
        else if (nameFromQuery) patch.name = nameFromQuery
      }
    } catch (e) {
      if (nameFromQuery) patch.name = nameFromQuery
    }
    this.setData(patch)
    if (!patch.name) this.resolveName(code)
  },

  onCodeInput(e) {
    const raw =
      typeof e.detail === 'object' && e.detail
        ? e.detail.value
        : e.detail
    const code = String(raw || '')
      .replace(/\D/g, '')
      .slice(0, 6)
    this.setData({code, error: '', nameHint: ''})
    if (this.data.codeLocked) return

    if (this._resolveTimer) clearTimeout(this._resolveTimer)
    if (code.length === 6) {
      this._resolveTimer = setTimeout(() => this.resolveName(code), 280)
    } else {
      this.setData({name: '', resolving: false})
    }
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
    this.setData({amount: raw})
  },

  onBasisTap(e) {
    const basis = e.currentTarget.dataset.basis
    if (!basis || basis === this.data.amountBasis) return
    this.setData({amountBasis: basis})
  },

  async onSubmit() {
    if (this.data.saving) return
    const mode = this.data.mode
    const code = String(this.data.code || '').padStart(6, '0')
    if (!/^\d{6}$/.test(code)) {
      this.setData({error: '请输入6位基金代码'})
      return
    }

    this.setData({saving: true, error: ''})
    try {
      const amountBasis = this.data.showAmountBasis
        ? this.data.amountBasis
        : 'today'
      if (this.data.codeLocked) {
        if (mode === 'hold') {
          await api.updateFund(code, {
            amount: Number(this.data.amount) || 0,
            amountBasis,
          })
        }
      } else {
        await api.createFund({
          code,
          type: mode,
          name: this.data.name || undefined,
          amount: mode === 'hold' ? Number(this.data.amount) || 0 : undefined,
          amountBasis: mode === 'hold' ? amountBasis : undefined,
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
