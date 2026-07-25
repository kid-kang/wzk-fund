const api = require('../../utils/api')
const {formatAmount, formatMoney, formatPct, pctClass} = require('../../utils/format')
const {navigateTo} = require('../../utils/theme')
const Toast = require('@vant/weapp/toast/toast').default

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
    refreshing: false,
    error: '',
    updatedAt: '',
    list: [],
    showGold: true,
    hideAmounts: false,
    totalAmountText: '--',
    totalPnlText: '--',
    totalPnlPctText: '--',
    pnlClass: 'flat',
    pnlPctClass: 'flat',
    goldPriceText: '--',
    goldValueText: '--',
    goldCostText: '--',
    goldCostClass: 'flat',
    goldCostPctText: '--',
    goldCostPctClass: 'flat',
    hasGold: false,
  },

  timer: null,
  _ready: false,

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
      if (silent) this.setData({refreshing: true})
      else this.setData({loading: true})
      this.setData({error: ''})
      try {
        const results = await Promise.allSettled([
          api.fetchHoldings(),
          api.fetchGold(),
          api.fetchSettings(),
        ])
        const [h, g, s] = results
        const patch = {}

        if (h.status === 'fulfilled') {
          const summary = h.value.summary || {}
          patch.list = (h.value.list || []).map((row) => {
            const name = row.name || row.code || ''
            const confirmPct =
              row.dayGrowth != null ? row.dayGrowth : row.percent
            const sectors = Array.isArray(row.sectors) ? row.sectors : []
            const sectorTags = sectors.slice(0, 2)
            const confirmedUpdated = !!row.confirmedUpdated
            return Object.assign({}, row, {
              name,
              codeMark: String(row.code || '').slice(-6) || '······',
              nameMarquee: false,
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
              confirmPctText: formatPct(confirmPct),
              confirmPctClass: pctClass(confirmPct),
              sectorTags,
              hasTags: confirmedUpdated || sectorTags.length > 0,
              trend: row.trend || [],
            })
          })
          patch.totalAmountText = formatAmount(summary.totalAmount)
          patch.totalPnlText = formatMoney(summary.totalPnl)
          patch.totalPnlPctText = formatPct(summary.totalPnlPercent)
          patch.pnlClass = pctClass(summary.totalPnl)
          patch.pnlPctClass = pctClass(summary.totalPnlPercent)
          patch._measureNames = true
        }

        if (s.status === 'fulfilled') {
          patch.showGold = s.value && s.value.showGold !== false
        }

        if (g.status === 'fulfilled') {
          const gold = g.value || {}
          const holding = Number(gold.holding) || 0
          const hasGold = holding > 0
          const marketValue =
            gold.price != null && hasGold
              ? Number(gold.price) * holding
              : null
          const costPnl = gold.costPnl != null ? gold.costPnl : null
          const costPct = gold.costPnlPercent != null ? gold.costPnlPercent : null
          patch.hasGold = hasGold
          patch.goldPriceText = gold.price != null ? formatAmount(gold.price, 2) : '--'
          patch.goldValueText = formatAmount(marketValue)
          patch.goldCostText = formatMoney(costPnl)
          patch.goldCostClass = pctClass(costPnl)
          patch.goldCostPctText = formatPct(costPct)
          patch.goldCostPctClass = pctClass(costPct)
        }

        if (results.every((r) => r.status === 'rejected')) {
          const failed = results[0]
          patch.error =
            (failed.reason && failed.reason.message) || '加载失败，请确认代理服务已启动'
        }

        patch.updatedAt = new Date().toLocaleTimeString('zh-CN', {hour12: false})
        patch.loading = false
        patch.refreshing = false
        const needMeasure = !!patch._measureNames
        delete patch._measureNames
        this.setData(patch, () => {
          if (needMeasure) this.measureNameMarquee()
        })
      } catch (e) {
        this.setData({
          error: (e && e.message) || '加载失败',
          loading: false,
          refreshing: false,
        })
      }
    },

    measureNameMarquee() {
      const list = this.data.list || []
      if (!list.length) return
      wx.nextTick(() => {
        const q = this.createSelectorQuery()
        q.selectAll('.name-clip').boundingClientRect()
        q.selectAll('.name-measure').boundingClientRect()
        q.exec((res) => {
          const clips = (res && res[0]) || []
          const measures = (res && res[1]) || []
          if (!clips.length || !measures.length) return
          let changed = false
          const next = list.map((item, i) => {
            const clipW = (clips[i] && clips[i].width) || 0
            const nameW = (measures[i] && measures[i].width) || 0
            const nameMarquee = clipW > 0 && nameW > clipW + 1
            if (!!item.nameMarquee !== nameMarquee) changed = true
            return nameMarquee === item.nameMarquee
              ? item
              : Object.assign({}, item, {nameMarquee})
          })
          if (changed) this.setData({list: next})
        })
      })
    },

    onToggleAmounts() {
      const hideAmounts = !this.data.hideAmounts
      this.setData({hideAmounts})
      try {
        wx.setStorageSync('holdings_hide_amounts', hideAmounts)
      } catch (e) {}
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
            this.load(true)
          } catch (err) {
            Toast.fail((err && err.message) || '删除失败')
          }
        },
      })
    },
  },
})
