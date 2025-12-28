import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { setPlatform } from '@lanscape/webui/services/platform'
import { tauriPlatform } from './services/platform/tauri'
import { OIDCLogin } from './components/OIDCLogin'
// Import App and AuthProvider from webui
import App from '@lanscape/webui'
import { AuthProvider } from '@lanscape/webui/contexts/AuthContext'
import '@lanscape/webui/style.css'

// Initialize platform with Tauri-specific implementations
// Provide OIDC login component
setPlatform({
  ...tauriPlatform,
  authComponent: () => <OIDCLogin />,
})

const rootElement = document.getElementById('app')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
)
