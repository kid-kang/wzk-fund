import '@/styles/app-nav-bar.css'
import {useNavigate} from 'react-router-dom'
import type {AppTheme} from '@/lib/theme'

type Props = {
  title: string
  theme: AppTheme
  onBack?: () => void
  showBack?: boolean
  /** 可选：覆盖导航底色（如 transparent） */
  bgColor?: string
}

export default function AppNavBar({
  title,
  theme,
  onBack,
  showBack = true,
  bgColor,
}: Props) {
  const navigate = useNavigate()
  const isDark = theme === 'dark'
  const navBg = bgColor || (isDark ? '#121722' : '#EEF1F8')
  const frontColor = isDark ? '#ffffff' : '#000000'

  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/', {replace: true})
    }
  }

  return (
    <div
      className="app-nav"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        backgroundColor: navBg,
      }}
    >
      <div className="app-nav-bar" style={{height: 44}}>
        {showBack ? (
          <button type="button" className="app-nav-back" onClick={handleBack} aria-label="返回">
            <span className="app-nav-chevron" style={{borderColor: frontColor}} />
          </button>
        ) : null}
        <span className="app-nav-title" style={{color: frontColor}}>
          {title}
        </span>
      </div>
    </div>
  )
}
