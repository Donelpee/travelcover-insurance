import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { PermissionsProvider } from './contexts/PermissionsContext'

registerSW({
  immediate: true,
  onRegisteredSW: () => {
    console.log('Service worker registered')
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PermissionsProvider>
      <App />
    </PermissionsProvider>
  </StrictMode>,
)
