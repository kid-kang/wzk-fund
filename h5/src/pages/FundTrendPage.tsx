import {useEffect, useRef, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import '@/styles/fund-trend.css'
import AppNavBar from '@/components/AppNavBar'
import EcLine from '@/components/EcLine'
import FortuneWatermark from '@/components/FortuneWatermark'
import {
  fetchFundHistory,
  fetchFundHoldings,
  fetchFundStageStats,
  fetchFundQuote,
  type FundHoldingRow,
  type FundHistoryPayload,
  type FundHistoryRange,
  type FundStageStatsPayload,
  type SectorTagItem,
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
const STAGE_PAGE_SIZE = 5

const STAGE_TABS = [
  {key: 'nav' as const, label: '历史净值'},
  {key: 'return' as const, label: '阶段涨幅'},
  {key: 'drawdown' as const, label: '阶段回撤'},
]

const STAGE_GRAINS = [
  {key: 'stage' as const, label: '阶段'},
  {key: 'month' as const, label: '月度'},
  {key: 'quarter' as const, label: '季度'},
  {key: 'semi' as const, label: '半年度'},
  {key: 'year' as const, label: '年度'},
]

type StageTab = (typeof STAGE_TABS)[number]['key']
type StageGrain = (typeof STAGE_GRAINS)[number]['key']

function mapSectorTags(quote: {
  sectorItems?: SectorTagItem[]
  sectors?: string[]
}): SectorTagItem[] {
  const items = Array.isArray(quote.sectorItems) ? quote.sectorItems : []
  if (items.length) {
    return items
      .map((it) => ({
        name: String(it?.name || '').trim(),
        sectorCode: String(it?.sectorCode || '').trim(),
        mappingCode: String(it?.mappingCode || '').trim(),
      }))
      .filter((it) => it.name)
  }
  const sectors = Array.isArray(quote.sectors) ? quote.sectors : []
  return sectors
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .map((n) => ({name: n, sectorCode: '', mappingCode: ''}))
}

export default function FundTrendPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const theme: AppTheme = getStoredTheme()
  const code = String(params.get('code') || '').padStart(6, '0')
  const [name, setName] = useState(
    params.get('name') ? decodeURIComponent(params.get('name') || '') : '',
  )
  const [sectorTags, setSectorTags] = useState<SectorTagItem[]>([])
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
  const [stageTab, setStageTab] = useState<StageTab>('return')
  const [stageGrain, setStageGrain] = useState<StageGrain>('stage')
  const [stageLoading, setStageLoading] = useState(true)
  const [stageError, setStageError] = useState('')
  const [stageLimit, setStageLimit] = useState(STAGE_PAGE_SIZE)
  const [stageStats, setStageStats] = useState<FundStageStatsPayload | null>(null)
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
        setSectorTags(mapSectorTags(quote))
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
    setStageLoading(true)
    setStageError('')
    setStageStats(null)
    setStageLimit(STAGE_PAGE_SIZE)
    void fetchFundStageStats(code)
      .then((data) => {
        if (cancelled) return
        setStageStats(data)
        setStageLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setStageStats(null)
        setStageLoading(false)
        setStageError(e instanceof Error ? e.message : '阶段数据加载失败')
      })
    return () => {
      cancelled = true
    }
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

  const stageSource = (() => {
    if (!stageStats) return []
    if (stageTab === 'nav') return stageStats.navHistory || []
    if (stageTab === 'drawdown') return stageStats.drawdowns || []
    if (stageGrain === 'month') return stageStats.monthlyReturns || []
    if (stageGrain === 'quarter') return stageStats.quarterlyReturns || []
    if (stageGrain === 'semi') return stageStats.semiAnnualReturns || []
    if (stageGrain === 'year') return stageStats.annualReturns || []
    return stageStats.periodReturns || []
  })()

  const stageRows = stageSource.slice(0, stageLimit).map((item) => {
    if (stageTab === 'nav') {
      return {
        key: item.date || '',
        label: item.dateLabel || '',
        valueText: item.dayChangeText || '--',
        valueClass: item.dayChangeClass || 'flat',
      }
    }
    return {
      key: item.key || '',
      label: item.label || '',
      valueText: item.percentText || '--',
      valueClass: item.percentClass || 'flat',
    }
  })
  const stageHasMore = stageSource.length > stageLimit
  const stageShowGrain = stageTab === 'return'
  const stageLabelCol = stageTab === 'nav' ? '日期' : '周期'
  const stageValueCol = stageTab === 'nav' ? '日涨跌' : '本基金'

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
        <AppNavBar title="基金详情" theme={theme} />
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
                  <span className="ticket-name">{name || '基金详情'}</span>
                  {ageText ? <span className="ticket-age mono">{ageText}</span> : null}
                </div>
              </div>
              {sectorTags.length ? (
                <div className="ticket-tags">
                  {sectorTags.map((tag) => (
                    <button
                      type="button"
                      className="sector-tag is-link"
                      key={tag.name}
                      onClick={() => {
                        const sectorCode = String(tag.sectorCode || '').trim()
                        const mappingCode = String(tag.mappingCode || '').trim()
                        if (!sectorCode && !mappingCode) {
                          window.alert('该板块暂无详情')
                          return
                        }
                        const q = new URLSearchParams({
                          sectorCode,
                          mappingCode,
                          name: tag.name || '',
                        })
                        navigate(`/sector-funds?${q.toString()}`)
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              ) : null}
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

            <div className="stage-block">
              <div className="stage-card">
                <div className="stage-tabs">
                  {STAGE_TABS.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      className={`stage-tab${stageTab === item.key ? ' is-on' : ''}`}
                      onClick={() => {
                        setStageTab(item.key)
                        setStageLimit(STAGE_PAGE_SIZE)
                      }}
                    >
                      <span className="stage-tab-label">{item.label}</span>
                    </button>
                  ))}
                </div>

                {stageShowGrain ? (
                  <div className="stage-grains">
                    {STAGE_GRAINS.map((item) => (
                      <button
                        type="button"
                        key={item.key}
                        className={`stage-grain${stageGrain === item.key ? ' is-on' : ''}`}
                        onClick={() => {
                          setStageGrain(item.key)
                          setStageLimit(STAGE_PAGE_SIZE)
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {stageRows.length ? (
                  <div className="stage-cols">
                    <span className="stage-col-label">{stageLabelCol}</span>
                    <span className="stage-col-value">{stageValueCol}</span>
                  </div>
                ) : null}

                {stageLoading ? <div className="section-empty">加载阶段数据…</div> : null}
                {!stageLoading && stageError && !stageRows.length ? (
                  <div className="stage-err">{stageError}</div>
                ) : null}

                {!stageLoading && stageRows.length ? (
                  <div className="stage-list">
                    {stageRows.map((item) => (
                      <div className="stage-row" key={item.key}>
                        <span className="stage-row-label">{item.label}</span>
                        <span className={`stage-row-value mono ${item.valueClass}`}>
                          {item.valueText}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {stageHasMore ? (
                  <button
                    type="button"
                    className="stage-more"
                    onClick={() => setStageLimit((n) => n + STAGE_PAGE_SIZE)}
                  >
                    查看更多
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
