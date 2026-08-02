const api = require('../../utils/api')
const store = require('../../utils/portfolioStore')
const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')
const Toast = require('@vant/weapp/toast/toast').default

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

Page({
  data: {
    ...themeView,
    navTitle: '黄金设置',
    holding: '',
    avgPrice: '',
    saving: false,
    error: '',
  },

  onLoad() {
    const themePatch = getThemeViewState()
    syncNavigationBar(themePatch.theme)
    const gold = store.loadConfig().gold || {}
    this.setData({
      ...themePatch,
      holding: gold.holding != null ? String(gold.holding) : '',
      avgPrice: gold.avgPrice != null ? String(gold.avgPrice) : '',
    })
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
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
      this._navTimer = setTimeout(() => {
        this._navTimer = null
        wx.navigateBack()
      }, 400)
    } catch (e) {
      this.setData({
        error: (e && e.message) || '保存失败',
      })
    } finally {
      this.setData({saving: false})
    }
  },

  onUnload() {
    if (this._navTimer) {
      clearTimeout(this._navTimer)
      this._navTimer = null
    }
  },
})
