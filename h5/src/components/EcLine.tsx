import {useMemo} from 'react'
import ReactECharts from 'echarts-for-react'
import '@/styles/ec-line.css'
import {buildSparkOption, buildTrendOption} from '@/lib/chartOptions'
import type {AppTheme} from '@/lib/theme'

type Props = {
  points: Record<string, unknown>[]
  valueKey?: string
  mode?: 'spark' | 'trend'
  height?: number
  theme?: AppTheme
  valueMode?: 'percent' | 'price' | 'netValue'
  extraKey?: string
  extraLabel?: string
  showExtremes?: boolean
  range?: string
  toneDelta?: number | null
  periodPercent?: number | null
}

export default function EcLine({
  points,
  valueKey = 'growth',
  mode = 'spark',
  height = 56,
  theme = 'light',
  valueMode = 'percent',
  extraKey = '',
  extraLabel = '',
  showExtremes = false,
  range = '',
  toneDelta = null,
  periodPercent = null,
}: Props) {
  const option = useMemo(() => {
    if (mode === 'spark') {
      return buildSparkOption(points, valueKey, theme, toneDelta)
    }
    return (
      buildTrendOption({
        points,
        valueKey,
        theme,
        valueMode,
        extraKey: extraKey || undefined,
        extraLabel: extraLabel || undefined,
        showExtremes,
        range,
        periodPercent,
      }) || {
        animation: false,
        grid: {left: 0, right: 0, top: 0, bottom: 0},
        xAxis: {show: false, type: 'category', data: []},
        yAxis: {show: false, type: 'value'},
        series: [],
      }
    )
  }, [
    points,
    valueKey,
    mode,
    theme,
    valueMode,
    extraKey,
    extraLabel,
    showExtremes,
    range,
    toneDelta,
    periodPercent,
  ])

  return (
    <ReactECharts
      option={option}
      opts={{renderer: 'canvas'}}
      style={{height, width: '100%'}}
      notMerge
      lazyUpdate
    />
  )
}
