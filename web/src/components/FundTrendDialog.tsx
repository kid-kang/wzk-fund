import {useEffect, useMemo, useState} from 'react'
import ReactECharts from 'echarts-for-react'
import {
  fetchFundHistory,
  fetchFundQuote,
  type FundHistoryPayload,
  type FundHistoryRange,
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

type TabKey = 'intraday' | FundHistoryRange

const HISTORY_TAB_DEFS: {key: FundHistoryRange; label: string}[] = [
  {key: '3m', label: '近3月'},
  {key: '1y', label: '近1年'},
  {key: '3y', label: '近3年'},
  {key: 'since', label: '成立以来'},
]

export function FundTrendDialog({
  open,
  onOpenChange,
  code,
  name,
  intradayPoints,
  badgePercent,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  code: string
  name: string
  intradayPoints: TrendPoint[]
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
  }, [open, code, name])

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
      })
      .catch(() => {
        if (!cancelled) {
          setAgeDays(null)
          setAgeText('')
        }
      })
    return () => {
      cancelled = true
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto p-4 sm:w-[calc(100%-2rem)] sm:max-w-4xl sm:p-5 lg:max-w-5xl">
        <DialogHeader className="pr-6">
          <DialogTitle className="flex min-w-0 items-baseline gap-2 text-base sm:text-lg">
            <span className="truncate">{titleName || name || '基金走势'}</span>
            {ageText ? (
              <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
                {ageText}
              </span>
            ) : null}
          </DialogTitle>
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
              option={option}
              style={{height: chartHeight, width: '100%'}}
              opts={{renderer: 'canvas'}}
              notMerge
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
      </DialogContent>
    </Dialog>
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
