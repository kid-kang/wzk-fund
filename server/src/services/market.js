import axios from 'axios'
import https from 'https'

const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const agent = new https.Agent({rejectUnauthorized: false})

const INDEX_LIST = [
  {secid: '1.000001', code: '000001', name: '上证指数', tx: 'sh000001'},
  {secid: '0.399001', code: '399001', name: '深证成指', tx: 'sz399001'},
  {secid: '0.399006', code: '399006', name: '创业板指', tx: 'sz399006'},
  {secid: '0.899050', code: '899050', name: '北证50', sina: 'bj899050'},
  {secid: '1.000688', code: '000688', name: '科创50', tx: 'sh000688'},
  {secid: '1.000016', code: '000016', name: '上证50', tx: 'sh000016'},
  {secid: '1.000300', code: '000300', name: '沪深300', tx: 'sh000300'},
  {secid: '1.000905', code: '000905', name: '中证500', tx: 'sh000905'},
  {secid: '100.NDX', code: 'NDX', name: '纳斯达克100', tx: 'us.NDX', sinaUs: '.NDX'},
  {secid: '100.SPX', code: 'SPX', name: '标普500', tx: 'us.INX', sinaUs: '.INX'},
]

/** 区间 → 回溯自然日（再按交易日过滤） */
const RANGE_CALENDAR_DAYS = {
  '1m': 35,
  '3m': 100,
  '6m': 200,
  '1y': 400,
  '3y': 1200,
}

const RANGE_FETCH_LIMIT = {
  '1m': 60,
  '3m': 120,
  '6m': 200,
  '1y': 320,
  '3y': 900,
}

