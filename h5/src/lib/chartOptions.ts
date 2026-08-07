import {PALETTE, toneByDelta} from '@/lib/palette'
import {formatTrendAxisDate, sampleTrendPoints, resolveTrendSamplePlan} from '@/lib/utils'

export const RISE = PALETTE.light.rise
export const FALL = PALETTE.light.fall
export const FLAT = PALETTE.light.flat

export {toneByDelta, sampleTrendPoints}

function hexAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function thinLabelIndexes(idxs: number[], maxTicks: number) {
  if (idxs.length <= maxTicks) return new Set(idxs)
  const keep = new Set([idxs[0], idxs[idxs.length - 1]])
  const inner = maxTicks - 2
  for (let k = 1; k <= inner; k++) {
    const t = k / (inner + 1)
    keep.add(idxs[Math.round(t * (idxs.length - 1))])
  }
  return keep
}

function buildBoundaryLabels(fullDates: string[], unit: 'year' | 'month', maxTicks: number) {
  const labels = fullDates.map(() => '')
  const idxs: number[] = []
  let lastKey = ''
  fullDates.forEach((d, i) => {
    const s = String(d || '')
    const key = unit === 'year' ? s.slice(0, 4) : s.slice(0, 7)
    if (!key || key === lastKey) return
    if (unit === 'year' && key.length < 4) return
    if (unit === 'month' && key.length < 7) return
    lastKey = key
    idxs.push(i)
    labels[i] = unit === 'year' ? key : key.slice(5)
  })
  if (!fullDates.length) return labels
  const lastI = fullDates.length - 1
  const lastS = String(fullDates[lastI] || '')
  const lastLabel = unit === 'year' ? lastS.slice(0, 4) : lastS.slice(5, 7)
  if (lastLabel) {
    labels[lastI] = lastLabel
    if (idxs[idxs.length - 1] !== lastI) idxs.push(lastI)
  }
  const keep = thinLabelIndexes(idxs, maxTicks)
  return labels.map((l, i) => (keep.has(i) ? l : ''))
}

type ChartPoint = Record<string, unknown> & {
  date?: string
  time?: string
}

function extractSeries(points: ChartPoint[] | undefined, valueKey: string, range = '') {
  const list = points || []
  const sampled = sampleTrendPoints(list, range)
  const plan = resolveTrendSamplePlan(range, list)
  const labels: string[] = []
  const values: number[] = []
  const full: string[] = []
  const seriesPoints: ChartPoint[] = []
  const axisUnit =
    plan.mode === 'day' ? '' : plan.years >= 3 ? 'year' : 'month'
  const sparseAxis = !!axisUnit
  ;(sampled || []).forEach((p) => {
    if (!p) return
    const raw = p[valueKey]
    if (raw == null || raw === '') return
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    values.push(n)
    seriesPoints.push(p)
    const label = String(p.time || p.date || '')
    full.push(label)
    if (label.length >= 10) {
      labels.push(sparseAxis ? '' : formatTrendAxisDate(label, range || ''))
    } else {
      labels.push(label)
    }
  })
  if (axisUnit === 'year') {
    const yearLabels = buildBoundaryLabels(full, 'year', plan.years >= 6 ? 7 : 5)
    for (let i = 0; i < labels.length; i++) labels[i] = yearLabels[i] || ''
  } else if (axisUnit === 'month') {
    const monthLabels = buildBoundaryLabels(full, 'month', 8)
    for (let i = 0; i < labels.length; i++) labels[i] = monthLabels[i] || ''
  }
  return {labels, values, full, sparseAxis, sampled: seriesPoints}
}

function extremeLabelLayout(idx: number, total: number, role: 'max' | 'min') {
  const n = Math.max(total, 1)
  const t = n <= 1 ? 0.5 : idx / (n - 1)
  const nearL = t <= 0.12
  const nearR = t >= 0.88
  return {
    position: role === 'max' ? 'top' : 'bottom',
    distance: 4,
    align: nearL ? 'left' : nearR ? 'right' : 'center',
    offset: nearL ? [6, 0] : nearR ? [-6, 0] : [0, 0],
  }
}

