const {formatTrendAxisDate} = require('./format')
const {getTone, PALETTE} = require('./palette')

const RISE = PALETTE.light.rise
const FALL = PALETTE.light.fall
const FLAT = PALETTE.light.flat

function toneByDelta(delta, theme) {
  const {rise, fall, flat} = getTone(theme)
  if (delta == null || Number.isNaN(Number(delta))) return flat
  if (Number(delta) > 0) return rise
  if (Number(delta) < 0) return fall
  return flat
}

function hexAlpha(hex, alpha) {
  const a = Math.round(alpha * 255)
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** tab 名义跨度（年）；成立来等未知周期用数据首尾推算 */
const RANGE_YEARS = {
  '1m': 1 / 12,
  '3m': 3 / 12,
  '6m': 6 / 12,
  '1y': 1,
  '3y': 3,
}

function pointDateKey(p) {
  const s = String((p && (p.date || p.time)) || '').trim()
  return s.length >= 10 ? s.slice(0, 10) : ''
}

function yearsFromPoints(points) {
  const list = points || []
  let first = ''
  let last = ''
  for (let i = 0; i < list.length; i++) {
    const d = pointDateKey(list[i])
    if (!d) continue
    if (!first) first = d
    last = d
  }
  if (!first || !last) return 0
  const a = new Date(`${first}T00:00:00`)
  const b = new Date(`${last}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  return Math.max(0, (b.getTime() - a.getTime()) / (365.25 * 86400000))
}

function resolveRangeYears(range, points) {
  if (RANGE_YEARS[range] != null) return RANGE_YEARS[range]
  return yearsFromPoints(points)
}

/**
 * 按 tab 时间跨度抽稀：
 * - 1 年以下：每个交易日
 * - [1,2)：每 2 日；[2,3)：每 3 日；[3,4)：每 4 日；以此类推
 */
function resolveSamplePlan(range, points) {
  const years = resolveRangeYears(range, points)
  if (!(years >= 1)) return {mode: 'day', years: years || 0}
  const stride = Math.floor(years) + 1
  return {mode: 'stride', stride, years}
}

/**
 * 按周期抽稀走势点（保证首尾点）。
 */
function sampleTrendPoints(points, range) {
  const list = (points || []).filter(Boolean)
  if (list.length <= 2) return list
  const plan = resolveSamplePlan(range, list)
  if (plan.mode === 'day') return list

  const stride = Math.max(2, plan.stride || 2)
  const picked = [list[0]]
  for (let i = stride; i < list.length - 1; i += stride) {
    picked.push(list[i])
  }
  if (picked[picked.length - 1] !== list[list.length - 1]) {
    picked.push(list[list.length - 1])
  }
  return picked
}

/** 稀疏刻度：idxs 为有标签的下标，始终保留首尾 */
function thinLabelIndexes(idxs, maxTicks) {
  if (idxs.length <= maxTicks) return new Set(idxs)
  const keep = new Set([idxs[0], idxs[idxs.length - 1]])
  const inner = maxTicks - 2
  for (let k = 1; k <= inner; k++) {
    const t = k / (inner + 1)
    keep.add(idxs[Math.round(t * (idxs.length - 1))])
  }
  return keep
}

function buildBoundaryLabels(fullDates, unit, maxTicks) {
  const labels = fullDates.map(() => '')
  const idxs = []
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

function extractSeries(points, valueKey, range) {
  const sampled = sampleTrendPoints(points, range)
  const plan = resolveSamplePlan(range, points)
  const labels = []
  const values = []
  const full = []
  const seriesPoints = []
  // 抽稀后：不足约 3 年标月，更长标年
  const axisUnit =
    plan.mode === 'day' ? '' : plan.years >= 3 ? 'year' : 'month'
  const sparseAxis = !!axisUnit
    ; (sampled || []).forEach((p) => {
      if (!p) return
      const raw = p[valueKey]
      if (raw == null || raw === '') return
      const n = Number(raw)
      if (!Number.isFinite(n)) return
      values.push(n)
      seriesPoints.push(p)
      const label = p.time || p.date || ''
      full.push(label)
      if (typeof label === 'string' && label.length >= 10) {
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

/** 高低点数字贴边时向图内收，避免出屏幕 */
function extremeLabelLayout(idx, total, role) {
  const n = Math.max(total, 1)
  const t = n <= 1 ? 0.5 : idx / (n - 1)
  const nearL = t <= 0.12
  const nearR = t >= 0.88
  return {
    position: role === 'max' ? 'top' : 'bottom',
    distance: 4,
    // 左缘：文字锚在点右侧；右缘：锚在点左侧
    align: nearL ? 'left' : nearR ? 'right' : 'center',
    offset: nearL ? [6, 0] : nearR ? [-6, 0] : [0, 0],
  }
}

/** 列表迷你折线；toneDelta 传入时与卡片涨跌幅同色 */
function buildSparkOption(points, valueKey, theme, toneDelta) {
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
    toneDelta != null && toneDelta !== '' && Number.isFinite(Number(toneDelta))
      ? Number(toneDelta)
      : last
  const color = toneByDelta(delta, theme)
  // 列表迷你图：再淡一点，不抢右侧收益数字
  const lineColor = hexAlpha(color, theme === 'dark' ? 0.36 : 0.32)
  // 小程序精简 echarts 常无 markLine，用 0 值虚线系列代替
  const zeroLine = theme === 'dark' ? 'rgba(238,242,255,0.42)' : 'rgba(36,53,82,0.35)'
  const cats = values.map((_, i) => i)
  const zeros = values.map(() => 0)
  let min = Math.min.apply(null, values)
  let max = Math.max.apply(null, values)
  // 保证 0 轴落在可视区内
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

/**
 * 完整走势图
 * @param {'percent'|'price'|'netValue'} valueMode 纵轴含义
 */
function buildTrendOption({
  points,
  valueKey,
  theme,
  valueMode = 'percent',
  extraKey,
  extraLabel,
  showExtremes = false,
  range = '',
}) {
  const muted = theme === 'dark' ? '#8b93a7' : '#7a8494'
  const axisLine = theme === 'dark' ? 'rgba(238,242,255,0.12)' : 'rgba(16,20,28,0.1)'
  const {labels, values, full, sparseAxis, sampled} = extractSeries(
    points,
    valueKey,
    range,
  )
  if (!values.length) return null

  const last = values[values.length - 1]
  const first = values[0]
  const {rise, fall} = getTone(theme)
  const isPrice = valueMode === 'price'
  const goldInk = theme === 'dark' ? '#e0c07a' : '#b08a48'
  const ink = theme === 'dark' ? '#eef2ff' : '#10141c'
  // 与基金名称 .ticket-name 同色（muted）
  const fundTitle = theme === 'dark' ? '#8b93a7' : '#7a8494'
  const color = isPrice
    ? goldInk
    : valueMode === 'percent'
      ? toneByDelta(last, theme)
      : toneByDelta(last - first, theme)
  // 高低点：金价用金色，基金用名称同色
  const extremeColor = showExtremes ? (isPrice ? goldInk : fundTitle) : null
  const hideEndLabel = isPrice || showExtremes
  const formatExtreme = (n) => {
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

  let min = Math.min.apply(null, values)
  let max = Math.max.apply(null, values)
  const maxIdx = values.indexOf(max)
  const minIdx = values.indexOf(min)
  const maxLabelLayout = extremeLabelLayout(maxIdx, values.length, 'max')
  const minLabelLayout = extremeLabelLayout(minIdx, values.length, 'min')
  if (min === max) {
    min -= valueMode === 'percent' ? 0.5 : Math.abs(min) * 0.01 || 1
    max += valueMode === 'percent' ? 0.5 : Math.abs(max) * 0.01 || 1
  }
  // 高低点标签朝图内时，纵轴多留一点空间，避免压住坐标
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
      ? (v) => `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}%`
      : (v) => Number(v).toFixed(valueMode === 'netValue' ? 2 : 0)

  return {
    animation: false,
    grid: {
      left: isPrice || showExtremes ? 46 : 48,
      // 高低点贴右缘时需留白；无末端标签时也不宜过窄
      right: showExtremes ? 18 : hideEndLabel ? 12 : 52,
      // 高低点标在外侧时，上下多留白避免数字出屏
      top: showExtremes ? 40 : 28,
      bottom: showExtremes ? 48 : 36,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(28,31,36,0.92)',
      borderWidth: 0,
      padding: [8, 10],
      textStyle: {color: '#fff', fontSize: 11},
      formatter(params) {
        const list = Array.isArray(params) ? params : [params]
        const p = list[0]
        if (!p || p.value == null || p.value === '') return ''
        const idx = p.dataIndex || 0
        const date = full[idx] || p.axisValue || ''
        const n = Number(p.value)
        let head =
          valueMode === 'percent'
            ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%`
            : n.toFixed(valueMode === 'netValue' ? 4 : 2)
        let extra = ''
        if (extraLabel && extras[idx] != null && Number.isFinite(extras[idx])) {
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
        // 周/月轴标签已按边界稀疏；天轴等距抽样
        interval: sparseAxis
          ? 0
          : Math.max(0, Math.floor(labels.length / 4) - 1),
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
        // 金价/带高低点：关闭末端标注（区间涨跌已在页头）
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
                  formatter(p) {
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
                  formatter(p) {
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

module.exports = {
  buildSparkOption,
  buildTrendOption,
}
