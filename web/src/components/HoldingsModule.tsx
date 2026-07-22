import {useMemo, useState} from 'react'
import {Pencil, Plus, Trash2} from 'lucide-react'
import {
  createFund,
  removeFund,
  updateFund,
  updateSettings,
  type FundQuoteRow,
  type GoldPayload,
  type HoldingsPayload,
} from '@/lib/api'
import {formatAmount, formatMoney, formatPct, pctClass} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Switch} from '@/components/ui/switch'
import {Label} from '@/components/ui/label'
import {Panel, PanelHeader} from '@/components/ui/panel'
import {SparkTrend} from '@/components/SparkTrend'
import {FundFormDialog} from '@/components/FundFormDialog'
import {GoldMobileCard, GoldTableRow} from '@/components/GoldHoldingsRow'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** 黄金开关打开时，把黄金市值与当日收益并入总汇总，并重算占比 */
function buildHoldingsView(
  data: HoldingsPayload | null,
  gold: GoldPayload | null,
  showGold: boolean,
) {
  const baseSummary = data?.summary
  const baseList = data?.list || []
  if (!baseSummary) {
    return {
      summary: null as HoldingsPayload['summary'] | null,
      list: baseList,
      goldWeight: null as number | null,
    }
  }

  let goldAmount = 0
  let goldPnl = 0
  if (showGold && gold) {
    // 与基金一致：上一确认点市值（昨收 × 克数）
    const ref =
      gold.prevClose != null && gold.prevClose > 0
        ? gold.prevClose
        : gold.price != null
          ? gold.price
          : null
    if (ref != null && gold.holding > 0) {
      goldAmount = ref * gold.holding
    }
    if (gold.pnl != null) goldPnl = gold.pnl
  }

  const totalAmount = round2(baseSummary.totalAmount + goldAmount)
  const totalPnl = round2(baseSummary.totalPnl + goldPnl)
  const fundBod = baseSummary.bodTotal ?? baseSummary.totalAmount
  const bodTotal = round2(fundBod + goldAmount)
  const totalPnlPercent =
    bodTotal > 0 ? round2((totalPnl / bodTotal) * 100) : 0

  const list = baseList.map((row) => ({
    ...row,
    weight: totalAmount > 0 ? round2(((row.amount || 0) / totalAmount) * 100) : 0,
  }))

  const goldWeight =
    showGold && totalAmount > 0 ? round2((goldAmount / totalAmount) * 100) : null

  return {
    summary: {totalAmount, bodTotal, totalPnl, totalPnlPercent},
    list,
    goldWeight,
  }
}

