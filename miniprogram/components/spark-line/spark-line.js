const {toneByDelta, hexAlpha} = require('../../utils/spark')

let canvasSeq = 0

/** 右下角行情时段标签：画进 canvas 才能让 0 轴/休市虚线精确避开它 */
const LABEL_FONT = 9
const LABEL_GAP = 3
const LABEL_INSET = 2

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
    /** 断点下标 i：第 i 与 i+1 点之间休市，折线断开并画竖虚线 */
    breaks: {type: Array, value: []},
    height: {type: Number, value: 56},
    theme: {type: String, value: 'light'},
    toneDelta: {type: null, value: null},
    /** 行情时段，如「26 21:30→04:30」；空则不画标签 */
    label: {type: String, value: ''},
    /** label 放不下时的降级文案，如只留日号「26」 */
    labelShort: {type: String, value: ''},
    /** 跟在时段后的实时涨跌，如「-0.05%」 */
    labelValue: {type: String, value: ''},
    /** labelValue 取色用的涨跌数值 */
    labelTone: {type: null, value: null},
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
    'values, breaks, height, theme, toneDelta, label, labelShort, labelValue, labelTone'() {
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
        this.data.height,
        this.data.toneDelta,
        values.map((v) => v.toFixed(4)).join(','),
        breaks.join('-'),
        this.data.label,
        this.data.labelShort,
        this.data.labelValue,
        this.data.labelTone,
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
          const gapLine = theme === 'dark' ? 'rgba(238,242,255,0.26)' : 'rgba(36,53,82,0.2)'

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

          // 先量标签，后面 0 轴与休市虚线要绕开它占的那块
          const y0 = yAt(0)
          ctx.font = `${LABEL_FONT}px sans-serif`
          const label = this._pickLabel(
            ctx,
            width,
            height,
            this._preferTop(values, yAt, height, y0),
          )

          // 0 轴虚线：躲不开标签就在它前面断开；断得只剩一小截反而难看，交给文字描边挡
          let zeroEnd = width
          if (label && y0 >= label.top - 1 && y0 <= label.bottom + 1) {
            const cut = label.left - LABEL_GAP
            if (cut > width * 0.35) zeroEnd = cut
          }
          ctx.save()
          ctx.strokeStyle = zeroLine
          ctx.lineWidth = 1
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.moveTo(0, y0)
          ctx.lineTo(zeroEnd, y0)
          ctx.stroke()
          ctx.restore()

          // 休市把折线切成互不相连的段
          const cuts = breaks.slice().sort((a, b) => a - b)
          const segments = []
          let segStart = 0
          for (const cut of cuts) {
            segments.push([segStart, cut])
            segStart = cut + 1
          }
          segments.push([segStart, values.length - 1])

          const grad = ctx.createLinearGradient(0, padY, 0, height)
          grad.addColorStop(0, fillTop)
          grad.addColorStop(1, hexAlpha(color, 0))

          for (const [from, to] of segments) {
            if (to <= from) continue

            // 面积
            ctx.beginPath()
            ctx.moveTo(xAt(from), yAt(values[from]))
            for (let i = from + 1; i <= to; i++) {
              ctx.lineTo(xAt(i), yAt(values[i]))
            }
            ctx.lineTo(xAt(to), height)
            ctx.lineTo(xAt(from), height)
            ctx.closePath()
            ctx.fillStyle = grad
            ctx.fill()

            // 折线
            ctx.beginPath()
            ctx.moveTo(xAt(from), yAt(values[from]))
            for (let i = from + 1; i <= to; i++) {
              ctx.lineTo(xAt(i), yAt(values[i]))
            }
            ctx.strokeStyle = lineColor
            ctx.lineWidth = 1.4
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            ctx.stroke()
          }

          // 休市竖虚线
          if (cuts.length) {
            ctx.save()
            ctx.strokeStyle = gapLine
            ctx.lineWidth = 1
            ctx.setLineDash([2, 2])
            for (const cut of cuts) {
              const x = (xAt(cut) + xAt(cut + 1)) / 2
              let top = padY
              let bottom = height - padY
              if (label && x >= label.left - LABEL_GAP) {
                if (label.atTop) top = Math.max(top, label.bottom + 1)
                else bottom = Math.min(bottom, label.top - 1)
              }
              if (bottom <= top) continue
              ctx.beginPath()
              ctx.moveTo(x, top)
              ctx.lineTo(x, bottom)
              ctx.stroke()
            }
            ctx.restore()
          }

          if (label) this._drawLabel(ctx, label, theme)
        })
    },

    /**
     * 标签贴右下还是右上：先躲 0 轴——它是水平实线，和文字基线平行最难读；
     * 折线细且半透明，被文字描边压住还看得出走向，所以只在 0 轴不表态时才参考它。
     */
    _preferTop(values, yAt, height, y0) {
      const band = LABEL_FONT + 3
      const zeroAtBottom = y0 >= height - band
      const zeroAtTop = y0 <= band
      if (zeroAtBottom !== zeroAtTop) return zeroAtBottom

      const from = Math.floor(values.length * 0.65)
      let minY = Infinity
      let maxY = -Infinity
      for (let i = from; i < values.length; i++) {
        const y = yAt(values[i])
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      return maxY >= height - band && minY > band
    },

    /**
     * 时段+涨跌幅在窄卡片里常放不下，按「时段 → 只留日号 → 只留涨跌幅」逐级降级。
     * 返回 null 表示没有标签要画。
     */
    _pickLabel(ctx, width, height, atTop) {
      const full = String(this.data.label || '').trim()
      const short = String(this.data.labelShort || '').trim()
      const value = String(this.data.labelValue || '').trim()
      if (!full && !value) return null

      const candidates = []
      if (full) candidates.push([full, value])
      if (short && short !== full) candidates.push([short, value])
      if (value) candidates.push(['', value])
      if (!candidates.length) return null

      // 标签是叠在曲线上的，铺满整宽就成了横穿全图的一行字，留出一截给走势
      const maxW = width * 0.85
      for (let i = 0; i < candidates.length; i++) {
        const [head, tail] = candidates[i]
        const headW = head ? ctx.measureText(head).width : 0
        const tailW = tail ? ctx.measureText(tail).width : 0
        const total = headW + tailW + (head && tail ? LABEL_GAP : 0)
        if (total <= maxW || i === candidates.length - 1) {
          const top = atTop ? 0 : height - LABEL_FONT - 2
          return {
            head,
            tail,
            headW,
            atTop: !!atTop,
            left: Math.max(LABEL_INSET, width - total - LABEL_INSET),
            top,
            bottom: top + LABEL_FONT + 2,
            baseline: atTop ? LABEL_FONT : height - 2,
          }
        }
      }
      return null
    },

    /** 先用卡片底色描一圈，压住标签底下的虚线和折线 */
    _drawLabel(ctx, label, theme) {
      const halo = theme === 'dark' ? '#171d2a' : '#f1f4fa'
      const ink = theme === 'dark' ? '#7d879b' : '#98a1b0'
      const toneRaw = this.data.labelTone
      const hasTone =
        toneRaw != null && toneRaw !== '' && Number.isFinite(Number(toneRaw))
      const valueColor = hasTone ? toneByDelta(Number(toneRaw), theme) : ink

      ctx.save()
      ctx.font = `${LABEL_FONT}px sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.6
      ctx.strokeStyle = halo
      ctx.setLineDash([])

      let x = label.left
      const y = label.baseline
      if (label.head) {
        ctx.strokeText(label.head, x, y)
        ctx.fillStyle = ink
        ctx.fillText(label.head, x, y)
        x += label.headW + LABEL_GAP
      }
      if (label.tail) {
        ctx.strokeText(label.tail, x, y)
        ctx.fillStyle = valueColor
        ctx.fillText(label.tail, x, y)
      }
      ctx.restore()
    },
  },
})
