export type AppTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'wzk-fund-theme'

export function getStoredTheme(): AppTheme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'dark' || v === 'light') return v
  } catch {
    // ignore
  }
  return 'light'
}

export function applyTheme(theme: AppTheme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.remove('theme-light', 'theme-dark')
  root.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark')
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

export function toggleTheme(): AppTheme {
  const next: AppTheme = getStoredTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}

export function getThemeViewState(theme?: AppTheme) {
  const t = theme || getStoredTheme()
  const dark = t === 'dark'
  return {
    theme: t,
    pageBg: dark ? '#0B1018' : '#EEF1F8',
    navBg: dark ? '#121722' : '#EEF1F8',
    navFrontColor: dark ? '#ffffff' : '#000000',
    bgTextStyle: dark ? 'light' : 'dark',
  } as const
}
