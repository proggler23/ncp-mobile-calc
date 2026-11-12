import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { startAnalytics } from './analytics'
import App from './App'
import { watchServiceWorkerUpdates } from './pwa'
import { registerInstallListeners } from './state/install'
import './index.css'

registerInstallListeners() // beforeinstallprompt may fire before React renders
watchServiceWorkerUpdates()
registerSW({ immediate: true })
startAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
