import { useState, useEffect } from 'react'
import { fetchNetworks } from '../utils/api'
import { NetworkItem } from './NetworkItem'
import { CreateNetworkModal } from './CreateNetworkModal'
import { StatusMessage } from './StatusMessage'
import type { Network } from '../types'
import type { StatusType } from '../types'

export function NetworkList() {
  const [networks, setNetworks] = useState<Network[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [status, setStatus] = useState<{ type: StatusType; message: string | null }>({
    type: null,
    message: null,
  })

  const loadNetworks = async () => {
    try {
      setLoading(true)
      const fetchedNetworks = await fetchNetworks()
      setNetworks(fetchedNetworks)
    } catch (error) {
      console.error('Error fetching networks:', error)
      setNetworks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNetworks()
  }, [])

  const handleStatusChange = (message: string, type: 'info' | 'success' | 'error') => {
    setStatus({ type, message })
  }

  if (loading) {
    return (
      <div className="card networks-card">
        <p>Loading networks...</p>
      </div>
    )
  }

  return (
    <>
      <div className="card networks-card">
        <div className="networks-header">
          <h2>Networks</h2>
          <button
            id="create-network-btn"
            type="button"
            className="create-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + Create Network
          </button>
        </div>
        <div id="networks-list" className="networks-list">
          {networks.length === 0 ? (
            <p className="empty-state">No networks available. Create one to get started!</p>
          ) : (
            networks.map((network) => (
              <NetworkItem
                key={network.id}
                network={network}
                onDelete={loadNetworks}
                onStatusChange={handleStatusChange}
              />
            ))
          )}
        </div>
      </div>
      {showCreateModal && (
        <CreateNetworkModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={loadNetworks}
        />
      )}
      <StatusMessage type={status.type} message={status.message} />
    </>
  )
}
