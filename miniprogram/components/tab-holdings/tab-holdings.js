const api = require('../../utils/api')
const {formatAmount, formatMoney, formatPct, pctClass} = require('../../utils/format')
const {navigateTo} = require('../../utils/theme')
const Toast = require('@vant/weapp/toast/toast').default

function mapHoldRow(row) {
  const name = row.name || row.code || ''
  const sectors = Array.isArray(row.sectors) ? row.sectors : []
  const sectorTags = sectors
  const confirmedUpdated = !!row.confirmedUpdated
  const discloseTimeText = String(row.discloseTimeText || '').trim()
  const showDiscloseTime = !!discloseTimeText
  return Object.assign({}, row, {
    name,
    codeMark: String(row.code || '').slice(-6) || '······',
    amountText: formatAmount(row.amount),
    weightText:
      row.weight == null || Number.isNaN(row.weight)
        ? '--'
        : `${Number(row.weight).toFixed(1)}%`,
    pnlText: formatMoney(row.pnl),
    pctText: formatPct(row.percent),
    pnlClass: pctClass(row.pnl),
    pctClass: pctClass(row.percent),
    confirmedUpdated,
    discloseTimeText,
    showDiscloseTime,
    sectorTags,
    hasTags: sectorTags.length > 0,
    trend: row.trend || [],
  })
}

function pctOfTotal(part, total) {
  const p = Number(part) || 0
  const t = Number(total) || 0
  if (!(t > 0)) return 0
  return Math.round((p / t) * 1000) / 10
}

