package signaling

import "sync"

// Topic represents a signaling room that peers can join
type Topic struct {
	ID    string
	peers sync.Map // map[string]*PeerConn
}

// NewTopic creates a new topic with the given ID
func NewTopic(id string) *Topic {
	return &Topic{ID: id}
}

// AddPeer adds a peer to the topic and returns existing peers.
// Returns both pointers (for broadcasting) and records (for peer-list response).
// Snapshot is taken BEFORE adding the new peer.
func (t *Topic) AddPeer(pc *PeerConn) (ptrs []*PeerConn, records []PeerRecord) {
	// Snapshot existing peers before adding the new one
	t.peers.Range(func(key, value any) bool {
		p := value.(*PeerConn)
		ptrs = append(ptrs, p)
		records = append(records, p.ToRecord())
		return true
	})
	t.peers.Store(pc.ID, pc)
	return ptrs, records
}

// RemovePeer removes a peer from the topic.
// Returns the removed peer and remaining peers (for broadcasting peer-left).
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

// GetPeer returns a peer by ID, or nil if not found.
// Note: The returned pointer may become stale after lock release (best-effort).
func (t *Topic) GetPeer(peerID string) *PeerConn {
	val, ok := t.peers.Load(peerID)
	if !ok {
		return nil
	}
	return val.(*PeerConn)
}

// IsEmpty returns true if the topic has no peers
func (t *Topic) IsEmpty() bool {
	empty := true
	t.peers.Range(func(key, value any) bool {
		empty = false
		return false // stop iteration on first peer
	})
	return empty
}
