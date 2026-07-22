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
  time?: string | null
  trend: {time: string; growth: number | null}[]
  liveAmount?: number
  pnl?: number
  weight?: number
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

export async function createFund(payload: Partial<FundRecord> & {code: string}) {
  const meta = await resolveFund({
    code: payload.code,
    type: payload.type || 'watch',
    name: payload.name,
    sectors: payload.sectors,
  })
  return upsertLocalFund({
    code: meta.code,
    name: payload.name || meta.name,
    fundKey: meta.fundKey,
    type: payload.type || 'watch',
    amount: payload.amount ?? 0,
    amountAsOf:
      payload.type === 'hold' ? payload.amountAsOf || meta.amountAsOf : payload.amountAsOf || '',
    shares: payload.shares ?? 0,
    sectors: payload.sectors?.length ? payload.sectors : meta.sectors,
  })
}

export async function updateFund(code: string, payload: Partial<FundRecord>) {
  const patch: Partial<FundRecord> = {...payload}
  if (patch.amount != null && !patch.amountAsOf) {
    try {
      const meta = await resolveFund({code, type: 'hold'})
      if (meta.amountAsOf) patch.amountAsOf = meta.amountAsOf
    } catch {
      // keep previous amountAsOf
    }
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
