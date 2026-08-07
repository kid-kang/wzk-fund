import {useCallback, useEffect, useState} from 'react'
import {FolderSync, Moon, RefreshCw, Sun} from 'lucide-react'
import {
  fetchGold,
  fetchHoldings,
  fetchIndices,
  fetchMarketOverview,
  fetchSettings,
  fetchWatchlist,
  updateSettings,
  type FundQuoteRow,
  type GoldPayload,
  type HoldingsPayload,
  type IndexItem,
  type MarketOverview,
} from '@/lib/api'
import {applyTheme, getStoredTheme, type AppTheme} from '@/lib/theme'
import {Button} from '@/components/ui/button'
import {HoldingsModule} from '@/components/HoldingsModule'
import {WatchlistModule} from '@/components/WatchlistModule'
import {BreadthModule, IndicesModule, MarketModule} from '@/components/MarketModules'
import {ConfigDialog} from '@/components/ConfigDialog'
import './index.css'

const REFRESH_MS = 30_000

export default function App() {
  const [holdings, setHoldings] = useState<HoldingsPayload | null>(null)
  const [watchlist, setWatchlist] = useState<FundQuoteRow[]>([])
  const [indices, setIndices] = useState<IndexItem[]>([])
  const [market, setMarket] = useState<MarketOverview | null>(null)
  const [gold, setGold] = useState<GoldPayload | null>(null)
  const [showGold, setShowGold] = useState(true)
  const [togglingGold, setTogglingGold] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string>('')
  const [error, setError] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [theme, setTheme] = useState<AppTheme>(() => getStoredTheme())

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const results = await Promise.allSettled([
        fetchHoldings(),
        fetchWatchlist(),
        fetchIndices(),
        fetchMarketOverview(),
        fetchGold(),
        fetchSettings(),
      ])
      const [h, w, i, m, g, s] = results
      if (h.status === 'fulfilled') setHoldings(h.value)
      if (w.status === 'fulfilled') setWatchlist(w.value)
      if (i.status === 'fulfilled') setIndices(i.value)
      if (m.status === 'fulfilled') setMarket(m.value)
      if (g.status === 'fulfilled') setGold(g.value)
      if (s.status === 'fulfilled') setShowGold(s.value?.showGold !== false)

      const failed = results.find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined
      if (failed && results.every((r) => r.status === 'rejected')) {
        setError((failed.reason as Error)?.message || '加载失败，请确认代理服务已启动')
      } else if (failed) {
        console.warn('[refresh partial fail]', failed.reason)
      }
      setUpdatedAt(new Date().toLocaleTimeString('zh-CN', {hour12: false}))
    } catch (e: unknown) {
      setError((e as Error)?.message || '加载失败，请确认代理服务已启动')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    load()
    const timer = window.setInterval(() => load(true), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [load])

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  async function toggleGold() {
    const next = !showGold
    setTogglingGold(true)
    try {
      await updateSettings({showGold: next})
      setShowGold(next)
    } finally {
      setTogglingGold(false)
    }
  }

  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-40 w-full border-b border-line/80 bg-panel/85 backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-3 px-3 py-3 sm:px-5 lg:px-8">
          <div className="min-w-0">
            <div className="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl lg:text-3xl">
              WZK Fund
            </div>
            <p className="truncate text-[11px] text-muted sm:text-xs lg:text-sm">
              持仓 / 黄金 / 指数 / 大盘 / 自选
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden font-mono text-xs text-muted md:inline">
              {updatedAt ? `更新 ${updatedAt}` : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void toggleGold()}
              disabled={togglingGold}
              title={showGold ? '隐藏黄金板块' : '显示黄金板块'}
            >
              <span className="sm:hidden">{showGold ? '金开' : '金关'}</span>
              <span className="hidden sm:inline">{showGold ? '关闭黄金板块' : '打开黄金板块'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleTheme}
              title={theme === 'light' ? '切换暗色' : '切换亮色'}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span className="hidden sm:inline">{theme === 'light' ? '暗色' : '亮色'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
              <FolderSync className="h-4 w-4" />
              <span className="hidden sm:inline">配置</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">刷新</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex w-full flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-5 sm:py-6 lg:px-8">
        {error ? (
          <div className="rounded-xl border border-rise/30 bg-rise/5 px-4 py-3 text-sm text-rise">
            {error}
          </div>
        ) : null}

        <HoldingsModule
          data={holdings}
          gold={gold}
          showGold={showGold}
          loading={loading}
          onChanged={() => load(true)}
        />

        <BreadthModule data={market} loading={loading} />
        <IndicesModule list={indices} loading={loading} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
          <MarketModule data={market} loading={loading} />
          <WatchlistModule list={watchlist} loading={loading} onChanged={() => load(true)} />
        </div>

        <footer className="mx-auto max-w-3xl space-y-1 pb-6 pt-1 text-center text-[11px] leading-relaxed text-muted sm:text-xs">
          <p>数据来自第三方公开接口，可能延迟或不准确，仅供个人展示参考，不构成投资建议。</p>
          <p>持仓等个人配置保存在本机浏览器；请以官方披露为准。</p>
        </footer>
      </main>

      <ConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        onImported={() => load(true)}
      />
    </div>
  )
}
