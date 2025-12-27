import { useState } from 'react'
import { registerUser, loginUser } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { StatusMessage } from './StatusMessage'
import type { StatusType } from '../types'

export function AuthForm() {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<{ type: StatusType; message: string | null }>({
    type: null,
    message: null,
  })
  const [loading, setLoading] = useState(false)
  const { setAuthenticated, setUsername: setAuthUsername } = useAuth()

  const handleRegister = async () => {
    if (!username.trim()) {
      setStatus({ type: 'error', message: 'Enter a username' })
      return
    }

    try {
      setLoading(true)
      setStatus({ type: 'info', message: 'Creating account...' })

      const result = await registerUser(username.trim())
      
      if (result.success) {
        setStatus({
          type: 'success',
          message: `Welcome, ${result.username}`,
        })
        setAuthenticated(true)
        setAuthUsername(result.username || '')
      } else {
        throw new Error(result.message || 'Registration failed')
      }
    } catch (error) {
      console.error('Registration error:', error)
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Registration failed',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!username.trim()) {
      setStatus({ type: 'error', message: 'Enter a username' })
      return
    }

    try {
      setLoading(true)
      setStatus({ type: 'info', message: 'Signing in...' })

      const result = await loginUser(username.trim())
      
      if (result.success) {
        setStatus({
          type: 'success',
          message: `Welcome back, ${result.username}`,
        })
        setAuthenticated(true)
        setAuthUsername(result.username || '')
      } else {
        throw new Error(result.message || 'Login failed')
      }
    } catch (error) {
      console.error('Login error:', error)
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Login failed',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRegister()
    }
  }

  return (
    <div className="card">
      <div className="form-group">
        <label htmlFor="username">Username</label>
        <input
          type="text"
          id="username"
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="button-group">
        <button
          type="button"
          onClick={handleRegister}
          disabled={loading}
        >
          Create account
        </button>
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
        >
          Sign in
        </button>
      </div>
      <StatusMessage type={status.type} message={status.message} />
    </div>
  )
}
