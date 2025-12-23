# WebRTC Signaling Server - Standalone Service

## Project Structure

```
lanscape/
├── lanscaped/              # existing - NO CHANGES
├── signaling/              # new standalone service
│   ├── cmd/
│   │   └── signaling/
│   │       └── main.go
│   ├── pkg/
│   │   └── signaling/
│   │       ├── types.go
│   │       ├── topic.go
│   │       └── server.go
│   ├── internal/
│   │   └── handler/
│   │       └── ws.go
│   ├── go.mod
│   ├── Dockerfile
│   └── README.md
```

## Package Design: `pkg/signaling`

### Types (`types.go`)

```go
package signaling

import (
    "context"
    "encoding/json"
    "errors"
    "time"

    "github.com/oklog/ulid/v2"
)

var (
    ErrPeerGone    = errors.New("peer gone")
    ErrSendTimeout = errors.New("send timeout")
)

// PeerConn represents a live connected peer
type PeerConn struct {
    ID       string
    TopicID  string
    Metadata json.RawMessage
    Send     chan OutboundMessage // buffered, never closed
    ctx      context.Context
    cancel   context.CancelFunc
}

func NewPeerConn(topicID string, metadata json.RawMessage) *PeerConn {
    ctx, cancel := context.WithCancel(context.Background())
    return &PeerConn{
        ID:       ulid.Make().String(),
        TopicID:  topicID,
        Metadata: metadata,
        Send:     make(chan OutboundMessage, 16),
        ctx:      ctx,
        cancel:   cancel,
    }
}

func (pc *PeerConn) TrySend(msg OutboundMessage) bool {
    select {
    case <-pc.ctx.Done():
        return false
    case pc.Send <- msg:
        return true
    default:
        return false
    }
}

func (pc *PeerConn) SendWithTimeout(msg OutboundMessage, timeout time.Duration) error {
    timer := time.NewTimer(timeout)
    defer timer.Stop()
    select {
    case <-pc.ctx.Done():
        return ErrPeerGone
    case pc.Send <- msg:
        return nil
    case <-timer.C:
        return ErrSendTimeout
    }
}

func (pc *PeerConn) Cancel()                        { pc.cancel() }
func (pc *PeerConn) Done() <-chan struct{}          { return pc.ctx.Done() }
func (pc *PeerConn) ToRecord() PeerRecord           { return PeerRecord{ID: pc.ID, Metadata: pc.Metadata} }

// PeerRecord is the transferable peer data
type PeerRecord struct {
    ID       string          `json:"id"`
    Metadata json.RawMessage `json:"metadata,omitempty"`
}

// Messages
type InboundMessage struct {
    Type    string          `json:"type"`
    To      string          `json:"to"`
    Payload json.RawMessage `json:"payload"`
    MsgID   string          `json:"msgId,omitempty"`
}

type OutboundMessage struct {
    Type     string          `json:"type"`
    From     string          `json:"from,omitempty"`
    PeerID   string          `json:"peerId,omitempty"`
    SelfID   string          `json:"selfId,omitempty"`
    Peers    []PeerRecord    `json:"peers,omitempty"`
    Metadata json.RawMessage `json:"metadata,omitempty"`
    Payload  json.RawMessage `json:"payload,omitempty"`
    MsgID    string          `json:"msgId,omitempty"`
}

type ErrorMessage struct {
    Type    string `json:"type"`
    Code    string `json:"code"`
    Message string `json:"message"`
    MsgID   string `json:"msgId,omitempty"`
}

func IsRelayType(t string) bool {
    return t == "offer" || t == "answer" || t == "ice-candidate"
}
```

### Topic (`topic.go`)

```go
package signaling

import "sync"

type Topic struct {
    ID    string
    peers sync.Map // map[string]*PeerConn
}

func NewTopic(id string) *Topic {
    return &Topic{ID: id}
}

// AddPeer adds peer, returns existing peers (pointers for broadcast, records for peer-list)
func (t *Topic) AddPeer(pc *PeerConn) (ptrs []*PeerConn, records []PeerRecord) {
    // Snapshot existing before adding
    t.peers.Range(func(key, value any) bool {
        p := value.(*PeerConn)
        ptrs = append(ptrs, p)
        records = append(records, p.ToRecord())
        return true
    })
    t.peers.Store(pc.ID, pc)
    return ptrs, records
}

// RemovePeer removes peer, returns removed peer and remaining peers for broadcast
func (t *Topic) RemovePeer(peerID string) (removed *PeerConn, remaining []*PeerConn) {
    val, loaded := t.peers.LoadAndDelete(peerID)
    if !loaded {
        return nil, nil
    }
    removed = val.(*PeerConn)
    t.peers.Range(func(key, value any) bool {
        remaining = append(remaining, value.(*PeerConn))
        return true
    })
    return removed, remaining
}

// GetPeer returns peer by ID (nil if not found)
func (t *Topic) GetPeer(peerID string) *PeerConn {
    val, ok := t.peers.Load(peerID)
    if !ok {
        return nil
    }
    return val.(*PeerConn)
}

// IsEmpty returns true if no peers
func (t *Topic) IsEmpty() bool {
    empty := true
    t.peers.Range(func(key, value any) bool {
        empty = false
        return false // stop iteration
    })
    return empty
}
```

