import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { NetworkProvider } from './contexts/NetworkContext'
import { AuthForm } from './components/AuthForm'
import { Dashboard } from './components/Dashboard'
import { NetworkManager } from './components/NetworkManager'
import { getPlatform } from './services/platform'

/**
 * Auth component selector based on platform configuration
 */
function AuthComponent() {
  const platform = getPlatform()
  
  // Use platform-provided auth component if available
  if (platform.authComponent) {
    return platform.authComponent()
  }
  
  // Default to WebAuthn AuthForm
  return <AuthForm />
}

function App() {
  const { isAuthenticated } = useAuth()

  return (
    <>
      {isAuthenticated ? (
        <NetworkProvider>
          <Routes>
            <Route path="/chat" element={<Dashboard />} />
            <Route path="/networks" element={<NetworkManager />} />
            <Route path="/" element={<Navigate to="/chat" replace />} />
          </Routes>
        </NetworkProvider>
      ) : (
        <div className="container">
          <h1>Lanscape</h1>
          <AuthComponent />
          <p className="info-text">
            {getPlatform().authMethod === 'oidc' 
              ? 'Sign in with your OIDC provider.'
              : 'Sign in with passkey or create a new account.'}
          </p>
        </div>
      )}
    </>
  )
}

export default App
