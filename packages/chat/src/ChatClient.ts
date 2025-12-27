import * as Y from 'yjs'
import { WebSocketTransport } from './transport'
import { YjsSync, AwarenessState } from './sync'
import { PersistenceProvider, MemoryPersistence } from './persistence'

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
  isOnline: boolean  // Peer connectivity status
  persistenceReady: boolean  // IndexedDB loaded
}

export type ChatClientListener = (state: ChatClientState) => void

/**
 * Event handler for new messages
 */
export type MessageHandler = (message: ChatMessage) => void

/**
 * Event handler for member changes
 */
export type MemberHandler = (members: ChatMember[]) => void

/**
 * Event handler for channel changes
 */
export type ChannelHandler = (channels: ChatChannel[]) => void

export interface Network {
  id: number
  name: string
  headscale_endpoint: string
  created_at: string
}

/**
 * Simple configuration for ChatClient
 */
export interface ChatClientConfig {
  /**
   * Unique user identifier (e.g., username, user ID)
   */
  userId: string
  
  /**
   * Display name for the user
   */
  displayName: string
  
  /**
   * WebSocket URL for the agent (e.g., 'ws://localhost:8082')
   */
  agentUrl: string
  
  /**
   * Optional persistence provider.
   * If not provided, uses in-memory persistence (no persistence).
   * For browser apps, use IndexedDBPersistence.
   * For Node.js/Bun, use a custom implementation or in-memory.
   */
  persistence?: PersistenceProvider
}

/**
 * Advanced configuration with async user info fetching
 * Useful for integration with authentication systems
 */
export interface ChatClientAdvancedConfig {
  /**
   * Function to get current user info
   * Must return an object with user_handle property
   */
  getUserInfo: () => Promise<{ user_handle: string }>
  
  /**
   * WebSocket URL for the agent (e.g., 'ws://localhost:8082')
   */
  agentUrl: string
  
