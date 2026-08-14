const Toast = require('@vant/weapp/toast/toast').default
const api = require('../../utils/api')
const store = require('../../utils/portfolioStore')
const {formatPct, pctClass} = require('../../utils/format')
const {
  availableFundRanges,
  defaultFundRange,
  formatFundAge,
  isRangeAvailable,
} = require('../../utils/fundRanges')
const {getThemeViewState, syncNavigationBar, navigateTo} = require('../../utils/theme')

function mapSectorTags(quote) {
  const items = Array.isArray(quote && quote.sectorItems) ? quote.sectorItems : []
  if (items.length) {
    return items
      .map((it) => ({
        name: String((it && it.name) || '').trim(),
        sectorCode: String((it && it.sectorCode) || '').trim(),
        mappingCode: String((it && it.mappingCode) || '').trim(),
      }))
      .filter((it) => it.name)
  }
  const sectors = Array.isArray(quote && quote.sectors) ? quote.sectors : []
  return sectors
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .map((name) => ({name, sectorCode: '', mappingCode: ''}))
}

function emptyRanges(ageDays) {
  return availableFundRanges(ageDays).map((t) =>
    Object.assign({}, t, {pctText: '--', pctClass: 'flat'}),
  )
}

function parseQuarterStamp(text) {
  const m = String(text || '').match(/(\d{4})年第(\d)季度/)
  if (!m) return {reportStampYear: '', reportStampQ: ''}
  return {reportStampYear: m[1], reportStampQ: m[2]}
}

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

/** 停留详情页时重仓行情轮询间隔 */
const HOLDINGS_POLL_MS = 60 * 1000
/** 阶段表默认展示行数；「查看更多」每次追加 */
const STAGE_PAGE_SIZE = 8
/** 历史净值默认多展示一些交易日 */
const NAV_PAGE_SIZE = 15

const STAGE_TABS = [
  {key: 'hold', label: '重仓股'},
  {key: 'nav', label: '历史净值'},
  {key: 'return', label: '阶段涨跌'},
  {key: 'drawdown', label: '最大回撤'},
  {key: 'scale', label: '规模'},
]

const STAGE_GRAINS = [
  {key: 'month', label: '月度'},
  {key: 'quarter', label: '季度'},
  {key: 'semi', label: '半年度'},
  {key: 'year', label: '年度'},
]

