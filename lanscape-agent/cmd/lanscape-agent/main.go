package main

import (
	"flag"
	"log/slog"
	"os"

	"github.com/jhead/lanscape/lanscape-agent/internal/agent"
)

func main() {
	// Parse flags
	wsAddr := flag.String("ws-addr", "localhost:8082", "WebSocket server address")
	signalingURL := flag.String("signaling-url", "ws://localhost:8081", "Signaling server URL")
	topic := flag.String("topic", "lanscape-chat", "Signaling topic")
	logLevel := flag.String("log-level", "info", "Log level (debug, info, warn, error)")
	flag.Parse()

	// Set up logger
	var level slog.Level
	switch *logLevel {
	case "debug":
		level = slog.LevelDebug
	case "info":
		level = slog.LevelInfo
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
	}))

	// Get Tailscale info
	tailscaleInfo, err := agent.GetTailscaleInfo()
	if err != nil {
		logger.Warn("failed to get Tailscale info, continuing without interface binding", "error", err)
		tailscaleInfo = nil
	} else {
		logger.Info("detected Tailscale interface", "ip", tailscaleInfo.IP, "interface", tailscaleInfo.Interface)
	}

	// Create agent
	cfg := agent.Config{
		WebSocketAddr:  *wsAddr,
		SignalingURL:   *signalingURL,
		Topic:          *topic,
		TailscaleInfo:  tailscaleInfo,
		Logger:         logger,
	}

	ag, err := agent.NewAgent(cfg)
	if err != nil {
		logger.Error("failed to create agent", "error", err)
		os.Exit(1)
	}

	// Run agent
	if err := ag.Run(); err != nil {
		logger.Error("agent error", "error", err)
		os.Exit(1)
	}
}

