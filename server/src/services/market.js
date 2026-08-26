import axios from 'axios'
import https from 'https'
import {
  getFundsLatestScales,
  getXiaobeiRealtimePercents,
  peekXiaobeiRealtimePercents,
} from './fund.js'

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
let xiaobeiHeatBoardCache = null
let xiaobeiLegacyBoardCache = null

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

/** App 热搜榜 sectorHeatTop 字段 */
function mapXiaobeiHeatBoardItem(row = {}) {
  const name = String(row.sectorName || row.themeName || '').trim()
  const change = Number(row.changeRate ?? row.change)
  const heat = Number(row.heat ?? row.searchNum)
  if (!name || !Number.isFinite(change)) return null
  const sectorCode = String(row.sectorCode || '').trim()
  const extraCode = String(row.extraCode || '').trim()
  return {
    code: sectorCode || extraCode || name,
    name,
    // changeRate 为小数（0.0374 → 3.74）
    percent: round2(change * 100),
    heat: Number.isFinite(heat) ? heat : null,
    // 二级页 get-industry-fund 优先用 extraCode
    mappingCode: extraCode || sectorCode,
    sectorCode,
  }
}

function mapXiaobeiLegacyBoardItem(row = {}) {
  const name = String(row.themeName || '').trim()
  const change = Number(row.change)
  const heat = Number(row.searchNum)
  if (!name || !Number.isFinite(change)) return null
  return {
    code: String(row.sectorCode || row.mappingCode || name),
    name,
    percent: round2(change * 100),
    heat: Number.isFinite(heat) ? heat : null,
    mappingCode: resolveBoardMappingCode(row),
    sectorCode: String(row.sectorCode || '').trim(),
  }
}

/**
 * 小倍 App 热搜板块榜（与 App「今日板块热搜榜」同源）。
 * POST https://apiv2.xiaobeiyangji.com/api/app/valuation/sectorHeatTop
 * 无需登录；列表已按 heat 降序。
 */
export async function fetchXiaobeiHeatBoards() {
  const hit = xiaobeiHeatBoardCache
  if (hit && Date.now() - hit.at < XIAOBEI_BOARD_TTL_MS) return hit.data

  try {
    const res = await axios.post(
      'https://apiv2.xiaobeiyangji.com/api/app/valuation/sectorHeatTop',
      xiaobeiApiv2Body({limit: 100}),
      {
        httpsAgent: agent,
        timeout: 12000,
        headers: xiaobeiApiv2Headers(),
        validateStatus: () => true,
      },
    )
    if (res.status !== 200 || res.data?.code !== 200) return null
    const rawList = Array.isArray(res.data?.data?.list) ? res.data.data.list : []
    const list = rawList.map(mapXiaobeiHeatBoardItem).filter(Boolean)
    if (!list.length) return null
    const data = {
      list,
      updateTime: res.data?.data?.updateTime || null,
      source: 'xiaobei-heat',
    }
    xiaobeiHeatBoardCache = {at: Date.now(), data}
    return data
  } catch {
    return null
  }
}

/**
 * 旧接口兜底（按 searchNum / 涨跌幅本地排序）。
 * POST /yangji-api/api/get-hot-industry-ranking
 */
