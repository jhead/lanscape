import { useState } from 'react'
import { useChat } from '../../contexts/ChatContext'
import './MessageInput.css'

export function MessageInput() {
  const { sendMessage, currentChannelId, channels, isOnline } = useChat()
  const [input, setInput] = useState('')
  
  const currentChannel = channels.find(c => c.id === currentChannelId)
  const canSend = currentChannelId && isOnline

  const getPlaceholder = () => {
    if (!isOnline) return 'Offline'
    if (!currentChannel) return 'Select a channel...'
    return `Message #${currentChannel.name}`
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !canSend) return

    const sent = sendMessage(input.trim())
    if (sent) {
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <div className="message-input-container">
      <form onSubmit={handleSubmit} className="message-input-form">
        <div className={`message-input-wrapper ${!isOnline ? 'offline' : ''}`}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            className="message-input"
            disabled={!canSend}
          />
          <div className="message-input-actions">
            <button
              type="submit"
              disabled={!input.trim() || !canSend}
              className="message-send-btn"
              title={isOnline ? 'Send' : 'Offline'}
            >
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
