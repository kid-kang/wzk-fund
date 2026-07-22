import {useMemo, useState} from 'react'
import ReactECharts from 'echarts-for-react'
import {pctClass} from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type TrendPoint = {
  time: string
  value: number
  /** 可选：金价等绝对价格，用于角标/tooltip 一并展示 */
  price?: number | null
}

function chartAxisColors() {
  const styles = getComputedStyle(document.documentElement)
  return {
    muted: styles.getPropertyValue('--app-muted').trim() || '#6b7785',
    line: styles.getPropertyValue('--app-line').trim() || '#c8d0d8',
  }
}

function buildOption(
  points: TrendPoint[],
  {
    showAxis,
    color,
    compact,
  }: {showAxis: boolean; color: string; compact?: boolean},
) {
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max((max - min) * 0.12, 0.05)
  const axisColors = chartAxisColors()
  const showPrice = points.some((p) => p.price != null)

  return {
    animation: false,
    grid: compact
      ? {
        left: 2,
        right: 2,
        // 顶部留给角标，底部贴边占满高度
        top: showPrice ? 26 : 14,
        bottom: 2,
      }
      : showAxis
        ? {left: 48, right: 16, top: 28, bottom: 36}
        : {left: 0, right: 0, top: 4, bottom: 0},
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      confine: false,
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
        const n = Number(p.value)
        const sign = n > 0 ? '+' : ''
        const price = points[p.dataIndex ?? 0]?.price
        const priceText =
          price != null ? `<br/>金价 ${Number(price).toFixed(2)}` : ''
        return `${p.axisValue ?? ''}<br/><b>${sign}${n.toFixed(2)}%</b>${priceText}`
      },
    },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.time),
      // 列表迷你图不显示横坐标，放大弹窗再显示
      show: showAxis && !compact,
      boundaryGap: false,
      axisLine: {lineStyle: {color: axisColors.line}},
      axisTick: {show: false},
      axisLabel: {
        color: axisColors.muted,
        fontSize: 11,
        interval: Math.max(0, Math.floor(points.length / 6) - 1),
      },
    },
    yAxis: {
      type: 'value',
      show: showAxis && !compact,
      scale: true,
      min: Number((min - pad).toFixed(2)),
      max: Number((max + pad).toFixed(2)),
      splitNumber: 4,
      axisLine: {show: false},
      axisTick: {show: false},
      axisLabel: {
        color: axisColors.muted,
        fontSize: 11,
        formatter: (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`,
      },
      splitLine: {
        show: showAxis && !compact,
        lineStyle: {color: axisColors.line, type: 'dashed'},
      },
    },
    series: [
      {
        type: 'line',
        data: values,
        showSymbol: false,
        smooth: 0.25,
        lineStyle: {width: showAxis && !compact ? 2 : 1.5, color},
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
        markLine: showAxis
          ? {
            silent: true,
            symbol: 'none',
            lineStyle: {color: axisColors.muted, type: 'dashed', width: 1},
            data: [{yAxis: 0}],
            label: {show: false},
          }
          : undefined,
      },
    ],
  }
}

export function SparkTrend({
  points,
  height = 56,
  title = '分时走势',
  accentColor,
  positiveIsUp = true,
}: {
  points: TrendPoint[]
  height?: number
  title?: string
  accentColor?: string
  positiveIsUp?: boolean
}) {
  const [open, setOpen] = useState(false)

  const lastPoint = points[points.length - 1]
  const last = lastPoint?.value ?? 0
  const lastPrice = lastPoint?.price
  // 以最新涨跌幅正负定色：红涨绿跌（A股习惯）
  const up = positiveIsUp ? last >= 0 : last < 0
  const color = accentColor || (up ? '#d7263d' : '#0f8a5f')
  const showPrice = points.some((p) => p.price != null)

  const themeKey =
    typeof document !== 'undefined' ? document.documentElement.dataset.theme : 'light'

  const miniOption = useMemo(
    () => buildOption(points, {showAxis: true, color, compact: true}),
    [points, color, themeKey],
  )
  const fullOption = useMemo(
    () => buildOption(points, {showAxis: true, color, compact: false}),
    [points, color, themeKey],
  )

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center text-[10px] text-muted"
        style={{height}}
      >
        暂无走势
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className="group relative w-full cursor-zoom-in rounded-md text-left transition-opacity hover:opacity-90"
        onClick={() => setOpen(true)}
        title="点击放大查看"
      >
        <div className="pointer-events-none absolute right-0 top-0 z-10 flex flex-col items-end gap-0.5">
          <MiniPct value={last} />
          {showPrice ? <MiniPrice value={lastPrice} /> : null}
        </div>
        <ReactECharts
          option={miniOption}
          style={{height, width: '100%'}}
          opts={{renderer: 'canvas'}}
          notMerge
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-6">
              <span className="truncate">{title}</span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <MiniPct value={last} />
                {showPrice ? <MiniPrice value={lastPrice} /> : null}
              </span>
            </DialogTitle>
          </DialogHeader>
          <p className="mb-2 text-xs text-muted">
            {showPrice
              ? '横轴为时间，纵轴为涨跌幅（%）；角标与悬停可查看金价'
              : '横轴为时间，纵轴为涨跌幅（%）'}
          </p>
          <ReactECharts
            option={fullOption}
            style={{height: 320, width: '100%'}}
            opts={{renderer: 'canvas'}}
            notMerge
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

export function MiniPct({value}: {value: number | null | undefined}) {
  const cls = pctClass(value)
  if (value == null) return <span className="font-mono text-muted">--</span>
  const sign = value > 0 ? '+' : ''
  return (
    <span className={`font-mono text-xs font-semibold tabular-nums ${cls}`}>
      {sign}
      {value.toFixed(2)}%
    </span>
  )
}

function MiniPrice({value}: {value: number | null | undefined}) {
  if (value == null) return null
  return (
    <span className="font-mono text-[10px] tabular-nums text-ink-soft sm:text-xs">
      {value.toFixed(2)}
    </span>
  )
}
