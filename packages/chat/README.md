# @lanscape/chat

A clean, simple SDK for integrating Lanscape chat functionality into any application - from React UIs to chatbots.

## Features

- 🚀 **Simple API** - Get started in seconds
- 💬 **Real-time Chat** - Powered by Y.js CRDTs and WebRTC
- 🤖 **Bot-friendly** - Event-driven API perfect for chatbots
- 🔌 **Framework-agnostic** - Works with React, Vue, vanilla JS, Node.js
- 💾 **Pluggable Persistence** - In-memory by default, plug in IndexedDB, filesystem, or custom storage
- 👥 **Presence** - Built-in user awareness and online status

## Installation

```bash
npm install @lanscape/chat
```

## Quick Start

### Basic Usage

```typescript
import { createChatClient } from '@lanscape/chat'

// Create a client
const client = createChatClient({
  userId: 'user123',
  displayName: 'Alice',
  agentUrl: 'ws://localhost:8082'
})

// Connect
await client.connect()

// Send a message
client.sendMessage('Hello, world!')

// Get current state
const state = client.getState()
console.log(state.messages)
```

### React Integration

```typescript
import { useEffect, useState } from 'react'
import { createChatClient, ChatClientState } from '@lanscape/chat'

function ChatComponent() {
  const [state, setState] = useState<ChatClientState | null>(null)

  useEffect(() => {
    const client = createChatClient({
      userId: 'user123',
      displayName: 'Alice',
      agentUrl: 'ws://localhost:8082'
    })

    // Subscribe to state changes
    const unsubscribe = client.subscribe(setState)

    // Connect
    client.connect()

    return () => {
      unsubscribe()
      client.disconnect()
    }
  }, [])

  if (!state) return <div>Connecting...</div>

  return (
    <div>
      {state.messages.map(msg => (
        <div key={msg.id}>
          <strong>{msg.authorName}:</strong> {msg.body}
        </div>
      ))}
    </div>
  )
}
```

### Chatbot Integration

```typescript
import { createChatClient } from '@lanscape/chat'

const client = createChatClient({
  userId: 'bot-001',
  displayName: 'HelpBot',
  agentUrl: 'ws://localhost:8082'
})

// Listen for new messages
client.onMessage((message) => {
  // Respond to messages (avoid responding to own messages)
  if (message.authorId !== client.getState().displayName) {
    const response = generateBotResponse(message.body)
    client.sendMessage(response)
  }
})

await client.connect()
```

### Browser with IndexedDB Persistence

For browser apps, enable IndexedDB persistence:

```typescript
import { ChatClient, IndexedDBPersistence } from '@lanscape/chat'
// Note: You need to install y-indexeddb: npm install y-indexeddb

const persistence = new IndexedDBPersistence('my-chat-app')

const client = new ChatClient({
  userId: 'user123',
  displayName: 'Alice',
  agentUrl: 'ws://localhost:8082',
  persistence: persistence
})

await client.connect()
```

### Node.js/Bun Usage (In-Memory)

By default, the SDK uses in-memory persistence (no persistence). Perfect for Node.js/Bun:

```typescript
import { createChatClient } from '@lanscape/chat'

// No persistence needed - works out of the box in Node.js/Bun
const client = createChatClient({
  userId: 'bot-001',
  displayName: 'MyBot',
  agentUrl: 'ws://localhost:8082'
})

await client.connect()
```

### Custom Persistence

Implement your own persistence provider:

```typescript
import { ChatClient, PersistenceProvider } from '@lanscape/chat'
import * as Y from 'yjs'

class FileSystemPersistence implements PersistenceProvider {
  async init(doc: Y.Doc): Promise<void> {
    // Load from filesystem
  }
  
  async waitUntilReady(): Promise<void> {
    // Wait for load
  }
  
  async clear(): Promise<void> {
    // Clear storage
  }
  
  destroy(): void {
    // Cleanup
  }
  
  isReady(): boolean {
    return true
  }
}

const client = new ChatClient({
  userId: 'user123',
  displayName: 'Alice',
  agentUrl: 'ws://localhost:8082',
  persistence: new FileSystemPersistence()
})
```

### Advanced Configuration

For apps with authentication systems:

```typescript
import { ChatClient, IndexedDBPersistence } from '@lanscape/chat'

const persistence = new IndexedDBPersistence('my-app-chat')

const client = new ChatClient({
  getUserInfo: async () => {
    // Fetch user from your auth system
    const response = await fetch('/api/me')
    return await response.json()
  },
  agentUrl: 'ws://localhost:8082',
  persistence: persistence
})

await client.connect()
```

## API Reference

### `createChatClient(config: ChatClientConfig)`

Factory function to create a new chat client with simple configuration.

**Config:**
- `userId` (string): Unique user identifier
- `displayName` (string): User's display name
- `agentUrl` (string): WebSocket URL for the agent
- `persistence?` (PersistenceProvider): Optional persistence provider (default: MemoryPersistence)

### `ChatClient`

#### Methods

- `connect(): Promise<void>` - Connect to chat
- `disconnect(): void` - Disconnect from chat
- `sendMessage(body: string): boolean` - Send a message to current channel
- `createChannel(name: string): ChatChannel` - Create a new channel
- `setCurrentChannel(channelId: string | null): void` - Switch channels
- `getState(): ChatClientState` - Get current state
- `subscribe(listener: (state: ChatClientState) => void): () => void` - Subscribe to state changes
- `onMessage(handler: (message: ChatMessage) => void): () => void` - Listen for new messages
- `onMembersChange(handler: (members: ChatMember[]) => void): () => void` - Listen for member changes
- `onChannelsChange(handler: (channels: ChatChannel[]) => void): () => void` - Listen for channel changes
- `clearHistory(): Promise<void>` - Clear local chat history

#### Persistence Providers

- `MemoryPersistence` - In-memory (default, no persistence)
- `IndexedDBPersistence` - Browser IndexedDB (requires `y-indexeddb` package)
- `PersistenceProvider` - Interface for custom implementations

#### State

```typescript
interface ChatClientState {
  connected: boolean
  connecting: boolean
  error: string | null
  selfId: string | null
  displayName: string
  members: ChatMember[]
  channels: ChatChannel[]
  messages: ChatMessage[]
  currentChannelId: string | null
  isOnline: boolean
  persistenceReady: boolean
}
```

## Examples

### Simple Chat UI

```typescript
const client = createChatClient({
  userId: 'alice',
  displayName: 'Alice',
  agentUrl: 'ws://localhost:8082'
})

// Subscribe and render
client.subscribe((state) => {
  renderMessages(state.messages)
  renderMembers(state.members)
  renderChannels(state.channels)
})

await client.connect()

// Handle user input
document.getElementById('send-btn').onclick = () => {
  const input = document.getElementById('message-input')
  client.sendMessage(input.value)
  input.value = ''
}
```

### Node.js Bot

```typescript
import { createChatClient } from '@lanscape/chat'

const bot = createChatClient({
  userId: 'my-bot',
  displayName: 'MyBot',
  agentUrl: 'ws://localhost:8082'
})

bot.onMessage(async (message) => {
  if (message.authorId === bot.getState().displayName) return
  
  // Process message with AI/LLM
  const response = await processWithAI(message.body)
  bot.sendMessage(response)
})

await bot.connect()
```

## License

MIT

