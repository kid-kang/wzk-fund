import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createFund,
  removeFund,
  updateFund,
  type FundQuoteRow,
  type GoldPayload,
  type HoldingsPayload,
} from '@/lib/api';
import { formatAmount, formatMoney, formatPct, pctClass } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SparkTrend, MiniPct } from '@/components/SparkTrend';
import { FundFormDialog } from '@/components/FundFormDialog';
import { GoldMobileCard, GoldTableRow } from '@/components/GoldHoldingsRow';

export function HoldingsModule({
  data,
  gold,
  loading,
  onChanged,
}: {
  data: HoldingsPayload | null;
  gold: GoldPayload | null;
  loading?: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FundQuoteRow | null>(null);

  const summary = data?.summary;
  const list = data?.list || [];

  return (
    <Panel className="min-w-0 w-full">
      <PanelHeader
        title="持仓列表"
        desc="基金持仓 + AU9999 黄金（设置点右侧齿轮）"
        action={
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            添加持仓
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-3 sm:gap-3 sm:px-5 sm:py-4">
        <Stat label="总持仓金额" value={formatAmount(summary?.totalAmount)} loading={loading} />
        <Stat
          label="总收益"
          value={formatMoney(summary?.totalPnl)}
          className={pctClass(summary?.totalPnl)}
          loading={loading}
        />
        <Stat
          label="总收益率"
          value={formatPct(summary?.totalPnlPercent)}
          className={pctClass(summary?.totalPnlPercent)}
          loading={loading}
        />
      </div>

      {/* 移动端 */}
      <div className="space-y-2 px-3 pb-4 md:hidden">
        <GoldMobileCard data={gold} loading={loading} onChanged={onChanged} />
        {list.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">暂无基金持仓</div>
        ) : (
          list.map((row) => (
            <div key={row.code} className="rounded-xl border border-line/70 bg-paper/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.name}</div>
                  <div className="font-mono text-xs text-muted">{row.code}</div>
                </div>
                <MiniPct value={row.percent} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-[11px] text-muted">持仓金额</div>
                  <div className="font-mono tabular-nums">{formatAmount(row.liveAmount)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">实时收益</div>
                  <div className={`font-mono tabular-nums ${pctClass(row.pnl)}`}>
                    {formatMoney(row.pnl)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">占比</div>
                  <div className="font-mono tabular-nums text-ink-soft">
                    {formatPct(row.weight, 1).replace('+', '')}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted">板块</div>
                  <SectorTags sectors={row.sectors} />
                </div>
              </div>
              <div className="mt-2">
                <SparkTrend
                  height={40}
                  points={(row.trend || [])
                    .filter((p) => p.growth != null)
                    .map((p) => ({ time: p.time, value: p.growth as number }))}
                />
              </div>
              <div className="mt-1 flex justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditing(row);
                    setOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`删除持仓 ${row.name}?`)) return;
                    await removeFund(row.code);
                    onChanged();
                  }}
                >
                  <Trash2 className="h-4 w-4 text-rise" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 桌面表格：黄金为特殊首行 */}
      <div className="hidden w-full overflow-x-auto px-2 pb-4 md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-y border-line/70">
              <th className="px-3 py-2 font-medium">名称</th>
              <th className="px-3 py-2 font-medium">实时涨跌</th>
              <th className="px-3 py-2 font-medium">持仓金额</th>
              <th className="px-3 py-2 font-medium">实时收益</th>
              <th className="px-3 py-2 font-medium">占比/持有</th>
              <th className="px-3 py-2 font-medium">板块/均价</th>
              <th className="w-[22%] min-w-[160px] px-3 py-2 font-medium">走势</th>
              <th className="w-px whitespace-nowrap px-1 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <GoldTableRow data={gold} loading={loading} onChanged={onChanged} />
            {list.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted">
                  暂无基金持仓，可点击右上角添加
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.code} className="border-b border-line/50 hover:bg-paper/60">
                  <td className="px-3 py-3">
                    <div className="font-medium text-ink">{row.name}</div>
                    <div className="font-mono text-xs text-muted">{row.code}</div>
                  </td>
                  <td className="px-3 py-3">
                    <MiniPct value={row.percent} />
                  </td>
                  <td className="px-3 py-3 font-mono tabular-nums">
                    {formatAmount(row.liveAmount)}
                  </td>
                  <td className={`px-3 py-3 font-mono tabular-nums ${pctClass(row.pnl)}`}>
                    {formatMoney(row.pnl)}
                  </td>
                  <td className="px-3 py-3 font-mono tabular-nums text-ink-soft">
                    {formatPct(row.weight, 1).replace('+', '')}
                  </td>
                  <td className="px-3 py-3">
                    <SectorTags sectors={row.sectors} />
                  </td>
                  <td className="min-w-[160px] px-3 py-2">
                    <SparkTrend
                      points={(row.trend || [])
                        .filter((p) => p.growth != null)
                        .map((p) => ({ time: p.time, value: p.growth as number }))}
                    />
                  </td>
                  <td className="w-px whitespace-nowrap px-1 py-2">
                    <div className="flex justify-center gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditing(row);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={async () => {
                          if (!confirm(`删除持仓 ${row.name}?`)) return;
                          await removeFund(row.code);
                          onChanged();
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-rise" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FundFormDialog
        open={open}
        onOpenChange={setOpen}
        mode="hold"
        initial={editing}
        onSubmit={async (payload) => {
          if (editing) {
            await updateFund(editing.code, payload);
          } else {
            await createFund({ ...payload, type: 'hold' });
          }
          onChanged();
        }}
      />
    </Panel>
  );
}

function Stat({
  label,
  value,
  className,
  loading,
}: {
  label: string;
  value: string;
  className?: string;
  loading?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line/60 bg-paper/50 px-3 py-3 sm:px-4">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={`mt-1 break-all font-mono text-lg font-semibold tabular-nums sm:text-xl ${className || ''}`}
      >
        {loading ? '...' : value}
      </div>
    </div>
  );
}

export function SectorTags({ sectors }: { sectors?: string[] }) {
  if (!sectors?.length) return <span className="text-xs text-muted">未标注</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {sectors.map((s) => (
        <span
          key={s}
          className="rounded border border-line bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft"
        >
          {s}
        </span>
      ))}
    </div>
  );
}