export function HoldingsModule({
  data,
  gold,
  showGold,
  loading,
  onChanged,
  onSettingsChanged,
}: {
  data: HoldingsPayload | null
  gold: GoldPayload | null
  showGold: boolean
  loading?: boolean
  onChanged: () => void
  onSettingsChanged: (showGold: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FundQuoteRow | null>(null)
  const [togglingGold, setTogglingGold] = useState(false)

  const {summary, list, goldWeight} = useMemo(
    () => buildHoldingsView(data, gold, showGold),
    [data, gold, showGold],
  )

  async function toggleGold(next: boolean) {
    setTogglingGold(true)
    try {
      await updateSettings({showGold: next})
      onSettingsChanged(next)
    } finally {
      setTogglingGold(false)
    }
  }

  return (
    <Panel className="min-w-0 w-full">
      <PanelHeader
        title="持仓列表"
        desc={showGold ? '基金持仓 + AU9999 黄金（设置点右侧齿轮）' : '基金持仓（黄金栏已关闭）'}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2 rounded-md border border-line/70 bg-paper/40 px-2 py-1">
              <Label htmlFor="show-gold" className="text-xs text-muted">
                黄金
              </Label>
              <Switch
                id="show-gold"
                checked={showGold}
                disabled={togglingGold}
                onCheckedChange={(v) => void toggleGold(v)}
              />
            </div>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Plus className="h-4 w-4" />
              添加持仓
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-3 sm:gap-3 sm:px-5 sm:py-4">
        <Stat
          label="总持仓金额"
          hint="上一确认点市值合计（基金为确认净值市值，黄金为昨收×克数），不含盘中估算浮动"
          value={formatAmount(summary?.totalAmount)}
          loading={loading}
        />
        <Stat
          label="当日收益"
          value={formatMoney(summary?.totalPnl)}
          className={pctClass(summary?.totalPnl)}
          loading={loading}
        />
        <Stat
          label="当日总收益率"
          value={formatPct(summary?.totalPnlPercent)}
          className={pctClass(summary?.totalPnlPercent)}
          loading={loading}
        />
      </div>

      {/* 移动端 */}
      <div className="space-y-2 px-3 pb-4 md:hidden">
        {showGold ? (
          <GoldMobileCard
            data={gold}
            weight={goldWeight}
            loading={loading}
            onChanged={onChanged}
          />
        ) : null}
        {list.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted">暂无基金持仓</div>
        ) : (
          list.map((row) => (
            <div key={row.code} className="rounded-xl border border-line/70 bg-paper/40 p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{row.name}</div>
                <div className="font-mono text-xs text-muted">{row.code}</div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div
                    className="text-[11px] text-muted"
                    title="上一确认点市值，不含盘中估算浮动"
                  >
                    持仓金额
                  </div>
                  <div className="font-mono tabular-nums">{formatAmount(row.amount)}</div>
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
                  height={56}
                  title={`${row.name} 分时涨幅`}
                  points={(row.trend || [])
                    .filter((p) => p.growth != null)
                    .map((p) => ({time: p.time, value: p.growth as number}))}
                />
              </div>
              <div className="mt-1 flex justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditing(row)
                    setOpen(true)
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`删除持仓 ${row.name}?`)) return
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

      {/* 桌面表格 */}
      <div className="hidden w-full overflow-x-auto px-2 pb-4 md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr className="border-y border-line/70">
              <th className="px-3 py-2 font-medium">名称</th>
              <th
                className="px-3 py-2 font-medium"
                title="上一确认点市值（基金为确认净值市值，黄金为昨收×克数），不含盘中估算浮动"
              >
                持仓金额
                <span className="ml-0.5 font-normal text-muted normal-case">ⓘ</span>
              </th>
              <th className="px-3 py-2 font-medium">实时收益</th>
              <th className="px-3 py-2 font-medium">占比</th>
              <th className="px-3 py-2 font-medium">板块</th>
              <th className="px-3 py-2 font-medium">走势（涨幅）</th>
              <th className="whitespace-nowrap px-3 py-2 text-center font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {showGold ? (
              <GoldTableRow
                data={gold}
                weight={goldWeight}
                loading={loading}
                onChanged={onChanged}
              />
            ) : null}
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted">
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
                  <td className="px-3 py-3 font-mono tabular-nums">
                    {formatAmount(row.amount)}
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
                  <td className="px-3 py-2">
                    <SparkTrend
                      height={64}
                      title={`${row.name} 分时涨幅`}
                      points={(row.trend || [])
                        .filter((p) => p.growth != null)
                        .map((p) => ({time: p.time, value: p.growth as number}))}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="flex justify-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditing(row)
                          setOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={async () => {
                          if (!confirm(`删除持仓 ${row.name}?`)) return
                          await removeFund(row.code)
                          onChanged()
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
            await updateFund(editing.code, {amount: payload.amount})
          } else {
            await createFund({
              code: payload.code,
              amount: payload.amount,
              type: 'hold',
            })
          }
          onChanged()
        }}
      />
    </Panel>
  )
}

function Stat({
  label,
  value,
  className,
  loading,
  hint,
}: {
  label: string
  value: string
  className?: string
  loading?: boolean
  hint?: string
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line/60 bg-paper/50 px-3 py-3 sm:px-4">
      <div className="text-xs text-muted" title={hint}>
        {label}
        {hint ? <span className="ml-0.5 text-muted/80">ⓘ</span> : null}
      </div>
      <div
        className={`mt-1 break-all font-mono text-lg font-semibold tabular-nums sm:text-xl ${className || ''}`}
      >
        {loading ? '...' : value}
      </div>
    </div>
  )
}

export function SectorTags({sectors}: {sectors?: string[]}) {
  if (!sectors?.length) return <span className="text-xs text-muted">--</span>
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
  )
}