/** 列表迷你折线；toneDelta 传入时与卡片涨跌幅同色 */
export function buildSparkOption(
  points: ChartPoint[] | undefined,
  valueKey: string,
  theme?: string,
  toneDelta?: number | null,
) {
  const {values} = extractSeries(points, valueKey)
  if (values.length < 2) {
    return {
      animation: false,
      grid: {left: 0, right: 0, top: 2, bottom: 2},
      xAxis: {show: false, type: 'category', data: [0, 1]},
      yAxis: {show: false, type: 'value'},
      series: [
        {
          type: 'line',
          data: [0, 0],
          showSymbol: false,
          lineStyle: {width: 1, color: theme === 'dark' ? '#2a3a34' : '#c5cfc9'},
        },
      ],
    }
  }
  const last = values[values.length - 1]
  const delta =
    toneDelta != null && toneDelta !== ('' as unknown) && Number.isFinite(Number(toneDelta))
      ? Number(toneDelta)
      : last
  const color = toneByDelta(delta, theme)
  const lineColor = hexAlpha(color, theme === 'dark' ? 0.36 : 0.32)
  const zeroLine = theme === 'dark' ? 'rgba(238,242,255,0.42)' : 'rgba(36,53,82,0.35)'
  const cats = values.map((_, i) => i)
  const zeros = values.map(() => 0)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min > 0) min = 0
  if (max < 0) max = 0
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.08
  return {
    animation: false,
    grid: {left: 0, right: 0, top: 2, bottom: 2},
    xAxis: {show: false, type: 'category', data: cats, boundaryGap: false},
    yAxis: {
      show: false,
      type: 'value',
      min: min - pad,
      max: max + pad,
    },
    series: [
      {
        type: 'line',
        data: zeros,
        showSymbol: false,
        silent: true,
        z: 1,
        lineStyle: {width: 1, type: 'dashed', color: zeroLine},
      },
      {
        type: 'line',
        data: values,
        showSymbol: false,
        smooth: 0.25,
        z: 2,
        lineStyle: {width: 1.4, color: lineColor},
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {offset: 0, color: hexAlpha(color, theme === 'dark' ? 0.08 : 0.06)},
              {offset: 1, color: hexAlpha(color, 0)},
            ],
          },
        },
      },
    ],
  }
}

export type TrendOptionParams = {
  points?: ChartPoint[]
  valueKey: string
  theme?: string
  valueMode?: 'percent' | 'price' | 'netValue'
  extraKey?: string
  extraLabel?: string
  showExtremes?: boolean
  range?: string
  periodPercent?: number | null
}

