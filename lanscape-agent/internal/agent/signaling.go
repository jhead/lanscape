package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jhead/lanscape/signaling/pkg/signaling"
	"github.com/pion/webrtc/v4"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// SignalingClient handles connection to the signaling server
type SignalingClient struct {
	url        string
	topic      string
	conn       *websocket.Conn
	selfID     string
	webrtc     *WebRTCManager
	logger     *slog.Logger
	ctx        context.Context
	cancel     context.CancelFunc
	onPeerList func(peers []signaling.PeerRecord)
	onWelcome  func(selfID string)
}

// NewSignalingClient creates a new signaling client
func NewSignalingClient(url, topic string, webrtc *WebRTCManager, logger *slog.Logger) *SignalingClient {
	ctx, cancel := context.WithCancel(context.Background())
	return &SignalingClient{
		url:    url,
		topic:  topic,
		webrtc: webrtc,
		logger: logger,
		ctx:    ctx,
		cancel: cancel,
	}
}

// SetOnPeerList sets the callback for when peer list is received
func (c *SignalingClient) SetOnPeerList(fn func(peers []signaling.PeerRecord)) {
	c.onPeerList = fn
}

// SetOnWelcome sets the callback for when welcome message is received
func (c *SignalingClient) SetOnWelcome(fn func(selfID string)) {
	c.onWelcome = fn
}

// Connect connects to the signaling server
func (c *SignalingClient) Connect() error {
	wsURL := fmt.Sprintf("%s/ws/%s", c.url, c.topic)
	c.logger.Info("connecting to signaling server", "url", wsURL)

	ctx, cancel := context.WithTimeout(c.ctx, 10*time.Second)
	defer cancel()

	conn, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{})
	if err != nil {
		return fmt.Errorf("failed to connect to signaling server: %w", err)
	}

	c.conn = conn

	// Start reader goroutine
	go c.readLoop()

	// Wait for welcome message to get self ID
	// This will be handled in readLoop

	return nil
}

// Disconnect disconnects from the signaling server
func (c *SignalingClient) Disconnect() {
	if c.conn != nil {
		c.conn.Close(websocket.StatusNormalClosure, "")
		c.conn = nil
	}
	c.cancel()
}

// readLoop reads messages from the signaling server
func (c *SignalingClient) readLoop() {
	defer c.Disconnect()

	for {
		var msg signaling.OutboundMessage
		if err := wsjson.Read(c.ctx, c.conn, &msg); err != nil {
			c.logger.Debug("signaling read error", "error", err)
			return
		}

		c.handleMessage(msg)
	}
}

// handleMessage handles a message from the signaling server
func (c *SignalingClient) handleMessage(msg signaling.OutboundMessage) {
	c.logger.Debug("received signaling message", "type", msg.Type)

	switch msg.Type {
	case "welcome":
		c.selfID = msg.SelfID
		c.logger.Info("received welcome", "selfId", c.selfID)
		if c.onWelcome != nil {
			c.onWelcome(c.selfID)
		}
		// Notify bridge to send welcome to browser
		// The bridge will handle this via its browserSend callback

	case "peer-list":
		c.logger.Info("received peer list", "count", len(msg.Peers))
		if c.onPeerList != nil {
			c.onPeerList(msg.Peers)
		}
		// Create peer connections for existing peers
		for _, peer := range msg.Peers {
			if peer.ID != c.selfID {
				c.createPeerConnection(peer.ID, true)
			}
		}

	case "peer-joined":
		c.logger.Info("peer joined", "peerId", msg.PeerID)
		if msg.PeerID != c.selfID {
			c.createPeerConnection(msg.PeerID, true)
		}

	case "peer-left":
		c.logger.Info("peer left", "peerId", msg.PeerID)
		c.webrtc.ClosePeer(msg.PeerID)

	case "offer":
		c.handleOffer(msg)

	case "answer":
		c.handleAnswer(msg)

	case "ice-candidate":
		c.handleICECandidate(msg)

	case "error":
		c.logger.Error("signaling error", "code", msg.Type, "message", "error message")
	}
}

