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

/** 旧版过粗 / 脏宽基名 / 近义未收敛：结合基金名判断是否需要重拉 */
function sectorsNeedRefresh(sectors, name = '') {
  if (!Array.isArray(sectors) || !sectors.length) return true
  if (sectors.some((s) => !isUsableSectorTag(s))) return true
  if (sectors.every((s) => COARSE_SECTORS.has(s))) return true
  if (sectors.some((s) => /次新/.test(String(s)))) return true
  // 旧版自研标签 → 切到小倍关联板块后强制重拉
  if (
    sectors.some((s) =>
      ['国产芯片', '算力', '科技', '光通信模块', '锂电池', '电池技术'].includes(String(s)),
    )
  ) {
    return true
  }
  // 宽基指数被洗成「300」或残留「指数价格」/编制方前缀
  if (
    sectors.some(
      (s) =>
        /^(300|500|1000|50)$/.test(String(s)) ||
        /指数价格|价格指数|方正富邦|蚂蚁/.test(String(s)),
    )
  ) {
    return true
  }
  if (sectors.includes('沪深300') && /医药|医疗|卫生/.test(String(name))) return true
  // 锂簇未收敛；新能源主题却只贴了过窄子标签
  if (sectors.some((s) => s === '电池技术' || s === '锂电池')) return true
  const n = String(name)
  if (
    /新能源|新材料/.test(n) &&
    sectors.length === 1 &&
    ['锂矿', '光伏', '储能', '锂电池'].includes(sectors[0])
  ) {
    return true
  }
  if (sectors.includes('有色金属')) return true
  if (sectors.includes('医药') || sectors.includes('化学制药')) {
    if (/创新药/.test(n)) return true
  }
  if (sectors.includes('半导体') && /半导体材料|半导体设备/.test(n)) return true
  if (sectors.includes('电力') && /绿色电力|绿电/.test(n)) return true
  if (sectors.includes('食品饮料') && /白酒/.test(n)) return true
  if (
    /ETF|联接|绿电|绿色电力/.test(n) &&
    !sectors.some((s) => /绿色电力|绿电|光伏|风能|储能|核能|沪深300|创业板|中证/.test(String(s)))
  ) {
    return true
  }
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

/**
 * 重仓行情 secid：
 * - A 股：0./1.
 * - 港股：116.
 * - 美股：105 纳斯达克 / 106 纽交所 / 107 美交所
 */
function toHoldingSecid(gpdm, newtexch) {
  const code = String(gpdm || '').trim()
  if (!code) return ''
  const ex = String(newtexch ?? '').trim()
  if (/^\d{6}$/.test(code)) return toAshareSecid(code, newtexch)
  if (['105', '106', '107', '116'].includes(ex)) return `${ex}.${code}`
  return ''
}

/** 去掉东财概念后缀「概念」 */
function normalizeConceptTag(raw) {
  return String(raw || '')
    .trim()
    .replace(/概念$/u, '')
    .trim()
}

/** 地域 / 风格 / 事件 / 品牌噪音，不宜作为基金板块 */
function isNoisyConceptTag(tag) {
  const t = String(tag || '').trim()
  if (!t || t.length > 12) return true
  if (
    /板块$|特区$|次新|预增|预减|高市净率|高成长|大盘|小盘|风格|股权分散|密集调研|券商金股|贬值受益|创投|参股|一带一路|西部大开发|长江三角|京津冀|通信技术$|央国企改革|稀缺资源|IPO受益|军民融合|特斯拉|小米|苹果|华为|阿里|腾讯|英伟达|DeepSeek|ChatGPT|雅下水电|东北振兴|雄安新区|动力电池回收|互联网金融|刀片电池|无线耳机|商业航天|蚂蚁|方正富邦|超级品牌|味蕾经济|品牌消费|网红经济|直播电商/u.test(
      t,
    )
  ) {
    return true
  }
  return false
}

/** ETF / 联接 / 指数型 */
function isEtfLikeFund({shortName = '', indexName = '', ftype = '', etfCode = ''} = {}) {
  if (etfCode) return true
  const hay = `${shortName} ${ftype}`
  if (/ETF|联接/.test(hay)) return true
  if (indexName && /指数/.test(hay)) return true
  if (/指数型/.test(ftype) && indexName) return true
  return false
}

/** 同义归一 */
const TAG_ALIASES = {
  绿电: '绿色电力',
  盐湖提锂: '锂矿',
  光模块: '光通信模块',
  光通信: '光通信模块',
  酿酒: '白酒',
  白酒概念: '白酒',
  味蕾经济: '白酒',
  白酒股: '白酒',
  被动元件概念: 'MLCC',
  被动元件: 'MLCC',
  片式电容: 'MLCC',
  多层陶瓷电容: 'MLCC',
  电子50: '电子',
}

/**
 * 主题簇与特异性（越高越具体）。
 * 同簇只保留特异性最高且得分够的 canonical。
 */
const TAG_META = {
  锂矿: {cluster: '锂', specificity: 95},
  锂电池: {cluster: '锂', specificity: 70},
  电池技术: {cluster: '锂', specificity: 40},
  固态电池: {cluster: '锂', specificity: 60},

  CPO: {cluster: '光通信', specificity: 95},
  光通信模块: {cluster: '光通信', specificity: 85},
  光纤: {cluster: '光通信', specificity: 80},

  绿色电力: {cluster: '绿电', specificity: 95},
  风能: {cluster: '绿电', specificity: 55},
  光伏: {cluster: '新能源', specificity: 85},
  储能: {cluster: '新能源', specificity: 80},
  核能核电: {cluster: '绿电', specificity: 70},
  新能源: {cluster: '新能源', specificity: 40},

  芯片: {cluster: '半导体', specificity: 92},
  半导体: {cluster: '半导体', specificity: 80},
  半导体设备: {cluster: '半导体', specificity: 90},
  国产芯片: {cluster: '半导体', specificity: 75},
  存储芯片: {cluster: '半导体', specificity: 85},
  AI芯片: {cluster: '半导体', specificity: 85},

  MLCC: {cluster: 'MLCC', specificity: 95},
  电子: {cluster: '电子', specificity: 70},
  PCB: {cluster: '电子', specificity: 75},
  消费电子: {cluster: '电子', specificity: 72},
  科技: {cluster: '科技', specificity: 45},

  创新药: {cluster: '医药', specificity: 95},
  医药: {cluster: '医药', specificity: 50},
  白酒: {cluster: '白酒', specificity: 90},
  消费: {cluster: '消费', specificity: 55},
  食品饮料: {cluster: '消费', specificity: 50},
  主要消费: {cluster: '消费', specificity: 60},

  人工智能: {cluster: 'AI', specificity: 80},
  算力: {cluster: 'AI', specificity: 85},
  中概互联: {cluster: '海外', specificity: 85},
  纳斯达克: {cluster: '海外', specificity: 80},
  美股: {cluster: '海外', specificity: 60},

  '5G': {cluster: '通信', specificity: 45},
  '5G通信': {cluster: '通信', specificity: 80},
  通信: {cluster: '通信', specificity: 50},

  沪深300: {cluster: '宽基', specificity: 90},
  中证500: {cluster: '宽基', specificity: 90},
  中证1000: {cluster: '宽基', specificity: 90},
  上证50: {cluster: '宽基', specificity: 90},
  科创50: {cluster: '宽基', specificity: 90},
  创业板: {cluster: '宽基', specificity: 90},
  证券公司: {cluster: '金融', specificity: 85},
  保险: {cluster: '金融', specificity: 85},
  金融: {cluster: '金融', specificity: 40},
  汽车: {cluster: '新能源', specificity: 70},
  煤炭: {cluster: '周期', specificity: 85},
  周期: {cluster: '周期', specificity: 40},
  环保: {cluster: '环保', specificity: 85},
}

/** 新能源家族：名称含新能源时提升父标签，并允许附带细分 */
const NEW_ENERGY_CLUSTERS = new Set(['新能源', '锂', '绿电', '汽车'])

/** 过于宽泛的概念，降权（新能源/消费作主题名时不在此列） */
const GENERIC_TAG_PENALTY = new Set([
  '5G',
  '人工智能',
  '大数据',
  '物联网',
  '云计算',
  '新材料',
  '小金属',
  '通信',
  '科技',
])

function canonicalizeTag(tag) {
  let t = normalizeConceptTag(tag)
  if (!t) return ''
  if (TAG_ALIASES[t]) t = TAG_ALIASES[t]
  return t
}

function getTagMeta(tag) {
  return TAG_META[tag] || {cluster: `other:${tag}`, specificity: 50}
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

  // 1) 行业/主题细分必须先于宽基（避免「沪深300医药卫生」→沪深300）
  const sectorHints = [
    [/创新药/, '创新药'],
    [/医药卫生|中证医疗|医疗指数|医药/, '医药'],
    [/中证白酒|白酒指数/, '白酒'],
    [/中证主要消费|主要消费/, '主要消费'],
    [/中证光伏|光伏产业/, '光伏'],
    [/中证绿色电力|绿色电力/, '绿色电力'],
    [/中证电子|电子50|电子指数/, '电子'],
    // 国证半导体优先；科创板/半导体芯片指数 → 芯片
    [/国证半导体/, '半导体'],
    [/科创板芯片|上证科创板芯片/, '芯片'],
    [/半导体芯片|芯片行业|芯片指数/, '芯片'],
    [/中证全指半导体|半导体产品与设备|中华交易服务半导体|半导体/, '半导体'],
    [/芯片/, '芯片'],
    [/中证军工|军工指数|军工/, '军工'],
    [/中证全指证券公司|证券公司指数|证券指数/, '证券公司'],
    [/保险主题|保险指数|保险/, '保险'],
    [/5G通信|中证5G/, '5G通信'],
    [/中证煤炭|煤炭指数|煤炭/, '煤炭'],
    [/中证新能源|新能源指数/, '新能源'],
  ]
  for (const [re, label] of sectorHints) {
    if (re.test(s)) return [label]
  }

  // 2) 纯宽基
  const broadHints = [
    [/沪深\s*300|沪深三百/, '沪深300'],
    [/中证\s*500|中证五百/, '中证500'],
    [/中证\s*1000|中证一千/, '中证1000'],
    [/上证\s*50|上证五十/, '上证50'],
    [/科创\s*50|科创板\s*50/, '科创50'],
    [/创业板/, '创业板'],
    [/上证指数|上证综指/, '上证指数'],
    [/深证成指/, '深证成指'],
  ]
  for (const [re, label] of broadHints) {
    if (re.test(s)) return [label]
  }

  // 3) 海外主题
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

  // 4) 通用清洗（去掉编制方/口径噪音）
  s = s.replace(/方正富邦|华泰柏瑞|易方达|华夏|国泰|南方|嘉实|银华|华宝|天弘/g, '')
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
      /(交易型开放式指数证券投资基金|全收益指数|净收益指数|价格指数|主题指数|产业指数|策略指数|指数)/g,
      '',
    )
    .replace(/[()（）]/g, '')
    .replace(/(主题|产业)$/g, '')
    .replace(/(人民币|美元|港币|计价)$/g, '')
    .replace(/\s+/g, '')
    .trim()
  if (!s || s.length < 2 || /^\d+$/.test(s)) return []
  if (s.length > 12) s = s.slice(0, 12)
  return [s]
}

