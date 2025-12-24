import * as Y from 'yjs'
import { WebRTCTransport } from '../transport'
import { YjsSync, AwarenessState } from '../sync'
import { getCurrentUser } from '../../utils/api'

// Default signaling URL from environment or fallback
const DEFAULT_SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:8081'
const DEFAULT_TOPIC = import.meta.env.VITE_CHAT_TOPIC || 'lanscape-chat'

// Types for chat data stored in Y.js
export interface ChatChannel {
  id: string
  name: string
  createdAt: number
  createdBy: string
}

export interface ChatMessage {
  id: string
  channelId: string
  authorId: string
  authorName: string
  body: string
  timestamp: number
}

export interface ChatMember {
  id: string
  name: string
  isSelf: boolean
}

export type ChatClientState = {
  connected: boolean
  connecting: boolean
  error: string | null
  selfId: string | null
  displayName: string
  members: ChatMember[]
  channels: ChatChannel[]
  messages: ChatMessage[]
  currentChannelId: string | null
}

export type ChatClientListener = (state: ChatClientState) => void

// Generate a simple unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

/**
 * ChatClient manages the chat connection and state outside of React.
 * This prevents React Strict Mode double-renders from causing duplicate connections.
 */
export class ChatClient {
  private doc: Y.Doc | null = null
  private transport: WebRTCTransport | null = null
  private sync: YjsSync | null = null
  
  private state: ChatClientState = {
    connected: false,
    connecting: false,
    error: null,
    selfId: null,
    displayName: '',
    members: [],
    channels: [],
    messages: [],
    currentChannelId: null,
  }
  
  private listeners = new Set<ChatClientListener>()
  private connectPromise: Promise<void> | null = null

