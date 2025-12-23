package signaling

import (
	"encoding/json"
	"log/slog"
	"sync"
	"time"
)

// RelayResult indicates the outcome of a relay attempt
type RelayResult int

const (
	RelayDelivered RelayResult = iota
	RelayDropped
	RelayTargetNotFound
	RelayTopicNotFound
	RelayInvalidType
)

// Server manages topics and peer routing for WebRTC signaling
type Server struct {
	topics sync.Map // map[string]*Topic
	logger *slog.Logger
}

// NewServer creates a new signaling server
func NewServer(logger *slog.Logger) *Server {
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{logger: logger}
}

// Join adds a peer to a topic, creating the topic if it doesn't exist.
// Returns the new peer connection and records of existing peers.
// Broadcasts peer-joined to existing peers (best-effort).
func (s *Server) Join(topicID string, metadata json.RawMessage) (*PeerConn, []PeerRecord) {
	pc := NewPeerConn(topicID, metadata)

	// Get or create topic
	val, _ := s.topics.LoadOrStore(topicID, NewTopic(topicID))
	topic := val.(*Topic)

	// Add peer, get existing peers (both pointers and records)
	existingPtrs, existingRecords := topic.AddPeer(pc)

	// Broadcast peer-joined to existing peers (best-effort, no re-fetch needed)
	msg := OutboundMessage{
		Type:     "peer-joined",
		PeerID:   pc.ID,
		Metadata: metadata,
	}
	for _, peer := range existingPtrs {
		if !peer.TrySend(msg) {
			s.logger.Debug("dropped peer-joined notification", "to", peer.ID, "from", pc.ID)
		}
	}

	s.logger.Info("peer joined topic",
		"peer", pc.ID,
		"topic", topicID,
		"existingPeers", len(existingRecords),
	)
	return pc, existingRecords
}

// Leave removes a peer from a topic and cleans up empty topics.
// Broadcasts peer-left to remaining peers (best-effort).
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

	// Cleanup empty topic (race with concurrent Join is acceptable)
	if topic.IsEmpty() {
		s.topics.Delete(topicID)
		s.logger.Debug("deleted empty topic", "topic", topicID)
	}

	// Broadcast peer-left to remaining peers (best-effort)
	msg := OutboundMessage{
		Type:   "peer-left",
		PeerID: peerID,
	}
	for _, peer := range remaining {
		if !peer.TrySend(msg) {
			s.logger.Debug("dropped peer-left notification", "to", peer.ID, "from", peerID)
		}
	}

	s.logger.Info("peer left topic", "peer", peerID, "topic", topicID)
}

// Relay routes an offer/answer/ice-candidate message to a target peer.
// The `from` field is set by the server (never trust client-supplied from).
// Returns a RelayResult indicating the outcome.
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

	msg := OutboundMessage{
		Type:    msgType,
		From:    fromPeerID, // Server-controlled, not client-supplied
		Payload: payload,
		MsgID:   msgID,
	}

	// Send with timeout, not holding any lock
	if err := target.SendWithTimeout(msg, 100*time.Millisecond); err != nil {
		s.logger.Debug("relay dropped",
			"from", fromPeerID,
			"to", toPeerID,
			"type", msgType,
			"error", err,
		)
		return RelayDropped
	}

	s.logger.Debug("relay delivered",
		"from", fromPeerID,
		"to", toPeerID,
		"type", msgType,
	)
	return RelayDelivered
}
