import { useChat } from '../../contexts/ChatContext'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import './ChatWindow.css'

export function ChatWindow() {
  const { currentChannelId, channels } = useChat()
  const currentChannel = channels.find(c => c.id === currentChannelId)

  return (
    <div className="chat-window">
      {currentChannelId && currentChannel ? (
        <>
          <div className="chat-window-header">
            <span className="chat-window-hash">#</span>
            <span className="chat-window-title">{currentChannel.name}</span>
          </div>
          <MessageList />
          <MessageInput />
        </>
      ) : (
        <div className="chat-window-empty">
          <div className="chat-window-empty-content">
            <span className="chat-window-empty-icon">💬</span>
            <h3>Select a channel</h3>
            <p>Choose a channel from the sidebar to start chatting</p>
          </div>
        </div>
      )}
    </div>
  )
}
