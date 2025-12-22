import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { ChatService, ChatMessage, ChatMember, ChatChannel } from '../services/chatService'

interface ChatContextType {
  // Connection
  connected: boolean
  connecting: boolean
  error: string | null
  connect: (serverUrl: string, username: string, networkId: number) => Promise<void>
  disconnect: () => Promise<void>
  
  // Data
  messages: Map<string, ChatMessage[]>
  members: ChatMember[]
  channels: ChatChannel[]
  currentConversationId: string | null
  
  // Actions
  setCurrentConversation: (conversationId: string | null) => void
  sendMessage: (conversationId: string, body: string) => Promise<void>
  createChannel: (name: string, jid: string) => Promise<ChatChannel>
  
  // Current user
  currentJid: string
}

const ChatContext = createContext<ChatContextType | undefined>(undefined)

export function ChatProvider({ children }: { children: ReactNode }) {
  const [service] = useState(() => new ChatService())
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<Map<string, ChatMessage[]>>(new Map())
  const [members, setMembers] = useState<ChatMember[]>([])
  const [channels, setChannels] = useState<ChatChannel[]>([])
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [currentJid, setCurrentJid] = useState('')

  useEffect(() => {
    const handleEvent = (event: string, data?: any) => {
      console.log('[ChatContext] Event:', event, data)
      
      switch (event) {
        case 'connected':
          setConnected(true)
          setConnecting(false)
          setError(null)
          setCurrentJid(data?.jid || '')
          break
          
        case 'disconnected':
          setConnected(false)
          setConnecting(false)
          setMessages(new Map())
          setMembers([])
          setChannels([])
          setCurrentConversationId(null)
          setCurrentJid('')
          break
          
        case 'error':
          setError(data?.message || 'An error occurred')
          setConnecting(false)
          setConnected(false)
          break
          
        case 'message':
          if (data?.message) {
            const msg = data.message as ChatMessage
            setMessages(prev => {
              const newMap = new Map(prev)
              const conversationMessages = newMap.get(msg.conversationId) || []
              newMap.set(msg.conversationId, [...conversationMessages, msg])
              return newMap
            })
          }
          break
          
        case 'memberUpdate':
          setMembers(prev => {
            const updated = [...prev]
            const index = updated.findIndex(m => m.jid === data.jid)
            if (index >= 0) {
              updated[index] = data.member
            } else {
              updated.push(data.member)
            }
            return updated.sort((a, b) => a.displayName.localeCompare(b.displayName))
          })
          break
          
        case 'channelAdded':
          if (data?.channel) {
            setChannels(prev => {
              const exists = prev.find(c => c.id === data.channel.id)
              if (exists) return prev
              return [...prev, data.channel].sort((a, b) => a.name.localeCompare(b.name))
            })
          }
          break
      }
    }

    service.on(handleEvent)

    // Sync state periodically
    const interval = setInterval(() => {
      if (service.isConnected()) {
        setMembers(service.getMembers())
        setChannels(service.getChannels())
        setCurrentJid(service.getCurrentJid())
      }
    }, 1000)

    return () => {
      service.off(handleEvent)
      clearInterval(interval)
    }
  }, [service])

  const connect = useCallback(async (serverUrl: string, username: string, networkId: number) => {
    try {
      setConnecting(true)
      setError(null)
      await service.connect(serverUrl, username, networkId)
    } catch (err: any) {
      setError(err.message || 'Failed to connect')
      setConnecting(false)
      setConnected(false)
    }
  }, [service])

  const disconnect = useCallback(async () => {
    await service.disconnect()
  }, [service])

  const sendMessage = useCallback(async (conversationId: string, body: string) => {
    await service.sendMessage(conversationId, body)
  }, [service])

  const createChannel = useCallback(async (name: string, jid: string) => {
    return await service.createChannel(name, jid)
  }, [service])

  const setCurrentConversation = useCallback((conversationId: string | null) => {
    setCurrentConversationId(conversationId)
    // Mark channel as read
    if (conversationId) {
      setChannels(prev => prev.map(c => 
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ))
    }
  }, [])

  return (
    <ChatContext.Provider
      value={{
        connected,
        connecting,
        error,
        connect,
        disconnect,
        messages,
        members,
        channels,
        currentConversationId,
        setCurrentConversation,
        sendMessage,
        createChannel,
        currentJid,
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
