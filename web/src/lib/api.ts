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
  shares: number;
  sectors: string[];
  updatedAt?: string;
};

export type FundQuoteRow = FundRecord & {
  percent: number | null;
  estimateGrowth?: number | null;
  dayGrowth?: number | null;
  time?: string | null;
  trend: { time: string; growth: number | null }[];
  liveAmount?: number;
  pnl?: number;
  weight?: number;
};

export type HoldingsPayload = {
  summary: {
    totalAmount: number;
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
  percent: number | null;
  change: number | null;
  time: string;
  holding: number;
  avgPrice: number;
  pnl: number | null;
  pnlPercent: number | null;
  trend: { time: string; price: number; percent: number | null }[];
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

export async function fetchIndices() {
  const { data } = await api.get<{ success: boolean; data: IndexItem[] }>('/indices');
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
