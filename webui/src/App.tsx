import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AuthForm } from './components/AuthForm'
import { Dashboard } from './components/Dashboard'
import { NetworkManager } from './components/NetworkManager'
import { WebRTCTest } from './components/WebRTCTest'

function App() {
  const { isAuthenticated } = useAuth()

  return (
    <>
      {isAuthenticated ? (
        <Routes>
          <Route path="/chat" element={<Dashboard />} />
          <Route path="/networks" element={<NetworkManager />} />
          <Route path="/webrtc-test" element={<WebRTCTest />} />
          <Route path="/" element={<Navigate to="/chat" replace />} />
        </Routes>
      ) : (
        <div className="container">
          <h1>Lanscape</h1>
          <AuthForm />
          <p className="info-text">
            Sign in with passkey or create a new account.
          </p>
        </div>
      )}
    </>
  )
}

export default App
