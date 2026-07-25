const {getStoredTheme, applyTheme, syncNavigationBar} = require('./utils/theme')
const {getApiBase} = require('./utils/config')

App({
  globalData: {
    theme: 'light',
    apiBase: '',
    refreshMs: 30000,
  },

  onLaunch() {
    const theme = applyTheme(getStoredTheme())
    this.globalData.theme = theme
    this.globalData.apiBase = getApiBase()
  },

  onShow() {
    syncNavigationBar(this.globalData.theme || getStoredTheme())
  },

  setTheme(theme) {
    const next = applyTheme(theme)
    this.globalData.theme = next
    syncNavigationBar(next)
    return next
  },
})
