import {useEffect, useState} from 'react'
import {
  createFund,
  fetchIndustryFunds,
  type IndustryFundItem,
} from '@/lib/api'
import {cn, formatScaleYi} from '@/lib/utils'
import {Button} from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {listFunds} from '@/lib/portfolioStore'

export type SectorFundsTarget = {
  name: string
  sectorCode?: string
  mappingCode?: string
}

type FundRow = IndustryFundItem & {
  watched: boolean
}

export function SectorFundsDialog({
  open,
  onOpenChange,
  target,
  onWatchAdded,
  onOpenFund,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  target: SectorFundsTarget | null
  onWatchAdded?: () => void
  onOpenFund?: (fund: {code: string; name: string}) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [list, setList] = useState<FundRow[]>([])
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open || !target) return
    const sectorCode = String(target.sectorCode || '').trim()
    const mappingCode = String(target.mappingCode || '').trim()
    if (!sectorCode && !mappingCode) {
      setError('缺少板块代码')
      setList([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    setTitle(target.name || '板块基金')
    fetchIndustryFunds({sectorCode, mappingCode})
      .then((data) => {
        if (cancelled) return
        if (data.themeName) setTitle(data.themeName)
        const watched = new Set(listFunds('watch').map((f) => f.code))
        setList(
          (data.items || []).map((row) => ({
            ...row,
            watched: watched.has(row.code),
          })),
        )
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message || '加载失败')
          setList([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, target])

  async function onAddWatch(row: FundRow) {
    if (row.watched || adding[row.code]) return
    setAdding((m) => ({...m, [row.code]: true}))
    try {
      await createFund({code: row.code, name: row.name, type: 'watch'})
      setList((prev) =>
        prev.map((r) => (r.code === row.code ? {...r, watched: true} : r)),
      )
      onWatchAdded?.()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '添加失败')
    } finally {
      setAdding((m) => {
        const next = {...m}
        delete next[row.code]
        return next
      })
    }
  }

  const subtitle = title ? `${title}板块相关热搜基金` : '板块相关热搜基金'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-xl overflow-y-auto p-4 sm:max-w-2xl sm:p-5">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-base sm:text-lg">{title || '板块基金'}</DialogTitle>
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400/90">
            {subtitle}
          </p>
        </DialogHeader>

        {error ? <div className="mt-2 text-sm text-rise">{error}</div> : null}
        {loading ? (
          <div className="py-10 text-center text-sm text-muted">正在整理榜单…</div>
        ) : null}
        {!loading && !list.length && !error ? (
          <div className="py-10 text-center text-sm text-muted">暂无热搜基金</div>
        ) : null}

        {!loading && list.length ? (
          <div className="mt-2">
            <div className="mb-1 flex items-center gap-2 border-b border-line px-1 pb-1.5 text-[10px] font-semibold tracking-wider text-muted">
              <span className="w-6">#</span>
              <span className="flex-1">名称</span>
              <span className="w-20 text-right">规模</span>
              <span className="w-8" />
            </div>
            <div className="divide-y divide-line/70">
              {list.map((item, idx) => (
                <div
                  key={item.code}
                  className="flex cursor-pointer items-center gap-2 px-1 py-2.5 hover:bg-paper/70"
                  onClick={() => onOpenFund?.({code: item.code, name: item.name})}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenFund?.({code: item.code, name: item.name})
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <span className="w-6 font-mono text-[11px] text-muted">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <div className="font-mono text-[11px] text-muted">{item.code}</div>
                  </div>
                  <span className="w-20 text-right font-mono text-sm font-semibold tabular-nums">
                    {formatScaleYi(item.scale)}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={cn(
                      'h-7 w-8 shrink-0 px-0 text-sm',
                      item.watched && 'border-emerald-500/40 text-emerald-600',
                    )}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (item.watched) {
                        window.alert('已在列表中')
                        return
                      }
                      void onAddWatch(item)
                    }}
                    aria-label={item.watched ? '已在自选' : '添加自选'}
                  >
                    {item.watched ? '✓' : '+'}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
