import {useCallback, useEffect, useMemo, useState} from 'react'
import '@/styles/main.css'
import AppNavBar from '@/components/AppNavBar'
import AppTabBar, {type TabKey} from '@/components/AppTabBar'
import TabHoldings from '@/components/TabHoldings'
import TabWatchlist from '@/components/TabWatchlist'
import TabMarket from '@/components/TabMarket'
import TabMine from '@/components/TabMine'
import {getStoredTheme, type AppTheme} from '@/lib/theme'

const TAB_TITLES: Record<TabKey, string> = {
  holdings: '持仓',
  watchlist: '自选',
  market: '行情',
  mine: '我的',
}

type Props = {
  /** 壳是否前台可见（从二级页返回时为 true） */
  visible?: boolean
}

function calcContentMinHeight() {
  if (typeof window === 'undefined') return 0
  const w = Math.min(window.innerWidth, 480)
  const h = window.innerHeight
  const tabBarPx = (100 * w) / 750 + 8
  const navPx = 44 + 12
  return Math.max(0, Math.floor(h - tabBarPx - navPx))
}

export default function MainPage({visible = true}: Props) {
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme())
  const [activeTab, setActiveTab] = useState<TabKey>('holdings')
  const [watchCount, setWatchCount] = useState(0)
  const [contentMinHeight, setContentMinHeight] = useState(0)
  const [mounted, setMounted] = useState<Record<TabKey, boolean>>({
    holdings: true,
    watchlist: false,
    market: false,
    mine: false,
  })
  const [resumeTick, setResumeTick] = useState(0)

  useEffect(() => {
    const update = () => setContentMinHeight(calcContentMinHeight())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!visible) return
    setTheme(getStoredTheme())
    setResumeTick((n) => n + 1)
    document.title =
      activeTab === 'watchlist' ? `自选(${watchCount || 0})` : TAB_TITLES[activeTab] || 'WZK Fund'
  }, [visible, activeTab, watchCount])

  const navTitle = useMemo(() => {
    if (activeTab === 'watchlist') return `自选(${watchCount || 0})`
    return TAB_TITLES[activeTab] || 'WZK Fund'
  }, [activeTab, watchCount])

  const onTabChange = (key: TabKey) => {
    if (key === activeTab) return
    setMounted((prev) => ({...prev, [key]: true}))
    setActiveTab(key)
  }

  const onWatchCount = useCallback((count: number) => {
    setWatchCount(count)
  }, [])

  return (
    <div className={`main-shell theme-${theme}`}>
      <AppNavBar title={navTitle} theme={theme} showBack={false} />
      <div className="main-panels">
        <div
          className="main-panel"
          style={{display: activeTab === 'holdings' ? 'block' : 'none'}}
        >
          {mounted.holdings ? (
            <TabHoldings
              active={visible && activeTab === 'holdings'}
              theme={theme}
              contentMinHeight={contentMinHeight}
              resumeTick={resumeTick}
            />
          ) : null}
        </div>
        <div
          className="main-panel"
          style={{display: activeTab === 'watchlist' ? 'block' : 'none'}}
        >
          {mounted.watchlist ? (
            <TabWatchlist
              active={visible && activeTab === 'watchlist'}
              theme={theme}
              contentMinHeight={contentMinHeight}
              onCountChange={onWatchCount}
              resumeTick={resumeTick}
            />
          ) : null}
        </div>
        <div
          className="main-panel"
          style={{display: activeTab === 'market' ? 'block' : 'none'}}
        >
          {mounted.market ? (
            <TabMarket
              active={visible && activeTab === 'market'}
              theme={theme}
              contentMinHeight={contentMinHeight}
              resumeTick={resumeTick}
            />
          ) : null}
        </div>
        <div className="main-panel" style={{display: activeTab === 'mine' ? 'block' : 'none'}}>
          {mounted.mine ? (
            <TabMine
              active={visible && activeTab === 'mine'}
              theme={theme}
              contentMinHeight={contentMinHeight}
              onThemeChange={setTheme}
            />
          ) : null}
        </div>
      </div>
      <AppTabBar active={activeTab} theme={theme} onChange={onTabChange} />
    </div>
  )
}
