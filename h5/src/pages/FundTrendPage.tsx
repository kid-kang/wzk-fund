import {useEffect, useRef, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import '@/styles/fund-trend.css'
import AppNavBar from '@/components/AppNavBar'
import EcLine from '@/components/EcLine'
import FortuneWatermark from '@/components/FortuneWatermark'
import {
  fetchFundHistory,
  fetchFundHoldings,
  fetchFundQuote,
  type FundHoldingRow,
  type FundHistoryPayload,
  type FundHistoryRange,
} from '@/lib/api'
import {
  availableFundRanges,
  defaultFundRange,
  formatFundAge,
  formatPct,
  isFundRangeAvailable,
  pctClass,
} from '@/lib/utils'
import {getStoredTheme, type AppTheme} from '@/lib/theme'

type RangeChip = {
  key: FundHistoryRange
  label: string
  pctText: string
  pctClass: string
}

function emptyRanges(ageDays: number | null): RangeChip[] {
  return availableFundRanges(ageDays).map((t) => ({
    ...t,
    pctText: '--',
    pctClass: 'flat',
  }))
}

/** 停留详情页时重仓行情轮询间隔 */
const HOLDINGS_POLL_MS = 60 * 1000

export default function FundTrendPage() {
  const [params] = useSearchParams()
  const theme: AppTheme = getStoredTheme()
  const code = String(params.get('code') || '').padStart(6, '0')
  const [name, setName] = useState(
    params.get('name') ? decodeURIComponent(params.get('name') || '') : '',
  )
  const [ageDays, setAgeDays] = useState<number | null>(null)
  const [ageText, setAgeText] = useState('')
  const [range, setRange] = useState<FundHistoryRange>('3m')
  const [ranges, setRanges] = useState<RangeChip[]>(() => emptyRanges(null))
  const [chartPoints, setChartPoints] = useState<Record<string, unknown>[]>([])
  const [chartHeight] = useState(() =>
    Math.max(260, Math.floor((typeof window !== 'undefined' ? window.innerWidth : 375) * 0.72)),
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [holdings, setHoldings] = useState<FundHoldingRow[]>([])
  const [holdingsLoading, setHoldingsLoading] = useState(true)
  const [holdingsError, setHoldingsError] = useState('')
  const [totalWeightText, setTotalWeightText] = useState('')
  const [reportQuarterText, setReportQuarterText] = useState('')
  const byRange = useRef<Record<string, FundHistoryPayload>>({})
  const chartEpoch = useRef(0)
  const rangeRef = useRef(range)
  const ageDaysRef = useRef(ageDays)
  const holdingsRef = useRef<FundHoldingRow[]>([])
  const holdingsFetchingRef = useRef(false)

  useEffect(() => {
    rangeRef.current = range
  }, [range])

  useEffect(() => {
    ageDaysRef.current = ageDays
  }, [ageDays])

  useEffect(() => {
    holdingsRef.current = holdings
  }, [holdings])

  const refreshRanges = (days: number | null = ageDaysRef.current) => {
    setRanges(
      availableFundRanges(days).map((t) => {
        const hist = byRange.current[t.key]
        const pct = hist ? hist.periodPercent : null
        return {...t, pctText: formatPct(pct), pctClass: pctClass(pct)}
      }),
    )
  }

  const mergeByRange = (r: FundHistoryRange, data: FundHistoryPayload) => {
    byRange.current = {...byRange.current, [r]: data}
    refreshRanges(ageDaysRef.current)
    return data
  }

  const fetchAndStoreRange = async (r: FundHistoryRange) => {
    const cached = byRange.current[r]
    if (cached) {
      refreshRanges(ageDaysRef.current)
      return cached
    }
    const data = await fetchFundHistory(code, r)
    return mergeByRange(r, data)
  }

  const applyChart = (r: FundHistoryRange) => {
    const hist = byRange.current[r]
    if (!hist) {
      setChartPoints([])
      return
    }
    setChartPoints(
      (hist.points || []).map((p) => ({
        date: p.date,
        value: p.percent,
        percent: p.percent,
        netValue: p.netValue,
      })),
    )
    setError('')
    refreshRanges(ageDaysRef.current)
  }

  const prefetchHistory = (days: number | null) => {
    availableFundRanges(days).forEach((t) => {
      const r = t.key
      if (byRange.current[r]) return
      fetchFundHistory(code, r)
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
      let nextAge: number | null = null
      let nextRange: FundHistoryRange = '3m'
      try {
        const quote = await fetchFundQuote(code)
        if (cancelled) return
        nextAge =
          quote.ageDays != null && Number.isFinite(Number(quote.ageDays))
            ? Number(quote.ageDays)
            : null
        nextRange = defaultFundRange(nextAge)
        byRange.current = {}
        setName(quote.name || name || code)
        setAgeDays(nextAge)
        setAgeText(formatFundAge(quote.establishDate, nextAge))
        setRange(nextRange)
        setRanges(emptyRanges(nextAge))
      } catch (e) {
        if (!name) setError(e instanceof Error ? e.message : '行情加载失败')
      }

      try {
        await fetchAndStoreRange(nextRange)
        if (cancelled) return
        applyChart(nextRange)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setLoading(false)
        setError(e instanceof Error ? e.message : '加载失败')
        setChartPoints([])
      }
      prefetchHistory(nextAge)
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  useEffect(() => {
    if (!/^\d{6}$/.test(code)) return
    let cancelled = false

    const loadHoldings = async (silent: boolean) => {
      if (holdingsFetchingRef.current) return
      holdingsFetchingRef.current = true
      if (!silent) {
        setHoldingsLoading(true)
        setHoldingsError('')
      }
      try {
        const hold = await fetchFundHoldings(code)
        if (cancelled) return
        const list = hold.holdings || []
        setHoldings(list)
        setTotalWeightText(hold.totalWeightText || '')
        setReportQuarterText(hold.reportQuarterText || '')
        setHoldingsLoading(false)
        setHoldingsError(list.length ? '' : '暂无重仓数据')
      } catch (e) {
        if (cancelled) return
        if (silent && holdingsRef.current.length) {
          setHoldingsLoading(false)
          return
        }
        setHoldings([])
        setTotalWeightText('')
        setReportQuarterText('')
        setHoldingsLoading(false)
        setHoldingsError(e instanceof Error ? e.message : '重仓加载失败')
      } finally {
        holdingsFetchingRef.current = false
      }
    }

    void loadHoldings(false)
    const timer = window.setInterval(() => {
      void loadHoldings(true)
    }, HOLDINGS_POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [code])

  const onRangeTap = async (key: FundHistoryRange) => {
    if (!key || key === range) return
    if (!isFundRangeAvailable(key, ageDays)) return
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
        <AppNavBar title="基金走势" theme={theme} />
      </div>
      <div className="subpage-scroller" style={{overflowY: 'auto'}}>
        <div className={`page theme-${theme} fund-trend`}>
          <FortuneWatermark />
          <div className="trend-fg">
            <div className="ticket">
              <div className="ticket-id">
                <div className="ticket-meta">
                  <span className="ticket-code mono">{code}</span>
                  <span className="ticket-sep">·</span>
                  <span className="ticket-name">{name || '基金走势'}</span>
                  {ageText ? <span className="ticket-age mono">{ageText}</span> : null}
                </div>
              </div>
              <div className="ticket-rule" aria-hidden />
            </div>

            <div className="range-scroll">
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
                  extraKey="netValue"
                  extraLabel="净值"
                  showExtremes
                  range={range}
                  height={chartHeight}
                />
              </div>
            ) : null}

            <div className="hold-block">
              <div className="hold-card">
                <div className="hold-head">
                  <div className="hold-title-row">
                    <span className="hold-title">重仓股票</span>
                    {totalWeightText ? (
                      <span className="hold-total mono">（占比{totalWeightText}）</span>
                    ) : null}
                  </div>
                  {reportQuarterText ? (
                    <span className="hold-quarter">{reportQuarterText}</span>
                  ) : null}
                </div>

                {holdings.length ? (
                  <div className="hold-cols">
                    <span className="hold-col hold-col-name">重仓股票</span>
                    <span className="hold-col hold-col-chg">涨跌幅</span>
                    <span className="hold-col hold-col-w">持仓占比</span>
                    <span className="hold-col hold-col-qw">较上季度变化</span>
                  </div>
                ) : null}

                {holdingsLoading ? <div className="section-empty">加载重仓…</div> : null}
                {!holdingsLoading && holdingsError && !holdings.length ? (
                  <div className="hold-err">{holdingsError}</div>
                ) : null}

                {!holdingsLoading && holdings.length ? (
                  <div className="hold-list">
                    {holdings.map((item) => (
                      <div
                        className={`hold-row ${item.rowTone || ''}`}
                        key={`${item.rank}-${item.code}`}
                      >
                        <div className="hold-cell hold-col-name">
                          <span className="hold-name">{item.name}</span>
                          <span className="hold-stock mono">{item.code}</span>
                        </div>
                        <span
                          className={`hold-cell hold-col-chg mono ${item.dayChangeClass || 'flat'}`}
                        >
                          {item.dayChangeText || '--'}
                        </span>
                        <span className="hold-cell hold-col-w mono">{item.weightText}</span>
                        <span
                          className={`hold-cell hold-col-qw mono ${item.weightChangeClass || 'flat'}`}
                        >
                          {item.weightChangeText || '--'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
