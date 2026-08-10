import {useEffect, useMemo, useRef, useState} from 'react'
import ReactECharts from 'echarts-for-react'
import {
  fetchFundHistory,
  fetchFundHoldings,
  fetchFundQuote,
  fetchFundStageStats,
  type FundHoldingRow,
  type FundHistoryPayload,
  type FundHistoryRange,
  type FundStageRow,
  type FundStageStatsPayload,
  type SectorTagItem,
} from '@/lib/api'
import {toneByDelta} from '@/lib/palette'
import {
  cn,
  formatFundAge,
  formatPct,
  formatSampledTrendAxisLabels,
  isFundRangeAvailable,
  pctClass,
  sampleTrendPoints,
} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {TrendPoint} from '@/components/SparkTrend'
import {
  SectorFundsDialog,
  type SectorFundsTarget,
} from '@/components/SectorFundsDialog'

type TabKey = 'intraday' | FundHistoryRange

const HISTORY_TAB_DEFS: {key: FundHistoryRange; label: string}[] = [
  {key: '3m', label: '近3月'},
  {key: '6m', label: '近6月'},
  {key: '1y', label: '近1年'},
  {key: '3y', label: '近3年'},
  {key: 'since', label: '成立以来'},
]

const HOLDINGS_POLL_MS = 60_000
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

