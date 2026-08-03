import axios from 'axios'
import https from 'https'

const ua =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const agent = new https.Agent({rejectUnauthorized: false})

let session = {
  csrf: '',
  cookie: '',
  expiresAt: 0,
}

function cookieHeader(setCookie = []) {
  return setCookie.map((c) => c.split(';')[0]).join('; ')
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function ensureSession(force = false) {
  if (!force && session.csrf && Date.now() < session.expiresAt) return session

  const res = await axios.get('https://www.fund123.cn/fund', {
    httpsAgent: agent,
    timeout: 15000,
    headers: {'User-Agent': ua, Referer: 'https://www.fund123.cn/'},
  })
  const csrf = res.data.match(/"csrf":"([^"]+)"/)?.[1]
  if (!csrf) throw new Error('获取 fund123 CSRF 失败')
  session = {
    csrf,
    cookie: cookieHeader(res.headers['set-cookie']),
    expiresAt: Date.now() + 10 * 60 * 1000,
  }
  return session
}

async function fund123Post(path, body) {
  const run = async (force) => {
    const s = await ensureSession(force)
    return axios.post(`https://www.fund123.cn${path}?_csrf=${s.csrf}`, body, {
      httpsAgent: agent,
      timeout: 15000,
      headers: {
        'User-Agent': ua,
        Origin: 'https://www.fund123.cn',
        Referer: 'https://www.fund123.cn/fund',
        'Content-Type': 'application/json',
        'X-API-Key': 'foobar',
        Cookie: s.cookie,
        Accept: 'application/json, text/plain, */*',
      },
      validateStatus: () => true,
    })
  }

  let res = await run(false)
  if (res.status === 403 || res.status === 401) res = await run(true)
  return res
}

export async function searchFund(code) {
  const padded = String(code).padStart(6, '0')
  const res = await fund123Post('/api/fund/searchFund', {fundCode: padded})
  if (!res.data?.success || !res.data?.fundInfo) {
    throw new Error(res.data?.message || `未找到基金 ${padded}`)
  }
  const info = res.data.fundInfo
  return {
    code: info.fundCode || padded,
    name: info.fundName || padded,
    fundKey: info.key || '',
    netValue: parseFloat(info.netValue) || null,
    dayGrowth: parsePct(info.dayOfGrowth),
  }
}

const mobileUa =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

/** 东财一级行业偏粗，仅在无更细分标签时兜底 */
const COARSE_SECTORS = new Set([
  '有色金属',
  '化学制药',
  '医药生物',
  '食品饮料',
  '公用事业',
  '通信设备',
  '元件',
  '银行',
  '非银金融',
  '房地产',
  '电子',
  '计算机',
  '机械设备',
  '基础化工',
  '混业',
  '综合',
])

/** 无效 / 占位板块标签（东财常对 QDII 返回 "--"） */
function isUsableSectorTag(s) {
  const t = String(s || '').trim()
  return !!t && t !== '--' && t !== '-'
}

/** 旧版过粗标签：结合基金名判断是否需要重拉一次 */
function sectorsNeedRefresh(sectors, name = '') {
  if (!Array.isArray(sectors) || !sectors.length) return true
  if (sectors.some((s) => !isUsableSectorTag(s))) return true
  // 仅有东财一级行业时，按新逻辑（重仓股概念优先）重拉
  if (sectors.every((s) => COARSE_SECTORS.has(s))) return true
  const n = String(name)
  if (sectors.includes('有色金属')) return true
  if (sectors.includes('医药') || sectors.includes('化学制药')) {
    if (/创新药/.test(n)) return true
  }
  if (sectors.includes('半导体') && /半导体材料|半导体设备/.test(n)) return true
  if (sectors.includes('电力') && /绿色电力|绿电/.test(n)) return true
  if (sectors.includes('食品饮料') && /白酒/.test(n)) return true
  // 旧版把过长海外指数名截成难读标签时，允许按名称重拉一次
  if (
    /QDII|海外|中概|纳斯达克|纳指|标普|恒生/.test(n) &&
    sectors.some((s) => /海外中国互联网\d|人民币|美元/.test(s) || String(s).length > 10)
  ) {
    return true
  }
  return false
}

