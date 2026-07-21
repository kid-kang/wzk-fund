import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createFund,
  removeFund,
  updateFund,
  type FundQuoteRow,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SparkTrend, MiniPct } from '@/components/SparkTrend';
import { FundFormDialog } from '@/components/FundFormDialog';
import { SectorTags } from '@/components/HoldingsModule';

export function WatchlistModule({
  list,
  loading,
  onChanged,
}: {
  list: FundQuoteRow[];
  loading?: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FundQuoteRow | null>(null);

  return (
    <Panel className="min-w-0">
      <PanelHeader
        title="自选基金"
        desc="只看实时涨跌与走势"
        action={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            添加自选
          </Button>
        }
      />

      <div className="space-y-2 px-3 pb-4 pt-2 md:hidden">
        {loading && !list.length ? (
          <div className="py-8 text-center text-sm text-muted">加载中...</div>
        ) : list.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">暂无自选基金</div>
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
              <div className="mt-2">
                <SectorTags sectors={row.sectors} />
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
                    if (!confirm(`删除自选 ${row.name}?`)) return;
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

      <div className="hidden overflow-x-auto px-2 pb-4 pt-1 md:block">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-y border-line/70">
              <th className="px-3 py-2 font-medium">基金</th>
              <th className="px-3 py-2 font-medium">实时涨跌</th>
              <th className="px-3 py-2 font-medium">关联板块</th>
              <th className="w-[28%] min-w-[160px] px-3 py-2 font-medium">走势</th>
              <th className="w-px whitespace-nowrap px-1 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading && !list.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted">
                  加载中...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted">
                  暂无自选基金
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.code} className="border-b border-line/50 hover:bg-paper/60">
                  <td className="px-3 py-3">
                    <div className="font-medium">{row.name}</div>
                    <div className="font-mono text-xs text-muted">{row.code}</div>
                  </td>
                  <td className="px-3 py-3">
                    <MiniPct value={row.percent} />
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
                          if (!confirm(`删除自选 ${row.name}?`)) return;
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
        mode="watch"
        initial={editing}
        onSubmit={async (payload) => {
          if (editing) {
            await updateFund(editing.code, payload);
          } else {
            await createFund({ ...payload, type: 'watch' });
          }
          onChanged();
        }}
      />
    </Panel>
  );
}
