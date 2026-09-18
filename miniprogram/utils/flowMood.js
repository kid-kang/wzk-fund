/** 近一月色带与小倍官方情绪分同一套：0 轴在微热 / 微冷交界。 */

const MOOD_BANDS = [
  {key: 'boil', label: '沸点', from: 2, to: 3, hex: '#e24b32'},
  {key: 'hot', label: '过热', from: 1, to: 2, hex: '#ef7a4a'},
  {key: 'warm', label: '微热', from: 0, to: 1, hex: '#f3a37a'},
  {key: 'cool', label: '微冷', from: -1, to: 0, hex: '#8eb6ea'},
  {key: 'cold', label: '过冷', from: -2, to: -1, hex: '#5b93d6'},
  {key: 'ice', label: '冰点', from: -3, to: -2, hex: '#3a74c4'},
]

function moodHalf(values) {
  let maxAbs = 0
  for (let i = 0; i < (values || []).length; i++) {
    const n = Math.abs(Number(values[i]))
    if (Number.isFinite(n) && n > maxAbs) maxAbs = n
  }
  return maxAbs > 0 ? maxAbs : 1
}

function moodFromScore(score) {
  const y = Number(score)
  if (!Number.isFinite(y)) return {key: 'flat', text: '', tone: 'flat'}
  if (y >= 2) return {key: 'boil', text: '沸点', tone: 'rise'}
  if (y >= 1) return {key: 'hot', text: '过热', tone: 'rise'}
  if (y >= 0) return {key: 'warm', text: '微热', tone: 'rise'}
  if (y >= -1) return {key: 'cool', text: '微冷', tone: 'fall'}
  if (y >= -2) return {key: 'cold', text: '过冷', tone: 'fall'}
  return {key: 'ice', text: '冰点', tone: 'fall'}
}

function moodFromYi(yi, half) {
  const v = Number(yi)
  if (!Number.isFinite(v)) return {key: 'flat', text: '', tone: 'flat'}
  const unit = (Number(half) > 0 ? Number(half) : 1) / 3
  return moodFromScore(v / unit)
}

/** 用当日官方情绪分反推「1 分 = 多少亿」，让近一月看当日与当日 tab 同一档。 */
function moodHalfFromOfficial(values, emotion) {
  const last = Number(values && values.length ? values[values.length - 1] : NaN)
  const score = emotion && Number(emotion.score)
  if (
    Number.isFinite(last) &&
    last !== 0 &&
    Number.isFinite(score) &&
    Math.abs(score) >= 0.12 &&
    last * score > 0
  ) {
    return 3 * Math.abs(last / score)
  }
  return moodHalf(values)
}

/** 近一月只保留数据落到的情绪档，纵轴按这些档均分，空档不占高度。 */
function moodOccupiedView(values, half) {
  const unit = (Number(half) > 0 ? Number(half) : 1) / 3
  const keys = {}
  for (let i = 0; i < (values || []).length; i++) {
    const n = Number(values[i])
    if (!Number.isFinite(n)) continue
    const key = moodFromScore(n / unit).key
    if (key && key !== 'flat') keys[key] = true
  }
  if (!Object.keys(keys).length) keys.warm = true
  const bands = MOOD_BANDS.filter((b) => keys[b.key])
  const top = bands[0]
  const bot = bands[bands.length - 1]
  return {
    unit,
    bands,
    minYi: bot.from * unit,
    maxYi: top.to * unit,
  }
}

module.exports = {
  MOOD_BANDS,
  MOOD_AXIS_W: 20,
  MOOD_RAIL_W: 3,
  MOOD_PLOT_GAP: 0,
  MOOD_PLOT_LEFT: 20 + 3,
  moodHalf,
  moodFromYi,
  moodFromScore,
  moodHalfFromOfficial,
  moodOccupiedView,
}
