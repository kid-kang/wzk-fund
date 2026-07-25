import {useEffect, useState} from 'react'
import type {FundQuoteRow} from '@/lib/api'
import {isTradingDay} from '@/lib/tradingCalendar'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** 录入金额对应哪一版确认净值市值 */
export type AmountBasis = 'prev' | 'today'

type Payload = {
  code: string
  amount?: number
  /** 持仓金额口径：昨确认 / 今确认 */
  amountBasis?: AmountBasis
  type?: 'hold' | 'watch'
}

function defaultBasis(initial: FundQuoteRow | null): AmountBasis {
  // 非交易日列表金额即最新确认市值，固定按「今日结算」避免误选昨日
  if (!isTradingDay()) return 'today'
  if (!initial) return 'prev'
  return initial.percentSource === 'confirmed' ? 'today' : 'prev'
}

export function FundFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: 'hold' | 'watch'
  initial: FundQuoteRow | null
  onSubmit: (payload: Payload) => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [amount, setAmount] = useState('')
  const [amountBasis, setAmountBasis] = useState<AmountBasis>('prev')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const showAmountBasis = isTradingDay()

  useEffect(() => {
    if (!open) return
    setCode(initial?.code || '')
    setAmount(initial?.amount != null ? String(initial.amount) : '')
    setAmountBasis(defaultBasis(initial))
    setError('')
  }, [open, initial])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial
              ? mode === 'hold'
                ? '编辑持仓金额'
                : '编辑自选'
              : mode === 'hold'
                ? '添加持仓'
                : '添加自选'}
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            setSaving(true)
            setError('')
            try {
              const payload: Payload = {
                code: code.trim(),
                type: mode,
              }
              if (mode === 'hold') {
                payload.amount = Number(amount) || 0
                // 非交易日固定按今日结算，与隐藏口径选项一致
                payload.amountBasis = showAmountBasis ? amountBasis : 'today'
              }
              await onSubmit(payload)
              onOpenChange(false)
            } catch (err: unknown) {
              const msg =
                (err as {response?: {data?: {message?: string}}; message?: string})
                  ?.response?.data?.message ||
                (err as Error)?.message ||
                '保存失败'
              setError(msg)
            } finally {
              setSaving(false)
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">基金代码</Label>
            <Input
              id="code"
              value={code}
              disabled={!!initial}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="如 001618"
              inputMode="numeric"
              required
            />
          </div>

          {mode === 'hold' ? (
            <>
              {showAmountBasis ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium text-ink">金额口径</legend>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line/70 bg-paper/40 px-3 py-2.5">
                    <input
                      type="radio"
                      name="amountBasis"
                      className="mt-1"
                      checked={amountBasis === 'prev'}
                      onChange={() => setAmountBasis('prev')}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">昨日结算的持仓金额</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        用昨确认净值算份额；列表金额之后按最新净值实时计算
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line/70 bg-paper/40 px-3 py-2.5">
                    <input
                      type="radio"
                      name="amountBasis"
                      className="mt-1"
                      checked={amountBasis === 'today'}
                      onChange={() => setAmountBasis('today')}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm text-ink">今日结算的持仓金额</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        输入即今日确认市值（与列表一致）；用今净值算份额
                      </span>
                    </span>
                  </label>
                </fieldset>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="amount">持仓金额</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={
                    showAmountBasis
                      ? '填写与上方口径一致的金额'
                      : '填写今日结算的持仓金额'
                  }
                  required
                />
              </div>
            </>
          ) : null}

          {mode === 'watch' && initial ? (
            <p className="text-sm text-muted">
              自选仅需基金代码，当前：{initial.name || initial.code}
            </p>
          ) : null}

          {error ? <p className="text-sm text-rise">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={saving || (mode === 'watch' && !!initial)}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
