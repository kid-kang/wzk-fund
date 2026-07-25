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

const TAB_ITEMS = [
  {pagePath: 'pages/holdings/holdings', text: '持仓', key: 'holdings'},
  {pagePath: 'pages/watchlist/watchlist', text: '自选', key: 'watchlist'},
  {pagePath: 'pages/market/market', text: '行情', key: 'market'},
  {pagePath: 'pages/mine/mine', text: '我的', key: 'mine'},
]

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

function tabIconPaths(theme, key) {
  if (theme === 'dark') {
    return {
      iconPath: `assets/tab/${key}-dark.png`,
      selectedIconPath: `assets/tab/${key}-dark-active.png`,
    }
  }
  return {
    iconPath: `assets/tab/${key}.png`,
    selectedIconPath: `assets/tab/${key}-active.png`,
  }
}

function syncTabBar(theme) {
  if (typeof wx.setTabBarStyle !== 'function') return
  const style = theme === 'dark' ? TAB_STYLE.dark : TAB_STYLE.light
  wx.setTabBarStyle({
    color: style.color,
    selectedColor: style.selectedColor,
    backgroundColor: style.backgroundColor,
    borderStyle: style.borderStyle,
    fail() {},
  })
  if (typeof wx.setTabBarItem !== 'function') return
  TAB_ITEMS.forEach((item, index) => {
    const icons = tabIconPaths(theme, item.key)
    wx.setTabBarItem({
      index,
      text: item.text,
      iconPath: icons.iconPath,
      selectedIconPath: icons.selectedIconPath,
      fail() {},
    })
  })
}

function syncNavigationBar(theme) {
  const isDark = theme === 'dark'
  wx.setNavigationBarColor({
    frontColor: isDark ? '#ffffff' : '#000000',
    backgroundColor: isDark ? NAV_BG.dark : NAV_BG.light,
    fail() {},
  })
  if (typeof wx.setBackgroundColor === 'function') {
    const bg = isDark ? '#0b1018' : '#eef1f8'
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
  syncTabBar(theme)
}

module.exports = {
  THEME_STORAGE_KEY,
  NAV_BG,
  TAB_BG,
  TAB_STYLE,
  getStoredTheme,
  applyTheme,
  toggleTheme,
  syncNavigationBar,
  syncTabBar,
}
