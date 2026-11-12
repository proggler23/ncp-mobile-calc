import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { watchServiceWorkerUpdates } from './pwa'
import { registerInstallListeners } from './state/install'
import './index.css'

registerInstallListeners() // beforeinstallprompt may fire before React renders
watchServiceWorkerUpdates()
registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
