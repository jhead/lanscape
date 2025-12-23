# WebRTC Signaling Server

A lightweight WebRTC signaling server for peer discovery and session establishment.

## Features

- **Topic-based rooms** - Peers are scoped to topics (rooms) they join
- **WebRTC signaling only** - Relays offer/answer/ice-candidate messages, not arbitrary data
- **Best-effort delivery** - Non-blocking message routing with explicit backpressure handling
- **Lock-free concurrency** - Uses `sync.Map` for thread-safe peer/topic management

## Running

### Development

```bash
cd signaling
go run ./cmd/signaling
```

### Docker

```bash
docker build -t signaling ./signaling
docker run -p 8081:8081 signaling
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8081` | HTTP server port |
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error |

## API

### Endpoints

- `GET /healthz` - Health check
- `GET /ws/{topic}` - WebSocket signaling endpoint

### WebSocket Protocol

Connect to `/ws/{topic}` to join a signaling topic.

#### Server → Client Messages

```json
// On connect - your peer ID
{"type": "welcome", "selfId": "01JFXYZ..."}

// On connect - list of existing peers
{"type": "peer-list", "peers": [{"id": "01JFABC...", "metadata": {...}}]}

// When a peer joins
{"type": "peer-joined", "peerId": "01JFABC...", "metadata": {...}}

// When a peer leaves
{"type": "peer-left", "peerId": "01JFABC..."}

// Relayed signaling message
{"type": "offer", "from": "01JFABC...", "payload": {...}, "msgId": "..."}
{"type": "answer", "from": "01JFABC...", "payload": {...}, "msgId": "..."}
{"type": "ice-candidate", "from": "01JFABC...", "payload": {...}, "msgId": "..."}

// Error response
{"type": "error", "code": "target_not_found", "message": "peer not found", "msgId": "..."}
```

#### Client → Server Messages

```json
// Send offer to peer
{"type": "offer", "to": "01JFABC...", "payload": {"sdp": "..."}, "msgId": "..."}

// Send answer to peer
{"type": "answer", "to": "01JFABC...", "payload": {"sdp": "..."}, "msgId": "..."}

// Send ICE candidate to peer
{"type": "ice-candidate", "to": "01JFABC...", "payload": {"candidate": "..."}, "msgId": "..."}
```

### Error Codes

| Code | Description |
|------|-------------|
| `invalid_type` | Unknown message type (must be offer/answer/ice-candidate) |
| `missing_target` | `to` field required but not provided |
| `target_not_found` | Target peer not found in topic |
| `dropped` | Message delivery failed (timeout/buffer full) |

## Typical Flow

1. Client A connects to `/ws/my-room`, receives `welcome` and empty `peer-list`
2. Client B connects to `/ws/my-room`, receives `welcome` and `peer-list` containing A
3. Client A receives `peer-joined` for B
4. Client B sends `offer` to A
5. Client A receives `offer` from B, sends `answer` to B
6. Both exchange `ice-candidate` messages
7. WebRTC connection established, signaling server no longer needed

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Server                           │
│  ┌─────────────────────────────────────────────┐   │
│  │              topics (sync.Map)               │   │
│  │  ┌─────────────────────────────────────┐    │   │
│  │  │            Topic                     │    │   │
│  │  │  ┌───────────────────────────────┐  │    │   │
│  │  │  │       peers (sync.Map)        │  │    │   │
│  │  │  │  ┌──────────┐ ┌──────────┐   │  │    │   │
│  │  │  │  │ PeerConn │ │ PeerConn │   │  │    │   │
│  │  │  │  │  Send ◄──┼─┼── relay ──┼──┼──┼────┤   │
│  │  │  │  └──────────┘ └──────────┘   │  │    │   │
│  │  │  └───────────────────────────────┘  │    │   │
│  │  └─────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Design Decisions

- **No authentication** - Intentionally simple; add auth at the load balancer or extend as needed
- **Server-generated peer IDs** - ULIDs, clients cannot choose/spoof their ID
- **Best-effort delivery** - Control events may be dropped if buffers are full
- **Single writer per WebSocket** - Prevents concurrent write issues
- **Topic auto-cleanup** - Empty topics are deleted (race with concurrent join is acceptable)
