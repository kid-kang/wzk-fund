const THEME_STORAGE_KEY = 'wzk-fund-theme'

const NAV_BG = {
  light: '#FFFFFF',
  dark: '#121722',
}

const TAB_BG = {
  // 与页面底色一致，避免滑到底时露出白边/白线
  light: '#EEF1F8',
  dark: '#0B1018',
}

/** 窗口回弹 / page-meta 底色，与页面 --bg 一致 */
const PAGE_BG = {
  light: '#EEF1F8',
  dark: '#0B1018',
}

function getPageBg(theme) {
  return theme === 'dark' ? PAGE_BG.dark : PAGE_BG.light
}

/**
 * 主题以本地存储为准。
 * 注意：不可优先读 globalData.theme —— App 默认值常是 light，
 * onLaunch 写入前会被误判成亮色，导致冷启动闪白。
 */
function resolveTheme() {
  return getStoredTheme()
}

/** 页面 data / page-meta 首屏所需的主题字段（同步可读） */
function getThemeViewState(theme) {
  const t = theme === 'dark' || theme === 'light' ? theme : resolveTheme()
  const isDark = t === 'dark'
  return {
    theme: t,
    pageBg: getPageBg(t),
    navFrontColor: isDark ? '#ffffff' : '#000000',
    navBg: isDark ? NAV_BG.dark : NAV_BG.light,
    bgTextStyle: isDark ? 'light' : 'dark',
  }
}

const TAB_STYLE = {
  light: {
    color: '#7A8494',
    selectedColor: '#4F5DFF',
    backgroundColor: TAB_BG.light,
    borderStyle: 'black',
  },
  dark: {
    color: '#9AA3B5',
    selectedColor: '#7B88FF',
    backgroundColor: TAB_BG.dark,
    borderStyle: 'black',
  },
}

function getStoredTheme() {
  try {
    const v = wx.getStorageSync(THEME_STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch (e) {
    // ignore
  }
  return 'light'
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light'
  try {
    wx.setStorageSync(THEME_STORAGE_KEY, next)
  } catch (e) {
    // ignore
  }
  return next
}

function toggleTheme() {
  return applyTheme(getStoredTheme() === 'light' ? 'dark' : 'light')
}

function syncNavigationBar(theme) {
  const t = theme === 'dark' || theme === 'light' ? theme : resolveTheme()
  const isDark = t === 'dark'
  wx.setNavigationBarColor({
    frontColor: isDark ? '#ffffff' : '#000000',
    backgroundColor: isDark ? NAV_BG.dark : NAV_BG.light,
    fail() {},
  })
  if (typeof wx.setBackgroundColor === 'function') {
    const bg = getPageBg(isDark ? 'dark' : 'light')
    wx.setBackgroundColor({
      backgroundColor: bg,
      backgroundColorTop: bg,
      backgroundColorBottom: bg,
      fail() {},
    })
  }
  if (typeof wx.setBackgroundTextStyle === 'function') {
    wx.setBackgroundTextStyle({
      textStyle: isDark ? 'light' : 'dark',
      fail() {},
    })
  }
}

/** 跳转前先同步导航/窗口底色，减轻二级页过渡闪白 */
function navigateTo(options) {
  syncNavigationBar(resolveTheme())
  return wx.navigateTo(typeof options === 'string' ? {url: options} : options)
}

module.exports = {
  THEME_STORAGE_KEY,
  NAV_BG,
  TAB_BG,
  PAGE_BG,
  TAB_STYLE,
  getPageBg,
  resolveTheme,
  getThemeViewState,
  getStoredTheme,
  applyTheme,
  toggleTheme,
  syncNavigationBar,
  navigateTo,
}
