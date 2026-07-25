import axios from 'axios'
import iconv from 'iconv-lite'

const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const PUSH_HOSTS = [
  'https://push2delay.eastmoney.com',
  'https://push2.eastmoney.com',
  'https://82.push2.eastmoney.com',
]

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000
}

/** 新浪 gds_AU9999：最新价,买,卖,高,低,时间?,昨收,今开,... */
function parseSinaGold(text) {
  const m = text.match(/hq_str_gds_AU9999="([^"]*)"/)
  if (!m || !m[1]) return null
  const parts = m[1].split(',')
  const price = parseFloat(parts[0])
  const high = parseFloat(parts[4])
  const low = parseFloat(parts[5])
  const time = parts[6] || ''
  const prevClose = parseFloat(parts[7])
  const open = parseFloat(parts[8])
  const date = parts[12] || ''
  const name = parts[13] || 'AU9999'
  const percent =
    Number.isFinite(price) && Number.isFinite(prevClose) && prevClose !== 0
      ? ((price - prevClose) / prevClose) * 100
      : null
  const change =
    Number.isFinite(price) && Number.isFinite(prevClose) ? price - prevClose : null

  return {
    code: 'AU9999',
    name: name.includes('金') ? 'AU9999 沪金99' : 'AU9999',
    price: Number.isFinite(price) ? price : null,
    prevClose: Number.isFinite(prevClose) ? prevClose : null,
    open: Number.isFinite(open) ? open : null,
    high: Number.isFinite(high) ? high : null,
    low: Number.isFinite(low) ? low : null,
    change: change == null ? null : round4(change),
    percent: percent == null ? null : round4(percent),
    time: date ? `${date} ${time}` : time,
    source: 'sina',
  }
}

async function fetchSinaQuote() {
  const res = await axios.get('https://hq.sinajs.cn/list=gds_AU9999', {
    timeout: 10000,
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': ua,
      Referer: 'https://finance.sina.com.cn/',
    },
  })
  const text = iconv.decode(Buffer.from(res.data), 'gbk')
  const quote = parseSinaGold(text)
  if (!quote) throw new Error('解析 AU9999 行情失败')
  return quote
}

