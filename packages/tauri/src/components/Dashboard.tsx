import { useEffect, useState } from 'react'
import { ChatProvider, useChat } from '../contexts/ChatContext'
import { useNetwork } from '../contexts/NetworkContext'
import { ChatLayout } from './chat/ChatLayout'
import { CreateNetworkModal } from './CreateNetworkModal'
import './Dashboard.css'

function LoadingScreen() {
  return (
    <div className="dashboard-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '16px' }}>Loading...</div>
        <div style={{ fontSize: '14px', color: '#666' }}>Starting agent and connecting to chat...</div>
        <div style={{ marginTop: '24px' }}>
          <div className="loading-spinner" style={{
            border: '3px solid #f3f3f3',
            borderTop: '3px solid #3498db',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            animation: 'spin 1s linear infinite',
            margin: '0 auto'
          }}></div>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  )
}

function ChatContent() {
  const { connecting, connected, error } = useChat()

  // Show loading screen while connecting
  if (connecting && !connected) {
    return <LoadingScreen />
  }

  // Show error state if connection failed
  if (error && !connected) {
    return (
      <div className="dashboard-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '20px', marginBottom: '16px', color: '#e74c3c' }}>Connection Error</div>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '24px' }}>{error}</div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return <ChatLayout />
}

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
      <ChatContent />
    </ChatProvider>
  )
}
