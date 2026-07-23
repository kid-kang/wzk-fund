import {useState} from 'react'
import {Pencil, Plus, Trash2} from 'lucide-react'
import {
  createFund,
  removeFund,
  updateFund,
  type FundQuoteRow,
  type GoldPayload,
  type HoldingsPayload,
} from '@/lib/api'
import {formatAmount, formatMoney, formatPct, pctClass} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Panel, PanelHeader} from '@/components/ui/panel'
import {SparkTrend} from '@/components/SparkTrend'
import {FundFormDialog} from '@/components/FundFormDialog'
import {GoldPanel} from '@/components/GoldHoldingsRow'

export function HoldingsModule({
  data,
  gold,
  showGold,
  loading,
  onChanged,
}: {
  data: HoldingsPayload | null
  gold: GoldPayload | null
  showGold: boolean
  loading?: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<FundQuoteRow | null>(null)

  const summary = data?.summary ?? null
  const list = data?.list || []

  function openEditHold(row: FundQuoteRow) {
    // 编辑时带入实时计算出的展示金额，保存时按所选口径重算 shares。
    setEditing(row)
    setOpen(true)
  }
  return (
    <div className="flex min-w-0 w-full flex-col gap-4">
      <Panel className="min-w-0 w-full">
        <PanelHeader
          title="持仓列表"
          desc="仅基金 · 总金额 / 当日收益 / 收益率不含黄金"
          action={
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
          }
        />

        <div className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-3 sm:gap-3 sm:px-5 sm:py-4">
          <Stat
            label="总持仓金额"
            hint="基金确认净值市值合计，不含盘中估算浮动，不含黄金"
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
          {list.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">暂无基金持仓</div>
          ) : (
            list.map((row) => (
              <div key={row.code} className="rounded-xl border border-line/70 bg-paper/40 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.name}</div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="font-mono text-xs text-muted">{row.code}</span>
                    <ConfirmedUpdatedBadge
                      show={row.confirmedUpdated}
                      percent={row.dayGrowth ?? row.percent}
                      netValue={row.netValue}
                    />
                  </div>
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
                    <div
                      className="text-[11px] text-muted"
                      title={
                        row.confirmedUpdated
                          ? '官方确认涨跌已更新持仓金额与当日收益'
                          : undefined
                      }
                    >
                      {row.confirmedUpdated ? '当日收益' : '实时收益'}
                    </div>
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
                    onClick={() => openEditHold(row)}
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
                  title="上一确认点市值（确认净值市值），不含盘中估算浮动"
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
                      <div className="truncate font-medium text-ink">{row.name}</div>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="font-mono text-xs text-muted">{row.code}</span>
                        <ConfirmedUpdatedBadge
                          show={row.confirmedUpdated}
                          percent={row.dayGrowth ?? row.percent}
                          netValue={row.netValue}
                        />
                      </div>
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
                        title={row.name}
                        fundCode={row.code}
                        badgePercent={row.percent}
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
                          onClick={() => openEditHold(row)}
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
              await updateFund(editing.code, {
                amount: payload.amount,
                amountBasis: payload.amountBasis,
              })
            } else {
              await createFund({
                code: payload.code,
                amount: payload.amount,
                amountBasis: payload.amountBasis,
                type: 'hold',
              })
            }
            onChanged()
          }}
        />
      </Panel>

      {showGold ? (
        <GoldPanel data={gold} loading={loading} onChanged={onChanged} />
      ) : null}
    </div>
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

export function ConfirmedUpdatedBadge({
  show,
  percent,
  netValue,
}: {
  show?: boolean
  percent?: number | null
  netValue?: number | null
}) {
  if (!show) return null
  const pctText = formatPct(percent)
  const navText =
    netValue != null && Number.isFinite(netValue) ? netValue.toFixed(4) : '--'
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none tabular-nums ${percent == null || Number.isNaN(percent)
        ? 'border-line bg-paper text-muted'
        : percent >= 0
          ? 'border-rise/35 bg-rise/10 text-rise'
          : 'border-fall/35 bg-fall/10 text-fall'
        }`}
      title="已拉到官方确认涨跌，持仓金额与收益已按确认值更新；下一交易日开盘后自动清除"
    >
      <span>已更新</span>
      {pctText !== '--' ? (
        <>
          <span className="opacity-50">｜</span>
          <span>{pctText}</span>
        </>
      ) : null}
      <span className="opacity-50">｜</span>
      <span>{navText}</span>
    </span>
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
