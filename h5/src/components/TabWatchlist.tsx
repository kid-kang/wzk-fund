import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import '@/styles/tab-watchlist.css'
import {fetchWatchlist, removeFund, type FundQuoteRow} from '@/lib/api'
import {groupWatchlistByCategory} from '@/lib/fundCategory'
import {formatPct, pctClass} from '@/lib/utils'
import type {AppTheme} from '@/lib/theme'
import DeskSync from '@/components/DeskSync'
import EcLine from '@/components/EcLine'
import SwipeRow from '@/components/SwipeRow'
import {IconCert, IconDelete, IconPlus} from '@/components/icons'

type Props = {
  active: boolean
  theme: AppTheme
  contentMinHeight?: number
  onCountChange?: (count: number) => void
  resumeTick?: number
}

type WatchRow = FundQuoteRow & {
  name: string
  codeMark: string
  nameMarquee: boolean
  pctText: string
  pctClass: string
  confirmPctText: string
  confirmPctClass: string
  discloseTimeText: string
  showDiscloseTime: boolean
  sectorTags: string[]
  hasTags: boolean
}

type WatchGroup = {
  key: string
  title: string
  list: WatchRow[]
}

function NameMarquee({name}: {name: string}) {
  const clipRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)

  useLayoutEffect(() => {
    const clip = clipRef.current
    const measure = measureRef.current
    if (!clip || !measure) return
    setOverflow(clip.clientWidth > 0 && measure.scrollWidth > clip.clientWidth + 1)
  }, [name])

  return (
    <div ref={clipRef} className={`name-clip${overflow ? ' is-marquee' : ''}`}>
      <div className="name-track">
        <span className="dense-name name-unit">{name}</span>
        {overflow ? <span className="dense-name name-unit">{name}</span> : null}
      </div>
      <span ref={measureRef} className="name-measure">
        {name}
      </span>
    </div>
  )
}

