const api = require('../../utils/api')
const {formatPct, pctClass, cardPercent} = require('../../utils/format')
const {groupWatchlistByCategory} = require('../../utils/fundCategory')
const {navigateTo} = require('../../utils/theme')
const {toSparkSeries, reuseUnchangedSpark} = require('../../utils/spark')
const Toast = require('@vant/weapp/toast/toast').default

function flattenGroupRows(groups) {
  const rows = []
    ; (groups || []).forEach((g) => {
      ; (g.list || []).forEach((row) => rows.push(row))
    })
  return rows
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
    groups: [],
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
      this.load()
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
      this.load()
      this.startTimer()
    },

    deactivate() {
      this.clearTimer()
    },

    startTimer() {
      this.clearTimer()
      const app = getApp()
      const ms = (app && app.globalData && app.globalData.refreshMs) || 30000
      this.timer = setInterval(() => this.load(), ms)
    },

    clearTimer() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    },

    emitCount(count) {
      this.triggerEvent('countchange', {count: Number(count) || 0})
    },

    async load() {
      const epoch = (this._loadEpoch = (this._loadEpoch || 0) + 1)
      this.setData({error: ''})
      try {
        const list = await api.fetchWatchlist()
        if (epoch !== this._loadEpoch) return
        const mapped = (list || []).map((row) => {
          const name = row.name || row.code || ''
          const sectors = Array.isArray(row.sectors) ? row.sectors : []
          const sectorTags =
            Array.isArray(row.sectorItems) && row.sectorItems.length
              ? row.sectorItems.map((it) => ({
                name: String((it && it.name) || '').trim(),
                sectorCode: String((it && it.sectorCode) || '').trim(),
                mappingCode: String((it && it.mappingCode) || '').trim(),
              })).filter((it) => it.name)
              : sectors
                .map((s) => String(s || '').trim())
                .filter(Boolean)
                .map((n) => ({name: n, sectorCode: '', mappingCode: ''}))
          const confirmedUpdated = !!row.confirmedUpdated
          const discloseTimeText = String(row.discloseTimeText || '').trim()
          const showDiscloseTime = !!discloseTimeText
          const trendDateText = String(row.trendDateText || '').trim()
          const trendPct = Number(row.realtimePercent)
          const showTrendPct = !!trendDateText && Number.isFinite(trendPct)
          const sparkSeries = toSparkSeries(row.trend || [], 'growth')
          const mappedRow = Object.assign({}, row, {
            name,
            codeMark: String(row.code || '').slice(-6) || '······',
            pctText: formatPct(cardPercent(row)),
            pctClass: pctClass(cardPercent(row)),
            confirmedUpdated,
            discloseTimeText,
            showDiscloseTime,
            trendDateText,
            trendDateShort: String(row.trendDateShort || '').trim(),
            trendPctText: showTrendPct ? formatPct(trendPct) : '',
            trendPctTone: showTrendPct ? trendPct : null,
            sectorTags,
            hasTags: sectorTags.length > 0,
            spark: sparkSeries.spark,
            sparkBreaks: sparkSeries.sparkBreaks,
            sparkKey: sparkSeries.sparkKey,
          })
          delete mappedRow.trend
          return mappedRow
        })
        const reused = reuseUnchangedSpark(flattenGroupRows(this.data.groups), mapped)
        const groups = groupWatchlistByCategory(reused)
        if (epoch !== this._loadEpoch) return
        this.emitCount(mapped.length)
        this.setData({
          groups,
          loading: false,
        })
      } catch (e) {
        if (epoch !== this._loadEpoch) return
        this.setData({
          error: (e && e.message) || '加载失败',
          loading: false,
        })
      }
    },

    onAdd() {
      navigateTo('/pages/fund-form/fund-form?mode=watch')
    },

    onOpenQaTips(e) {
      const q = (e.currentTarget.dataset && e.currentTarget.dataset.q) || 'a-share'
      navigateTo(`/pages/fund-qa/fund-qa?q=${encodeURIComponent(q)}`)
    },

    onOpenTrend(e) {
      const code = e.currentTarget.dataset.code
      const name = e.currentTarget.dataset.name || ''
      const q = name
        ? `code=${code}&name=${encodeURIComponent(name)}`
        : `code=${code}`
      navigateTo(`/pages/fund-trend/fund-trend?${q}`)
    },

    onOpenSector(e) {
      const {name, sector, mapping} = e.currentTarget.dataset || {}
      const sectorCode = String(sector || '').trim()
      const mappingCode = String(mapping || '').trim()
      if (!sectorCode && !mappingCode) {
        wx.showToast({title: '该板块暂无详情', icon: 'none'})
        return
      }
      const q = [
        `sectorCode=${encodeURIComponent(sectorCode)}`,
        `mappingCode=${encodeURIComponent(mappingCode)}`,
        `name=${encodeURIComponent(name || '')}`,
      ].join('&')
      navigateTo(`/pages/sector-funds/sector-funds?${q}`)
    },

    dropWatchRow(code) {
      const key = String(code || '').padStart(6, '0')
      const groups = (this.data.groups || [])
        .map((group) => {
          const list = (group.list || []).filter((r) => r.code !== key)
          if (!list.length) return null
          return Object.assign({}, group, {
            list,
            title: `${group.key}(${list.length})`,
          })
        })
        .filter(Boolean)
      const count = groups.reduce((n, g) => n + (g.list ? g.list.length : 0), 0)
      this.emitCount(count)
      this.setData({groups})
    },

    onRemove(e) {
      const code = e.currentTarget.dataset.code
      const name = e.currentTarget.dataset.name || code
      wx.showModal({
        title: '删除自选',
        content: `确认删除 ${name}？`,
        confirmText: '删除',
        confirmColor: '#ff3b45',
        success: async (res) => {
          if (!res.confirm) return
          try {
            await api.removeFund(code)
            this.dropWatchRow(code)
            this.load()
          } catch (err) {
            Toast.fail((err && err.message) || '删除失败')
          }
        },
      })
    },
  },
})
