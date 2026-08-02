const echarts = require('../ec-canvas/echarts')
const {buildSparkOption, buildTrendOption} = require('../../utils/chartOptions')

let canvasSeq = 0

Component({
  properties: {
    points: {type: Array, value: []},
    valueKey: {type: String, value: 'growth'},
    mode: {type: String, value: 'spark'},
    height: {type: Number, value: 56},
    theme: {type: String, value: 'light'},
    valueMode: {type: String, value: 'percent'},
    extraKey: {type: String, value: ''},
    extraLabel: {type: String, value: ''},
    showExtremes: {type: Boolean, value: false},
    /** 历史周期：1y/3y/since 时横轴显示年份 */
    range: {type: String, value: ''},
    /** 迷你图配色：与卡片涨跌幅一致时传入 percent */
    toneDelta: {type: null, value: null},
  },

  data: {
    canvasId: 'ec-line-0',
    ready: false,
    ec: {lazyLoad: true, disableTouch: true},
  },

  lifetimes: {
    attached() {
      canvasSeq += 1
      this._disposed = false
      this.setData({
        canvasId: `ec-line-${canvasSeq}`,
        ready: true,
        ec: {
          lazyLoad: true,
          disableTouch: this.data.mode === 'spark',
        },
      })
      this._bootTimer = setTimeout(() => {
        this._bootTimer = null
        this.renderChart()
      }, 30)
    },
    detached() {
      this._disposed = true
      if (this._bootTimer) {
        clearTimeout(this._bootTimer)
        this._bootTimer = null
      }
      if (this._retryTimer) {
        clearTimeout(this._retryTimer)
        this._retryTimer = null
      }
      if (this.chart) {
        try {
          this.chart.dispose()
        } catch (e) {
          // wx canvas 无 DOM 事件 API，个别机型 dispose 可能抛错
        }
        this.chart = null
      }
    },
  },

  observers: {
    'points, valueKey, mode, theme, valueMode, extraKey, extraLabel, height, showExtremes, range, toneDelta':
      function () {
        if (this.data.ready) this.renderChart()
      },
  },

  methods: {
    buildOption() {
      if (this.data.mode === 'spark') {
        return buildSparkOption(
          this.data.points,
          this.data.valueKey,
          this.data.theme,
          this.data.toneDelta,
        )
      }
      return buildTrendOption({
        points: this.data.points,
        valueKey: this.data.valueKey,
        theme: this.data.theme,
        valueMode: this.data.valueMode,
        extraKey: this.data.extraKey || undefined,
        extraLabel: this.data.extraLabel || undefined,
        showExtremes: !!this.data.showExtremes,
        range: this.data.range || '',
      })
    },

    renderChart() {
      if (this._disposed) return
      const option = this.buildOption()
      if (!option) {
        if (this.chart) this.chart.clear()
        return
      }
      if (this.chart) {
        try {
          this.chart.clear()
        } catch (e) {
          // ignore
        }
        this.chart.setOption(option, true)
        return
      }
      const comp = this.selectComponent('#chart')
      if (!comp) {
        if (this._retryTimer) clearTimeout(this._retryTimer)
        this._retryTimer = setTimeout(() => {
          this._retryTimer = null
          this.renderChart()
        }, 40)
        return
      }
      if (this._initing) return
      this._initing = true
      comp.init((canvas, width, height, dpr) => {
        const chart = echarts.init(canvas, null, {
          width,
          height,
          devicePixelRatio: dpr,
        })
        canvas.setChart(chart)
        chart.setOption(option)
        this.chart = chart
        this._initing = false
        return chart
      })
    },
  },
})
