package routes

import (
	"encoding/json"
	"log"
	"net/http"
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

	// Clear the JWT cookie by setting it with MaxAge -1 (expires immediately)
	// Use the same settings as when setting the cookie to ensure it's cleared
	http.SetCookie(w, &http.Cookie{
		Name:     "jwt",
		Value:    "",
		Path:     "/",
		MaxAge:   -1, // Expire immediately
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false, // Match the setting used when setting the cookie
	})

	log.Printf("JWT cookie cleared for logout")

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
