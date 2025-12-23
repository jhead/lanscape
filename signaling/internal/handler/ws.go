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
	maxMessageSize = 64 * 1024 // 64KB for SDP
	writeTimeout   = 5 * time.Second
	pingInterval   = 30 * time.Second
)

// HandleSignaling returns an HTTP handler for WebSocket signaling connections.
// Clients connect to /ws/{topic} to join a signaling topic.
func HandleSignaling(server *signaling.Server, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		topicID := r.PathValue("topic")
		if topicID == "" {
			http.Error(w, "topic required", http.StatusBadRequest)
			return
		}

		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			OriginPatterns: []string{"*"}, // TODO: configure for production
		})
		if err != nil {
			logger.Error("websocket accept failed", "error", err)
			return
		}
		conn.SetReadLimit(maxMessageSize)

		ctx := r.Context()
		pc, existingPeers := server.Join(topicID, nil)
		defer server.Leave(pc.ID, topicID)

		// Send welcome message with self ID
		if err := wsjson.Write(ctx, conn, signaling.OutboundMessage{
			Type:   "welcome",
			SelfID: pc.ID,
		}); err != nil {
			logger.Debug("failed to send welcome", "peer", pc.ID, "error", err)
			return
		}

		// Send peer list
		if err := wsjson.Write(ctx, conn, signaling.OutboundMessage{
			Type:  "peer-list",
			Peers: existingPeers,
		}); err != nil {
			logger.Debug("failed to send peer-list", "peer", pc.ID, "error", err)
			return
		}

		logger.Info("websocket connected", "peer", pc.ID, "topic", topicID)

		// Start writer goroutine (single writer per connection)
		go writerLoop(ctx, conn, pc, logger)

		// Reader loop blocks until disconnect
		readerLoop(ctx, conn, pc, server, topicID, logger)

		logger.Info("websocket disconnected", "peer", pc.ID, "topic", topicID)
	}
}

// writerLoop is the single goroutine that writes to the WebSocket connection.
// It drains the peer's Send channel and handles ping/keepalive.
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
				logger.Debug("write failed", "peer", pc.ID, "error", err)
				pc.Cancel()
				return
			}
		case <-ticker.C:
			if err := conn.Ping(ctx); err != nil {
				logger.Debug("ping failed", "peer", pc.ID, "error", err)
				pc.Cancel()
				return
			}
		}
	}
}

// readerLoop reads messages from the WebSocket and routes them via the server.
func readerLoop(ctx context.Context, conn *websocket.Conn, pc *signaling.PeerConn, server *signaling.Server, topicID string, logger *slog.Logger) {
	for {
		var msg signaling.InboundMessage
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			// Connection closed or error - exit gracefully
			return
		}

		// Validate message type
		if !signaling.IsRelayType(msg.Type) {
			sendError(ctx, conn, "invalid_type", "unknown message type", msg.MsgID)
			continue
		}

		// Validate target for relay types
		if msg.To == "" {
			sendError(ctx, conn, "missing_target", "to field required", msg.MsgID)
			continue
		}

		// Relay the message
		result := server.Relay(topicID, pc.ID, msg.To, msg.Type, msg.Payload, msg.MsgID)
		switch result {
		case signaling.RelayDelivered:
			// Success - no response needed
		case signaling.RelayTargetNotFound:
			sendError(ctx, conn, "target_not_found", "peer not found", msg.MsgID)
		case signaling.RelayDropped:
			sendError(ctx, conn, "dropped", "delivery failed", msg.MsgID)
		case signaling.RelayInvalidType:
			sendError(ctx, conn, "invalid_type", "unknown message type", msg.MsgID)
		case signaling.RelayTopicNotFound:
			// Topic gone - disconnect
			return
		}
	}
}

// sendError sends an error message to the client (best-effort)
func sendError(ctx context.Context, conn *websocket.Conn, code, message, msgID string) {
	_ = wsjson.Write(ctx, conn, signaling.ErrorMessage{
		Type:    "error",
		Code:    code,
		Message: message,
		MsgID:   msgID,
	})
}
