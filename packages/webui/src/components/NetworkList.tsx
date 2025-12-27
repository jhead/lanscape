import { useState, useEffect } from 'react'
import { useNetwork } from '../contexts/NetworkContext'
import { NetworkItem } from './NetworkItem'
import { CreateNetworkModal } from './CreateNetworkModal'
import { StatusMessage } from './StatusMessage'
import type { StatusType } from '../types'

interface NetworkListProps {
  onNetworkSelected?: () => void
}

export function NetworkList({ onNetworkSelected }: NetworkListProps) {
  const { networks, loading, refreshNetworks, currentNetwork } = useNetwork()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [status, setStatus] = useState<{ type: StatusType; message: string | null }>({
    type: null,
    message: null,
  })

  const loadNetworks = async () => {
    await refreshNetworks()
  }

  useEffect(() => {
    loadNetworks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStatusChange = (message: string, type: 'info' | 'success' | 'error') => {
    setStatus({ type, message })
  }

  if (loading) {
    return (
      <div className="card networks-card">
        <p style={{ color: '#71717a', textAlign: 'center' }}>Loading...</p>
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
            + New network
          </button>
        </div>
        <div id="networks-list" className="networks-list">
          {networks.length === 0 ? (
            <p className="empty-state">No networks yet. Create one to get started.</p>
          ) : (
            networks.map((network) => (
              <NetworkItem
                key={network.id}
                network={network}
                isCurrent={currentNetwork?.id === network.id}
                onDelete={loadNetworks}
                onStatusChange={handleStatusChange}
                onSelected={onNetworkSelected}
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
