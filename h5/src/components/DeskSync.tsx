import '@/styles/desk-sync.css'
import type {AppTheme} from '@/lib/theme'

export type DeskSyncVariant = 'watch' | 'hold' | 'gold' | 'market'

type Props = {
  variant: DeskSyncVariant
  theme: AppTheme
  minHeight?: number
  className?: string
}

const META: Record<DeskSyncVariant, {code: string; label: string}> = {
  watch: {code: 'WATCH', label: '同步自选簿'},
  market: {code: 'TAPE', label: '同步行情带'},
  hold: {code: 'BOOK', label: '同步持仓簿'},
  gold: {code: 'GOLD', label: '同步金仓'},
}

const ROWS = [0, 1, 2, 3, 4]
const HOLD_ROWS = [0, 1, 2, 3]
const BOARD_COLS = [0, 1]
const BOARD_ROWS = [0, 1, 2, 3]
const INDICES = [0, 1, 2, 3, 4, 5]
const GOLD_CELLS = [0, 1, 2, 3]

export default function DeskSync({variant, theme, minHeight = 0, className}: Props) {
  const meta = META[variant] || META.watch
  const style = minHeight > 0 ? {minHeight} : undefined

  return (
    <div
      className={`desk-sync theme-${theme} is-${variant}${className ? ` ${className}` : ''}`}
      style={style}
      aria-busy
      aria-label={meta.label}
    >
      {(variant === 'hold' || variant === 'gold') && (
        <div className="desk-sync-head">
          <div className="desk-sync-meta">
            <span className="desk-sync-code mono">{meta.code}</span>
            <span className="desk-sync-label">{meta.label}</span>
          </div>
          <div className="desk-sync-rail" aria-hidden>
            <div className="desk-sync-scan" />
          </div>
        </div>
      )}

      {variant === 'watch' && (
        <div className="desk-sync-list">
          {ROWS.map((i) => (
            <div className="glass desk-sync-row" key={i}>
              <div className="bone bone-mark" />
              <div className="desk-sync-main">
                <div className="bone bone-name" />
                <div className="bone bone-tag" />
              </div>
              <div className="bone bone-spark" />
              <div className="bone bone-pct" />
            </div>
          ))}
        </div>
      )}

      {variant === 'hold' && (
        <div className="desk-sync-list">
          {HOLD_ROWS.map((i) => (
            <div className="glass desk-sync-row is-hold" key={i}>
              <div className="bone bone-mark" />
              <div className="desk-sync-main">
                <div className="bone bone-name" />
                <div className="desk-sync-meta-row">
                  <div className="bone bone-amt" />
                  <div className="bone bone-weight" />
                </div>
              </div>
              <div className="bone bone-spark" />
              <div className="desk-sync-right">
                <div className="bone bone-pnl" />
                <div className="bone bone-pct" />
              </div>
            </div>
          ))}
        </div>
      )}

      {variant === 'gold' && (
        <div className="glass desk-sync-gold">
          <div className="desk-sync-gold-bar" aria-hidden />
          <div className="desk-sync-gold-grid">
            {GOLD_CELLS.map((i) => (
              <div className="desk-sync-gold-cell" key={i}>
                <div className="bone bone-gk" />
                <div className="bone bone-gv" />
              </div>
            ))}
          </div>
        </div>
      )}

      {variant === 'market' && (
        <>
          <div className="desk-sync-board">
            {BOARD_COLS.map((c) => (
              <div className="glass desk-sync-col" key={c}>
                <div className="desk-sync-col-h">
                  <div className="bone bone-col-title" />
                  <div className="bone bone-col-stat" />
                </div>
                {BOARD_ROWS.map((r) => (
                  <div className="desk-sync-srow" key={r}>
                    <div className="bone bone-sname" />
                    <div className="bone bone-spct" />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="desk-sync-grid">
            {INDICES.map((i) => (
              <div className="glass desk-sync-card" key={i}>
                <div className="bone bone-iname" />
                <div className="bone bone-ipct" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