export default function TabWatchlist({
  active,
  theme,
  contentMinHeight = 0,
  onCountChange,
  resumeTick = 0,
}: Props) {
  const navigate = useNavigate()
  const loadEpochRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState<WatchGroup[]>([])

  const load = useCallback(async () => {
    const epoch = ++loadEpochRef.current
    setError('')
    try {
      const rows = await fetchWatchlist()
      if (epoch !== loadEpochRef.current) return
      const mapped = (rows || []).map((row) => {
        const name = row.name || row.code || ''
        const confirmPct = row.dayGrowth != null ? row.dayGrowth : row.percent
        const sectors = Array.isArray(row.sectors) ? row.sectors : []
        const sectorTags = sectors
        const confirmedUpdated = !!row.confirmedUpdated
        const discloseTimeText = String(row.discloseTimeText || '').trim()
        const showDiscloseTime = !!discloseTimeText
        return {
          ...row,
          name,
          codeMark: String(row.code || '').slice(-6) || '······',
          nameMarquee: false,
          pctText: formatPct(row.percent),
          pctClass: pctClass(row.percent),
          confirmedUpdated,
          confirmPctText: formatPct(confirmPct),
          confirmPctClass: pctClass(confirmPct),
          discloseTimeText,
          showDiscloseTime,
          sectorTags,
          hasTags: confirmedUpdated || showDiscloseTime || sectorTags.length > 0,
          trend: row.trend || [],
        } as WatchRow
      })
      if (epoch !== loadEpochRef.current) return
      setGroups(groupWatchlistByCategory(mapped))
      onCountChange?.(mapped.length)
      setLoading(false)
    } catch (e) {
      if (epoch !== loadEpochRef.current) return
      setError(e instanceof Error ? e.message : '加载失败')
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    if (!active) return
    void load()
    const timer = window.setInterval(() => void load(), 30000)
    return () => window.clearInterval(timer)
  }, [active, load, resumeTick])

  const onRemove = async (code: string, name: string) => {
    if (!window.confirm(`确认删除 ${name}？`)) return
    try {
      await removeFund(code)
      void load()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  const openQa = (q: string) => {
    navigate(`/fund-qa?q=${encodeURIComponent(q)}`)
  }

  const delColor = theme === 'dark' ? '#FF6B7A' : '#D7263D'
  const fabColor = theme === 'dark' ? '#7b88ff' : '#4f5dff'
  const skeleton = loading && !groups.length && !error

  return (
    <div className={`tab-root theme-${theme}`}>
      <div className="page-scroller" style={{overflowY: 'auto', height: '100%'}}>
        <div
          className={`page theme-${theme} watch-page${skeleton ? ' is-skeleton' : ''}`}
          style={{minHeight: contentMinHeight || undefined}}
        >
          {error ? <div className="err">{error}</div> : null}
          {skeleton ? (
            <DeskSync
              className="desk-sync-fill"
              theme={theme}
              variant="watch"
              minHeight={contentMinHeight}
            />
          ) : null}
          {!loading && !groups.length ? (
            <div className="section-empty">暂无自选，点右下角 + 添加</div>
          ) : null}

          {groups.map((group, index) => (
            <div key={group.key}>
              <div className={`fund-divider${index === 0 ? ' is-first' : ''}`}>
                <div className="fund-divider-main">
                  <div className="fund-divider-line" />
                  <span className="fund-divider-text">{group.title}</span>
                  <div className="fund-divider-line" />
                </div>
              </div>
              <div className="list-gap">
                {group.list.map((item) => (
                  <SwipeRow
                    key={item.code}
                    rightWidth={65}
                    actions={[
                      {
                        key: 'del',
                        label: '删除',
                        className: 'del',
                        icon: <IconDelete size={17} color={delColor} />,
                        onClick: () => void onRemove(item.code, item.name),
                      },
                    ]}
                  >
                    <div className={`glass dense-row tone-${item.pctClass}`}>
                      <div className="dense-row-skin" aria-hidden>
                        <span className="card-mark mono">{item.codeMark}</span>
                      </div>
                      <div className="dense-main">
                        <NameMarquee name={item.name} />
                        {item.hasTags ? (
                          <div className="tag-row">
                            {item.confirmedUpdated && !item.showDiscloseTime ? (
                              <button
                                type="button"
                                className={`confirmed-badge ${item.confirmPctClass}`}
                                aria-label="净值已更新，查看说明"
                                onClick={() => openQa('badge-cn')}
                              >
                                <IconCert size={12} color="currentColor" />
                                {item.confirmPctText !== '--' ? (
                                  <span className="mono">{item.confirmPctText}</span>
                                ) : null}
                              </button>
                            ) : null}
                            {item.showDiscloseTime ? (
                              <button
                                type="button"
                                className={`confirmed-badge is-disclose ${item.confirmPctClass}`}
                                aria-label="官方披露日期，查看说明"
                                onClick={() => openQa('badge-qdii')}
                              >
                                <span className="mono">{item.discloseTimeText}</span>
                              </button>
                            ) : null}
                            {item.sectorTags.map((tag) => (
                              <span className="sector-tag" key={tag}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        className="spark"
                        onClick={() => {
                          const q = item.name
                            ? `code=${item.code}&name=${encodeURIComponent(item.name)}`
                            : `code=${item.code}`
                          navigate(`/fund-trend?${q}`)
                        }}
                      >
                        {item.trend?.length ? (
                          <EcLine
                            points={item.trend}
                            valueKey="growth"
                            mode="spark"
                            theme={theme}
                            height={40}
                            toneDelta={item.percent}
                          />
                        ) : null}
                      </button>

                      <div className="dense-right">
                        <button
                          type="button"
                          className={`mono dense-pct pct-lg ${item.pctClass}`}
                          aria-label="查看涨跌幅说明"
                          onClick={() => openQa('a-share')}
                        >
                          {item.pctText}
                        </button>
                      </div>
                    </div>
                  </SwipeRow>
                ))}
              </div>
            </div>
          ))}

          {groups.length ? <div className="fab-spacer" aria-hidden /> : null}
        </div>
      </div>

      <button
        type="button"
        className="fab-add"
        aria-label="添加自选"
        onClick={() => navigate('/fund-form?mode=watch')}
      >
        <IconPlus size={22} color={fabColor} />
      </button>
    </div>
  )
}
