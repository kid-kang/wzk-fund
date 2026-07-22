import axios from 'axios'
import {calcHoldings, mergeWatchlist} from '@/lib/holdingsCalc'
import {
  getSettings as getLocalSettings,
  importLocalConfig,
  listFunds,
  loadConfig,
  patchFunds,
  removeFund as removeLocalFund,
  updateFund as updateLocalFund,
  updateGold as updateLocalGold,
  updateSettings as updateLocalSettings,
  upsertFund as upsertLocalFund,
} from '@/lib/portfolioStore'

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
})

// 避免浏览器/代理缓存 GET 行情，导致大盘等看起来「不跟着刷新」
api.interceptors.request.use((config) => {
  if ((config.method || 'get').toLowerCase() === 'get') {
    config.params = {...(config.params || {}), _t: Date.now()}
  }
  return config
})

export type FundRecord = {
  code: string
  name: string
  fundKey?: string
  type: 'hold' | 'watch'
  amount: number
  /** 持仓金额已计入的净值确认日（晚间确认后自动滚动） */
  amountAsOf?: string
  shares: number
  sectors: string[]
  createdAt?: string
  updatedAt?: string
}

export type FundQuoteRow = FundRecord & {
  percent: number | null
  percentSource?: 'estimate' | 'confirmed' | null
  estimateGrowth?: number | null
  dayGrowth?: number | null
  netValueDate?: string
  netValue?: number | null
  /** 估值净值（盘中实时收益用） */
  estimateNetValue?: number | null
  /** 上一确认净值（金钱计算基准） */
  prevNetValue?: number | null
  time?: string | null
  trend: {time: string; growth: number | null; netValue?: number | null}[]
  liveAmount?: number
  pnl?: number
  weight?: number
  /** 晚间官方确认涨跌后展示，下一交易日开盘清除 */
  confirmedUpdated?: boolean
}

export type HoldingsPayload = {
  summary: {
    totalAmount: number
    /** 开盘前确认市值（算当日收益率用） */
    bodTotal?: number
    totalPnl: number
    totalPnlPercent: number
  }
  list: FundQuoteRow[]
}

export type IndexItem = {
  code: string
  name: string
  percent: number | null
}

export type SectorItem = {
  code: string
  name: string
  percent: number | null
}

export type MarketOverview = {
  upDown: {up: number; down: number; flat: number; time: string | null}
  topGainers: SectorItem[]
  topLosers: SectorItem[]
}

export type GoldPayload = {
  code: string
  name: string
  price: number | null
  prevClose?: number | null
  percent: number | null
  change: number | null
  time: string
  holding: number
  avgPrice: number
  pnl: number | null
  pnlPercent: number | null
  costPnl?: number | null
  costPnlPercent?: number | null
  show?: boolean
  trend: {time: string; price: number; percent: number | null}[]
}

export type AppSettings = {
  showGold: boolean
}

export type AppConfig = {
  settings: AppSettings
  funds: Record<string, FundRecord>
  gold: {holding: number; avgPrice: number}
}

function assertOk<T extends {success?: boolean; message?: string}>(data: T): T {
  if (data && data.success === false) {
    throw new Error(data.message || '请求失败')
  }
  return data
}

export async function fetchHoldings() {
  const funds = listFunds('hold')
  const {data} = await api.post<{
    success: boolean
    message?: string
    data: {quotes: FundQuoteRow[]; funds: FundRecord[]}
  }>('/funds/quotes', {type: 'hold', funds})
  assertOk(data)
  const result = calcHoldings(funds, data.data.quotes || [])
  if (result.persistPatches.length) {
    patchFunds(result.persistPatches)
  }
  return {summary: result.summary, list: result.list}
}

export async function fetchWatchlist() {
  const funds = listFunds('watch')
  const {data} = await api.post<{
    success: boolean
    message?: string
    data: {quotes: FundQuoteRow[]}
  }>('/funds/quotes', {type: 'watch', funds})
  assertOk(data)
  const {list, persistPatches} = mergeWatchlist(funds, data.data.quotes || [])
  if (persistPatches.length) patchFunds(persistPatches)
  return list
}

export type IndexHistoryRange = '1m' | '3m' | '6m' | '1y' | '3y'

export type IndexHistoryPayload = {
  code: string
  name: string
  range: IndexHistoryRange
  periodPercent: number | null
  points: {date: string; close: number; percent: number | null}[]
}

export type FundHistoryRange = '3m' | '1y' | '3y' | 'since'

export type FundHistoryPayload = {
  code: string
  range: FundHistoryRange
  periodPercent: number | null
  points: {date: string; netValue: number; percent: number | null}[]
}

export async function fetchIndices() {
  const {data} = await api.get<{success: boolean; data: IndexItem[]}>('/indices')
  return data.data
}

export async function fetchIndexHistory(code: string, range: IndexHistoryRange = '1m') {
  const {data} = await api.get<{success: boolean; data: IndexHistoryPayload}>(
    `/indices/${encodeURIComponent(code)}/history`,
    {params: {range}},
  )
  if (data.success === false) {
    throw new Error((data as {message?: string}).message || '加载指数趋势失败')
  }
  return data.data
}

export async function fetchFundHistory(code: string, range: FundHistoryRange = '3m') {
  const {data} = await api.get<{success: boolean; data: FundHistoryPayload}>(
    `/funds/${encodeURIComponent(code)}/history`,
    {params: {range}},
  )
  if (data.success === false) {
    throw new Error((data as {message?: string}).message || '加载基金趋势失败')
  }
  return data.data
}

