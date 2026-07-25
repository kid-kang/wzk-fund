const {getStoredTheme, applyTheme, syncNavigationBar} = require('./utils/theme')
const {getApiBase} = require('./utils/config')

const bootTheme = getStoredTheme()

App({
  globalData: {
    theme: bootTheme,
    apiBase: '',
    refreshMs: 30000,
  },

  onLaunch() {
    const theme = applyTheme(getStoredTheme())
    this.globalData.theme = theme
    this.globalData.apiBase = getApiBase()
    syncNavigationBar(theme)
  },

  onShow() {
    const theme = this.globalData.theme || getStoredTheme()
    this.globalData.theme = theme
    syncNavigationBar(theme)
  },

  setTheme(theme) {
    const next = applyTheme(theme)
    this.globalData.theme = next
    syncNavigationBar(next)
    return next
  },
})
