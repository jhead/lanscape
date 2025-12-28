import { useState } from 'react'
import { loginWithOIDC } from '../utils/oidcApi'
import { useAuth } from '../contexts/AuthContext'
import { StatusMessage } from './StatusMessage'
import type { StatusType } from '../types'

export function OIDCLogin() {
  const [status, setStatus] = useState<{ type: StatusType; message: string | null }>({
    type: null,
    message: null,
  })
  const [loading, setLoading] = useState(false)
  const { setAuthenticated, setUsername } = useAuth()

  const handleLogin = async () => {
    try {
      setLoading(true)
      setStatus({ type: 'info', message: 'Opening browser to sign in...' })

      const result = await loginWithOIDC()
      
      if (result.success) {
        setStatus({
          type: 'success',
          message: `Welcome, ${result.username}`,
        })
        setAuthenticated(true)
        setUsername(result.username || '')
      } else {
        throw new Error('Login failed')
      }
    } catch (error) {
      console.error('OIDC login error:', error)
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Login failed',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="button-group" style={{ flexDirection: 'column', gap: '1rem' }}>
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{ width: '100%', padding: '0.75rem' }}
        >
          {loading ? 'Signing in...' : 'Sign in with OIDC'}
        </button>
      </div>
      <StatusMessage type={status.type} message={status.message} />
    </div>
  )
}

