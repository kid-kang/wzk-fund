const api = require('../../utils/api')
const {formatPct, pctClass} = require('../../utils/format')
const {getStoredTheme, syncNavigationBar} = require('../../utils/theme')

const RANGES = [
  {key: '1m', label: '近1月'},
  {key: '3m', label: '近3月'},
  {key: '6m', label: '近6月'},
  {key: '1y', label: '近1年'},
  {key: '3y', label: '近3年'},
]

function emptyRanges() {
  return RANGES.map((t) =>
    Object.assign({}, t, {pctText: '--', pctClass: 'flat'}),
  )
}

Page({
  data: {
    theme: 'light',
    code: '',
    name: '',
    range: '3m',
    ranges: emptyRanges(),
    chartPoints: [],
    chartHeight: 300,
    chartEpoch: 0,
    loading: false,
    error: '',
    byRange: {},
  },

  onLoad(query) {
    const code = String(query.code || '')
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
    try {
      await this.fetchAndStoreRange(this.data.range)
      this.applyChart(this.data.range)
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

  mergeByRange(range, data) {
    this._byRange = Object.assign({}, this._byRange || this.data.byRange, {
      [range]: data,
    })
    const patch = {byRange: this._byRange}
    if (data && data.name) patch.name = data.name
    this.setData(patch)
    this.refreshRanges()
    return data
  },

  async fetchAndStoreRange(range) {
    const cached = (this._byRange || this.data.byRange || {})[range]
    if (cached) {
      this.refreshRanges()
      return cached
    }
    const data = await api.fetchIndexHistory(this.data.code, range)
    return this.mergeByRange(range, data)
  },

  prefetchHistory() {
    RANGES.forEach((t) => {
      const r = t.key
      if ((this._byRange || this.data.byRange || {})[r]) return
      api
        .fetchIndexHistory(this.data.code, r)
        .then((data) => {
          if ((this._byRange || this.data.byRange || {})[r]) return
          this.mergeByRange(r, data)
        })
        .catch(() => {})
    })
  },

  refreshRanges() {
    const by = this._byRange || this.data.byRange || {}
    const ranges = RANGES.map((t) => {
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
    if (hist.name && hist.name !== this.data.name) {
      this.setData({name: hist.name})
    }
    const chartPoints = (hist.points || []).map((p) => ({
      date: p.date,
      value: p.percent,
      percent: p.percent,
      close: p.close,
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