/** 合并去重：保留更细标签，去掉被覆盖的粗标签/冗长指数名 */
function finalizeThemes(list) {
  let out = [...new Set(list.map((s) => String(s || '').trim()).filter(Boolean))]

  out = out.filter((a) => {
    if (a === '半导体' && (out.includes('芯片') || out.some((x) => x !== a && x.includes('半导体')))) {
      return false
    }
    if (a === '半导体设备' && out.some((x) => x.includes('半导体材料') || x === '芯片')) {
      return false
    }
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
    [/MLCC|被动元件|片式电容/, 'MLCC'],
    [/芯片/, '芯片'],
    [/绿色电力|绿电/, '绿色电力'],
    [/光伏|太阳能/, '光伏'],
    [/储能/, '储能'],
    [/新能源车|智能车/, '汽车'],
    [/人工智能|算力|AI/, '人工智能'],
    [/军工|国防/, '军工'],
    [/黄金|贵金属/, '黄金'],
    [/环保|环境治理|低碳/, '环保'],
    [/消费电子/, '消费电子'],
    [/半导体|集成电路/, '半导体'],
    [/电子/, '电子'],
    [/科技|高端制造/, '科技'],
    [/电力|公用事业/, '电力'],
    [/医药|医疗|生物/, '医药'],
    [/新能源|新材料|锂电/, '新能源'],
    [/主要消费/, '主要消费'],
    [/消费/, '消费'],
    [/保险/, '保险'],
    [/证券/, '证券公司'],
    [/银行|金融/, '金融'],
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
    // 新能源作父主题时保留，不因细分而丢弃
    ['周期', ['锂矿']],
    ['食品饮料', ['白酒']],
    ['消费', ['白酒', '主要消费']],
  ]
  return out.filter((label) => {
    const pair = dropIfFiner.find(([coarse]) => coarse === label)
    if (!pair) return true
    return !pair[1].some((fine) => out.includes(fine))
  })
}

/** 有占比的重仓（含港股/未上市代码），用于权重与简称投票 */
function filterWeightedHoldings(stocks = []) {
  return (Array.isArray(stocks) ? stocks : []).filter(
    (s) => Number.parseFloat(s?.JZBL) > 0 && (s.GPJC || s.GPNAME || s.GPDM),
  )
}

/** A 股六位代码：可查东财概念 */
function filterUsableHoldings(stocks = []) {
  return filterWeightedHoldings(stocks).filter((s) =>
    /^\d{6}$/.test(String(s?.GPDM || '').trim()),
  )
}

/**
 * 拉取重仓股；联接基金在自身无效或 preferEtf 时穿透标的 ETF。
 */
async function fetchFundHoldings(code, {preferEtf = false} = {}) {
  try {
    const data = await eastmoneyFundGet('FundMNInverstPosition', {
      FCODE: String(code).padStart(6, '0'),
    })
    const etfCode =
      data?.ETFCODE && data.ETFCODE !== '--' ? String(data.ETFCODE).padStart(6, '0') : ''
    const etfName = data?.ETFSHORTNAME && data.ETFSHORTNAME !== '--' ? data.ETFSHORTNAME : ''
    // 保留港股等全部有占比重仓；概念 API 再单独筛 A 股
    let stocks = filterWeightedHoldings(data?.fundStocks)

    if (etfCode && (!stocks.length || preferEtf)) {
      try {
        const etfData = await eastmoneyFundGet('FundMNInverstPosition', {
          FCODE: etfCode,
        })
        const etfStocks = filterWeightedHoldings(etfData?.fundStocks)
        if (etfStocks.length) {
          return {
            stocks: etfStocks,
            etfName: etfName || etfData?.ETFSHORTNAME || '',
            etfCode,
          }
        }
      } catch {
        // 穿透失败则回退自身可用重仓
      }
    }

    return {stocks, etfName, etfCode}
  } catch {
    return {stocks: [], etfName: '', etfCode: ''}
  }
}

function roundWeight(n) {
  return Math.round(Number(n) * 10000) / 10000
}

function signedPctText(v, digits = 2) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '--'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(digits)}%`
}

function pctTone(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return 'flat'
  return n > 0 ? 'rise' : 'fall'
}

function formatReportText(reportDate, year, quarter) {
  const y = Number(year)
  const q = Number(quarter)
  if (Number.isFinite(y) && Number.isFinite(q) && q >= 1 && q <= 4) {
    return `${y}年${['', '一', '二', '三', '四'][q]}季报`
  }
  const raw = String(reportDate || '').replace(/\D/g, '')
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }
  return String(reportDate || '').trim()
}

/** 小倍风格：2026年第2季度 */
function formatReportQuarterText(reportDate, year, quarter) {
  const y = Number(year)
  const q = Number(quarter)
  if (Number.isFinite(y) && Number.isFinite(q) && q >= 1 && q <= 4) {
    return `${y}年第${q}季度`
  }
  const raw = String(reportDate || '').replace(/\D/g, '')
  if (raw.length === 8) {
    const mm = Number(raw.slice(4, 6))
    if (mm >= 1 && mm <= 12) {
      return `${raw.slice(0, 4)}年第${Math.ceil(mm / 3)}季度`
    }
  }
  return formatReportText(reportDate, year, quarter)
}

/** 600519.SH / 01888.HK / SNDK.O → 展示用代码 */
function formatHoldingCode(row) {
  const wind = String(row?.stock || row?.sInfoWindcode || '').trim().toUpperCase()
  if (wind.includes('.')) {
    const [sym, ex] = wind.split('.')
    if (!sym) return '--'
    if (ex === 'SH' || ex === 'SZ' || ex === 'BJ') {
      return /^\d+$/.test(sym) ? sym.padStart(6, '0').slice(-6) : sym
    }
    if (ex === 'HK') {
      return /^\d+$/.test(sym) ? sym.padStart(5, '0') : sym
    }
    return sym
  }
  const code = String(row?.code || '').trim()
  if (!code) return '--'
  if (/^\d+$/.test(code)) return code.padStart(6, '0').slice(-6)
  return code
}

/** Wind 代码 → 东财 secid（A/港股；美股暂不映射） */
function toSecidFromWind(stock, code) {
  const wind = String(stock || '').trim().toUpperCase()
  if (wind.includes('.')) {
    const [sym, ex] = wind.split('.')
    if (!sym) return ''
    if (ex === 'SH') return `1.${sym.padStart(6, '0').slice(-6)}`
    if (ex === 'SZ' || ex === 'BJ') return `0.${sym.padStart(6, '0').slice(-6)}`
    if (ex === 'HK') {
      const hk = sym.replace(/\D/g, '').padStart(5, '0')
      return hk ? `116.${hk}` : ''
    }
    return ''
  }
  return toAshareSecid(code, null)
}

/** 较上季：新增 / 0.45% ↑ / 3.30% ↓ */
function formatWeightChangeUi(weight, weightChange) {
  if (!Number.isFinite(weightChange)) {
    return {text: '', className: 'flat', isNew: false}
  }
  if (
    Number.isFinite(weight) &&
    weight > 0.05 &&
    Math.abs(weightChange - weight) < 0.05
  ) {
    return {text: '新增', className: 'flat', isNew: true}
  }
  if (Math.abs(weightChange) < 0.005) {
    return {text: '0.00%', className: 'flat', isNew: false}
  }
  const abs = Math.abs(weightChange).toFixed(2)
  if (weightChange > 0) {
    return {text: `${abs}% ↑`, className: 'rise', isNew: false}
  }
  return {text: `${abs}% ↓`, className: 'fall', isNew: false}
}

/** 重仓简称 → 主题（板块推断用） */
const HOLDING_NAME_THEME_RULES = [
  [/锂|盐湖|赣锋|天齐|雅化|中矿|永兴材料|西藏矿业|西藏珠峰|天华新能|盛新锂能/, '锂矿'],
  [/创新药|药明|百济|信达|恒瑞|科伦|复星医药|君实|康方/, '创新药'],
  [/茅台|五粮液|泸州老窖|汾酒|洋河|白酒/, '白酒'],
  [/宁德时代|比亚迪|理想|小鹏|蔚来|新能源车/, '汽车'],
  [/隆基|通威|阳光电源|晶澳|光伏/, '光伏'],
  [/三环集团|风华高科|洁美科技|鸿远电子|火炬电子|江海股份|艾华集团|法拉电子|顺络电子|宇阳科技|MLCC/, 'MLCC'],
  [
    /中芯|韦尔|北方华创|中微|拓荆|海光|晶合|晶晨|华海清科|华虹|圣邦|华大九天|中科飞测|澜起|寒武纪|半导体|芯片/,
    '半导体',
  ],
  [/立讯|蓝思|京东方|消费电子/, '电子'],
  [/沪电|深南电路|鹏鼎|生益科技|南亚新材/, 'PCB'],
  [/中际旭创|新易盛|天孚通信|光模块|CPO/, 'CPO'],
  [/苹果|微软|英伟达|谷歌|Alphabet|亚马逊|Meta|AMD|NVIDIA|Apple|Microsoft/i, '美股'],
  [/腾讯|阿里|美团|京东|网易|百度|拼多多|快手|华住/, '中概互联'],
  [/台积电|TSMC|三星/, '半导体'],
  [/中国海洋石油|中海油|石油|原油/, '油气'],
]

async function xiaobeiApiPost(path, code, {allowCodes = [200]} = {}) {
  const padded = String(code || '').padStart(6, '0')
  if (!/^\d{6}$/.test(padded)) return null
  try {
    const res = await axios.post(
      `https://api.xiaobeiyangji.com/yangji-api/api/${path}`,
      {
        code: padded,
        version: '3.8.7.0',
        clientType: 'APP',
      },
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
    // 402：资产配置有数据但重仓明细不全（常见于部分 QDII）
    if (res.status !== 200 || !allowCodes.includes(res.data?.code)) return null
    return res.data?.data ?? null
  } catch {
    return null
  }
}

