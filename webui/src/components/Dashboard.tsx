import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { onboardHeadscale } from '../utils/api'
import { NetworkList } from './NetworkList'
import { StatusMessage } from './StatusMessage'
import type { StatusType } from '../types'

export function Dashboard() {
  const { username, isHeadscaleOnboarded, setHeadscaleOnboarded, logout } = useAuth()
  const [status, setStatus] = useState<{ type: StatusType; message: string | null }>({
    type: null,
    message: null,
  })
  const [loading, setLoading] = useState(false)

  const handleOnboard = async () => {
    try {
      setLoading(true)
      setStatus({ type: 'info', message: 'Setting up Headscale...' })

      const result = await onboardHeadscale()

      if (result.success) {
        setStatus({
          type: 'success',
          message: result.message || 'Headscale ready',
        })
        setHeadscaleOnboarded(result.onboarded)
      } else {
        throw new Error(result.message || 'Setup failed')
      }
    } catch (error) {
      console.error('Onboarding error:', error)
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Setup failed',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="card">
        <StatusMessage type={status.type} message={status.message} />
        <div className="button-group">
          {isHeadscaleOnboarded ? (
            <button
              id="onboard-btn"
              type="button"
              className="onboard-btn"
              disabled
            >
              Headscale ready
            </button>
          ) : (
            <button
              id="onboard-btn"
              type="button"
              className="onboard-btn"
              onClick={handleOnboard}
              disabled={loading}
            >
              Setup Headscale
            </button>
          )}
          <button
            id="logout-btn"
            type="button"
            className="logout-btn"
            onClick={logout}
          >
            Sign out
          </button>
        </div>
      </div>
      <NetworkList />
    </>
  )
}
