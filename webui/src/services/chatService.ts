export interface ChatMessage {
  id: string
  from: string
  fromDisplayName: string
  body: string
  timestamp: Date
  type: 'sent' | 'received'
  conversationId: string
}

export interface ChatMember {
  jid: string
  displayName: string
  presence: 'online' | 'away' | 'offline'
  status?: string
}

export interface ChatChannel {
  id: string
  name: string
  jid: string
  type: 'channel' | 'direct'
  unreadCount: number
}

export type ChatEventHandler = (event: string, data?: any) => void

export class ChatService {
  private connected: boolean = false
  private eventHandlers: ChatEventHandler[] = []
  private currentJid: string = ''
  private members: Map<string, ChatMember> = new Map()
  private channels: Map<string, ChatChannel> = new Map()

  constructor() {
    console.log('[ChatService] Initialized (stub mode - no XMPP)')
  }

  on(event: ChatEventHandler) {
    this.eventHandlers.push(event)
  }

  off(event: ChatEventHandler) {
    this.eventHandlers = this.eventHandlers.filter(h => h !== event)
  }

  private emit(event: string, data?: any) {
    this.eventHandlers.forEach(handler => handler(event, data))
  }

  private async getJWTToken(networkId: number): Promise<string> {
    // Get JWT token from API endpoint with network-specific JID
    // Use relative URL which works when webui and API are on same origin
    const API_BASE_URL = import.meta.env.VITE_API_URL || ''
    const response = await fetch(`${API_BASE_URL}/v1/auth/token?network=${networkId}`, {
      method: 'GET',
      credentials: 'include',
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to get JWT token: ${errorText || 'Please log in first.'}`)
    }
    
    const data = await response.json()
    console.log('[ChatService] JWT token retrieved from API for network:', networkId)
    return data.token
  }

  async connect(serverUrl: string, username: string, networkId: number): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected')
    }

    console.log('[ChatService] Stub: Simulating connection to:', serverUrl)

    // Parse username@domain
    let jidString = username.trim()
    if (!jidString.includes('@')) {
      const urlMatch = serverUrl.match(/(?:ws|wss|http|https):\/\/([^\/:]+)/)
      const domain = urlMatch?.[1] || 'localhost'
      jidString = `${jidString}@${domain}`
    }
    this.currentJid = jidString

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 500))

    // Stub: Simulate successful connection
    this.connected = true
    console.log('[ChatService] Stub: Connected as:', this.currentJid)
    
    // Emit connected event
    this.emit('connected', { jid: this.currentJid })
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return
    }

    console.log('[ChatService] Stub: Disconnecting')
    this.connected = false
    this.members.clear()
    this.channels.clear()
    this.emit('disconnected')
  }

  async sendMessage(conversationId: string, body: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected')
    }

    console.log('[ChatService] Stub: Message sent to:', conversationId, body)

    const displayName = this.currentJid.split('@')[0]
    const chatMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      from: this.currentJid,
      fromDisplayName: displayName,
      body,
      timestamp: new Date(),
      type: 'sent',
      conversationId,
    }

    this.emit('message', { message: chatMessage })
  }

  async createChannel(name: string, jid: string): Promise<ChatChannel> {
    const channel: ChatChannel = {
      id: jid,
      name,
      jid,
      type: 'direct',
      unreadCount: 0,
    }

    this.channels.set(jid, channel)
    this.emit('channelAdded', { channel })
    return channel
  }

  getMembers(): ChatMember[] {
    return Array.from(this.members.values())
  }

  getChannels(): ChatChannel[] {
    return Array.from(this.channels.values())
  }

  getCurrentJid(): string {
    return this.currentJid
  }

  isConnected(): boolean {
    return this.connected
  }
}
