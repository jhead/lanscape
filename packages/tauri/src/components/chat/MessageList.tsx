import { useEffect, useRef } from 'react'
import { useChat } from '../../contexts/ChatContext'
import { MessageItem } from './MessageItem'
import './MessageList.css'

export function MessageList() {
  const { messages } = useChat()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="message-list">
      {messages.length === 0 ? (
        <div className="message-list-empty">
          No messages yet. Start the conversation!
        </div>
      ) : (
        messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))
      )}
      <div ref={messagesEndRef} />
    </div>
  )
}
