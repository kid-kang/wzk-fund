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
  type HoldGroupPayload,
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
  IconPlus,
  IconQuestion,
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
  discloseTimeText: string
  showDiscloseTime: boolean
  sectorTags: string[]
  hasTags: boolean
}

const HIDE_KEY = 'holdings_hide_amounts'

const EMPTY_GROUP: HoldGroupPayload = {
  list: [],
  summary: {totalAmount: 0, bodTotal: 0, totalPnl: 0, totalPnlPercent: 0},
}

function NameMarquee({name}: {name: string}) {
  const clipRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)

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

function mapHoldRow(row: FundQuoteRow, weight?: number): HoldRow {
  const name = row.name || row.code || ''
  const confirmPct = row.dayGrowth != null ? row.dayGrowth : row.percent
  const sectors = Array.isArray(row.sectors) ? row.sectors : []
  const sectorTags = sectors.slice(0, 2)
  const confirmedUpdated = !!row.confirmedUpdated
  const discloseTimeText = String(row.discloseTimeText || '').trim()
  const showDiscloseTime = !!discloseTimeText
  const w = weight != null ? weight : row.weight
  return {
    ...row,
    name,
    codeMark: String(row.code || '').slice(-6) || '······',
    nameMarquee: false,
    amountText: formatAmount(row.amount),
    weightText: w == null || Number.isNaN(w) ? '--' : `${Number(w).toFixed(1)}%`,
    pnlText: formatMoney(row.pnl),
    pctText: formatPct(row.percent),
    pnlClass: pctClass(row.pnl),
    pctClass: pctClass(row.percent),
    confirmedUpdated,
    confirmPctText: formatPct(confirmPct),
    confirmPctClass: pctClass(confirmPct),
    discloseTimeText,
    showDiscloseTime,
    sectorTags,
    hasTags: confirmedUpdated || showDiscloseTime || sectorTags.length > 0,
    weight: w,
    trend: row.trend || [],
  }
}

function pctOfTotal(part: number, total: number) {
  const p = Number(part) || 0
  const t = Number(total) || 0
  if (!(t > 0)) return 0
  return Math.round((p / t) * 1000) / 10
}

function withPortfolioWeight(rows: FundQuoteRow[], grandTotal: number): HoldRow[] {
  return (rows || []).map((row) => mapHoldRow(row, pctOfTotal(row.amount, grandTotal)))
}

