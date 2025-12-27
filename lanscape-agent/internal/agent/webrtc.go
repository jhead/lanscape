package agent

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/pion/webrtc/v4"
)

// WebRTCManager manages WebRTC peer connections
type WebRTCManager struct {
	mu              sync.RWMutex
	peers           map[string]*PeerConnection
	settingEngine   *webrtc.SettingEngine
	api             *webrtc.API
	tailscaleInfo      *TailscaleInfo
	logger             *slog.Logger
	onDataChannel      func(peerID string, dc interface{})
	onPeerConnected    func(peerID string)
	onPeerClosed       func(peerID string)
	onICECandidate     func(peerID string, candidate interface{})
}

// PeerConnection wraps a WebRTC peer connection
type PeerConnection struct {
	ID          string
	PC          *webrtc.PeerConnection
	DataChannel interface{} // *webrtc.DataChannel (not exported)
	mu          sync.Mutex
}

// NewWebRTCManager creates a new WebRTC manager
func NewWebRTCManager(tailscaleInfo *TailscaleInfo, logger *slog.Logger) (*WebRTCManager, error) {
	se := webrtc.SettingEngine{}

	// Configure NAT 1:1 IP mapping with Tailscale IP
	if tailscaleInfo != nil && tailscaleInfo.IP != "" {
		se.SetNAT1To1IPs([]string{tailscaleInfo.IP}, webrtc.ICECandidateTypeHost)
		logger.Info("configured NAT 1:1 IP mapping", "ip", tailscaleInfo.IP)
	}

	// Note: Pion WebRTC v4 doesn't support SetNet directly
	// Interface binding is handled via NAT 1:1 IP mapping and ICE candidate filtering
	// The Tailscale IP is set above via SetNAT1To1IPs

	// Create API with settings
	api := webrtc.NewAPI(webrtc.WithSettingEngine(se))

	return &WebRTCManager{
		peers:         make(map[string]*PeerConnection),
		settingEngine: &se,
		api:           api,
		tailscaleInfo: tailscaleInfo,
		logger:        logger,
	}, nil
}

// SetOnDataChannel sets the callback for when a data channel is opened
func (m *WebRTCManager) SetOnDataChannel(fn func(peerID string, dc interface{})) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onDataChannel = fn
}

// SetOnPeerConnected sets the callback for when a peer connects
func (m *WebRTCManager) SetOnPeerConnected(fn func(peerID string)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onPeerConnected = fn
}

// SetOnPeerClosed sets the callback for when a peer disconnects
func (m *WebRTCManager) SetOnPeerClosed(fn func(peerID string)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onPeerClosed = fn
}

// SetOnICECandidate sets the callback for when an ICE candidate is generated
func (m *WebRTCManager) SetOnICECandidate(fn func(peerID string, candidate interface{})) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onICECandidate = fn
}

// CreatePeerConnection creates a new peer connection
func (m *WebRTCManager) CreatePeerConnection(peerID string, isInitiator bool) (*PeerConnection, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if peer already exists
	if existing, ok := m.peers[peerID]; ok {
		return existing, nil
	}

	// Create peer connection configuration
	config := webrtc.Configuration{
		ICEServers: []webrtc.ICEServer{},
	}

	// Create peer connection
	pc, err := m.api.NewPeerConnection(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create peer connection: %w", err)
	}

	peerConn := &PeerConnection{
		ID: peerID,
		PC:  pc,
	}

	// Create data channel if we're the initiator
	if isInitiator {
		ordered := true
		dc, err := pc.CreateDataChannel("yjs-sync", &webrtc.DataChannelInit{
			Ordered: &ordered,
		})
		if err != nil {
			pc.Close()
			return nil, fmt.Errorf("failed to create data channel: %w", err)
		}
		peerConn.DataChannel = dc
		m.setupDataChannel(peerID, dc)
		// Notify bridge about the data channel
		if m.onDataChannel != nil {
			m.onDataChannel(peerID, dc)
		}
	}

	// Handle incoming data channels
	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		m.logger.Info("received data channel", "peer", peerID)
		peerConn.mu.Lock()
		peerConn.DataChannel = dc
		peerConn.mu.Unlock()
		m.setupDataChannel(peerID, dc)
		// Notify bridge about the data channel
		if m.onDataChannel != nil {
			m.onDataChannel(peerID, dc)
		}
	})

	// Handle connection state changes
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		m.logger.Info("peer connection state changed", "peer", peerID, "state", state.String())
		if state == webrtc.PeerConnectionStateConnected {
			if m.onPeerConnected != nil {
				m.onPeerConnected(peerID)
			}
		} else if state == webrtc.PeerConnectionStateClosed || state == webrtc.PeerConnectionStateFailed {
			m.ClosePeer(peerID)
		}
	})

	// Handle ICE connection state
	pc.OnICEConnectionStateChange(func(state webrtc.ICEConnectionState) {
		m.logger.Info("ICE connection state changed", "peer", peerID, "state", state.String())
	})

	// Track ICE candidates and send via signaling
	pc.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil {
			m.logger.Debug("ICE candidate", "peer", peerID, "candidate", candidate.String())
			if m.onICECandidate != nil {
				m.onICECandidate(peerID, candidate)
			}
		}
	})

	m.peers[peerID] = peerConn
	return peerConn, nil
}

// setupDataChannel sets up event handlers for a data channel
func (m *WebRTCManager) setupDataChannel(peerID string, dc *webrtc.DataChannel) {
	dc.OnOpen(func() {
		m.logger.Info("data channel opened", "peer", peerID)
		if m.onDataChannel != nil {
			m.onDataChannel(peerID, dc)
		}
	})

	dc.OnClose(func() {
		m.logger.Info("data channel closed", "peer", peerID)
	})

	dc.OnError(func(err error) {
		m.logger.Error("data channel error", "peer", peerID, "error", err)
	})
}

