package routes

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jhead/lanscape/lanscaped/internal/auth"
	"github.com/jhead/lanscape/lanscaped/internal/store"
)

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

// OIDCCallbackRequest represents the request body for OIDC callback
type OIDCCallbackRequest struct {
	AccessToken string                 `json:"access_token"`
	IDToken     string                 `json:"id_token,omitempty"`
	UserInfo    map[string]interface{} `json:"user_info,omitempty"`
}

// HandleOIDCCallback handles the OIDC callback endpoint
// Accepts OIDC tokens and creates a session by generating a JWT
func HandleOIDCCallback(w http.ResponseWriter, r *http.Request, jwtService *auth.JWTService, dbStore *store.Store) {
	log.Printf("OIDC callback request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req OIDCCallbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding OIDC callback request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.AccessToken == "" {
		http.Error(w, "access_token is required", http.StatusBadRequest)
		return
	}

	// Extract preferred_username from user_info - required, no fallbacks
	if req.UserInfo == nil {
		log.Printf("OIDC user_info is nil")
		http.Error(w, "user_info is required", http.StatusBadRequest)
		return
	}

	log.Printf("OIDC user_info received: %+v", req.UserInfo)

	// Extract preferred_username from user_info
	preferredUsernameVal, exists := req.UserInfo["preferred_username"]
	if !exists || preferredUsernameVal == nil {
		log.Printf("OIDC preferred_username field not found in user_info")
		http.Error(w, "preferred_username is required in user_info", http.StatusBadRequest)
		return
	}

	username, ok := preferredUsernameVal.(string)
	if !ok || username == "" {
		log.Printf("OIDC preferred_username is not a non-empty string (type: %T, value: %v)", preferredUsernameVal, preferredUsernameVal)
		http.Error(w, "preferred_username must be a non-empty string", http.StatusBadRequest)
		return
	}

	log.Printf("Using preferred_username from user_info: %s", username)

	// Find or create user
	user, err := dbStore.GetUserByUsername(username)
	if err != nil {
		// User doesn't exist, create it
		log.Printf("Creating new user for OIDC: %s", username)
		user, err = dbStore.CreateUser(username)
		if err != nil {
			log.Printf("Error creating user: %v", err)
			http.Error(w, "Failed to create user", http.StatusInternalServerError)
			return
		}
	}

	// Generate JWT token without JID (network-specific tokens are minted on-demand)
	token, err := jwtService.GenerateToken(user.ID, user.Username, "")
	if err != nil {
		log.Printf("Error generating JWT token: %v", err)
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Set JWT token in cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "jwt",
		Value:    token,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false, // Set to true in production with HTTPS
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := map[string]interface{}{
		"success":  true,
		"message":  "OIDC authentication successful",
		"username": user.Username,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding OIDC callback response: %v", err)
	}
}
