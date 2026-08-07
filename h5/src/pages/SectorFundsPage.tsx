import {useCallback, useEffect, useRef, useState, type MouseEvent} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import '@/styles/sector-funds.css'
import AppNavBar from '@/components/AppNavBar'
import {
  createFund,
  fetchIndustryFunds,
  type IndustryFundItem,
} from '@/lib/api'
import {getFund} from '@/lib/portfolioStore'
import {formatPct, pctClass} from '@/lib/utils'

type FundRow = IndustryFundItem & {
  pctText: string
  pctClass: string
  watched: boolean
  rankText: string
}

function makeSubtitle(name: string) {
  const n = String(name || '').trim()
  return n ? `${n}板块相关热搜基金` : '板块相关热搜基金'
}

function decorate(rows: IndustryFundItem[]): FundRow[] {
  return rows.map((row, idx) => {
    const fund = getFund(row.code)
    const watched = !!(fund && (fund.type === 'watch' || fund.type === 'hold'))
    return {
      ...row,
      pctText: formatPct(row.percent),
      pctClass: pctClass(row.percent),
      watched,
      rankText: String(idx + 1),
    }
  })
}

export default function SectorFundsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const mappingCode = String(
    params.get('mappingCode') || params.get('code') || '',
  ).trim()
  const initialName = params.get('name')
    ? decodeURIComponent(params.get('name') || '')
    : ''

  const [name, setName] = useState(initialName)
  const [list, setList] = useState<FundRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const addingRef = useRef<Record<string, boolean>>({})
  const epochRef = useRef(0)
  const navTitle = name || '板块基金'
  const subtitle = makeSubtitle(name)

  const load = useCallback(async () => {
    const epoch = ++epochRef.current
    if (!mappingCode) {
      setLoading(false)
      setError('缺少板块代码')
      setList([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await fetchIndustryFunds(mappingCode)
      if (epoch !== epochRef.current) return
      if (data.themeName) setName(data.themeName)
      setList(decorate(data.items || []))
      setLoading(false)
    } catch (e) {
      if (epoch !== epochRef.current) return
      setLoading(false)
      setError(e instanceof Error ? e.message : '加载失败')
      setList([])
    }
  }, [mappingCode])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), 1600)
    return () => window.clearTimeout(t)
  }, [toast])

  const onAddWatch = async (row: FundRow, e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (row.watched) {
      setToast('已在列表中')
      return
    }
    if (addingRef.current[row.code]) return
    addingRef.current[row.code] = true
    try {
      await createFund({code: row.code, name: row.name, type: 'watch'})
      setList((prev) => decorate(prev))
      setToast('已添加自选')
    } catch (err) {
      setToast(err instanceof Error ? err.message : '添加失败')
    } finally {
      delete addingRef.current[row.code]
    }
  }

  const openFund = (item: FundRow) => {
    navigate(
      `/fund-trend?code=${item.code}&name=${encodeURIComponent(item.name || '')}`,
    )
  }

  return (
    <div className="subpage-root sf-shell">
      <div className="subpage-nav">
        <AppNavBar title={navTitle} theme="light" bgColor="transparent" />
      </div>
      <div className="subpage-scroller sf-scroller" style={{overflowY: 'auto'}}>
        <div className="sf-page">
          <span className="sf-ghost" aria-hidden>
            {name || '板块'}
          </span>

          {error ? <div className="sf-err">{error}</div> : null}

          <div className="sf-body">
            <div className="sf-sticky">
              <div className="sf-toolbar">
                <span className="sf-eyebrow">{subtitle}</span>
              </div>
              {!loading && list.length ? (
                <div className="sf-head">
                  <span className="sf-h-rank">#</span>
                  <span className="sf-h-name">名称</span>
                  <span className="sf-h-pct">估涨跌</span>
                  <span className="sf-h-act" />
                </div>
              ) : null}
            </div>

            {loading ? (
              <div className="sf-state">
                <div className="sf-bar" aria-hidden />
                <span className="sf-state-t">正在整理榜单</span>
              </div>
            ) : null}

            {!loading && !list.length && !error ? (
              <div className="sf-state">
                <span className="sf-state-t">暂无热搜基金</span>
                <span className="sf-state-h">稍后再看</span>
              </div>
            ) : null}

            {!loading && list.length
              ? list.map((item) => (
                  <div
                    className="sf-row"
                    key={item.code}
                    role="button"
                    tabIndex={0}
                    onClick={() => openFund(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openFund(item)
                      }
                    }}
                  >
                    <span className="sf-rank">{item.rankText}</span>
                    <span className="sf-main">
                      <span className="sf-name">{item.name}</span>
                      <span className="sf-code">{item.code}</span>
                    </span>
                    <span className={`sf-pct ${item.pctClass}`}>{item.pctText}</span>
                    <button
                      type="button"
                      className={`sf-add${item.watched ? ' is-on' : ''}`}
                      aria-label={item.watched ? '已在自选' : '添加自选'}
                      onClick={(e) => void onAddWatch(item, e)}
                    >
                      {item.watched ? '✓' : '+'}
                    </button>
                  </div>
                ))
              : null}
          </div>
        </div>
      </div>

      {toast ? <div className="sf-toast">{toast}</div> : null}
    </div>
  )
}