const PUSH_HOSTS = [
  'https://push2delay.eastmoney.com',
  'https://push2.eastmoney.com',
  'https://82.push2.eastmoney.com',
]

async function eastmoneyQuoteGet(path, params = {}) {
  let lastErr
  for (const host of PUSH_HOSTS) {
    try {
      const res = await axios.get(`${host}${path}`, {
        timeout: 10000,
        headers: {'User-Agent': ua, Referer: 'https://quote.eastmoney.com/'},
        params,
      })
      return res.data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('eastmoney quote failed')
}

/** NEWTEXCH: 0 深 / 1 沪；缺省时按代码前缀兜底 */
function toAshareSecid(gpdm, newtexch) {
  const code = String(gpdm || '').trim()
  if (!/^\d{6}$/.test(code)) return ''
  const ex = String(newtexch ?? '')
  if (ex === '1') return `1.${code}`
  if (ex === '0') return `0.${code}`
  if (/^[56]/.test(code)) return `1.${code}`
  if (/^[0348]/.test(code)) return `0.${code}`
  return ''
}

/** 去掉东财概念后缀「概念」 */
function normalizeConceptTag(raw) {
  return String(raw || '')
    .trim()
    .replace(/概念$/u, '')
    .trim()
}

/** 地域 / 风格 / 事件类噪音，不宜作为基金板块 */
function isNoisyConceptTag(tag) {
  const t = String(tag || '').trim()
  if (!t || t.length > 12) return true
  if (
    /板块$|特区$|预增|预减|高市净率|高成长|大盘|小盘|风格|股权分散|密集调研|券商金股|贬值受益|创投|参股|一带一路|西部大开发|长江三角|京津冀|通信技术$/u.test(
      t,
    )
  ) {
    return true
  }
  return false
}

async function eastmoneyFundGet(path, params = {}) {
  let lastErr
  for (let i = 0; i < 3; i++) {
    try {
      const res = await axios.get(`https://fundmobapi.eastmoney.com/FundMNewApi/${path}`, {
        timeout: 12000,
        headers: {
          'User-Agent': mobileUa,
          Referer: 'https://fund.eastmoney.com/',
          Origin: 'https://fund.eastmoney.com',
          Accept: 'application/json, text/plain, */*',
        },
        params: {
          deviceid: 'Wap',
          plat: 'Wap',
          product: 'EFund',
          version: '2.0.0',
          appType: 'ttjj',
          _: Date.now(),
          ...params,
        },
      })
      if (res.data?.Success) return res.data.Datas
      lastErr = new Error(res.data?.ErrMsg || `${path} 暂不可用`)
    } catch (e) {
      lastErr = e
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)))
  }
  throw lastErr || new Error(`${path} 获取失败`)
}

async function fetchFundBasicInfo(code) {
  return eastmoneyFundGet('FundMNBasicInformation', {
    FCODE: String(code).padStart(6, '0'),
  })
}

/** 东财基金类型文案，如「QDII-普通股票」「指数型-海外股票」 */
export async function fetchFundFtype(code) {
  try {
    const basic = await fetchFundBasicInfo(code)
    const ftype = basic?.FTYPE && basic.FTYPE !== '--' ? String(basic.FTYPE).trim() : ''
    return ftype
  } catch {
    return ''
  }
}

