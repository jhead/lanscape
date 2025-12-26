# Chat System

Peer-to-peer chat using Y.js CRDTs for state synchronization, with IndexedDB persistence for offline access. Transport layer is currently stubbed pending implementation.

## Architecture

```mermaid
graph TB
    subgraph "Browser A"
        UI_A[React Components]
        CTX_A[ChatContext]
        CLIENT_A[ChatClient]
        SYNC_A[YjsSync]
        YDOC_A[Y.Doc]
        IDB_A[IndexedDB Persistence]
        TRANSPORT_A[StubTransport]
    end

    subgraph "Browser B"
        UI_B[React Components]
        CTX_B[ChatContext]
        CLIENT_B[ChatClient]
        SYNC_B[YjsSync]
        YDOC_B[Y.Doc]
        IDB_B[IndexedDB Persistence]
        TRANSPORT_B[StubTransport]
    end

    UI_A --> CTX_A --> CLIENT_A --> SYNC_A --> YDOC_A
    YDOC_A <--> IDB_A
    SYNC_A --> TRANSPORT_A
    
    UI_B --> CTX_B --> CLIENT_B --> SYNC_B --> YDOC_B
    YDOC_B <--> IDB_B
    SYNC_B --> TRANSPORT_B
```

## Components

| Component | Location | Purpose |
|-----------|----------|---------|
| ChatClient | `services/chat/ChatClient.ts` | Singleton managing connection lifecycle, Y.js doc, persistence, and state |
| YjsSync | `services/sync/YjsSync.ts` | Syncs Y.Doc across peers via transport; handles awareness |
| IndexeddbPersistence | `y-indexeddb` (external) | Persists Y.Doc to browser IndexedDB for offline access |
| StubTransport | `services/transport/StubTransport.ts` | Stub implementation of PeerTransport (pending actual implementation) |
| ChatContext | `contexts/ChatContext.tsx` | React context that subscribes to ChatClient state |
| SettingsModal | `components/chat/SettingsModal.tsx` | Settings UI with Dev Tools tab for clearing history |

## Data Model (Y.js CRDTs)

- **channels** (`Y.Map<ChatChannel>`) — Channel metadata keyed by channel ID
- **messages** (`Y.Map<Y.Array<ChatMessage>>`) — Messages per channel, keyed by channel ID

Each message contains: `id`, `channelId`, `authorId`, `authorName`, `body`, `timestamp`

## Persistence

Chat history is persisted locally using [y-indexeddb](https://github.com/yjs/y-indexeddb):

- **Per-user namespacing**: Each user's data is stored separately using `lanscape-chat-{userId}` as the IndexedDB database name
- **Automatic sync**: Changes to Y.Doc are automatically persisted to IndexedDB
- **Offline viewing**: Users can view their message history even when disconnected
- **Clear history**: Users can clear their local chat data via Settings → Dev Tools → Clear Chat History

### Storage Flow

1. On connect: Create Y.Doc → Attach IndexedDB persistence → Wait for `synced` event → Load existing data
2. During session: All Y.Doc changes are automatically persisted to IndexedDB
3. On reconnect: Local data loads first, then syncs with peers
4. Conflict resolution: Y.js CRDT automatically merges concurrent changes

## Sync Protocol

Messages sent over transport layer (currently stubbed):

| Type | ID | Description |
|------|-----|-------------|
| SYNC_REQUEST | 0 | Request full Y.Doc state from peer |
| SYNC_RESPONSE | 1 | Full Y.Doc state as response |
| UPDATE | 2 | Incremental Y.Doc update |
| AWARENESS | 3 | User presence (JSON: peerId, name, id) |

## Awareness (Presence)

User presence is tracked via a lightweight awareness protocol:

1. On peer connect: broadcast awareness with JWT username
2. Periodic heartbeat every 15 seconds
3. On peer disconnect: remove from member list
4. Deduplicated by JWT user ID (not peer ID)

## Online/Offline Status

The chat system tracks connectivity status:

- **isOnline**: Currently always false (transport is stubbed)
- **Offline indicator**: Shown in sidebar footer and message input when disconnected
- **Send restriction**: Messages cannot be sent while offline (prevents local-only messages that may never sync)

## Connection Flow

1. User authenticates via WebAuthn → JWT cookie set
2. ChatClient auto-connects on Dashboard mount
3. Fetches username and user ID from `/v1/me` endpoint
4. Creates Y.Doc and attaches IndexedDB persistence (loads local history)
5. Creates stub transport (actual implementation pending)
6. Default "general" channel created if none exist

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_CHAT_TOPIC` | `lanscape-chat` | Topic/room name (currently unused, reserved for future use) |

## Settings Modal

Accessed via the gear icon in the sidebar header:

### General Tab
- Appearance settings (coming soon)

### Dev Tools Tab
- **Clear Chat History**: Deletes all locally stored messages and channels from IndexedDB
- Storage status indicator

## Design Decisions

- **Singleton ChatClient**: Prevents React Strict Mode double-renders from creating duplicate connections
- **Transport abstraction**: `PeerTransport` interface allows swapping transport implementations
- **Y.js for state**: CRDTs enable conflict-free merging without central coordination
- **Awareness vs CRDT**: Presence uses ephemeral awareness protocol, not persisted in Y.Doc
- **Per-user persistence**: Each user has their own IndexedDB database, ensuring data isolation after logout/login
- **Persistence before sync**: Local data loads before peer sync to prevent overwriting with empty remote state
- **Offline send restriction**: Prevents creating messages that only exist locally