function mapXiaobeiAllocation(asset = {}) {
  const defs = [
    {key: 'stock', label: '股票', weight: asset.stockNav, change: asset.stockNavChange},
    {key: 'bond', label: '债券', weight: asset.bondNav, change: asset.bondNavChange},
    {key: 'cash', label: '现金', weight: asset.cashNav, change: asset.cashNavChange},
    {key: 'fund', label: '基金', weight: asset.fundNav, change: null},
    {key: 'mm', label: '货基', weight: asset.mmNav, change: null},
    {key: 'warrant', label: '权证', weight: asset.warrantNav, change: null},
    {key: 'other', label: '其他', weight: asset.other, change: asset.otherChange},
  ]
  return defs
    .map((d) => {
      const weight = Number(d.weight)
      if (!Number.isFinite(weight) || Math.abs(weight) < 0.005) return null
      const change = Number(d.change)
      const hasChange = d.change != null && Number.isFinite(change)
      return {
        key: d.key,
        label: d.label,
        weight: roundWeight(weight),
        weightText: `${weight.toFixed(2)}%`,
        change: hasChange ? roundWeight(change) : null,
        changeText: hasChange ? signedPctText(change) : '',
        changeClass: hasChange ? pctTone(change) : 'flat',
      }
    })
    .filter(Boolean)
}

