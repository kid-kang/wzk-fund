const api = require('../../utils/api')
const {formatAmount, formatPct} = require('../../utils/format')
const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')

const RANGES = [
  {key: 'intraday', label: '分时'},
  {key: '1m', label: '近1月'},
  {key: '3m', label: '近3月'},
  {key: '6m', label: '近6月'},
  {key: '1y', label: '近1年'},
]

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

Page({
  data: {
    ...themeView,
    navTitle: '金价走势',
    ranges: RANGES,
    range: 'intraday',
    points: [],
    priceText: '--',
    periodText: '--',
    periodPercent: null,
    chartHeight: 300,
    chartEpoch: 0,
    loading: false,
    error: '',
  },

  onLoad() {
    const themePatch = getThemeViewState()
    syncNavigationBar(themePatch.theme)
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const chartHeight = Math.max(260, Math.floor((win.windowWidth || 375) * 0.72))
    this.setData({...themePatch, chartHeight})
    this.load()
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
  },

  onRangeTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.range) return
    // 立刻卸掉旧图，避免加载中与旧 canvas 并排换行
    this.setData({
      range: key,
      loading: true,
      error: '',
      points: [],
      periodText: '--',
      chartEpoch: this.data.chartEpoch + 1,
    })
    this.load()
  },

  async load() {
    const reqRange = this.data.range
    const reqEpoch = this.data.chartEpoch
    if (!this.data.loading) {
      this.setData({loading: true, error: '', points: []})
    }
    try {
      if (reqRange === 'intraday') {
        await this.loadIntraday(reqRange, reqEpoch)
      } else {
        await this.loadHistory(reqRange, reqEpoch)
      }
    } catch (e) {
      if (reqRange !== this.data.range || reqEpoch !== this.data.chartEpoch) return
      this.setData({
        error: (e && e.message) || '加载失败',
        loading: false,
        points: [],
      })
    }
  },

  async loadIntraday(reqRange, reqEpoch) {
    const gold = await api.fetchGold()
    if (reqRange !== this.data.range || reqEpoch !== this.data.chartEpoch) return
    const trend = (gold.trend || [])
      .filter((p) => p && p.price != null)
      .map((p) => ({
        time: p.time,
        price: Number(p.price),
        date: p.time,
      }))
    const periodPercent =
      gold.percent == null || Number.isNaN(Number(gold.percent))
        ? null
        : Number(gold.percent)
    this.setData({
      points: trend,
      priceText: gold.price != null ? formatAmount(gold.price, 2) : '--',
      periodText: formatPct(periodPercent),
      periodPercent,
      loading: false,
    })
  },

  async loadHistory(reqRange, reqEpoch) {
    const data = await api.fetchGoldHistory(reqRange)
    if (reqRange !== this.data.range || reqEpoch !== this.data.chartEpoch) return
    const points = (data.points || []).map((p) => ({
      date: p.date,
      time: p.date,
      price: p.close != null ? Number(p.close) : Number(p.price),
    }))
    const last = points.length ? points[points.length - 1].price : null
    const periodPercent =
      data.periodPercent == null || Number.isNaN(Number(data.periodPercent))
        ? null
        : Number(data.periodPercent)
    this.setData({
      points,
      priceText: last != null ? formatAmount(last, 2) : '--',
      periodText: formatPct(periodPercent),
      periodPercent,
      loading: false,
    })
  },
})
