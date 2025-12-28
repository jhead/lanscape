import { useChat } from '../../contexts/ChatContext'
import { Sidebar } from './Sidebar'
import { ChatWindow } from './ChatWindow'
import './ChatLayout.css'

export function ChatLayout() {
  const { connecting, error } = useChat()

  if (connecting) {
    return (
      <div className="chat-layout">
        <div className="chat-loading">
          <div className="chat-loading-spinner"></div>
          <span>Connecting to chat...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="chat-layout">
        <div className="chat-error">
          <span className="chat-error-icon">⚠</span>
          <h3>Connection Error</h3>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-layout">
      <Sidebar />
      <ChatWindow />
    </div>
  )
}
