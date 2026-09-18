/** 近一月净流入：按当月极值六等分情绪带，0 轴在微热 / 微冷交界。 */

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

function moodFromYi(yi, half) {
  const v = Number(yi)
  if (!Number.isFinite(v)) {
    return {key: 'flat', text: '', tone: 'flat'}
  }
  const unit = (Number(half) > 0 ? Number(half) : 1) / 3
  const score = v / unit
  if (score >= 2) return {key: 'boil', text: '沸点', tone: 'rise'}
  if (score >= 1) return {key: 'hot', text: '过热', tone: 'rise'}
  if (score >= 0) return {key: 'warm', text: '微热', tone: 'rise'}
  if (score >= -1) return {key: 'cool', text: '微冷', tone: 'fall'}
  if (score >= -2) return {key: 'cold', text: '过冷', tone: 'fall'}
  return {key: 'ice', text: '冰点', tone: 'fall'}
}

module.exports = {
  MOOD_BANDS,
  MOOD_AXIS_W: 20,
  MOOD_RAIL_W: 3,
  MOOD_PLOT_GAP: 0,
  MOOD_PLOT_LEFT: 20 + 3,
  moodHalf,
  moodFromYi,
}
