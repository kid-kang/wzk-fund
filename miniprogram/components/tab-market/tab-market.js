const api = require('../../utils/api')
const store = require('../../utils/portfolioStore')
const {formatPct, formatSignedYi, pctClass} = require('../../utils/format')
const {navigateTo} = require('../../utils/theme')
const {moodFromYi, moodHalfFromOfficial, MOOD_BANDS, MOOD_PLOT_LEFT} = require('../../utils/flowMood')

const RANK_TABS = [
  {key: 'boardGainers', label: '板块涨幅'},
  {key: 'boardHot', label: '热搜板块'},
  {key: 'fundHot', label: '热搜基金'},
  {key: 'fundGainers', label: '基金涨幅'},
  {key: 'fundLosers', label: '基金跌幅'},
  {key: 'fundPick', label: '自选榜'},
  {key: 'fundHold', label: '持有榜'},
]

const DEFAULT_RANK_TAB = 'boardGainers'

const FLOW_TABS = [
  {key: 'day', label: '当日'},
  {key: 'month', label: '近一月'},
]

const MOOD_TIPS = [
  {
    key: 'flow',
    k: '资金',
    text: '主力资金的流向可用来推测指数涨跌的力量强弱，若持续净流入，则说明市场看涨力量相对更强。',
  },
  {
    key: 'mood',
    k: '情绪',
    text: '市场情绪波动是投资者对市场行情的直观反应。当情绪波动走向极端时，市场行情容易往相反方向调整，也是止盈或抄底的好时机。',
  },
]

function flowToneClass(yi) {
  if (!(yi > 0) && !(yi < 0)) return 'flat'
  return yi > 0 ? 'rise' : 'fall'
}

function buildFlowView(moneyFlow, range) {
  const series = range === 'month' ? moneyFlow && moneyFlow.month : moneyFlow && moneyFlow.day
  if (!series || !series.values || !series.values.length) return null
  const isMonth = range === 'month'
  const official = moneyFlow && moneyFlow.emotion
  const half = isMonth ? moodHalfFromOfficial(series.values, official) : 0
  const lastMood = isMonth ? null : official
  return {
    latestText: series.latestText,
    latestClass: flowToneClass(series.latest),
    moodText: (lastMood && lastMood.text) || '',
    moodClass: (lastMood && lastMood.tone) || 'flat',
    values: series.values,
    labels: series.labels || [],
    breaks: series.breaks || [],
    mode: isMonth ? 'bar' : 'area',
    xLabels: series.xLabels || [],
    showMood: isMonth,
    moodHalf: half,
  }
}

function makeFlowScrub(view, idx, officialEmotion) {
  if (!view || !view.values || !view.values.length) return null
  const n = view.values.length
  const i = Math.max(0, Math.min(n - 1, Number(idx) || 0))
  const yi = view.values[i]
  const leftPct = n <= 1 ? 50 : ((i + 0.5) / n) * 100
  let mood = null
  if (view.showMood) {
    const isToday = i === n - 1 && officialEmotion && officialEmotion.text
    mood = isToday
      ? {text: officialEmotion.text, tone: officialEmotion.tone}
      : view.moodHalf
        ? moodFromYi(yi, view.moodHalf)
        : null
  }
  const yiText = formatSignedYi(yi)
  return {
    idx: i,
    leftPct,
    tipSide: leftPct > 72 ? 'is-right' : leftPct < 28 ? 'is-left' : '',
    label: (view.labels && view.labels[i]) || '',
    text: yiText,
    moodText: (mood && mood.text) || '',
    moodClass: (mood && mood.tone) || 'flat',
    tone: flowToneClass(yi),
  }
}

function isFundTab(tab) {
  return (
    tab === 'fundHot' ||
    tab === 'fundGainers' ||
    tab === 'fundLosers' ||
    tab === 'fundPick' ||
    tab === 'fundHold'
  )
}

function tabIndex(tab) {
  const i = RANK_TABS.findIndex((t) => t.key === tab)
  return i < 0 ? 0 : i
}

