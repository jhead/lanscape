import { useState } from 'react'
import { useChat } from '../../contexts/ChatContext'
import { Sidebar } from './Sidebar'
import { ChatWindow } from './ChatWindow'
import { ConnectionForm } from './ConnectionForm'
import './ChatLayout.css'

export function ChatLayout() {
  const { connected } = useChat()

  return (
    <div className="chat-layout">
      {!connected ? (
        <div className="chat-connection-container">
          <div className="chat-branding">
            <span className="chat-brand">LANSCAPE</span>
          </div>
          <ConnectionForm />
        </div>
      ) : (
        <>
          <Sidebar />
          <ChatWindow />
        </>
      )}
    </div>
  )
}
