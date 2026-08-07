const api = require('../../utils/api')
const {formatPct, pctClass} = require('../../utils/format')
const {navigateTo} = require('../../utils/theme')

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
    boardTab: 'gainers',
    boardList: [],
  },

  timer: null,
  _ready: false,
  _loadEpoch: 0,

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
            boardSource: market.boardSource || '',
          }
          patch.boardList = this.buildBoardList(
            patch.market,
            this.data.boardTab || 'gainers',
          )
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

    buildBoardList(market, tab) {
      const gainers = market.boardGainers || []
      const hot = market.hotSearch && market.hotSearch.length ? market.hotSearch : gainers
      const rows = tab === 'hot' ? hot : gainers
      return rows.map((row, idx) => {
        const rank = idx + 1
        return Object.assign({}, row, {
          rankText: rank < 10 ? `0${rank}` : String(rank),
          topClass: rank === 1 ? 'is-gold' : rank === 2 ? 'is-silver' : rank === 3 ? 'is-bronze' : '',
          pctClass: row.pctClass || pctClass(row.percent),
          pctText: row.pctText || formatPct(row.percent),
        })
      })
    },

    onBoardTab(e) {
      const tab = e.currentTarget.dataset.tab
      if (!tab || tab === this.data.boardTab) return
      const market = this.data.market
      this.setData({
        boardTab: tab,
        boardList: market ? this.buildBoardList(market, tab) : [],
      })
    },

    onOpenIndex(e) {
      const {code, name} = e.currentTarget.dataset
      navigateTo(
        `/pages/index-trend/index-trend?code=${code}&name=${encodeURIComponent(name || '')}`,
      )
    },

    onOpenBoard(e) {
      const {name, mapping, sector} = e.currentTarget.dataset
      if (!mapping) {
        wx.showToast({title: '该板块暂无基金列表', icon: 'none'})
        return
      }
      const q = [
        `mappingCode=${encodeURIComponent(mapping)}`,
        `name=${encodeURIComponent(name || '')}`,
        `sectorCode=${encodeURIComponent(sector || '')}`,
      ].join('&')
      navigateTo(`/pages/sector-funds/sector-funds?${q}`)
    },
  },
})
