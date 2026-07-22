import {useEffect, useState} from 'react'
import {Settings2} from 'lucide-react'
import {updateGoldConfig, type GoldPayload} from '@/lib/api'
import {formatAmount, formatMoney, pctClass} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {SparkTrend} from '@/components/SparkTrend'

function useGoldSettings(data: GoldPayload | null, onChanged: () => void) {
  const [open, setOpen] = useState(false)
  const [holding, setHolding] = useState('0')
  const [avgPrice, setAvgPrice] = useState('0')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!data) return
    setHolding(String(data.holding ?? 0))
    setAvgPrice(String(data.avgPrice ?? 0))
  }, [data?.holding, data?.avgPrice])

  const dialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AU9999 仓位设置</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setSaving(true)
            try {
              await updateGoldConfig({
                holding: Number(holding) || 0,
                avgPrice: Number(avgPrice) || 0,
              })
              setOpen(false)
              onChanged()
            } finally {
              setSaving(false)
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
          {data?.costPnl != null ? (
            <p className="text-xs text-muted">
              相对成本盈亏 {formatMoney(data.costPnl)}
              {data.costPnlPercent != null ? `（${data.costPnlPercent.toFixed(2)}%）` : ''}
            </p>
          ) : (
            <p className="text-xs text-muted">看板「实时收益」按当日涨跌估算。</p>
          )}
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
  )

  return {openSettings: () => setOpen(true), dialog}
}

function goldTrendPoints(data: GoldPayload | null) {
  return (data?.trend || [])
    .filter((p) => p.percent != null)
    .map((p) => ({time: p.time, value: p.percent as number}))
}

export function GoldMobileCard({
  data,
  loading,
  onChanged,
}: {
  data: GoldPayload | null
  loading?: boolean
  onChanged: () => void
}) {
  const {openSettings, dialog} = useGoldSettings(data, onChanged)
  const refPrice =
    data?.prevClose != null && data.prevClose > 0 ? data.prevClose : data?.price
  const amount =
    refPrice != null && data && data.holding > 0 ? refPrice * data.holding : null

  return (
    <>
      <div className="rounded-xl border border-gold/30 bg-gradient-to-r from-gold/10 to-paper/40 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">AU9999 沪金</div>
            <div className="font-mono text-xs text-muted">黄金</div>
          </div>
          <Button size="icon" variant="ghost" onClick={openSettings} title="仓位设置">
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
          <div>
            <div
              className="text-[11px] text-muted"
              title="昨收×克数（上一确认点），不含盘中浮动"
            >
              持仓金额
            </div>
            <div className="font-mono tabular-nums text-gold">
              {amount != null ? formatAmount(amount) : loading ? '...' : '--'}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted">实时收益</div>
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
          <SparkTrend
            height={56}
            title="AU9999 分时涨幅"
            accentColor="#b8860b"
            points={goldTrendPoints(data)}
          />
        </div>
      </div>
      {dialog}
    </>
  )
}

export function GoldTableRow({
  data,
  loading,
  onChanged,
}: {
  data: GoldPayload | null
  loading?: boolean
  onChanged: () => void
}) {
  const {openSettings, dialog} = useGoldSettings(data, onChanged)
  const refPrice =
    data?.prevClose != null && data.prevClose > 0 ? data.prevClose : data?.price
  const amount =
    refPrice != null && data && data.holding > 0 ? refPrice * data.holding : null

  return (
    <>
      <tr className="border-b border-gold/25 bg-gradient-to-r from-gold/10 to-transparent">
        <td className="px-3 py-3">
          <div className="font-medium text-ink">AU9999 沪金</div>
          <div className="font-mono text-xs text-muted">黄金</div>
        </td>
        <td className="px-3 py-3 font-mono tabular-nums text-gold">
          {amount != null ? formatAmount(amount) : loading ? '...' : '--'}
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
        <td className="min-w-[200px] px-3 py-2">
          <SparkTrend
            height={64}
            title="AU9999 分时涨幅"
            accentColor="#b8860b"
            points={goldTrendPoints(data)}
          />
        </td>
        <td className="w-28 whitespace-nowrap pl-8 pr-4 py-2">
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
  )
}
