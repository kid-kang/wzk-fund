import {useCallback, useEffect, useState, type CSSProperties} from 'react'
import {useNavigate} from 'react-router-dom'
import '@/styles/tab-mine.css'
import {
  exportConfig,
  fetchSettings,
  healthCheck,
  importConfig,
  syncApiBase,
  updateSettings,
  type AppConfig,
} from '@/lib/api'
import {DEFAULT_API_BASE, getApiBase, setApiBase} from '@/lib/config'
import {applyTheme, type AppTheme} from '@/lib/theme'

const HIDE_KEY = 'holdings_hide_amounts'

type Props = {
  active: boolean
  theme: AppTheme
  contentMinHeight?: number
  onThemeChange?: (theme: AppTheme) => void
}

export default function TabMine({
  active,
  theme,
  contentMinHeight = 0,
  onThemeChange,
}: Props) {
  const navigate = useNavigate()
  const [showGold, setShowGold] = useState(true)
  const [hideAmounts, setHideAmounts] = useState(false)
  const [apiBase, setApiBaseState] = useState(DEFAULT_API_BASE)
  const [pingState, setPingState] = useState('')
  const [pingLabel, setPingLabel] = useState('IDLE')
  const [toast, setToast] = useState('')

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 1600)
  }

  const refreshLocal = useCallback(async () => {
    setApiBaseState(getApiBase())
    try {
      const settings = await fetchSettings()
      setShowGold(settings?.showGold !== false)
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(HIDE_KEY)
      setHideAmounts(raw === 'true' || raw === '1')
    } catch {
      setHideAmounts(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void refreshLocal()
  }, [active, refreshLocal])

  const switchColor = theme === 'dark' ? '#7b88ff' : '#4f5dff'
  const switchOff = theme === 'dark' ? '#3a4254' : '#c8ceda'

  const onToggleGold = async () => {
    const next = !showGold
    try {
      await updateSettings({showGold: next})
      setShowGold(next)
    } catch (err) {
      flash(err instanceof Error ? err.message : '保存失败')
    }
  }

  const onToggleHideAmounts = () => {
    const next = !hideAmounts
    setHideAmounts(next)
    try {
      localStorage.setItem(HIDE_KEY, String(next))
    } catch {
      flash('保存失败')
    }
  }

  const onToggleTheme = () => {
    const next: AppTheme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    onThemeChange?.(next)
  }

  const onSaveApi = () => {
    const next = setApiBase(apiBase)
    syncApiBase()
    setApiBaseState(next)
    flash('已保存')
  }

  const onPing = async () => {
    setPingState('is-busy')
    setPingLabel('PING')
    try {
      setApiBase(apiBase)
      syncApiBase()
      const res = await healthCheck()
      const ok = !!(res && (res.ok || res.success))
      setPingState(ok ? 'is-ok' : 'is-fail')
      setPingLabel(ok ? 'OK' : 'RESP')
      flash(ok ? '连通正常' : '已响应')
    } catch (e) {
      setPingState('is-fail')
      setPingLabel('FAIL')
      window.alert(e instanceof Error ? e.message : '请确认 server 已启动且地址正确')
    }
  }

  const onExport = async () => {
    try {
      const config = await exportConfig()
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2))
      flash('已复制')
    } catch (e) {
      flash(e instanceof Error ? e.message : '导出失败')
    }
  }

  const onImport = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) throw new Error('剪贴板为空')
      const payload = JSON.parse(text) as AppConfig
      await importConfig(payload)
      flash('导入成功')
      void refreshLocal()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '请确认剪贴板是有效配置 JSON')
    }
  }

  return (
    <div className="tab-root">
      <div className="page-scroller" style={{overflowY: 'auto', height: '100%'}}>
        <div
          className={`page theme-${theme} mine-page`}
          style={{minHeight: contentMinHeight || undefined}}
        >
          <div className="page-wm" aria-hidden>
            <span className="page-wm-text is-face">wzk-fund</span>
          </div>

          <div className="mast">
            <div className="mast-copy">
              <span className="mast-kicker mono">PERSONAL DESK</span>
              <span className="mast-title">控制台</span>
              <span className="mast-sub">配置保存在本地</span>
            </div>
            <div
              className={`mast-signal ${theme === 'dark' ? 'is-night' : 'is-day'}`}
              aria-hidden
            >
              <div className="signal-core" />
            </div>
          </div>

          <div className="rail">
            <div className="rail-head">
              <span className="rail-code mono">01</span>
              <span className="rail-name">显示</span>
            </div>

            <div className="row">
              <div className="row-text">
                <span className="row-title">黄金持仓</span>
                <span className="row-desc">持仓页是否展示黄金模块</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={showGold}
                className={`mine-switch${showGold ? ' is-on' : ''}`}
                style={
                  {
                    '--switch-on': switchColor,
                    '--switch-off': switchOff,
                  } as CSSProperties
                }
                onClick={() => void onToggleGold()}
              />
            </div>

            <div className="row">
              <div className="row-text">
                <span className="row-title">隐藏金额</span>
                <span className="row-desc">持仓与收益数字以 *** 显示</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hideAmounts}
                className={`mine-switch${hideAmounts ? ' is-on' : ''}`}
                style={
                  {
                    '--switch-on': switchColor,
                    '--switch-off': switchOff,
                  } as CSSProperties
                }
                onClick={onToggleHideAmounts}
              />
            </div>

            <div className="row">
              <div className="row-text">
                <span className="row-title">深色主题</span>
                <span className="row-desc">夜间行情台配色</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'dark'}
                className={`mine-switch${theme === 'dark' ? ' is-on' : ''}`}
                style={
                  {
                    '--switch-on': switchColor,
                    '--switch-off': switchOff,
                  } as CSSProperties
                }
                onClick={onToggleTheme}
              />
            </div>
          </div>

          <div className="rail">
            <div className="rail-head">
              <span className="rail-code mono">02</span>
              <span className="rail-name">接口</span>
            </div>

            <div className="endpoint">
              <span className="endpoint-prompt mono">$</span>
              <input
                className="endpoint-input mono"
                value={apiBase}
                placeholder="http://127.0.0.1:8787"
                onChange={(e) => setApiBaseState(e.target.value)}
              />
            </div>

            <div className="endpoint-actions">
              <button type="button" className="chip chip-fill" onClick={onSaveApi}>
                保存地址
              </button>
              <button type="button" className="chip chip-line" onClick={() => void onPing()}>
                探测连通
              </button>
              <div className={`ping-lamp ${pingState}`} aria-label="连通状态">
                <div className="ping-dot" />
                <span className="ping-text mono">{pingLabel}</span>
              </div>
            </div>
          </div>

          <div className="rail">
            <div className="rail-head">
              <span className="rail-code mono">03</span>
              <span className="rail-name">配置</span>
            </div>

            <button type="button" className="xfer" onClick={() => void onExport()}>
              <div className="xfer-text">
                <span className="row-title">导出配置</span>
                <span className="row-desc">复制 JSON 到剪贴板</span>
              </div>
              <span className="xfer-arrow mono">↗</span>
            </button>

            <button type="button" className="xfer" onClick={() => void onImport()}>
              <div className="xfer-text">
                <span className="row-title">导入配置</span>
                <span className="row-desc">从剪贴板读取 JSON</span>
              </div>
              <span className="xfer-arrow mono">↙</span>
            </button>
          </div>

          <div className="rail">
            <div className="rail-head">
              <span className="rail-code mono">04</span>
              <span className="rail-name">使用说明</span>
            </div>

            <button type="button" className="xfer" onClick={() => navigate('/fund-qa')}>
              <div className="xfer-text">
                <span className="row-title">Q&A</span>
                <span className="row-desc">以问答的形式讲解相关问题</span>
              </div>
              <span className="xfer-arrow mono">›</span>
            </button>
          </div>

          <span className="legal">数据仅供个人参考，不构成投资建议。</span>
          {toast ? (
            <div
              style={{
                position: 'fixed',
                left: '50%',
                bottom: '20%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.72)',
                color: '#fff',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 13,
                zIndex: 50,
              }}
            >
              {toast}
            </div>
          ) : null}
        </div>
      </div>
      <style>{`
        .mine-switch {
          width: 44px;
          height: 24px;
          border-radius: 999px;
          background: var(--switch-off);
          position: relative;
          flex-shrink: 0;
          transition: background 0.2s ease;
        }
        .mine-switch::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #fff;
          transition: transform 0.2s ease;
        }
        .mine-switch.is-on {
          background: var(--switch-on);
        }
        .mine-switch.is-on::after {
          transform: translateX(20px);
        }
      `}</style>
    </div>
  )
}
