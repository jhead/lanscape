package signaling

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
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

// NewPeerConn creates a new peer connection with a server-generated ULID
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

// TrySend attempts to send a message without blocking.
// Returns false if buffer is full or peer is cancelled (best-effort delivery).
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

// SendWithTimeout sends a message with a deadline.
// Returns error if peer is gone or timeout expires.
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

// Cancel signals the peer to disconnect
func (pc *PeerConn) Cancel() { pc.cancel() }

// Done returns a channel that closes when the peer is cancelled
func (pc *PeerConn) Done() <-chan struct{} { return pc.ctx.Done() }

// ToRecord converts the live peer to a transferable record
func (pc *PeerConn) ToRecord() PeerRecord {
	return PeerRecord{ID: pc.ID, Metadata: pc.Metadata}
}

// PeerRecord is the transferable peer data (DTO)
type PeerRecord struct {
	ID       string          `json:"id"`
	Metadata json.RawMessage `json:"metadata,omitempty"`
}

// InboundMessage represents a message from client to server
type InboundMessage struct {
	Type    string          `json:"type"`
	To      string          `json:"to"`
	Payload json.RawMessage `json:"payload"`
	MsgID   string          `json:"msgId,omitempty"`
}

// OutboundMessage represents a message from server to client
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

// ErrorMessage represents an error response to the client
type ErrorMessage struct {
	Type    string `json:"type"`
	Code    string `json:"code"`
	Message string `json:"message"`
	MsgID   string `json:"msgId,omitempty"`
}

// IsRelayType returns true if the message type is a valid relay type
func IsRelayType(t string) bool {
	return t == "offer" || t == "answer" || t == "ice-candidate"
}

// Logger returns a child logger with peer context
func (pc *PeerConn) Logger(base *slog.Logger) *slog.Logger {
	return base.With("peer", pc.ID, "topic", pc.TopicID)
}
