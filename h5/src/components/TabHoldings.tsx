import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import '@/styles/tab-holdings.css'
import {
  fetchGold,
  fetchHoldings,
  fetchSettings,
  removeFund,
  type FundQuoteRow,
  type GoldPayload,
} from '@/lib/api'
import {formatAmount, formatMoney, formatPct, pctClass} from '@/lib/utils'
import type {AppTheme} from '@/lib/theme'
import DeskSync from '@/components/DeskSync'
import EcLine from '@/components/EcLine'
import SwipeRow from '@/components/SwipeRow'
import {
  IconCert,
  IconDelete,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconPlus,
  IconSetting,
  IconChart,
} from '@/components/icons'

type Props = {
  active: boolean
  theme: AppTheme
  contentMinHeight?: number
  resumeTick?: number
}

type HoldRow = FundQuoteRow & {
  name: string
  codeMark: string
  nameMarquee: boolean
  amountText: string
  weightText: string
  pnlText: string
  pctText: string
  pnlClass: string
  pctClass: string
  confirmPctText: string
  confirmPctClass: string
  sectorTags: string[]
  hasTags: boolean
}

const HIDE_KEY = 'holdings_hide_amounts'

function NameMarquee({name, marquee}: {name: string; marquee: boolean}) {
  const clipRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(marquee)

  useLayoutEffect(() => {
    const clip = clipRef.current
    const measure = measureRef.current
    if (!clip || !measure) return
    setOverflow(clip.clientWidth > 0 && measure.scrollWidth > clip.clientWidth + 1)
  }, [name])

  return (
    <div ref={clipRef} className={`name-clip${overflow ? ' is-marquee' : ''}`}>
      <div className="name-track">
        <span className="dense-name name-unit">{name}</span>
        {overflow ? <span className="dense-name name-unit">{name}</span> : null}
      </div>
      <span ref={measureRef} className="name-measure">
        {name}
      </span>
    </div>
  )
}

