const api = require('../../utils/api')
const {formatPct, pctClass} = require('../../utils/format')
const {getStoredTheme, syncNavigationBar} = require('../../utils/theme')

Page({
  data: {
    theme: 'light',
    refresherTriggered: false,
    error: '',
    indices: [],
    market: null,
  },

  timer: null,

  onShow() {
    const theme = getStoredTheme()
    this.setData({theme})
    syncNavigationBar(theme)
    this.load()
    this.startTimer()
  },

  onHide() {
    this.clearTimer()
  },

  onUnload() {
    this.clearTimer()
  },

  onRefresherRefresh() {
    this.setData({refresherTriggered: true})
    this.load().finally(() => {
      this.setData({refresherTriggered: false})
    })
  },

  startTimer() {
    this.clearTimer()
    this.timer = setInterval(() => this.load(), 30000)
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  async load() {
    this.setData({error: ''})
    try {
      const results = await Promise.allSettled([
        api.fetchIndices(),
        api.fetchMarketOverview(),
      ])
      const [i, m] = results
      const patch = {}
      if (i.status === 'fulfilled') {
        patch.indices = (i.value || []).map((row) =>
          Object.assign({}, row, {
            pctText: formatPct(row.percent),
            pctClass: pctClass(row.percent),
          }),
        )
      }
      if (m.status === 'fulfilled') {
        const market = m.value || {}
        const ud = market.upDown || {up: 0, down: 0, flat: 0, time: null}
        const up = Number(ud.up) || 0
        const down = Number(ud.down) || 0
        const flat = Number(ud.flat) || 0
        // 涨/跌占比只在涨跌家数内计算，剔除平盘
        const traded = Math.max(up + down, 1)
        patch.market = {
          upDown: Object.assign({}, ud, {
            up,
            down,
            flat,
            upPctText: `(${((up / traded) * 100).toFixed(1)}%)`,
            downPctText: `(${((down / traded) * 100).toFixed(1)}%)`,
          }),
          topGainers: (market.topGainers || []).map((row) =>
            Object.assign({}, row, {pctText: formatPct(row.percent)}),
          ),
          topLosers: (market.topLosers || []).map((row) =>
            Object.assign({}, row, {pctText: formatPct(row.percent)}),
          ),
        }
      }
      if (results.every((r) => r.status === 'rejected')) {
        patch.error =
          (results[0].reason && results[0].reason.message) || '加载失败'
      }
      this.setData(patch)
    } catch (e) {
      this.setData({error: (e && e.message) || '加载失败'})
    }
  },

  onOpenIndex(e) {
    const {code, name} = e.currentTarget.dataset
    wx.navigateTo({
      url: `/pages/index-trend/index-trend?code=${code}&name=${encodeURIComponent(name || '')}`,
    })
  },
})