function mapXiaobeiHeavyRow(row, idx) {
  const weight = Number(row?.weight)
  const weightChange = Number(row?.weightChange)
  const changeRatioY = Number(row?.changeRatioY)
  const yPct = Number.isFinite(changeRatioY)
    ? Math.abs(changeRatioY) <= 2
      ? changeRatioY * 100
      : changeRatioY
    : null
  const industry =
    String(row?.levelFourName || row?.levelThreeName || row?.levelTwoName || '').trim() ||
    '--'
  const industryL1 = String(row?.levelOneName || row?.industryLev1?.industryName || '').trim()
  const wchg = formatWeightChangeUi(weight, weightChange)
  const wind = String(row?.stock || row?.sInfoWindcode || '').trim()
  const code = formatHoldingCode(row)
  return {
    rank: idx + 1,
    code,
    wind,
    secid: toSecidFromWind(wind, code),
    name: String(row?.name || row?.sInfoName || code || '').trim(),
    industry,
    industryL1,
    weight: Number.isFinite(weight) ? roundWeight(weight) : null,
    weightText: Number.isFinite(weight) ? `${weight.toFixed(2)}%` : '--',
    weightChange: Number.isFinite(weightChange) ? roundWeight(weightChange) : null,
    weightChangeText: wchg.text,
    weightChangeClass: wchg.className,
    isNew: wchg.isNew,
    // 日涨跌优先由行情补齐；先用近1年作占位
    dayChange: null,
    dayChangeText: '',
    dayChangeClass: 'flat',
    rowTone: '',
    changeRatioY: yPct != null ? roundWeight(yPct) : null,
    changeRatioYText: yPct != null ? signedPctText(yPct) : '',
    changeRatioYClass: yPct != null ? pctTone(yPct) : 'flat',
  }
}

/** 批量补齐重仓股当日涨跌幅（东财 f3） */
async function enrichHoldingsDayChange(holdings) {
  const list = Array.isArray(holdings) ? holdings : []
  const secids = [...new Set(list.map((h) => h.secid).filter(Boolean))]
  if (!secids.length) {
    return list.map((h) => applyDayChangeFallback(h))
  }
  const byKey = new Map()
  try {
    const data = await eastmoneyQuoteGet('/api/qt/ulist.np/get', {
      fltt: 2,
      secids: secids.join(','),
      fields: 'f2,f3,f12,f13,f14',
    })
    const rows = Array.isArray(data?.data?.diff) ? data.data.diff : []
    for (const r of rows) {
      const code = String(r?.f12 || '').trim()
      const pct = Number(r?.f3)
      if (!code || !Number.isFinite(pct)) continue
      byKey.set(code, pct)
      const mkt = Number(r?.f13)
      if (mkt === 0 || mkt === 1 || mkt === 116) {
        byKey.set(`${mkt}.${code}`, pct)
      }
    }
  } catch {
    // 行情失败时留空
  }
  return list.map((h) => {
    const pct = byKey.get(String(h.secid || '')) ?? byKey.get(String(h.code || ''))
    if (pct == null || !Number.isFinite(Number(pct))) {
      return applyDayChangeFallback(h)
    }
    const dayChange = roundWeight(Number(pct))
    const tone = pctTone(dayChange)
    return {
      ...h,
      dayChange,
      dayChangeText: signedPctText(dayChange),
      dayChangeClass: tone,
      rowTone: tone === 'rise' ? 'row-rise' : tone === 'fall' ? 'row-fall' : '',
    }
  })
}

function applyDayChangeFallback(h) {
  // 无当日行情时不展示近1年冒充涨跌幅，避免口径混淆
  return {
    ...h,
    dayChange: null,
    dayChangeText: '--',
    dayChangeClass: 'flat',
    rowTone: '',
  }
}

function summarizeHoldingsWeight(holdings) {
  const total = (holdings || []).reduce((s, h) => {
    const w = Number(h?.weight)
    return Number.isFinite(w) ? s + w : s
  }, 0)
  if (!(total > 0)) {
    return {totalWeight: null, totalWeightText: ''}
  }
  const totalWeight = roundWeight(total)
  return {
    totalWeight,
    totalWeightText: `${totalWeight.toFixed(2)}%`,
  }
}

async function fetchXiaobeiHoldingsBundle(code) {
  const [heavy, asset] = await Promise.all([
    xiaobeiApiPost('get-fund-heavy-stock', code),
    // 402：仅有资产配置/报告期，无重仓明细
    xiaobeiApiPost('get-fund-stock', code, {allowCodes: [200, 402]}),
  ])
  const rows = Array.isArray(heavy?.data) ? heavy.data : []
  const mapped = rows
    .filter((r) => Number(r?.weight) > 0)
    .sort((a, b) => Number(b.weight) - Number(a.weight))
    .slice(0, 10)
    .map((r, idx) => mapXiaobeiHeavyRow(r, idx))
  const holdings = await enrichHoldingsDayChange(mapped)
  const {totalWeight, totalWeightText} = summarizeHoldingsWeight(holdings)

  const changeYearHS = Number(heavy?.changeYearHS)
  const yoyPct = Number.isFinite(changeYearHS)
    ? Math.abs(changeYearHS) <= 2
      ? changeYearHS * 100
      : changeYearHS
    : null

  const reportDate = String(asset?.reportDate || '').trim()
  const year = Number.isFinite(Number(asset?.year)) ? Number(asset.year) : null
  const quarter = Number.isFinite(Number(asset?.quarter)) ? Number(asset.quarter) : null

  return {
    holdings,
    allocation: mapXiaobeiAllocation(asset || {}),
    reportDate,
    reportText: formatReportText(reportDate, year, quarter),
    reportQuarterText: formatReportQuarterText(reportDate, year, quarter),
    year,
    quarter,
    totalWeight,
    totalWeightText,
    stockNum: Number.isFinite(Number(heavy?.stockNum))
      ? Number(heavy.stockNum)
      : holdings.length || null,
    changeYearHS: yoyPct != null ? roundWeight(yoyPct) : null,
    changeYearHSText: yoyPct != null ? signedPctText(yoyPct) : '',
    changeYearHSClass: yoyPct != null ? pctTone(yoyPct) : 'flat',
    source: holdings.length || (asset && Object.keys(asset).length) ? 'xiaobei' : '',
  }
}

/** 东财 PCTNVCHGTYPE / PCTNVCHG → 较上季文案 */
function formatEastmoneyWeightChange(row, weight) {
  const type = String(row?.PCTNVCHGTYPE || '').trim()
  if (type === '新增') {
    const ui = formatWeightChangeUi(weight, weight)
    return {
      ...ui,
      value: Number.isFinite(weight) ? roundWeight(weight) : null,
    }
  }
  const chg = Number.parseFloat(row?.PCTNVCHG)
  if (!Number.isFinite(chg)) {
    return {text: '', className: 'flat', isNew: false, value: null}
  }
  const ui = formatWeightChangeUi(weight, chg)
  return {...ui, value: roundWeight(chg)}
}

