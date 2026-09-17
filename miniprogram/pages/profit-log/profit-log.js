const store = require('../../utils/portfolioStore')
const {backfillProfitLog} = require('../../utils/profitSync')
const {formatMoney, pctClass} = require('../../utils/format')
const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')

/** 柱宽固定；槽位只留很窄的缝，高度拉高好看出每天差距 */
const SLOT_RPX = 74
const CHART_HEIGHT = 256
const LABEL_PAD = 26

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

function formatBarLabel(v) {
  if (v == null || Number.isNaN(Number(v))) return ''
  const n = Number(v)
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`
  return `${sign}${abs.toFixed(1)}`
}

function layoutDays(rows, hideAmounts) {
  const plotH = Math.max(1, CHART_HEIGHT - LABEL_PAD * 2)
  let min = 0
  let max = 0
  const nums = rows.map((row) => {
    const n = Number(row.pnl)
    return Number.isFinite(n) ? n : 0
  })
  for (let i = 0; i < nums.length; i++) {
    min = Math.min(min, nums[i])
    max = Math.max(max, nums[i])
  }
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.16
  min -= pad
  max += pad
  const span = max - min || 1
  const yAt = (v) => LABEL_PAD + ((max - v) / span) * plotH
  const zeroY = yAt(0)
  const days = rows.map((row, i) => {
    const pnl = nums[i]
    const y = yAt(pnl)
    const top = Math.min(y, zeroY)
    const h = Math.max(2, Math.abs(y - zeroY))
    return {
      date: row.date,
      day: String(Number(String(row.date).slice(8, 10))),
      pnl,
      tone: pctClass(pnl),
      barTop: top,
      barH: h,
      labelTop: pnl >= 0 ? Math.max(0, top - 18) : top + h + 2,
      label: hideAmounts ? '' : formatBarLabel(pnl),
    }
  })
  return {days, zeroY}
}

function groupMonths(rows, hideAmounts) {
  const buckets = new Map()
  for (const row of rows || []) {
    const key = String(row.date || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(row)
  }
  const keys = Array.from(buckets.keys()).sort((a, b) => (a < b ? 1 : -1))
  return keys.map((key) => {
    const list = buckets.get(key).slice().sort((a, b) => a.date.localeCompare(b.date))
    const {days, zeroY} = layoutDays(list, hideAmounts)
    let sum = 0
    for (let i = 0; i < list.length; i++) sum += Number(list[i].pnl) || 0
    const [year, month] = key.split('-')
    return {
      key,
      title: `${Number(year)}年${Number(month)}月`,
      days,
      zeroY,
      trackRpx: Math.max(SLOT_RPX, days.length * SLOT_RPX),
      sumText: hideAmounts ? '***' : formatMoney(sum),
      sumClass: hideAmounts ? 'flat' : pctClass(sum),
    }
  })
}

function summaryFromRows(rows, hideAmounts) {
  const n = (rows || []).length
  let sum = 0
  for (const row of rows || []) {
    sum += Number(row.pnl) || 0
  }
  return {
    sumText: hideAmounts ? '***' : n ? formatMoney(sum) : '--',
    sumClass: hideAmounts ? 'flat' : pctClass(sum),
    empty: !n,
  }
}

Page({
  data: {
    ...themeView,
    navTitle: '收益记录',
    hideAmounts: false,
    chartHeight: CHART_HEIGHT,
    months: [],
    sumText: '--',
    sumClass: 'flat',
    empty: true,
  },

  onLoad() {
    const themePatch = getThemeViewState()
    syncNavigationBar(themePatch.theme)
    this.setData(themePatch)
    this.reload()
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
    this.reload()
  },

  async reload() {
    let hideAmounts = false
    try {
      hideAmounts = !!wx.getStorageSync('holdings_hide_amounts')
    } catch (e) {}
    try {
      await backfillProfitLog()
    } catch (e) {}
    const rows = store.listProfitLog()
    this.setData(
      Object.assign({hideAmounts, months: groupMonths(rows, hideAmounts)}, summaryFromRows(rows, hideAmounts)),
    )
  },
})
