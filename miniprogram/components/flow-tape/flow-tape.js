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

Component({
  properties: {
    values: {type: Array, value: []},
    breaks: {type: Array, value: []},
    mode: {type: String, value: 'area'},
    height: {type: Number, value: 96},
    theme: {type: String, value: 'light'},
    cursor: {type: Number, value: -1},
    cursorLabel: {type: String, value: ''},
    cursorText: {type: String, value: ''},
    cursorTone: {type: String, value: ''},
  },

  data: {
    canvasKey: 'tape-0',
  },

  lifetimes: {
    attached() {
      canvasSeq += 1
      this._seq = canvasSeq
      this._disposed = false
      this.setData({canvasKey: `tape-${canvasSeq}`})
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
    'values, breaks, mode, height, theme, cursor, cursorLabel, cursorText, cursorTone'() {
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
      const breaks = (this.data.breaks || [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 0 && n < values.length - 1)
      const contentKey = [
        this.data.theme,
        this.data.mode,
        this.data.height,
        values.join(','),
        breaks.join('-'),
        this.data.cursor,
        this.data.cursorLabel,
        this.data.cursorText,
        this.data.cursorTone,
      ].join('|')

      this.createSelectorQuery()
        .select('#tape')
        .fields({node: true, size: true})
        .exec((res) => {
          if (this._disposed) return
          const info = res && res[0]
          const canvas = info && info.node
          if (!canvas || !(info.width > 0) || !(info.height > 0)) {
            if (!this._sizeRetry) {
              this._sizeRetry = true
              setTimeout(() => {
                this._sizeRetry = false
                this._drawKey = ''
                this.draw()
              }, 80)
            }
            return
          }

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
          const padY = 4
          const plotH = Math.max(1, height - padY * 2)
          const zeroLine = theme === 'dark' ? 'rgba(238,242,255,0.34)' : 'rgba(18,26,39,0.28)'
          const gapLine = theme === 'dark' ? 'rgba(238,242,255,0.22)' : 'rgba(36,53,82,0.18)'

          const strokeWaterline = (y) => {
            ctx.save()
            ctx.strokeStyle = zeroLine
            ctx.lineWidth = 1
            ctx.setLineDash([3, 3])
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
            ctx.stroke()
            ctx.restore()
          }

          if (!values.length) {
            strokeWaterline(height / 2)
            return
          }

          let min = Math.min.apply(null, values)
          let max = Math.max.apply(null, values)
          if (min > 0) min = 0
          if (max < 0) max = 0
          if (min === max) {
            min -= 1
            max += 1
          }
          const pad = (max - min) * 0.1
          min -= pad
          max += pad
          const span = max - min || 1
          const yAt = (v) => padY + ((max - v) / span) * plotH
          const y0 = yAt(0)
          const n = values.length
          const slot = width / Math.max(n, 1)
          const mode = this.data.mode === 'bar' ? 'bar' : 'area'
          const barW = mode === 'bar' ? Math.max(2.5, slot * 0.56) : Math.max(1, slot)
          const fillA = theme === 'dark' ? (mode === 'bar' ? 0.55 : 0.38) : mode === 'bar' ? 0.48 : 0.32

          for (let i = 0; i < n; i++) {
            const v = values[i]
            const y = yAt(v)
            const x = mode === 'bar' ? i * slot + (slot - barW) / 2 : i * slot
            const top = Math.min(y, y0)
            const h = Math.max(0.6, Math.abs(y - y0))
            ctx.fillStyle = hexAlpha(toneByDelta(v, theme), fillA)
            ctx.fillRect(x, top, barW, h)
          }

          if (mode === 'area' && n > 1) {
            const cuts = breaks.slice().sort((a, b) => a - b)
            const segments = []
            let segStart = 0
            for (let c = 0; c < cuts.length; c++) {
              segments.push([segStart, cuts[c]])
              segStart = cuts[c] + 1
            }
            segments.push([segStart, n - 1])
            ctx.lineWidth = 1.45
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            for (let s = 0; s < segments.length; s++) {
              const from = segments[s][0]
              const to = segments[s][1]
              if (to < from) continue
              ctx.beginPath()
              ctx.moveTo(from * slot + slot / 2, yAt(values[from]))
              for (let i = from + 1; i <= to; i++) {
                ctx.lineTo(i * slot + slot / 2, yAt(values[i]))
              }
              ctx.strokeStyle = hexAlpha(
                toneByDelta(values[to], theme),
                theme === 'dark' ? 0.92 : 0.86,
              )
              ctx.stroke()
            }
            if (cuts.length) {
              ctx.save()
              ctx.strokeStyle = gapLine
              ctx.lineWidth = 1
              ctx.setLineDash([2, 3])
              for (let c = 0; c < cuts.length; c++) {
                const x = (cuts[c] + 1) * slot
                ctx.beginPath()
                ctx.moveTo(x, padY)
                ctx.lineTo(x, height - padY)
                ctx.stroke()
              }
              ctx.restore()
            }
          }

          strokeWaterline(y0)

          const cursor = Number(this.data.cursor)
          if (Number.isInteger(cursor) && cursor >= 0 && cursor < n) {
            this._drawCursor(ctx, {
              x: cursor * slot + slot / 2,
              width,
              height,
              label: String(this.data.cursorLabel || ''),
              text: String(this.data.cursorText || ''),
              tone: this.data.cursorTone,
              theme,
            })
          }
        })
    },

    _drawCursor(ctx, {x, width, height, label, text, tone, theme}) {
      ctx.save()
      ctx.strokeStyle = theme === 'dark' ? 'rgba(238,242,255,0.7)' : 'rgba(18,26,39,0.58)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.restore()

      const title = label || ''
      const value = text || ''
      if (!title && !value) return

      ctx.save()
      ctx.setLineDash([])
      ctx.font = '10px sans-serif'
      const titleW = title ? ctx.measureText(title).width : 0
      ctx.font = 'bold 11px sans-serif'
      const valueW = value ? ctx.measureText(value).width : 0
      const boxW = Math.max(titleW, valueW) + 16
      const boxH = title && value ? 34 : 22
      let boxX = x - boxW / 2
      if (boxX < 2) boxX = 2
      else if (boxX + boxW > width - 2) boxX = Math.max(2, width - 2 - boxW)
      const boxY = 3
      const r = 5

      ctx.fillStyle = 'rgba(28,31,36,0.92)'
      ctx.beginPath()
      ctx.moveTo(boxX + r, boxY)
      ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r)
      ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r)
      ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r)
      ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r)
      ctx.closePath()
      ctx.fill()

      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      let ty = boxY + 13
      if (title) {
        ctx.font = '10px sans-serif'
        ctx.fillStyle = 'rgba(255,255,255,0.72)'
        ctx.fillText(title, boxX + 8, ty)
        ty += 13
      }
      if (value) {
        ctx.font = 'bold 11px sans-serif'
        ctx.fillStyle = tone === 'fall' ? '#5ee0c0' : tone === 'rise' ? '#ff6b73' : '#fff'
        ctx.fillText(value, boxX + 8, ty)
      }
      ctx.restore()
    },
  },
})
