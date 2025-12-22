import { useState } from 'react'
import { useChat } from '../../contexts/ChatContext'
import { CreateChannelModal } from './CreateChannelModal'
import './ChannelList.css'

export function ChannelList() {
  const { channels, currentConversationId, setCurrentConversation } = useChat()
  const [showCreateModal, setShowCreateModal] = useState(false)

  return (
    <div className="channel-list">
      <div className="channel-list-header">
        <span className="channel-list-title">Channels</span>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="channel-create-btn"
          title="Create or join channel"
        >
          +
        </button>
      </div>
      <div className="channel-list-items">
        {channels.length === 0 ? (
          <div className="channel-list-empty">
            No channels yet. Click + to create or join one.
          </div>
        ) : (
          channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              onClick={() => setCurrentConversation(channel.id)}
              className={`channel-item ${currentConversationId === channel.id ? 'active' : ''}`}
            >
              <span className="channel-item-icon">#</span>
              <span className="channel-item-name">{channel.name}</span>
              {channel.unreadCount > 0 && (
                <span className="channel-item-unread">{channel.unreadCount}</span>
              )}
            </button>
          ))
        )}
      </div>
      {showCreateModal && (
        <CreateChannelModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}
