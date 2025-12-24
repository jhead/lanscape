import { useState, useEffect, useRef } from 'react'

interface Message {
  id: string
  from: string
  body: string
  timestamp: Date
  type: 'sent' | 'received'
}

export function XMPPChat() {
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [recipient, setRecipient] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const connect = async () => {
    if (!serverUrl || !username || !password) {
      setError('Please fill in all fields')
      return
    }

    try {
      setConnecting(true)
      setError(null)
      setConnectionStatus('Connecting...')
      console.log('[XMPP Stub] Simulating connection to:', serverUrl)

      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 500))

      // Stub: Simulate successful connection
      setConnected(true)
      setConnecting(false)
      setConnectionStatus('Connected (Stub Mode)')
      console.log('[XMPP Stub] Connected (simulated)')
    } catch (err: any) {
      console.error('[XMPP Stub] Connection failed:', err)
      setError(err.message || 'Failed to connect')
      setConnecting(false)
      setConnectionStatus('Connection failed')
      setConnected(false)
    }
  }

  const disconnect = async () => {
    console.log('[XMPP Stub] Disconnecting')
    setConnected(false)
    setConnectionStatus('Disconnected')
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      from: 'System',
      body: 'Disconnected from server (stub mode)',
      timestamp: new Date(),
      type: 'received'
    }])
  }

  const sendMessage = async () => {
    if (!messageInput.trim() || !recipient.trim() || !connected) {
      return
    }

    try {
      console.log('[XMPP Stub] Message sent to:', recipient, messageInput)

      // Add to local messages (stub mode - message not actually sent)
      setMessages(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        from: recipient,
        body: messageInput,
        timestamp: new Date(),
        type: 'sent'
      }])

      setMessageInput('')
    } catch (err: any) {
      console.error('[XMPP Stub] Error sending message:', err)
      setError(err.message || 'Failed to send message')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="card xmpp-chat-card">
      <h2>XMPP Chat</h2>
      
      {!connected ? (
        <div className="xmpp-connection-form">
          <div className="form-group">
            <label htmlFor="xmpp-server">XMPP Server URL</label>
            <input
              id="xmpp-server"
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="wss://example.com/ws"
              disabled={connecting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="xmpp-username">Username@Domain</label>
            <input
              id="xmpp-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="user@example.com"
              disabled={connecting}
            />
          </div>
          <div className="form-group">
            <label htmlFor="xmpp-password">Password</label>
            <input
              id="xmpp-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={connecting}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  connect()
                }
              }}
            />
          </div>
          {error && (
            <div className="status error" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={connect}
            disabled={connecting || !serverUrl || !username || !password}
            className="primary-btn"
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      ) : (
        <div className="xmpp-chat-interface">
          <div className="xmpp-chat-header">
            <span className="xmpp-status">
              <span className={`xmpp-status-indicator ${connected ? 'connected' : 'disconnected'}`}></span>
              {connectionStatus}
            </span>
            <button
              type="button"
              onClick={disconnect}
              className="secondary-btn"
              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
            >
              Disconnect
            </button>
          </div>

          <div className="xmpp-messages-container">
            {messages.length === 0 ? (
              <div className="empty-state">No messages yet. Start a conversation!</div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`xmpp-message ${msg.type === 'sent' ? 'sent' : 'received'}`}
                >
                  <div className="xmpp-message-header">
                    <span className="xmpp-message-from">{msg.from}</span>
                    <span className="xmpp-message-time">
                      {msg.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="xmpp-message-body">{msg.body}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="xmpp-chat-inputs">
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <label htmlFor="xmpp-recipient">To (JID)</label>
              <input
                id="xmpp-recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="xmpp-message-input-group">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="xmpp-message-input"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!messageInput.trim() || !recipient.trim()}
                className="primary-btn"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