/** 跟踪指数名 → 细分主题，如「中证创新药产业指数」→「创新药」 */
function themeFromIndexName(indexName = '') {
  let s = String(indexName || '').trim()
  if (!s || s === '--') return []

  // 海外 / 常见宽基：优先收成短标签，避免长指数全名被长度限制丢掉
  const overseasHints = [
    [/中证海外中国互联网50|海外中国互联网50|中概互联50/, '中概互联'],
    [/中证海外中国互联网|海外中国互联网|中国互联网/, '中概互联'],
    [/恒生科技/, '恒生科技'],
    [/恒生中国企业|恒生国企|H股/, '恒生国企'],
    [/恒生指数|恒生/, '恒生'],
    [/纳斯达克100|纳指100|NDX/i, '纳斯达克'],
    [/纳斯达克|纳指/, '纳斯达克'],
    [/标准普尔500|标普500|S&P\s*500|SPX/i, '标普500'],
    [/标准普尔|标普/, '标普'],
    [/日经225|日经/, '日经'],
    [/道琼斯|道指/, '道琼斯'],
  ]
  for (const [re, label] of overseasHints) {
    if (re.test(s)) return [label]
  }

  // 反复去掉指数公司/口径前缀
  for (let i = 0; i < 4; i++) {
    const next = s.replace(
      /^(中证|国证|沪深|上证|深证|标普|标准普尔|恒生|纳斯达克|日经|MSCI|富时|全指)/i,
      '',
    )
    if (next === s) break
    s = next
  }
  s = s
    .replace(
      /(交易型开放式指数证券投资基金|全收益指数|净收益指数|价格指数|主题指数|产业指数|策略指数|指数)$/g,
      '',
    )
    .replace(/(主题|产业)$/g, '')
    .replace(/(人民币|美元|港币|计价)$/g, '')
    .replace(/[()（）\s]/g, '')
    .trim()
  // QDII 指数名常带成分数量等后缀，适当放宽；过长则截短到可读长度
  if (!s || s.length < 2) return []
  if (s.length > 12) s = s.slice(0, 12)
  return [s]
}

/** 合并去重：保留更细标签，去掉被覆盖的粗标签/冗长指数名 */
function finalizeThemes(list) {
  let out = [...new Set(list.map((s) => String(s || '').trim()).filter(Boolean))]

  out = out.filter((a) => {
    if (a === '半导体' && out.some((x) => x !== a && x.includes('半导体'))) return false
    if (a === '半导体设备' && out.some((x) => x.includes('半导体材料'))) return false
    if (a === '医药' && out.includes('创新药')) return false
    if (a === '电力' && out.includes('绿色电力')) return false
    if (
      a === '新能源' &&
      out.some((x) => ['锂矿', '光伏', '储能', '绿色电力'].includes(x))
    ) {
      return false
    }
    if (COARSE_SECTORS.has(a) && out.some((x) => !COARSE_SECTORS.has(x))) return false
    return true
  })

  const shorts = out.filter((s) => s.length <= 4)
  if (shorts.length) {
    // 「电力公用事业」这类长指数残留，有短标签时丢掉
    out = out.filter(
      (s) => !(s.length > 4 && shorts.some((sh) => s !== sh && s.includes(sh))),
    )
  }

  return out.slice(0, 3)
}

/**
 * 从基金名 / 指数名抽细分标签。
 * 规则按「更具体优先」排列；命中具体标签后不再回落宽泛标签。
 */
function inferSpecificThemesFromText(text = '') {
  const t = String(text)
  if (!t) return []
  const rules = [
    [/创新药/, '创新药'],
    [/白酒/, '白酒'],
    [/锂矿|锂业|碳酸锂|锂盐|盐湖提锂/, '锂矿'],
    [/半导体材料|半导体设备|芯片设备|半导体材料设备/, '半导体设备'],
    [/绿色电力|绿电/, '绿色电力'],
    [/光伏|太阳能/, '光伏'],
    [/储能/, '储能'],
    [/新能源车|智能车|汽车/, '汽车'],
    [/人工智能|算力|AI/, '人工智能'],
    [/军工|国防/, '军工'],
    [/黄金|贵金属/, '黄金'],
    [/消费电子/, '消费电子'],
    [/半导体|芯片|集成电路/, '半导体'],
    [/电力|公用事业/, '电力'],
    [/医药|医疗|生物/, '医药'],
    [/新能源|锂电/, '新能源'],
    [/银行|证券|保险|金融/, '金融'],
    [/地产|房地产/, '地产'],
    [/食品饮料|食品/, '食品饮料'],
    [/煤炭|钢铁|有色/, '周期'],
    // QDII / 海外主题（东财对海外基金常无 TTYPENAME）
    [/中概互联|海外.*互联|中国互联网|中概/, '中概互联'],
    [/恒生科技/, '恒生科技'],
    [/纳斯达克|纳指/, '纳斯达克'],
    [/标普.?500|标准普尔.?500|S&P.?500/i, '标普500'],
    [/日经/, '日经'],
    [/油气|原油|石油/, '油气'],
    [/美股|美国/, '美股'],
    [/港股|香港/, '港股'],
    [/全球/, '全球'],
    [/越南/, '越南'],
    [/印度/, '印度'],
    [/日本/, '日本'],
    [/德国|欧洲/, '海外'],
  ]
  const out = []
  for (const [re, label] of rules) {
    if (re.test(t)) out.push(label)
  }
  // 已有更细标签时去掉宽泛上位词
  const dropIfFiner = [
    ['医药', ['创新药']],
    ['半导体', ['半导体设备']],
    ['电力', ['绿色电力']],
    ['新能源', ['锂矿', '光伏', '储能', '绿色电力']],
    ['周期', ['锂矿']],
    ['食品饮料', ['白酒']],
  ]
  return out.filter((label) => {
    const pair = dropIfFiner.find(([coarse]) => coarse === label)
    if (!pair) return true
    return !pair[1].some((fine) => out.includes(fine))
  })
}

