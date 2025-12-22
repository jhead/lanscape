import { useState } from 'react'
import { useChat } from '../../contexts/ChatContext'
import './CreateChannelModal.css'

interface CreateChannelModalProps {
  onClose: () => void
}

export function CreateChannelModal({ onClose }: CreateChannelModalProps) {
  const { createChannel, setCurrentConversation } = useChat()
  const [name, setName] = useState('')
  const [jid, setJid] = useState('')
  const [creating, setCreating] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !jid.trim()) return

    try {
      setCreating(true)
      const channel = await createChannel(name.trim(), jid.trim())
      setCurrentConversation(channel.id)
      onClose()
    } catch (err: any) {
      console.error('Error creating channel:', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content create-channel-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create or Join Channel</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="channel-name">Channel Name</label>
            <input
              id="channel-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Channel"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="channel-jid">Channel Address</label>
            <input
              id="channel-jid"
              type="text"
              value={jid}
              onChange={(e) => setJid(e.target.value)}
              placeholder="channel@example.com"
              required
            />
          </div>
          <div className="modal-actions">
            <button type="button" onClick={onClose} className="secondary-btn">
              Cancel
            </button>
            <button type="submit" disabled={creating || !name.trim() || !jid.trim()} className="primary-btn">
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