/** 完整走势图 */
export function buildTrendOption({
  points,
  valueKey,
  theme,
  valueMode = 'percent',
  extraKey,
  extraLabel,
  showExtremes = false,
  range = '',
  periodPercent: _periodPercent = null,
}: TrendOptionParams) {
  void _periodPercent
  const muted = theme === 'dark' ? '#8b93a7' : '#7a8494'
  const axisLine = theme === 'dark' ? 'rgba(238,242,255,0.12)' : 'rgba(16,20,28,0.1)'
  const {labels, values, full, sparseAxis, sampled} = extractSeries(points, valueKey, range)
  if (!values.length) return null

  const last = values[values.length - 1]
  const first = values[0]
  const ink = theme === 'dark' ? '#eef2ff' : '#10141c'
  const isPrice = valueMode === 'price'
  const goldInk = theme === 'dark' ? '#e0c07a' : '#b08a48'
  const fundTitle = theme === 'dark' ? '#8b93a7' : '#7a8494'
  const color = isPrice
    ? goldInk
    : valueMode === 'percent'
      ? toneByDelta(last, theme)
      : toneByDelta(last - first, theme)
  const extremeColor = showExtremes ? (isPrice ? goldInk : fundTitle) : null
  const hideEndLabel = isPrice || showExtremes
  const formatExtreme = (n: number) => {
    if (!Number.isFinite(n)) return ''
    if (valueMode === 'percent') {
      return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
    }
    return n.toFixed(2)
  }

  const extras = (sampled || []).map((p) => {
    if (!extraKey || !p) return null
    const v = p[extraKey]
    return v == null ? null : Number(v)
  })

  let min = Math.min(...values)
  let max = Math.max(...values)
  const maxIdx = values.indexOf(max)
  const minIdx = values.indexOf(min)
  const maxLabelLayout = extremeLabelLayout(maxIdx, values.length, 'max')
  const minLabelLayout = extremeLabelLayout(minIdx, values.length, 'min')
  if (min === max) {
    min -= valueMode === 'percent' ? 0.5 : Math.abs(min) * 0.01 || 1
    max += valueMode === 'percent' ? 0.5 : Math.abs(max) * 0.01 || 1
  }
  const pad = Math.max(
    (max - min) * (showExtremes ? 0.32 : 0.12),
    valueMode === 'percent' ? 0.05 : (max - min) * 0.05 || 0.01,
  )

  const lastLabel =
    valueMode === 'percent'
      ? `${last > 0 ? '+' : ''}${last.toFixed(2)}%`
      : last.toFixed(valueMode === 'netValue' ? 4 : 2)

  const yFormatter =
    valueMode === 'percent'
      ? (v: number) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`
      : (v: number) => Number(v).toFixed(valueMode === 'netValue' ? 2 : 0)

  return {
    animation: false,
    grid: {
      left: isPrice || showExtremes ? 46 : 48,
      right: showExtremes ? 18 : hideEndLabel ? 12 : 52,
      top: showExtremes ? 40 : 28,
      bottom: showExtremes ? 48 : 36,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(28,31,36,0.92)',
      borderWidth: 0,
      padding: [8, 10],
      textStyle: {color: '#fff', fontSize: 11},
      formatter(params: unknown) {
        const list = Array.isArray(params) ? params : [params]
        const p = list[0] as {value?: unknown; dataIndex?: number; axisValue?: string}
        if (!p || p.value == null || p.value === '') return ''
        const idx = p.dataIndex || 0
        const date = full[idx] || p.axisValue || ''
        const n = Number(p.value)
        let head =
          valueMode === 'percent'
            ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
            : n.toFixed(valueMode === 'netValue' ? 4 : 2)
        let extra = ''
        if (extraLabel && extras[idx] != null && Number.isFinite(extras[idx] as number)) {
          extra = `\n${extraLabel} ${Number(extras[idx]).toFixed(4)}`
        }
        return `${date}\n${head}${extra}`
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: false,
      axisLine: {lineStyle: {color: axisLine}},
      axisTick: {show: false},
      axisLabel: {
        color: muted,
        fontSize: 10,
        interval: sparseAxis ? 0 : Math.max(0, Math.floor(labels.length / 4) - 1),
        hideOverlap: !sparseAxis,
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      min: Number((min - pad).toFixed(4)),
      max: Number((max + pad).toFixed(4)),
      axisLine: {show: false},
      axisTick: {show: false},
      splitLine: {lineStyle: {color: axisLine, type: 'dashed'}},
      axisLabel: {color: muted, fontSize: 10, formatter: yFormatter},
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
              {offset: 0, color: hexAlpha(color, 0.22)},
              {offset: 1, color: hexAlpha(color, 0)},
            ],
          },
        },
        endLabel: hideEndLabel
          ? {show: false}
          : {
              show: true,
              formatter: lastLabel,
              color,
              fontSize: 11,
              fontWeight: 700,
              distance: 4,
            },
        markLine:
          valueMode === 'percent'
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: {color: muted, type: 'dashed', width: 1},
                data: [{yAxis: 0}],
                label: {show: false},
              }
            : undefined,
        markPoint: showExtremes
          ? {
              symbol: 'circle',
              symbolSize: 6,
              data: [
                {
                  type: 'max',
                  name: '高',
                  itemStyle: {color: extremeColor || fundTitle || ink},
                  label: {
                    show: true,
                    position: maxLabelLayout.position,
                    distance: maxLabelLayout.distance,
                    align: maxLabelLayout.align,
                    offset: maxLabelLayout.offset,
                    color: extremeColor || fundTitle || ink,
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: 'transparent',
                    formatter(p: {value?: unknown}) {
                      return formatExtreme(Number(p.value))
                    },
                  },
                },
                {
                  type: 'min',
                  name: '低',
                  itemStyle: {color: extremeColor || fundTitle || ink},
                  label: {
                    show: true,
                    position: minLabelLayout.position,
                    distance: minLabelLayout.distance,
                    align: minLabelLayout.align,
                    offset: minLabelLayout.offset,
                    color: extremeColor || fundTitle || ink,
                    fontSize: 11,
                    fontWeight: 700,
                    backgroundColor: 'transparent',
                    formatter(p: {value?: unknown}) {
                      return formatExtreme(Number(p.value))
                    },
                  },
                },
              ],
            }
          : undefined,
      },
    ],
  }
}
