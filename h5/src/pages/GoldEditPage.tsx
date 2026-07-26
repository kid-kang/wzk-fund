import {useState} from 'react'
import {useNavigate} from 'react-router-dom'
import '@/styles/gold-edit.css'
import AppNavBar from '@/components/AppNavBar'
import FortuneWatermark from '@/components/FortuneWatermark'
import {updateGoldConfig} from '@/lib/api'
import {loadConfig} from '@/lib/portfolioStore'
import {getStoredTheme, type AppTheme} from '@/lib/theme'

export default function GoldEditPage() {
  const navigate = useNavigate()
  const theme: AppTheme = getStoredTheme()
  const gold = loadConfig().gold || {holding: 0, avgPrice: 0}
  const [holding, setHolding] = useState(
    gold.holding != null ? String(gold.holding) : '',
  )
  const [avgPrice, setAvgPrice] = useState(
    gold.avgPrice != null ? String(gold.avgPrice) : '',
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const onSubmit = async () => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await updateGoldConfig({
        holding: Number(holding) || 0,
        avgPrice: Number(avgPrice) || 0,
      })
      window.setTimeout(() => navigate(-1), 400)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
      setSaving(false)
    }
  }

  return (
    <div className={`subpage-root theme-${theme}`}>
      <div className="subpage-nav">
        <AppNavBar title="黄金设置" theme={theme} />
      </div>
      <div className="subpage-scroller" style={{overflowY: 'auto'}}>
        <div className={`page theme-${theme} gold-edit-page`}>
          <div className="glass gold-form">
            <div className="gold-field" style={{display: 'flex', alignItems: 'center', gap: 12}}>
              <span className="gold-field-label">持有克数</span>
              <input
                className="gold-field-input"
                type="text"
                inputMode="decimal"
                value={holding}
                placeholder="0"
                onChange={(e) => setHolding(e.target.value)}
                style={{flex: 1, textAlign: 'right'}}
              />
            </div>
            <div className="gold-field-line" />
            <div className="gold-field" style={{display: 'flex', alignItems: 'center', gap: 12}}>
              <span className="gold-field-label">成本均价</span>
              <input
                className="gold-field-input"
                type="text"
                inputMode="decimal"
                value={avgPrice}
                placeholder="元/克"
                onChange={(e) => setAvgPrice(e.target.value)}
                style={{flex: 1, textAlign: 'right'}}
              />
            </div>
            {error ? <div className="err">{error}</div> : null}
          </div>

          <div className="save-row">
            <button
              type="button"
              className="gold-save"
              style={{width: '100%', borderRadius: 999}}
              disabled={saving}
              onClick={() => void onSubmit()}
            >
              {saving ? '保存中' : '保存'}
            </button>
          </div>

          <FortuneWatermark fill />
        </div>
      </div>
    </div>
  )
}
