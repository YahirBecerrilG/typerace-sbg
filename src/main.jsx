import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.jsx'
import { I18nProvider } from './i18n'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <MotionConfig reducedMotion="user" transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}>
        <App />
      </MotionConfig>
    </I18nProvider>
  </StrictMode>,
)
