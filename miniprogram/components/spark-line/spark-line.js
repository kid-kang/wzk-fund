const {toneByDelta, hexAlpha} = require('../../utils/spark')

let canvasSeq = 0

function getPixelRatio() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 1
  } catch (e) {}
  try {
    return wx.getSystemInfoSync().pixelRatio || 1
  } catch (e) {
    return 1
  }
}

Component({
  properties: {
    values: {type: Array, value: []},
    height: {type: Number, value: 56},
    theme: {type: String, value: 'light'},
    toneDelta: {type: null, value: null},
  },

  data: {
    canvasKey: 'spark-0',
  },

  lifetimes: {
    attached() {
      canvasSeq += 1
      this._seq = canvasSeq
      this._disposed = false
      this.setData({canvasKey: `spark-${canvasSeq}`})
    },
    ready() {
      this._drawSoon()
    },
    detached() {
      this._disposed = true
      if (this._drawTimer) {
        clearTimeout(this._drawTimer)
        this._drawTimer = null
      }
    },
  },

  observers: {
    'values, height, theme, toneDelta'() {
      this._drawSoon()
    },
  },

  methods: {
    _drawSoon() {
      if (this._disposed) return
      if (this._drawTimer) clearTimeout(this._drawTimer)
      this._drawTimer = setTimeout(() => {
        this._drawTimer = null
        this.draw()
      }, 16)
    },

    draw() {
      if (this._disposed) return
      const values = (this.data.values || []).map(Number).filter((n) => Number.isFinite(n))
      const contentKey = [
        this.data.theme,
        this.data.height,
        this.data.toneDelta,
        values.map((v) => v.toFixed(4)).join(','),
      ].join('|')

      this.createSelectorQuery()
        .select('#spark')
        .fields({node: true, size: true})
        .exec((res) => {
          if (this._disposed) return
          const info = res && res[0]
          const canvas = info && info.node
          if (!canvas || !(info.width > 0) || !(info.height > 0)) return

          const width = info.width
          const height = info.height
          const fullKey = `${contentKey}|${Math.round(width)}x${Math.round(height)}`
          if (fullKey === this._drawKey) return
          this._drawKey = fullKey

          const dpr = getPixelRatio()
          canvas.width = Math.max(1, Math.floor(width * dpr))
          canvas.height = Math.max(1, Math.floor(height * dpr))
          const ctx = canvas.getContext('2d')
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
          ctx.clearRect(0, 0, width, height)

          const theme = this.data.theme
          const padY = 2
          const plotH = Math.max(1, height - padY * 2)

          if (values.length < 2) {
            const muted = theme === 'dark' ? '#2a3a34' : '#c5cfc9'
            ctx.strokeStyle = muted
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(0, height / 2)
            ctx.lineTo(width, height / 2)
            ctx.stroke()
            return
          }

          const last = values[values.length - 1]
          const toneRaw = this.data.toneDelta
          const delta =
            toneRaw != null && toneRaw !== '' && Number.isFinite(Number(toneRaw))
              ? Number(toneRaw)
              : last
          const color = toneByDelta(delta, theme)
          const lineColor = hexAlpha(color, theme === 'dark' ? 0.36 : 0.32)
          const fillTop = hexAlpha(color, theme === 'dark' ? 0.08 : 0.06)
          const zeroLine = theme === 'dark' ? 'rgba(238,242,255,0.42)' : 'rgba(36,53,82,0.35)'

          let min = Math.min.apply(null, values)
          let max = Math.max.apply(null, values)
          if (min > 0) min = 0
          if (max < 0) max = 0
          if (min === max) {
            min -= 1
            max += 1
          }
          const pad = (max - min) * 0.08
          min -= pad
          max += pad
          const span = max - min || 1

          const xAt = (i) => (i / (values.length - 1)) * width
          const yAt = (v) => padY + ((max - v) / span) * plotH

          // 0 轴虚线
          const y0 = yAt(0)
          ctx.save()
          ctx.strokeStyle = zeroLine
          ctx.lineWidth = 1
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.moveTo(0, y0)
          ctx.lineTo(width, y0)
          ctx.stroke()
          ctx.restore()

          // 面积
          ctx.beginPath()
          ctx.moveTo(xAt(0), yAt(values[0]))
          for (let i = 1; i < values.length; i++) {
            ctx.lineTo(xAt(i), yAt(values[i]))
          }
          ctx.lineTo(xAt(values.length - 1), height)
          ctx.lineTo(xAt(0), height)
          ctx.closePath()
          const grad = ctx.createLinearGradient(0, padY, 0, height)
          grad.addColorStop(0, fillTop)
          grad.addColorStop(1, hexAlpha(color, 0))
          ctx.fillStyle = grad
          ctx.fill()

          // 折线
          ctx.beginPath()
          ctx.moveTo(xAt(0), yAt(values[0]))
          for (let i = 1; i < values.length; i++) {
            ctx.lineTo(xAt(i), yAt(values[i]))
          }
          ctx.strokeStyle = lineColor
          ctx.lineWidth = 1.4
          ctx.lineJoin = 'round'
          ctx.lineCap = 'round'
          ctx.stroke()
        })
    },
  },
})
