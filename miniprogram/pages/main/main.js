const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')

const TAB_TITLES = {
  holdings: '持仓',
  watchlist: '自选',
  market: '行情',
  mine: '我的',
}

/** 内容区最小高度 = 窗口高度（已不含导航栏）- 自定义 TabBar */
function calcTabContentMinHeight() {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const windowHeight = Number(win.windowHeight) || 0
  const windowWidth = Number(win.windowWidth) || 375
  let safeBottom = 0
  if (win.safeAreaInsets && typeof win.safeAreaInsets.bottom === 'number') {
    safeBottom = win.safeAreaInsets.bottom
  } else if (win.safeArea && typeof win.screenHeight === 'number') {
    safeBottom = Math.max(0, win.screenHeight - win.safeArea.bottom)
  }
  // 与 app-tab-bar：height = 100rpx + safe-area（border-box）
  const tabBarHeight = (100 / 750) * windowWidth + safeBottom
  return Math.max(0, Math.floor(windowHeight - tabBarHeight))
}

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

Page({
  data: {
    ...themeView,
    navTitle: TAB_TITLES.holdings,
    activeTab: 'holdings',
    contentMinHeight: 0,
    mounted: {
      holdings: true,
      watchlist: false,
      market: false,
      mine: false,
    },
  },

  watchCount: 0,

  onLoad() {
    const next = getThemeViewState()
    syncNavigationBar(next.theme)
    this.setData({
      ...next,
      contentMinHeight: calcTabContentMinHeight(),
    })
    this.syncNavTitle('holdings')
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) {
      this.setData(next)
    }
    syncNavigationBar(next.theme)
    this.syncNavTitle(this.data.activeTab)
  },

  onTabChange(e) {
    const key = (e.detail && e.detail.key) || 'holdings'
    if (key === this.data.activeTab) return
    const mounted = Object.assign({}, this.data.mounted)
    mounted[key] = true
    const title =
      key === 'watchlist'
        ? `自选(${this.watchCount || 0})`
        : TAB_TITLES[key] || 'WZK Fund'
    this.setData({activeTab: key, mounted, navTitle: title})
    wx.setNavigationBarTitle({title})
  },

  onWatchCount(e) {
    const count = Number((e.detail && e.detail.count) || 0)
    this.watchCount = count
    if (this.data.activeTab === 'watchlist') {
      this.syncNavTitle('watchlist')
    }
  },

  onReady() {
    // 把当前主题首屏写入初始渲染缓存，下次冷启动可立刻出暗色/亮色
    if (typeof this.setInitialRenderingCache === 'function') {
      this.setInitialRenderingCache()
    }
  },

  onThemeChange(e) {
    const theme = e.detail && e.detail.theme === 'dark' ? 'dark' : 'light'
    const next = getThemeViewState(theme)
    this.setData(next)
    syncNavigationBar(theme)
    if (typeof this.setInitialRenderingCache === 'function') {
      wx.nextTick(() => this.setInitialRenderingCache())
    }
  },

  syncNavTitle(key) {
    const title =
      key === 'watchlist'
        ? `自选(${this.watchCount || 0})`
        : TAB_TITLES[key] || 'WZK Fund'
    if (title !== this.data.navTitle) {
      this.setData({navTitle: title})
    }
    wx.setNavigationBarTitle({title})
  },
})