async function eastmoneyGet(url, params, hosts) {
  let lastErr
  for (const host of hosts) {
    try {
      const res = await axios.get(`${host}${url}`, {
        timeout: 12000,
        headers: {
          'User-Agent': ua,
          Referer: 'https://quote.eastmoney.com/',
        },
        params,
      })
      return res.data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('eastmoney request failed')
}

const PUSH_HOSTS = [
  'https://push2delay.eastmoney.com',
  'https://push2.eastmoney.com',
  'https://82.push2.eastmoney.com',
]

export async function getIndices() {
  const secids = INDEX_LIST.map((i) => i.secid).join(',')
  const data = await eastmoneyGet(
    '/api/qt/ulist.np/get',
    {
      fltt: 2,
      invt: 2,
      fields: 'f2,f3,f4,f12,f14',
      secids,
    },
    PUSH_HOSTS,
  )

  const diff = data?.data?.diff || []
  const byCode = new Map(diff.map((d) => [String(d.f12), d]))

  return INDEX_LIST.map((item) => {
    const row = byCode.get(item.code) || byCode.get(item.secid.split('.')[1])
    const percent = row?.f3
    return {
      code: item.code,
      name: item.name,
      percent: typeof percent === 'number' ? percent : null,
      // 按产品约定不在前端强调点位，仅返回供内部计算
      price: typeof row?.f2 === 'number' ? row.f2 : null,
    }
  })
}

/** 概念榜噪音：短线情绪 / 风格 / 资金口径，不是题材板块 */
const NOISY_CONCEPT_BOARD =
  /昨日|连板|涨停|跌停|微盘|举牌|高标|回笼|次新|破发|含一字|龙虎榜|融资融券|沪股通|深股通|同花顺|成交额|换手|高市净|高市盈|低价股|百元股|基金重仓|券商金股|科技风格|大盘成长|小盘成长|大盘股|小盘股/

function normalizeConceptBoardName(name = '') {
  return String(name || '')
    .trim()
    .replace(/概念$/u, '')
    .trim()
}

/** 东财概念板块涨跌幅排行（fs=m:90+t:3）；过滤短线噪音后取前 size */
export async function getSectorBoards({sort = 'desc', size = 10} = {}) {
  const data = await eastmoneyGet(
    '/api/qt/clist/get',
    {
      pn: 1,
      pz: 120,
      po: sort === 'asc' ? 0 : 1,
      np: 1,
      fltt: 2,
      invt: 2,
      fid: 'f3',
      // t:2 行业 / t:3 概念
      fs: 'm:90+t:3',
      fields: 'f12,f14,f2,f3',
    },
    PUSH_HOSTS,
  )

  const list = (data?.data?.diff || [])
    .map((d) => {
      const rawName = String(d.f14 || '').trim()
      return {
        code: d.f12,
        name: normalizeConceptBoardName(rawName),
        rawName,
        percent: typeof d.f3 === 'number' ? d.f3 : null,
      }
    })
    .filter(
      (d) =>
        d.percent != null &&
        d.name &&
        !NOISY_CONCEPT_BOARD.test(d.rawName) &&
        !NOISY_CONCEPT_BOARD.test(d.name),
    )
    .sort((a, b) => (sort === 'asc' ? a.percent - b.percent : b.percent - a.percent))
    .slice(0, size)
    .map(({code, name, percent}) => ({code, name, percent}))

  return list
}

export async function getUpDownStats() {
  const res = await axios.get('https://emdatah5.eastmoney.com/dc/NXFXB/GetUpDownData', {
    timeout: 12000,
    headers: {'User-Agent': ua, Referer: 'https://emdatah5.eastmoney.com/'},
    params: {type: 0},
  })
  const row = Array.isArray(res.data) ? res.data[0] : res.data?.[0]
  if (!row) {
    return {up: 0, down: 0, flat: 0, time: null}
  }
  return {
    up: Number(row.up) || 0,
    down: Number(row.down) || 0,
    flat: Number(row.t) || 0,
    time: row.time || null,
  }
}

/** 小倍板块榜缓存，避免行情轮询打爆 */
const XIAOBEI_BOARD_TTL_MS = 60 * 1000
let xiaobeiBoardCache = null

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

/** 二级页拉基金列表用的 mappingCode：有指数映射用 mapping，否则用 extraCode（如 881270.TI） */
function resolveBoardMappingCode(row = {}) {
  const mapping = String(row.mappingCode || '').trim()
  const extra = String(row.extraCode || '').trim()
  if (row.isMappingIndex) return mapping || extra
  return extra || mapping
}

function mapXiaobeiBoardItem(row = {}) {
  const name = String(row.themeName || '').trim()
  const change = Number(row.change)
  const heat = Number(row.searchNum)
  if (!name || !Number.isFinite(change)) return null
  return {
    code: String(row.sectorCode || row.mappingCode || name),
    name,
    // 小倍 change 为小数（0.0676 → 6.76）
    percent: round2(change * 100),
    heat: Number.isFinite(heat) ? heat : null,
    mappingCode: resolveBoardMappingCode(row),
    sectorCode: String(row.sectorCode || '').trim(),
  }
}

/**
 * 小倍板块榜（热搜 + 涨幅同源）。
 * POST /yangji-api/api/get-hot-industry-ranking
 */
export async function fetchXiaobeiIndustryBoards() {
  const hit = xiaobeiBoardCache
  if (hit && Date.now() - hit.at < XIAOBEI_BOARD_TTL_MS) return hit.data

  try {
    const res = await axios.post(
      'https://api.xiaobeiyangji.com/yangji-api/api/get-hot-industry-ranking',
      {version: '3.8.7.0', clientType: 'APP'},
      {
        httpsAgent: agent,
        timeout: 12000,
        headers: {
          'User-Agent': ua,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        validateStatus: () => true,
      },
    )
    if (res.status !== 200 || res.data?.code !== 200) return null
    const rawList = Array.isArray(res.data?.data?.list) ? res.data.data.list : []
    const list = rawList.map(mapXiaobeiBoardItem).filter(Boolean)
    if (!list.length) return null
    const data = {
      list,
      updateTime: res.data?.data?.updateTime || null,
    }
    xiaobeiBoardCache = {at: Date.now(), data}
    return data
  } catch {
    return null
  }
}

function sliceBoards(list, sort, size = 0) {
  const sorted = [...list].sort((a, b) => {
    if (sort === 'hot') return (b.heat || 0) - (a.heat || 0)
    if (sort === 'asc') return a.percent - b.percent
    return b.percent - a.percent
  })
  // size<=0：返回排序后的全部
  const sliced = size > 0 ? sorted.slice(0, size) : sorted
  return sliced.map(({code, name, percent, heat, mappingCode, sectorCode}) => ({
    code,
    name,
    percent,
    heat: heat ?? null,
    mappingCode: mappingCode || '',
    sectorCode: sectorCode || '',
  }))
}

/** 板块下基金列表缓存 */
const INDUSTRY_FUND_TTL_MS = 45 * 1000
const industryFundCache = new Map()

/**
 * 小倍板块热搜基金（isHot=true），最多 100 条。
 * POST /yangji-api/api/get-industry-fund
 */
export async function getIndustryFunds({mappingCode} = {}) {
  const code = String(mappingCode || '').trim()
  if (!code) throw new Error('缺少板块映射代码 mappingCode')
  const cacheKey = `${code}|hot`
  const hit = industryFundCache.get(cacheKey)
  if (hit && Date.now() - hit.at < INDUSTRY_FUND_TTL_MS) return hit.data

  const res = await axios.post(
    'https://api.xiaobeiyangji.com/yangji-api/api/get-industry-fund',
    {version: '3.8.7.0', clientType: 'APP', mappingCode: code, isHot: true},
    {
      httpsAgent: agent,
      timeout: 15000,
      headers: {
        'User-Agent': ua,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      validateStatus: () => true,
    },
  )
  if (res.status !== 200 || res.data?.code !== 200) {
    throw new Error(res.data?.msg || '板块基金列表加载失败')
  }
  const raw = res.data?.data || {}
  const rawList = Array.isArray(raw.list) ? raw.list : []
  const items = rawList
    .map((row) => {
      const fundCode = String(row.code || '').padStart(6, '0')
      if (!/^\d{6}$/.test(fundCode)) return null
      const y = Number(row.valuationY)
      return {
        code: fundCode,
        name: String(row.name || fundCode).trim(),
        nav: Number.isFinite(Number(row.nav)) ? Number(row.nav) : null,
        percent: Number.isFinite(y) ? round2(y * 100) : null,
      }
    })
    .filter(Boolean)
    .slice(0, 100)

  const data = {
    mappingCode: code,
    themeName: String(raw.themeName || '').trim(),
    items,
  }
  industryFundCache.set(cacheKey, {at: Date.now(), data})
  return data
}

/**
 * 板块榜：tab=gainers|hot|losers，优先小倍，失败回退东财概念榜。
 */
export async function getMarketBoards({tab = 'gainers', size = 0} = {}) {
  const key = String(tab || 'gainers').toLowerCase()
  const rawSize = Number(size)
  // size<=0 或不传：全量；否则截断（上限 200）
  const n = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, 200) : 0
  const xiaobei = await fetchXiaobeiIndustryBoards()
  if (xiaobei?.list?.length) {
    const sort = key === 'hot' ? 'hot' : key === 'losers' ? 'asc' : 'desc'
    return {
      tab: key === 'hot' ? 'hot' : key === 'losers' ? 'losers' : 'gainers',
      source: 'xiaobei',
      updateTime: xiaobei.updateTime,
      items: sliceBoards(xiaobei.list, sort, n),
    }
  }
  const sort = key === 'losers' ? 'asc' : 'desc'
  const items = await getSectorBoards({sort, size: n > 0 ? n : 120})
  return {
    tab: key === 'hot' ? 'hot' : key === 'losers' ? 'losers' : 'gainers',
    source: 'eastmoney',
    updateTime: null,
    items: items.map((i) => ({...i, heat: null})),
  }
}

export async function getMarketOverview() {
  const [upDown, xiaobei] = await Promise.all([
    getUpDownStats(),
    fetchXiaobeiIndustryBoards(),
  ])

  if (xiaobei?.list?.length) {
    return {
      upDown,
      // Tab 列表：接口全量，前端自行滚动
      hotSearch: sliceBoards(xiaobei.list, 'hot', 0),
      boardGainers: sliceBoards(xiaobei.list, 'desc', 0),
      boardUpdateTime: xiaobei.updateTime,
      boardSource: 'xiaobei',
    }
  }

  const boardGainers = await getSectorBoards({sort: 'desc', size: 120})
  return {
    upDown,
    hotSearch: [],
    boardGainers: boardGainers.map((i) => ({...i, heat: null})),
    boardUpdateTime: upDown.time,
    boardSource: 'eastmoney',
  }
}

function findIndexMeta(code) {
  const key = String(code || '').trim()
  return INDEX_LIST.find((i) => i.code === key || i.secid.endsWith(`.${key}`))
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000
}

function filterByRange(points, range) {
  const days = RANGE_CALENDAR_DAYS[range] || RANGE_CALENDAR_DAYS['1m']
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days)
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  return points.filter((p) => p.date >= startStr)
}

function withPeriodPercent(points) {
  if (!points.length) return []
  const base = points[0].close
  if (!base) return points.map((p) => ({...p, percent: null}))
  return points.map((p) => ({
    ...p,
    percent: round4(((p.close - base) / base) * 100),
  }))
}

async function fetchTencentDaily(symbol, limit) {
  const res = await axios.get('https://web.ifzq.gtimg.cn/appstock/app/fqkline/get', {
    timeout: 15000,
    headers: {'User-Agent': ua, Referer: 'https://gu.qq.com/'},
    params: {param: `${symbol},day,,,${limit},qfq`},
  })
  const key = Object.keys(res.data?.data || {})[0]
  const rows = res.data?.data?.[key]?.qfqday || res.data?.data?.[key]?.day || []
  return rows
    .map((row) => {
      const close = parseFloat(row[2])
      return {
        date: row[0],
        close: Number.isFinite(close) ? close : null,
      }
    })
    .filter((p) => p.date && p.close != null)
}

async function fetchSinaCnDaily(symbol, limit) {
  const res = await axios.get(
    'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData',
    {
      timeout: 15000,
      headers: {'User-Agent': ua, Referer: 'https://finance.sina.com.cn/'},
      params: {symbol, scale: 240, ma: 'no', datalen: limit},
    },
  )
  const rows = Array.isArray(res.data) ? res.data : []
  return rows
    .map((row) => {
      const close = parseFloat(row.close)
      return {
        date: row.day,
        close: Number.isFinite(close) ? close : null,
      }
    })
    .filter((p) => p.date && p.close != null)
}

async function fetchSinaUsDaily(symbol, limit) {
  const res = await axios.get(
    'https://stock.finance.sina.com.cn/usstock/api/json.php/US_MinKService.getDailyK',
    {
      timeout: 20000,
      headers: {'User-Agent': ua, Referer: 'https://stock.finance.sina.com.cn/'},
      params: {symbol},
    },
  )
  const rows = Array.isArray(res.data) ? res.data : []
  const mapped = rows
    .map((row) => {
      const close = parseFloat(row.c)
      return {
        date: row.d,
        close: Number.isFinite(close) ? close : null,
      }
    })
    .filter((p) => p.date && p.close != null)
  return mapped.slice(-limit)
}

/**
 * 指数历史日线（用于趋势弹窗）
 * @param {string} code
 * @param {'1m'|'3m'|'6m'|'1y'|'3y'} range
 */
export async function getIndexHistory(code, range = '1m') {
  const meta = findIndexMeta(code)
  if (!meta) throw new Error(`未知指数 ${code}`)
  const key = RANGE_CALENDAR_DAYS[range] ? range : '1m'
  const limit = RANGE_FETCH_LIMIT[key]

  let points = []
  let source = ''

  // 腾讯日线（A股多数指数、美股 us.NDX / us.INX）
  if (meta.tx) {
    try {
      points = await fetchTencentDaily(meta.tx, limit)
      source = 'tencent'
    } catch {
      points = []
    }
  }

  // 点数不足时用新浪补（北证 / 美股长周期）
  if (points.length < 10 && meta.sina) {
    points = await fetchSinaCnDaily(meta.sina, limit)
    source = 'sina'
  }
  if ((points.length < 10 || key === '3y') && meta.sinaUs) {
    try {
      const usPoints = await fetchSinaUsDaily(meta.sinaUs, limit)
      if (usPoints.length > points.length) {
        points = usPoints
        source = 'sina-us'
      }
    } catch {
      // keep previous
    }
  }

  if (!points.length) throw new Error(`暂无 ${meta.name} 历史行情`)

  const filtered = withPeriodPercent(filterByRange(points, key))
  const first = filtered[0]
  const last = filtered[filtered.length - 1]
  const periodPercent =
    first && last && first.close
      ? round4(((last.close - first.close) / first.close) * 100)
      : null

  return {
    code: meta.code,
    name: meta.name,
    range: key,
    source,
    periodPercent,
    points: filtered,
  }
}