export default function TabHoldings({
  active,
  theme,
  contentMinHeight = 0,
  resumeTick = 0,
}: Props) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [list, setList] = useState<HoldRow[]>([])
  const [showGold, setShowGold] = useState(true)
  const [hideAmounts, setHideAmounts] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [totalAmountText, setTotalAmountText] = useState('--')
  const [totalPnlText, setTotalPnlText] = useState('--')
  const [totalPnlPctText, setTotalPnlPctText] = useState('--')
  const [gold, setGold] = useState<{
    hasGold: boolean
    goldPriceText: string
    goldValueText: string
    goldCostText: string
    goldCostClass: string
    goldCostPctText: string
    goldCostPctClass: string
  }>({
    hasGold: false,
    goldPriceText: '--',
    goldValueText: '--',
    goldCostText: '--',
    goldCostClass: 'flat',
    goldCostPctText: '--',
    goldCostPctClass: 'flat',
  })

  const refreshLocalFlags = useCallback(() => {
    try {
      const raw = localStorage.getItem(HIDE_KEY)
      setHideAmounts(raw === 'true' || raw === '1')
    } catch {
      // ignore
    }
  }, [])

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setError('')
      try {
        const results = await Promise.allSettled([
          fetchHoldings(),
          fetchGold(),
          fetchSettings(),
        ])
        const [h, g, s] = results

        if (h.status === 'fulfilled') {
          const summary = h.value.summary || {
            totalAmount: 0,
            totalPnl: 0,
            totalPnlPercent: 0,
          }
          setList(
            (h.value.list || []).map((row) => {
              const name = row.name || row.code || ''
              const confirmPct = row.dayGrowth != null ? row.dayGrowth : row.percent
              const sectors = Array.isArray(row.sectors) ? row.sectors : []
              const sectorTags = sectors.slice(0, 2)
              const confirmedUpdated = !!row.confirmedUpdated
              return {
                ...row,
                name,
                codeMark: String(row.code || '').slice(-6) || '······',
                nameMarquee: false,
                amountText: formatAmount(row.amount),
                weightText:
                  row.weight == null || Number.isNaN(row.weight)
                    ? '--'
                    : `${Number(row.weight).toFixed(1)}%`,
                pnlText: formatMoney(row.pnl),
                pctText: formatPct(row.percent),
                pnlClass: pctClass(row.pnl),
                pctClass: pctClass(row.percent),
                confirmedUpdated,
                confirmPctText: formatPct(confirmPct),
                confirmPctClass: pctClass(confirmPct),
                sectorTags,
                hasTags: confirmedUpdated || sectorTags.length > 0,
                trend: row.trend || [],
              }
            }),
          )
          setTotalAmountText(formatAmount(summary.totalAmount))
          setTotalPnlText(formatMoney(summary.totalPnl))
          setTotalPnlPctText(formatPct(summary.totalPnlPercent))
        }

        if (s.status === 'fulfilled') {
          setShowGold(s.value?.showGold !== false)
        }

        if (g.status === 'fulfilled') {
          const goldData = g.value as GoldPayload
          const holding = Number(goldData.holding) || 0
          const hasGold = holding > 0
          const marketValue =
            goldData.price != null && hasGold ? Number(goldData.price) * holding : null
          const costPnl = goldData.costPnl != null ? goldData.costPnl : null
          const costPct = goldData.costPnlPercent != null ? goldData.costPnlPercent : null
          setGold({
            hasGold,
            goldPriceText: goldData.price != null ? formatAmount(goldData.price, 2) : '--',
            goldValueText: formatAmount(marketValue),
            goldCostText: formatMoney(costPnl),
            goldCostClass: pctClass(costPnl),
            goldCostPctText: formatPct(costPct),
            goldCostPctClass: pctClass(costPct),
          })
        }

        if (results.every((r) => r.status === 'rejected')) {
          const failed = results[0] as PromiseRejectedResult
          setError(failed.reason?.message || '加载失败，请确认代理服务已启动')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!active) return
    refreshLocalFlags()
    void load()
    const timer = window.setInterval(() => void load(true), 30000)
    return () => window.clearInterval(timer)
  }, [active, load, refreshLocalFlags, resumeTick])

  const onToggleAmounts = () => {
    const next = !hideAmounts
    setHideAmounts(next)
    try {
      localStorage.setItem(HIDE_KEY, String(next))
    } catch {
      // ignore
    }
  }

  const onRemove = async (code: string, name: string) => {
    if (!window.confirm(`确认删除 ${name}？`)) return
    try {
      await removeFund(code)
      void load(true)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  const iconColor = theme === 'dark' ? '#C5D0E6' : '#243552'
  const plusColor = theme === 'dark' ? 'rgba(197,208,230,0.62)' : 'rgba(36,53,82,0.58)'
  const goldIcon = theme === 'dark' ? '#B8A078' : '#5A3E18'
  const chartColor = theme === 'dark' ? '#B8A078' : '#B8892D'
  const delColor = theme === 'dark' ? '#FF6B7A' : '#D7263D'

  return (
    <div className={`tab-root theme-${theme}`}>
      <div className="page-scroller" style={{overflowY: 'auto', height: '100%'}}>
        <div className={`page theme-${theme}`} style={{minHeight: contentMinHeight || undefined}}>
          <div className="summary">
            <div className="summary-glow" aria-hidden />
            <div className="summary-body">
              <div className="summary-metrics">
                <div className="summary-cell summary-cell-amount">
                  <span className="summary-cell-label">基金持仓总金额</span>
                  <div className="summary-amount-row">
                    {!hideAmounts ? <span className="summary-currency">¥</span> : null}
                    <span className="mono summary-amount">
                      {hideAmounts ? '***' : totalAmountText}
                    </span>
                  </div>
                </div>
                <div className="summary-divider" aria-hidden />
                <div className="summary-cell">
                  <span className="summary-cell-label">当日收益</span>
                  <span className="mono summary-cell-value">
                    {hideAmounts ? '***' : totalPnlText}
                  </span>
                </div>
                <div className="summary-divider" aria-hidden />
                <div className="summary-cell">
                  <span className="summary-cell-label">当日收益率</span>
                  <span className="mono summary-cell-value">{totalPnlPctText}</span>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={onToggleAmounts}
                aria-label={hideAmounts ? '显示金额' : '隐藏金额'}
              >
                {hideAmounts ? (
                  <IconEyeOff size={15} color={iconColor} />
                ) : (
                  <IconEye size={15} color={iconColor} />
                )}
              </button>
            </div>
          </div>

          {error ? <div className="err">{error}</div> : null}

          <div className="fund-divider">
            <div className="fund-divider-main">
              <div className="fund-divider-line" />
              <span className="fund-divider-text">持仓基金({list.length})</span>
              <div className="fund-divider-line" />
            </div>
            <button
              type="button"
              className="section-action"
              aria-label="添加基金"
              onClick={() => navigate('/fund-form?mode=hold')}
            >
              <IconPlus size={15} color={plusColor} />
            </button>
          </div>

          {loading && !list.length && !error ? (
            <DeskSync theme={theme} variant="hold" />
          ) : !loading && !list.length ? (
            <div className="section-empty">暂无持仓，点 + 添加</div>
          ) : (
            <div className="list-gap">
              {list.map((item) => (
                <SwipeRow
                  key={item.code}
                  rightWidth={130}
                  actions={[
                    {
                      key: 'edit',
                      label: '编辑',
                      className: 'edit',
                      icon: <IconEdit size={17} color={iconColor} />,
                      onClick: () => {
                        const q = item.name
                          ? `mode=hold&code=${item.code}&name=${encodeURIComponent(item.name)}`
                          : `mode=hold&code=${item.code}`
                        navigate(`/fund-form?${q}`)
                      },
                    },
                    {
                      key: 'del',
                      label: '删除',
                      className: 'del',
                      icon: <IconDelete size={17} color={delColor} />,
                      onClick: () => void onRemove(item.code, item.name),
                    },
                  ]}
                >
                  <div className={`glass dense-row tone-${item.pnlClass}`}>
                    <div className="dense-row-skin" aria-hidden>
                      <span className="card-mark mono">{item.codeMark}</span>
                    </div>
                    <div className="dense-main">
                      <NameMarquee name={item.name} marquee={item.nameMarquee} />
                      <div className="meta-row">
                        <span className="dense-amount mono">
                          {hideAmounts ? '***' : item.amountText}
                        </span>
                        <div className="weight-chip">
                          <div className="pie-icon" aria-hidden />
                          <span className="dense-weight mono">{item.weightText}</span>
                        </div>
                      </div>
                      {item.hasTags ? (
                        <div className="tag-row">
                          {item.confirmedUpdated ? (
                            <div
                              className={`confirmed-badge ${item.confirmPctClass}`}
                              aria-label="净值已更新"
                            >
                              <IconCert size={12} color="currentColor" />
                              {item.confirmPctText !== '--' ? (
                                <span className="mono">{item.confirmPctText}</span>
                              ) : null}
                            </div>
                          ) : null}
                          {item.sectorTags.map((tag) => (
                            <span className="sector-tag" key={tag}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className="spark"
                      onClick={() => {
                        const q = item.name
                          ? `code=${item.code}&name=${encodeURIComponent(item.name)}`
                          : `code=${item.code}`
                        navigate(`/fund-trend?${q}`)
                      }}
                    >
                      {item.trend?.length ? (
                        <EcLine
                          points={item.trend}
                          valueKey="growth"
                          mode="spark"
                          theme={theme}
                          height={56}
                          toneDelta={item.percent}
                        />
                      ) : null}
                    </button>

                    <div className="dense-right">
                      <span
                        className={`mono dense-pnl ${hideAmounts ? 'flat' : item.pnlClass}`}
                      >
                        {hideAmounts ? '***' : item.pnlText}
                      </span>
                      <span className={`mono dense-pct ${item.pctClass}`}>{item.pctText}</span>
                    </div>
                  </div>
                </SwipeRow>
              ))}
            </div>
          )}

          {showGold ? (
            <>
              <div className="gold-divider">
                <div className="gold-divider-main">
                  <div className="gold-divider-line" />
                  <span className="gold-divider-text">持仓黄金</span>
                  <div className="gold-divider-line" />
                </div>
                <button
                  type="button"
                  className="section-action gold-action"
                  aria-label="设置黄金"
                  onClick={() => navigate('/gold-edit')}
                >
                  <IconSetting size={15} color={goldIcon} />
                </button>
              </div>

              {loading && !gold.hasGold && !error ? (
                <DeskSync theme={theme} variant="gold" />
              ) : !loading && !gold.hasGold ? (
                <div className="section-empty gold-empty">暂无黄金持仓，点设置添加</div>
              ) : (
                <div className="gold-wrap">
                  <div className="glass gold-card">
                    <div className="gold-metrics">
                      <div className="gm">
                        <span className="gm-k">总价值</span>
                        <span className="mono gm-v gold-price">
                          {hideAmounts ? '***' : gold.goldValueText}
                        </span>
                      </div>
                      <div className="gm">
                        <span className="gm-k">相对成本</span>
                        <span
                          className={`mono gm-v ${
                            hideAmounts ? 'gold-price' : gold.goldCostClass
                          }`}
                        >
                          {hideAmounts ? '***' : gold.goldCostText}
                        </span>
                      </div>
                      <div className="gm">
                        <span className="gm-k">收益率</span>
                        <span className={`mono gm-v ${gold.goldCostPctClass}`}>
                          {gold.goldCostPctText}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="gm gm-price"
                        onClick={() => navigate('/gold-trend')}
                      >
                        <div className="gm-price-head">
                          <span className="gm-k">实时金价</span>
                          <IconChart size={13} color={chartColor} />
                        </div>
                        <span className="mono gm-v gold-price">{gold.goldPriceText}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