export async function fetchXiaobeiIndustryBoards() {
  const hit = xiaobeiLegacyBoardCache
  if (hit && Date.now() - hit.at < XIAOBEI_BOARD_TTL_MS) return hit.data

  try {
    const res = await axios.post(
      'https://api.xiaobeiyangji.com/yangji-api/api/get-hot-industry-ranking',
      {version: '3.8.8.0', clientType: 'APP'},
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
    const list = rawList.map(mapXiaobeiLegacyBoardItem).filter(Boolean)
    if (!list.length) return null
    const data = {
      list,
      updateTime: res.data?.data?.updateTime || null,
      source: 'xiaobei-legacy',
    }
    xiaobeiLegacyBoardCache = {at: Date.now(), data}
    return data
  } catch {
    return null
  }
}

/** 热搜优先新接口；失败再回落旧榜 */
async function fetchXiaobeiBoardsForOverview() {
  const heat = await fetchXiaobeiHeatBoards()
  if (heat?.list?.length) return heat
  return fetchXiaobeiIndustryBoards()
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
const INDUSTRY_FUND_TTL_MS = 3 * 60 * 1000
const industryFundCache = new Map()

function xiaobeiApiv2Headers() {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Html5Plus/1.0 uni-app',
    'Content-Type': 'application/json',
    Accept: '*/*',
    'x-gray-tag': 'gray',
  }
  const bearer = String(process.env.XIAOBEI_BEARER || '').trim()
  if (bearer) headers.Authorization = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`
  return headers
}

function xiaobeiApiv2Body(extra = {}) {
  return {
    version: '3.8.8.0',
    clientType: 'APP',
    ...(process.env.XIAOBEI_UNION_ID
      ? {unionId: String(process.env.XIAOBEI_UNION_ID)}
      : {}),
    ...extra,
  }
}

async function attachScalesAndSort(items) {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return list
  try {
    const scales = await getFundsLatestScales(list.map((row) => row.code))
    return list
      .map((row) => ({
        ...row,
        scale: scales.get(String(row.code).padStart(6, '0')) ?? null,
      }))
      .sort((a, b) => {
        const as = a.scale == null ? -Infinity : a.scale
        const bs = b.scale == null ? -Infinity : b.scale
        return bs - as
      })
  } catch {
    return list.map((row) => ({...row, scale: row.scale ?? null}))
  }
}

/** 列表先按规模出来；涨跌只带缓存命中，完整估值后台预热 + 客户端补拉 */
async function attachScalesAndCachedYields(items) {
  const scaled = await attachScalesAndSort(items)
  const yields = peekXiaobeiRealtimePercents(scaled.map((row) => row.code))
  const next = scaled.map((row) => ({
    ...row,
    percent: yields.get(String(row.code).padStart(6, '0')) ?? null,
  }))
  const missing = next.filter((row) => row.percent == null).map((row) => row.code)
  if (missing.length) getXiaobeiRealtimePercents(missing).catch(() => {})
  return next
}

export async function getIndustryFundYields(codes) {
  const map = await getXiaobeiRealtimePercents(codes)
  return Object.fromEntries(map)
}

/**
 * 小倍 App 板块热搜基金（与二级页同源）。
 * POST /api/app/valuation/sectorFundHeatTop/getBySectorCode
 */
export async function getIndustryFunds({sectorCode, mappingCode} = {}) {
  const sector = String(sectorCode || '').trim()
  const mapping = String(mappingCode || '').trim()
  if (!sector && !mapping) throw new Error('缺少板块代码 sectorCode')

  const cacheKey = `heat|${sector || mapping}`
  const hit = industryFundCache.get(cacheKey)
  if (hit && Date.now() - hit.at < INDUSTRY_FUND_TTL_MS) return hit.data

  // 优先 App 热搜基金接口取候选池；列表按最新规模降序
  if (sector) {
    const res = await axios.post(
      'https://apiv2.xiaobeiyangji.com/api/app/valuation/sectorFundHeatTop/getBySectorCode',
      xiaobeiApiv2Body({limit: 100, sectorCode: sector}),
      {
        httpsAgent: agent,
        timeout: 15000,
        headers: xiaobeiApiv2Headers(),
        validateStatus: () => true,
      },
    )
    if (res.status === 200 && res.data?.code === 200) {
      const rawList = Array.isArray(res.data?.data?.list) ? res.data.data.list : []
      const items = rawList
        .map((row) => {
          const fundCode = String(row.fundCode || row.code || '').padStart(6, '0')
          if (!/^\d{6}$/.test(fundCode)) return null
          const heat = Number(row.heat)
          return {
            code: fundCode,
            name: String(row.fundName || row.name || fundCode).trim(),
            nav: Number.isFinite(Number(row.nav)) ? Number(row.nav) : null,
            scale: null,
            heat: Number.isFinite(heat) ? heat : null,
            percent: null,
          }
        })
        .filter(Boolean)
        .slice(0, 100)

      const data = {
        sectorCode: sector,
        mappingCode: mapping || String(rawList[0]?.extraCode || '').trim(),
        themeName: '',
        source: 'xiaobei-fund-heat',
        items: await attachScalesAndCachedYields(items),
      }
      industryFundCache.set(cacheKey, {at: Date.now(), data})
      return data
    }
  }

  // 无 sectorCode 或新接口失败时，回落旧 mapping 列表
  if (!mapping) throw new Error('板块基金列表加载失败')
  const legacy = await fetchLegacyIndustryFunds(mapping)
  industryFundCache.set(cacheKey, {at: Date.now(), data: legacy})
  return legacy
}

async function fetchLegacyIndustryFunds(mappingCode) {
  const res = await axios.post(
    'https://api.xiaobeiyangji.com/yangji-api/api/get-industry-fund',
    {version: '3.8.8.0', clientType: 'APP', mappingCode, isHot: true},
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
      return {
        code: fundCode,
        name: String(row.name || fundCode).trim(),
        nav: Number.isFinite(Number(row.nav)) ? Number(row.nav) : null,
        scale: null,
        heat: null,
        percent: null,
      }
    })
    .filter(Boolean)
    .slice(0, 100)

  return {
    sectorCode: '',
    mappingCode,
    themeName: String(raw.themeName || '').trim(),
    source: 'xiaobei-legacy-fund',
    items: await attachScalesAndCachedYields(items),
  }
}

/**
 * 板块榜：tab=gainers|hot|losers，优先小倍，失败回退东财概念榜。
 */
export async function getMarketBoards({tab = 'gainers', size = 0} = {}) {
  const key = String(tab || 'gainers').toLowerCase()
  const rawSize = Number(size)
  // size<=0 或不传：全量；否则截断（上限 200）
  const n = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, 200) : 0
  const xiaobei = await fetchXiaobeiBoardsForOverview()
  if (xiaobei?.list?.length) {
    const sort = key === 'hot' ? 'hot' : key === 'losers' ? 'asc' : 'desc'
    return {
      tab: key === 'hot' ? 'hot' : key === 'losers' ? 'losers' : 'gainers',
      source: xiaobei.source || 'xiaobei',
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
    fetchXiaobeiBoardsForOverview(),
  ])

  if (xiaobei?.list?.length) {
    return {
      upDown,
      // 热搜：保持小倍 heat 序；涨幅：按涨跌幅重排
      hotSearch: sliceBoards(xiaobei.list, 'hot', 0),
      boardGainers: sliceBoards(xiaobei.list, 'desc', 0),
      boardUpdateTime: xiaobei.updateTime,
      boardSource: xiaobei.source || 'xiaobei',
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
