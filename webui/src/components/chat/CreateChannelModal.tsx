import { useState } from 'react'
import { useChat } from '../../contexts/ChatContext'
import './CreateChannelModal.css'

interface CreateChannelModalProps {
  onClose: () => void
}

export function CreateChannelModal({ onClose }: CreateChannelModalProps) {
  const { createChannel, setCurrentChannel } = useChat()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Channel name is required')
      return
    }

    try {
      const channel = createChannel(trimmedName)
      setCurrentChannel(channel.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create channel')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Channel</h3>
          <button type="button" onClick={onClose} className="modal-close-btn">
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="channel-name">Channel Name</label>
            <div className="channel-name-input-wrapper">
              <span className="channel-name-prefix">#</span>
              <input
                id="channel-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                placeholder="new-channel"
                autoFocus
              />
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="modal-cancel-btn">
              Cancel
            </button>
            <button type="submit" className="modal-submit-btn" disabled={!name.trim()}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