async function fetchFundHoldings(code) {
  try {
    const data = await eastmoneyFundGet('FundMNInverstPosition', {
      FCODE: String(code).padStart(6, '0'),
    })
    return {
      stocks: Array.isArray(data?.fundStocks) ? data.fundStocks : [],
      etfName: data?.ETFSHORTNAME || '',
    }
  } catch {
    return {stocks: [], etfName: ''}
  }
}

/**
 * 东财重仓股概念（f129）按持仓占比加权投票。
 * 标签去掉「概念」后缀，并过滤地域/风格噪音。
 */
async function inferThemesFromHoldingConcepts(stocks = []) {
  const top = stocks.slice(0, 8)
  if (!top.length) return []

  const votes = new Map()
  await Promise.all(
    top.map(async (s) => {
      const secid = toAshareSecid(s.GPDM, s.NEWTEXCH)
      if (!secid) return
      const weight = Math.max(Number.parseFloat(s.JZBL) || 1, 0.5)
      try {
        const data = await eastmoneyQuoteGet('/api/qt/stock/get', {
          secid,
          fields: 'f129',
        })
        const raw = data?.data?.f129
        if (raw == null || raw === '' || raw === '-' || raw === '--') return
        const tags = String(raw)
          .split(/[,，]/)
          .map(normalizeConceptTag)
          .filter(Boolean)
        for (const tag of tags) {
          if (!isUsableSectorTag(tag) || isNoisyConceptTag(tag)) continue
          if (COARSE_SECTORS.has(tag)) continue
          votes.set(tag, (votes.get(tag) || 0) + weight)
        }
      } catch {
        // 单票失败忽略
      }
    }),
  )

  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'zh'))
    .map(([label]) => label)
    .slice(0, 5)
}

/** 主动基金：用重仓股名称投票推断细分主题（如锂矿） */
function inferThemesFromHoldingsData(stocks = [], etfName = '') {
  const texts = stocks
    .slice(0, 10)
    .map((s) => `${s.GPJC || ''} ${s.GPNAME || ''}`)
    .join(' ')
  const votes = new Map()

  const holdingRules = [
    [/锂|盐湖|赣锋|天齐|雅化|中矿|永兴材料|西藏矿业|西藏珠峰|天华新能|盛新锂能/, '锂矿'],
    [/创新药|药明|百济|信达|恒瑞|科伦|复星医药|君实|康方/, '创新药'],
    [/茅台|五粮液|泸州老窖|汾酒|洋河|白酒/, '白酒'],
    [/宁德时代|比亚迪|理想|小鹏|蔚来|新能源车/, '汽车'],
    [/隆基|通威|阳光电源|晶澳|光伏/, '光伏'],
    [/中芯|韦尔|北方华创|中微|拓荆|半导体|芯片/, '半导体'],
    [/贵州茅台/, '白酒'],
    // QDII 常见海外重仓
    [/苹果|微软|英伟达|谷歌|Alphabet|亚马逊|Meta|特斯拉|AMD|NVIDIA|Apple|Microsoft/i, '美股'],
    [/腾讯|阿里|美团|小米|京东|网易|百度|拼多多|快手/, '中概互联'],
    [/台积电|TSMC|三星/, '半导体'],
  ]

  const hay = `${texts} ${etfName}`
  for (const [re, label] of holdingRules) {
    if (re.test(hay)) votes.set(label, (votes.get(label) || 0) + 1)
  }

  return [...votes.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, 2)
}

