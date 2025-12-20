package daemon

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jhead/lanscape/lanscaped/internal/api"
)

// ServerConfig holds lanscaped server configuration
type ServerConfig struct {
	Port int
}

// Run starts the lanscaped server with the specified configuration
func Run(config ServerConfig) {
	log.Println("Initializing lanscaped server...")

	// Create and start server
	server, err := api.NewServer(config.Port)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	// Handle graceful shutdown
	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Listen for interrupt signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start server in a goroutine
	go func() {
		if err := server.Start(); err != nil && err != context.Canceled {
			log.Fatalf("Server error: %v", err)
		}
	}()

	log.Println("Server started, waiting for interrupt signal...")

	// Wait for interrupt signal
	<-sigChan
	log.Println("Received interrupt signal, shutting down...")

	// Graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Stop(shutdownCtx); err != nil {
		log.Printf("Error during shutdown: %v", err)
	}

	log.Println("Server stopped")
}

// loadServerConfig loads config from environment, etc.
func LoadServerConfig() ServerConfig {
	port := 8080
	if portEnv := os.Getenv("PORT"); portEnv != "" {
		var err error
		if port, err = parsePort(portEnv); err != nil {
			log.Fatalf("Invalid PORT: %v", err)
		}
	}
	return ServerConfig{
		Port: port,
	}
}

// parsePort parses a port string to an integer
func parsePort(s string) (int, error) {
	// Simple implementation - can be enhanced
	var port int
	_, err := fmt.Sscanf(s, "%d", &port)
	if err != nil {
		return 0, err
	}
	if port < 1 || port > 65535 {
		return 0, fmt.Errorf("port must be between 1 and 65535")
	}
	return port, nil
}