  /**
   * Subscribe to state changes
   */
  subscribe(listener: ChatClientListener): () => void {
    this.listeners.add(listener)
    // Immediately call with current state
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Get current state
   */
  getState(): ChatClientState {
    return this.state
  }

  private setState(partial: Partial<ChatClientState>): void {
    this.state = { ...this.state, ...partial }
    this.notifyListeners()
  }

  private notifyListeners(): void {
    const state = this.state
    this.listeners.forEach((listener) => {
      try {
        listener(state)
      } catch (error) {
        console.error('[ChatClient] Listener error:', error)
      }
    })
  }

  /**
   * Connect to the chat - safe to call multiple times
   */
  async connect(): Promise<void> {
    // If already connected or connecting, return existing promise
    if (this.state.connected) {
      console.log('[ChatClient] Already connected')
      return
    }
    
    if (this.connectPromise) {
      console.log('[ChatClient] Connection in progress, waiting...')
      return this.connectPromise
    }

    this.connectPromise = this.doConnect()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async doConnect(): Promise<void> {
    console.log('[ChatClient] Connecting...')
    this.setState({ connecting: true, error: null })

    try {
      // Get username from JWT
      const userInfo = await getCurrentUser()
      const username = userInfo.user_handle || 'Anonymous'
      this.setState({ displayName: username })
      console.log('[ChatClient] User:', username)

      // Create Y.js document
      const doc = new Y.Doc()
      this.doc = doc

      // Set up Y.js observers
      const channelsMap = doc.getMap<ChatChannel>('channels')
      const messagesMap = doc.getMap<Y.Array<ChatMessage>>('messages')

      channelsMap.observe(() => {
        this.syncChannelsFromYjs()
      })

      messagesMap.observeDeep(() => {
        this.syncMessagesFromYjs()
      })

      // Normalize signaling URL
      let wsUrl = DEFAULT_SIGNALING_URL.trim()
      if (wsUrl.startsWith('http://')) {
        wsUrl = wsUrl.replace('http://', 'ws://')
      } else if (wsUrl.startsWith('https://')) {
        wsUrl = wsUrl.replace('https://', 'wss://')
      } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        wsUrl = `ws://${wsUrl}`
      }

      // Create transport and connect
      const transport = new WebRTCTransport({
        signalingUrl: wsUrl,
        topic: DEFAULT_TOPIC,
      })
      this.transport = transport

      await transport.connect()

      // Get self ID from transport
      const id = transport.getSelfId()
      this.setState({ selfId: id })

      // Create Y.js sync layer
      const sync = new YjsSync(doc, transport)
      this.sync = sync

      // Set awareness for this user
      sync.setAwareness({
        name: username,
        id: username,
      })

      // Subscribe to awareness changes
      sync.onAwarenessChange((states: Map<string, AwarenessState>) => {
        const selfUserId = this.state.displayName || 'Anonymous'
        
        // Use a Map to deduplicate by user ID
        const memberMap = new Map<string, ChatMember>()
        
        // Add self first
        memberMap.set(selfUserId, {
          id: selfUserId,
          name: selfUserId,
          isSelf: true,
        })

        // Add other members from awareness
        states.forEach((state) => {
          const userId = state.user.id
          if (userId === selfUserId) return
          if (memberMap.has(userId)) return
          
          memberMap.set(userId, {
            id: userId,
            name: state.user.name,
            isSelf: false,
          })
        })

        // Convert to array with self first
        const memberList = Array.from(memberMap.values()).sort((a, b) => {
          if (a.isSelf) return -1
          if (b.isSelf) return 1
          return a.name.localeCompare(b.name)
        })

        console.log('[ChatClient] Members updated:', memberList.length)
        this.setState({ members: memberList })
      })

      // Create default "general" channel if none exist
      doc.transact(() => {
        if (channelsMap.size === 0) {
          const generalChannel: ChatChannel = {
            id: 'general',
            name: 'general',
            createdAt: Date.now(),
            createdBy: id || 'system',
          }
          channelsMap.set('general', generalChannel)
          messagesMap.set('general', new Y.Array<ChatMessage>())
        }
      })

      // Sync initial state and set default channel
      this.syncChannelsFromYjs()
      this.setCurrentChannel('general')

      // Set initial member list
      this.setState({
        members: [{
          id: username,
          name: username,
          isSelf: true,
        }],
        connected: true,
        connecting: false,
      })

      console.log('[ChatClient] Connected successfully')
    } catch (err) {
      console.error('[ChatClient] Connection error:', err)
      this.setState({
        error: err instanceof Error ? err.message : 'Failed to connect',
        connecting: false,
      })
      this.cleanup()
    }
  }

  /**
   * Disconnect from chat
   */
  disconnect(): void {
    console.log('[ChatClient] Disconnecting')
    this.cleanup()
    this.setState({
      connected: false,
      connecting: false,
      selfId: null,
      members: [],
      channels: [],
      messages: [],
      currentChannelId: null,
      error: null,
    })
  }

  private cleanup(): void {
    if (this.sync) {
      this.sync.destroy()
      this.sync = null
    }
    if (this.transport) {
      this.transport.destroy()
      this.transport = null
    }
    if (this.doc) {
      this.doc.destroy()
      this.doc = null
    }
  }

  /**
   * Set current channel
   */
  setCurrentChannel(channelId: string | null): void {
    console.log('[ChatClient] Setting current channel:', channelId)
    this.setState({ currentChannelId: channelId })
    this.syncMessagesFromYjs()
  }

  /**
   * Create a new channel
   */
  createChannel(name: string): ChatChannel {
    if (!this.doc) {
      throw new Error('Not connected')
    }

    const channelsMap = this.doc.getMap<ChatChannel>('channels')
    const messagesMap = this.doc.getMap<Y.Array<ChatMessage>>('messages')

    const channelId = generateId()
    const channel: ChatChannel = {
      id: channelId,
      name: name.toLowerCase().replace(/\s+/g, '-'),
      createdAt: Date.now(),
      createdBy: this.state.selfId || 'unknown',
    }

    console.log('[ChatClient] Creating channel:', channel)

    this.doc.transact(() => {
      channelsMap.set(channelId, channel)
      messagesMap.set(channelId, new Y.Array<ChatMessage>())
    })

    return channel
  }

  /**
   * Send a message to the current channel
   */
  sendMessage(body: string): void {
    const channelId = this.state.currentChannelId
    if (!channelId || !this.doc) {
      console.warn('[ChatClient] Cannot send message: not connected or no channel selected')
      return
    }

    const messagesMap = this.doc.getMap<Y.Array<ChatMessage>>('messages')
    let channelMessages = messagesMap.get(channelId)
    if (!channelMessages) {
      channelMessages = new Y.Array<ChatMessage>()
      messagesMap.set(channelId, channelMessages)
    }

    const authorName = this.state.displayName || 'Anonymous'
    const message: ChatMessage = {
      id: generateId(),
      channelId: channelId,
      authorId: authorName,
      authorName: authorName,
      body,
      timestamp: Date.now(),
    }

    console.log('[ChatClient] Sending message:', message)
    channelMessages.push([message])
  }

  private syncChannelsFromYjs(): void {
    if (!this.doc) return

    const channelsMap = this.doc.getMap<ChatChannel>('channels')
    const channelList: ChatChannel[] = []
    channelsMap.forEach((channel) => {
      channelList.push(channel)
    })
    channelList.sort((a, b) => a.createdAt - b.createdAt)
    console.log('[ChatClient] Syncing channels:', channelList.length)
    this.setState({ channels: channelList })
  }

  private syncMessagesFromYjs(): void {
    const channelId = this.state.currentChannelId
    if (!channelId || !this.doc) {
      this.setState({ messages: [] })
      return
    }

    const messagesMap = this.doc.getMap<Y.Array<ChatMessage>>('messages')
    const channelMessages = messagesMap.get(channelId)
    if (!channelMessages) {
      this.setState({ messages: [] })
      return
    }

    const messageList = channelMessages.toArray()
    console.log('[ChatClient] Syncing messages:', messageList.length, 'for channel:', channelId)
    this.setState({ messages: messageList })
  }
}

// Singleton instance
let clientInstance: ChatClient | null = null

/**
 * Get the singleton ChatClient instance
 */
export function getChatClient(): ChatClient {
  if (!clientInstance) {
    clientInstance = new ChatClient()
  }
  return clientInstance
}

