/**
 * 图表涨跌色（A 股：红涨绿跌）。
 * app.wxss 的 --rise/--fall 需手工与此保持同步。
 *
 * 跌绿取「玉青」——深、哑、偏墨，避开荧光薄荷绿。
 */
const PALETTE = {
  light: {
    rise: '#D7263D',
    fall: '#0B6B4F',
    flat: '#7A8494',
  },
  dark: {
    rise: '#FF6B7A',
    fall: '#4BB892',
    flat: '#8B93A7',
  },
}

function getTone(theme) {
  return theme === 'dark' ? PALETTE.dark : PALETTE.light
}

module.exports = {
  PALETTE,
  getTone,
}
