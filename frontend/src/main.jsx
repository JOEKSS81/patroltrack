import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registra el service worker per a la caché de l'app shell (PWA offline).
// Només en producció (la build de Vite) i si el navegador ho suporta.
if ('serviceWorker' in navigator && !location.port.startsWith('517')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
