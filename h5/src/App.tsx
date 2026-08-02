import {Route, Routes, useLocation} from 'react-router-dom'
import MainPage from '@/pages/MainPage'
import FundFormPage from '@/pages/FundFormPage'
import FundQaPage from '@/pages/FundQaPage'
import FundTrendPage from '@/pages/FundTrendPage'
import GoldEditPage from '@/pages/GoldEditPage'
import GoldTrendPage from '@/pages/GoldTrendPage'
import IndexTrendPage from '@/pages/IndexTrendPage'

/** 主壳常驻：进二级页只隐藏不卸载，对齐小程序 page stack */
export default function App() {
  const {pathname} = useLocation()
  const onMain = pathname === '/'

  return (
    <>
      <div
        className="app-main-layer"
        style={{display: onMain ? 'block' : 'none', height: '100%'}}
        aria-hidden={!onMain}
      >
        <MainPage visible={onMain} />
      </div>
      <Routes>
        <Route path="/" element={null} />
        <Route path="/fund-form" element={<FundFormPage />} />
        <Route path="/fund-qa" element={<FundQaPage />} />
        <Route path="/fund-trend" element={<FundTrendPage />} />
        <Route path="/gold-edit" element={<GoldEditPage />} />
        <Route path="/gold-trend" element={<GoldTrendPage />} />
        <Route path="/index-trend" element={<IndexTrendPage />} />
      </Routes>
    </>
  )
}
