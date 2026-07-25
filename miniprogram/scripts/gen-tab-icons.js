/**
 * 生成 tabBar 线框图标（81x81 PNG，透明底）
 * 用法：node scripts/gen-tab-icons.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 81
const OUT = path.join(__dirname, '../assets/tab')

const COLORS = {
  lightIdle: [122, 132, 148, 255], // #7a8494
  lightActive: [79, 93, 255, 255], // #4f5dff
  darkIdle: [154, 163, 181, 255], // #9aa3b5
  darkActive: [123, 136, 255, 255], // #7b88ff
}

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(pixels) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) {
    const row = y * (SIZE * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      const o = row + 1 + x * 4
      raw[o] = pixels[i]
      raw[o + 1] = pixels[i + 1]
      raw[o + 2] = pixels[i + 2]
      raw[o + 3] = pixels[i + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function blank() {
  return Buffer.alloc(SIZE * SIZE * 4)
}

function setPx(px, x, y, rgba) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return
  const i = (y * SIZE + x) * 4
  px[i] = rgba[0]
  px[i + 1] = rgba[1]
  px[i + 2] = rgba[2]
  px[i + 3] = rgba[3]
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by)
}

function strokeCircle(px, cx, cy, r, rgba, w = 3.2) {
  for (let y = Math.floor(cy - r - w); y <= cy + r + w; y++) {
    for (let x = Math.floor(cx - r - w); x <= cx + r + w; x++) {
      const d = Math.abs(dist(x, y, cx, cy) - r)
      if (d <= w / 2) setPx(px, x, y, rgba)
    }
  }
}

function fillCircle(px, cx, cy, r, rgba) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (dist(x, y, cx, cy) <= r) setPx(px, x, y, rgba)
    }
  }
}

function strokeLine(px, x0, y0, x1, y1, rgba, w = 3.2) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    fillCircle(px, x, y, w / 2, rgba)
  }
}

function strokeRect(px, x, y, w, h, rgba, sw = 3.2) {
  strokeLine(px, x, y, x + w, y, rgba, sw)
  strokeLine(px, x + w, y, x + w, y + h, rgba, sw)
  strokeLine(px, x + w, y + h, x, y + h, rgba, sw)
  strokeLine(px, x, y + h, x, y, rgba, sw)
}

/** 持仓：钱包/卡片 */
function drawHoldings(px, rgba) {
  strokeRect(px, 22, 28, 37, 28, rgba, 3.4)
  strokeLine(px, 22, 38, 59, 38, rgba, 3)
  fillCircle(px, 48, 46, 3.2, rgba)
}

/** 自选：星形 */
function drawWatchlist(px, rgba) {
  const cx = 40.5
  const cy = 42
  const outer = 16
  const inner = 7
  const pts = []
  for (let i = 0; i < 10; i++) {
    const ang = (-Math.PI / 2) + (i * Math.PI) / 5
    const r = i % 2 === 0 ? outer : inner
    pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r])
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    strokeLine(px, a[0], a[1], b[0], b[1], rgba, 3)
  }
}

/** 行情：折线趋势 */
function drawMarket(px, rgba) {
  strokeLine(px, 20, 58, 20, 24, rgba, 3.2)
  strokeLine(px, 20, 58, 60, 58, rgba, 3.2)
  strokeLine(px, 24, 48, 34, 36, rgba, 3.4)
  strokeLine(px, 34, 36, 44, 42, rgba, 3.4)
  strokeLine(px, 44, 42, 58, 26, rgba, 3.4)
  fillCircle(px, 58, 26, 2.8, rgba)
}

/** 我的：人像 */
function drawMine(px, rgba) {
  strokeCircle(px, 40.5, 30, 9, rgba, 3.2)
  // 肩部弧
  for (let a = Math.PI * 0.15; a <= Math.PI * 0.85; a += 0.02) {
    const x = 40.5 + Math.cos(a) * 16
    const y = 62 + Math.sin(a) * 10
    fillCircle(px, x, y, 1.6, rgba)
  }
  strokeLine(px, 24.5, 58, 56.5, 58, rgba, 3.2)
}

const drawers = {
  holdings: drawHoldings,
  watchlist: drawWatchlist,
  market: drawMarket,
  mine: drawMine,
}

function writeIcon(name, drawer, rgba) {
  const px = blank()
  drawer(px, rgba)
  fs.writeFileSync(path.join(OUT, name), encodePng(px))
}

fs.mkdirSync(OUT, {recursive: true})

for (const [key, drawer] of Object.entries(drawers)) {
  writeIcon(`${key}.png`, drawer, COLORS.lightIdle)
  writeIcon(`${key}-active.png`, drawer, COLORS.lightActive)
  writeIcon(`${key}-dark.png`, drawer, COLORS.darkIdle)
  writeIcon(`${key}-dark-active.png`, drawer, COLORS.darkActive)
  console.log('ok', key)
}

console.log('tab icons generated ->', OUT)