async function fetchEastmoneyQuote() {
  let lastErr
  for (const host of PUSH_HOSTS) {
    try {
      const res = await axios.get(`${host}/api/qt/stock/get`, {
        timeout: 10000,
        headers: {'User-Agent': ua, Referer: 'https://quote.eastmoney.com/'},
        params: {
          secid: '118.AU9999',
          fltt: 2,
          fields: 'f43,f44,f45,f46,f57,f58,f60,f169,f170,f171',
        },
      })
      const d = res.data?.data
      if (!d || d.f43 == null) continue
      const price = Number(d.f43)
      const prevClose = Number(d.f60)
      // 金钱口径优先用现价−昨收，不用接口四舍五入后的涨跌额/涨跌幅
      const change =
        Number.isFinite(price) && Number.isFinite(prevClose)
          ? price - prevClose
          : d.f169 != null
            ? Number(d.f169)
            : null
      const percent =
        Number.isFinite(price) && Number.isFinite(prevClose) && prevClose
          ? ((price - prevClose) / prevClose) * 100
          : d.f170 != null
            ? Number(d.f170)
            : null
      return {
        code: 'AU9999',
        name: d.f58 ? `AU9999 ${d.f58}` : 'AU9999 沪金99',
        price: Number.isFinite(price) ? price : null,
        prevClose: Number.isFinite(prevClose) ? prevClose : null,
        open: d.f46 != null ? Number(d.f46) : null,
        high: d.f44 != null ? Number(d.f44) : null,
        low: d.f45 != null ? Number(d.f45) : null,
        change: change == null || !Number.isFinite(change) ? null : round4(change),
        percent: percent == null || !Number.isFinite(percent) ? null : round4(percent),
        time: '',
        source: 'eastmoney',
      }
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('东财 AU9999 行情失败')
}

async function fetchQuote() {
  try {
    return await fetchEastmoneyQuote()
  } catch {
    return fetchSinaQuote()
  }
}

async function fetchTrend(prevCloseHint) {
  const hosts = [
    'https://push2his.eastmoney.com',
    'https://push2delay.eastmoney.com',
    'https://push2.eastmoney.com',
  ]

  for (const host of hosts) {
    try {
      const res = await axios.get(`${host}/api/qt/stock/trends2/get`, {
        timeout: 10000,
        headers: {'User-Agent': ua, Referer: 'https://quote.eastmoney.com/'},
        params: {
          fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58',
          ndays: 1,
          iscr: 0,
          secid: '118.AU9999',
        },
      })
      const trends = res.data?.data?.trends || []
      if (!trends.length) continue
      const preClose = parseFloat(res.data?.data?.preClosePrice) || prevCloseHint
      return trends.map((line) => {
        const [dt, , price] = line.split(',')
        const p = parseFloat(price)
        const time = (dt || '').split(' ')[1] || dt
        const percent =
          Number.isFinite(p) && Number.isFinite(preClose) && preClose
            ? ((p - preClose) / preClose) * 100
            : null
        return {
          time,
          price: p,
          percent: percent == null ? null : round4(percent),
        }
      })
    } catch {
      // try next
    }
  }

  try {
    const res = await axios.get('https://api.jijinhao.com/sQuoteCenter/todayMin.htm', {
      timeout: 10000,
      headers: {'User-Agent': ua, Referer: 'https://quote.cngold.org/'},
      params: {code: 'JO_71', isCalc: true},
    })
    const json = JSON.parse(String(res.data).replace('var hq_str_ml = ', ''))
    const base =
      Number.isFinite(prevCloseHint) && prevCloseHint > 0
        ? prevCloseHint
        : null
    const points = (json.data || [])
      .filter((x) => x.price != null && x.price !== -1)
      .map((x) => {
        const price = round2(x.price)
        const ref = base ?? null
        return {
          time: x.time || new Date(x.date).toTimeString().slice(0, 5),
          price,
          percent:
            ref && price
              ? round4(((price - ref) / ref) * 100)
              : null,
        }
      })
    if (points.length) {
      // 无昨收时退回首点基准，并标明仅作近似
      if (points[0].percent == null) {
        const first = points[0].price
        return points.map((p) => ({
          ...p,
          percent: first ? round4(((p.price - first) / first) * 100) : null,
        }))
      }
      return points
    }
  } catch {
    // ignore
  }

  return []
}

const HISTORY_RANGE_DAYS = {
  '1m': 35,
  '3m': 100,
  '6m': 200,
  '1y': 400,
}

function shanghaiDate(ms) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

async function fetchEastmoneyDailyKlines(limit = 320) {
  const hosts = [
    'https://push2his.eastmoney.com',
    'https://push2delay.eastmoney.com',
    'https://push2.eastmoney.com',
  ]
  let lastErr
  for (const host of hosts) {
    try {
      const res = await axios.get(`${host}/api/qt/stock/kline/get`, {
        timeout: 15000,
        headers: {'User-Agent': ua, Referer: 'https://quote.eastmoney.com/'},
        params: {
          secid: '118.AU9999',
          fields1: 'f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
          klt: 101,
          fqt: 0,
          end: '20500101',
          lmt: limit,
        },
      })
      const klines = res.data?.data?.klines || []
      if (!klines.length) continue
      return klines
        .map((line) => {
          const [date, open, close, high, low] = String(line).split(',')
          const c = parseFloat(close)
          const h = parseFloat(high)
          const lo = parseFloat(low)
          const o = parseFloat(open)
          return {
            date,
            open: Number.isFinite(o) ? o : null,
            close: Number.isFinite(c) ? c : null,
            high: Number.isFinite(h) ? h : null,
            low: Number.isFinite(lo) ? lo : null,
            price: Number.isFinite(c) ? c : null,
          }
        })
        .filter((p) => p.date && p.close != null)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('东财黄金日K为空')
}

/** 金投网 JO_71（黄金9999）日K：q1开 q2收 q3高 q4低 */
async function fetchJijinhaoDailyKlines(limit = 400) {
  const res = await axios.get('https://api.jijinhao.com/quoteCenter/history.htm', {
    timeout: 15000,
    headers: {'User-Agent': ua, Referer: 'https://quote.cngold.org/'},
    params: {
      code: 'JO_71',
      style: 3,
      pageSize: Math.min(Math.max(limit, 30), 500),
    },
  })
  const text = String(res.data).replace(/^var quote_json\s*=\s*/, '').trim()
  const json = JSON.parse(text)
  if (!json?.flag || !Array.isArray(json.data) || !json.data.length) {
    throw new Error('金投网黄金日K为空')
  }
  return json.data
    .map((row) => {
      const open = Number(row.q1)
      const close = Number(row.q2)
      const high = Number(row.q3)
      const low = Number(row.q4)
      const date = row.time != null ? shanghaiDate(row.time) : ''
      return {
        date,
        open: Number.isFinite(open) ? open : null,
        close: Number.isFinite(close) ? close : null,
        high: Number.isFinite(high) ? high : null,
        low: Number.isFinite(low) ? low : null,
        price: Number.isFinite(close) ? close : null,
      }
    })
    .filter((p) => p.date && p.close != null)
}

async function fetchDailyKlines(limit = 420) {
  try {
    return await fetchEastmoneyDailyKlines(limit)
  } catch {
    return fetchJijinhaoDailyKlines(limit)
  }
}

function filterHistoryByRange(points, range) {
  const days = HISTORY_RANGE_DAYS[range] || HISTORY_RANGE_DAYS['1m']
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days)
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  return points.filter((p) => p.date >= startStr)
}

/** range: 1m | 3m | 6m | 1y */
export async function getGoldHistory(range = '1m') {
  const key = HISTORY_RANGE_DAYS[range] ? range : '1m'
  const all = await fetchDailyKlines(420)
  const points = filterHistoryByRange(all, key)
  if (!points.length) {
    return {
      code: 'AU9999',
      name: 'AU9999',
      range: key,
      points: [],
      periodPercent: null,
      high: null,
      low: null,
    }
  }
  const base = points[0].close
  const withPct = points.map((p) => ({
    ...p,
    percent:
      base && p.close != null ? round4(((p.close - base) / base) * 100) : null,
  }))
  const last = withPct[withPct.length - 1]
  const highs = withPct.map((p) => p.high).filter((n) => n != null)
  const lows = withPct.map((p) => p.low).filter((n) => n != null)
  return {
    code: 'AU9999',
    name: 'AU9999 沪金99',
    range: key,
    points: withPct,
    periodPercent: last.percent == null ? null : round2(last.percent),
    high: highs.length ? Math.max(...highs) : null,
    low: lows.length ? Math.min(...lows) : null,
  }
}

export async function getGoldRealtime({holding = 0, avgPrice = 0} = {}) {
  const quote = await fetchQuote()
  const trend = await fetchTrend(quote.prevClose)

  // 若报价涨跌缺失，用分时末点补齐
  if ((quote.percent == null || quote.change == null) && trend.length) {
    const last = trend[trend.length - 1]
    if (quote.price == null && last.price != null) quote.price = last.price
    if (quote.percent == null && last.percent != null) quote.percent = last.percent
    if (
      quote.change == null &&
      quote.price != null &&
      quote.prevClose != null
    ) {
      quote.change = round4(quote.price - quote.prevClose)
    }
  }

  const hold = Number(holding) || 0
  const avg = Number(avgPrice) || 0

  // 当日盈亏只用价格差：克数 × (现价 − 昨收)；涨幅仅展示，不参与金额
  let pnl = null
  if (hold > 0 && quote.price != null && quote.prevClose != null) {
    const delta = quote.price - quote.prevClose
    quote.change = round4(delta)
    pnl = round2(hold * delta)
  }

  let costPnl = null
  let costPnlPercent = null
  if (hold > 0 && avg > 0 && quote.price != null) {
    costPnl = round2((quote.price - avg) * hold)
    costPnlPercent = round2(((quote.price - avg) / avg) * 100)
  }

  return {
    ...quote,
    trend,
    holding: hold,
    avgPrice: avg,
    pnl,
    pnlPercent: quote.percent == null ? null : round2(quote.percent),
    costPnl,
    costPnlPercent,
  }
}
