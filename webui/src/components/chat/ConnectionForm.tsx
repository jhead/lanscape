import { useState, useEffect } from 'react'
import { useChat } from '../../contexts/ChatContext'
import { fetchNetworks, getCurrentUser } from '../../utils/api'
import type { Network } from '../../types'
import './ConnectionForm.css'

export function ConnectionForm() {
  const { connect, connecting, error: chatError } = useChat()
  const [networks, setNetworks] = useState<Network[]>([])
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null)
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  
  // Advanced overrides
  const [advancedServerUrl, setAdvancedServerUrl] = useState('')
  const [advancedUsername, setAdvancedUsername] = useState('')

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [networksData, userData] = await Promise.all([
          fetchNetworks(),
          getCurrentUser().catch(() => ({ user_handle: '' }))
        ])
        setNetworks(networksData)
        setUsername(userData.user_handle || '')
        if (networksData.length > 0) {
          setSelectedNetwork(networksData[0])
        }
      } catch (err) {
        console.error('Error loading connection data:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const getServerUrl = () => {
    if (showAdvanced && advancedServerUrl) {
      return advancedServerUrl
    }
    if (selectedNetwork) {
      return `wss://chat.${selectedNetwork.name}.tsnet.jxh.io:5443/ws`
    }
    return ''
  }

  const getUsernameValue = () => {
    if (showAdvanced && advancedUsername) {
      return advancedUsername
    }
    return username
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const serverUrl = getServerUrl()
    const usernameValue = getUsernameValue()
    
    if (!serverUrl || !usernameValue) {
      return
    }

    // Build full JID if username doesn't include domain
    let fullUsername = usernameValue
    if (!fullUsername.includes('@')) {
      // Extract domain from server URL (with or without port)
      const domainMatch = serverUrl.match(/chat\.([^.]+)\.tsnet\.jxh\.io(?::\d+)?/)
      if (domainMatch) {
        fullUsername = `${usernameValue}@chat.${domainMatch[1]}.tsnet.jxh.io`
      }
    }

    if (!selectedNetwork) {
      // Error will be handled by chat context
      return
    }

    await connect(serverUrl, fullUsername, selectedNetwork.id)
  }

  if (loading) {
    return (
      <div className="connection-form">
        <div className="connection-loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="connection-form">
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="network-select">Network</label>
          <select
            id="network-select"
            value={selectedNetwork?.id || ''}
            onChange={(e) => {
              const network = networks.find(n => n.id === parseInt(e.target.value))
              setSelectedNetwork(network || null)
            }}
            disabled={connecting || showAdvanced}
            required={!showAdvanced}
            className="connection-select"
          >
            {networks.length === 0 ? (
              <option value="">No networks available</option>
            ) : (
              networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))
            )}
          </select>
          {selectedNetwork && !showAdvanced && (
            <div className="connection-url-preview">
              {getServerUrl()}
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="username">Username</label>
          <div className="connection-username-wrapper">
            <input
              id="username"
              type="text"
              value={getUsernameValue()}
              onChange={(e) => {
                if (showAdvanced) {
                  setAdvancedUsername(e.target.value)
                }
              }}
              placeholder="Enter username"
              disabled={connecting || !showAdvanced}
              readOnly={!showAdvanced}
              required
              className="connection-username-input"
            />
            {!showAdvanced && selectedNetwork && (
              <span className="connection-username-suffix">
                @chat.{selectedNetwork.name}.tsnet.jxh.io
              </span>
            )}
          </div>
        </div>

        <div className="connection-advanced">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="connection-advanced-toggle"
          >
            {showAdvanced ? '▼' : '▶'} Advanced
          </button>
          {showAdvanced && (
            <div className="connection-advanced-content">
              <div className="form-group">
                <label htmlFor="advanced-server-url">Server URL (override)</label>
                <input
                  id="advanced-server-url"
                  type="text"
                  value={advancedServerUrl}
                  onChange={(e) => setAdvancedServerUrl(e.target.value)}
                  placeholder="wss://chat.example.com:5443/ws"
                  disabled={connecting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="advanced-username">Username (override)</label>
                <input
                  id="advanced-username"
                  type="text"
                  value={advancedUsername}
                  onChange={(e) => setAdvancedUsername(e.target.value)}
                  placeholder="user@example.com"
                  disabled={connecting}
                />
              </div>
            </div>
          )}
        </div>

        {chatError && (
          <div className="connection-error">
            {chatError}
          </div>
        )}
        <button
          type="submit"
          disabled={connecting || !getServerUrl() || !getUsernameValue()}
          className="connection-submit-btn"
        >
          {connecting ? 'Connecting...' : 'Connect'}
        </button>
      </form>
    </div>
  )
}
