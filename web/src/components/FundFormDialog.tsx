import {useEffect, useState} from 'react'
import type {FundQuoteRow} from '@/lib/api'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Payload = {
  code: string
  amount?: number
  type?: 'hold' | 'watch'
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setCode(initial?.code || '')
    setAmount(initial?.amount != null ? String(initial.amount) : '')
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
            <p className="text-xs text-muted">名称与板块将自动从公开接口获取</p>
          </div>

          {mode === 'hold' ? (
            <div className="space-y-1.5">
              <Label htmlFor="amount">持仓金额</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="上一确认涨幅后的确认市值"
                required
              />
              <p className="text-xs text-muted">
                填上一确认市值（交易时段即昨日确认额）。晚间净值确认后系统会按确认涨跌自动滚动，无需每天手改。
              </p>
            </div>
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
