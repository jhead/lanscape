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
      setStatus({ type: 'error', message: 'Please enter a username' })
      return
    }

    try {
      setLoading(true)
      setStatus({ type: 'info', message: 'Starting registration...' })

      const result = await registerUser(username.trim())
      
      if (result.success) {
        setStatus({
          type: 'success',
          message: `Registration successful! Welcome, ${result.username}!`,
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
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!username.trim()) {
      setStatus({ type: 'error', message: 'Please enter a username' })
      return
    }

    try {
      setLoading(true)
      setStatus({ type: 'info', message: 'Starting login...' })

      const result = await loginUser(username.trim())
      
      if (result.success) {
        setStatus({
          type: 'success',
          message: `Login successful! Welcome back, ${result.username}!`,
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
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
          placeholder="Enter your username"
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
          Register
        </button>
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
        >
          Login
        </button>
      </div>
      <StatusMessage type={status.type} message={status.message} />
    </div>
  )
}
