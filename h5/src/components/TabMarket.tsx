import {useCallback, useEffect, useMemo, useState} from 'react'
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

const INDEX_SHORT: Record<string, string> = {
  '000001': '上证',
  '399001': '深成',
  '399006': '创业',
  '899050': '北证',
  '000688': '科创',
  '000016': '上证50',
  '000300': '沪深300',
  '000905': '中证500',
  NDX: '纳指',
  SPX: '标普',
}

type IndexRow = IndexItem & {shortName: string; pctText: string; pctClass: string}
type SectorRow = SectorItem & {pctText: string; pctClass: string}
type MarketView = {
  upDown: MarketOverview['upDown'] & {
    upPctText: string
    downPctText: string
    upBarPct: number
  }
  hotSearch: SectorRow[]
  boardGainers: SectorRow[]
}

type BoardTab = 'hot' | 'gainers'

function mapSector(row: SectorItem): SectorRow {
  return {
    ...row,
    pctText: formatPct(row.percent),
    pctClass: pctClass(row.percent),
  }
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
  const [boardTab, setBoardTab] = useState<BoardTab>('gainers')

  const load = useCallback(async () => {
    setError('')
    try {
      const results = await Promise.allSettled([fetchIndices(), fetchMarketOverview()])
      const [i, m] = results
      if (i.status === 'fulfilled') {
        setIndices(
          (i.value || []).map((row) => ({
            ...row,
            shortName: INDEX_SHORT[row.code] || row.name,
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
        const upShare = (up / traded) * 100
        setMarket({
          upDown: {
            ...ud,
            up,
            down,
            flat,
            upPctText: `${upShare.toFixed(1)}%`,
            downPctText: `${((down / traded) * 100).toFixed(1)}%`,
            upBarPct: upShare,
          },
          hotSearch: (raw.hotSearch || []).map(mapSector),
          boardGainers: (raw.boardGainers || []).map(mapSector),
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

  const boardList = useMemo(() => {
    if (!market) return []
    const gainers = market.boardGainers
    const hot = market.hotSearch.length ? market.hotSearch : gainers
    const rows = boardTab === 'hot' ? hot : gainers
    return rows.map((row, idx) => {
      const rank = idx + 1
      return {
        ...row,
        rankText: rank < 10 ? `0${rank}` : String(rank),
        topClass: rank === 1 ? 'is-gold' : rank === 2 ? 'is-silver' : rank === 3 ? 'is-bronze' : '',
      }
    })
  }, [market, boardTab])

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

          {market || indices.length ? (
            <div className="market-stack">
              {market ? (
                <div className="glass pulse">
                  <div className="pulse-meta">
                    <div className="pulse-side">
                      <span className="pulse-k rise">涨</span>
                      <span className="mono pulse-p rise">{market.upDown.upPctText}</span>
                    </div>
                    <div className="pulse-side pulse-side-r">
                      <span className="mono pulse-p fall">{market.upDown.downPctText}</span>
                      <span className="pulse-k fall">跌</span>
                    </div>
                  </div>
                  <div className="pulse-track">
                    <div
                      className="pulse-fill"
                      style={{width: `${market.upDown.upBarPct}%`}}
                    />
                  </div>
                </div>
              ) : null}

              {indices.length ? (
                <div className="glass index-board">
                  {indices.map((item) => (
                    <button
                      type="button"
                      className="index-cell"
                      key={item.code}
                      onClick={() =>
                        navigate(
                          `/index-trend?code=${item.code}&name=${encodeURIComponent(item.name || '')}`,
                        )
                      }
                    >
                      <span className="index-name">{item.shortName}</span>
                      <span className={`mono index-pct ${item.pctClass}`}>{item.pctText}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {market ? (
                <div className="glass board-rank">
                  <div className="rank-head">
                    <span className="rank-title">今日板块榜</span>
                    <div className="rank-tabs">
                      <button
                        type="button"
                        className={`rank-tab${boardTab === 'hot' ? ' is-on' : ''}`}
                        onClick={() => setBoardTab('hot')}
                      >
                        热搜
                      </button>
                      <button
                        type="button"
                        className={`rank-tab${boardTab === 'gainers' ? ' is-on' : ''}`}
                        onClick={() => setBoardTab('gainers')}
                      >
                        涨幅
                      </button>
                    </div>
                  </div>
                  <div className="rank-list">
                    {boardList.map((item) => (
                      <button
                        type="button"
                        className="rank-row"
                        key={`${boardTab}-${item.code}`}
                        onClick={() => {
                          if (!item.mappingCode) {
                            window.alert('该板块暂无基金列表')
                            return
                          }
                          const q = new URLSearchParams({
                            mappingCode: item.mappingCode,
                            name: item.name || '',
                            sectorCode: item.sectorCode || item.code || '',
                          })
                          navigate(`/sector-funds?${q.toString()}`)
                        }}
                      >
                        <span className={`rank-no ${item.topClass}`}>{item.rankText}</span>
                        <span className="rank-name">{item.name}</span>
                        <span className={`mono rank-pct ${item.pctClass}`}>{item.pctText}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
