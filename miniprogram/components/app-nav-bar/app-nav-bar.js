const {NAV_BG, resolveTheme} = require('../../utils/theme')

function measureNav() {
  let statusBarHeight = 20
  let contentHeight = 44
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    statusBarHeight = Number(win.statusBarHeight) || 20
  } catch (e) {
    // ignore
  }
  try {
    const menu = wx.getMenuButtonBoundingClientRect()
    if (menu && menu.height && menu.top != null) {
      const gap = Math.max(0, menu.top - statusBarHeight)
      contentHeight = Math.max(32, menu.height + gap * 2)
    }
  } catch (e) {
    // ignore
  }
  return {
    statusBarHeight: statusBarHeight,
    contentHeight: contentHeight,
  }
}

function themeColors(theme) {
  const isDark = theme === 'dark'
  return {
    navBg: isDark ? NAV_BG.dark : NAV_BG.light,
    frontColor: isDark ? '#ffffff' : '#000000',
  }
}

const bootTheme = resolveTheme()
const bootColors = themeColors(bootTheme)

Component({
  options: {
    // 作为 flex 子项时需要 virtualHost，否则宿主节点高度常为 0
    virtualHost: true,
    styleIsolation: 'apply-shared',
  },

  properties: {
    title: {
      type: String,
      value: '',
    },
    theme: {
      type: String,
      value: bootTheme,
    },
  },

  data: {
    statusBarHeight: 20,
    contentHeight: 44,
    navBg: bootColors.navBg,
    frontColor: bootColors.frontColor,
  },

  lifetimes: {
    attached() {
      const theme = this.properties.theme || resolveTheme()
      const metrics = measureNav()
      const colors = themeColors(theme)
      this.setData({
        statusBarHeight: metrics.statusBarHeight,
        contentHeight: metrics.contentHeight,
        navBg: colors.navBg,
        frontColor: colors.frontColor,
      })
    },
  },

  observers: {
    theme: function (theme) {
      const colors = themeColors(theme || resolveTheme())
      this.setData({
        navBg: colors.navBg,
        frontColor: colors.frontColor,
      })
    },
  },

  methods: {
    onBack() {
      const pages = getCurrentPages()
      if (pages && pages.length > 1) {
        wx.navigateBack({delta: 1})
        return
      }
      wx.reLaunch({url: '/pages/main/main'})
    },
  },
})