function withPortfolioWeight(rows, grandTotal) {
  return (rows || []).map((row) => {
    const weight = pctOfTotal(row.amount, grandTotal)
    return mapHoldRow(Object.assign({}, row, {weight}))
  })
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    active: {
      type: Boolean,
      value: false,
    },
    theme: {
      type: String,
      value: 'light',
    },
    contentMinHeight: {
      type: Number,
      value: 0,
    },
  },

  data: {
    loading: true,
    error: '',
    hasPortfolio: false,
    hasRealtime: false,
    hasDelayed: false,
    realtimeList: [],
    delayedList: [],
    domesticAmountText: '--',
    foreignAmountText: '--',
    domesticShareText: '--',
    foreignShareText: '--',
    domesticPnlText: '--',
    domesticPnlPctText: '--',
    foreignPnlText: '--',
    foreignPnlPctText: '--',
    showGold: true,
    hideAmounts: false,
    goldPriceText: '--',
    goldValueText: '--',
    goldWeightText: '',
    goldCostText: '--',
    goldCostPctText: '--',
    hasGold: false,
  },

  timer: null,
  _ready: false,
  _loadEpoch: 0,

  lifetimes: {
    ready() {
      this._ready = true
      if (this.data.active) this.activate()
    },
    detached() {
      this.clearTimer()
    },
  },

  pageLifetimes: {
    show() {
      if (!this._ready || !this.data.active) return
      this.refreshLocalFlags()
      this.load(true)
      this.startTimer()
    },
    hide() {
      this.clearTimer()
    },
  },

  observers: {
    active(active) {
      if (!this._ready) return
      if (active) this.activate()
      else this.deactivate()
    },
  },

  methods: {
    activate() {
      this.refreshLocalFlags()
      this.load()
      this.startTimer()
    },

    deactivate() {
      this.clearTimer()
    },

    refreshLocalFlags() {
      let hideAmounts = false
      try {
        hideAmounts = !!wx.getStorageSync('holdings_hide_amounts')
      } catch (e) {}
      if (hideAmounts !== this.data.hideAmounts) {
        this.setData({hideAmounts})
      }
    },

    startTimer() {
      this.clearTimer()
      const app = getApp()
      const ms = (app && app.globalData && app.globalData.refreshMs) || 30000
      this.timer = setInterval(() => this.load(true), ms)
    },

    clearTimer() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    },

    async load(silent) {
      const epoch = (this._loadEpoch = (this._loadEpoch || 0) + 1)
      const boot = {error: ''}
      if (!silent) boot.loading = true
      this.setData(boot)
      try {
        const results = await Promise.allSettled([
          api.fetchHoldings(),
          api.fetchGold(),
          api.fetchSettings(),
        ])
        if (epoch !== this._loadEpoch) return
        const [h, g, s] = results
        const patch = {}

        let showGold = this.data.showGold
        if (s.status === 'fulfilled') {
          showGold = s.value && s.value.showGold !== false
          patch.showGold = showGold
        }

        let domesticAmount = 0
        let foreignAmount = 0
        let domesticPnl = 0
        let foreignPnl = 0
        let realtimeRaw = []
        let delayedRaw = []

        if (h.status === 'fulfilled') {
          const groups = h.value.groups || {
            realtime: {list: [], summary: {}},
            delayed: {list: [], summary: {}},
          }
          realtimeRaw = groups.realtime.list || []
          delayedRaw = groups.delayed.list || []
          domesticAmount = Number(groups.realtime.summary && groups.realtime.summary.totalAmount) || 0
          foreignAmount = Number(groups.delayed.summary && groups.delayed.summary.totalAmount) || 0
          domesticPnl = Number(groups.realtime.summary && groups.realtime.summary.totalPnl) || 0
          foreignPnl = Number(groups.delayed.summary && groups.delayed.summary.totalPnl) || 0
          patch.hasRealtime = realtimeRaw.length > 0
          patch.hasDelayed = delayedRaw.length > 0
        }

        let goldValue = 0
        let hasGold = false
        if (g.status === 'fulfilled') {
          const gold = g.value || {}
          const holding = Number(gold.holding) || 0
          hasGold = holding > 0
          goldValue =
            gold.price != null && holding > 0 ? Number(gold.price) * holding : 0
          const costPnl = gold.costPnl != null ? gold.costPnl : null
          const costPct = gold.costPnlPercent != null ? gold.costPnlPercent : null
          patch.hasGold = hasGold
          patch.goldPriceText = gold.price != null ? formatAmount(gold.price, 2) : '--'
          patch.goldValueText = formatAmount(goldValue)
          patch.goldCostText = formatMoney(costPnl)
          patch.goldCostPctText = formatPct(costPct)
        }

        const goldInPortfolio = showGold && hasGold ? goldValue : 0
        const grandTotal = domesticAmount + foreignAmount + goldInPortfolio
        const hasPortfolio =
          realtimeRaw.length > 0 || delayedRaw.length > 0 || goldInPortfolio > 0

        patch.hasPortfolio = hasPortfolio
        patch.realtimeList = withPortfolioWeight(realtimeRaw, grandTotal)
        patch.delayedList = withPortfolioWeight(delayedRaw, grandTotal)

        patch.domesticAmountText = formatAmount(domesticAmount)
        patch.foreignAmountText = formatAmount(foreignAmount)
        patch.domesticShareText = `${pctOfTotal(domesticAmount, grandTotal).toFixed(1)}%`
        patch.foreignShareText = `${pctOfTotal(foreignAmount, grandTotal).toFixed(1)}%`
        patch.domesticPnlText = formatMoney(domesticPnl)
        // 境内当日收益率：分母 = 境内持仓总金额
        const domesticPnlPct =
          domesticAmount > 0 ? (domesticPnl / domesticAmount) * 100 : 0
        patch.domesticPnlPctText = formatPct(domesticPnlPct)
        patch.foreignPnlText = formatMoney(foreignPnl)
        // QDII「当前日」收益：各品种最新已披露净值跳变加总；收益率分母 = QDII 持仓金额
        const foreignPnlPct =
          foreignAmount > 0 ? (foreignPnl / foreignAmount) * 100 : 0
        patch.foreignPnlPctText = formatPct(foreignPnlPct)
        patch.goldWeightText =
          goldInPortfolio > 0
            ? `${pctOfTotal(goldInPortfolio, grandTotal).toFixed(1)}%`
            : ''

        if (results.every((r) => r.status === 'rejected')) {
          const failed = results[0]
          patch.error =
            (failed.reason && failed.reason.message) || '加载失败，请确认代理服务已启动'
        }

        patch.loading = false
        if (epoch !== this._loadEpoch) return
        this.setData(patch)
      } catch (e) {
        if (epoch !== this._loadEpoch) return
        this.setData({
          error: (e && e.message) || '加载失败',
          loading: false,
        })
      }
    },

    onAdd() {
      navigateTo('/pages/fund-form/fund-form?mode=hold')
    },

    onEdit(e) {
      const code = e.currentTarget.dataset.code
      const name = e.currentTarget.dataset.name || ''
      const q = name
        ? `mode=hold&code=${code}&name=${encodeURIComponent(name)}`
        : `mode=hold&code=${code}`
      navigateTo(`/pages/fund-form/fund-form?${q}`)
    },

    onOpenTrend(e) {
      const code = e.currentTarget.dataset.code
      const name = e.currentTarget.dataset.name || ''
      const q = name
        ? `code=${code}&name=${encodeURIComponent(name)}`
        : `code=${code}`
      navigateTo(`/pages/fund-trend/fund-trend?${q}`)
    },

    onOpenGoldTrend() {
      navigateTo('/pages/gold-trend/gold-trend')
    },

    onEditGold() {
      navigateTo('/pages/gold-edit/gold-edit')
    },

    onOpenQaTips(e) {
      const q = (e.currentTarget.dataset && e.currentTarget.dataset.q) || 'qdii-pnl'
      navigateTo(`/pages/fund-qa/fund-qa?q=${encodeURIComponent(q)}`)
    },

    dropHoldRow(code) {
      const key = String(code || '').padStart(6, '0')
      const realtimeList = (this.data.realtimeList || []).filter((r) => r.code !== key)
      const delayedList = (this.data.delayedList || []).filter((r) => r.code !== key)
      this.setData({
        realtimeList,
        delayedList,
        hasRealtime: realtimeList.length > 0,
        hasDelayed: delayedList.length > 0,
        hasPortfolio:
          realtimeList.length > 0 ||
          delayedList.length > 0 ||
          (this.data.showGold && this.data.hasGold),
      })
    },

    onRemove(e) {
      const code = e.currentTarget.dataset.code
      const name = e.currentTarget.dataset.name || code
      wx.showModal({
        title: '删除持仓',
        content: `确认删除 ${name}？`,
        confirmText: '删除',
        confirmColor: '#ff3b45',
        success: async (res) => {
          if (!res.confirm) return
          try {
            await api.removeFund(code)
            this.dropHoldRow(code)
            this.load(true)
          } catch (err) {
            Toast.fail((err && err.message) || '删除失败')
          }
        },
      })
    },
  },
})