  /**
   * Optional persistence provider.
   * If not provided, uses in-memory persistence (no persistence).
   * For browser apps, use IndexedDBPersistence.
   * For Node.js/Bun, use a custom implementation or in-memory.
   */
  persistence?: PersistenceProvider
}

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
  private transport: WebSocketTransport | null = null
  private sync: YjsSync | null = null
  private persistence: PersistenceProvider | null = null
  private currentUserId: string | null = null
  private config: ChatClientConfig | ChatClientAdvancedConfig
  private isAdvancedConfig: boolean
  
  private state: ChatClientState = {
    connected: false,
    connecting: false,
    error: null,
    selfId: null,
    displayName: '',
    members: [],
    channels: [],
    isOnline: false,
    persistenceReady: false,
  }
  
  private listeners = new Set<ChatClientListener>()
  private messageHandlers = new Set<MessageHandler>()
  private memberHandlers = new Set<MemberHandler>()
  private channelHandlers = new Set<ChannelHandler>()
  private connectPromise: Promise<void> | null = null
  private messageObservers = new Map<string, () => void>()

  constructor(config: ChatClientConfig | ChatClientAdvancedConfig) {
    this.config = config
    // Check if it's an advanced config by checking for getUserInfo
    this.isAdvancedConfig = 'getUserInfo' in config
  }

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

  /**
   * Subscribe to new messages (convenience method for chatbots)
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  /**
   * Subscribe to member list changes
   */
  onMembersChange(handler: MemberHandler): () => void {
    this.memberHandlers.add(handler)
    // Immediately call with current members
    handler(this.state.members)
    return () => {
      this.memberHandlers.delete(handler)
    }
  }

  /**
   * Subscribe to channel list changes
   */
  onChannelsChange(handler: ChannelHandler): () => void {
    this.channelHandlers.add(handler)
    // Immediately call with current channels
    handler(this.state.channels)
    return () => {
      this.channelHandlers.delete(handler)
    }
  }

  private setState(partial: Partial<ChatClientState>): void {
    this.state = { ...this.state, ...partial }
    this.notifyListeners()
    
    // Emit specific events for convenience
    if (partial.members) {
      this.memberHandlers.forEach(handler => {
        try {
          handler(partial.members!)
        } catch (error) {
          console.error('[ChatClient] Member handler error:', error)
        }
      })
    }
    
    if (partial.channels) {
      this.channelHandlers.forEach(handler => {
        try {
          handler(partial.channels!)
        } catch (error) {
          console.error('[ChatClient] Channel handler error:', error)
        }
      })
    }
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
      // Get user info - either from simple config or async function
      let userId: string
      let displayName: string
      
      if (this.isAdvancedConfig) {
        const advancedConfig = this.config as ChatClientAdvancedConfig
        const userInfo = await advancedConfig.getUserInfo()
        userId = userInfo.user_handle || 'Anonymous'
        displayName = userId
      } else {
        const simpleConfig = this.config as ChatClientConfig
        userId = simpleConfig.userId
        displayName = simpleConfig.displayName
      }
      
      this.currentUserId = userId
      this.setState({ displayName })
      console.log('[ChatClient] User:', displayName, '(ID:', userId, ')')

      // Create Y.js document
      const doc = new Y.Doc()
      this.doc = doc

      // Initialize persistence provider (defaults to in-memory if not provided)
      this.persistence = this.config.persistence || new MemoryPersistence()
      await this.persistence.init(doc)

      // Wait for persistence to be ready
      await this.persistence.waitUntilReady()
      this.setState({ persistenceReady: this.persistence.isReady() })

      // Set up Y.js observers
      const channelsMap = doc.getMap<ChatChannel>('channels')
      const messagesMap = doc.getMap<Y.Array<ChatMessage>>('messages')

      channelsMap.observe(() => {
        this.syncChannelsFromYjs()
      })

      // Observe all message arrays for all channels
      messagesMap.observe((event) => {
        // When a channel's message array is added/updated, observe it
        event.changes.keys.forEach((change, channelId) => {
          if (change.action === 'add' || change.action === 'update') {
            const channelMessages = messagesMap.get(channelId as string)
            if (channelMessages && !this.messageObservers.has(channelId as string)) {
              const observer = () => {
                this.emitMessagesForChannel(channelId as string, channelMessages)
              }
              channelMessages.observe(observer)
              this.messageObservers.set(channelId as string, observer)
            }
          } else if (change.action === 'delete') {
            const observer = this.messageObservers.get(channelId as string)
            if (observer) {
              const channelMessages = messagesMap.get(channelId as string)
              if (channelMessages) {
                channelMessages.unobserve(observer)
              }
              this.messageObservers.delete(channelId as string)
            }
          }
        })

        // Also observe existing channels
        messagesMap.forEach((channelMessages, channelId) => {
          if (!this.messageObservers.has(channelId)) {
            const observer = () => {
              this.emitMessagesForChannel(channelId, channelMessages)
            }
            channelMessages.observe(observer)
            this.messageObservers.set(channelId, observer)
          }
        })
      })

      // Get agent WebSocket URL (same for both config types)
      const agentUrl = this.config.agentUrl
      console.log('[ChatClient] Connecting to agent:', agentUrl)

      // Create transport and connect
      const transport = new WebSocketTransport({
        agentUrl: agentUrl,
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
        name: displayName,
        id: userId,
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

        // Online if we have peers (other than self) or if signaling is connected
        const hasOtherPeers = memberList.length > 1 || states.size > 0
        const isOnline = transport.getConnectedPeers().length > 0 || hasOtherPeers

        console.log('[ChatClient] Members updated:', memberList.length, 'online:', isOnline)
        this.setState({ members: memberList, isOnline })
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

      // Sync initial state
      this.syncChannelsFromYjs()

      // Set initial member list - mark as online since signaling is connected
      this.setState({
        members: [{
          id: userId,
          name: displayName,
          isSelf: true,
        }],
        connected: true,
        connecting: false,
        isOnline: true,
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
      error: null,
      isOnline: false,
      persistenceReady: false,
    })
  }

  private cleanup(): void {
    // Clear message observers before destroying doc
    if (this.doc) {
      const messagesMap = this.doc.getMap<Y.Array<ChatMessage>>('messages')
      this.messageObservers.forEach((observer, channelId) => {
        const channelMessages = messagesMap.get(channelId)
        if (channelMessages) {
          channelMessages.unobserve(observer)
        }
      })
    }
    this.messageObservers.clear()

    if (this.sync) {
      this.sync.destroy()
      this.sync = null
    }
    if (this.transport) {
      this.transport.destroy()
      this.transport = null
    }
    if (this.persistence) {
      this.persistence.destroy()
      this.persistence = null
    }
    if (this.doc) {
      this.doc.destroy()
      this.doc = null
    }
    this.currentUserId = null
    // Clear event handlers
    this.messageHandlers.clear()
    this.memberHandlers.clear()
    this.channelHandlers.clear()
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
   * Send a message to a specific channel
   * Returns false if message cannot be sent (offline or not connected)
   */
  sendMessage(channelId: string, body: string): boolean {
    if (!this.doc) {
      console.warn('[ChatClient] Cannot send message: not connected')
      return false
    }

    if (!this.state.isOnline) {
      console.warn('[ChatClient] Cannot send message: offline')
      return false
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
    return true
  }

  /**
   * Clear all local chat history
   * This removes all channels and messages from local storage
   */
  async clearHistory(): Promise<void> {
    console.log('[ChatClient] Clearing local chat history...')
    
    if (this.persistence) {
      await this.persistence.clear()
      console.log('[ChatClient] Persistence cleared')
    }

    // Clear the Y.Doc in memory
    if (this.doc) {
      this.doc.transact(() => {
        const channelsMap = this.doc!.getMap<ChatChannel>('channels')
        const messagesMap = this.doc!.getMap<Y.Array<ChatMessage>>('messages')
        
        // Clear all channels and messages
        channelsMap.clear()
        messagesMap.clear()
        
        // Recreate default general channel
        const generalChannel: ChatChannel = {
          id: 'general',
          name: 'general',
          createdAt: Date.now(),
          createdBy: this.state.selfId || 'system',
        }
        channelsMap.set('general', generalChannel)
        messagesMap.set('general', new Y.Array<ChatMessage>())
      })
      
      // Re-sync state
      this.syncChannelsFromYjs()
    }

    console.log('[ChatClient] History cleared')
  }

  /**
   * Get messages for a specific channel
   */
  getMessages(channelId: string): ChatMessage[] {
    if (!this.doc) {
      return []
    }

    const messagesMap = this.doc.getMap<Y.Array<ChatMessage>>('messages')
    const channelMessages = messagesMap.get(channelId)
    if (!channelMessages) {
      return []
    }

    return channelMessages.toArray()
  }

  /**
   * Emit messages for a channel to message handlers
   */
  private emitMessagesForChannel(channelId: string, channelMessages: Y.Array<ChatMessage>): void {
    const messages = channelMessages.toArray()
    // Emit new messages (last one) to handlers
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      this.messageHandlers.forEach(handler => {
        try {
          handler(lastMessage)
        } catch (error) {
          console.error('[ChatClient] Message handler error:', error)
        }
      })
    }
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
}

/**
 * Create a new ChatClient with simple configuration
 * Convenience factory function for the most common use case
 */
export function createChatClient(config: ChatClientConfig): ChatClient {
  return new ChatClient(config)
}

