import fs from 'fs'
import {accessLogPath, isAppPath} from '../src/accessLog.js'

const days = Math.max(1, Number(process.argv[2]) || 7)
const file = accessLogPath()
const since = Date.now() - days * 24 * 60 * 60 * 1000

function uaKind(ua) {
  const s = String(ua || '')
  if (/miniProgram|MicroMessenger/i.test(s)) return '微信小程序'
  if (/Mozilla/i.test(s)) return '浏览器'
  if (!s) return '未知'
  return s.slice(0, 48)
}

function fmt(ts) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ts))
}

if (!fs.existsSync(file)) {
  console.log(`还没有访问日志：${file}`)
  console.log('重启代理服务后才会开始记录。统计人数：0')
  process.exit(0)
}

const users = new Map()
const scanners = new Map()
let rows = 0

for (const line of fs.readFileSync(file, 'utf8').split(/\n/)) {
  if (!line.trim()) continue
  let row
  try {
    row = JSON.parse(line)
  } catch {
    continue
  }
  const t = Date.parse(row.ts)
  if (!Number.isFinite(t) || t < since) continue
  rows++
  const ip = row.ip || '-'
  const app =
    isAppPath(row.path) &&
    row.path !== '/api/health' &&
    Number(row.status) < 400
  const bucket = app ? users : scanners
  let rec = bucket.get(ip)
  if (!rec) {
    rec = {ip, n: 0, kind: uaKind(row.ua), first: t, last: t}
    bucket.set(ip, rec)
  }
  rec.n++
  rec.last = t
  if (t < rec.first) rec.first = t
}

const userList = [...users.values()].sort((a, b) => b.n - a.n)
console.log(`近 ${days} 天使用过服务的独立 IP：${userList.length}`)
if (!userList.length) {
  console.log(`（日志 ${rows} 条，无成功的行情/详情请求）`)
} else {
  for (const u of userList) {
    console.log(`  ${u.ip}  ${u.kind}  ${u.n}次  ${fmt(u.first)} → ${fmt(u.last)}`)
  }
}
if (scanners.size) {
  console.log(`扫描/探测 IP（未计入）：${scanners.size}`)
}