export function FundTrendDialog({
  open,
  onOpenChange,
  code,
  name,
  intradayPoints = [],
  badgePercent,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  code: string
  name: string
  intradayPoints?: TrendPoint[]
  badgePercent?: number | null
}) {
  const [range, setRange] = useState<TabKey>('intraday')
  const [byRange, setByRange] = useState<
    Partial<Record<FundHistoryRange, FundHistoryPayload>>
  >({})
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loadingSince, setLoadingSince] = useState(false)
  const [error, setError] = useState('')
  const [chartHeight, setChartHeight] = useState(220)
  const [ageDays, setAgeDays] = useState<number | null>(null)
  const [ageText, setAgeText] = useState('')
  const [titleName, setTitleName] = useState(name)
  const [sectorTags, setSectorTags] = useState<SectorTagItem[]>([])
  const [sectorOpen, setSectorOpen] = useState(false)
  const [sectorTarget, setSectorTarget] = useState<SectorFundsTarget | null>(null)
  const [childFundOpen, setChildFundOpen] = useState(false)
  const [childFund, setChildFund] = useState<{code: string; name: string} | null>(
    null,
  )
  const [holdings, setHoldings] = useState<FundHoldingRow[]>([])
  const [holdingsLoading, setHoldingsLoading] = useState(false)
  const [holdingsError, setHoldingsError] = useState('')
  const [totalWeightText, setTotalWeightText] = useState('')
  const [reportQuarterText, setReportQuarterText] = useState('')
  const [stageTab, setStageTab] = useState<(typeof STAGE_TABS)[number]['key']>('return')
  const [stageGrain, setStageGrain] = useState<(typeof STAGE_GRAINS)[number]['key']>('stage')
  const [stageLoading, setStageLoading] = useState(false)
  const [stageError, setStageError] = useState('')
  const [stageLimit, setStageLimit] = useState(STAGE_PAGE_SIZE)
  const [stageStats, setStageStats] = useState<FundStageStatsPayload | null>(null)
  const holdingsRef = useRef<FundHoldingRow[]>([])
  const holdingsFetchingRef = useRef(false)
  const chartRef = useRef<ReactECharts | null>(null)

  const tabs = useMemo(() => {
    const hist = HISTORY_TAB_DEFS.filter((t) =>
      isFundRangeAvailable(t.key, ageDays),
    )
    return [{key: 'intraday' as const, label: '分时涨幅'}, ...hist]
  }, [ageDays])

  const historyRanges = useMemo(
    () =>
      HISTORY_TAB_DEFS.filter((t) => isFundRangeAvailable(t.key, ageDays)).map(
        (t) => t.key,
      ),
    [ageDays],
  )

  const intradayPct =
    badgePercent != null
      ? badgePercent
      : (intradayPoints[intradayPoints.length - 1]?.value ?? null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const apply = () => setChartHeight(mq.matches ? 300 : 220)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (!open) return
    setRange('intraday')
    setAgeDays(null)
    setAgeText('')
    setTitleName(name)
    setByRange({})
    setSectorTags([])
    setHoldings([])
    setHoldingsError('')
    setTotalWeightText('')
    setReportQuarterText('')
    setStageTab('return')
    setStageGrain('stage')
    setStageLimit(STAGE_PAGE_SIZE)
    setStageStats(null)
    setStageError('')
  }, [open, code, name])

  useEffect(() => {
    holdingsRef.current = holdings
  }, [holdings])

  useEffect(() => {
    if (!open || !code) return
    let cancelled = false
    fetchFundQuote(code)
      .then((q) => {
        if (cancelled) return
        if (q.name) setTitleName(q.name)
        const days =
          q.ageDays != null && Number.isFinite(Number(q.ageDays))
            ? Number(q.ageDays)
            : null
        setAgeDays(days)
        setAgeText(formatFundAge(q.establishDate, days))
        const items = Array.isArray(q.sectorItems) ? q.sectorItems : []
        if (items.length) {
          setSectorTags(
            items
              .map((it) => ({
                name: String(it?.name || '').trim(),
                sectorCode: String(it?.sectorCode || '').trim(),
                mappingCode: String(it?.mappingCode || '').trim(),
              }))
              .filter((it) => it.name),
          )
        } else {
          setSectorTags(
            (q.sectors || [])
              .map((s) => String(s || '').trim())
              .filter(Boolean)
              .map((n) => ({name: n, sectorCode: '', mappingCode: ''})),
          )
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAgeDays(null)
          setAgeText('')
          setSectorTags([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, code])

  useEffect(() => {
    if (!open || !/^\d{6}$/.test(code)) return
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
      .catch((e: Error) => {
        if (cancelled) return
        setStageStats(null)
        setStageLoading(false)
        setStageError(e.message || '阶段数据加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [open, code])

  useEffect(() => {
    if (!open || !/^\d{6}$/.test(code)) return
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
  }, [open, code])

  useEffect(() => {
    if (!open || !code) return
    let cancelled = false
    setLoadingHistory(true)
    setError('')

    const prefetch = historyRanges.filter((k) => k !== 'since')
    if (!prefetch.length) {
      setLoadingHistory(false)
      return
    }
    Promise.allSettled(prefetch.map((r) => fetchFundHistory(code, r)))
      .then((results) => {
        if (cancelled) return
        const next: Partial<Record<FundHistoryRange, FundHistoryPayload>> = {}
        results.forEach((res, i) => {
          if (res.status === 'fulfilled') next[prefetch[i]] = res.value
        })
        setByRange((prev) => ({...prev, ...next}))
        if (!Object.keys(next).length) {
          const firstFail = results.find((r) => r.status === 'rejected') as
            | PromiseRejectedResult
            | undefined
          setError((firstFail?.reason as Error)?.message || '加载失败')
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, code, historyRanges])

  useEffect(() => {
    if (!open || !code || range !== 'since') return
    if (byRange.since) return
    let cancelled = false
    setLoadingSince(true)
    setError('')
    fetchFundHistory(code, 'since')
      .then((data) => {
        if (cancelled) return
        setByRange((prev) => ({...prev, since: data}))
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoadingSince(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, code, range, byRange.since])

  useEffect(() => {
    if (range === 'intraday') return
    if (!isFundRangeAvailable(range, ageDays)) {
      setRange('intraday')
    }
  }, [ageDays, range])

  const historyData = range === 'intraday' ? null : (byRange[range] ?? null)
  const loading =
    range === 'intraday'
      ? false
      : range === 'since'
        ? loadingSince
        : loadingHistory

  const tabPercent = (key: TabKey): number | null => {
    if (key === 'intraday') return intradayPct
    return byRange[key]?.periodPercent ?? null
  }

  const option = useMemo(() => {
    const styles = getComputedStyle(document.documentElement)
    const muted = styles.getPropertyValue('--app-muted').trim() || '#6b7785'
    const line = styles.getPropertyValue('--app-line').trim() || '#c8d0d8'

    const theme = document.documentElement.dataset.theme

    if (range === 'intraday') {
      const points = intradayPoints
      if (!points.length) return null
      const values = points.map((p) => p.value)
      const lastPct = values[values.length - 1] ?? 0
      const color = toneByDelta(lastPct, theme)
      const lastLabel = `${lastPct > 0 ? '+' : ''}${lastPct.toFixed(2)}%`
      return buildChartOption({
        labels: points.map((p) => p.time),
        values,
        fullDates: points.map((p) => p.time),
        extras: points.map(() => null as number | null),
        extraLabel: '',
        color,
        muted,
        line,
        lastLabel,
      })
    }

    const points = sampleTrendPoints(historyData?.points || [], range)
    if (!points.length) return null
    const values = points.map((p) => p.percent ?? 0)
    const lastPct = values[values.length - 1] ?? 0
    const color = toneByDelta(lastPct, theme)
    const lastLabel = `${lastPct > 0 ? '+' : ''}${lastPct.toFixed(2)}%`
    return buildChartOption({
      labels: formatSampledTrendAxisLabels(
        points.map((p) => p.date),
        range,
      ),
      values,
      fullDates: points.map((p) => p.date),
      extras: points.map((p) => p.netValue),
      extraLabel: '净值',
      color,
      muted,
      line,
      lastLabel,
    })
  }, [range, intradayPoints, historyData])

  useEffect(() => {
    if (!open || !option) return
    const id = requestAnimationFrame(() => {
      chartRef.current?.getEchartsInstance()?.resize()
    })
    return () => cancelAnimationFrame(id)
  }, [open, range, chartHeight, option])

  const stageShowGrain = stageTab === 'return'
  const stageSource: FundStageRow[] = (() => {
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
  const stageLabelCol = stageTab === 'nav' ? '日期' : '周期'
  const stageValueCol =
    stageTab === 'nav' ? '日涨跌' : stageTab === 'drawdown' ? '回撤' : '本基金'

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto p-4 sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:p-5 lg:max-w-5xl">
        <DialogHeader className="pr-6">
          <DialogTitle className="flex min-w-0 items-baseline gap-2 text-base sm:text-lg">
            <span className="truncate">{titleName || name || '基金详情'}</span>
            {ageText ? (
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
                {ageText}
              </span>
            ) : null}
          </DialogTitle>
          {sectorTags.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sectorTags.map((tag) => (
                <button
                  type="button"
                  key={tag.name}
                  className="rounded border border-line bg-paper px-2 py-0.5 text-[11px] text-ink transition-colors hover:border-ink/30 hover:bg-paper-deep"
                  onClick={() => {
                    const sectorCode = String(tag.sectorCode || '').trim()
                    const mappingCode = String(tag.mappingCode || '').trim()
                    if (!sectorCode && !mappingCode) {
                      window.alert('该板块暂无详情')
                      return
                    }
                    setSectorTarget({
                      name: tag.name,
                      sectorCode,
                      mappingCode,
                    })
                    setSectorOpen(true)
                  }}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          ) : null}
        </DialogHeader>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
          {tabs.map((r) => {
            const pct = tabPercent(r.key)
            const selected = range === r.key
            const tabLoading =
              r.key !== 'intraday' &&
              pct == null &&
              (r.key === 'since' ? loadingSince : loadingHistory)
            return (
              <Button
                key={r.key}
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  'h-auto min-h-9 shrink-0 flex-col gap-0.5 px-2.5 py-1.5 text-xs sm:px-3',
                  selected
                    ? 'border-ink/40 bg-paper-deep text-ink shadow-[inset_0_0_0_1px_var(--app-ink)] hover:bg-paper-deep'
                    : 'text-ink-soft',
                )}
                onClick={() => setRange(r.key)}
              >
                <span className={selected ? 'font-semibold text-ink' : undefined}>
                  {r.label}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-semibold tabular-nums leading-none',
                    tabLoading ? 'opacity-60' : pctClass(pct),
                  )}
                >
                  {tabLoading ? '…' : formatPct(pct)}
                </span>
              </Button>
            )
          })}
        </div>

        <div className="mt-2" style={{minHeight: chartHeight}}>
          {range !== 'intraday' && error && !option ? (
            <div
              className="flex items-center justify-center text-sm text-rise"
              style={{height: chartHeight}}
            >
              {error}
            </div>
          ) : loading && !option ? (
            <div
              className="flex items-center justify-center text-sm text-muted"
              style={{height: chartHeight}}
            >
              加载中...
            </div>
          ) : option ? (
            <ReactECharts
              ref={chartRef}
              option={option}
              style={{height: chartHeight, width: '100%'}}
              opts={{renderer: 'canvas'}}
              notMerge
              onChartReady={(inst) => inst.resize()}
            />
          ) : (
            <div
              className="flex items-center justify-center text-sm text-muted"
              style={{height: chartHeight}}
            >
              暂无该周期数据
            </div>
          )}
        </div>

        <div className="mt-5 rounded-xl border border-line/80 bg-paper/40 p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-semibold">重仓股票</span>
              {totalWeightText ? (
                <span className="font-mono text-xs text-muted">（占比{totalWeightText}）</span>
              ) : null}
            </div>
            {reportQuarterText ? (
              <span className="text-xs text-muted">{reportQuarterText}</span>
            ) : null}
          </div>
          {holdings.length ? (
            <div className="mb-1.5 grid grid-cols-[minmax(0,1.4fr)_0.7fr_0.7fr_0.9fr] gap-2 text-[10px] font-semibold tracking-wide text-muted">
              <span>重仓股票</span>
              <span className="text-right">涨跌幅</span>
              <span className="text-right">持仓占比</span>
              <span className="text-right">较上季度变化</span>
            </div>
          ) : null}
          {holdingsLoading ? (
            <div className="py-6 text-center text-sm text-muted">加载重仓…</div>
          ) : null}
          {!holdingsLoading && holdingsError && !holdings.length ? (
            <div className="py-4 text-center text-sm text-muted">{holdingsError}</div>
          ) : null}
          {!holdingsLoading && holdings.length ? (
            <div className="divide-y divide-line/60">
              {holdings.map((item) => (
                <div
                  key={`${item.rank}-${item.code}`}
                  className="grid grid-cols-[minmax(0,1.4fr)_0.7fr_0.7fr_0.9fr] items-center gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="font-mono text-[11px] text-muted">{item.code}</div>
                  </div>
                  <span
                    className={cn(
                      'text-right font-mono text-xs font-semibold tabular-nums',
                      item.dayChangeClass || 'text-muted',
                    )}
                  >
                    {item.dayChangeText || '--'}
                  </span>
                  <span className="text-right font-mono text-xs tabular-nums text-ink-soft">
                    {item.weightText}
                  </span>
                  <span
                    className={cn(
                      'text-right font-mono text-xs tabular-nums',
                      item.weightChangeClass || 'text-muted',
                    )}
                  >
                    {item.weightChangeText || '--'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-line/80 bg-paper/40 p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {STAGE_TABS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  stageTab === item.key
                    ? 'bg-panel text-ink shadow-sm'
                    : 'text-muted hover:bg-paper-deep/70',
                )}
                onClick={() => {
                  setStageTab(item.key)
                  setStageLimit(STAGE_PAGE_SIZE)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          {stageShowGrain ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {STAGE_GRAINS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] transition-colors',
                    stageGrain === item.key
                      ? 'bg-ink/90 text-panel'
                      : 'bg-paper-deep/70 text-muted hover:text-ink',
                  )}
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
            <div className="mb-1 flex justify-between text-[10px] font-semibold tracking-wide text-muted">
              <span>{stageLabelCol}</span>
              <span>{stageValueCol}</span>
            </div>
          ) : null}
          {stageLoading ? (
            <div className="py-6 text-center text-sm text-muted">加载阶段数据…</div>
          ) : null}
          {!stageLoading && stageError && !stageRows.length ? (
            <div className="py-4 text-center text-sm text-muted">{stageError}</div>
          ) : null}
          {!stageLoading && stageRows.length ? (
            <div className="divide-y divide-line/60">
              {stageRows.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="text-ink-soft">{item.label}</span>
                  <span
                    className={cn(
                      'font-mono text-xs font-semibold tabular-nums',
                      item.valueClass,
                    )}
                  >
                    {item.valueText}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          {stageHasMore ? (
            <button
              type="button"
              className="mt-2 w-full rounded-lg py-2 text-xs font-medium text-muted hover:bg-paper-deep/60 hover:text-ink"
              onClick={() => setStageLimit((n) => n + STAGE_PAGE_SIZE)}
            >
              查看更多
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
    <SectorFundsDialog
      open={sectorOpen}
      onOpenChange={setSectorOpen}
      target={sectorTarget}
      onOpenFund={(fund) => {
        setChildFund(fund)
        setChildFundOpen(true)
      }}
    />
    {childFund ? (
      <FundTrendDialog
        open={childFundOpen}
        onOpenChange={setChildFundOpen}
        code={childFund.code}
        name={childFund.name}
      />
    ) : null}
    </>
  )
}

function buildChartOption({
  labels,
  values,
  fullDates,
  extras,
  extraLabel,
  color,
  muted,
  line,
  lastLabel,
}: {
  labels: string[]
  values: number[]
  fullDates: string[]
  extras: (number | null)[]
  extraLabel: string
  color: string
  muted: string
  line: string
  lastLabel: string
}) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max((max - min) * 0.12, 0.05)
  const sparseAxis = labels.some((l) => !l)

  return {
    animation: false,
    grid: {left: 44, right: 56, top: 28, bottom: 32},
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      backgroundColor: 'rgba(21,32,43,0.92)',
      borderWidth: 0,
      padding: [6, 8],
      textStyle: {color: '#fff', fontSize: 11},
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const p = list[0] as {
          axisValue?: string
          value?: number | string
          dataIndex?: number
        }
        if (!p || p.value == null || p.value === '') return ''
        const idx = p.dataIndex ?? 0
        const fullDate = fullDates[idx] || p.axisValue || ''
        const n = Number(p.value)
        const extra = extras[idx]
        const extraText =
          extraLabel && extra != null
            ? `<br/>${extraLabel} ${Number(extra).toFixed(4)}`
            : ''
        return `${fullDate}<br/><b>${n > 0 ? '+' : ''}${n.toFixed(2)}%</b>${extraText}`
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: {lineStyle: {color: line}},
      axisTick: {show: false},
      axisLabel: {
        color: muted,
        fontSize: 10,
        interval: sparseAxis
          ? 0
          : Math.max(0, Math.floor(labels.length / 4) - 1),
        hideOverlap: !sparseAxis,
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      min: Number((min - pad).toFixed(2)),
      max: Number((max + pad).toFixed(2)),
      axisLine: {show: false},
      axisTick: {show: false},
      splitLine: {lineStyle: {color: line, type: 'dashed'}},
      axisLabel: {
        color: muted,
        fontSize: 10,
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
      },
    },
    series: [
      {
        type: 'line',
        data: values,
        showSymbol: false,
        smooth: 0.2,
        lineStyle: {width: 2, color},
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {offset: 0, color: `${color}33`},
              {offset: 1, color: `${color}00`},
            ],
          },
        },
        endLabel: {
          show: true,
          formatter: lastLabel,
          color,
          fontSize: 12,
          fontWeight: 700,
          distance: 6,
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: {color: muted, type: 'dashed', width: 1},
          data: [{yAxis: 0}],
          label: {show: false},
        },
      },
    ],
  }
}
