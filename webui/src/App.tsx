import { useAuth } from './contexts/AuthContext'
import { AuthForm } from './components/AuthForm'
import { Dashboard } from './components/Dashboard'

function App() {
  const { isAuthenticated, username } = useAuth()

  return (
    <div className="container">
      <h1>Lanscape</h1>
      <p className="subtitle">
        {isAuthenticated ? `Welcome, ${username}!` : null}
      </p>
      {isAuthenticated ? <Dashboard /> : <AuthForm />}
      <p className="info-text">
        {isAuthenticated
          ? 'Connect to your networks and manage Headscale instances.'
          : 'Sign in with passkey or create a new account.'}
      </p>
    </div>
  )
}

export default App
