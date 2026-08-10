const Toast = require('@vant/weapp/toast/toast')
const api = require('../../utils/api')
const store = require('../../utils/portfolioStore')
const {formatPct, pctClass} = require('../../utils/format')
const {getThemeViewState, syncNavigationBar, navigateTo} = require('../../utils/theme')

/** 与本页冷雾底色对齐，避免回弹露缝 */
function getSfThemeViewState() {
  const base = getThemeViewState()
  return {
    ...base,
    pageBg: base.theme === 'dark' ? '#0E1520' : '#D8E0EB',
  }
}

function makeSubtitle(name) {
  const n = String(name || '').trim()
  return n ? `${n}板块相关热搜基金` : '板块相关热搜基金'
}

const themeView = getSfThemeViewState()
syncNavigationBar(themeView.theme)

Page({
  data: {
    ...themeView,
    navTitle: '板块基金',
    mappingCode: '',
    sectorCode: '',
    name: '',
    subtitle: '板块相关热搜基金',
    loading: true,
    error: '',
    list: [],
  },

  onLoad(query) {
    this._dead = false
    this._loadEpoch = 0
    this._adding = {}
    const themePatch = getSfThemeViewState()
    syncNavigationBar(themePatch.theme)
    const name = query.name ? decodeURIComponent(query.name) : ''
    const mappingCode = query.mappingCode
      ? decodeURIComponent(query.mappingCode)
      : query.code
        ? decodeURIComponent(query.code)
        : ''
    const sectorCode = query.sectorCode ? decodeURIComponent(query.sectorCode) : ''
    this.setData({
      ...themePatch,
      name,
      subtitle: makeSubtitle(name),
      navTitle: name || '板块基金',
      mappingCode,
      sectorCode,
      loading: true,
    })
    this.load()
  },

  onShow() {
    const next = getSfThemeViewState()
    if (next.theme !== this.data.theme || next.pageBg !== this.data.pageBg) {
      this.setData(next)
    }
    syncNavigationBar(next.theme)
    if (this.data.list && this.data.list.length) {
      this.setData({list: this.decorateRows(this.data.list)})
    }
  },

  onUnload() {
    this._dead = true
  },

  decorateRows(rows) {
    return (rows || []).map((row, idx) => {
      const fund = store.getFund(row.code)
      const watched = !!(fund && (fund.type === 'watch' || fund.type === 'hold'))
      const rank = idx + 1
      return Object.assign({}, row, {
        rankText: String(rank),
        pctText: row.pctText || formatPct(row.percent),
        pctClass: row.pctClass || pctClass(row.percent),
        watched,
      })
    })
  },

  async load() {
    const epoch = ++this._loadEpoch
    const {sectorCode, mappingCode} = this.data
    if (!sectorCode && !mappingCode) {
      this.setData({loading: false, error: '缺少板块代码', list: []})
      return
    }
    this.setData({loading: true, error: ''})
    try {
      const data = await api.fetchIndustryFunds({sectorCode, mappingCode})
      if (this._dead || epoch !== this._loadEpoch) return
      const themeName = (data && data.themeName) || this.data.name
      const items = (data && data.items) || []
      const list = this.decorateRows(
        items.map((row) =>
          Object.assign({}, row, {
            pctText: formatPct(row.percent),
            pctClass: pctClass(row.percent),
          }),
        ),
      )
      const nextName = themeName || this.data.name
      this.setData({
        loading: false,
        list,
        name: nextName,
        subtitle: makeSubtitle(nextName),
        navTitle: nextName || '板块基金',
      })
    } catch (e) {
      if (this._dead || epoch !== this._loadEpoch) return
      this.setData({
        loading: false,
        error: (e && e.message) || '加载失败',
        list: [],
      })
    }
  },

  onOpenFund(e) {
    const {code, name} = e.currentTarget.dataset
    if (!code) return
    navigateTo(
      `/pages/fund-trend/fund-trend?code=${code}&name=${encodeURIComponent(name || '')}`,
    )
  },

  async onToggleWatch(e) {
    const {code, name, watched} = e.currentTarget.dataset
    if (!code || this._adding[code]) return
    if (watched === true || watched === 'true') {
      Toast('已在列表中')
      return
    }
    this._adding[code] = true
    try {
      await api.createFund({code, name, type: 'watch'})
      if (this._dead) return
      Toast.success('已添加自选')
      this.setData({list: this.decorateRows(this.data.list)})
    } catch (err) {
      Toast.fail((err && err.message) || '添加失败')
    } finally {
      delete this._adding[code]
    }
  },
})
