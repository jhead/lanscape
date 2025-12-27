import { ChatClient as SDKChatClient, ChatClientState, IndexedDBPersistence } from '@lanscape/chat'
import { getCurrentUser, fetchNetworks } from '../../utils/api'
import type { Network } from '../../types'

// localStorage key for current network (matches NetworkContext)
const CURRENT_NETWORK_KEY = 'lanscape_current_network'

// Re-export types from SDK for convenience
export type {
  ChatChannel,
  ChatMessage,
  ChatMember,
  ChatClientState,
} from '@lanscape/chat'

/**
 * Get the current network from localStorage, or fetch and use the first network if none is selected
 */
async function getCurrentNetwork(): Promise<Network | null> {
  // Try to get from localStorage first
  const stored = localStorage.getItem(CURRENT_NETWORK_KEY)
  if (stored) {
    try {
      const network = JSON.parse(stored) as Network
      console.log('[ChatClient] Using stored network:', network.name)
      return network
    } catch (error) {
      console.error('[ChatClient] Failed to parse stored network:', error)
      localStorage.removeItem(CURRENT_NETWORK_KEY)
    }
  }

  // If no network is stored, fetch networks and use the first one
  try {
    const networks = await fetchNetworks()
    if (networks.length > 0) {
      const firstNetwork = networks[0]
      console.log('[ChatClient] No network selected, using first network:', firstNetwork.name)
      // Store it for future use
      localStorage.setItem(CURRENT_NETWORK_KEY, JSON.stringify(firstNetwork))
      return firstNetwork
    }
  } catch (error) {
    console.error('[ChatClient] Failed to fetch networks:', error)
  }

  return null
}

/**
 * Default initial state before connection
 */
const DEFAULT_STATE: ChatClientState = {
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

/**
 * Wrapper around the SDK ChatClient that integrates with webui's auth system.
 * This provides a singleton instance and handles user info fetching.
 */
class ChatClient {
  private client: SDKChatClient | null = null
  private pendingListeners: Array<(state: ChatClientState) => void> = []
  private unsubscribeFunctions: Map<(state: ChatClientState) => void, () => void> = new Map()

  /**
   * Subscribe to state changes
   * Works before connection - listeners are stored and subscribed once client is initialized
   */
  subscribe(listener: (state: ChatClientState) => void): () => void {
    if (this.client) {
      const unsubscribe = this.client.subscribe(listener)
      this.unsubscribeFunctions.set(listener, unsubscribe)
      return () => {
        unsubscribe()
        this.unsubscribeFunctions.delete(listener)
      }
    }
    
    // Store listener to subscribe once client is initialized
    this.pendingListeners.push(listener)
    
    // Call with default state immediately
    listener(DEFAULT_STATE)
    
    return () => {
      const index = this.pendingListeners.indexOf(listener)
      if (index > -1) {
        // Listener was pending, just remove it
        this.pendingListeners.splice(index, 1)
      } else {
        // Listener was subscribed to client, unsubscribe
        const unsubscribe = this.unsubscribeFunctions.get(listener)
        if (unsubscribe) {
          unsubscribe()
          this.unsubscribeFunctions.delete(listener)
        }
      }
    }
  }

  /**
   * Get current state
   * Returns default state if not yet connected
   */
  getState(): ChatClientState {
    if (!this.client) {
      return DEFAULT_STATE
    }
    return this.client.getState()
  }

  /**
   * Connect to the chat
   */
  async connect(): Promise<void> {
    if (this.client) {
      return this.client.connect()
    }

    // Get agent WebSocket URL (default to localhost:8082)
    const agentUrl = import.meta.env.VITE_AGENT_URL || 'ws://localhost:8082'

    // Get user info first to create per-user persistence
    const userInfo = await getCurrentUser()
    const userId = userInfo.user_handle || 'anonymous'
    
    // Create IndexedDB persistence for browser
    const persistence = new IndexedDBPersistence(`lanscape-chat-${userId}`)

    // Create client with async user info fetching and IndexedDB persistence
    this.client = new SDKChatClient({
      getUserInfo: async () => {
        return await getCurrentUser()
      },
      agentUrl: agentUrl,
      persistence: persistence,
    })

    // Subscribe any pending listeners
    const listenersToSubscribe = [...this.pendingListeners]
    this.pendingListeners = []
    
    listenersToSubscribe.forEach(listener => {
      const unsubscribe = this.client!.subscribe(listener)
      this.unsubscribeFunctions.set(listener, unsubscribe)
    })

    await this.client.connect()
  }

  /**
   * Disconnect from chat
   */
  disconnect(): void {
    if (this.client) {
      this.client.disconnect()
      this.client = null
    }
  }

  /**
   * Get messages for a specific channel
   */
  getMessages(channelId: string): import('@lanscape/chat').ChatMessage[] {
    if (!this.client) {
      return []
    }
    return this.client.getMessages(channelId)
  }

  /**
   * Subscribe to new messages (convenience method)
   */
  onMessage(handler: (message: import('@lanscape/chat').ChatMessage) => void): () => void {
    if (!this.client) {
      // Return no-op unsubscribe if client not ready
      return () => {}
    }
    return this.client.onMessage(handler)
  }

  /**
   * Create a new channel
   */
  createChannel(name: string) {
    if (!this.client) {
      throw new Error('ChatClient not initialized. Call connect() first.')
    }
    return this.client.createChannel(name)
  }

  /**
   * Send a message to a specific channel
   */
  sendMessage(channelId: string, body: string): boolean {
    if (!this.client) {
      console.warn('[ChatClient] sendMessage called before connection')
      return false
    }
    return this.client.sendMessage(channelId, body)
  }

  /**
   * Clear all local chat history
   */
  async clearHistory(): Promise<void> {
    if (!this.client) {
      console.warn('[ChatClient] clearHistory called before connection')
      return
    }
    return this.client.clearHistory()
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