Page({
  data: {
    ...themeView,
    navTitle: '基金详情',
    code: '',
    name: '',
    sectorTags: [],
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
    stageTab: 'hold',
    stageGrain: 'month',
    stageShowGrain: false,
    stageShowDd: false,
    stageLabelCol: '日期',
    stageValueCol: '日涨跌',
    stageDdCol: '最大回撤',
    stageLoading: false,
    stageError: '',
    stageRows: [],
    stageHasMore: false,
    stageLimit: STAGE_PAGE_SIZE,
    watched: false,
    held: false,
    watchLabel: '+ 自选',
    watchBusy: false,
    scaleLoading: true,
    scaleError: '',
    scaleLatest: null,
    scalePoints: [],
    reportStampYear: '',
    reportStampQ: '',
    stagePaneMinH: 0,
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
      scaleLoading: true,
    })
    this.syncWatchState()
    this.bootstrap()
    this.loadHoldings({silent: false})
    this.loadStageStats()
    this.loadScale()
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
    this.syncWatchState()
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
        sectorTags: mapSectorTags(quote),
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

  onOpenSector(e) {
    const {name, sector, mapping} = e.currentTarget.dataset || {}
    const sectorCode = String(sector || '').trim()
    const mappingCode = String(mapping || '').trim()
    if (!sectorCode && !mappingCode) {
      wx.showToast({title: '该板块暂无详情', icon: 'none'})
      return
    }
    const q = [
      `sectorCode=${encodeURIComponent(sectorCode)}`,
      `mappingCode=${encodeURIComponent(mappingCode)}`,
      `name=${encodeURIComponent(name || '')}`,
    ].join('&')
    navigateTo(`/pages/sector-funds/sector-funds?${q}`)
  },

  stageSourceList() {
    const stats = this._stageStats
    if (!stats) return []
    const tab = this.data.stageTab
    if (tab === 'nav') return stats.navHistory || []
    if (tab === 'drawdown') return stats.drawdowns || []
    const g = this.data.stageGrain
    if (g === 'quarter') return stats.quarterlyReturns || []
    if (g === 'semi') return stats.semiAnnualReturns || []
    if (g === 'year') return stats.annualReturns || []
    return stats.monthlyReturns || []
  },

  pageSizeForTab(tab) {
    return tab === 'nav' ? NAV_PAGE_SIZE : STAGE_PAGE_SIZE
  },

  refreshStageRows(limit) {
    const tab = this.data.stageTab
    if (tab === 'hold' || tab === 'scale') {
      this.setData({stageShowGrain: false, stageShowDd: false})
      return
    }
    const all = this.stageSourceList()
    const n = limit != null ? limit : this.data.stageLimit
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
        ddText: item.drawdownText || '',
        ddClass: item.drawdownClass || 'flat',
      }
    })
    this.setData({
      stageRows: rows,
      stageLimit: n,
      stageHasMore: all.length > n,
      stageShowGrain: tab === 'return',
      stageShowDd: tab === 'return',
      stageLabelCol: tab === 'nav' ? '日期' : '周期',
      stageValueCol: tab === 'nav' ? '日涨跌' : tab === 'drawdown' ? '最大回撤' : '涨跌',
      stageDdCol: '最大回撤',
    })
  },

  async loadStageStats() {
    this.setData({stageLoading: true, stageError: ''})
    try {
      const data = await api.fetchFundStageStats(this.data.code)
      if (this._dead) return
      this._stageStats = data || null
      this.refreshStageRows(this.pageSizeForTab(this.data.stageTab))
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
    if (key === 'scale' || key === 'hold') {
      this.setData({stageShowGrain: false, stageShowDd: false})
      if (key === 'hold') {
        wx.nextTick(() => this.captureHoldPaneHeight())
      }
      return
    }
    this.refreshStageRows(this.pageSizeForTab(key))
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

  captureHoldPaneHeight() {
    if (this._dead || this.data.stageTab !== 'hold') return
    wx.createSelectorQuery()
      .in(this)
      .select('.hold-body')
      .boundingClientRect((rect) => {
        if (this._dead || !rect || !rect.height) return
        const h = Math.ceil(rect.height)
        if (Math.abs(h - (this.data.stagePaneMinH || 0)) < 4) return
        this.setData({stagePaneMinH: h})
      })
      .exec()
  },

  watchMeta(code) {
    const fund = store.getFund(code || this.data.code)
    const held = !!(fund && fund.type === 'hold')
    const watched = !!(fund && (fund.type === 'watch' || fund.type === 'hold'))
    return {
      held,
      watched,
      watchLabel: held ? '已持有' : watched ? '已自选' : '+ 自选',
    }
  },

  syncWatchState() {
    this.setData(this.watchMeta(this.data.code))
  },

  async onAddWatch() {
    const code = this.data.code
    const name = this.data.name
    if (!code || this.data.watchBusy) return
    const {held, watched} = this.watchMeta(code)
    if (held || watched) return
    this.setData({watchBusy: true, watched: true, watchLabel: '已自选'})
    try {
      await api.createFund({code, name, type: 'watch'})
      if (this._dead) return
      this.setData(Object.assign({watchBusy: false}, this.watchMeta(code)))
      Toast.success('已添加自选')
    } catch (err) {
      this.setData(Object.assign({watchBusy: false}, this.watchMeta(code)))
      Toast.fail((err && err.message) || '添加失败')
    }
  },

  async loadScale() {
    this.setData({scaleLoading: true, scaleError: ''})
    try {
      const data = await api.fetchFundScale(this.data.code)
      if (this._dead) return
      this.setData({
        scaleLoading: false,
        scaleLatest: (data && data.latest) || null,
        scalePoints: (data && data.points) || [],
      })
    } catch (e) {
      if (this._dead) return
      this.setData({
        scaleLoading: false,
        scaleError: (e && e.message) || '规模加载失败',
        scaleLatest: null,
        scalePoints: [],
      })
    }
  },

  async loadHoldings({silent = false} = {}) {
    if (this._holdingsFetching) return
    this._holdingsFetching = true
    if (!silent) this.setData({holdingsLoading: true, holdingsError: ''})
    try {
      const data = await api.fetchFundHoldings(this.data.code)
      if (this._dead) return
      const holdings = (data && data.holdings) || []
      const reportQuarterText = (data && data.reportQuarterText) || ''
      this.setData(
        Object.assign(
          {
            holdings,
            totalWeightText: (data && data.totalWeightText) || '',
            reportQuarterText,
            holdingsLoading: false,
            holdingsError: holdings.length ? '' : '暂无重仓数据',
          },
          parseQuarterStamp(reportQuarterText),
        ),
        () => {
          if (silent) return
          wx.nextTick(() => this.captureHoldPaneHeight())
        },
      )
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
        reportStampYear: '',
        reportStampQ: '',
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
