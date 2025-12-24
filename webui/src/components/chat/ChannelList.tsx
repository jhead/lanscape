import { useState } from 'react'
import { useChat } from '../../contexts/ChatContext'
import { CreateChannelModal } from './CreateChannelModal'
import './ChannelList.css'

export function ChannelList() {
  const { channels, currentChannelId, setCurrentChannel } = useChat()
  const [showCreateModal, setShowCreateModal] = useState(false)

  return (
    <div className="channel-list">
      <div className="channel-list-header">
        <span className="channel-list-title">Channels</span>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="channel-list-add-btn"
          title="Create channel"
        >
          +
        </button>
      </div>
      <div className="channel-list-items">
        {channels.map((channel) => (
          <button
            key={channel.id}
            type="button"
            onClick={() => setCurrentChannel(channel.id)}
            className={`channel-list-item ${currentChannelId === channel.id ? 'active' : ''}`}
          >
            <span className="channel-hash">#</span>
            <span className="channel-name">{channel.name}</span>
          </button>
        ))}
        {channels.length === 0 && (
          <div className="channel-list-empty">No channels yet</div>
        )}
      </div>
      
      {showCreateModal && (
        <CreateChannelModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}
