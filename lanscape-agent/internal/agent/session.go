package agent

import (
	"context"
	"log/slog"
)

// BrowserSession represents a single browser connection with its own WebRTC and signaling
type BrowserSession struct {
	webrtc    *WebRTCManager
	signaling *SignalingClient
	bridge    *Bridge
	logger    *slog.Logger
}

// NewBrowserSession creates a new browser session with its own WebRTC and signaling
func NewBrowserSession(signalingURL, topic string, tailscaleInfo *TailscaleInfo, logger *slog.Logger) (*BrowserSession, error) {
	// Create WebRTC manager for this session
	webrtc, err := NewWebRTCManager(tailscaleInfo, logger)
	if err != nil {
		return nil, err
	}

	// Create signaling client for this session (needed for bridge)
	signaling := NewSignalingClient(signalingURL, topic, webrtc, logger)

	// Create bridge
	bridge := NewBridge(webrtc, logger)
	
	// Set up signaling callback to send welcome to browser when received
	signaling.SetOnWelcome(func(selfID string) {
		bridge.sendWelcome(selfID)
	})

	// Set up ICE candidate callback
	webrtc.SetOnICECandidate(func(peerID string, candidate interface{}) {
		if candidate != nil {
			signaling.sendICECandidate(peerID, candidate)
		}
	})

	session := &BrowserSession{
		webrtc:    webrtc,
		signaling: signaling,
		bridge:    bridge,
		logger:    logger,
	}

	return session, nil
}

// Connect connects to the signaling server
func (s *BrowserSession) Connect() error {
	return s.signaling.Connect()
}

// Disconnect disconnects from signaling and closes all peer connections
func (s *BrowserSession) Disconnect() {
	s.signaling.Disconnect()
	s.webrtc.CloseAll()
}

// GetBridge returns the bridge for this session
func (s *BrowserSession) GetBridge() *Bridge {
	return s.bridge
}

// GetSelfID returns the self peer ID from signaling
func (s *BrowserSession) GetSelfID() string {
	return s.signaling.GetSelfID()
}

// Stop stops the session
func (s *BrowserSession) Stop(ctx context.Context) error {
	s.Disconnect()
	return nil
}

