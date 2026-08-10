import {useState} from 'react'
import {Plus, Trash2} from 'lucide-react'
import {createFund, removeFund, type FundQuoteRow} from '@/lib/api'
import {Button} from '@/components/ui/button'
import {Panel, PanelHeader} from '@/components/ui/panel'
import {SparkTrend} from '@/components/SparkTrend'
import {FundFormDialog} from '@/components/FundFormDialog'
import {FundTrendDialog} from '@/components/FundTrendDialog'
import {SectorTags} from '@/components/HoldingsModule'

export function WatchlistModule({
  list,
  loading,
  onChanged,
}: {
  list: FundQuoteRow[]
  loading?: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [fundOpen, setFundOpen] = useState(false)
  const [fundTarget, setFundTarget] = useState<FundQuoteRow | null>(null)

  function openFundDetail(row: FundQuoteRow) {
    setFundTarget(row)
    setFundOpen(true)
  }

  return (
    <Panel className="min-w-0">
      <PanelHeader
        title="自选基金"
        desc="按添加顺序固定排列 · 点名称进详情"
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
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
              <div className="min-w-0">
                <button
                  type="button"
                  className="block w-full truncate text-left font-medium hover:underline"
                  onClick={() => openFundDetail(row)}
                >
                  {row.name}
                </button>
                <div className="font-mono text-xs text-muted">{row.code}</div>
              </div>
              <div className="mt-2">
                <SectorTags sectors={row.sectors} sectorItems={row.sectorItems} />
              </div>
              <div className="mt-2">
                <SparkTrend
                  height={56}
                  title={row.name}
                  fundCode={row.code}
                  badgePercent={row.percent}
                  points={(row.trend || [])
                    .filter((p) => p.growth != null)
                    .map((p) => ({time: p.time, value: p.growth as number}))}
                />
              </div>
              <div className="mt-1 flex justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`删除自选 ${row.name}?`)) return
                    await removeFund(row.code)
                    onChanged()
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
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-y border-line/70">
              <th className="px-3 py-2 font-medium">基金</th>
              <th className="px-3 py-2 font-medium">关联板块</th>
              <th className="w-[32%] min-w-[170px] px-3 py-2 text-center font-medium">
                走势（涨幅）
              </th>
              <th className="w-24 whitespace-nowrap pl-8 pr-4 py-2 text-center font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && !list.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-muted">
                  加载中...
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-muted">
                  暂无自选基金
                </td>
              </tr>
            ) : (
              list.map((row) => (
                <tr key={row.code} className="border-b border-line/50 hover:bg-paper/60">
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="block text-left font-medium hover:underline"
                      onClick={() => openFundDetail(row)}
                    >
                      {row.name}
                    </button>
                    <div className="font-mono text-xs text-muted">{row.code}</div>
                  </td>
                  <td className="px-3 py-3">
                    <SectorTags sectors={row.sectors} sectorItems={row.sectorItems} />
                  </td>
                  <td className="min-w-[170px] px-3 py-2">
                    <SparkTrend
                      className="w-full"
                      height={64}
                      title={row.name}
                      fundCode={row.code}
                      badgePercent={row.percent}
                      points={(row.trend || [])
                        .filter((p) => p.growth != null)
                        .map((p) => ({time: p.time, value: p.growth as number}))}
                    />
                  </td>
                  <td className="whitespace-nowrap pl-8 pr-4 py-2 text-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={async () => {
                        if (!confirm(`删除自选 ${row.name}?`)) return
                        await removeFund(row.code)
                        onChanged()
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-rise" />
                    </Button>
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
        initial={null}
        onSubmit={async (payload) => {
          await createFund({code: payload.code, type: 'watch'})
          onChanged()
        }}
      />
      <FundTrendDialog
        open={fundOpen}
        onOpenChange={setFundOpen}
        code={fundTarget?.code || ''}
        name={fundTarget?.name || ''}
        badgePercent={fundTarget?.percent}
        intradayPoints={(fundTarget?.trend || [])
          .filter((p) => p.growth != null)
          .map((p) => ({time: p.time, value: p.growth as number}))}
      />
    </Panel>
  )
}
