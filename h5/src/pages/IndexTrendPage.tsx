import {useEffect, useRef, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import '@/styles/index-trend.css'
import AppNavBar from '@/components/AppNavBar'
import EcLine from '@/components/EcLine'
import FortuneWatermark from '@/components/FortuneWatermark'
import {
  fetchIndexHistory,
  type IndexHistoryPayload,
  type IndexHistoryRange,
} from '@/lib/api'
import {formatPct, pctClass} from '@/lib/utils'
import {getStoredTheme, type AppTheme} from '@/lib/theme'

const RANGES: {key: IndexHistoryRange; label: string}[] = [
  {key: '1m', label: '近1月'},
  {key: '3m', label: '近3月'},
  {key: '6m', label: '近6月'},
  {key: '1y', label: '近1年'},
  {key: '3y', label: '近3年'},
]

type RangeChip = {
  key: IndexHistoryRange
  label: string
  pctText: string
  pctClass: string
}

function emptyRanges(): RangeChip[] {
  return RANGES.map((t) => ({...t, pctText: '--', pctClass: 'flat'}))
}

export default function IndexTrendPage() {
  const [params] = useSearchParams()
  const theme: AppTheme = getStoredTheme()
  const code = String(params.get('code') || '')
  const [name, setName] = useState(
    params.get('name') ? decodeURIComponent(params.get('name') || '') : '',
  )
  const [range, setRange] = useState<IndexHistoryRange>('3m')
  const [ranges, setRanges] = useState<RangeChip[]>(emptyRanges)
  const [chartPoints, setChartPoints] = useState<Record<string, unknown>[]>([])
  const [chartHeight] = useState(() =>
    Math.max(260, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 375) * 0.72)),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const byRange = useRef<Record<string, IndexHistoryPayload>>({})
  const chartEpoch = useRef(0)
  const rangeRef = useRef(range)

  useEffect(() => {
    rangeRef.current = range
  }, [range])

  const refreshRanges = () => {
    setRanges(
      RANGES.map((t) => {
        const hist = byRange.current[t.key]
        const pct = hist ? hist.periodPercent : null
        return {...t, pctText: formatPct(pct), pctClass: pctClass(pct)}
      }),
    )
  }

  const mergeByRange = (r: IndexHistoryRange, data: IndexHistoryPayload) => {
    byRange.current = {...byRange.current, [r]: data}
    if (data?.name) setName(data.name)
    refreshRanges()
    return data
  }

  const fetchAndStoreRange = async (r: IndexHistoryRange) => {
    const cached = byRange.current[r]
    if (cached) {
      refreshRanges()
      return cached
    }
    const data = await fetchIndexHistory(code, r)
    return mergeByRange(r, data)
  }

  const applyChart = (r: IndexHistoryRange) => {
    const hist = byRange.current[r]
    if (!hist) {
      setChartPoints([])
      return
    }
    if (hist.name && hist.name !== name) setName(hist.name)
    setChartPoints(
      (hist.points || []).map((p) => ({
        date: p.date,
        value: p.percent,
        percent: p.percent,
        close: p.close,
      })),
    )
    setError('')
    refreshRanges()
  }

  const prefetchHistory = () => {
    RANGES.forEach((t) => {
      const r = t.key
      if (byRange.current[r]) return
      fetchIndexHistory(code, r)
        .then((data) => {
          if (byRange.current[r]) return
          mergeByRange(r, data)
        })
        .catch(() => {})
    })
  }

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        await fetchAndStoreRange('3m')
        if (cancelled) return
        applyChart('3m')
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setLoading(false)
        setError(e instanceof Error ? e.message : '加载失败')
        setChartPoints([])
      }
      prefetchHistory()
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const onRangeTap = async (key: IndexHistoryRange) => {
    if (!key || key === range) return
    const epoch = ++chartEpoch.current
    const cached = byRange.current[key]
    setRange(key)
    setError('')
    setChartPoints([])
    if (cached) {
      setLoading(false)
      applyChart(key)
      return
    }
    setLoading(true)
    try {
      await fetchAndStoreRange(key)
      if (key !== rangeRef.current || epoch !== chartEpoch.current) return
      setLoading(false)
      applyChart(key)
    } catch (e) {
      if (key !== rangeRef.current || epoch !== chartEpoch.current) return
      setLoading(false)
      setError(e instanceof Error ? e.message : '加载失败')
      setChartPoints([])
    }
  }

  return (
    <div className={`subpage-root theme-${theme}`}>
      <div className="subpage-nav">
        <AppNavBar title="指数走势" theme={theme} />
      </div>
      <div className="subpage-scroller" style={{overflowY: 'auto'}}>
        <div className={`page theme-${theme} index-trend`}>
          <FortuneWatermark />
          <div className="trend-fg">
            <div className="ticket">
              <div className="ticket-id">
                <div className="ticket-meta">
                  <span className="ticket-code mono">{code}</span>
                  <span className="ticket-sep">·</span>
                  <span className="ticket-name">{name || '指数走势'}</span>
                </div>
              </div>
              <div className="ticket-rule" aria-hidden />
            </div>

            <div className="range-scroll" style={{overflowX: 'auto', display: 'flex'}}>
              {ranges.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`range-chip${range === item.key ? ' is-on' : ''}`}
                  onClick={() => void onRangeTap(item.key)}
                >
                  <span className="range-label">{item.label}</span>
                  <span className={`range-pct mono ${item.pctClass}`}>{item.pctText}</span>
                </button>
              ))}
            </div>

            {error ? <div className="err">{error}</div> : null}
            {loading ? <div className="section-empty">加载中…</div> : null}
            {!loading && !chartPoints.length ? (
              <div className="section-empty">暂无该周期数据</div>
            ) : null}

            {!loading && chartPoints.length ? (
              <div className="chart-stage">
                <EcLine
                  points={chartPoints}
                  valueKey="value"
                  mode="trend"
                  theme={theme}
                  valueMode="percent"
                  extraKey="close"
                  extraLabel="收盘"
                  showExtremes
                  range={range}
                  height={chartHeight}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
