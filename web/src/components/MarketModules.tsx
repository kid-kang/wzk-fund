import {useState} from 'react'
import type {IndexItem, MarketOverview} from '@/lib/api'
import {formatPct, pctClass} from '@/lib/utils'
import {Panel, PanelHeader} from '@/components/ui/panel'
import {IndexTrendDialog} from '@/components/IndexTrendDialog'

const INDEX_SHORT: Record<string, string> = {
  '000001': '上证',
  '399001': '深成',
  '399006': '创业',
  '899050': '北证',
  '000688': '科创',
  '000016': '上证50',
  '000300': '沪深300',
  '000905': '中证500',
  NDX: '纳指',
  SPX: '标普',
}

/** 涨跌温度条：放在指数看板上方 */
export function BreadthModule({
  data,
  loading,
}: {
  data: MarketOverview | null
  loading?: boolean
}) {
  const up = data?.upDown.up ?? 0
  const down = data?.upDown.down ?? 0
  const traded = Math.max(up + down, 1)
  const upShare = (up / traded) * 100
  const downShare = (down / traded) * 100

  return (
    <Panel className="w-full min-w-0">
      <div className="px-4 py-3 sm:px-5 sm:py-3.5">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="text-xs font-semibold tracking-wide rise">涨</span>
            <span className="font-mono text-xl font-semibold tabular-nums leading-none rise">
              {loading && !data ? '...' : `${upShare.toFixed(1)}%`}
            </span>
          </div>
          <div className="flex min-w-0 items-baseline justify-end gap-2">
            <span className="font-mono text-xl font-semibold tabular-nums leading-none fall">
              {loading && !data ? '...' : `${downShare.toFixed(1)}%`}
            </span>
            <span className="text-xs font-semibold tracking-wide fall">跌</span>
          </div>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-fall/25">
          <div
            className="h-full rounded-l-full bg-rise transition-[width] duration-500 ease-out"
            style={{width: `${upShare}%`}}
          />
        </div>
      </div>
    </Panel>
  )
}

export function IndicesModule({
  list,
  loading,
}: {
  list: IndexItem[]
  loading?: boolean
}) {
  const [active, setActive] = useState<IndexItem | null>(null)
  const [open, setOpen] = useState(false)

  return (
    <Panel className="w-full min-w-0">
      <PanelHeader title="指数看板" desc="点击查看历史趋势" />
      <div className="grid grid-cols-5 gap-0 px-2 py-1.5 sm:px-3">
        {loading && !list.length
          ? Array.from({length: 10}).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse border-b border-r border-line/50 [&:nth-child(5n)]:border-r-0 [&:nth-child(n+6)]:border-b-0"
              />
            ))
          : list.map((item) => {
              const tone = pctClass(item.percent)
              return (
                <button
                  key={item.code}
                  type="button"
                  className="min-w-0 border-b border-r border-line/60 px-2 py-2.5 text-center transition-colors hover:bg-paper/70 active:scale-[0.99] [&:nth-child(5n)]:border-r-0 [&:nth-child(n+6)]:border-b-0"
                  onClick={() => {
                    setActive(item)
                    setOpen(true)
                  }}
                >
                  <div className="truncate text-[11px] font-medium tracking-wide text-muted">
                    {INDEX_SHORT[item.code] || item.name}
                  </div>
                  <div
                    className={`font-mono text-sm font-semibold tabular-nums leading-tight ${tone}`}
                  >
                    {formatPct(item.percent)}
                  </div>
                </button>
              )
            })}
      </div>

      <IndexTrendDialog item={active} open={open} onOpenChange={setOpen} />
    </Panel>
  )
}

export function MarketModule({
  data,
  loading,
}: {
  data: MarketOverview | null
  loading?: boolean
}) {
  const [boardTab, setBoardTab] = useState<'hot' | 'gainers'>('gainers')
  const gainers = data?.boardGainers || []
  const hot = data?.hotSearch?.length ? data.hotSearch : gainers
  const boardItems = boardTab === 'hot' ? hot : gainers
  const sourceHint =
    data?.boardSource === 'xiaobei' ? '小倍板块热搜 / 涨幅' : '概念板块涨跌'

  return (
    <Panel className="h-full min-w-0">
      <PanelHeader title="今日板块榜" desc={sourceHint} />
      <div className="px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
        <div className="mb-2 flex justify-end">
          <div className="inline-flex rounded-xl bg-paper-deep/80 p-0.5">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                boardTab === 'hot' ? 'bg-panel text-ink shadow-sm' : 'text-muted'
              }`}
              onClick={() => setBoardTab('hot')}
            >
              热搜
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                boardTab === 'gainers' ? 'bg-panel text-ink shadow-sm' : 'text-muted'
              }`}
              onClick={() => setBoardTab('gainers')}
            >
              涨幅
            </button>
          </div>
        </div>
        <div className="space-y-0.5">
          {loading && !boardItems.length ? (
            <div className="py-6 text-center text-xs text-muted">加载中...</div>
          ) : boardItems.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted">暂无数据</div>
          ) : (
            boardItems.map((item, idx) => {
              const rank = idx + 1
              const rankText = rank < 10 ? `0${rank}` : String(rank)
              return (
                <div
                  key={`${boardTab}-${item.code}`}
                  className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 ${
                    idx % 2 === 0 ? 'bg-paper/55' : ''
                  }`}
                >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`w-6 font-mono text-xs font-semibold tabular-nums ${
                          rank === 1
                            ? 'text-[#c9a227]'
                            : rank === 2
                              ? 'text-[#8e99a8]'
                              : rank === 3
                                ? 'text-[#b87333]'
                                : 'font-normal text-muted/80'
                        }`}
                      >
                        {rankText}
                      </span>
                    <span className="truncate text-sm font-normal">{item.name}</span>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${pctClass(item.percent)}`}
                  >
                    {formatPct(item.percent)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Panel>
  )
}
