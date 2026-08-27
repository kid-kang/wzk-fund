const {getTone} = require('./palette')

/** 迷你图宽度有限，120 点已够密；过低会锯齿 */
const SPARK_MAX_POINTS = 120

/** 相邻点差这么久即视为休市间断（午休 11:30→13:00 差 90 分钟，抽稀后正常间隔仅几分钟） */
const SPARK_GAP_MINUTES = 20

function parseSparkMinute(time) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time || ''))
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function extractSparkValues(points, valueKey = 'growth') {
  const values = []
  for (const p of points || []) {
    if (!p) continue
    const n = Number(p[valueKey])
    if (Number.isFinite(n)) values.push(n)
  }
  return values
}

function extractSparkPoints(points, valueKey = 'growth') {
  const out = []
  for (const p of points || []) {
    if (!p) continue
    const n = Number(p[valueKey])
    if (!Number.isFinite(n)) continue
    out.push({value: n, minute: parseSparkMinute(p.time)})
  }
  return out
}

/** 断点索引 i 表示第 i 与 i+1 个点之间休市，折线在此断开 */
function findSparkBreaks(points) {
  const breaks = []
  const list = points || []
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1].minute
    const cur = list[i].minute
    if (prev == null || cur == null) continue
    if (cur - prev >= SPARK_GAP_MINUTES) breaks.push(i - 1)
  }
  return breaks
}

/** 均匀抽稀的下标，始终保留首尾 */
function sampleIndices(length, maxPoints = SPARK_MAX_POINTS) {
  const out = []
  if (length <= maxPoints) {
    for (let i = 0; i < length; i++) out.push(i)
    return out
  }
  const lastIdx = length - 1
  let prev = -1
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * lastIdx)
    if (idx === prev) continue
    out.push(idx)
    prev = idx
  }
  if (prev !== lastIdx) out.push(lastIdx)
  return out
}

/** 均匀抽稀，始终保留首尾 */
function downsampleSpark(values, maxPoints = SPARK_MAX_POINTS) {
  const list = Array.isArray(values) ? values : []
  return sampleIndices(list.length, maxPoints).map((i) => list[i])
}

function sparkKey(values, breaks) {
  const line = (values || []).map((v) => Number(v).toFixed(4)).join(',')
  const gaps = (breaks || []).join('-')
  return gaps ? `${line}|${gaps}` : line
}

function toSparkSeries(points, valueKey = 'growth') {
  const all = extractSparkPoints(points, valueKey)
  const picked = sampleIndices(all.length).map((i) => all[i])
  const values = picked.map((p) => p.value)
  const breaks = findSparkBreaks(picked)
  return {
    spark: values,
    sparkBreaks: breaks,
    sparkKey: sparkKey(values, breaks),
  }
}

/** 曲线未变时复用上一帧数组引用，避免 spark-line 无意义重绘 */
function reuseUnchangedSpark(prevRows, nextRows) {
  const map = new Map()
  ;(prevRows || []).forEach((r) => {
    if (r && r.code) map.set(r.code, r)
  })
  return (nextRows || []).map((row) => {
    const prev = map.get(row.code)
    if (prev && prev.sparkKey && prev.sparkKey === row.sparkKey && prev.spark) {
      row.spark = prev.spark
      if (prev.sparkBreaks) row.sparkBreaks = prev.sparkBreaks
    }
    return row
  })
}

function hexAlpha(hex, alpha) {
  const h = String(hex || '').replace('#', '')
  if (h.length < 6) return `rgba(122,132,148,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function toneByDelta(delta, theme) {
  const {rise, fall, flat} = getTone(theme)
  if (delta == null || Number.isNaN(Number(delta))) return flat
  if (Number(delta) > 0) return rise
  if (Number(delta) < 0) return fall
  return flat
}

module.exports = {
  SPARK_MAX_POINTS,
  SPARK_GAP_MINUTES,
  extractSparkValues,
  extractSparkPoints,
  findSparkBreaks,
  downsampleSpark,
  sparkKey,
  toSparkSeries,
  reuseUnchangedSpark,
  hexAlpha,
  toneByDelta,
}
