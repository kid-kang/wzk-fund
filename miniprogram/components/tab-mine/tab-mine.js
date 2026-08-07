const api = require('../../utils/api')
const {getApiBase, setApiBase, DEFAULT_API_BASE} = require('../../utils/config')
const {applyTheme, syncNavigationBar, navigateTo} = require('../../utils/theme')
const Dialog = require('@vant/weapp/dialog/dialog').default
const Toast = require('@vant/weapp/toast/toast').default

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
    showGold: true,
    hideAmounts: false,
    apiBase: DEFAULT_API_BASE,
    pingState: '',
    pingLabel: 'IDLE',
    wmFontReady: false,
  },

  _ready: false,
  _fontLoaded: false,

  lifetimes: {
    ready() {
      this._ready = true
      if (this.data.active) this.activate()
    },
  },

  pageLifetimes: {
    show() {
      if (!this._ready || !this.data.active) return
      this.refreshLocal()
    },
  },

  observers: {
    active(active) {
      if (!this._ready) return
      if (active) this.activate()
    },
  },

  methods: {
    activate() {
      this.loadWmFont()
      this.refreshLocal()
    },

    loadWmFont() {
      if (this._fontLoaded || typeof wx.loadFontFace !== 'function') return
      wx.loadFontFace({
        family: 'WzkDesk',
        source: 'url("/assets/fonts/ArchivoBlack-Regular.ttf")',
        global: true,
        success: () => {
          this._fontLoaded = true
          this.setData({wmFontReady: true})
        },
        fail() {},
      })
    },

    async refreshLocal() {
      const apiBase = getApiBase()
      let showGold = true
      let hideAmounts = false
      try {
        const settings = await api.fetchSettings()
        showGold = !settings || settings.showGold !== false
      } catch (e) {
        // ignore
      }
      try {
        hideAmounts = !!wx.getStorageSync('holdings_hide_amounts')
      } catch (e) {}
      this.setData({apiBase, showGold, hideAmounts})
    },

    async onToggleGold(e) {
      const showGold = !!e.detail
      try {
        await api.updateSettings({showGold})
        this.setData({showGold})
      } catch (err) {
        Toast.fail((err && err.message) || '保存失败')
      }
    },

    onToggleHideAmounts(e) {
      const hideAmounts = !!e.detail
      this.setData({hideAmounts})
      try {
        wx.setStorageSync('holdings_hide_amounts', hideAmounts)
      } catch (err) {
        Toast.fail('保存失败')
      }
    },

    onToggleTheme(e) {
      const theme = e.detail ? 'dark' : 'light'
      const app = getApp()
      if (app && typeof app.setTheme === 'function') {
        app.setTheme(theme)
      } else {
        applyTheme(theme)
        syncNavigationBar(theme)
      }
      this.triggerEvent('themechange', {theme})
    },

    onApiInput(e) {
      const value =
        typeof e.detail === 'string'
          ? e.detail
          : (e.detail && e.detail.value) || ''
      this.setData({apiBase: value})
    },

    onSaveApi() {
      const next = setApiBase(this.data.apiBase)
      const app = getApp()
      if (app) app.globalData.apiBase = next
      this.setData({apiBase: next})
      Toast.success('已保存')
    },

    async onPing() {
      this.setData({pingState: 'is-busy', pingLabel: 'PING'})
      try {
        setApiBase(this.data.apiBase)
        const res = await api.healthCheck()
        const ok = !!(res && res.ok)
        this.setData({
          pingState: ok ? 'is-ok' : 'is-fail',
          pingLabel: ok ? 'OK' : 'RESP',
        })
        Toast.success(ok ? '连通正常' : '已响应')
      } catch (e) {
        this.setData({pingState: 'is-fail', pingLabel: 'FAIL'})
        Dialog.alert({
          title: '连通失败',
          message: (e && e.message) || '请确认 server 已启动且地址正确',
        })
      }
    },

    async onExport() {
      try {
        const config = await api.exportConfig()
        await wx.setClipboardData({data: JSON.stringify(config, null, 2)})
        Toast.success('已复制')
      } catch (e) {
        Toast.fail((e && e.message) || '导出失败')
      }
    },

    async onImport() {
      try {
        const clip = await wx.getClipboardData()
        const text = clip && clip.data
        if (!text) throw new Error('剪贴板为空')
        const payload = JSON.parse(text)
        await api.importConfig(payload)
        Toast.success('导入成功')
        this.refreshLocal()
      } catch (e) {
        Dialog.alert({
          title: '导入失败',
          message: (e && e.message) || '请确认剪贴板是有效配置 JSON',
        })
      }
    },

    onClearConfig() {
      wx.showActionSheet({
        itemList: ['清空持仓', '清空自选', '清空全部'],
        success: (res) => {
          const scopes = ['hold', 'watch', 'all']
          const scope = scopes[res.tapIndex]
          if (!scope) return
          this.confirmClear(scope)
        },
      })
    },

    confirmClear(scope) {
      const labels = {
        hold: '持仓',
        watch: '自选',
        all: '全部基金（持仓+自选）',
      }
      const label = labels[scope] || '配置'
      Dialog.confirm({
        title: '确认清空',
        message: `将清空本地${label}配置，此操作不可恢复。是否继续？`,
        confirmButtonText: '清空',
        confirmButtonColor: '#d7263d',
      })
        .then(() => this.runClear(scope, label))
        .catch(() => {})
    },

    async runClear(scope, label) {
      try {
        await api.clearFunds(scope)
        Toast.success(`已清空${label}`)
        this.triggerEvent('configcleared', {scope})
      } catch (e) {
        Toast.fail((e && e.message) || '清空失败')
      }
    },

    onOpenQa() {
      navigateTo('/pages/fund-qa/fund-qa')
    },
  },
})