// createPeerConnection creates a WebRTC peer connection
func (c *SignalingClient) createPeerConnection(peerID string, isInitiator bool) {
	// Check if peer connection already exists
	_, err := c.webrtc.GetPeerConnection(peerID)
	if err == nil {
		// Already exists, don't create another
		c.logger.Debug("peer connection already exists", "peer", peerID)
		return
	}

	// Use perfect negotiation: only the "polite" peer (lower ID) creates offer
	// The "impolite" peer (higher ID) waits for an offer
	isPolite := c.selfID < peerID
	shouldCreateOffer := isInitiator && isPolite

	_, err = c.webrtc.CreatePeerConnection(peerID, shouldCreateOffer)
	if err != nil {
		c.logger.Error("failed to create peer connection", "peer", peerID, "error", err)
		return
	}

	if shouldCreateOffer {
		// Create and send offer
		offer, err := c.webrtc.CreateOffer(peerID)
		if err != nil {
			c.logger.Error("failed to create offer", "peer", peerID, "error", err)
			return
		}

		payload, _ := json.Marshal(map[string]string{
			"sdp":  offer.SDP,
			"type": string(offer.Type),
		})

		c.sendRelay("offer", peerID, payload, "")
	}
}

// handleOffer handles an SDP offer from a peer
func (c *SignalingClient) handleOffer(msg signaling.OutboundMessage) {
	peerID := msg.From
	c.logger.Info("received offer", "from", peerID)

	// Get or create peer connection
	peer, err := c.webrtc.GetPeerConnection(peerID)
	if err != nil {
		// Create peer connection as responder
		peer, err = c.webrtc.CreatePeerConnection(peerID, false)
		if err != nil {
			c.logger.Error("failed to create peer connection", "peer", peerID, "error", err)
			return
		}
	}

	// Check if we already have a local offer (collision case)
	// Use perfect negotiation: compare peer IDs to determine who is "polite"
	// The peer with the lower ID is "polite" and should rollback
	isPolite := c.selfID < peerID
	hasLocalOffer := peer.PC.SignalingState() == webrtc.SignalingStateHaveLocalOffer

	if hasLocalOffer {
		if isPolite {
			// We're polite, rollback and accept the incoming offer
			c.logger.Info("offer collision detected, rolling back (polite)", "peer", peerID)
			// Close existing connection and create new one
			c.webrtc.ClosePeer(peerID)
			peer, err = c.webrtc.CreatePeerConnection(peerID, false)
			if err != nil {
				c.logger.Error("failed to recreate peer connection", "peer", peerID, "error", err)
				return
			}
		} else {
			// We're impolite, ignore the incoming offer
			c.logger.Info("offer collision detected, ignoring (impolite)", "peer", peerID)
			return
		}
	}

	// Parse offer
	var payload map[string]string
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		c.logger.Error("failed to parse offer", "error", err)
		return
	}

	offer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer,
		SDP:  payload["sdp"],
	}

	if err := c.webrtc.SetRemoteDescription(peerID, offer); err != nil {
		c.logger.Error("failed to set remote description", "peer", peerID, "error", err)
		return
	}

	// Create and send answer
	answer, err := c.webrtc.CreateAnswer(peerID)
	if err != nil {
		c.logger.Error("failed to create answer", "peer", peerID, "error", err)
		return
	}

	answerPayload, _ := json.Marshal(map[string]string{
		"sdp":  answer.SDP,
		"type": string(answer.Type),
	})

	c.sendRelay("answer", peerID, answerPayload, "")
}

