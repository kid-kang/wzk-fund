import { useEffect, useState } from 'react';
import type { FundQuoteRow } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Payload = {
  code: string;
  name?: string;
  amount?: number;
  shares?: number;
  sectors?: string[];
  type?: 'hold' | 'watch';
};

export function FundFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'hold' | 'watch';
  initial: FundQuoteRow | null;
  onSubmit: (payload: Payload) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('0');
  const [shares, setShares] = useState('0');
  const [sectors, setSectors] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setCode(initial?.code || '');
    setName(initial?.name || '');
    setAmount(String(initial?.amount ?? 0));
    setShares(String(initial?.shares ?? 0));
    setSectors((initial?.sectors || []).join(','));
    setError('');
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? '编辑基金' : mode === 'hold' ? '添加持仓' : '添加自选'}
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError('');
            try {
              await onSubmit({
                code: code.trim(),
                name: name.trim() || undefined,
                amount: Number(amount) || 0,
                shares: Number(shares) || 0,
                sectors: sectors
                  .split(/[,，]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
                type: mode,
              });
              onOpenChange(false);
            } catch (err: unknown) {
              const msg =
                (err as { response?: { data?: { message?: string } }; message?: string })
                  ?.response?.data?.message ||
                (err as Error)?.message ||
                '保存失败';
              setError(msg);
            } finally {
              setSaving(false);
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="code">基金代码</Label>
            <Input
              id="code"
              value={code}
              disabled={!!initial}
              onChange={(e) => setCode(e.target.value)}
              placeholder="如 001618"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">名称（可留空自动搜索）</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="自动填充"
            />
          </div>
          {mode === 'hold' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="amount">持仓金额</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shares">持仓份额（可选）</Label>
                <Input
                  id="shares"
                  type="number"
                  step="0.01"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="sectors">关联板块（逗号分隔）</Label>
            <Input
              id="sectors"
              value={sectors}
              onChange={(e) => setSectors(e.target.value)}
              placeholder="电子,半导体"
            />
          </div>
          {error ? <p className="text-sm text-rise">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
}
