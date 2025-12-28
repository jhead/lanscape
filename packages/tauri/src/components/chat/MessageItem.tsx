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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    
    const isToday = messageDate.getTime() === today.getTime()
    const isThisYear = date.getFullYear() === now.getFullYear()
    
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    
    if (isToday) {
      return timeStr
    }
    
    if (isThisYear) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + timeStr
    }
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' + timeStr
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
