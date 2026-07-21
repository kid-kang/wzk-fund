import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { updateGoldConfig, type GoldPayload } from '@/lib/api';
import { formatAmount, formatMoney, pctClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MiniPct } from '@/components/SparkTrend';

function useGoldSettings(data: GoldPayload | null, onChanged: () => void) {
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState('0');
  const [avgPrice, setAvgPrice] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setHolding(String(data.holding ?? 0));
    setAvgPrice(String(data.avgPrice ?? 0));
  }, [data?.holding, data?.avgPrice]);

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AU9999 仓位设置</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            try {
              await updateGoldConfig({
                holding: Number(holding) || 0,
                avgPrice: Number(avgPrice) || 0,
              });
              setOpen(false);
              onChanged();
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="gold-holding">持有（克）</Label>
              <Input
                id="gold-holding"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={holding}
                onChange={(e) => setHolding(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gold-avg">均价（元/克）</Label>
              <Input
                id="gold-avg"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted">看板只展示行情与盈亏，仓位在此修改。</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return { openSettings: () => setOpen(true), dialog };
}

function GoldSpark({ data }: { data: GoldPayload | null }) {
  const trend = data?.trend || [];
  if (!trend.length) {
    return <div className="flex h-10 items-center text-[10px] text-muted">暂无走势</div>;
  }
  const option = {
    animation: false,
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      confine: false,
      backgroundColor: 'rgba(21,32,43,0.92)',
      borderWidth: 0,
      padding: [6, 8],
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params];
        const p = list[0] as { axisValue?: string; value?: number | string };
        if (!p) return '';
        const val = p.value == null || p.value === '' ? '--' : Number(p.value).toFixed(2);
        return `${p.axisValue ?? ''}<br/><b>${val}</b>`;
      },
    },
    xAxis: { type: 'category', show: false, data: trend.map((p) => p.time) },
    yAxis: { type: 'value', show: false, scale: true },
    series: [
      {
        type: 'line',
        data: trend.map((p) => p.price),
        showSymbol: false,
        smooth: 0.25,
        lineStyle: { width: 1.5, color: '#b8860b' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(184,134,11,0.28)' },
              { offset: 1, color: 'rgba(184,134,11,0.02)' },
            ],
          },
        },
      },
    ],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: 40, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge
    />
  );
}

export function GoldMobileCard({
  data,
  loading,
  onChanged,
}: {
  data: GoldPayload | null;
  loading?: boolean;
  onChanged: () => void;
}) {
  const { openSettings, dialog } = useGoldSettings(data, onChanged);
  const liveAmount =
    data?.price != null && data.holding > 0 ? data.price * data.holding : null;

  return (
    <>
      <div className="rounded-xl border border-gold/30 bg-gradient-to-r from-gold/10 to-paper/40 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">AU9999 沪金</div>
            <div className="font-mono text-xs text-muted">黄金</div>
          </div>
          <div className="flex items-center gap-1">
            <MiniPct value={data?.percent} />
            <Button size="icon" variant="ghost" onClick={openSettings} title="仓位设置">
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div className="text-[11px] text-muted">持仓金额</div>
            <div className="font-mono tabular-nums text-gold">
              {liveAmount != null ? formatAmount(liveAmount) : loading ? '...' : '--'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">持仓收益</div>
            <div className={`font-mono tabular-nums ${pctClass(data?.pnl)}`}>
              {formatMoney(data?.pnl)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">均价</div>
            <div className="font-mono tabular-nums">
              {data?.avgPrice ? data.avgPrice.toFixed(2) : '--'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">持有</div>
            <div className="font-mono tabular-nums">
              {data?.holding ? `${data.holding}克` : '--'}
            </div>
          </div>
        </div>
        <div className="mt-2">
          <GoldSpark data={data} />
        </div>
      </div>
      {dialog}
    </>
  );
}

export function GoldTableRow({
  data,
  loading,
  onChanged,
}: {
  data: GoldPayload | null;
  loading?: boolean;
  onChanged: () => void;
}) {
  const { openSettings, dialog } = useGoldSettings(data, onChanged);
  const liveAmount =
    data?.price != null && data.holding > 0 ? data.price * data.holding : null;

  return (
    <>
      <tr className="border-b border-gold/25 bg-gradient-to-r from-gold/10 to-transparent">
        <td className="px-3 py-3">
          <div className="font-medium text-ink">AU9999 沪金</div>
          <div className="font-mono text-xs text-muted">黄金</div>
        </td>
        <td className="px-3 py-3">
          <MiniPct value={data?.percent} />
        </td>
        <td className="px-3 py-3 font-mono tabular-nums text-gold">
          {liveAmount != null ? formatAmount(liveAmount) : loading ? '...' : '--'}
        </td>
        <td className={`px-3 py-3 font-mono tabular-nums ${pctClass(data?.pnl)}`}>
          {formatMoney(data?.pnl)}
        </td>
        <td className="px-3 py-3 font-mono text-xs tabular-nums text-ink-soft">
          {data?.holding ? `${data.holding}克` : '--'}
        </td>
        <td className="px-3 py-3">
          <span className="rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[11px] text-ink-soft">
            均价 {data?.avgPrice ? data.avgPrice.toFixed(2) : '--'}
          </span>
        </td>
        <td className="min-w-[160px] px-3 py-2">
          <GoldSpark data={data} />
        </td>
        <td className="w-px whitespace-nowrap px-1 py-2">
          <div className="flex justify-center">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={openSettings}
              title="仓位设置"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>
      {dialog}
    </>
  );
}
