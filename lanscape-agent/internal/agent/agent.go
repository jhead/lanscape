package agent

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// Agent orchestrates all components
type Agent struct {
	wsServer      *WebSocketServer
	tailscaleInfo *TailscaleInfo
	logger        *slog.Logger
}

// Config holds agent configuration
type Config struct {
	WebSocketAddr  string
	SignalingURL   string
	Topic          string
	TailscaleInfo  *TailscaleInfo
	Logger         *slog.Logger
}

// NewAgent creates a new agent
func NewAgent(config Config) (*Agent, error) {
	if config.Logger == nil {
		config.Logger = slog.Default()
	}

	// Create WebSocket server (each connection will create its own session)
	wsServer := NewWebSocketServer(
		config.WebSocketAddr,
		config.SignalingURL,
		config.Topic,
		config.TailscaleInfo,
		config.Logger,
	)

	return &Agent{
		wsServer:      wsServer,
		tailscaleInfo: config.TailscaleInfo,
		logger:        config.Logger,
	}, nil
}

// Start starts the agent
func (a *Agent) Start() error {
	a.logger.Info("starting agent")

	// Start WebSocket server in goroutine
	// Each browser connection will create its own session with signaling
	go func() {
		if err := a.wsServer.Start(); err != nil {
			a.logger.Error("WebSocket server error", "error", err)
		}
	}()

	// Wait a bit for server to start
	time.Sleep(100 * time.Millisecond)

	a.logger.Info("agent started", "websocket", a.wsServer.addr)

	return nil
}

// Stop stops the agent
func (a *Agent) Stop(ctx context.Context) error {
	a.logger.Info("stopping agent")

	// Stop WebSocket server (this will disconnect all sessions)
	if err := a.wsServer.Stop(ctx); err != nil {
		a.logger.Warn("error stopping WebSocket server", "error", err)
	}

	return nil
}

// Run runs the agent until interrupted
func (a *Agent) Run() error {
	if err := a.Start(); err != nil {
		return err
	}

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	<-sigChan
	a.logger.Info("received interrupt signal")

	// Graceful shutdown
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return a.Stop(shutdownCtx)
}


