const {hexAlpha, toneByDelta} = require('../../utils/spark')

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

function isBlank(v) {
  return v == null || v === '' || Number.isNaN(Number(v))
}

Component({
  properties: {
    values: {type: Array, value: []},
    labels: {type: Array, value: []},
    theme: {type: String, value: 'light'},
    height: {type: Number, value: 168},
  },

  lifetimes: {
    attached() {
      canvasSeq += 1
      this._seq = canvasSeq
      this._disposed = false
      this._sizeRetry = 0
    },
    ready() {
      this._drawSoon()
      if (typeof this.createIntersectionObserver !== 'function') return
      this._io = this.createIntersectionObserver()
      this._io.relativeToViewport({top: 80, bottom: 80}).observe('.stave', (res) => {
        if (this._disposed) return
        if (res.intersectionRatio > 0) {
          this._drawKey = ''
          this._drawSoon()
        }
      })
    },
    detached() {
      this._disposed = true
      if (this._io && typeof this._io.disconnect === 'function') {
        this._io.disconnect()
      }
      this._io = null
      if (this._drawTimer) {
        clearTimeout(this._drawTimer)
        this._drawTimer = null
      }
    },
  },

  observers: {
    'values, labels, theme, height'() {
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
      const raw = this.data.values || []
      const labels = this.data.labels || []
      const contentKey = [
        this.data.theme,
        this.data.height,
        raw.map((v) => (isBlank(v) ? '_' : Number(v))).join(','),
        labels.join('|'),
      ].join('~')

      this.createSelectorQuery()
        .select('#stave')
        .fields({node: true, size: true})
        .exec((res) => {
          if (this._disposed) return
          const info = res && res[0]
          const canvas = info && info.node
          if (!canvas || !(info.width > 0) || !(info.height > 0)) {
            if (this._sizeRetry < 8) {
              this._sizeRetry += 1
              setTimeout(() => {
                this._drawKey = ''
                this.draw()
              }, 80)
            }
            return
          }
          this._sizeRetry = 0

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
          const padY = 22
          const plotH = Math.max(1, height - padY * 2)
          const finite = []
          for (let i = 0; i < raw.length; i++) {
            if (!isBlank(raw[i])) finite.push(Number(raw[i]))
          }
          let min = 0
          let max = 0
          if (finite.length) {
            min = Math.min(0, Math.min.apply(null, finite))
            max = Math.max(0, Math.max.apply(null, finite))
          }
          if (min === max) {
            min -= 1
            max += 1
          }
          const pad = (max - min) * 0.16
          min -= pad
          max += pad
          const span = max - min || 1
          const yAt = (v) => padY + ((max - v) / span) * plotH
          const y0 = yAt(0)
          const n = raw.length || 5
          const slot = width / n
          const barW = Math.max(16, slot * 0.42)
          const fillA = theme === 'dark' ? 0.78 : 0.72
          const zeroLine = theme === 'dark' ? 'rgba(238,242,255,0.22)' : 'rgba(18,26,39,0.16)'

          ctx.save()
          ctx.strokeStyle = zeroLine
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(0, y0)
          ctx.lineTo(width, y0)
          ctx.stroke()
          ctx.restore()

          ctx.font = 'bold 10px sans-serif'
          ctx.textAlign = 'center'

          for (let i = 0; i < n; i++) {
            if (isBlank(raw[i])) continue
            const v = Number(raw[i])
            const y = yAt(v)
            const x = i * slot + (slot - barW) / 2
            const top = Math.min(y, y0)
            const h = Math.max(1.5, Math.abs(y - y0))
            const tone = toneByDelta(v, theme)
            ctx.fillStyle = hexAlpha(tone, fillA)
            ctx.fillRect(x, top, barW, h)

            const label = String(labels[i] || '')
            if (!label) continue
            const cx = i * slot + slot / 2
            ctx.fillStyle = tone
            if (v >= 0) {
              ctx.textBaseline = 'bottom'
              ctx.fillText(label, cx, Math.max(12, top - 4))
            } else {
              ctx.textBaseline = 'top'
              ctx.fillText(label, cx, Math.min(height - 4, top + h + 4))
            }
          }
        })
    },
  },
})
