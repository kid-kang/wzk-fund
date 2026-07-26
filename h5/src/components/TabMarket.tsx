import {useCallback, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import '@/styles/tab-market.css'
import {
  fetchIndices,
  fetchMarketOverview,
  type IndexItem,
  type MarketOverview,
  type SectorItem,
} from '@/lib/api'
import {formatPct, pctClass} from '@/lib/utils'
import type {AppTheme} from '@/lib/theme'
import DeskSync from '@/components/DeskSync'

type Props = {
  active: boolean
  theme: AppTheme
  contentMinHeight?: number
  resumeTick?: number
}

type IndexRow = IndexItem & {pctText: string; pctClass: string}
type SectorRow = SectorItem & {pctText: string}
type MarketView = {
  upDown: MarketOverview['upDown'] & {
    upPctText: string
    downPctText: string
  }
  topGainers: SectorRow[]
  topLosers: SectorRow[]
}

export default function TabMarket({
  active,
  theme,
  contentMinHeight = 0,
  resumeTick = 0,
}: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [indices, setIndices] = useState<IndexRow[]>([])
  const [market, setMarket] = useState<MarketView | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const results = await Promise.allSettled([fetchIndices(), fetchMarketOverview()])
      const [i, m] = results
      if (i.status === 'fulfilled') {
        setIndices(
          (i.value || []).map((row) => ({
            ...row,
            pctText: formatPct(row.percent),
            pctClass: pctClass(row.percent),
          })),
        )
      }
      if (m.status === 'fulfilled') {
        const raw = m.value || ({} as MarketOverview)
        const ud = raw.upDown || {up: 0, down: 0, flat: 0, time: null}
        const up = Number(ud.up) || 0
        const down = Number(ud.down) || 0
        const flat = Number(ud.flat) || 0
        const traded = Math.max(up + down, 1)
        setMarket({
          upDown: {
            ...ud,
            up,
            down,
            flat,
            upPctText: `(${((up / traded) * 100).toFixed(1)}%)`,
            downPctText: `(${((down / traded) * 100).toFixed(1)}%)`,
          },
          topGainers: (raw.topGainers || []).map((row) => ({
            ...row,
            pctText: formatPct(row.percent),
          })),
          topLosers: (raw.topLosers || []).map((row) => ({
            ...row,
            pctText: formatPct(row.percent),
          })),
        })
      }
      if (results.every((r) => r.status === 'rejected')) {
        const failed = results[0] as PromiseRejectedResult
        setError(failed.reason?.message || '加载失败')
      }
      setLoading(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => window.clearInterval(timer)
  }, [active, load, resumeTick])

  const skeleton = loading && !market && !indices.length && !error

  return (
    <div className={`tab-root theme-${theme}`}>
      <div className="page-scroller" style={{overflowY: 'auto', height: '100%'}}>
        <div
          className={`page theme-${theme}${skeleton ? ' is-skeleton' : ''}`}
          style={{minHeight: contentMinHeight || undefined}}
        >
          {error ? <div className="err">{error}</div> : null}
          {skeleton ? (
            <DeskSync
              className="desk-sync-fill"
              theme={theme}
              variant="market"
              minHeight={contentMinHeight}
            />
          ) : null}

          {market ? (
            <div className="board">
              <div className="glass board-col">
                <div className="col-h rise">
                  <span className="col-title">涨幅</span>
                  <span className="mono col-stat">
                    {market.upDown.up} {market.upDown.upPctText}
                  </span>
                </div>
                {market.topGainers.map((item) => (
                  <div className="s-row" key={item.code}>
                    <span className="s-name">{item.name}</span>
                    <span className="mono rise">{item.pctText}</span>
                  </div>
                ))}
              </div>
              <div className="glass board-col">
                <div className="col-h fall">
                  <span className="col-title">跌幅</span>
                  <span className="mono col-stat">
                    {market.upDown.down} {market.upDown.downPctText}
                  </span>
                </div>
                {market.topLosers.map((item) => (
                  <div className="s-row" key={item.code}>
                    <span className="s-name">{item.name}</span>
                    <span className="mono fall">{item.pctText}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="index-grid">
            {indices.map((item) => (
              <button
                type="button"
                className="glass index-card"
                key={item.code}
                onClick={() =>
                  navigate(
                    `/index-trend?code=${item.code}&name=${encodeURIComponent(item.name || '')}`,
                  )
                }
              >
                <span className="index-name">{item.name}</span>
                <span className={`mono index-pct ${item.pctClass}`}>{item.pctText}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
