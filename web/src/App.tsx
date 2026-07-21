import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  fetchGold,
  fetchHoldings,
  fetchIndices,
  fetchMarketOverview,
  fetchWatchlist,
  type FundQuoteRow,
  type GoldPayload,
  type HoldingsPayload,
  type IndexItem,
  type MarketOverview,
} from '@/lib/api';
import { formatMoney, formatPct } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { HoldingsModule } from '@/components/HoldingsModule';
import { WatchlistModule } from '@/components/WatchlistModule';
import { IndicesModule, MarketModule } from '@/components/MarketModules';
import './index.css';

const REFRESH_MS = 30_000;

export default function App() {
  const [holdings, setHoldings] = useState<HoldingsPayload | null>(null);
  const [watchlist, setWatchlist] = useState<FundQuoteRow[]>([]);
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [market, setMarket] = useState<MarketOverview | null>(null);
  const [gold, setGold] = useState<GoldPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [h, w, i, m, g] = await Promise.all([
        fetchHoldings(),
        fetchWatchlist(),
        fetchIndices(),
        fetchMarketOverview(),
        fetchGold(),
      ]);
      setHoldings(h);
      setWatchlist(w);
      setIndices(i);
      setMarket(m);
      setGold(g);
      setUpdatedAt(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
    } catch (e: unknown) {
      setError((e as Error)?.message || '加载失败，请确认代理服务已启动');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-40 w-full border-b border-line/80 bg-panel/85 backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-3 px-3 py-3 sm:px-5 lg:px-8">
          <div className="min-w-0">
            <div className="font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl lg:text-3xl">
              WZK Fund
            </div>
            <p className="truncate text-[11px] text-muted sm:text-xs lg:text-sm">
              持仓 / 黄金 / 指数 / 大盘 / 自选
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden font-mono text-xs text-muted md:inline">
              {updatedAt ? `更新 ${updatedAt}` : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">刷新</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex w-full flex-col gap-4 px-3 py-4 sm:gap-5 sm:px-5 sm:py-6 lg:px-8">
        {error ? (
          <div className="rounded-xl border border-rise/30 bg-rise/5 px-4 py-3 text-sm text-rise">
            {error}
          </div>
        ) : null}

        <section className="relative overflow-hidden rounded-2xl border border-line/80 bg-ink text-white">
          <div className="ticker-grid absolute inset-0 opacity-20" />
          <div className="relative grid gap-4 px-4 py-5 sm:grid-cols-2 sm:px-6 sm:py-7 lg:px-8">
            <div className="min-w-0">
              <div className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
                WZK Fund
              </div>
              <p className="mt-2 text-xs text-white/70 sm:text-sm">
                行情看板：持仓盈亏本地估算，市场侧只强调实时涨跌幅。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 self-end sm:gap-3">
              <HeroStat
                label="持仓收益"
                value={holdings ? formatMoney(holdings.summary.totalPnl) : '--'}
                tone={holdings && holdings.summary.totalPnl >= 0 ? 'rise' : 'fall'}
              />
              <HeroStat
                label="持仓收益率"
                value={holdings ? formatPct(holdings.summary.totalPnlPercent) : '--'}
                tone={
                  holdings && holdings.summary.totalPnlPercent >= 0 ? 'rise' : 'fall'
                }
              />
            </div>
          </div>
        </section>

        {/* 1. 持仓全宽（含黄金浓缩行） */}
        <HoldingsModule
          data={holdings}
          gold={gold}
          loading={loading}
          onChanged={() => load(true)}
        />

        {/* 2. 指数看板在持仓下方 */}
        <IndicesModule list={indices} loading={loading} />

        {/* 3. 大盘 + 自选同一行 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-5">
          <MarketModule data={market} loading={loading} />
          <WatchlistModule list={watchlist} loading={loading} onChanged={() => load(true)} />
        </div>

        <footer className="pb-6 pt-1 text-center text-xs text-muted">
          数据来自公开行情接口，仅供展示，不构成投资建议。
        </footer>
      </main>
    </div>
  );
}

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'rise' | 'fall';
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/15 bg-white/5 px-3 py-3 backdrop-blur-sm">
      <div className="text-[11px] text-white/60">{label}</div>
      <div
        className={`mt-1 break-all font-mono text-lg font-semibold tabular-nums sm:text-xl ${
          tone === 'rise' ? 'text-[#ff8a9a]' : 'text-[#7ddec0]'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
