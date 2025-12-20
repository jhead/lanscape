import { useAuth } from './contexts/AuthContext'
import { AuthForm } from './components/AuthForm'
import { Dashboard } from './components/Dashboard'

function App() {
  const { isAuthenticated, username } = useAuth()

  return (
    <div className="container">
      <h1>Lanscape</h1>
      <p className="subtitle">
        {isAuthenticated ? `Welcome, ${username}!` : 'WebAuthn Authentication'}
      </p>
      {isAuthenticated ? <Dashboard /> : <AuthForm />}
      <p className="info-text">
        {isAuthenticated
          ? 'Manage your networks and join different Headscale instances.'
          : 'Register a new account or login with an existing one using WebAuthn.'}
      </p>
    </div>
  )
}

export default App