/** 报价板短名：压密度用，完整名仍传给走势页 */
const INDEX_SHORT = {
  '000001': '上证',
  '399001': '深成',
  '399006': '创业',
  '899050': '北证',
  '000688': '科创',
  '000016': '上证50',
  '000300': '沪深300',
  '000905': '中证500',
  NDX: '纳指',
  SPX: '标普',
}

Component({
  options: {
    styleIsolation: 'apply-shared',
  },

  properties: {
    active: {
      type: Boolean,
      value: false,
    },
    theme: {
      type: String,
      value: 'light',
    },
    contentMinHeight: {
      type: Number,
      value: 0,
    },
  },

  data: {
    loading: true,
    error: '',
    indices: [],
    market: null,
    rankTabs: RANK_TABS,
    rankTab: DEFAULT_RANK_TAB,
    rankIndex: 0,
    rankSlide: '',
    boardList: [],
    flowTabs: FLOW_TABS,
    flowRange: 'day',
    flowIndex: 0,
    moneyFlow: null,
    flowView: null,
    flowScrub: null,
    moodOpen: false,
    moodTips: MOOD_TIPS,
    moodBands: MOOD_BANDS,
  },

  timer: null,
  _ready: false,
  _loadEpoch: 0,
  _adding: null,

  lifetimes: {
    ready() {
      this._ready = true
      if (this.data.active) this.activate()
    },
    detached() {
      this.clearTimer()
    },
  },

  pageLifetimes: {
    show() {
      if (!this._ready || !this.data.active) return
      this.load()
      this.startTimer()
    },
    hide() {
      this.clearTimer()
    },
  },

  observers: {
    active(active) {
      if (!this._ready) return
      if (active) this.activate()
      else this.deactivate()
    },
  },

  methods: {
    activate() {
      this.load()
      this.startTimer()
    },

    deactivate() {
      this.clearTimer()
      this._flowRect = null
      if (this.data.flowScrub || this.data.moodOpen) {
        this.setData({flowScrub: null, moodOpen: false})
      }
    },

    startTimer() {
      this.clearTimer()
      const app = getApp()
      const ms = (app && app.globalData && app.globalData.refreshMs) || 30000
      this.timer = setInterval(() => this.load(), ms)
    },

    clearTimer() {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
    },

    async load() {
      const epoch = (this._loadEpoch = (this._loadEpoch || 0) + 1)
      this.setData({error: ''})
      try {
        const results = await Promise.allSettled([
          api.fetchIndices(),
          api.fetchMarketOverview(),
        ])
        if (epoch !== this._loadEpoch) return
        const [i, m] = results
        const patch = {loading: false}
        if (i.status === 'fulfilled') {
          patch.indices = (i.value || []).map((row) =>
            Object.assign({}, row, {
              shortName: INDEX_SHORT[row.code] || row.name,
              pctText: formatPct(row.percent),
              pctClass: pctClass(row.percent),
            }),
          )
        }
        if (m.status === 'fulfilled') {
          const market = m.value || {}
          const ud = market.upDown || {up: 0, down: 0, flat: 0, time: null}
          const up = Number(ud.up) || 0
          const down = Number(ud.down) || 0
          const flat = Number(ud.flat) || 0
          const traded = Math.max(up + down, 1)
          const mapRow = (row) =>
            Object.assign({}, row, {
              pctText: formatPct(row.percent),
              pctClass: pctClass(row.percent),
            })
          const upShare = (up / traded) * 100
          patch.market = {
            upDown: Object.assign({}, ud, {
              up,
              down,
              flat,
              upPctText: `${upShare.toFixed(1)}%`,
              downPctText: `${((down / traded) * 100).toFixed(1)}%`,
              upBarPct: upShare.toFixed(2),
            }),
            hotSearch: (market.hotSearch || []).map(mapRow),
            boardGainers: (market.boardGainers || []).map(mapRow),
            fundHotSearch: (market.fundHotSearch || []).map(mapRow),
            fundGainers: (market.fundGainers || []).map(mapRow),
            fundLosers: (market.fundLosers || []).map(mapRow),
            fundPickSearch: (market.fundPickSearch || []).map(mapRow),
            fundHoldSearch: (market.fundHoldSearch || []).map(mapRow),
            boardSource: market.boardSource || '',
          }
          patch.boardList = this.buildRankList(
            patch.market,
            this.data.rankTab || DEFAULT_RANK_TAB,
          )
          const flowRange = this.data.flowRange || 'day'
          patch.moneyFlow = market.moneyFlow || null
          patch.flowView = buildFlowView(patch.moneyFlow, flowRange)
          const scrubIdx = this.data.flowScrub && this.data.flowScrub.idx
          patch.flowScrub =
            scrubIdx == null
              ? null
              : makeFlowScrub(patch.flowView, scrubIdx, patch.moneyFlow && patch.moneyFlow.emotion)
        }
        if (results.every((r) => r.status === 'rejected')) {
          patch.error =
            (results[0].reason && results[0].reason.message) || '加载失败'
        }
        if (epoch !== this._loadEpoch) return
        this.setData(patch)
      } catch (e) {
        if (epoch !== this._loadEpoch) return
        this.setData({
          error: (e && e.message) || '加载失败',
          loading: false,
        })
      }
    },

    buildRankList(market, tab) {
      const key = tab || DEFAULT_RANK_TAB
      const isFund = isFundTab(key)
      let rows
      if (key === 'fundHot') rows = market.fundHotSearch || []
      else if (key === 'fundGainers') rows = market.fundGainers || []
      else if (key === 'fundLosers') rows = market.fundLosers || []
      else if (key === 'fundPick') rows = market.fundPickSearch || []
      else if (key === 'fundHold') rows = market.fundHoldSearch || []
      else if (key === 'boardHot') {
        const gainers = market.boardGainers || []
        rows = market.hotSearch && market.hotSearch.length ? market.hotSearch : gainers
      } else {
        rows = market.boardGainers || []
      }
      return rows.map((row, idx) => {
        const rank = idx + 1
        const fund = isFund ? store.getFund(row.code) : null
        const watched = !!(fund && (fund.type === 'watch' || fund.type === 'hold'))
        const sectorName = String(row.sectorName || '').trim()
        return Object.assign({}, row, {
          isFund,
          rankText: rank < 10 ? `0${rank}` : String(rank),
          topClass: rank === 1 ? 'is-gold' : rank === 2 ? 'is-silver' : rank === 3 ? 'is-bronze' : '',
          pctClass: row.pctClass || pctClass(row.percent),
          pctText: row.pctText || formatPct(row.percent),
          sectorName,
          hasSector: !!sectorName,
          watched,
        })
      })
    },

    onFlowRange(e) {
      const range = e.currentTarget.dataset.range
      if (!range || range === this.data.flowRange) return
      this._flowRect = null
      this.setData({
        flowRange: range,
        flowIndex: range === 'month' ? 1 : 0,
        flowView: buildFlowView(this.data.moneyFlow, range),
        flowScrub: null,
      })
    },

    applyFlowScrub(e, rect) {
      const view = this.data.flowView
      if (!view || !rect || !(rect.width > 0)) return
      const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
      if (!touch) return
      const gutter = view.showMood ? MOOD_PLOT_LEFT : 0
      const x = Math.max(0, Math.min(rect.width, touch.clientX - rect.left))
      const plotW = Math.max(1, rect.width - gutter)
      const xPlot = Math.max(0, Math.min(plotW, x - gutter))
      const n = view.values.length
      const idx = n <= 1 ? 0 : Math.round((xPlot / plotW) * (n - 1))
      const prev = this.data.flowScrub
      if (prev && prev.idx === idx) return
      this.setData({
        flowScrub: makeFlowScrub(view, idx, this.data.moneyFlow && this.data.moneyFlow.emotion),
      })
    },

    onFlowScrubStart(e) {
      this.createSelectorQuery()
        .select('.flow-tape-wrap')
        .boundingClientRect((rect) => {
          if (!rect || !(rect.width > 0)) return
          this._flowRect = rect
          this.applyFlowScrub(e, rect)
        })
        .exec()
    },

    onFlowScrubMove(e) {
      const rect = this._flowRect
      if (!rect) {
        this.onFlowScrubStart(e)
        return
      }
      this.applyFlowScrub(e, rect)
    },

    onFlowScrubEnd() {
      this._flowRect = null
    },

    onOpenMood() {
      this.setData({moodOpen: true})
    },

    onCloseMood() {
      this.setData({moodOpen: false})
    },

    onMoodSheet() {},

    onRankTab(e) {
      const tab = e.currentTarget.dataset.tab
      if (!tab || tab === this.data.rankTab) return
      const from = tabIndex(this.data.rankTab)
      const to = tabIndex(tab)
      const dir = to > from ? 'is-next' : 'is-prev'
      const market = this.data.market
      const boardList = market ? this.buildRankList(market, tab) : []
      this.setData({rankSlide: ''}, () => {
        this.setData({
          rankTab: tab,
          rankIndex: to,
          rankSlide: dir,
          boardList,
        })
      })
    },

    onOpenRankRow(e) {
      if (isFundTab(this.data.rankTab || DEFAULT_RANK_TAB)) {
        this.onOpenFund(e)
        return
      }
      this.onOpenBoard(e)
    },

    onOpenIndex(e) {
      const {code, name} = e.currentTarget.dataset
      navigateTo(
        `/pages/index-trend/index-trend?code=${code}&name=${encodeURIComponent(name || '')}`,
      )
    },

    onOpenBoard(e) {
      const {name, mapping, sector} = e.currentTarget.dataset
      if (!sector && !mapping) {
        wx.showToast({title: '该板块暂无基金列表', icon: 'none'})
        return
      }
      const q = [
        `sectorCode=${encodeURIComponent(sector || '')}`,
        `mappingCode=${encodeURIComponent(mapping || '')}`,
        `name=${encodeURIComponent(name || '')}`,
      ].join('&')
      navigateTo(`/pages/sector-funds/sector-funds?${q}`)
    },

    onOpenFund(e) {
      const {code, name} = e.currentTarget.dataset
      if (!code) return
      navigateTo(
        `/pages/fund-trend/fund-trend?code=${code}&name=${encodeURIComponent(name || '')}`,
      )
    },

    patchRankRow(code, patch) {
      const key = String(code || '').padStart(6, '0')
      const idx = (this.data.boardList || []).findIndex(
        (row) => String(row.code || '').padStart(6, '0') === key,
      )
      if (idx < 0) return
      const next = Object.assign({}, this.data.boardList[idx], patch)
      this.setData({[`boardList[${idx}]`]: next})
    },

    async onToggleWatch(e) {
      const {code, name} = e.currentTarget.dataset
      if (!code) return
      this._adding = this._adding || {}
      if (this._adding[code]) return
      const fund = store.getFund(code)
      const held = !!(fund && fund.type === 'hold')
      const watched = !!(fund && fund.type === 'watch')
      if (held) {
        wx.showToast({title: '已持有', icon: 'none'})
        return
      }
      this._adding[code] = true
      if (watched) {
        this.patchRankRow(code, {watched: false})
        try {
          await api.removeFund(code)
          this.patchRankRow(code, {watched: false})
          wx.showToast({title: '已移出自选', icon: 'none'})
        } catch (err) {
          this.patchRankRow(code, {watched: true})
          wx.showToast({title: (err && err.message) || '删除失败', icon: 'none'})
        } finally {
          delete this._adding[code]
        }
        return
      }
      this.patchRankRow(code, {watched: true})
      try {
        await api.createFund({code, name, type: 'watch'})
        this.patchRankRow(code, {watched: true})
        wx.showToast({title: '已添加自选', icon: 'none'})
      } catch (err) {
        this.patchRankRow(code, {watched: false})
        wx.showToast({title: (err && err.message) || '添加失败', icon: 'none'})
      } finally {
        delete this._adding[code]
      }
    },
  },
})
