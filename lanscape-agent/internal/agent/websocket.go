package agent

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/jhead/lanscape/lanscape-agent/pkg/protocol"
	"nhooyr.io/websocket"
	"nhooyr.io/websocket/wsjson"
)

// WebSocketServer handles browser WebSocket connections
type WebSocketServer struct {
	addr            string
	signalingURL    string
	topic           string
	tailscaleInfo   *TailscaleInfo
	logger          *slog.Logger
	server          *http.Server
	sessions        map[*websocket.Conn]*BrowserSession
	mu              sync.RWMutex
}

// NewWebSocketServer creates a new WebSocket server
func NewWebSocketServer(addr, signalingURL, topic string, tailscaleInfo *TailscaleInfo, logger *slog.Logger) *WebSocketServer {
	return &WebSocketServer{
		addr:          addr,
		signalingURL:  signalingURL,
		topic:         topic,
		tailscaleInfo: tailscaleInfo,
		logger:        logger,
		sessions:      make(map[*websocket.Conn]*BrowserSession),
	}
}

// Start starts the WebSocket server
func (s *WebSocketServer) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleWebSocket)

	s.server = &http.Server{
		Addr:    s.addr,
		Handler: mux,
	}

	s.logger.Info("starting WebSocket server", "addr", s.addr)
	return s.server.ListenAndServe()
}

// Stop stops the WebSocket server
func (s *WebSocketServer) Stop(ctx context.Context) error {
	s.mu.Lock()
	for conn, session := range s.sessions {
		session.Disconnect()
		conn.Close(websocket.StatusNormalClosure, "server shutting down")
	}
	s.mu.Unlock()

	if s.server != nil {
		return s.server.Shutdown(ctx)
	}
	return nil
}

// handleWebSocket handles a WebSocket connection
func (s *WebSocketServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		OriginPatterns: []string{"*"}, // Allow all origins for localhost
	})
	if err != nil {
		s.logger.Error("failed to accept WebSocket", "error", err)
		return
	}

	// Create a new browser session for this connection
	session, err := NewBrowserSession(s.signalingURL, s.topic, s.tailscaleInfo, s.logger)
	if err != nil {
		s.logger.Error("failed to create browser session", "error", err)
		conn.Close(websocket.StatusInternalError, "failed to create session")
		return
	}

	// Set up bridge to send messages to this browser (before connecting)
	bridge := session.GetBridge()
	bridge.SetBrowserSend(func(msg protocol.AgentMessage) error {
		return s.sendToBrowser(conn, msg)
	})

	// Connect to signaling server
	if err := session.Connect(); err != nil {
		s.logger.Error("failed to connect to signaling", "error", err)
		conn.Close(websocket.StatusInternalError, "failed to connect to signaling")
		return
	}

	s.mu.Lock()
	s.sessions[conn] = session
	s.mu.Unlock()

	// Wait a bit for welcome message from signaling
	// The signaling client will receive welcome and set selfID
	// We'll send welcome to browser when we receive it from signaling
	// For now, just log
	s.logger.Info("browser connected, waiting for signaling welcome")

	// Handle messages from browser
	ctx := r.Context()
	for {
		var msg protocol.BrowserMessage
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			s.logger.Debug("browser disconnected", "error", err)
			break
		}

		s.logger.Info("received browser message", "type", msg.Type, "peerId", msg.PeerID, "dataSize", len(msg.Data))

		if err := bridge.HandleBrowserMessage(msg); err != nil {
			s.logger.Warn("failed to handle browser message", "error", err)
			s.sendError(conn, err.Error())
		}
	}

	s.mu.Lock()
	session.Disconnect()
	delete(s.sessions, conn)
	s.mu.Unlock()

	conn.Close(websocket.StatusNormalClosure, "")
	s.logger.Info("browser disconnected")
}

// sendToBrowser sends a message to the browser
func (s *WebSocketServer) sendToBrowser(conn *websocket.Conn, msg protocol.AgentMessage) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Always send as JSON (data will be encoded as array)
	return wsjson.Write(ctx, conn, msg)
}

// sendError sends an error message to the browser
func (s *WebSocketServer) sendError(conn *websocket.Conn, errorMsg string) {
	msg := protocol.AgentMessage{
		Type:  protocol.MessageTypeError,
		Error: errorMsg,
	}
	s.sendToBrowser(conn, msg)
}
