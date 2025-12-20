import { useAuth } from './contexts/AuthContext'
import { AuthForm } from './components/AuthForm'
import { Dashboard } from './components/Dashboard'

function App() {
  const { isAuthenticated, username, logout } = useAuth()

  return (
    <div className="container">
      <h1>Lanscape</h1>
      {isAuthenticated && (
        <div className="user-bar">
          <span className="user-welcome">Welcome, {username}!</span>
          <button
            id="logout-btn"
            type="button"
            className="logout-btn"
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      )}
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
