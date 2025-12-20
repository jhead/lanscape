import { useState, FormEvent } from 'react'
import { createNetwork } from '../utils/api'
import { StatusMessage } from './StatusMessage'
import type { StatusType } from '../types'

interface CreateNetworkModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function CreateNetworkModal({ onClose, onSuccess }: CreateNetworkModalProps) {
  const [name, setName] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<{ type: StatusType; message: string | null }>({
    type: null,
    message: null,
  })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    
    if (!name.trim() || !endpoint.trim() || !apiKey.trim()) {
      setStatus({ type: 'error', message: 'Please fill in all fields' })
      return
    }

    try {
      setLoading(true)
      setStatus({ type: 'info', message: 'Creating network...' })
      
      await createNetwork(name.trim(), endpoint.trim(), apiKey.trim())
      
      setStatus({ type: 'success', message: 'Network created successfully!' })
      
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1000)
    } catch (error) {
      setStatus({
        type: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Create New Network</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="network-name">Network Name</label>
            <input
              type="text"
              id="network-name"
              placeholder="e.g., My Network"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="network-endpoint">Headscale Endpoint</label>
            <input
              type="text"
              id="network-endpoint"
              placeholder="http://localhost:8080"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="network-api-key">Headscale API Key</label>
            <input
              type="password"
              id="network-api-key"
              placeholder="Enter API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="button-group">
            <button type="submit" className="primary-btn" disabled={loading}>
              Create Network
            </button>
            <button
              type="button"
              id="cancel-create-btn"
              className="secondary-btn"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
          <StatusMessage type={status.type} message={status.message} />
        </form>
      </div>
    </div>
  )
}
