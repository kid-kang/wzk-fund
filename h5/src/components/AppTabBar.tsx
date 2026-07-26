import '@/styles/app-tab-bar.css'
import type {AppTheme} from '@/lib/theme'

import holdings from '@/assets/tab/holdings.png'
import holdingsActive from '@/assets/tab/holdings-active.png'
import holdingsDark from '@/assets/tab/holdings-dark.png'
import holdingsDarkActive from '@/assets/tab/holdings-dark-active.png'
import watchlist from '@/assets/tab/watchlist.png'
import watchlistActive from '@/assets/tab/watchlist-active.png'
import watchlistDark from '@/assets/tab/watchlist-dark.png'
import watchlistDarkActive from '@/assets/tab/watchlist-dark-active.png'
import market from '@/assets/tab/market.png'
import marketActive from '@/assets/tab/market-active.png'
import marketDark from '@/assets/tab/market-dark.png'
import marketDarkActive from '@/assets/tab/market-dark-active.png'
import mine from '@/assets/tab/mine.png'
import mineActive from '@/assets/tab/mine-active.png'
import mineDark from '@/assets/tab/mine-dark.png'
import mineDarkActive from '@/assets/tab/mine-dark-active.png'

export type TabKey = 'holdings' | 'watchlist' | 'market' | 'mine'

type Props = {
  active: TabKey
  theme: AppTheme
  onChange: (key: TabKey) => void
}

const TAB_META: {key: TabKey; text: string}[] = [
  {key: 'holdings', text: '持仓'},
  {key: 'watchlist', text: '自选'},
  {key: 'market', text: '行情'},
  {key: 'mine', text: '我的'},
]

const ICONS: Record<
  TabKey,
  {light: string; lightActive: string; dark: string; darkActive: string}
> = {
  holdings: {
    light: holdings,
    lightActive: holdingsActive,
    dark: holdingsDark,
    darkActive: holdingsDarkActive,
  },
  watchlist: {
    light: watchlist,
    lightActive: watchlistActive,
    dark: watchlistDark,
    darkActive: watchlistDarkActive,
  },
  market: {
    light: market,
    lightActive: marketActive,
    dark: marketDark,
    darkActive: marketDarkActive,
  },
  mine: {
    light: mine,
    lightActive: mineActive,
    dark: mineDark,
    darkActive: mineDarkActive,
  },
}

function iconFor(theme: AppTheme, key: TabKey, isActive: boolean) {
  const pack = ICONS[key]
  if (theme === 'dark') return isActive ? pack.darkActive : pack.dark
  return isActive ? pack.lightActive : pack.light
}

export default function AppTabBar({active, theme, onChange}: Props) {
  return (
    <div className={`tab-bar theme-${theme}`}>
      {TAB_META.map((item) => {
        const isActive = active === item.key
        return (
          <button
            key={item.key}
            type="button"
            className={`tab-item${isActive ? ' is-active' : ''}`}
            onClick={() => {
              if (item.key !== active) onChange(item.key)
            }}
          >
            <img className="tab-icon" src={iconFor(theme, item.key, isActive)} alt="" />
            <span className="tab-text">{item.text}</span>
          </button>
        )
      })}
    </div>
  )
}