/** 小倍无重仓明细时回退东财（含 PCTNVCHG 较上季变化） */
async function fetchEastmoneyHoldingsFallback(code, meta = {}) {
  const {stocks, etfName, etfCode} = await fetchFundHoldings(code)
  const mapped = filterWeightedHoldings(stocks)
    .slice(0, 10)
    .map((s, idx) => {
      const weight = Number.parseFloat(s.JZBL)
      const industry =
        s.INDEXNAME && s.INDEXNAME !== '--' ? String(s.INDEXNAME).trim() : '--'
      const stockCode = String(s.GPDM || '').trim()
      const wchg = formatEastmoneyWeightChange(s, weight)
      return {
        rank: idx + 1,
        code: stockCode,
        wind: '',
        secid: toHoldingSecid(stockCode, s.NEWTEXCH),
        name: String(s.GPJC || s.GPNAME || s.GPDM || '').trim(),
        industry,
        industryL1: '',
        weight: Number.isFinite(weight) ? roundWeight(weight) : null,
        weightText: Number.isFinite(weight) ? `${weight.toFixed(2)}%` : '--',
        weightChange: wchg.value,
        weightChangeText: wchg.text,
        weightChangeClass: wchg.className,
        isNew: wchg.isNew,
        dayChange: null,
        dayChangeText: '',
        dayChangeClass: 'flat',
        rowTone: '',
        changeRatioY: null,
        changeRatioYText: '',
        changeRatioYClass: 'flat',
      }
    })
  const holdings = await enrichHoldingsDayChange(mapped)
  const {totalWeight, totalWeightText} = summarizeHoldingsWeight(holdings)
  const reportDate = String(meta.reportDate || '').trim()
  const year = Number.isFinite(Number(meta.year)) ? Number(meta.year) : null
  const quarter = Number.isFinite(Number(meta.quarter)) ? Number(meta.quarter) : null
  return {
    holdings,
    allocation: Array.isArray(meta.allocation) ? meta.allocation : [],
    reportDate,
    reportText: formatReportText(reportDate, year, quarter),
    reportQuarterText: formatReportQuarterText(reportDate, year, quarter),
    year,
    quarter,
    totalWeight,
    totalWeightText,
    stockNum: holdings.length || null,
    changeYearHS: null,
    changeYearHSText: '',
    changeYearHSClass: 'flat',
    etfCode: etfCode || '',
    etfName: etfName || '',
    source: holdings.length ? 'eastmoney' : '',
  }
}

/**
 * 前十大持仓：优先小倍 get-fund-heavy-stock + get-fund-stock，
 * 失败再回退东财 FundMNInverstPosition（QDII/美股常见）。
 */
export async function getFundTopHoldings(code) {
  const padded = String(code || '').padStart(6, '0')
  let bundle = await fetchXiaobeiHoldingsBundle(padded)
  if (!bundle.holdings.length) {
    bundle = await fetchEastmoneyHoldingsFallback(padded, {
      reportDate: bundle.reportDate,
      year: bundle.year,
      quarter: bundle.quarter,
      allocation: bundle.allocation,
    })
  }
  return {
    code: padded,
    ...bundle,
  }
}

/**
 * 东财重仓股概念（f129）占比加权，并统计支持持仓数。
 * @returns {Map<string, {weight: number, support: number}>}
 */
async function collectHoldingConceptVotes(stocks = []) {
  const top = filterUsableHoldings(stocks).slice(0, 10)
  const votes = new Map()
  if (!top.length) return votes

  await Promise.all(
    top.map(async (s) => {
      const secid = toAshareSecid(s.GPDM, s.NEWTEXCH)
      if (!secid) return
      const weight = Number.parseFloat(s.JZBL)
      if (!(weight > 0)) return
      try {
        const data = await eastmoneyQuoteGet('/api/qt/stock/get', {
          secid,
          fields: 'f129',
        })
        const raw = data?.data?.f129
        if (raw == null || raw === '' || raw === '-' || raw === '--') return
        const seen = new Set()
        for (const part of String(raw).split(/[,，]/)) {
          const tag = canonicalizeTag(part)
          if (!tag || seen.has(tag)) continue
          seen.add(tag)
          if (!isUsableSectorTag(tag) || isNoisyConceptTag(tag)) continue
          if (COARSE_SECTORS.has(tag)) continue
          const cur = votes.get(tag) || {weight: 0, support: 0}
          cur.weight += weight
          cur.support += 1
          votes.set(tag, cur)
        }
      } catch {
        // 单票失败忽略
      }
    }),
  )
  return votes
}

/**
 * 重仓简称关键词 → 主题。
 * 按单票持仓计支持度，避免一只卫星仓（如中际旭创）带出 CPO。
 * @returns {Map<string, {weight: number, support: number}>}
 */
function collectHoldingNameThemes(stocks = []) {
  const votes = new Map()
  for (const s of filterWeightedHoldings(stocks).slice(0, 10)) {
    const text = `${s.GPJC || ''} ${s.GPNAME || ''}`
    const weight = Number.parseFloat(s.JZBL) || 0
    if (!(weight > 0)) continue
    for (const [re, label] of HOLDING_NAME_THEME_RULES) {
      if (!re.test(text)) continue
      const tag = canonicalizeTag(label)
      if (!tag) continue
      const cur = votes.get(tag) || {weight: 0, support: 0}
      cur.weight += weight
      cur.support += 1
      votes.set(tag, cur)
    }
  }
  return votes
}

function bumpScore(scoreMap, tag, delta) {
  const key = canonicalizeTag(tag)
  if (!key || !isUsableSectorTag(key) || isNoisyConceptTag(key)) return
  scoreMap.set(key, (scoreMap.get(key) || 0) + delta)
}

/** 均衡/泛成长命名：不宜强贴多个热门题材 */
function isBalancedFundName(fundName = '') {
  return /精选|蓝筹|成长混合|趋势|合润|天惠|新兴成长|优质精选|新成长|灵活配置|均衡/.test(
    String(fundName),
  )
}

/**
 * 同簇收敛后输出 1~3 个标签：
 * - 名称含「新能源」等宽主题时，父标签优先，并可附带细分
 * - 均衡型主动基金默认只留 1 个主标签
 */
