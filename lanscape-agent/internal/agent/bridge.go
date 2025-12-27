package agent

import (
	"log/slog"
	"sync"

	"github.com/jhead/lanscape/lanscape-agent/pkg/protocol"
	"github.com/pion/webrtc/v4"
)

// Bridge bridges WebRTC data channels to WebSocket messages
type Bridge struct {
	mu              sync.RWMutex
	dataChannels    map[string]interface{} // *webrtc.DataChannel (not exported)
	browserSend     func(msg protocol.AgentMessage) error
	logger          *slog.Logger
	webrtc          *WebRTCManager
	signaling       *SignalingClient
}

// NewBridge creates a new bridge
func NewBridge(webrtc *WebRTCManager, logger *slog.Logger) *Bridge {
	b := &Bridge{
		dataChannels: make(map[string]interface{}),
		logger:       logger,
		webrtc:       webrtc,
	}

	// Set up WebRTC callbacks
	webrtc.SetOnDataChannel(func(peerID string, dc interface{}) {
		if dc != nil {
			b.handleDataChannel(peerID, dc)
		}
	})

	webrtc.SetOnPeerConnected(func(peerID string) {
		b.handlePeerConnected(peerID)
	})

	webrtc.SetOnPeerClosed(func(peerID string) {
		b.handlePeerClosed(peerID)
	})

	return b
}

// SetBrowserSend sets the function to send messages to the browser
func (b *Bridge) SetBrowserSend(fn func(msg protocol.AgentMessage) error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.browserSend = fn
}

// handleDataChannel handles a new data channel
func (b *Bridge) handleDataChannel(peerID string, dcInterface interface{}) {
	dc, ok := dcInterface.(*webrtc.DataChannel)
	if !ok || dc == nil {
		return
	}

	b.mu.Lock()
	b.dataChannels[peerID] = dc
	b.mu.Unlock()

	b.logger.Info("data channel registered", "peer", peerID, "state", dc.ReadyState())

	// Set up message handler - do this before checking OnOpen
	// because the channel might already be open
	dc.OnMessage(func(msg webrtc.DataChannelMessage) {
		b.handleDataChannelMessage(peerID, msg.Data)
	})

	// Check if already open
	if dc.ReadyState() == webrtc.DataChannelStateOpen {
		b.logger.Info("data channel already open", "peer", peerID)
		b.sendToBrowser(protocol.AgentMessage{
			Type:   protocol.MessageTypePeerConnected,
			PeerID: peerID,
		})
	}

	dc.OnOpen(func() {
		b.logger.Info("data channel opened", "peer", peerID)
		b.sendToBrowser(protocol.AgentMessage{
			Type:   protocol.MessageTypePeerConnected,
			PeerID: peerID,
		})
	})

	dc.OnClose(func() {
		b.logger.Info("data channel closed", "peer", peerID)
		b.mu.Lock()
		delete(b.dataChannels, peerID)
		b.mu.Unlock()
		b.sendToBrowser(protocol.AgentMessage{
			Type:   protocol.MessageTypePeerDisconnected,
			PeerID: peerID,
		})
	})
}

// handleDataChannelMessage handles a message from a data channel
func (b *Bridge) handleDataChannelMessage(peerID string, data []byte) {
	b.logger.Info("received data channel message", "peer", peerID, "size", len(data))
	// Send data as []byte - Go's JSON encoder will base64-encode it
	b.sendToBrowser(protocol.AgentMessage{
		Type:   protocol.MessageTypeData,
		PeerID: peerID,
		Data:   data,
	})
}

// handlePeerConnected handles when a peer connects
func (b *Bridge) handlePeerConnected(peerID string) {
	b.logger.Info("peer connected", "peer", peerID)
	// Wait for data channel to be ready
	// The data channel open event will send the peer-connected message
}

// handlePeerClosed handles when a peer disconnects
func (b *Bridge) handlePeerClosed(peerID string) {
	b.logger.Info("peer closed", "peer", peerID)
	b.mu.Lock()
	delete(b.dataChannels, peerID)
	b.mu.Unlock()
	b.sendToBrowser(protocol.AgentMessage{
		Type:   protocol.MessageTypePeerDisconnected,
		PeerID: peerID,
	})
}

// HandleBrowserMessage handles a message from the browser
func (b *Bridge) HandleBrowserMessage(msg protocol.BrowserMessage) error {
	b.logger.Info("received browser message", "type", msg.Type, "peerId", msg.PeerID, "dataSize", len(msg.Data))

	switch msg.Type {
	case protocol.MessageTypeData:
		if len(msg.Data) == 0 {
			b.logger.Warn("received empty data message")
			return nil
		}

		// Data is already []byte from JSON unmarshaling (base64 decoded by Go)
		data := msg.Data

		b.logger.Info("sending data to peer", "peer", msg.PeerID, "size", len(data), "isBroadcast", msg.PeerID == "")

		if msg.PeerID == "" {
			// Broadcast to all peers
			b.webrtc.BroadcastData(data)
		} else {
			// Send to specific peer
			if err := b.webrtc.SendData(msg.PeerID, data); err != nil {
				b.logger.Warn("failed to send data to peer", "peer", msg.PeerID, "error", err)
				return err
			}
		}
	default:
		b.logger.Warn("unknown browser message type", "type", msg.Type)
	}

	return nil
}

// sendWelcome sends a welcome message to the browser with self ID
func (b *Bridge) sendWelcome(selfID string) {
	b.sendToBrowser(protocol.AgentMessage{
		Type:   protocol.MessageTypeWelcome,
		SelfID: selfID,
	})
}

// sendToBrowser sends a message to the browser
func (b *Bridge) sendToBrowser(msg protocol.AgentMessage) {
	b.mu.RLock()
	send := b.browserSend
	b.mu.RUnlock()

	if send != nil {
		if err := send(msg); err != nil {
			b.logger.Error("failed to send message to browser", "error", err)
		}
	}
}

// GetConnectedPeers returns the list of connected peer IDs
func (b *Bridge) GetConnectedPeers() []string {
	b.mu.RLock()
	defer b.mu.RUnlock()

	var peers []string
	for peerID, dcInterface := range b.dataChannels {
		dc, ok := dcInterface.(*webrtc.DataChannel)
		if ok && dc != nil && dc.ReadyState() == webrtc.DataChannelStateOpen {
			peers = append(peers, peerID)
		}
	}

	return peers
}

