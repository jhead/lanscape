import { ChatMessage } from '../../services/chatService'
import './MessageItem.css'

interface MessageItemProps {
  message: ChatMessage
}

export function MessageItem({ message }: MessageItemProps) {
  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={`message-item ${message.type === 'sent' ? 'sent' : 'received'}`}>
      <div className="message-avatar">
        {message.fromDisplayName.charAt(0).toUpperCase()}
      </div>
      <div className="message-content">
        <div className="message-header">
          <span className="message-author">{message.fromDisplayName}</span>
          <span className="message-time">{formatTime(message.timestamp)}</span>
        </div>
        <div className="message-body">{message.body}</div>
      </div>
    </div>
  )
}
