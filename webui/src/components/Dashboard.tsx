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
      setStatus({ type: 'info', message: 'Creating user in Headscale...' })

      const result = await onboardHeadscale()

      if (result.success) {
        setStatus({
          type: 'success',
          message: result.message || 'Successfully onboarded to Headscale!',
        })
        setHeadscaleOnboarded(result.onboarded)
      } else {
        throw new Error(result.message || 'Onboarding failed')
      }
    } catch (error) {
      console.error('Onboarding error:', error)
      setStatus({
        type: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
              Already Onboarded to Headscale
            </button>
          ) : (
            <button
              id="onboard-btn"
              type="button"
              className="onboard-btn"
              onClick={handleOnboard}
              disabled={loading}
            >
              Onboard to Headscale
            </button>
          )}
          <button
            id="logout-btn"
            type="button"
            className="logout-btn"
            onClick={logout}
          >
            Logout
          </button>
        </div>
      </div>
      <NetworkList />
    </>
  )
}
