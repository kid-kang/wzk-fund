import {useEffect, useRef, useState} from 'react'
import {useNavigate, useSearchParams} from 'react-router-dom'
import '@/styles/fund-form.css'
import AppNavBar from '@/components/AppNavBar'
import {createFund, fetchHoldings, resolveFund, updateFund} from '@/lib/api'
import {getFund} from '@/lib/portfolioStore'
import {isTradingDay} from '@/lib/tradingCalendar'
import {getStoredTheme, type AppTheme} from '@/lib/theme'

type AmountBasis = 'prev' | 'today'

export default function FundFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const theme: AppTheme = getStoredTheme()

  const mode = params.get('mode') === 'watch' ? 'watch' : 'hold'
  const initialCode = params.get('code') ? String(params.get('code')).padStart(6, '0') : ''
  const initialName = params.get('name') ? decodeURIComponent(params.get('name') || '') : ''
  const codeLocked = !!initialCode

  const showAmountBasis = isTradingDay()
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState(initialName)
  const [nameHint, setNameHint] = useState('')
  const [amount, setAmount] = useState('')
  const [amountBasis, setAmountBasis] = useState<AmountBasis>(
    showAmountBasis ? 'prev' : 'today',
  )
  const [resolving, setResolving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const resolveTimer = useRef<number | null>(null)
  const resolveSeq = useRef(0)

  const navTitle = codeLocked
    ? mode === 'hold'
      ? '编辑持仓'
      : '编辑自选'
    : mode === 'hold'
      ? '添加持仓'
      : '添加自选'

  const amountPlaceholder = showAmountBasis
    ? '填写与上方口径一致的金额'
    : '填写今日结算的持仓金额'
  const amountTip = showAmountBasis
    ? '填写与上方口径一致的金额'
    : '非交易日按今日结算市值填写'

  useEffect(() => {
    let cancelled = false
    async function prefill() {
      if (!(codeLocked && mode === 'hold' && initialCode)) {
        if (initialCode) void resolveName(initialCode)
        return
      }
      let resolvedName = initialName || ''
      try {
        const holdings = await fetchHoldings()
        if (cancelled) return
        const row = (holdings.list || []).find((f) => f.code === initialCode)
        if (row) {
          setAmount(row.amount != null ? String(row.amount) : '')
          let basis: AmountBasis =
            row.percentSource === 'confirmed' ? 'today' : 'prev'
          if (!isTradingDay()) basis = 'today'
          setAmountBasis(basis)
          resolvedName = row.name || initialName || ''
          setName(resolvedName)
        } else {
          const local = getFund(initialCode)
          if (local?.name) {
            resolvedName = local.name
            setName(local.name)
          } else if (initialName) {
            setName(initialName)
          }
        }
      } catch {
        if (initialName) setName(initialName)
      }
      if (!resolvedName) void resolveName(initialCode)
    }
    void prefill()
    return () => {
      cancelled = true
      if (resolveTimer.current) window.clearTimeout(resolveTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resolveName(nextCode: string) {
    const seq = ++resolveSeq.current
    setResolving(true)
    setNameHint('')
    try {
      const meta = await resolveFund({
        code: nextCode,
        type: mode === 'hold' ? 'hold' : 'watch',
      })
      if (seq !== resolveSeq.current) return
      const nextName = meta?.name || ''
      setName(nextName)
      setResolving(false)
      setNameHint(nextName ? '' : '未识别到名称，仍可保存')
      if (meta?.code) setCode(meta.code)
    } catch (e) {
      if (seq !== resolveSeq.current) return
      setResolving(false)
      setNameHint(e instanceof Error ? e.message : '名称识别失败')
    }
  }

  const onCodeInput = (value: string) => {
    const next = String(value || '')
      .replace(/\D/g, '')
      .slice(0, 6)
    setCode(next)
    setError('')
    setNameHint('')
    if (codeLocked) return
    if (resolveTimer.current) window.clearTimeout(resolveTimer.current)
    if (next.length === 6) {
      resolveTimer.current = window.setTimeout(() => void resolveName(next), 280)
    } else {
      setName('')
      setResolving(false)
    }
  }

  const onSubmit = async () => {
    if (saving) return
    const nextCode = String(code || '').padStart(6, '0')
    if (!/^\d{6}$/.test(nextCode)) {
      setError('请输入6位基金代码')
      return
    }
    setSaving(true)
    setError('')
    try {
      const basis: AmountBasis = showAmountBasis ? amountBasis : 'today'
      if (codeLocked) {
        if (mode === 'hold') {
          await updateFund(nextCode, {
            amount: Number(amount) || 0,
            amountBasis: basis,
          })
        }
      } else {
        await createFund({
          code: nextCode,
          type: mode,
          name: name || undefined,
          amount: mode === 'hold' ? Number(amount) || 0 : undefined,
          amountBasis: mode === 'hold' ? basis : undefined,
        })
      }
      window.setTimeout(() => navigate(-1), 400)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const mastKicker =
    mode === 'hold'
      ? codeLocked
        ? 'EDIT HOLDING'
        : 'ADD HOLDING'
      : codeLocked
        ? 'EDIT WATCH'
        : 'ADD WATCH'

  return (
    <div className={`subpage-root theme-${theme}`}>
      <div className="subpage-nav">
        <AppNavBar title={navTitle} theme={theme} />
      </div>
      <div className="subpage-scroller" style={{overflowY: 'auto'}}>
        <div className={`page theme-${theme} fund-form`}>
          <div className="mast">
            <span className="mast-kicker mono">{mastKicker}</span>
            <span className="mast-name">
              {name || (resolving ? '识别中…' : codeLocked ? '基金持仓' : '输入代码开始')}
            </span>
            {nameHint ? <span className="mast-hint">{nameHint}</span> : null}
          </div>

          <div className="rail">
            <div className="rail-head">
              <span className="rail-code mono">01</span>
              <span className="rail-name">代码</span>
            </div>
            <div className={`field-row${codeLocked ? ' is-locked' : ''}`}>
              <input
                className="field-input mono"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                disabled={codeLocked}
                placeholder="6 位基金代码"
                onChange={(e) => onCodeInput(e.target.value)}
              />
              {codeLocked ? <span className="field-suffix">已锁定</span> : null}
            </div>
          </div>

          {mode === 'hold' ? (
            <div className="rail">
              <div className="rail-head">
                <span className="rail-code mono">02</span>
                <span className="rail-name">金额</span>
              </div>

              {showAmountBasis ? (
                <div className="basis">
                  <button
                    type="button"
                    className={`basis-card${amountBasis === 'prev' ? ' is-on' : ''}`}
                    onClick={() => setAmountBasis('prev')}
                  >
                    <span className="basis-title">昨日结算的持仓金额</span>
                    <span className="basis-desc">
                      用昨确认净值算份额；列表金额之后按最新净值实时计算
                    </span>
                  </button>
                  <button
                    type="button"
                    className={`basis-card${amountBasis === 'today' ? ' is-on' : ''}`}
                    onClick={() => setAmountBasis('today')}
                  >
                    <span className="basis-title">今日结算的持仓金额</span>
                    <span className="basis-desc">
                      输入即今日确认市值（与列表一致）；用今净值算份额
                    </span>
                  </button>
                </div>
              ) : null}

              <div className="field-row">
                <span className="field-prefix">¥</span>
                <input
                  className="field-input mono"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  placeholder={amountPlaceholder}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              {!showAmountBasis ? <span className="field-tip">{amountTip}</span> : null}
            </div>
          ) : null}

          {error ? <div className="err">{error}</div> : null}

          <button
            type="button"
            className={`save-btn${saving ? ' is-busy' : ''}`}
            onClick={() => void onSubmit()}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