/**
 * 细分板块标签优先级：
 * 1) 东财重仓股概念（去「概念」后缀）
 * 2) 跟踪指数名（指数/联接基金）
 * 3) 基金名称关键词（创新药 > 医药）
 * 4) 重仓股名称投票（主动基金，如锂矿）
 * 5) 东财 TTYPENAME / FUNDSUBJECTLIST 仅作无细分时的兜底
 */
export async function fetchFundSectors(code, nameHint = '') {
  const specific = []
  const pushUnique = (list) => {
    for (const s of list) {
      const t = String(s || '').trim()
      if (t && !specific.includes(t)) specific.push(t)
    }
  }

  let basic = null
  try {
    basic = await fetchFundBasicInfo(code)
  } catch {
    basic = null
  }

  const shortName = nameHint || basic?.SHORTNAME || ''
  const indexName = basic?.INDEXNAME && basic.INDEXNAME !== '--' ? basic.INDEXNAME : ''
  const ftype = basic?.FTYPE && basic.FTYPE !== '--' ? basic.FTYPE : ''
  const {stocks, etfName} = await fetchFundHoldings(code)

  pushUnique(await inferThemesFromHoldingConcepts(stocks))
  pushUnique(themeFromIndexName(indexName))
  pushUnique(inferSpecificThemesFromText(`${shortName} ${indexName} ${ftype}`))

  const fromHoldings = inferThemesFromHoldingsData(stocks, etfName)
  if (!specific.length) {
    pushUnique(fromHoldings)
  } else {
    pushUnique(fromHoldings.filter((s) => !COARSE_SECTORS.has(s)))
  }

  if (!specific.length && basic) {
    if (isUsableSectorTag(basic.TTYPENAME)) pushUnique([basic.TTYPENAME])
    for (const item of basic.FUNDSUBJECTLIST || []) {
      if (isUsableSectorTag(item?.TTYPENAME)) pushUnique([item.TTYPENAME])
    }
  }

  return finalizeThemes(specific.filter(isUsableSectorTag))
}

/** 串行化板块请求，降低东财限流概率 */
let sectorChain = Promise.resolve()
export function fetchFundSectorsQueued(code, nameHint = '') {
  const job = sectorChain.then(() => fetchFundSectors(code, nameHint))
  sectorChain = job.then(
    () => undefined,
    () => undefined,
  )
  return job
}

function parsePct(v) {
  if (v == null || v === '--' || v === '') return null
  const n = parseFloat(String(v).replace('%', ''))
  return Number.isFinite(n) ? n : null
}

