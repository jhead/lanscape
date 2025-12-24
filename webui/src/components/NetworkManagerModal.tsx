import { NetworkList } from './NetworkList'
import './NetworkManagerModal.css'

interface NetworkManagerModalProps {
  isOpen: boolean
  onClose: () => void
}

export function NetworkManagerModal({ isOpen, onClose }: NetworkManagerModalProps) {
  if (!isOpen) return null

  return (
    <div className="network-manager-modal-overlay" onClick={onClose}>
      <div className="network-manager-modal" onClick={(e) => e.stopPropagation()}>
        <div className="network-manager-modal-header">
          <h2>Networks</h2>
          <button
            className="network-manager-modal-close"
            onClick={onClose}
            title="Close"
          >
            ×
          </button>
        </div>
        <div className="network-manager-modal-content">
          <NetworkList onNetworkSelected={onClose} />
        </div>
      </div>
    </div>
  )
}

