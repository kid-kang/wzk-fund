const {getTone} = require('./palette')

/** 迷你图宽度有限，120 点已够密；过低会锯齿 */
const SPARK_MAX_POINTS = 120

function extractSparkValues(points, valueKey = 'growth') {
  const values = []
  for (const p of points || []) {
    if (!p) continue
    const n = Number(p[valueKey])
    if (Number.isFinite(n)) values.push(n)
  }
  return values
}

/** 均匀抽稀，始终保留首尾 */
function downsampleSpark(values, maxPoints = SPARK_MAX_POINTS) {
  const list = Array.isArray(values) ? values : []
  if (list.length <= maxPoints) return list.slice()
  const out = []
  const lastIdx = list.length - 1
  let prev = -1
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i / (maxPoints - 1)) * lastIdx)
    if (idx === prev) continue
    out.push(list[idx])
    prev = idx
  }
  if (prev !== lastIdx) out.push(list[lastIdx])
  return out
}

function sparkKey(values) {
  return (values || []).map((v) => Number(v).toFixed(4)).join(',')
}

function toSparkSeries(points, valueKey = 'growth') {
  const values = downsampleSpark(extractSparkValues(points, valueKey))
  return {
    spark: values,
    sparkKey: sparkKey(values),
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
  extractSparkValues,
  downsampleSpark,
  sparkKey,
  toSparkSeries,
  reuseUnchangedSpark,
  hexAlpha,
  toneByDelta,
}
