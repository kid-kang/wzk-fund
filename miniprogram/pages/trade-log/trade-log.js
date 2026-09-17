const store = require('../../utils/portfolioStore')
const {applyDueSips, settlePendingTrades} = require('../../utils/tradeOps')
const {formatAmount} = require('../../utils/format')
const {getSipCycle, formatShares} = require('../../utils/tradeMath')
const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')

const TYPE_META = {
  buy: {label: '加仓', tone: 'buy'},
  sell: {label: '减仓', tone: 'sell'},
  sip: {label: '定投', tone: 'sip'},
  exit: {label: '清仓', tone: 'exit'},
}

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

function typeMeta(type) {
  return TYPE_META[type] || {label: '交易', tone: 'buy'}
}

function sessionText(session) {
  return session === 'after15' ? '下午3点后' : '下午3点前'
}

Page({
  data: {
    ...themeView,
    navTitle: '交易记录',
    hideAmounts: false,
    plans: [],
    months: [],
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
      await settlePendingTrades()
      await applyDueSips()
    } catch (e) {}

    const plans = store
      .listSipPlans()
      .filter((p) => p.active || p.paused)
      .map((p) => ({
        id: p.id,
        name: p.name || p.code,
        code: p.code,
        cycle: getSipCycle(p.cycle).label,
        first: p.firstDate,
        paused: !!p.paused,
        statusText: p.paused ? '已暂停' : '进行中',
        amountText: hideAmounts ? '***' : formatAmount(p.amount),
      }))

    const trades = store.listTrades()
    const buckets = new Map()
    for (const t of trades) {
      const key = String(t.date || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(key)) continue
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(t)
    }
    const months = Array.from(buckets.keys())
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => {
        const [year, month] = key.split('-')
        const list = buckets.get(key).map((t) => {
          const meta = typeMeta(t.type)
          const pending = !!t.pending
          const sharesText = hideAmounts ? '***' : pending ? '待确认' : `${formatShares(t.shares)}份`
          const side = t.type === 'sell' || t.type === 'exit' ? '卖出' : '买入'
          return {
            id: t.id,
            name: t.name || t.code,
            code: t.code,
            date: t.date,
            typeLabel: pending ? `${meta.label}·待确认` : meta.label,
            tone: pending ? 'pending' : meta.tone,
            amountText: hideAmounts
              ? '***'
              : pending && !(Number(t.amount) > 0)
                ? '待确认'
                : formatAmount(t.amount),
            sharesText,
            pending,
            side,
            metaText: pending
              ? `${t.date} · ${sessionText(t.session)} · 等${t.confirmDate || t.date}净值`
              : `${t.date} · ${side} ${sharesText}`,
          }
        })
        return {
          key,
          title: `${Number(year)}年${Number(month)}月`,
          list,
        }
      })

    this.setData({
      hideAmounts,
      plans,
      months,
      empty: !plans.length && !trades.length,
    })
  },
})
