import { useState, useEffect, useRef } from 'react'
import { client, xml, jid } from '@xmpp/client'
import debug from '@xmpp/debug'

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
  
  const xmppClientRef = useRef<any>(null)
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
      console.log('[XMPP] Attempting to connect to:', serverUrl)

      // Parse username@domain
      let jidString = username.trim()
      if (!jidString.includes('@')) {
        // Extract domain from server URL if username doesn't include domain
        let domain = 'localhost'
        try {
          const urlMatch = serverUrl.match(/(?:ws|wss|http|https):\/\/([^\/:]+)/)
          if (urlMatch && urlMatch[1]) {
            domain = urlMatch[1]
          }
        } catch (e) {
          console.warn('[XMPP] Could not extract domain from server URL')
        }
        jidString = `${jidString}@${domain}`
      }
      const userJid = jid(jidString)
      
      console.log('[XMPP] Connecting as:', userJid.toString())

      // Create WebSocket URL - convert http/https to ws/wss
      let wsUrl = serverUrl.trim()
      if (wsUrl.startsWith('http://')) {
        wsUrl = wsUrl.replace('http://', 'ws://')
      } else if (wsUrl.startsWith('https://')) {
        wsUrl = wsUrl.replace('https://', 'wss://')
      } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        // Default to wss for security
        wsUrl = `wss://${wsUrl}`
      }

      // Ensure the WebSocket path includes /xmpp-websocket or similar if no path is specified
      // Check if there's a path after the host (excluding query params and fragments)
      const pathMatch = wsUrl.match(/^(wss?:\/\/[^\/]+)(\/.*)?(\?.*)?(#.*)?$/)
      if (pathMatch && (!pathMatch[2] || pathMatch[2] === '/')) {
        // No path or just root path, add default XMPP WebSocket path
        wsUrl = `${pathMatch[1]}/xmpp-websocket${pathMatch[3] || ''}${pathMatch[4] || ''}`
      }

      console.log('[XMPP] WebSocket URL:', wsUrl)

      const xmppClient = client({
        service: wsUrl,
        domain: userJid.domain,
        username: userJid.local,
        password: password,
      })

      // Enable debug logging
      debug(xmppClient, true)

      xmppClientRef.current = xmppClient

      // Handle connection events
      xmppClient.on('online', async (address) => {
        console.log('[XMPP] Connected as:', address.toString())
        setConnected(true)
        setConnecting(false)
        setConnectionStatus('Connected')
        
        // Send presence to appear online
        await xmppClient.send(xml('presence'))
        console.log('[XMPP] Presence sent')
      })

      xmppClient.on('offline', () => {
        console.log('[XMPP] Disconnected')
        setConnected(false)
        setConnectionStatus('Disconnected')
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          from: 'System',
          body: 'Disconnected from server',
          timestamp: new Date(),
          type: 'received'
        }])
      })

      xmppClient.on('error', (err) => {
        console.error('[XMPP] Error:', err)
        setError(err.message || 'Connection error occurred')
        setConnecting(false)
        setConnectionStatus('Error')
        setConnected(false)
      })

      xmppClient.on('stanza', async (stanza) => {
        console.log('[XMPP] Received stanza:', stanza.toString())
        
        if (stanza.is('message')) {
          const body = stanza.getChildText('body')
          if (body) {
            const from = stanza.attrs.from || 'Unknown'
            setMessages(prev => [...prev, {
              id: `${Date.now()}-${Math.random()}`,
              from: from.split('/')[0], // Remove resource part
              body: body,
              timestamp: new Date(),
              type: 'received'
            }])
          }
        }
      })

      // Start the connection
      await xmppClient.start()
      console.log('[XMPP] Connection started')

    } catch (err: any) {
      console.error('[XMPP] Connection failed:', err)
      setError(err.message || 'Failed to connect to XMPP server')
      setConnecting(false)
      setConnectionStatus('Connection failed')
      setConnected(false)
    }
  }

  const disconnect = async () => {
    if (xmppClientRef.current) {
      try {
        await xmppClientRef.current.stop()
        console.log('[XMPP] Disconnected')
      } catch (err) {
        console.error('[XMPP] Error disconnecting:', err)
      }
      xmppClientRef.current = null
    }
    setConnected(false)
    setConnectionStatus('Disconnected')
  }

  const sendMessage = async () => {
    if (!messageInput.trim() || !recipient.trim() || !xmppClientRef.current) {
      return
    }

    try {
      const recipientJid = jid(recipient)
      const message = xml(
        'message',
        { to: recipientJid.toString(), type: 'chat' },
        xml('body', {}, messageInput)
      )

      await xmppClientRef.current.send(message)
      console.log('[XMPP] Message sent to:', recipientJid.toString())

      // Add to local messages
      setMessages(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        from: recipientJid.toString(),
        body: messageInput,
        timestamp: new Date(),
        type: 'sent'
      }])

      setMessageInput('')
    } catch (err: any) {
      console.error('[XMPP] Error sending message:', err)
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
              placeholder="wss://xmpp.example.com:5281/xmpp-websocket"
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
