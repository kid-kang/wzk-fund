const {getThemeViewState, syncNavigationBar} = require('../../utils/theme')

const themeView = getThemeViewState()
syncNavigationBar(themeView.theme)

const QA_IDS = {
  'a-share': true,
  'badge-cn': true,
  'qdii-delay': true,
  'qdii-pnl': true,
  'qdii-buy': true,
  'add-hold': true,
  'async-nav': true,
  'us-time': true,
  'badge-qdii': true,
}

Page({
  data: {
    ...themeView,
    navTitle: 'Q&A',
    openId: '',
    scrollInto: '',
  },

  onLoad(query) {
    const themePatch = getThemeViewState()
    syncNavigationBar(themePatch.theme)
    const q = query && query.q ? String(query.q) : ''
    // 无 q 参数（如从「我的」进入）时全部收起；带 q 时展开对应项
    const openId = QA_IDS[q] ? q : ''
    const patch = {
      ...themePatch,
      openId,
    }
    this.setData(patch)
    if (QA_IDS[q]) {
      // 等展开渲染后再滚到对应问答
      this._scrollTimer = setTimeout(() => {
        this._scrollTimer = null
        this.setData({scrollInto: `qa-${q}`})
      }, 80)
    }
  },

  onShow() {
    const next = getThemeViewState()
    if (next.theme !== this.data.theme) this.setData(next)
    syncNavigationBar(next.theme)
  },

  onUnload() {
    if (this._scrollTimer) {
      clearTimeout(this._scrollTimer)
      this._scrollTimer = null
    }
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    this.setData({openId: this.data.openId === id ? '' : id})
  },
})
