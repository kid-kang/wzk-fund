import fs from 'fs'
import os from 'os'
import path from 'path'

const APP_PATH = /^\/api\/(health$|funds(\/|$)|gold(\/|$)|indices(\/|$)|market(\/|$))/

export function accessLogPath() {
  return (
    process.env.WZK_FUND_ACCESS_LOG ||
    path.join(os.homedir(), '.wzk-fund', 'logs', 'access.jsonl')
  )
}

export function isAppPath(p) {
  return APP_PATH.test(String(p || ''))
}

/** 经 Cloudflare 隧道时用 CF-Connecting-IP；直连本机端口则用 socket 地址。 */
export function clientIp(ctx) {
  const remote = String(ctx.req.socket?.remoteAddress || '')
  const loopback =
    remote === '127.0.0.1' ||
    remote === '::1' ||
    remote === '::ffff:127.0.0.1'
  if (loopback) {
    const cf = ctx.get('cf-connecting-ip') || ctx.get('true-client-ip')
    if (cf) return cf.trim()
    const xff = ctx.get('x-forwarded-for')
    if (xff) return xff.split(',')[0].trim()
  }
  return remote.replace(/^::ffff:/, '') || '-'
}

export function clientUa(ctx) {
  return String(ctx.get('user-agent') || '').slice(0, 300)
}

let dirReady = false

export function writeAccessLog(entry) {
  const file = accessLogPath()
  try {
    if (!dirReady) {
      fs.mkdirSync(path.dirname(file), {recursive: true})
      dirReady = true
    }
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`)
  } catch (err) {
    console.error('[access-log]', err.message)
  }
}
