import { useChat } from '../../contexts/ChatContext'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import './ChatWindow.css'

export function ChatWindow() {
  const { currentConversationId, channels } = useChat()
  const currentChannel = channels.find(c => c.id === currentConversationId)

  return (
    <div className="chat-window">
      {currentConversationId ? (
        <>
          <div className="chat-window-header">
            <span className="chat-window-title">
              {currentChannel?.name || currentConversationId.split('@')[0]}
            </span>
          </div>
          <MessageList conversationId={currentConversationId} />
          <MessageInput conversationId={currentConversationId} />
        </>
      ) : (
        <div className="chat-window-empty">
          <div className="chat-window-empty-content">
            <span className="chat-window-empty-icon">💬</span>
            <h3>Select a conversation</h3>
            <p>Choose a channel or member from the sidebar to start chatting</p>
          </div>
        </div>
      )}
    </div>
  )
}
