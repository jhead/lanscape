import { useChat, ChatMessage } from '../../contexts/ChatContext'
import { Avatar } from './WebGLAvatar'
import './MessageItem.css'

interface MessageItemProps {
  message: ChatMessage
}

export function MessageItem({ message }: MessageItemProps) {
  const { selfId } = useChat()
  const isSelf = message.authorId === selfId

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
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
    <div className={`message-item ${isSelf ? 'sent' : 'received'}`}>
      <Avatar userId={message.authorId} size={40} className="message-avatar" />
      <div className="message-content">
        <div className="message-header">
          <span className="message-author">{message.authorName}</span>
          <span className="message-time">{formatTime(message.timestamp)}</span>
        </div>
        <div className="message-body">{message.body}</div>
      </div>
    </div>
  )
}
