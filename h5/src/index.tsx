import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {applyTheme, getStoredTheme} from '@/lib/theme'
import App from '@/App'

import '@/styles/base.css'
import '@/styles/app.css'
import '@/styles/main.css'
import '@/styles/app-nav-bar.css'
import '@/styles/app-tab-bar.css'
import '@/styles/desk-sync.css'
import '@/styles/ec-line.css'

applyTheme(getStoredTheme())

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found')
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
