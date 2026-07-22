import {useRef, useState} from 'react'
import {Download, Upload} from 'lucide-react'
import {exportConfig, importConfig, type AppConfig} from '@/lib/api'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function ConfigDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleExport() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const config = await exportConfig()
      const blob = new Blob([JSON.stringify(config, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `wzk-fund-config-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage('配置已导出')
    } catch (e: unknown) {
      setError((e as Error)?.message || '导出失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleImportFile(file: File) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as AppConfig
      if (!parsed?.funds || typeof parsed.funds !== 'object') {
        throw new Error('文件缺少 funds 字段')
      }
      await importConfig(parsed)
      setMessage('配置已导入')
      onImported()
    } catch (e: unknown) {
      setError((e as Error)?.message || '导入失败，请检查 JSON 文件')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>个人配置导入/导出</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted">
          导出包含持仓、自选、黄金仓位与展示开关；导入将覆盖当前本地配置。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={handleExport}>
            <Download className="h-4 w-4" />
            导出配置
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            导入配置
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
            }}
          />
        </div>
        {message ? <p className="mt-3 text-sm text-fall">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rise">{error}</p> : null}
      </DialogContent>
    </Dialog>
  )
}
