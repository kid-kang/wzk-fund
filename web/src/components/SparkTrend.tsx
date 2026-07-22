import {useMemo, useState} from 'react'
import ReactECharts from 'echarts-for-react'
import {pctClass} from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type TrendPoint = {time: string; value: number}

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

  return {
    animation: false,
    grid: showAxis
      ? compact
        ? {left: 8, right: 8, top: 18, bottom: 22}
        : {left: 48, right: 16, top: 28, bottom: 36}
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
        const p = list[0] as {axisValue?: string; value?: number | string}
        if (!p || p.value == null || p.value === '') return ''
        const n = Number(p.value)
        const sign = n > 0 ? '+' : ''
        return `${p.axisValue ?? ''}<br/><b>${sign}${n.toFixed(2)}%</b>`
      },
    },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.time),
      show: showAxis,
      boundaryGap: false,
      axisLine: {lineStyle: {color: axisColors.line}},
      axisTick: {show: false},
      axisLabel: {
        color: axisColors.muted,
        fontSize: compact ? 9 : 11,
        interval: Math.max(0, Math.floor(points.length / (compact ? 3 : 6)) - 1),
      },
    },
    yAxis: {
      type: 'value',
      show: showAxis,
      scale: true,
      min: Number((min - pad).toFixed(2)),
      max: Number((max + pad).toFixed(2)),
      splitNumber: compact ? 2 : 4,
      axisLine: {show: false},
      axisTick: {show: false},
      // 列表高度有限：不标纵坐标，放大弹窗再显示
      axisLabel: compact
        ? {show: false}
        : {
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

  const last = points[points.length - 1]?.value ?? 0
  // 以最新涨跌幅正负定色：红涨绿跌（A股习惯）
  const up = positiveIsUp ? last >= 0 : last < 0
  const color = accentColor || (up ? '#d7263d' : '#0f8a5f')

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
        <div className="pointer-events-none absolute right-0 top-0 z-10">
          <MiniPct value={last} />
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
              <MiniPct value={last} />
            </DialogTitle>
          </DialogHeader>
          <p className="mb-2 text-xs text-muted">横轴为时间，纵轴为涨跌幅（%）</p>
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
