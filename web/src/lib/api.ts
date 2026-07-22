import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export type FundRecord = {
  code: string;
  name: string;
  fundKey?: string;
  type: 'hold' | 'watch';
  amount: number;
  /** 持仓金额已计入的净值确认日（晚间确认后自动滚动） */
  amountAsOf?: string;
  shares: number;
  sectors: string[];
  updatedAt?: string;
};

export type FundQuoteRow = FundRecord & {
  percent: number | null;
  percentSource?: 'estimate' | 'confirmed' | null;
  estimateGrowth?: number | null;
  dayGrowth?: number | null;
  netValueDate?: string;
  time?: string | null;
  trend: { time: string; growth: number | null }[];
  liveAmount?: number;
  pnl?: number;
  weight?: number;
};

export type HoldingsPayload = {
  summary: {
    totalAmount: number;
    /** 开盘前确认市值（算当日收益率用） */
    bodTotal?: number;
    totalPnl: number;
    totalPnlPercent: number;
  };
  list: FundQuoteRow[];
};

export type IndexItem = {
  code: string;
  name: string;
  percent: number | null;
};

export type SectorItem = {
  code: string;
  name: string;
  percent: number | null;
};

export type MarketOverview = {
  upDown: { up: number; down: number; flat: number; time: string | null };
  topGainers: SectorItem[];
  topLosers: SectorItem[];
};

export type GoldPayload = {
  code: string;
  name: string;
  price: number | null;
  prevClose?: number | null;
  percent: number | null;
  change: number | null;
  time: string;
  holding: number;
  avgPrice: number;
  pnl: number | null;
  pnlPercent: number | null;
  costPnl?: number | null;
  costPnlPercent?: number | null;
  show?: boolean;
  trend: { time: string; price: number; percent: number | null }[];
};

export type AppSettings = {
  showGold: boolean;
};

export type AppConfig = {
  settings: AppSettings;
  funds: Record<string, FundRecord>;
  gold: { holding: number; avgPrice: number };
};

export async function fetchHoldings() {
  const { data } = await api.get<{ success: boolean; data: HoldingsPayload }>(
    '/funds/quotes',
    { params: { type: 'hold' } },
  );
  return data.data;
}

export async function fetchWatchlist() {
  const { data } = await api.get<{ success: boolean; data: { list: FundQuoteRow[] } }>(
    '/funds/quotes',
    { params: { type: 'watch' } },
  );
  return data.data.list;
}

export type IndexHistoryRange = '1m' | '3m' | '6m' | '1y' | '3y';

export type IndexHistoryPayload = {
  code: string;
  name: string;
  range: IndexHistoryRange;
  periodPercent: number | null;
  points: { date: string; close: number; percent: number | null }[];
};

export async function fetchIndices() {
  const { data } = await api.get<{ success: boolean; data: IndexItem[] }>('/indices');
  return data.data;
}

export async function fetchIndexHistory(code: string, range: IndexHistoryRange = '1m') {
  const { data } = await api.get<{ success: boolean; data: IndexHistoryPayload }>(
    `/indices/${encodeURIComponent(code)}/history`,
    { params: { range } },
  );
  if (data.success === false) {
    throw new Error((data as { message?: string }).message || '加载指数趋势失败');
  }
  return data.data;
}

export async function fetchMarketOverview() {
  const { data } = await api.get<{ success: boolean; data: MarketOverview }>(
    '/market/overview',
  );
  return data.data;
}

export async function fetchGold() {
  const { data } = await api.get<{ success: boolean; data: GoldPayload }>('/gold');
  return data.data;
}

function assertOk<T extends { success?: boolean; message?: string }>(data: T): T {
  if (data && data.success === false) {
    throw new Error(data.message || '请求失败');
  }
  return data;
}

export async function createFund(payload: Partial<FundRecord> & { code: string }) {
  const { data } = await api.post('/funds', payload);
  return assertOk(data);
}

export async function updateFund(code: string, payload: Partial<FundRecord>) {
  const { data } = await api.put(`/funds/${code}`, payload);
  return assertOk(data);
}

export async function removeFund(code: string) {
  const { data } = await api.delete(`/funds/${code}`);
  return assertOk(data);
}

export async function updateGoldConfig(payload: { holding: number; avgPrice: number }) {
  const { data } = await api.put('/gold/config', payload);
  return assertOk(data);
}

export async function fetchSettings() {
  const { data } = await api.get<{ success: boolean; data: AppSettings }>('/settings');
  return data.data;
}

export async function updateSettings(payload: Partial<AppSettings>) {
  const { data } = await api.put('/settings', payload);
  return assertOk(data).data as AppSettings;
}

export async function exportConfig() {
  const { data } = await api.get<{ success: boolean; data: AppConfig }>('/config');
  return data.data;
}

export async function importConfig(payload: AppConfig) {
  const { data } = await api.put('/config', payload);
  return assertOk(data);
}
