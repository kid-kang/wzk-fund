const api = require('../../utils/api')
const store = require('../../utils/portfolioStore')
const {getStoredTheme, syncNavigationBar} = require('../../utils/theme')
const Toast = require('@vant/weapp/toast/toast').default

Page({
  data: {
    theme: 'light',
    holding: '',
    avgPrice: '',
    saving: false,
    error: '',
  },

  onLoad() {
    const theme = getStoredTheme()
    syncNavigationBar(theme)
    const gold = store.loadConfig().gold || {}
    this.setData({
      theme,
      holding: gold.holding != null ? String(gold.holding) : '',
      avgPrice: gold.avgPrice != null ? String(gold.avgPrice) : '',
    })
  },

  onHolding(e) {
    this.setData({holding: e.detail})
  },

  onAvgPrice(e) {
    this.setData({avgPrice: e.detail})
  },

  async onSubmit() {
    if (this.data.saving) return
    this.setData({saving: true, error: ''})
    try {
      await api.updateGoldConfig({
        holding: Number(this.data.holding) || 0,
        avgPrice: Number(this.data.avgPrice) || 0,
      })
      Toast.success('已保存')
      setTimeout(() => wx.navigateBack(), 400)
    } catch (e) {
      this.setData({
        error: (e && e.message) || '保存失败',
        saving: false,
      })
    }
  },
})