// handleAnswer handles an SDP answer from a peer
func (c *SignalingClient) handleAnswer(msg signaling.OutboundMessage) {
	peerID := msg.From
	c.logger.Info("received answer", "from", peerID)

	peer, err := c.webrtc.GetPeerConnection(peerID)
	if err != nil {
		c.logger.Error("received answer for unknown peer", "peer", peerID, "error", err)
		return
	}

	// Check if we're in the right state to accept an answer
	if peer.PC.SignalingState() != webrtc.SignalingStateHaveLocalOffer {
		c.logger.Warn("received answer in wrong state", "peer", peerID, "state", peer.PC.SignalingState())
		return
	}

	var payload map[string]string
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		c.logger.Error("failed to parse answer", "error", err)
		return
	}

	answer := webrtc.SessionDescription{
		Type: webrtc.SDPTypeAnswer,
		SDP:  payload["sdp"],
	}

	if err := c.webrtc.SetRemoteDescription(peerID, answer); err != nil {
		c.logger.Error("failed to set remote description", "peer", peerID, "error", err)
		return
	}
}

// handleICECandidate handles an ICE candidate from a peer
func (c *SignalingClient) handleICECandidate(msg signaling.OutboundMessage) {
	peerID := msg.From
	c.logger.Debug("received ICE candidate", "from", peerID)

	// Check if peer connection exists
	_, err := c.webrtc.GetPeerConnection(peerID)
	if err != nil {
		// Peer connection doesn't exist yet, queue the candidate
		// This will be handled when the peer connection is created
		c.logger.Debug("received ICE candidate for unknown peer, will queue", "peer", peerID)
		// For now, we'll just log it - the candidate will be lost if peer connection isn't created soon
		// TODO: Implement candidate queueing if needed
		return
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(msg.Payload, &payload); err != nil {
		c.logger.Error("failed to parse ICE candidate", "error", err)
		return
	}

	candidate := webrtc.ICECandidateInit{
		Candidate: payload["candidate"].(string),
	}

	if sdpMid, ok := payload["sdpMid"].(string); ok {
		candidate.SDPMid = &sdpMid
	}

	if sdpMLineIndex, ok := payload["sdpMLineIndex"].(float64); ok {
		idx := uint16(sdpMLineIndex)
		candidate.SDPMLineIndex = &idx
	}

	if err := c.webrtc.AddICECandidate(peerID, candidate); err != nil {
		// Don't log as error if remote description isn't set yet - that's normal
		if err.Error() != "InvalidStateError: remote description is not set" {
			c.logger.Warn("failed to add ICE candidate", "peer", peerID, "error", err)
		}
	}
}

// sendRelay sends a relay message to the signaling server
func (c *SignalingClient) sendRelay(msgType, to string, payload json.RawMessage, msgID string) {
	if c.conn == nil {
		return
	}

	msg := signaling.InboundMessage{
		Type:    msgType,
		To:      to,
		Payload: payload,
		MsgID:   msgID,
	}

	ctx, cancel := context.WithTimeout(c.ctx, 5*time.Second)
	defer cancel()

	if err := wsjson.Write(ctx, c.conn, msg); err != nil {
		c.logger.Error("failed to send relay message", "error", err)
	}
}

// sendICECandidate sends an ICE candidate to a peer via signaling
func (c *SignalingClient) sendICECandidate(peerID string, candidate interface{}) {
	// Use type assertion to get the ICECandidate
	cand, ok := candidate.(*webrtc.ICECandidate)
	if !ok || cand == nil {
		return
	}

	candidateJSON := cand.ToJSON()
	payload := map[string]interface{}{
		"candidate": candidateJSON.Candidate,
	}

	if candidateJSON.SDPMid != nil {
		payload["sdpMid"] = *candidateJSON.SDPMid
	}
	if candidateJSON.SDPMLineIndex != nil {
		payload["sdpMLineIndex"] = *candidateJSON.SDPMLineIndex
	}

	payloadBytes, _ := json.Marshal(payload)
	c.sendRelay("ice-candidate", peerID, payloadBytes, "")
}

// GetSelfID returns the self peer ID
func (c *SignalingClient) GetSelfID() string {
	return c.selfID
}