function resolveSmartSectors(scoreMap, {fundName = '', balanced = false} = {}) {
  if (!scoreMap.size) return []

  const clusterBest = new Map()
  for (const [tag, rawScore] of scoreMap.entries()) {
    if (COARSE_SECTORS.has(tag) && scoreMap.size > 1) continue
    let score = rawScore
    if (GENERIC_TAG_PENALTY.has(tag)) score *= 0.35
    const meta = getTagMeta(tag)
    score += meta.specificity * 0.12
    const prev = clusterBest.get(meta.cluster)
    if (
      !prev ||
      score > prev.score ||
      (score === prev.score && meta.specificity > prev.specificity)
    ) {
      clusterBest.set(meta.cluster, {
        tag,
        score,
        specificity: meta.specificity,
        cluster: meta.cluster,
      })
    }
  }

  const ranked = [...clusterBest.values()].sort(
    (a, b) => b.score - a.score || b.specificity - a.specificity,
  )
  if (!ranked.length) return []

  const wantsNewEnergy = /新能源|新材料/.test(fundName)
  const wantsConsumer = /消费/.test(fundName)
  const wantsEco = /环保/.test(fundName)
  const electronicsPrimary = ['电子', '芯片', '半导体', '科技'].some((t) => scoreMap.has(t))
  // 均衡型默认 1 个；有 MLCC 证据时可带 2 个（主线 + MLCC）
  let maxTags = balanced && !wantsNewEnergy && !wantsConsumer && !wantsEco ? 1 : 3
  if (balanced && scoreMap.has('MLCC')) maxTags = Math.max(maxTags, 2)
  if (electronicsPrimary && scoreMap.has('MLCC')) maxTags = Math.max(maxTags, 2)
  const out = []
  const used = new Set()

  const pushTag = (tag) => {
    if (!tag || out.includes(tag) || out.length >= maxTags) return
    const cluster = getTagMeta(tag).cluster
    if (used.has(cluster)) return
    out.push(tag)
    used.add(cluster)
  }

  if (wantsNewEnergy) {
    if (scoreMap.has('新能源') || ranked.some((r) => NEW_ENERGY_CLUSTERS.has(r.cluster))) {
      pushTag('新能源')
    }
  }
  if (wantsConsumer && (scoreMap.has('消费') || scoreMap.has('主要消费') || scoreMap.has('白酒'))) {
    pushTag(scoreMap.has('主要消费') ? '主要消费' : '消费')
  }
  if (wantsEco && scoreMap.has('环保')) pushTag('环保')

  // 均衡型：只取最强一簇（MLCC 可额外附带）
  if (maxTags === 1) {
    if (!out.length) pushTag(ranked[0].tag)
    return out.slice(0, 1)
  }
  if (balanced && maxTags === 2) {
    if (!out.length) pushTag(ranked[0].tag)
    if (scoreMap.has('MLCC')) pushTag('MLCC')
    return out.slice(0, 2)
  }

  const topScore = ranked[0].score
  const scoreSum = ranked.reduce((s, r) => s + r.score, 0) || 1
  const concentrated = topScore / scoreSum >= 0.45

  for (const item of ranked) {
    if (out.length >= maxTags) break
    if (out.includes('新能源') && NEW_ENERGY_CLUSTERS.has(item.cluster) && item.tag !== '新能源') {
      const alreadySub = out.some(
        (t) => t !== '新能源' && NEW_ENERGY_CLUSTERS.has(getTagMeta(t).cluster),
      )
      if (!alreadySub) {
        out.push(item.tag)
        used.add(item.cluster)
      }
      continue
    }
    if (
      (out.includes('消费') || out.includes('主要消费')) &&
      item.tag === '白酒' &&
      !out.includes('白酒')
    ) {
      out.push('白酒')
      continue
    }
    if (out.includes('消费') && item.cluster === '消费' && item.tag !== '消费') continue
    if (!out.length) {
      pushTag(item.tag)
      continue
    }
    // 分散持仓时提高并列门槛，避免乱贴 2~3 个热门题材
    const threshold = concentrated ? 0.55 : 0.78
    if (item.score >= topScore * threshold) pushTag(item.tag)
  }

  if (!out.length) pushTag(ranked[0].tag)

  // 电子产业链主标签可并列附带 MLCC
  if (
    scoreMap.has('MLCC') &&
    !out.includes('MLCC') &&
    out.some((t) => ['电子', '芯片', '半导体', '科技'].includes(t))
  ) {
    if (out.length < maxTags) out.push('MLCC')
    else if (maxTags >= 2) out[out.length - 1] = 'MLCC'
  }
  // PCB / CPO 常共存于科技成长持仓，允许并列
  if (scoreMap.has('CPO') && !out.includes('CPO') && out.some((t) => ['PCB', '电子'].includes(t))) {
    if (out.length < maxTags) out.push('CPO')
  }
  if (scoreMap.has('PCB') && !out.includes('PCB') && out.includes('CPO') && out.length < maxTags) {
    out.push('PCB')
  }

  return out
}

/** 小倍关联板块内存缓存，避免行情轮询反复打接口；展示仍以拉取结果为准，不读客户端 localStorage */
const XIAOBEI_SECTOR_TTL_MS = 3 * 24 * 60 * 60 * 1000
const xiaobeiSectorCache = new Map()

/**
 * 小倍养基关联板块（无需登录）。
 * POST /yangji-api/api/get-fund-detail-v310 → relatedIndustryV2[].themeName
 * @returns {string[]} 小倍返回的全部可用标签；失败或无数据返回 []
 */
async function fetchXiaobeiSectors(code) {
  const padded = String(code || '').padStart(6, '0')
  const hit = xiaobeiSectorCache.get(padded)
  if (hit && Date.now() - hit.at < XIAOBEI_SECTOR_TTL_MS) {
    return hit.tags.slice()
  }

  const data = await xiaobeiApiPost('get-fund-detail-v310', code)
  if (!data) return []
  const rows = Array.isArray(data.relatedIndustryV2)
    ? data.relatedIndustryV2
    : Array.isArray(data.relatedIndustry)
      ? data.relatedIndustry
      : []
  if (!rows.length) return []
  const tags = []
  const seen = new Set()
  for (const row of rows) {
    const tag = String(row?.themeName || '').trim()
    // 小倍侧已运营精选，只去掉空/占位，保留「通信技术」等其词表
    if (!tag || tag === '--' || tag === '-' || seen.has(tag)) continue
    if (tag.length > 16) continue
    seen.add(tag)
    tags.push(tag)
  }
  xiaobeiSectorCache.set(padded, {at: Date.now(), tags})
  return tags.slice()
}

/**
 * 板块标签：优先小倍养基关联板块；失败再走本地多信号打分。
 */
