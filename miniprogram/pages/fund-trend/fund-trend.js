const api = require('../../utils/api')
const {formatPct, pctClass} = require('../../utils/format')
const {
  availableFundRanges,
  defaultFundRange,
  formatFundAge,
  isRangeAvailable,
} = require('../../utils/fundRanges')
const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')

function emptyRanges(ageDays) {
  return availableFundRanges(ageDays).map((t) =>
    Object.assign({}, t, {pctText: '--', pctClass: 'flat'}),
  )
}

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

/** 停留详情页时重仓行情轮询间隔 */
const HOLDINGS_POLL_MS = 60 * 1000
/** 阶段表默认展示行数；「查看更多」每次追加 */
const STAGE_PAGE_SIZE = 5

const STAGE_TABS = [
  {key: 'nav', label: '历史净值'},
  {key: 'return', label: '阶段涨幅'},
  {key: 'drawdown', label: '阶段回撤'},
]

const STAGE_GRAINS = [
  {key: 'stage', label: '阶段'},
  {key: 'month', label: '月度'},
  {key: 'quarter', label: '季度'},
  {key: 'semi', label: '半年度'},
  {key: 'year', label: '年度'},
]

Page({
  data: {
    ...themeView,
    navTitle: '基金走势',
    code: '',
    name: '',
    ageDays: null,
    ageText: '',
    range: '1y',
    ranges: emptyRanges(null),
    chartPoints: [],
    chartHeight: 300,
    chartEpoch: 0,
    loading: false,
    error: '',
    holdings: [],
    holdingsLoading: false,
    holdingsError: '',
    totalWeightText: '',
    reportQuarterText: '',
    stageTabs: STAGE_TABS,
    stageGrains: STAGE_GRAINS,
    stageTab: 'return',
    stageGrain: 'stage',
    stageShowGrain: true,
    stageLabelCol: '周期',
    stageValueCol: '本基金',
    stageLoading: false,
    stageError: '',
    stageRows: [],
    stageHasMore: false,
    stageLimit: STAGE_PAGE_SIZE,
  },

  onLoad(query) {
    this._dead = false
    this._byRange = {}
    this._holdingsTimer = null
    this._holdingsFetching = false
    this._stageStats = null
    const themePatch = getThemeViewState()
    syncNavigationBar(themePatch.theme)
    const code = String(query.code || '').padStart(6, '0')
    const name = query.name ? decodeURIComponent(query.name) : ''
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const chartHeight = Math.max(260, Math.floor((win.windowWidth || 375) * 0.72))
    this.setData({
      ...themePatch,
      code,
      name,
      chartHeight,
      loading: true,
      holdingsLoading: true,
      stageLoading: true,
    })
    this.bootstrap()
    this.loadHoldings({silent: false})
    // 阶段统计与图表并行，但不轮询（全量净值重）
    this.loadStageStats()
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
    this.startHoldingsPoll()
  },

  onHide() {
    this.stopHoldingsPoll()
  },

  onUnload() {
    this._dead = true
    this.stopHoldingsPoll()
  },

  startHoldingsPoll() {
    this.stopHoldingsPoll()
    if (this._dead || !this.data.code) return
    this._holdingsTimer = setInterval(() => {
      this.loadHoldings({silent: true})
    }, HOLDINGS_POLL_MS)
  },

  stopHoldingsPoll() {
    if (this._holdingsTimer) {
      clearInterval(this._holdingsTimer)
      this._holdingsTimer = null
    }
  },

  async bootstrap() {
    await this.loadQuote()
    if (this._dead) return
    const range = this.data.range
    try {
      await this.fetchAndStoreRange(range)
      if (this._dead) return
      this.applyChart(range)
      this.setData({loading: false})
    } catch (e) {
      if (this._dead) return
      this.setData({
        loading: false,
        error: (e && e.message) || '加载失败',
        chartPoints: [],
      })
    }
    this.prefetchHistory()
  },

  async loadQuote() {
    try {
      const quote = await api.fetchFundQuote(this.data.code)
      if (this._dead) return
      const ageDays =
        quote.ageDays != null && Number.isFinite(Number(quote.ageDays))
          ? Number(quote.ageDays)
          : null
      const range = defaultFundRange(ageDays)
      this._byRange = {}
      this.setData({
        name: quote.name || this.data.name || this.data.code,
        ageDays,
        ageText: formatFundAge(quote.establishDate, ageDays),
        range,
        ranges: emptyRanges(ageDays),
      })
    } catch (e) {
      if (this._dead) return
      if (!this.data.name) {
        this.setData({error: (e && e.message) || '行情加载失败'})
      }
    }
  },

  stageSourceList() {
    const stats = this._stageStats
    if (!stats) return []
    const tab = this.data.stageTab
    if (tab === 'nav') return stats.navHistory || []
    if (tab === 'drawdown') return stats.drawdowns || []
    const g = this.data.stageGrain
    if (g === 'month') return stats.monthlyReturns || []
    if (g === 'quarter') return stats.quarterlyReturns || []
    if (g === 'semi') return stats.semiAnnualReturns || []
    if (g === 'year') return stats.annualReturns || []
    return stats.periodReturns || []
  },

  refreshStageRows(limit) {
    const all = this.stageSourceList()
    const n = limit != null ? limit : this.data.stageLimit
    const tab = this.data.stageTab
    const rows = all.slice(0, n).map((item) => {
      if (tab === 'nav') {
        return {
          key: item.date,
          label: item.dateLabel,
          valueText: item.dayChangeText,
          valueClass: item.dayChangeClass,
        }
      }
      return {
        key: item.key,
        label: item.label,
        valueText: item.percentText,
        valueClass: item.percentClass,
      }
    })
    this.setData({
      stageRows: rows,
      stageLimit: n,
      stageHasMore: all.length > n,
      stageShowGrain: tab === 'return',
      stageLabelCol: tab === 'nav' ? '日期' : '周期',
      stageValueCol: tab === 'nav' ? '日涨跌' : '本基金',
    })
  },

  async loadStageStats() {
    this.setData({stageLoading: true, stageError: ''})
    try {
      const data = await api.fetchFundStageStats(this.data.code)
      if (this._dead) return
      this._stageStats = data || null
      this.refreshStageRows(STAGE_PAGE_SIZE)
      this.setData({stageLoading: false})
    } catch (e) {
      if (this._dead) return
      this._stageStats = null
      this.setData({
        stageLoading: false,
        stageError: (e && e.message) || '阶段数据加载失败',
        stageRows: [],
        stageHasMore: false,
      })
    }
  },

  onStageTabTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.stageTab) return
    this.setData({stageTab: key})
    this.refreshStageRows(STAGE_PAGE_SIZE)
  },

  onStageGrainTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.stageGrain) return
    this.setData({stageGrain: key})
    this.refreshStageRows(STAGE_PAGE_SIZE)
  },

  onStageMoreTap() {
    this.refreshStageRows(this.data.stageLimit + STAGE_PAGE_SIZE)
  },

  async loadHoldings({silent = false} = {}) {
    if (this._holdingsFetching) return
    this._holdingsFetching = true
    if (!silent) this.setData({holdingsLoading: true, holdingsError: ''})
    try {
      const data = await api.fetchFundHoldings(this.data.code)
      if (this._dead) return
      const holdings = (data && data.holdings) || []
      this.setData({
        holdings,
        totalWeightText: (data && data.totalWeightText) || '',
        reportQuarterText: (data && data.reportQuarterText) || '',
        holdingsLoading: false,
        holdingsError: holdings.length ? '' : '暂无重仓数据',
      })
    } catch (e) {
      if (this._dead) return
      // 轮询失败保留旧数据，避免整块闪空
      if (silent && this.data.holdings.length) {
        this.setData({holdingsLoading: false})
        return
      }
      this.setData({
        holdings: [],
        totalWeightText: '',
        reportQuarterText: '',
        holdingsLoading: false,
        holdingsError: (e && e.message) || '重仓加载失败',
      })
    } finally {
      this._holdingsFetching = false
    }
  },

  mergeByRange(range, data) {
    this._byRange = Object.assign({}, this._byRange || {}, {
      [range]: data,
    })
    this.refreshRanges()
    return data
  },

  async fetchAndStoreRange(range) {
    const cached = (this._byRange || {})[range]
    if (cached) {
      this.refreshRanges()
      return cached
    }
    const data = await api.fetchFundHistory(this.data.code, range)
    if (this._dead) return data
    return this.mergeByRange(range, data)
  },

  prefetchHistory() {
    const ageDays = this.data.ageDays
    availableFundRanges(ageDays).forEach((t) => {
      const r = t.key
      if ((this._byRange || {})[r]) return
      api
        .fetchFundHistory(this.data.code, r)
        .then((data) => {
          if (this._dead || (this._byRange || {})[r]) return
          this.mergeByRange(r, data)
        })
        .catch(() => {})
    })
  },

  refreshRanges() {
    if (this._dead) return
    const by = this._byRange || {}
    const ranges = availableFundRanges(this.data.ageDays).map((t) => {
      const hist = by[t.key]
      const pct = hist ? hist.periodPercent : null
      return Object.assign({}, t, {
        pctText: formatPct(pct),
        pctClass: pctClass(pct),
      })
    })
    this.setData({ranges})
  },

  applyChart(range) {
    const hist = (this._byRange || {})[range]
    if (!hist) {
      this.setData({chartPoints: []})
      return
    }
    const chartPoints = (hist.points || []).map((p) => ({
      date: p.date,
      value: p.percent,
      percent: p.percent,
      netValue: p.netValue,
    }))
    this.setData({
      chartPoints,
      error: '',
    })
    this.refreshRanges()
  },

  onRangeTap(e) {
    const key = e.currentTarget.dataset.key
    if (!key || key === this.data.range) return
    if (!isRangeAvailable(key, this.data.ageDays)) return
    const epoch = this.data.chartEpoch + 1
    const cached = (this._byRange || {})[key]
    this.setData({
      range: key,
      loading: !cached,
      error: '',
      chartPoints: [],
      chartEpoch: epoch,
    })
    this.loadRange(key, epoch)
  },

  async loadRange(range, epoch) {
    if (this._dead || range !== this.data.range || epoch !== this.data.chartEpoch) return

    if ((this._byRange || {})[range]) {
      this.setData({loading: false})
      this.applyChart(range)
      return
    }

    this.setData({loading: true, error: '', chartPoints: []})
    try {
      await this.fetchAndStoreRange(range)
      if (this._dead || range !== this.data.range || epoch !== this.data.chartEpoch) return
      this.setData({loading: false})
      this.applyChart(range)
    } catch (e) {
      if (this._dead || range !== this.data.range || epoch !== this.data.chartEpoch) return
      this.setData({
        loading: false,
        error: (e && e.message) || '加载失败',
        chartPoints: [],
      })
    }
  },
})
