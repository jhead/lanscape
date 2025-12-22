package routes

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"github.com/jhead/lanscape/lanscaped/internal/api/middleware"
	"github.com/jhead/lanscape/lanscaped/internal/auth"
	"github.com/jhead/lanscape/lanscaped/internal/store"
)

// TokenResponse represents the response from the token endpoint
type TokenResponse struct {
	Token string `json:"token"`
}

// HandleGetToken handles the token endpoint (protected by JWT middleware)
// Mints a new JWT token with network-specific JID for XMPP authentication
func HandleGetToken(w http.ResponseWriter, r *http.Request, jwtService *auth.JWTService, dbStore *store.Store) {
	log.Printf("Get token request from %s", r.RemoteAddr)

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get JWT claims from context (set by JWT middleware)
	claims, ok := middleware.GetClaimsFromContext(r)
	if !ok {
		log.Printf("Get token request without valid JWT claims")
		http.Error(w, "Authorization required", http.StatusUnauthorized)
		return
	}

	// Get network ID from query parameter
	networkIDStr := r.URL.Query().Get("network")
	if networkIDStr == "" {
		http.Error(w, "Network parameter is required", http.StatusBadRequest)
		return
	}

	networkID, err := strconv.ParseInt(networkIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid network ID", http.StatusBadRequest)
		return
	}

	// Verify user is a member of the network
	isMember, err := dbStore.IsUserInNetwork(claims.UserID, networkID)
	if err != nil {
		log.Printf("Error checking network membership: %v", err)
		http.Error(w, "Failed to verify network membership", http.StatusInternalServerError)
		return
	}

	if !isMember {
		http.Error(w, "User is not a member of this network", http.StatusForbidden)
		return
	}

	// Get network details
	network, err := dbStore.GetNetworkByID(networkID)
	if err != nil {
		log.Printf("Error fetching network: %v", err)
		http.Error(w, "Network not found", http.StatusNotFound)
		return
	}

	// Build JID based on network: username@chat.<network>.tsnet.jxh.io
	jid := fmt.Sprintf("%s@chat.%s.tsnet.jxh.io", claims.Username, network.Name)

	log.Printf("Minting new token for user: %s (ID: %d) with JID: %s", claims.Username, claims.UserID, jid)

	// Generate new JWT token with network-specific JID
	token, err := jwtService.GenerateToken(claims.UserID, claims.Username, jid)
	if err != nil {
		log.Printf("Error generating JWT token: %v", err)
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := TokenResponse{
		Token: token,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding token response: %v", err)
	}
}

// AuthTestResponse represents the response from the auth test endpoint
type AuthTestResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// LogoutResponse represents the response from the logout endpoint
type LogoutResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// HandleAuthTest handles the auth test endpoint (protected by JWT middleware)
func HandleAuthTest(w http.ResponseWriter, r *http.Request) {
	log.Printf("Auth test request from %s", r.RemoteAddr)

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := AuthTestResponse{
		Success: true,
		Message: "JWT token is valid! You are authenticated.",
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding auth test response: %v", err)
	}
}

// HandleLogout handles the logout endpoint and clears the JWT cookie
func HandleLogout(w http.ResponseWriter, r *http.Request) {
	log.Printf("Logout request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Clear JWT cookie by setting it to expire immediately
	http.SetCookie(w, &http.Cookie{
		Name:     "jwt",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := LogoutResponse{
		Success: true,
		Message: "Logged out successfully",
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding logout response: %v", err)
	}
}