export async function fetchMarketOverview() {
  const {data} = await api.get<{success: boolean; data: MarketOverview}>('/market/overview')
  return data.data
}

export async function fetchGold() {
  const gold = loadConfig().gold
  const {data} = await api.post<{success: boolean; message?: string; data: GoldPayload}>(
    '/gold/quote',
    gold,
  )
  assertOk(data)
  return {
    ...data.data,
    holding: gold.holding,
    avgPrice: gold.avgPrice,
    show: getLocalSettings().showGold !== false,
  }
}

export type ResolveFundResult = {
  code: string
  name: string
  fundKey: string
  sectors: string[]
  amountAsOf: string
  netValue?: number | null
  prevNetValue?: number | null
  /** 上一确认净值日期 YYYY-MM-DD */
  prevNetValueDate?: string
  netValueDate?: string
  /** 今日净值已确认，可选「今日结算」口径 */
  confirmedSession?: boolean
}

export async function resolveFund(payload: {
  code: string
  type?: 'hold' | 'watch'
  name?: string
  sectors?: string[]
}) {
  const {data} = await api.post<{
    success: boolean
    message?: string
    data: ResolveFundResult
  }>('/funds/resolve', payload)
  return assertOk(data).data
}

function sharesFromAmount(amount: number, netValue?: number | null) {
  if (!(amount > 0) || !(netValue != null && netValue > 0)) return 0
  return Math.round((amount / netValue) * 10000) / 10000
}

export type AmountBasis = 'prev' | 'today'

/** 按金额口径反推份额并覆盖；拿不到对应净值则直接失败，绝不沿用旧 shares */
function deriveHoldPosition(
  amount: number,
  basis: AmountBasis,
  meta: {
    netValue?: number | null
    prevNetValue?: number | null
    netValueDate?: string
    prevNetValueDate?: string
    confirmedSession?: boolean
  },
): {shares: number; amountAsOf: string} {
  if (!(amount > 0)) {
    return {shares: 0, amountAsOf: ''}
  }
  if (basis === 'today') {
    if (!meta.confirmedSession) {
      throw new Error('今日净值尚未确认，请改选「昨日结算」，或等确认净值出来后再试')
    }
    if (!(meta.netValue != null && meta.netValue > 0)) {
      throw new Error('暂无今日确认净值，请稍后重试')
    }
    // 今日结算：输入金额 = 份额×今净值 = 列表应展示的持仓金额
    return {
      shares: sharesFromAmount(amount, meta.netValue),
      amountAsOf: meta.netValueDate || '',
    }
  }
  // 昨日结算：输入金额 = 份额×昨净值；今净值出来后滚仓把金额更新为份额×今净值
  const nav =
    meta.prevNetValue != null && meta.prevNetValue > 0
      ? meta.prevNetValue
      : meta.netValue
  if (!(nav != null && nav > 0)) {
    throw new Error('暂无确认净值，无法按金额反推份额，请稍后重试')
  }
  return {
    shares: sharesFromAmount(amount, nav),
    amountAsOf: meta.prevNetValueDate || meta.netValueDate || '',
  }
}

export async function createFund(
  payload: Partial<FundRecord> & {
    code: string
    amountBasis?: AmountBasis
  },
) {
  const meta = await resolveFund({
    code: payload.code,
    type: payload.type || 'watch',
    name: payload.name,
    sectors: payload.sectors,
  })
  const amount = payload.amount ?? 0
  const basis: AmountBasis = payload.amountBasis === 'today' ? 'today' : 'prev'

  let shares = 0
  let amountAsOf = ''
  if (payload.type === 'hold') {
    const derived = deriveHoldPosition(amount, basis, meta)
    shares = derived.shares
    amountAsOf = derived.amountAsOf
  }

  return upsertLocalFund({
    code: meta.code,
    name: payload.name || meta.name,
    fundKey: meta.fundKey,
    type: payload.type || 'watch',
    amount,
    amountAsOf: payload.type === 'hold' ? amountAsOf : '',
    shares,
    sectors: payload.sectors?.length ? payload.sectors : meta.sectors,
  })
}

export async function updateFund(
  code: string,
  payload: Partial<FundRecord> & {amountBasis?: AmountBasis},
) {
  const {amountBasis, ...rest} = payload
  const patch: Partial<FundRecord> = {...rest}

  // 改金额 = 整项覆盖：必须按口径重算 shares / amountAsOf，失败则抛错（不吃掉）
  if (patch.amount != null) {
    const meta = await resolveFund({code, type: 'hold'})
    const basis: AmountBasis = amountBasis === 'today' ? 'today' : 'prev'
    const derived = deriveHoldPosition(Number(patch.amount) || 0, basis, meta)
    patch.shares = derived.shares
    patch.amountAsOf = derived.amountAsOf
  }

  return updateLocalFund(code, patch)
}

export async function removeFund(code: string) {
  removeLocalFund(code)
}

export async function updateGoldConfig(payload: {holding: number; avgPrice: number}) {
  return updateLocalGold(payload)
}

export async function fetchSettings() {
  return getLocalSettings()
}

export async function updateSettings(payload: Partial<AppSettings>) {
  return updateLocalSettings(payload)
}

export async function exportConfig() {
  return loadConfig()
}

export async function importConfig(payload: AppConfig) {
  return importLocalConfig(payload)
}