export async function getFundMatiaria(code) {
  const padded = String(code).padStart(6, '0')
  const res = await axios.get(`https://www.fund123.cn/matiaria?fundCode=${padded}`, {
    httpsAgent: agent,
    timeout: 15000,
    headers: {'User-Agent': ua, Referer: 'https://www.fund123.cn/'},
  })
  const html = res.data || ''
  const dayGrowth = parsePct(html.match(/dayOfGrowth":"([^"]+)/)?.[1])
  const netValue = parseFloat(html.match(/netValue":"([^"]+)/)?.[1])
  const netValueDate = normalizeNetValueDate(
    html.match(/netValueDate":"([^"]+)/)?.[1] || '',
  )
  const fundName = html.match(/fundName":"([^"]+)/)?.[1]
  return {
    code: padded,
    name: fundName,
    dayGrowth: Number.isFinite(dayGrowth) ? dayGrowth : null,
    netValue: Number.isFinite(netValue) ? netValue : null,
    netValueDate,
  }
}

/** 基金历史涨幅区间 → 回溯自然日（成立以来不截断） */
const FUND_RANGE_CALENDAR_DAYS = {
  '3m': 100,
  '1y': 400,
  '3y': 1200,
  since: null,
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000
}

function mapHisNetRows(list) {
  const rows = Array.isArray(list) ? list : []
  return rows
    .map((r) => {
      const netValue = parseFloat(r.DWJZ)
      const dayGrowth = parsePct(r.JZZZL)
      const date = normalizeNetValueDate(r.FSRQ || '')
      return {
        date,
        netValue: Number.isFinite(netValue) ? netValue : null,
        dayGrowth,
      }
    })
    .filter((r) => r.netValue != null && r.date)
}

/**
 * 东财历史净值（单位净值 DWJZ 为真实披露值，勿用两位涨幅反推）。
 * 返回按日期降序：[{date, netValue, dayGrowth}, ...]
 */
export async function fetchFundNavHistory(code, pageSize = 5, pageIndex = 1) {
  const list = await eastmoneyFundGet('FundMNHisNetList', {
    FCODE: String(code).padStart(6, '0'),
    pageIndex,
    pageSize,
  })
  return mapHisNetRows(list)
}

/**
 * 分页拉取历史净值（降序），直到条数够或无更多页。
 * @param {string} code
 * @param {{ pageSize?: number, maxPages?: number, minCount?: number }} opts
 */
async function fetchFundNavHistoryPaged(code, opts = {}) {
  const pageSize = opts.pageSize || 500
  const maxPages = opts.maxPages || 1
  const minCount = opts.minCount || 0
  const all = []
  for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
    const rows = await fetchFundNavHistory(code, pageSize, pageIndex)
    if (!rows.length) break
    all.push(...rows)
    if (rows.length < pageSize) break
    if (minCount > 0 && all.length >= minCount) break
  }
  return all
}

function filterFundNavByRange(rowsAsc, range) {
  const days = FUND_RANGE_CALENDAR_DAYS[range]
  if (days == null) return rowsAsc
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - days)
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  return rowsAsc.filter((p) => p.date >= startStr)
}

/**
 * 基金历史净值涨幅（相对区间首日单位净值）
 * @param {string} code
 * @param {'3m'|'1y'|'3y'|'since'} range
 */
export async function getFundHistory(code, range = '3m') {
  const padded = String(code || '').padStart(6, '0')
  const key = FUND_RANGE_CALENDAR_DAYS[range] !== undefined ? range : '3m'

  let desc
  if (key === 'since') {
    // 单页大 pageSize 一次拉全（实测可达数千条）；偶发截断时再补一页
    desc = await fetchFundNavHistoryPaged(padded, {
      pageSize: 10000,
      maxPages: 2,
    })
  } else if (key === '3y') {
    desc = await fetchFundNavHistoryPaged(padded, {
      pageSize: 1200,
      maxPages: 2,
      minCount: 900,
    })
  } else if (key === '1y') {
    desc = await fetchFundNavHistory(padded, 320, 1)
  } else {
    desc = await fetchFundNavHistory(padded, 120, 1)
  }

  if (!desc.length) throw new Error(`暂无基金 ${padded} 历史净值`)

  // 接口降序 → 升序后再按区间截断
  const asc = filterFundNavByRange([...desc].reverse(), key)
  if (!asc.length) throw new Error(`暂无该周期净值数据`)

  const base = asc[0].netValue
  const points = asc.map((p) => ({
    date: p.date,
    netValue: p.netValue,
    percent:
      base && Number.isFinite(base)
        ? round4(((p.netValue - base) / base) * 100)
        : null,
  }))
  const last = points[points.length - 1]
  return {
    code: padded,
    range: key,
    periodPercent: last?.percent ?? null,
    points,
  }
}

export async function getFundEstimateIntraday(fundKey) {
  if (!fundKey) return {points: [], latest: null}
  const today = new Date()
  const tomorrow = new Date(today.getTime() + 86400000)
  const res = await fund123Post('/api/fund/queryFundEstimateIntraday', {
    startTime: fmtDate(today),
    endTime: fmtDate(tomorrow),
    limit: 240,
    productId: fundKey,
    format: true,
    source: 'WEALTHBFFWEB',
  })

  const list = res.data?.list || []
  const points = list.map((p) => {
    const t = new Date(p.time)
    const hh = String(t.getHours()).padStart(2, '0')
    const mm = String(t.getMinutes()).padStart(2, '0')
    const growth = parseFloat(p.forecastGrowth)
    return {
      time: `${hh}:${mm}`,
      growth: Number.isFinite(growth) ? growth * 100 : null,
      netValue: parseFloat(p.forecastNetValue) || null,
    }
  }).filter((p) => p.growth != null)

  const latest = points.length ? points[points.length - 1] : null
  return {points, latest}
}

export async function getFundQuote(fund) {
  const code = fund.code
  let fundKey = fund.fundKey
  let name = fund.name
  let dayGrowth = null
  let netValue = null
  let netValueDate = ''

  try {
    if (!fundKey || !name) {
      const searched = await searchFund(code)
      fundKey = fundKey || searched.fundKey
      name = name || searched.name
      dayGrowth = searched.dayGrowth
      netValue = searched.netValue
    }
  } catch {
    // ignore search failure, try matiaria
  }

  try {
    const m = await getFundMatiaria(code)
    name = name || m.name || code
    dayGrowth = m.dayGrowth ?? dayGrowth
    netValue = m.netValue ?? netValue
    netValueDate = m.netValueDate || ''
  } catch {
    // keep previous
  }

  let estimateGrowth = null
  let estimateNetValue = null
  let trend = []
  try {
    const est = await getFundEstimateIntraday(fundKey)
    estimateGrowth = est.latest?.growth ?? null
    estimateNetValue = est.latest?.netValue ?? null
    trend = est.points
  } catch {
    // no estimate outside market hours
  }

  // 用东财历史净值对齐披露值（单位净值），并取真实相邻昨净值
  let hist = []
  let histIdx = -1
  try {
    hist = await fetchFundNavHistory(code, 5)
    if (hist.length) {
      const navDay = normalizeNetValueDate(netValueDate)
      histIdx = navDay ? hist.findIndex((h) => h.date === navDay) : 0
      if (histIdx < 0) histIdx = 0
      const match = hist[histIdx]
      if (match?.netValue != null) {
        netValue = match.netValue
        if (match.dayGrowth != null) dayGrowth = match.dayGrowth
        if (match.date) netValueDate = match.date
      }
    }
  } catch {
    hist = []
    histIdx = -1
  }

  let establishDate = ''
  let ageDays = null
  let ftype = fund.ftype || ''
  try {
    const basic = await fetchFundBasicInfo(code)
    ftype =
      (basic?.FTYPE && basic.FTYPE !== '--'
        ? String(basic.FTYPE).trim()
        : '') || ftype
    const raw = String(basic?.ESTABDATE || basic?.ESTABLISHDATE || '').trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      establishDate = raw.slice(0, 10)
    } else if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(raw)) {
      const [yy, mm, dd] = raw.split(/[^\d]/).filter(Boolean)
      establishDate = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
    if (establishDate) {
      const [y, m, d] = establishDate.split('-').map(Number)
      const start = new Date(y, m - 1, d)
      const now = new Date()
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      if (!Number.isNaN(start.getTime())) {
        ageDays = Math.max(
          0,
          Math.floor((end.getTime() - start.getTime()) / 86400000),
        )
      }
    }
  } catch {
    // ignore
  }

  const delayedDisclosure = isDelayedNavFund({
    fundType: fund.fundType,
    ftype,
    name: name || fund.name,
  })

  // 晚间净值确认后优先用真实涨跌；盘中无确认日则用估值
  const {percent, percentSource} = resolveDisplayPercent({
    estimateGrowth,
    dayGrowth,
    netValueDate,
    delayedDisclosure,
  })

  const hasEstimate = estimateNetValue != null || estimateGrowth != null

  // 确认日 / 无估值（QDII 等）：昨净值 = 历史上一交易日披露值
  // 估值日：昨净值 = 最新确认净值（即 netValue）
  // 禁止用两位涨幅反推
  let prevNetValue = null
  if (percentSource === 'confirmed') {
    if (histIdx >= 0 && hist[histIdx + 1]?.netValue != null) {
      prevNetValue = hist[histIdx + 1].netValue
    }
  } else if (hasEstimate) {
    if (netValue != null) prevNetValue = netValue
  } else if (histIdx >= 0 && hist[histIdx + 1]?.netValue != null) {
    prevNetValue = hist[histIdx + 1].netValue
  } else if (netValue != null) {
    prevNetValue = netValue
  }

  let sectors = Array.isArray(fund.sectors) ? [...fund.sectors] : []
  if (sectorsNeedRefresh(sectors, name)) {
    try {
      const next = await fetchFundSectorsQueued(code, name)
      if (next.length) sectors = next
    } catch {
      // keep previous
    }
  }

  return {
    code,
    name,
    fundKey,
    dayGrowth,
    estimateGrowth,
    percent,
    percentSource,
    netValue,
    estimateNetValue,
    prevNetValue,
    netValueDate,
    establishDate,
    ageDays,
    ftype,
    time: trend.length ? trend[trend.length - 1].time : null,
    trend,
    sectors,
  }
}

function todayDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 统一成 YYYY-MM-DD（兼容接口返回的 MM-DD） */
export function normalizeNetValueDate(raw, now = new Date()) {
  const s = String(raw || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const md = s.match(/^(\d{1,2})-(\d{1,2})$/)
  if (!md) return ''
  const month = Number(md[1])
  const day = Number(md[2])
  if (!month || !day) return ''
  let year = now.getFullYear()
  const candidate = new Date(year, month - 1, day)
  // 未到的月日视为去年（跨年）
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (candidate > todayOnly) year -= 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function nextTradingDay(dateStr) {
  const [y, m, day] = dateStr.split('-').map(Number)
  if (!y || !m || !day) return dateStr
  const d = new Date(y, m - 1, day)
  do {
    d.setDate(d.getDate() + 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return todayDateStr(d)
}

/** QDII / 海外：净值多为 T+1 披露，不套用 A 股确认会话窗 */
export function isDelayedNavFund({fundType, ftype, name} = {}) {
  return /QDII|海外/.test(`${fundType || ''} ${ftype || ''} ${name || ''}`)
}

/**
 * 净值确认会话是否仍有效。
 * 默认：净值日 → 下一交易日 09:15 前（国内基金晚间确认）。
 * delayedDisclosure（QDII/海外）：有披露净值日即视为确认可用，不套 A 股会话窗。
 */
export function isConfirmedSessionActive(
  navDayRaw,
  now = new Date(),
  opts = {},
) {
  const navDay = normalizeNetValueDate(navDayRaw, now)
  if (!navDay) return false
  if (opts.delayedDisclosure) return true
  const end = nextTradingDay(navDay)
  const today = todayDateStr(now)
  if (today > end) return false
  if (today < end) return true
  const minutes = now.getHours() * 60 + now.getMinutes()
  return minutes < 9 * 60 + 15
}

/**
 * 涨跌幅口径：
 * - 确认会话内优先官方 dayGrowth
 * - QDII/海外：有最新官方披露即标 confirmed（不套 A 股窗口）
 * - 否则盘中用估值 estimateGrowth
 * - 再否则回落上一确认 dayGrowth（不再标为 confirmed）
 */
function resolveDisplayPercent({
  estimateGrowth,
  dayGrowth,
  netValueDate,
  delayedDisclosure = false,
}) {
  const navDay = normalizeNetValueDate(netValueDate)
  if (delayedDisclosure && dayGrowth != null && navDay) {
    return {percent: dayGrowth, percentSource: 'confirmed'}
  }
  const inConfirmSession =
    dayGrowth != null &&
    navDay &&
    isConfirmedSessionActive(navDay, new Date(), {delayedDisclosure})

  if (inConfirmSession) {
    return {percent: dayGrowth, percentSource: 'confirmed'}
  }
  if (estimateGrowth != null) {
    return {percent: estimateGrowth, percentSource: 'estimate'}
  }
  if (dayGrowth != null) {
    return {percent: dayGrowth, percentSource: null}
  }
  return {percent: null, percentSource: null}
}

export async function getFundsQuotes(funds) {
  const results = []
  const concurrency = 4
  for (let i = 0; i < funds.length; i += concurrency) {
    const chunk = funds.slice(i, i + concurrency)
    const settled = await Promise.allSettled(chunk.map((f) => getFundQuote(f)))
    settled.forEach((s, idx) => {
      if (s.status === 'fulfilled') results.push(s.value)
      else {
        const f = chunk[idx]
        results.push({
          code: f.code,
          name: f.name || f.code,
          fundKey: f.fundKey || '',
          dayGrowth: null,
          estimateGrowth: null,
          percent: null,
          percentSource: null,
          netValue: null,
          estimateNetValue: null,
          prevNetValue: null,
          netValueDate: '',
          time: null,
          trend: [],
          sectors: f.sectors || [],
          error: String(s.reason?.message || s.reason),
        })
      }
    })
  }
  return results
}
