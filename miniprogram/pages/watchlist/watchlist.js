const api = require('../../utils/api')
const {formatPct, pctClass} = require('../../utils/format')
const {getStoredTheme, syncNavigationBar} = require('../../utils/theme')
const Toast = require('@vant/weapp/toast/toast').default

Page({
  data: {
    theme: 'light',
    loading: true,
    refresherTriggered: false,
    error: '',
    list: [],
  },

  timer: null,

  onShow() {
    const theme = getStoredTheme()
    this.setData({theme})
    syncNavigationBar(theme)
    this.syncNavTitle(this.data.list.length)
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

  noop() {},

  syncNavTitle(count) {
    const n = Number(count) || 0
    wx.setNavigationBarTitle({title: `自选(${n})`})
  },

  async load() {
    this.setData({error: ''})
    try {
      const list = await api.fetchWatchlist()
      const mapped = (list || []).map((row) => {
        const name = row.name || row.code || ''
        const confirmPct = row.dayGrowth != null ? row.dayGrowth : row.percent
        const sectors = Array.isArray(row.sectors) ? row.sectors : []
        const sectorTags = sectors.slice(0, 2)
        const confirmedUpdated = !!row.confirmedUpdated
        return Object.assign({}, row, {
          name,
          codeMark: String(row.code || '').slice(-6) || '······',
          nameMarquee: false,
          pctText: formatPct(row.percent),
          pctClass: pctClass(row.percent),
          confirmedUpdated,
          confirmPctText: formatPct(confirmPct),
          confirmPctClass: pctClass(confirmPct),
          sectorTags,
          hasTags: confirmedUpdated || sectorTags.length > 0,
          trend: row.trend || [],
        })
      })
      this.syncNavTitle(mapped.length)
      this.setData(
        {
          list: mapped,
          loading: false,
        },
        () => this.measureNameMarquee(),
      )
    } catch (e) {
      this.setData({
        error: (e && e.message) || '加载失败',
        loading: false,
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

  onAdd() {
    wx.navigateTo({url: '/pages/fund-form/fund-form?mode=watch'})
  },

  onOpenTrend(e) {
    const code = e.currentTarget.dataset.code
    const name = e.currentTarget.dataset.name || ''
    const q = name
      ? `code=${code}&name=${encodeURIComponent(name)}`
      : `code=${code}`
    wx.navigateTo({url: `/pages/fund-trend/fund-trend?${q}`})
  },

  onRemove(e) {
    const code = e.currentTarget.dataset.code
    const name = e.currentTarget.dataset.name || code
    // 原生弹窗，避免被列表里 echarts canvas 盖住
    wx.showModal({
      title: '删除自选',
      content: `确认删除 ${name}？`,
      confirmText: '删除',
      confirmColor: '#ff3b45',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await api.removeFund(code)
          this.load()
        } catch (err) {
          Toast.fail((err && err.message) || '删除失败')
        }
      },
    })
  },
})
