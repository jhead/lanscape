import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { NetworkProvider } from './contexts/NetworkContext'
import { OIDCLogin } from './components/OIDCLogin'
import { Dashboard } from './components/Dashboard'
import { NetworkManager } from './components/NetworkManager'

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
          <OIDCLogin />
          <p className="info-text">
            Sign in with your OIDC provider.
          </p>
        </div>
      )}
    </>
  )
}

export default App
