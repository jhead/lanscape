import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { getChatClient, ChatChannel, ChatMessage, ChatMember, ChatClientState } from '../services/chat'
import { useNetwork } from './NetworkContext'

// Re-export types for convenience
export type { ChatChannel, ChatMessage, ChatMember }

interface ChatContextType {
  // Connection state
  connected: boolean
  connecting: boolean
  error: string | null
  selfId: string | null
  isOnline: boolean  // WebRTC peer connectivity status
  persistenceReady: boolean  // IndexedDB loaded

  // Members (from awareness)
  members: ChatMember[]

  // Channels (from Y.js CRDT)
  channels: ChatChannel[]
  currentChannelId: string | null
  setCurrentChannel: (channelId: string | null) => void
  createChannel: (name: string) => ChatChannel

  // Messages (from Y.js CRDT)
  messages: ChatMessage[]
  sendMessage: (body: string) => boolean

  // User info
  displayName: string

  // Dev tools
  clearHistory: () => Promise<void>
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  // Get the singleton client
  const client = getChatClient()
  const { currentNetwork, loading: networkLoading } = useNetwork()
  
  // Track client state in React
  const [state, setState] = useState<ChatClientState>(client.getState())
  
  // Manage current channel and messages locally
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Subscribe to client state changes
  useEffect(() => {
    console.log('[ChatContext] Subscribing to client')
    const unsubscribe = client.subscribe((newState) => {
      setState(newState)
    })

    return () => {
      console.log('[ChatContext] Unsubscribing from client')
      unsubscribe()
    }
  }, [client])

  // Subscribe to new messages
  useEffect(() => {
    if (!state.connected) {
      return
    }

    const unsubscribeMessages = client.onMessage((message) => {
      // Update messages if it's for the current channel
      if (message.channelId === currentChannelId) {
        const channelMessages = client.getMessages(currentChannelId)
        setMessages(channelMessages)
      }
    })

    return () => {
      unsubscribeMessages()
    }
  }, [client, currentChannelId, state.connected])

  // Update messages when current channel changes
  useEffect(() => {
    if (currentChannelId && state.connected) {
      const channelMessages = client.getMessages(currentChannelId)
      setMessages(channelMessages)
    } else {
      setMessages([])
    }
  }, [currentChannelId, state.connected, client])

  // Connect when a network is available
  useEffect(() => {
    if (!networkLoading && currentNetwork) {
      console.log('[ChatContext] Network available, connecting to chat')
      client.connect().then(() => {
        // Set default channel after connection
        if (!currentChannelId && state.channels.length > 0) {
          const generalChannel = state.channels.find(c => c.id === 'general') || state.channels[0]
          setCurrentChannelId(generalChannel.id)
        }
      })
    } else if (!networkLoading && !currentNetwork) {
      console.log('[ChatContext] No network available, not connecting')
    }
  }, [client, currentNetwork, networkLoading, currentChannelId, state.channels])

  // Set default channel when channels become available
  useEffect(() => {
    if (state.connected && !currentChannelId && state.channels.length > 0) {
      const generalChannel = state.channels.find(c => c.id === 'general') || state.channels[0]
      setCurrentChannelId(generalChannel.id)
    }
  }, [state.connected, state.channels, currentChannelId])

  const setCurrentChannel = useCallback((channelId: string | null) => {
    setCurrentChannelId(channelId)
  }, [])

  const createChannel = useCallback((name: string): ChatChannel => {
    return client.createChannel(name)
  }, [client])

  const sendMessage = useCallback((body: string): boolean => {
    if (!currentChannelId) {
      return false
    }
    return client.sendMessage(currentChannelId, body)
  }, [client, currentChannelId])

  const clearHistory = useCallback(async (): Promise<void> => {
    await client.clearHistory()
    setMessages([])
  }, [client])

  return (
    <ChatContext.Provider
      value={{
        connected: state.connected,
        connecting: state.connecting,
        error: state.error,
        selfId: state.selfId,
        isOnline: state.isOnline,
        persistenceReady: state.persistenceReady,
        members: state.members,
        channels: state.channels,
        currentChannelId: currentChannelId,
        setCurrentChannel,
        createChannel,
        messages: messages,
        sendMessage,
        displayName: state.displayName,
        clearHistory,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const context = useContext(ChatContext)
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider')
  }
  return context
}
