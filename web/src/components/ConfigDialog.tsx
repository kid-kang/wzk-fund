import {useState} from 'react'
import {ClipboardCopy, ClipboardPaste} from 'lucide-react'
import {exportConfig, importConfig, type AppConfig} from '@/lib/api'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  // 非安全上下文等降级
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.left = '-9999px'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(ta)
  if (!ok) throw new Error('复制失败，请检查浏览器权限')
}

async function readClipboard() {
  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText()
  }
  throw new Error('当前浏览器不支持读取剪贴板，请手动粘贴到支持的环境')
}

export function ConfigDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleExport() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const config = await exportConfig()
      await writeClipboard(JSON.stringify(config, null, 2))
      setMessage('已复制到剪贴板')
    } catch (e: unknown) {
      setError((e as Error)?.message || '导出失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const text = (await readClipboard()).trim()
      if (!text) throw new Error('剪贴板为空')
      const parsed = JSON.parse(text) as AppConfig
      if (!parsed?.funds || typeof parsed.funds !== 'object') {
        throw new Error('剪贴板 JSON 缺少 funds 字段')
      }
      await importConfig(parsed)
      setMessage('配置已导入')
      onImported()
    } catch (e: unknown) {
      if (e instanceof SyntaxError) {
        setError('剪贴板不是有效 JSON')
      } else {
        setError((e as Error)?.message || '导入失败，请确认剪贴板是有效配置 JSON')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>个人配置导入/导出</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted">
          持仓、自选、黄金与开关保存在本机浏览器（localStorage）。导出复制到剪贴板，导入从剪贴板读取
          JSON；导入将覆盖当前本机配置。清浏览器数据会丢失，请定期备份。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={handleExport}>
            <ClipboardCopy className="h-4 w-4" />
            导出配置
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleImport()}>
            <ClipboardPaste className="h-4 w-4" />
            导入配置
          </Button>
        </div>
        {message ? <p className="mt-3 text-sm text-fall">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rise">{error}</p> : null}
      </DialogContent>
    </Dialog>
  )
}
