const api = require('../../utils/api')
const {formatPct, pctClass} = require('../../utils/format')
const {
  availableFundRanges,
  defaultFundRange,
  formatFundAge,
  isRangeAvailable,
} = require('../../utils/fundRanges')
const {getStoredTheme, syncNavigationBar} = require('../../utils/theme')

function emptyRanges(ageDays) {
  return availableFundRanges(ageDays).map((t) =>
    Object.assign({}, t, {pctText: '--', pctClass: 'flat'}),
  )
}

Page({
  data: {
    theme: 'light',
    code: '',
    name: '',
    ageDays: null,
    ageText: '',
    range: '3m',
    ranges: emptyRanges(null),
    chartPoints: [],
    chartHeight: 300,
    chartEpoch: 0,
    loading: false,
    error: '',
    byRange: {},
  },

  onLoad(query) {
    const code = String(query.code || '').padStart(6, '0')
    const name = query.name ? decodeURIComponent(query.name) : ''
    const theme = getStoredTheme()
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const chartHeight = Math.max(260, Math.floor((win.windowWidth || 375) * 0.72))
    this.setData({theme, code, name, chartHeight, loading: true})
    syncNavigationBar(theme)
    this.bootstrap()
  },

  onShow() {
    const theme = getStoredTheme()
    if (theme !== this.data.theme) this.setData({theme})
    syncNavigationBar(theme)
  },

  async bootstrap() {
    await this.loadQuote()
    const range = this.data.range
    try {
      await this.fetchAndStoreRange(range)
      this.applyChart(range)
      this.setData({loading: false})
    } catch (e) {
      this.setData({
        loading: false,
        error: (e && e.message) || '加载失败',
        chartPoints: [],
      })
    }
    this.prefetchHistory()
  },

  async loadQuote() {
    try {
      const quote = await api.fetchFundQuote(this.data.code)
      const ageDays =
        quote.ageDays != null && Number.isFinite(Number(quote.ageDays))
          ? Number(quote.ageDays)
          : null
      const range = defaultFundRange(ageDays)
      this._byRange = {}
      this.setData({
        name: quote.name || this.data.name || this.data.code,
        ageDays,
        ageText: formatFundAge(quote.establishDate, ageDays),
        range,
        ranges: emptyRanges(ageDays),
        byRange: {},
      })
    } catch (e) {
      if (!this.data.name) {
        this.setData({error: (e && e.message) || '行情加载失败'})
      }
    }
  },

  mergeByRange(range, data) {
    this._byRange = Object.assign({}, this._byRange || this.data.byRange, {
      [range]: data,
    })
    this.setData({byRange: this._byRange})
    this.refreshRanges()
    return data
  },

  async fetchAndStoreRange(range) {
    const cached = (this._byRange || this.data.byRange || {})[range]
    if (cached) {
      this.refreshRanges()
      return cached
    }
    const data = await api.fetchFundHistory(this.data.code, range)
    return this.mergeByRange(range, data)
  },

  prefetchHistory() {
    const ageDays = this.data.ageDays
    availableFundRanges(ageDays).forEach((t) => {
      const r = t.key
      if ((this._byRange || this.data.byRange || {})[r]) return
      api
        .fetchFundHistory(this.data.code, r)
        .then((data) => {
          if ((this._byRange || this.data.byRange || {})[r]) return
          this.mergeByRange(r, data)
        })
        .catch(() => {})
    })
  },

  refreshRanges() {
    const by = this._byRange || this.data.byRange || {}
    const ranges = availableFundRanges(this.data.ageDays).map((t) => {
      const hist = by[t.key]
      const pct = hist ? hist.periodPercent : null
      return Object.assign({}, t, {
        pctText: formatPct(pct),
        pctClass: pctClass(pct),
      })
    })
    this.setData({ranges})
  },

  applyChart(range) {
    const hist = (this._byRange || this.data.byRange || {})[range]
    if (!hist) {
      this.setData({chartPoints: []})
      return
    }
    const chartPoints = (hist.points || []).map((p) => ({
      date: p.date,
      value: p.percent,
      percent: p.percent,
      netValue: p.netValue,
    }))
    this.setData({
      chartPoints,
      error: '',
    })
    this.refreshRanges()
  },

  onRangeTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.range) return
    if (!isRangeAvailable(key, this.data.ageDays)) return
    const epoch = this.data.chartEpoch + 1
    const cached = (this._byRange || this.data.byRange || {})[key]
    this.setData({
      range: key,
      loading: !cached,
      error: '',
      chartPoints: [],
      chartEpoch: epoch,
    })
    this.loadRange(key, epoch)
  },

  async loadRange(range, epoch) {
    if (range !== this.data.range || epoch !== this.data.chartEpoch) return

    if ((this._byRange || this.data.byRange || {})[range]) {
      this.setData({loading: false})
      this.applyChart(range)
      return
    }

    this.setData({loading: true, error: '', chartPoints: []})
    try {
      await this.fetchAndStoreRange(range)
      if (range !== this.data.range || epoch !== this.data.chartEpoch) return
      this.setData({loading: false})
      this.applyChart(range)
    } catch (e) {
      if (range !== this.data.range || epoch !== this.data.chartEpoch) return
      this.setData({
        loading: false,
        error: (e && e.message) || '加载失败',
        chartPoints: [],
      })
    }
  },
})
