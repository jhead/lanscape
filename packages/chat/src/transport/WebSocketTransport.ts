import { PeerTransport, PeerTransportEvent, PeerTransportListener, Peer } from './PeerTransport'

export interface WebSocketTransportConfig {
  agentUrl: string // e.g., 'ws://localhost:8082'
}

// Protocol message types
interface BrowserMessage {
  type: 'data'
  peerId?: string
  data?: string // Base64 string - Go will decode it
}

interface AgentMessage {
  type: 'data' | 'peer-connected' | 'peer-disconnected' | 'error' | 'welcome'
  peerId?: string
  selfId?: string
  data?: string | ArrayBuffer // Base64 string from Go, or ArrayBuffer for fallback
  error?: string
}

/**
 * WebSocket implementation of PeerTransport.
 * Connects to local lanscape-agent via WebSocket.
 * The agent handles all WebRTC operations and enforces Tailscale interface usage.
 */
export class WebSocketTransport implements PeerTransport {
  private ws: WebSocket | null = null
  private listeners = new Set<PeerTransportListener>()
  private selfId: string | null = null
  private connectedPeers = new Set<string>()
  private config: WebSocketTransportConfig
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private destroyed = false

  constructor(config: WebSocketTransportConfig) {
    this.config = config
  }

  /**
   * Connect to the agent WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocketTransport] Already connected')
      return
    }

    if (this.destroyed) {
      throw new Error('Transport has been destroyed')
    }

    const wsUrl = this.config.agentUrl
    console.log('[WebSocketTransport] Connecting to agent:', wsUrl)

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[WebSocketTransport] Connected to agent')
          this.reconnectAttempts = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event)
        }

        this.ws.onerror = (error) => {
          console.error('[WebSocketTransport] WebSocket error:', error)
          this.emit({ type: 'error', error: new Error('WebSocket error') })
          if (this.ws?.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket connection failed'))
          }
        }

        this.ws.onclose = () => {
          console.log('[WebSocketTransport] Disconnected from agent')
          this.ws = null
          if (!this.destroyed) {
            this.attemptReconnect()
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Disconnect from the agent
   */
  disconnect(): void {
    this.reconnectAttempts = this.maxReconnectAttempts
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connectedPeers.clear()
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocketTransport] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    console.log(`[WebSocketTransport] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    setTimeout(() => {
      if (!this.destroyed && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.connect().catch((error) => {
          console.error('[WebSocketTransport] Reconnect failed:', error)
        })
      }
    }, delay)
  }

  private handleMessage(event: MessageEvent): void {
    try {
      // All messages are JSON (text)
      if (typeof event.data !== 'string') {
        console.warn('[WebSocketTransport] Received non-string message')
        return
      }

      const msg: AgentMessage = JSON.parse(event.data)
      console.log('[WebSocketTransport] Received message:', msg.type)

      switch (msg.type) {
        case 'welcome':
          if (msg.selfId) {
            this.selfId = msg.selfId
            console.log('[WebSocketTransport] Received welcome, selfId:', this.selfId)
          }
          break

        case 'peer-connected':
          if (msg.peerId) {
            this.connectedPeers.add(msg.peerId)
            this.emit({
              type: 'peer-connected',
              peerId: msg.peerId,
            })
          }
          break

        case 'peer-disconnected':
          if (msg.peerId) {
            this.connectedPeers.delete(msg.peerId)
            this.emit({
              type: 'peer-disconnected',
              peerId: msg.peerId,
            })
          }
          break

        case 'data':
          if (msg.peerId && msg.data) {
            // Data comes as base64 string from Go's JSON encoder
            let data: ArrayBuffer
            if (msg.data instanceof ArrayBuffer) {
              data = msg.data
            } else if (typeof msg.data === 'string') {
              // Decode base64 string to ArrayBuffer
              const binaryString = atob(msg.data)
              const bytes = new Uint8Array(binaryString.length)
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i)
              }
              data = bytes.buffer
            } else if (Array.isArray(msg.data)) {
              // Fallback: if it's an array (shouldn't happen with base64, but handle it)
              data = new Uint8Array(msg.data as number[]).buffer
            } else {
              console.warn('[WebSocketTransport] Unexpected data type:', typeof msg.data, msg.data)
              break
            }

            console.log('[WebSocketTransport] Received data message', {
              peerId: msg.peerId,
              dataSize: data.byteLength,
              firstByte: new Uint8Array(data)[0],
            })

            const event: PeerTransportEvent = {
              type: 'message',
              peerId: msg.peerId,
              data: data,
            }
            
            console.log('[WebSocketTransport] Emitting message event', {
              type: event.type,
              peerId: event.peerId,
              hasData: !!event.data,
              dataSize: event.data?.byteLength,
            })

            this.emit(event)
          } else {
            console.warn('[WebSocketTransport] Data message missing peerId or data', {
              hasPeerId: !!msg.peerId,
              hasData: !!msg.data,
              msg,
            })
          }
          break

        case 'error':
          console.error('[WebSocketTransport] Agent error:', msg.error)
          this.emit({
            type: 'error',
            error: new Error(msg.error || 'Unknown error'),
          })
          break
      }
    } catch (error) {
      console.error('[WebSocketTransport] Failed to handle message:', error)
    }
  }

  private sendMessage(msg: BrowserMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocketTransport] Cannot send message, not connected')
      return
    }

    try {
      const json = JSON.stringify(msg)
      this.ws.send(json)
    } catch (error) {
      console.error('[WebSocketTransport] Failed to send message:', error)
    }
  }

  private emit(event: PeerTransportEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('[WebSocketTransport] Listener error:', error)
      }
    })
  }

  getSelfId(): string | null {
    return this.selfId
  }

  getConnectedPeers(): Peer[] {
    return Array.from(this.connectedPeers).map((id) => ({
      id,
      connected: true,
    }))
  }

  sendToPeer(peerId: string, data: ArrayBuffer): boolean {
    if (!this.connectedPeers.has(peerId)) {
      console.warn('[WebSocketTransport] Peer not connected:', peerId)
      return false
    }

    // Convert ArrayBuffer to base64 string for JSON serialization
    const uint8Array = new Uint8Array(data)
    const binaryString = String.fromCharCode(...uint8Array)
    const base64 = btoa(binaryString)

    console.log('[WebSocketTransport] Sending data to peer', {
      peerId,
      size: data.byteLength,
    })

    this.sendMessage({
      type: 'data',
      peerId: peerId,
      data: base64, // Base64 string - Go will decode it
    })

    return true
  }

  broadcast(data: ArrayBuffer): void {
    // Convert ArrayBuffer to base64 string for JSON serialization
    const uint8Array = new Uint8Array(data)
    const binaryString = String.fromCharCode(...uint8Array)
    const base64 = btoa(binaryString)

    console.log('[WebSocketTransport] Broadcasting data', {
      size: data.byteLength,
      connectedPeers: this.connectedPeers.size,
    })

    // Send to all connected peers (agent will handle broadcasting)
    // For now, send without peerId to indicate broadcast
    this.sendMessage({
      type: 'data',
      data: base64, // Base64 string - Go will decode it
    })
  }

  addEventListener(listener: PeerTransportListener): void {
    this.listeners.add(listener)
  }

  removeEventListener(listener: PeerTransportListener): void {
    this.listeners.delete(listener)
  }

  destroy(): void {
    console.log('[WebSocketTransport] Destroying')
    this.destroyed = true
    this.disconnect()
    this.listeners.clear()
  }
}

