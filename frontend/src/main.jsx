import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { applyThemeVariables } from './theme/applyTheme.js'

applyThemeVariables()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const isNativeShell = Boolean(window.Capacitor?.isNativePlatform?.())
  || (window.location.hostname === 'localhost' && /;\s*wv\)/i.test(window.navigator.userAgent));

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeShell) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(error => {
      console.warn('Service worker registration failed', error);
    });
  });
}