// GetPeerConnection gets an existing peer connection
func (m *WebRTCManager) GetPeerConnection(peerID string) (*PeerConnection, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	peer, ok := m.peers[peerID]
	if !ok {
		return nil, fmt.Errorf("peer not found: %s", peerID)
	}

	return peer, nil
}

// ClosePeer closes a peer connection
func (m *WebRTCManager) ClosePeer(peerID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	peer, ok := m.peers[peerID]
	if !ok {
		return
	}

	if peer.DataChannel != nil {
		if dc, ok := peer.DataChannel.(*webrtc.DataChannel); ok {
			dc.Close()
		}
	}
	if peer.PC != nil {
		peer.PC.Close()
	}

	delete(m.peers, peerID)

	if m.onPeerClosed != nil {
		m.onPeerClosed(peerID)
	}

	m.logger.Info("closed peer connection", "peer", peerID)
}

// CloseAll closes all peer connections
func (m *WebRTCManager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for peerID, peer := range m.peers {
		if peer.DataChannel != nil {
			if dc, ok := peer.DataChannel.(*webrtc.DataChannel); ok {
				dc.Close()
			}
		}
		if peer.PC != nil {
			peer.PC.Close()
		}
		delete(m.peers, peerID)
	}
}

// CreateOffer creates an SDP offer for a peer
func (m *WebRTCManager) CreateOffer(peerID string) (*webrtc.SessionDescription, error) {
	peer, err := m.GetPeerConnection(peerID)
	if err != nil {
		return nil, err
	}

	offer, err := peer.PC.CreateOffer(nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create offer: %w", err)
	}

	if err := peer.PC.SetLocalDescription(offer); err != nil {
		return nil, fmt.Errorf("failed to set local description: %w", err)
	}

	return &offer, nil
}

// SetRemoteDescription sets the remote SDP description
func (m *WebRTCManager) SetRemoteDescription(peerID string, desc webrtc.SessionDescription) error {
	peer, err := m.GetPeerConnection(peerID)
	if err != nil {
		return err
	}

	return peer.PC.SetRemoteDescription(desc)
}

// CreateAnswer creates an SDP answer for a peer
func (m *WebRTCManager) CreateAnswer(peerID string) (*webrtc.SessionDescription, error) {
	peer, err := m.GetPeerConnection(peerID)
	if err != nil {
		return nil, err
	}

	answer, err := peer.PC.CreateAnswer(nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create answer: %w", err)
	}

	if err := peer.PC.SetLocalDescription(answer); err != nil {
		return nil, fmt.Errorf("failed to set local description: %w", err)
	}

	return &answer, nil
}

// AddICECandidate adds an ICE candidate to a peer connection
func (m *WebRTCManager) AddICECandidate(peerID string, candidate webrtc.ICECandidateInit) error {
	peer, err := m.GetPeerConnection(peerID)
	if err != nil {
		return err
	}

	return peer.PC.AddICECandidate(candidate)
}

// SendData sends data to a peer via data channel
func (m *WebRTCManager) SendData(peerID string, data []byte) error {
	peer, err := m.GetPeerConnection(peerID)
	if err != nil {
		return err
	}

	peer.mu.Lock()
	dcInterface := peer.DataChannel
	peer.mu.Unlock()

	dc, ok := dcInterface.(*webrtc.DataChannel)
	if !ok || dc == nil || dc.ReadyState() != webrtc.DataChannelStateOpen {
		return fmt.Errorf("data channel not open for peer: %s", peerID)
	}

	return dc.Send(data)
}

// BroadcastData sends data to all connected peers
func (m *WebRTCManager) BroadcastData(data []byte) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for peerID, peer := range m.peers {
		peer.mu.Lock()
		dcInterface := peer.DataChannel
		peer.mu.Unlock()

		dc, ok := dcInterface.(*webrtc.DataChannel)
		if ok && dc != nil && dc.ReadyState() == webrtc.DataChannelStateOpen {
			if err := dc.Send(data); err != nil {
				m.logger.Warn("failed to broadcast to peer", "peer", peerID, "error", err)
			}
		}
	}
}

// SetDataChannelHandler sets a handler for incoming data channel messages
func (m *WebRTCManager) SetDataChannelHandler(peerID string, handler func([]byte)) error {
	peer, err := m.GetPeerConnection(peerID)
	if err != nil {
		return err
	}

	peer.mu.Lock()
	dcInterface := peer.DataChannel
	peer.mu.Unlock()

	dc, ok := dcInterface.(*webrtc.DataChannel)
	if !ok || dc == nil {
		return fmt.Errorf("data channel not available for peer: %s", peerID)
	}

	dc.OnMessage(func(msg webrtc.DataChannelMessage) {
		handler(msg.Data)
	})

	return nil
}

// WaitForDataChannel waits for a data channel to open
func (m *WebRTCManager) WaitForDataChannel(ctx context.Context, peerID string) error {
	peer, err := m.GetPeerConnection(peerID)
	if err != nil {
		return err
	}

	// Wait for data channel to be set
	for {
		peer.mu.Lock()
		dcInterface := peer.DataChannel
		peer.mu.Unlock()

		dc, ok := dcInterface.(*webrtc.DataChannel)
		if ok && dc != nil && dc.ReadyState() == webrtc.DataChannelStateOpen {
			return nil
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			// Continue waiting
		}
	}
}

