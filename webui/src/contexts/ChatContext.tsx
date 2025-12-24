import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { getChatClient, ChatChannel, ChatMessage, ChatMember, ChatClientState } from '../services/chat'

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
  
  // Track client state in React
  const [state, setState] = useState<ChatClientState>(client.getState())

  // Subscribe to client state changes
  useEffect(() => {
    console.log('[ChatContext] Subscribing to client')
    const unsubscribe = client.subscribe((newState) => {
      setState(newState)
    })

    // Connect on mount (safe to call multiple times)
    client.connect()

    return () => {
      console.log('[ChatContext] Unsubscribing from client')
      unsubscribe()
      // Note: We don't disconnect here because other components might still be using the client
      // The client persists across React re-renders
    }
  }, [client])

  const setCurrentChannel = useCallback((channelId: string | null) => {
    client.setCurrentChannel(channelId)
  }, [client])

  const createChannel = useCallback((name: string): ChatChannel => {
    return client.createChannel(name)
  }, [client])

  const sendMessage = useCallback((body: string): boolean => {
    return client.sendMessage(body)
  }, [client])

  const clearHistory = useCallback(async (): Promise<void> => {
    await client.clearHistory()
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
        currentChannelId: state.currentChannelId,
        setCurrentChannel,
        createChannel,
        messages: state.messages,
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