export default function TabHoldings({
  active,
  theme,
  contentMinHeight = 0,
  resumeTick = 0,
}: Props) {
  const navigate = useNavigate()
  const loadEpochRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [realtimeList, setRealtimeList] = useState<HoldRow[]>([])
  const [delayedList, setDelayedList] = useState<HoldRow[]>([])
  const [hasRealtime, setHasRealtime] = useState(false)
  const [hasDelayed, setHasDelayed] = useState(false)
  const [hasPortfolio, setHasPortfolio] = useState(false)
  const [showGold, setShowGold] = useState(true)
  const [hideAmounts, setHideAmounts] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [domesticAmountText, setDomesticAmountText] = useState('--')
  const [foreignAmountText, setForeignAmountText] = useState('--')
  const [domesticShareText, setDomesticShareText] = useState('--')
  const [foreignShareText, setForeignShareText] = useState('--')
  const [domesticPnlText, setDomesticPnlText] = useState('--')
  const [domesticPnlPctText, setDomesticPnlPctText] = useState('--')
  const [foreignPnlText, setForeignPnlText] = useState('--')
  const [foreignPnlPctText, setForeignPnlPctText] = useState('--')
  const [goldWeightText, setGoldWeightText] = useState('')
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

  const load = useCallback(async (silent = false) => {
    const epoch = ++loadEpochRef.current
    if (!silent) setLoading(true)
    setError('')
    try {
      const results = await Promise.allSettled([
        fetchHoldings(),
        fetchGold(),
        fetchSettings(),
      ])
      if (epoch !== loadEpochRef.current) return
      const [h, g, s] = results

      let nextShowGold = true
      if (s.status === 'fulfilled') {
        nextShowGold = s.value?.showGold !== false
        setShowGold(nextShowGold)
      }

      let domesticAmount = 0
      let foreignAmount = 0
      let domesticPnl = 0
      let foreignPnl = 0
      let realtimeRaw: FundQuoteRow[] = []
      let delayedRaw: FundQuoteRow[] = []

      if (h.status === 'fulfilled') {
        const groups = h.value.groups || {
          realtime: EMPTY_GROUP,
          delayed: EMPTY_GROUP,
        }
        realtimeRaw = groups.realtime.list || []
        delayedRaw = groups.delayed.list || []
        domesticAmount = Number(groups.realtime.summary?.totalAmount) || 0
        foreignAmount = Number(groups.delayed.summary?.totalAmount) || 0
        domesticPnl = Number(groups.realtime.summary?.totalPnl) || 0
        foreignPnl = Number(groups.delayed.summary?.totalPnl) || 0
        setHasRealtime(realtimeRaw.length > 0)
        setHasDelayed(delayedRaw.length > 0)
      }

      let goldValue = 0
      let hasGold = false
      if (g.status === 'fulfilled') {
        const goldData = g.value as GoldPayload
        const holding = Number(goldData.holding) || 0
        hasGold = holding > 0
        goldValue = goldData.price != null && hasGold ? Number(goldData.price) * holding : 0
        const costPnl = goldData.costPnl != null ? goldData.costPnl : null
        const costPct = goldData.costPnlPercent != null ? goldData.costPnlPercent : null
        setGold({
          hasGold,
          goldPriceText: goldData.price != null ? formatAmount(goldData.price, 2) : '--',
          goldValueText: formatAmount(hasGold ? goldValue : null),
          goldCostText: formatMoney(costPnl),
          goldCostClass: pctClass(costPnl),
          goldCostPctText: formatPct(costPct),
          goldCostPctClass: pctClass(costPct),
        })
      }

      const goldInPortfolio = nextShowGold && hasGold ? goldValue : 0
      const grandTotal = domesticAmount + foreignAmount + goldInPortfolio
      const nextHasPortfolio =
        realtimeRaw.length > 0 || delayedRaw.length > 0 || goldInPortfolio > 0

      setHasPortfolio(nextHasPortfolio)
      setRealtimeList(withPortfolioWeight(realtimeRaw, grandTotal))
      setDelayedList(withPortfolioWeight(delayedRaw, grandTotal))

      setDomesticAmountText(formatAmount(domesticAmount))
      setForeignAmountText(formatAmount(foreignAmount))
      setDomesticShareText(`${pctOfTotal(domesticAmount, grandTotal).toFixed(1)}%`)
      setForeignShareText(`${pctOfTotal(foreignAmount, grandTotal).toFixed(1)}%`)
      setDomesticPnlText(formatMoney(domesticPnl))
      const domesticPnlPct = domesticAmount > 0 ? (domesticPnl / domesticAmount) * 100 : 0
      setDomesticPnlPctText(formatPct(domesticPnlPct))
      setForeignPnlText(formatMoney(foreignPnl))
      const foreignPnlPct = foreignAmount > 0 ? (foreignPnl / foreignAmount) * 100 : 0
      setForeignPnlPctText(formatPct(foreignPnlPct))
      setGoldWeightText(
        goldInPortfolio > 0 ? `${pctOfTotal(goldInPortfolio, grandTotal).toFixed(1)}%` : '',
      )

      if (results.every((r) => r.status === 'rejected')) {
        const failed = results[0] as PromiseRejectedResult
        setError(failed.reason?.message || '加载失败，请确认代理服务已启动')
      }
    } catch (e) {
      if (epoch !== loadEpochRef.current) return
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      if (epoch === loadEpochRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    refreshLocalFlags()
    void load()
    const timer = window.setInterval(() => void load(true), 30000)
    return () => window.clearInterval(timer)
  }, [active, load, refreshLocalFlags, resumeTick])

  const dropHoldRow = (code: string) => {
    const key = String(code || '').padStart(6, '0')
    const nextRt = realtimeList.filter((r) => r.code !== key)
    const nextDl = delayedList.filter((r) => r.code !== key)
    setRealtimeList(nextRt)
    setDelayedList(nextDl)
    setHasRealtime(nextRt.length > 0)
    setHasDelayed(nextDl.length > 0)
    setHasPortfolio(
      nextRt.length > 0 || nextDl.length > 0 || (showGold && gold.hasGold),
    )
  }

  const onRemove = async (code: string, name: string) => {
    if (!window.confirm(`确认删除 ${name}？`)) return
    try {
      await removeFund(code)
      dropHoldRow(code)
      void load(true)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败')
    }
  }

  const openQa = (q: string) => {
    navigate(`/fund-qa?q=${encodeURIComponent(q)}`)
  }

  const iconColor = theme === 'dark' ? '#C5D0E6' : '#243552'
  const tipColor = theme === 'dark' ? 'rgba(154,168,255,0.9)' : 'rgba(79,93,255,0.75)'
  const tipColorSm = theme === 'dark' ? 'rgba(154,168,255,0.85)' : 'rgba(79,93,255,0.72)'
  const goldIcon = theme === 'dark' ? '#B8A078' : '#5A3E18'
  const chartColor = theme === 'dark' ? '#B8A078' : '#B8892D'
  const delColor = theme === 'dark' ? '#FF6B7A' : '#D7263D'
  const fabColor = theme === 'dark' ? '#7b88ff' : '#4f5dff'

  const renderHoldRow = (item: HoldRow) => (
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
          <NameMarquee name={item.name} />
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
              {item.confirmedUpdated && !item.showDiscloseTime ? (
                <button
                  type="button"
                  className={`confirmed-badge ${item.confirmPctClass}`}
                  aria-label="净值已更新，查看说明"
                  onClick={() => openQa('badge-cn')}
                >
                  <IconCert size={12} color="currentColor" />
                  {item.confirmPctText !== '--' ? (
                    <span className="mono">{item.confirmPctText}</span>
                  ) : null}
                </button>
              ) : null}
              {item.showDiscloseTime ? (
                <button
                  type="button"
                  className={`confirmed-badge is-disclose ${item.confirmPctClass}`}
                  aria-label="官方披露日期，查看说明"
                  onClick={() => openQa('badge-qdii')}
                >
                  <span className="mono">{item.discloseTimeText}</span>
                </button>
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
          <button
            type="button"
            className={`mono dense-pct ${item.pctClass}`}
            aria-label="查看涨跌幅说明"
            onClick={() => openQa('a-share')}
          >
            {item.pctText}
          </button>
          <span className={`mono dense-pnl ${hideAmounts ? 'flat' : item.pnlClass}`}>
            {hideAmounts ? '***' : item.pnlText}
          </span>
        </div>
      </div>
    </SwipeRow>
  )

  return (
    <div className={`tab-root theme-${theme}`}>
      <div className="page-scroller" style={{overflowY: 'auto', height: '100%'}}>
        <div
          className={`page theme-${theme} hold-page`}
          style={{minHeight: contentMinHeight || undefined}}
        >
          {error ? <div className="err">{error}</div> : null}

          {loading && !hasPortfolio && !error ? (
            <DeskSync theme={theme} variant="hold" />
          ) : null}

          {!loading && !hasPortfolio ? (
            <div className="section-empty">暂无持仓，点右下角 + 添加</div>
          ) : null}

          {hasRealtime ? (
            <>
              <div className="fund-divider">
                <div className="fund-divider-main">
                  <div className="fund-divider-line" />
                  <span className="fund-divider-text">
                    境内基金({realtimeList.length})
                  </span>
                  <div className="fund-divider-line" />
                </div>
              </div>
              <div className="section-pnl-bar is-quad">
                <div className="section-pnl-cell">
                  <span className="section-pnl-label">持仓</span>
                  <span className="mono section-pnl-value">
                    {hideAmounts ? '***' : domesticAmountText}
                  </span>
                </div>
                <div className="section-pnl-gap" aria-hidden />
                <div className="section-pnl-cell">
                  <span className="section-pnl-label">持仓占比</span>
                  <span className="mono section-pnl-value">{domesticShareText}</span>
                </div>
                <div className="section-pnl-gap" aria-hidden />
                <div className="section-pnl-cell">
                  <span className="section-pnl-label">当日实时收益</span>
                  <span className="mono section-pnl-value">
                    {hideAmounts ? '***' : domesticPnlText}
                  </span>
                </div>
                <div className="section-pnl-gap" aria-hidden />
                <div className="section-pnl-cell">
                  <span className="section-pnl-label">当日实时收益率</span>
                  <span className="mono section-pnl-value">{domesticPnlPctText}</span>
                </div>
              </div>
              <div className="list-gap">{realtimeList.map(renderHoldRow)}</div>
            </>
          ) : null}

          {hasDelayed ? (
            <>
              <div className="fund-divider is-follow">
                <div className="fund-divider-main">
                  <div className="fund-divider-line" />
                  <div className="fund-divider-title">
                    <span className="fund-divider-text">
                      QDII · 海外({delayedList.length})
                    </span>
                    <button
                      type="button"
                      className="fund-divider-tip"
                      aria-label="查看 QDII 申购与收益说明"
                      onClick={() => openQa('add-hold')}
                    >
                      <IconQuestion size={14} color={tipColor} />
                    </button>
                  </div>
                  <div className="fund-divider-line" />
                </div>
              </div>
              <div className="section-pnl-bar is-quad">
                <div className="section-pnl-cell">
                  <span className="section-pnl-label">持仓</span>
                  <span className="mono section-pnl-value">
                    {hideAmounts ? '***' : foreignAmountText}
                  </span>
                </div>
                <div className="section-pnl-gap" aria-hidden />
                <div className="section-pnl-cell">
                  <span className="section-pnl-label">持仓占比</span>
                  <span className="mono section-pnl-value">{foreignShareText}</span>
                </div>
                <div className="section-pnl-gap" aria-hidden />
                <div className="section-pnl-cell">
                  <div className="section-pnl-label-row">
                    <span className="section-pnl-label">当前日收益</span>
                    <button
                      type="button"
                      className="section-pnl-tip"
                      aria-label="查看当前日收益说明"
                      onClick={() => openQa('qdii-pnl')}
                    >
                      <IconQuestion size={12} color={tipColorSm} />
                    </button>
                  </div>
                  <span className="mono section-pnl-value">
                    {hideAmounts ? '***' : foreignPnlText}
                  </span>
                </div>
                <div className="section-pnl-gap" aria-hidden />
                <div className="section-pnl-cell">
                  <div className="section-pnl-label-row">
                    <span className="section-pnl-label">当前日收益率</span>
                    <button
                      type="button"
                      className="section-pnl-tip"
                      aria-label="查看当前日收益率说明"
                      onClick={() => openQa('qdii-pnl')}
                    >
                      <IconQuestion size={12} color={tipColorSm} />
                    </button>
                  </div>
                  <span className="mono section-pnl-value">{foreignPnlPctText}</span>
                </div>
              </div>
              <div className="list-gap">{delayedList.map(renderHoldRow)}</div>
            </>
          ) : null}

          {showGold ? (
            <>
              <div className="gold-divider">
                <div className="gold-divider-main">
                  <div className="gold-divider-line" />
                  <div className="gold-divider-title">
                    <span className="gold-divider-text">持仓黄金</span>
                    {goldWeightText ? (
                      <div className="gold-share">
                        <div className="gold-share-mark" aria-hidden />
                        <span className="gold-divider-text gold-share-pct">
                          {goldWeightText}
                        </span>
                      </div>
                    ) : null}
                  </div>
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
                      <div className="gm gold-price">
                        <span className="gm-k">总价值</span>
                        <span className="mono gm-v">
                          {hideAmounts ? '***' : gold.goldValueText}
                        </span>
                      </div>
                      <div className="gm gold-price">
                        <span className="gm-k">相对成本</span>
                        <span
                          className={`mono gm-v ${
                            hideAmounts ? '' : gold.goldCostClass
                          }`}
                        >
                          {hideAmounts ? '***' : gold.goldCostText}
                        </span>
                      </div>
                      <div className="gm gold-price">
                        <span className="gm-k">收益率</span>
                        <span className={`mono gm-v ${gold.goldCostPctClass}`}>
                          {gold.goldCostPctText}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="gm gm-price gold-price"
                        onClick={() => navigate('/gold-trend')}
                      >
                        <div className="gm-price-head">
                          <span className="gm-k">实时金价</span>
                          <IconChart size={13} color={chartColor} />
                        </div>
                        <span className="mono gm-v">{gold.goldPriceText}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}

          {hasPortfolio ? <div className="fab-spacer" aria-hidden /> : null}
        </div>
      </div>

      <button
        type="button"
        className="fab-add"
        aria-label="添加持仓"
        onClick={() => navigate('/fund-form?mode=hold')}
      >
        <IconPlus size={22} color={fabColor} />
      </button>
    </div>
  )
}