### Server (`server.go`)

```go
package signaling

import (
    "log/slog"
    "sync"
    "time"
)

type Server struct {
    topics sync.Map // map[string]*Topic
    logger *slog.Logger
}

func NewServer(logger *slog.Logger) *Server {
    if logger == nil {
        logger = slog.Default()
    }
    return &Server{logger: logger}
}

func (s *Server) Join(topicID string, metadata json.RawMessage) (*PeerConn, []PeerRecord) {
    pc := NewPeerConn(topicID, metadata)
    
    // Get or create topic
    val, _ := s.topics.LoadOrStore(topicID, NewTopic(topicID))
    topic := val.(*Topic)
    
    // Add peer, get existing
    existingPtrs, existingRecords := topic.AddPeer(pc)
    
    // Broadcast peer-joined (best-effort)
    msg := OutboundMessage{Type: "peer-joined", PeerID: pc.ID, Metadata: metadata}
    for _, peer := range existingPtrs {
        peer.TrySend(msg)
    }
    
    s.logger.Info("peer joined", "peer", pc.ID, "topic", topicID)
    return pc, existingRecords
}

func (s *Server) Leave(peerID, topicID string) {
    val, ok := s.topics.Load(topicID)
    if !ok {
        return
    }
    topic := val.(*Topic)
    
    removed, remaining := topic.RemovePeer(peerID)
    if removed == nil {
        return
    }
    removed.Cancel()
    
    // Cleanup empty topic (race is acceptable)
    if topic.IsEmpty() {
        s.topics.Delete(topicID)
    }
    
    // Broadcast peer-left (best-effort)
    msg := OutboundMessage{Type: "peer-left", PeerID: peerID}
    for _, peer := range remaining {
        peer.TrySend(msg)
    }
    
    s.logger.Info("peer left", "peer", peerID, "topic", topicID)
}

type RelayResult int
const (
    RelayDelivered RelayResult = iota
    RelayDropped
    RelayTargetNotFound
    RelayTopicNotFound
    RelayInvalidType
)

func (s *Server) Relay(topicID, fromPeerID, toPeerID, msgType string, payload json.RawMessage, msgID string) RelayResult {
    if !IsRelayType(msgType) {
        return RelayInvalidType
    }
    
    val, ok := s.topics.Load(topicID)
    if !ok {
        return RelayTopicNotFound
    }
    topic := val.(*Topic)
    
    target := topic.GetPeer(toPeerID)
    if target == nil {
        return RelayTargetNotFound
    }
    
    msg := OutboundMessage{Type: msgType, From: fromPeerID, Payload: payload, MsgID: msgID}
    if err := target.SendWithTimeout(msg, 100*time.Millisecond); err != nil {
        return RelayDropped
    }
    return RelayDelivered
}
```

## WebSocket Handler: `internal/handler/ws.go`

```go
package handler

import (
    "context"
    "log/slog"
    "net/http"
    "time"

    "github.com/jhead/lanscape/signaling/pkg/signaling"
    "nhooyr.io/websocket"
    "nhooyr.io/websocket/wsjson"
)

const (
    maxMessageSize = 64 * 1024
    writeTimeout   = 5 * time.Second
    pingInterval   = 30 * time.Second
)

func HandleSignaling(server *signaling.Server, logger *slog.Logger) http.HandlerFunc {
    return func(w http.ResponseWriter, r *http.Request) {
        topicID := r.PathValue("topic")
        if topicID == "" {
            http.Error(w, "topic required", http.StatusBadRequest)
            return
        }
        
        conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
            OriginPatterns: []string{"*"}, // configure as needed
        })
        if err != nil {
            logger.Error("websocket accept failed", "err", err)
            return
        }
        conn.SetReadLimit(maxMessageSize)
        
        ctx := r.Context()
        pc, existingPeers := server.Join(topicID, nil)
        defer server.Leave(pc.ID, topicID)
        
        // Send welcome + peer-list
        wsjson.Write(ctx, conn, signaling.OutboundMessage{Type: "welcome", SelfID: pc.ID})
        wsjson.Write(ctx, conn, signaling.OutboundMessage{Type: "peer-list", Peers: existingPeers})
        
        // Writer goroutine
        go writerLoop(ctx, conn, pc, logger)
        
        // Reader loop (blocks until disconnect)
        readerLoop(ctx, conn, pc, server, topicID, logger)
    }
}

func writerLoop(ctx context.Context, conn *websocket.Conn, pc *signaling.PeerConn, logger *slog.Logger) {
    ticker := time.NewTicker(pingInterval)
    defer ticker.Stop()
    
    for {
        select {
        case <-ctx.Done():
            return
        case <-pc.Done():
            return
        case msg := <-pc.Send:
            writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
            err := wsjson.Write(writeCtx, conn, msg)
            cancel()
            if err != nil {
                logger.Debug("write failed", "peer", pc.ID, "err", err)
                pc.Cancel()
                return
            }
        case <-ticker.C:
            if err := conn.Ping(ctx); err != nil {
                logger.Debug("ping failed", "peer", pc.ID, "err", err)
                pc.Cancel()
                return
            }
        }
    }
}

func readerLoop(ctx context.Context, conn *websocket.Conn, pc *signaling.PeerConn, server *signaling.Server, topicID string, logger *slog.Logger) {
    for {
        var msg signaling.InboundMessage
        if err := wsjson.Read(ctx, conn, &msg); err != nil {
            return
        }
        
        if !signaling.IsRelayType(msg.Type) {
            sendError(ctx, conn, "invalid_type", "unknown message type", msg.MsgID)
            continue
        }
        
        if msg.To == "" {
            sendError(ctx, conn, "missing_target", "to required", msg.MsgID)
            continue
        }
        
        result := server.Relay(topicID, pc.ID, msg.To, msg.Type, msg.Payload, msg.MsgID)
        switch result {
        case signaling.RelayDelivered:
            // success
        case signaling.RelayTargetNotFound:
            sendError(ctx, conn, "target_not_found", "peer not found", msg.MsgID)
        case signaling.RelayDropped:
            sendError(ctx, conn, "dropped", "delivery failed", msg.MsgID)
        default:
            return // topic gone, disconnect
        }
    }
}

func sendError(ctx context.Context, conn *websocket.Conn, code, message, msgID string) {
    wsjson.Write(ctx, conn, signaling.ErrorMessage{Type: "error", Code: code, Message: message, MsgID: msgID})
}
```

