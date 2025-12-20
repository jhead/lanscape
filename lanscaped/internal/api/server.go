package api

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/jhead/lanscape/lanscaped/internal/api/middleware"
	"github.com/jhead/lanscape/lanscaped/internal/api/routes"
	"github.com/jhead/lanscape/lanscaped/internal/auth"
	"github.com/jhead/lanscape/lanscaped/internal/store"
)

// Server represents the HTTP server
type Server struct {
	httpServer      *http.Server
	port            int
	store           *store.Store
	webauthnService *auth.WebAuthnService
	jwtService      *auth.JWTService
}

// NewServer creates a new API server
func NewServer(port int) (*Server, error) {
	// Initialize database store
	dbStore, err := store.NewStore()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize store: %w", err)
	}

	// Initialize WebAuthn service
	webauthnService, err := auth.NewWebAuthnService(dbStore)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize WebAuthn service: %w", err)
	}

	// Initialize JWT service
	jwtService, err := auth.NewJWTService()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize JWT service: %w", err)
	}

	return &Server{
		port:            port,
		store:           dbStore,
		webauthnService: webauthnService,
		jwtService:      jwtService,
	}, nil
}

// Start starts the HTTP server
func (s *Server) Start() error {
	mux := http.NewServeMux()

	// Register routes
	s.registerRoutes(mux)

	// Add CORS middleware
	handler := corsMiddleware(mux)

	s.httpServer = &http.Server{
		Addr:         fmt.Sprintf(":%d", s.port),
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start periodic cleanup of expired sessions
	go s.startSessionCleanup()

	log.Printf("Starting server on port %d", s.port)
	return s.httpServer.ListenAndServe()
}

// startSessionCleanup runs periodic cleanup of expired sessions
func (s *Server) startSessionCleanup() {
	ticker := time.NewTicker(1 * time.Hour) // Clean up every hour
	defer ticker.Stop()

	for range ticker.C {
		if err := s.store.CleanupExpiredSessions(); err != nil {
			log.Printf("Error cleaning up expired sessions: %v", err)
		} else {
			log.Println("Cleaned up expired sessions")
		}
	}
}

// corsMiddleware adds CORS headers to allow frontend access
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// Stop gracefully stops the HTTP server
func (s *Server) Stop(ctx context.Context) error {
	log.Println("Shutting down server...")
	if err := s.store.Close(); err != nil {
		log.Printf("Error closing database: %v", err)
	}
	return s.httpServer.Shutdown(ctx)
}

// registerRoutes registers all API routes
func (s *Server) registerRoutes(mux *http.ServeMux) {
	// Health check
	mux.HandleFunc("GET /healthz", routes.HandleHealthz)

	// WebAuthn registration routes
	mux.HandleFunc("POST /v1/webauthn/register/begin", func(w http.ResponseWriter, r *http.Request) {
		routes.HandleBeginRegistration(w, r, s.webauthnService, s.store)
	})
	mux.HandleFunc("POST /v1/webauthn/register/finish", func(w http.ResponseWriter, r *http.Request) {
		routes.HandleFinishRegistration(w, r, s.webauthnService, s.store, s.jwtService)
	})

	// WebAuthn login routes
	mux.HandleFunc("POST /v1/webauthn/login/begin", func(w http.ResponseWriter, r *http.Request) {
		routes.HandleBeginLogin(w, r, s.webauthnService, s.store)
	})
	mux.HandleFunc("POST /v1/webauthn/login/finish", func(w http.ResponseWriter, r *http.Request) {
		routes.HandleFinishLogin(w, r, s.webauthnService, s.store, s.jwtService)
	})

	// Auth routes
	mux.HandleFunc("POST /v1/auth/logout", routes.HandleLogout)

	// Protected routes (require JWT)
	jwtMiddleware := middleware.JWTAuthMiddleware(s.jwtService)
	mux.Handle("GET /v1/auth/test", jwtMiddleware(http.HandlerFunc(routes.HandleAuthTest)))

	// Network routes (require JWT)
	mux.Handle("POST /v1/networks", jwtMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		routes.HandleCreateNetwork(w, r, s.store)
	})))
	mux.Handle("GET /v1/networks", jwtMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		routes.HandleListNetworks(w, r, s.store)
	})))
	mux.Handle("PUT /v1/networks/{id}/join", jwtMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		routes.HandleJoinNetwork(w, r, s.store)
	})))
	mux.Handle("DELETE /v1/networks/{id}", jwtMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		routes.HandleDeleteNetwork(w, r, s.store)
	})))

	// API v1 routes
	mux.HandleFunc("POST /v1/register", routes.HandleRegister)
	mux.HandleFunc("POST /v1/devices/adopt", routes.HandleAdoptDevice)
	mux.HandleFunc("GET /v1/me", routes.HandleMe)

	log.Println("Routes registered")
}
