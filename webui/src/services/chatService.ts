import { client, xml, jid } from '@xmpp/client'
import debug from '@xmpp/debug'

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
  private client: any = null
  private eventHandlers: ChatEventHandler[] = []
  private currentJid: string = ''
  private members: Map<string, ChatMember> = new Map()
  private channels: Map<string, ChatChannel> = new Map()

  constructor() {
    console.log('[ChatService] Initialized')
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
    if (this.client) {
      throw new Error('Already connected')
    }

    console.log('[ChatService] Connecting to:', serverUrl)

    // Parse username@domain
    let jidString = username.trim()
    if (!jidString.includes('@')) {
      const urlMatch = serverUrl.match(/(?:ws|wss|http|https):\/\/([^\/:]+)/)
      const domain = urlMatch?.[1] || 'localhost'
      jidString = `${jidString}@${domain}`
    }
    const userJid = jid(jidString)
    this.currentJid = userJid.toString()

    // Create WebSocket URL
    let wsUrl = serverUrl.trim()
    if (wsUrl.startsWith('http://')) {
      wsUrl = wsUrl.replace('http://', 'ws://')
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = wsUrl.replace('https://', 'wss://')
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = `wss://${wsUrl}`
    }

    // Ensure WebSocket path
    const pathMatch = wsUrl.match(/^(wss?:\/\/[^\/]+)(\/.*)?(\?.*)?(#.*)?$/)
    if (pathMatch && (!pathMatch[2] || pathMatch[2] === '/')) {
      wsUrl = `${pathMatch[1]}/ws${pathMatch[3] || ''}${pathMatch[4] || ''}`
    }

    console.log('[ChatService] WebSocket URL:', wsUrl)

    // Get JWT token from API endpoint with network-specific JID
    const jwtToken = await this.getJWTToken(networkId)
    console.log('[ChatService] Using JWT for authentication')

    const xmppClient = client({
      service: wsUrl,
      domain: userJid.domain,
      username: userJid.local,
      password: jwtToken,
    })

    debug(xmppClient, true)
    this.client = xmppClient

    // Connection events
    xmppClient.on('online', async (address: any) => {
      console.log('[ChatService] Connected as:', address.toString())
      this.currentJid = address.toString()
      
      // Send presence
      await xmppClient.send(xml('presence'))
      
      // Request roster (contact list) to discover members
      try {
        const rosterIq = xml('iq', { type: 'get', id: 'roster-1' }, xml('query', { xmlns: 'jabber:iq:roster' }))
        await xmppClient.send(rosterIq)
        console.log('[ChatService] Roster request sent')
      } catch (err) {
        console.warn('[ChatService] Could not request roster:', err)
      }
      
      this.emit('connected', { jid: this.currentJid })
    })

    xmppClient.on('offline', () => {
      console.log('[ChatService] Disconnected')
      this.emit('disconnected')
      this.members.clear()
      this.channels.clear()
    })

    xmppClient.on('error', (err: any) => {
      console.error('[ChatService] Error:', err)
      this.emit('error', { message: err.message || 'Connection error' })
    })

    xmppClient.on('stanza', async (stanza: any) => {
      console.log('[ChatService] Received stanza:', stanza.toString())
      
      // Handle roster (contact list)
      if (stanza.is('iq') && stanza.getChild('query')?.attrs.xmlns === 'jabber:iq:roster') {
        const query = stanza.getChild('query')
        const items = query?.getChildren('item') || []
        items.forEach((item: any) => {
          const jid = item.attrs.jid
          const name = item.attrs.name || jid.split('@')[0]
          if (jid && jid !== this.currentJid) {
            this.members.set(jid, {
              jid,
              displayName: name,
              presence: 'offline', // Will be updated by presence
              status: item.getChildText('status'),
            })
            this.emit('memberUpdate', { jid, member: this.members.get(jid) })
          }
        })
        console.log('[ChatService] Roster received, members:', this.members.size)
      }

      // Handle presence
      if (stanza.is('presence')) {
        const from = stanza.attrs.from || ''
        const fromJid = from.split('/')[0]
        const type = stanza.attrs.type || 'available'
        const show = stanza.getChildText('show') || 'available'
        const status = stanza.getChildText('status') || ''

        if (fromJid && fromJid !== this.currentJid) {
          let presence: 'online' | 'away' | 'offline' = 'online'
          if (type === 'unavailable') {
            presence = 'offline'
          } else if (show === 'away' || show === 'xa') {
            presence = 'away'
          }

          const existing = this.members.get(fromJid)
          const displayName = existing?.displayName || fromJid.split('@')[0]
          
          this.members.set(fromJid, {
            jid: fromJid,
            displayName,
            presence,
            status,
          })
          this.emit('memberUpdate', { jid: fromJid, member: this.members.get(fromJid) })
        }
      }

      // Handle messages
      if (stanza.is('message')) {
        const body = stanza.getChildText('body')
        if (body) {
          const from = stanza.attrs.from || 'Unknown'
          const fromJid = from.split('/')[0]
          const conversationId = fromJid
          const displayName = fromJid.split('@')[0]

          const message: ChatMessage = {
            id: `${Date.now()}-${Math.random()}`,
            from: fromJid,
            fromDisplayName: displayName,
            body,
            timestamp: new Date(),
            type: 'received',
            conversationId,
          }

          // Ensure channel exists for direct messages
          if (!this.channels.has(conversationId)) {
            this.channels.set(conversationId, {
              id: conversationId,
              name: displayName,
              jid: conversationId,
              type: 'direct',
              unreadCount: 0,
            })
            this.emit('channelAdded', { channel: this.channels.get(conversationId) })
          }

          this.emit('message', { message })
        }
      }
    })

    await xmppClient.start()
    console.log('[ChatService] Connection started')
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.stop()
      } catch (err) {
        console.error('[ChatService] Error disconnecting:', err)
      }
      this.client = null
    }
    this.members.clear()
    this.channels.clear()
    this.emit('disconnected')
  }

  async sendMessage(conversationId: string, body: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected')
    }

    const recipientJid = jid(conversationId)
    const message = xml(
      'message',
      { to: recipientJid.toString(), type: 'chat' },
      xml('body', {}, body)
    )

    await this.client.send(message)
    console.log('[ChatService] Message sent to:', recipientJid.toString())

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
    // For now, channels are just direct message conversations
    // In the future, this could create MUC (Multi-User Chat) rooms
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
    return this.client !== null
  }
}