## Entrypoint: `cmd/signaling/main.go`

```go
package main

import (
    "context"
    "log/slog"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"

    "github.com/jhead/lanscape/signaling/internal/handler"
    "github.com/jhead/lanscape/signaling/pkg/signaling"
)

func main() {
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
    
    port := os.Getenv("PORT")
    if port == "" {
        port = "8081"
    }
    
    server := signaling.NewServer(logger)
    
    mux := http.NewServeMux()
    mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
    })
    mux.HandleFunc("GET /ws/{topic}", handler.HandleSignaling(server, logger))
    
    httpServer := &http.Server{
        Addr:    ":" + port,
        Handler: mux,
    }
    
    // Graceful shutdown
    go func() {
        sigChan := make(chan os.Signal, 1)
        signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
        <-sigChan
        
        logger.Info("shutting down")
        ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
        defer cancel()
        httpServer.Shutdown(ctx)
    }()
    
    logger.Info("starting signaling server", "port", port)
    if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
        logger.Error("server error", "err", err)
        os.Exit(1)
    }
}
```

## Dockerfile

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o signaling ./cmd/signaling

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/signaling /signaling
EXPOSE 8081
CMD ["/signaling"]
```

## go.mod

```
module github.com/jhead/lanscape/signaling

go 1.23

require (
    github.com/oklog/ulid/v2 v2.1.0
    nhooyr.io/websocket v1.8.11
)
```

## Files to Create

- `signaling/go.mod` - Module definition
- `signaling/pkg/signaling/types.go` - PeerConn, PeerRecord, Messages
- `signaling/pkg/signaling/topic.go` - Topic with sync.Map
- `signaling/pkg/signaling/server.go` - Server with sync.Map
- `signaling/internal/handler/ws.go` - WebSocket handler
- `signaling/cmd/signaling/main.go` - Entrypoint
- `signaling/Dockerfile` - Container build
- `signaling/README.md` - Usage docs

## No Changes To

- `lanscaped/` - Completely separate service

## Message Protocol

```json
// Server -> Client (on connect)
{"type": "welcome", "selfId": "01J5..."}
{"type": "peer-list", "peers": [{"id": "01J5...", "metadata": {...}}]}

// Server -> Client (events)
{"type": "peer-joined", "peerId": "01J5...", "metadata": {...}}
{"type": "peer-left", "peerId": "01J5..."}

// Client -> Server (relay)
{"type": "offer", "to": "01J5...", "payload": {...}, "msgId": "abc"}
{"type": "answer", "to": "01J5...", "payload": {...}, "msgId": "def"}
{"type": "ice-candidate", "to": "01J5...", "payload": {...}, "msgId": "ghi"}

// Server -> Client (relayed)
{"type": "offer", "from": "01J5...", "payload": {...}, "msgId": "abc"}

// Server -> Client (errors)
{"type": "error", "code": "target_not_found", "message": "peer not found", "msgId": "abc"}
```

## Running

```bash
# Development
cd signaling && go run ./cmd/signaling

# Docker
docker build -t signaling ./signaling
docker run -p 8081:8081 signaling

# Connect
wscat -c ws://localhost:8081/ws/my-topic
```