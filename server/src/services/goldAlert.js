import {getGoldQuote} from './gold.js'
import {sendDingTalkText} from './dingtalk.js'

const INTERVAL_MS = Number(process.env.GOLD_ALERT_INTERVAL_MS) || 30_000
const BAND = 0.2
const STEP = 5
/** 低于此价视为无效行情（休市/接口异常常见返回 0） */
const MIN_PRICE = 100

/**
 * 最近已通知的档位。
 * 注意：短暂离开 ±0.2 触发带（如 925.5）不清空，避免同档来回刷屏；
 * 只有触达另一个 5 倍数档位时才切换并可再次通知。
 */
let lastNotifiedLevel = null
let timer = null
let ticking = false

/**
 * 若价格落在某个 5 的倍数 ±0.2 内，返回该档位；否则 null
 * 例：924.8~925.2 → 925；930.0~930.2 / 929.8~930.0 → 930
 */
export function matchGoldLevel(price, step = STEP, band = BAND) {
  const p = Number(price)
  if (!Number.isFinite(p) || p < MIN_PRICE) return null
  const level = Math.round(p / step) * step
  if (level < MIN_PRICE) return null
  if (Math.abs(p - level) <= band + 1e-9) return level
  return null
}

function formatPrice(price) {
  const n = Number(price)
  if (!Number.isFinite(n)) return String(price)
  return String(Math.round(n * 100) / 100)
}

export function getGoldAlertStatus() {
  return {
    running: !!timer,
    intervalMs: INTERVAL_MS,
    lastNotifiedLevel,
    band: BAND,
    step: STEP,
  }
}

export async function checkGoldAlertOnce() {
  const quote = await getGoldQuote()
  const price = quote?.price
  if (price == null || !Number.isFinite(Number(price)) || Number(price) < MIN_PRICE) {
    console.warn(`[gold-alert] 未获取到有效金价: ${price}`)
    return {price: price ?? null, level: null, sent: false}
  }

  const level = matchGoldLevel(price)
  if (level == null) {
    console.log(
      `[gold-alert] 现价 ${price}，未触达档位` +
      (lastNotifiedLevel != null ? `（仍记着档位 ${lastNotifiedLevel}）` : ''),
    )
    return {price, level: null, sent: false}
  }

  if (lastNotifiedLevel === level) {
    console.log(`[gold-alert] 现价 ${price}，同档位 ${level} 已通知过，跳过`)
    return {price, level, sent: false}
  }

  // isAtAll 会由钉钉自动附带 @所有人，文案里不要再写，否则会重复
  const content = `当前金价${formatPrice(price)}`
  await sendDingTalkText(content, {isAtAll: true})
  lastNotifiedLevel = level
  console.log(`[gold-alert] 已通知档位 ${level}，现价 ${price}`)
  return {price, level, sent: true, content}
}

async function tick() {
  if (ticking) return
  ticking = true
  try {
    await checkGoldAlertOnce()
  } catch (e) {
    console.error('[gold-alert] 轮询失败:', e.message || e)
  } finally {
    ticking = false
  }
}

export function startGoldAlert() {
  if (timer) return getGoldAlertStatus()
  console.log(`[gold-alert] 启动，每 ${INTERVAL_MS / 1000}s 轮询，档位=${STEP}±${BAND}`)
  tick()
  timer = setInterval(tick, INTERVAL_MS)
  if (typeof timer.unref === 'function') timer.unref()
  return getGoldAlertStatus()
}

export function stopGoldAlert() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  return getGoldAlertStatus()
}
