import { useEffect, useState } from 'react'
import { ChatProvider } from '../contexts/ChatContext'
import { useNetwork } from '../contexts/NetworkContext'
import { ChatLayout } from './chat/ChatLayout'
import { CreateNetworkModal } from './CreateNetworkModal'
import './Dashboard.css'

export function Dashboard() {
  const { networks, loading, refreshNetworks } = useNetwork()
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Show network creation modal if no networks exist
  useEffect(() => {
    if (!loading && networks.length === 0 && !showCreateModal) {
      console.log('[Dashboard] No networks found, showing creation modal')
      setShowCreateModal(true)
    }
  }, [loading, networks.length, showCreateModal])

  const handleNetworkCreated = async () => {
    console.log('[Dashboard] Network created, refreshing and selecting')
    await refreshNetworks()
    // The NetworkContext will auto-select the first network after refresh
    setShowCreateModal(false)
  }

  // Don't render chat until we have a network or are showing the modal
  if (!loading && networks.length === 0) {
    return (
      <div className="dashboard-wrapper">
        {showCreateModal && (
          <CreateNetworkModal
            onClose={() => {
              // Don't allow closing if no networks exist
              console.log('[Dashboard] Cannot close modal without networks')
            }}
            onSuccess={handleNetworkCreated}
          />
        )}
      </div>
    )
  }

  return (
    <ChatProvider>
      <div className="dashboard-wrapper">
        <ChatLayout />
      </div>
    </ChatProvider>
  )
}