export async function fetchFundSectors(code, nameHint = '') {
  const xiaobei = await fetchXiaobeiSectors(code)
  if (xiaobei.length) return xiaobei

  let basic = null
  try {
    basic = await fetchFundBasicInfo(code)
  } catch {
    basic = null
  }

  const shortName = nameHint || basic?.SHORTNAME || ''
  const indexName = basic?.INDEXNAME && basic.INDEXNAME !== '--' ? basic.INDEXNAME : ''
  const ftype = basic?.FTYPE && basic.FTYPE !== '--' ? basic.FTYPE : ''
  const etfLikeHint =
    /ETF|联接/.test(`${shortName} ${ftype}`) ||
    (/指数/.test(`${shortName} ${ftype}`) && !!indexName)
  const {stocks, etfName, etfCode} = await fetchFundHoldings(code, {
    preferEtf: etfLikeHint,
  })
  const etfLike = isEtfLikeFund({shortName, indexName, ftype, etfCode})

  const scores = new Map()
  const indexTags = themeFromIndexName(indexName)
  // 联接基金 INDEXNAME 常空，用基金名补一层
  const fromFundNameIndex = themeFromIndexName(shortName)
  const nameIndexTags =
    !indexTags.length && etfLike
      ? fromFundNameIndex.length
        ? fromFundNameIndex
        : inferSpecificThemesFromText(shortName)
      : []
  const primaryIndexTags = indexTags.length ? indexTags : nameIndexTags.slice(0, 1)
  const balanced = isBalancedFundName(shortName)

  // 1) 跟踪指数名（ETF/联接高权重，避免被成分股热点完全带偏）
  for (const tag of primaryIndexTags) {
    bumpScore(scores, tag, etfLike ? 110 : 90)
  }

  // 2) 基金名 / 指数名关键词（宽主题额外加权）
  for (const tag of inferSpecificThemesFromText(`${shortName} ${indexName} ${ftype}`)) {
    let points = 70
    if (tag === '新能源' && /新能源|新材料/.test(shortName)) points += 80
    if ((tag === '消费' || tag === '主要消费') && /消费/.test(shortName)) points += 60
    if (tag === '环保' && /环保/.test(shortName)) points += 90
    if (tag === '电子' && /电子/.test(`${shortName} ${indexName}`)) points += 40
    if (tag === '芯片' && /芯片/.test(`${shortName} ${indexName}`)) points += 40
    if (tag === '半导体' && /半导体/.test(`${shortName} ${indexName}`)) points += 40
    // ETF 已有指数主标签时，跳过过宽的「科技」以免抢位
    if (etfLike && tag === '科技' && primaryIndexTags.length) continue
    bumpScore(scores, tag, points)
  }

  // 3) 重仓股概念（需足够支持度；均衡型更严）
  const conceptVotes = await collectHoldingConceptVotes(stocks)
  // 纯度分母用全部重仓（含港股），避免只剩 A 股白酒把纯度抬爆
  const weighted = filterWeightedHoldings(stocks).slice(0, 10)
  const totalHoldWeight = weighted.reduce(
    (sum, s) => sum + (Number.parseFloat(s.JZBL) || 0),
    0,
  )
  const leader = weighted[0]

  const nicheTags = new Set(['白酒', 'CPO', '锂矿', '汽车', '光纤', '中概互联', '美股', '油气'])
  // 均衡成长：名称未点明则不贴纯 AI 概念（半导体/MLCC 由持仓纯度说话）
  const holdingNeedsNameConfirm = new Map([
    [/人工智能|算力|\bAI\b/, new Set(['人工智能', '算力'])],
  ])
  const leaderVotes = leader ? collectHoldingNameThemes([leader]) : new Map()
  const electronicsTheme = ['电子', '芯片', '半导体', '科技'].some(
    (t) =>
      scores.has(t) ||
      primaryIndexTags.includes(t) ||
      /电子|芯片|半导体|科技|高端制造/.test(shortName),
  )

  function blockedByMissingNameConfirm(tag) {
    if (!balanced) return false
    for (const [nameRe, tags] of holdingNeedsNameConfirm) {
      if (tags.has(tag) && !nameRe.test(shortName)) return true
    }
    return false
  }

  for (const [tag, {weight, support}] of conceptVotes.entries()) {
    const purity = totalHoldWeight > 0 ? weight / totalHoldWeight : 0
    const specific = (getTagMeta(tag).specificity || 50) >= 90
    const minPurity = balanced || nicheTags.has(tag) ? 0.3 : 0.18
    // MLCC：单票高仓位也可（如三环重仓）
    const mlccOk = tag === 'MLCC' && (support >= 2 || weight >= 7 || (support >= 1 && weight >= 5))
    if (tag === 'MLCC' && !mlccOk) continue
    // 双持仓且合计够重：视为有效题材（避免 CPO 双龙头被 3 票门槛误杀）
    const strongPair = support >= 2 && weight >= 15
    if (tag !== 'MLCC') {
      if (specific && support < 2 && purity < minPurity) continue
      if (support < 2 && weight < 15) continue
      if (!strongPair && (balanced || nicheTags.has(tag)) && support < 3 && purity < 0.32) {
        if (!leaderVotes.has(tag)) continue
      }
    }
    // 均衡型：未知东财概念直接丢弃；窄题材不足半仓不贴
    if (balanced && !TAG_META[tag]) continue
    if (balanced && nicheTags.has(tag) && purity < 0.5) continue
    if (blockedByMissingNameConfirm(tag)) continue
    // ETF/联接：指数主标签之外，成分股只允许附带 MLCC
    if (etfLike && primaryIndexTags.length && tag !== 'MLCC' && !primaryIndexTags.includes(tag)) {
      continue
    }
    let points = weight * 1.0
    if (purity >= 0.7) points += 25
    if (tag === 'MLCC') points += 20
    bumpScore(scores, tag, points)
  }

  // 4) 重仓简称关键词 + 头号重仓加权
  const nameVotes = collectHoldingNameThemes(stocks)
  for (const [tag, {weight, support}] of nameVotes.entries()) {
    const purity = totalHoldWeight > 0 ? weight / totalHoldWeight : 0
    const minPurity = balanced || nicheTags.has(tag) ? 0.3 : 0.18
    const leaderHit = leaderVotes.has(tag)
    const mlccOk = tag === 'MLCC' && (support >= 2 || weight >= 7 || leaderHit || weight >= 5)
    const strongPair = support >= 2 && weight >= 15
    if (tag === 'MLCC') {
      if (!mlccOk) continue
    } else {
      if (etfLike && primaryIndexTags.length && !primaryIndexTags.includes(tag)) continue
      if (support < 2 && purity < minPurity && !leaderHit) continue
      if (
        !strongPair &&
        (balanced || nicheTags.has(tag)) &&
        support < 3 &&
        purity < 0.32 &&
        !leaderHit
      ) {
        continue
      }
      if (balanced && nicheTags.has(tag) && purity < 0.5) continue
    }
    if (blockedByMissingNameConfirm(tag)) continue
    let points = 50 + Math.min(weight, 40)
    if (leaderHit) points += 45
    if (tag === 'MLCC') points += 25
    bumpScore(scores, tag, points)
  }

  // 电子/芯片/半导体链：有 MLCC 持仓证据，或指数型电子链基金附带近期热门 MLCC
  const mlccEvidence = (nameVotes.get('MLCC')?.weight || 0) > 0 || (conceptVotes.get('MLCC')?.weight || 0) > 0
  if (electronicsTheme && !scores.has('MLCC') && (mlccEvidence || etfLike)) {
    bumpScore(scores, 'MLCC', mlccEvidence ? 60 : 55)
  }

  // 5) 粗行业仅在完全无候选时兜底（均衡型跳过，避免食品饮料等误导）
  if (!scores.size && basic && !balanced) {
    if (isUsableSectorTag(basic.TTYPENAME)) bumpScore(scores, basic.TTYPENAME, 5)
    for (const item of basic.FUNDSUBJECTLIST || []) {
      if (isUsableSectorTag(item?.TTYPENAME)) bumpScore(scores, item.TTYPENAME, 4)
    }
  }

  const resolved = resolveSmartSectors(scores, {fundName: shortName, balanced})
  if (resolved.length) return resolved

  // 均衡型无清晰主题时宁可不贴
  if (balanced) return []

  const fallback = []
  if (basic?.TTYPENAME) fallback.push(basic.TTYPENAME)
  return finalizeThemes(fallback.filter(isUsableSectorTag))
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
  '1m': 40,
  '3m': 100,
  '6m': 200,
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
 * @param {'1m'|'3m'|'6m'|'1y'|'3y'|'since'} range
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
  } else if (key === '6m') {
    desc = await fetchFundNavHistory(padded, 200, 1)
  } else if (key === '1m') {
    desc = await fetchFundNavHistory(padded, 40, 1)
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

/**
 * 阶段统计缓存：净值多为日更，无需分钟级刷新。
 * 12h 覆盖同日多次进详情，隔日会自然过期重算。
 */
const STAGE_STATS_TTL_MS = 12 * 60 * 60 * 1000
const stageStatsCache = new Map()

function pctFromNav(startNav, endNav) {
  const a = Number(startNav)
  const b = Number(endNav)
  if (!(a > 0) || !Number.isFinite(b)) return null
  return round4(((b - a) / a) * 100)
}

function formatStatPct(v) {
  if (v == null || !Number.isFinite(Number(v))) {
    return {percent: null, percentText: '--', percentClass: 'flat'}
  }
  const percent = roundWeight(Number(v))
  return {
    percent,
    percentText: signedPctText(percent),
    percentClass: pctTone(percent),
  }
}

function findNavIndexOnOrAfter(asc, dateStr) {
  for (let i = 0; i < asc.length; i++) {
    if (asc[i].date >= dateStr) return i
  }
  return -1
}

function calendarDateOffset(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yearStartDate() {
  const d = new Date()
  return `${d.getFullYear()}-01-01`
}

function sliceReturn(asc, fromDate) {
  if (!asc.length) return null
  const end = asc[asc.length - 1]
  let i = findNavIndexOnOrAfter(asc, fromDate)
  if (i < 0) i = 0
  // 用区间起点前一个点作基准更贴近「近N月」口径
  const baseIdx = i > 0 ? i - 1 : i
  return pctFromNav(asc[baseIdx].netValue, end.netValue)
}

function maxDrawdownPct(asc, fromDate = null) {
  if (!asc.length) return null
  let start = 0
  if (fromDate) {
    start = findNavIndexOnOrAfter(asc, fromDate)
    if (start < 0) start = 0
  }
  let peak = -Infinity
  let maxDd = 0
  let saw = false
  for (let i = start; i < asc.length; i++) {
    const v = Number(asc[i].netValue)
    if (!Number.isFinite(v) || v <= 0) continue
    saw = true
    if (v > peak) peak = v
    if (peak > 0) {
      const dd = ((v - peak) / peak) * 100
      if (dd < maxDd) maxDd = dd
    }
  }
  if (!saw) return null
  return round4(maxDd)
}

function buildPeriodRows(asc, defs) {
  return defs.map((d) => {
    const from =
      d.days != null
        ? calendarDateOffset(d.days)
        : d.from === 'ytd'
          ? yearStartDate()
          : d.from === 'since'
            ? asc[0]?.date
            : d.from
    const pct = d.mode === 'drawdown' ? maxDrawdownPct(asc, from) : sliceReturn(asc, from)
    return {
      key: d.key,
      label: d.label,
      ...formatStatPct(pct),
    }
  })
}

/** 按日历桶切段收益：上期末净值 → 本期末净值（升序算、降序展示） */
function buildCalendarReturns(asc, kind) {
  if (!asc.length) return []
  const buckets = new Map()
  for (const p of asc) {
    const [y, m] = p.date.split('-').map(Number)
    let key
    let label
    let order
    if (kind === 'month') {
      key = `${y}-${String(m).padStart(2, '0')}`
      label = key
      order = y * 100 + m
    } else if (kind === 'quarter') {
      const q = Math.ceil(m / 3)
      key = `${y}-Q${q}`
      label = `${y}第${q}季度`
      order = y * 10 + q
    } else if (kind === 'semi') {
      const half = m <= 6 ? 1 : 2
      key = `${y}-H${half}`
      label = `${y}${half === 1 ? '上半年' : '下半年'}`
      order = y * 10 + half
    } else {
      key = String(y)
      label = String(y)
      order = y
    }
    let b = buckets.get(key)
    if (!b) {
      b = {key, label, order, last: p}
      buckets.set(key, b)
    } else {
      b.last = p
    }
  }
  const chrono = [...buckets.values()].sort((a, b) => a.order - b.order)
  const rows = []
  for (let i = 0; i < chrono.length; i++) {
    const cur = chrono[i]
    const baseNav = i > 0 ? chrono[i - 1].last.netValue : null
    // 首个桶：桶内首末；其后：上期末 → 本期末
    const startNav =
      baseNav != null
        ? baseNav
        : (() => {
            const firstInBucket = asc.find((p) => {
              const [y, m] = p.date.split('-').map(Number)
              if (kind === 'month') return `${y}-${String(m).padStart(2, '0')}` === cur.key
              if (kind === 'quarter') return `${y}-Q${Math.ceil(m / 3)}` === cur.key
              if (kind === 'semi') return `${y}-H${m <= 6 ? 1 : 2}` === cur.key
              return String(y) === cur.key
            })
            return firstInBucket?.netValue
          })()
    rows.push({
      key: cur.key,
      label: cur.label,
      order: cur.order,
      ...formatStatPct(pctFromNav(startNav, cur.last.netValue)),
    })
  }
  return rows.sort((a, b) => b.order - a.order).map(({order, ...rest}) => rest)
}

/**
 * 详情页「历史净值 / 阶段涨幅 / 阶段回撤」：
 * 一次拉全量净值，服务端算好各表，前端只做 Tab 切换与分页展示。
 */
export async function getFundStageStats(code) {
  const padded = String(code || '').padStart(6, '0')
  const hit = stageStatsCache.get(padded)
  if (hit && Date.now() - hit.at < STAGE_STATS_TTL_MS) {
    return hit.data
  }

  const desc = await fetchFundNavHistoryPaged(padded, {
    pageSize: 10000,
    maxPages: 2,
  })
  if (!desc.length) throw new Error(`暂无基金 ${padded} 历史净值`)

  const asc = [...desc].reverse()
  const navHistory = desc.map((p) => {
    const dayChange =
      p.dayGrowth != null && Number.isFinite(Number(p.dayGrowth))
        ? roundWeight(Number(p.dayGrowth))
        : null
    return {
      date: p.date,
      dateLabel: p.date.length >= 10 ? p.date.slice(5, 10) : p.date,
      dayChange,
      dayChangeText: dayChange != null ? signedPctText(dayChange) : '--',
      dayChangeClass: dayChange != null ? pctTone(dayChange) : 'flat',
    }
  })

  const periodReturns = buildPeriodRows(asc, [
    {key: '1m', label: '近1月', days: 30},
    {key: '3m', label: '近3月', days: 90},
    {key: '6m', label: '近6月', days: 180},
    {key: '1y', label: '近1年', days: 365},
    {key: '3y', label: '近3年', days: 365 * 3},
  ])

  const drawdowns = buildPeriodRows(asc, [
    {key: '3m', label: '近3月', days: 90, mode: 'drawdown'},
    {key: '6m', label: '近6月', days: 180, mode: 'drawdown'},
    {key: '1y', label: '近1年', days: 365, mode: 'drawdown'},
    {key: '3y', label: '近3年', days: 365 * 3, mode: 'drawdown'},
    {key: 'ytd', label: '今年以来', from: 'ytd', mode: 'drawdown'},
    {key: 'since', label: '成立以来', from: 'since', mode: 'drawdown'},
  ])

  const data = {
    code: padded,
    navHistory,
    periodReturns,
    monthlyReturns: buildCalendarReturns(asc, 'month'),
    quarterlyReturns: buildCalendarReturns(asc, 'quarter'),
    semiAnnualReturns: buildCalendarReturns(asc, 'semi'),
    annualReturns: buildCalendarReturns(asc, 'year'),
    drawdowns,
  }
  stageStatsCache.set(padded, {at: Date.now(), data})
  return data
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

  // 板块标签每次行情请求实时拉取（小倍优先），不再沿用客户端 localStorage 缓存
  let sectors = []
  try {
    const next = await fetchFundSectorsQueued(code, name)
    if (next.length) sectors = next
    else if (Array.isArray(fund.sectors) && fund.sectors.length) {
      sectors = [...fund.sectors]
    }
  } catch {
    sectors = Array.isArray(fund.sectors) ? [...fund.sectors] : []
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
