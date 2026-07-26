import {useEffect, useRef, useState} from 'react'
import '@/styles/gold-trend.css'
import AppNavBar from '@/components/AppNavBar'
import EcLine from '@/components/EcLine'
import FortuneWatermark from '@/components/FortuneWatermark'
import {fetchGold, fetchGoldHistory, type GoldHistoryRange} from '@/lib/api'
import {formatAmount, formatPct} from '@/lib/utils'
import {getStoredTheme, type AppTheme} from '@/lib/theme'

const RANGES: {key: 'intraday' | GoldHistoryRange; label: string}[] = [
  {key: 'intraday', label: '分时'},
  {key: '1m', label: '近1月'},
  {key: '3m', label: '近3月'},
  {key: '6m', label: '近6月'},
  {key: '1y', label: '近1年'},
]

export default function GoldTrendPage() {
  const theme: AppTheme = getStoredTheme()
  const [range, setRange] = useState<'intraday' | GoldHistoryRange>('intraday')
  const [points, setPoints] = useState<Record<string, unknown>[]>([])
  const [priceText, setPriceText] = useState('--')
  const [periodText, setPeriodText] = useState('--')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartHeight] = useState(() =>
    Math.max(260, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 375) * 0.72)),
  )
  const chartEpoch = useRef(0)
  const rangeRef = useRef(range)

  useEffect(() => {
    rangeRef.current = range
  }, [range])

  const loadIntraday = async (reqRange: string, reqEpoch: number) => {
    const gold = await fetchGold()
    if (reqRange !== rangeRef.current || reqEpoch !== chartEpoch.current) return
    const trend = (gold.trend || [])
      .filter((p) => p && p.price != null)
      .map((p) => ({
        time: p.time,
        price: Number(p.price),
        date: p.time,
      }))
    const periodPercent =
      gold.percent == null || Number.isNaN(Number(gold.percent))
        ? null
        : Number(gold.percent)
    setPoints(trend)
    setPriceText(gold.price != null ? formatAmount(gold.price, 2) : '--')
    setPeriodText(formatPct(periodPercent))
    setLoading(false)
  }

  const loadHistory = async (reqRange: GoldHistoryRange, reqEpoch: number) => {
    const data = await fetchGoldHistory(reqRange)
    if (reqRange !== rangeRef.current || reqEpoch !== chartEpoch.current) return
    const next = (data.points || []).map((p) => ({
      date: p.date,
      time: p.date,
      price: p.close != null ? Number(p.close) : Number(p.price),
    }))
    const last = next.length ? (next[next.length - 1].price as number) : null
    const periodPercent =
      data.periodPercent == null || Number.isNaN(Number(data.periodPercent))
        ? null
        : Number(data.periodPercent)
    setPoints(next)
    setPriceText(last != null ? formatAmount(last, 2) : '--')
    setPeriodText(formatPct(periodPercent))
    setLoading(false)
  }

  const load = async (reqRange = range, reqEpoch = chartEpoch.current) => {
    setLoading(true)
    setError('')
    setPoints([])
    try {
      if (reqRange === 'intraday') {
        await loadIntraday(reqRange, reqEpoch)
      } else {
        await loadHistory(reqRange, reqEpoch)
      }
    } catch (e) {
      if (reqRange !== rangeRef.current || reqEpoch !== chartEpoch.current) return
      setError(e instanceof Error ? e.message : '加载失败')
      setLoading(false)
      setPoints([])
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onRangeTap = (key: 'intraday' | GoldHistoryRange) => {
    if (!key || key === range) return
    chartEpoch.current += 1
    setRange(key)
    setPeriodText('--')
    void load(key, chartEpoch.current)
  }

  return (
    <div className={`subpage-root theme-${theme}`}>
      <div className="subpage-nav">
        <AppNavBar title="金价走势" theme={theme} />
      </div>
      <div className="subpage-scroller" style={{overflowY: 'auto'}}>
        <div className={`page theme-${theme} gold-trend`}>
          <FortuneWatermark />
          <div className="trend-fg">
            <div className="ticket">
              <div className="ticket-id">
                <div className="ticket-meta">
                  <span className="ticket-code mono">AU9999</span>
                  <span className="ticket-sep">·</span>
                  <span className="ticket-name">沪金99</span>
                </div>
                <div className="ticket-live">
                  <span className="ticket-live-k">当前金价</span>
                  <span className="ticket-live-v mono">{priceText}</span>
                </div>
              </div>
              <div className="ticket-rule" aria-hidden />
            </div>

            <div className="range-scroll" style={{overflowX: 'auto', display: 'flex'}}>
              {RANGES.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`range-chip${range === item.key ? ' is-on' : ''}`}
                  onClick={() => onRangeTap(item.key)}
                >
                  <span className="range-label">{item.label}</span>
                  {range === item.key ? (
                    <span className="range-pct mono">{periodText}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {error ? <div className="err">{error}</div> : null}
            {loading ? <div className="section-empty">加载中…</div> : null}
            {!loading && !points.length ? (
              <div className="section-empty">暂无数据</div>
            ) : null}

            {!loading && points.length ? (
              <div className="chart-stage">
                <EcLine
                  points={points}
                  valueKey="price"
                  mode="trend"
                  theme={theme}
                  valueMode="price"
                  showExtremes
                  range={range === 'intraday' ? '' : range}
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
