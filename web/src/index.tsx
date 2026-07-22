import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import {applyTheme, getStoredTheme} from './lib/theme'

applyTheme(getStoredTheme())

const rootEl = document.getElementById('root')
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
