import { useEffect, useRef } from 'react'
import { useChat } from '../../contexts/ChatContext'
import { MessageItem } from './MessageItem'
import './MessageList.css'

interface MessageListProps {
  conversationId: string
}

export function MessageList({ conversationId }: MessageListProps) {
  const { messages } = useChat()
  const conversationMessages = messages.get(conversationId) || []
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversationMessages])

  return (
    <div className="message-list">
      {conversationMessages.length === 0 ? (
        <div className="message-list-empty">
          No messages yet. Start the conversation!
        </div>
      ) : (
        conversationMessages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
