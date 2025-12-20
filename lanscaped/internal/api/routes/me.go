package routes

import (
	"encoding/json"
	"log"
	"net/http"
)

// MeResponse represents the /v1/me endpoint response
type MeResponse struct {
	UserHandle string   `json:"user_handle"`
	Devices    []string `json:"devices,omitempty"`
}

// handleMe handles the /v1/me introspection endpoint
func HandleMe(w http.ResponseWriter, r *http.Request) {
	log.Printf("Me request from %s", r.RemoteAddr)

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// TODO: Implement authentication middleware
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		log.Printf("Me request without authorization")
		http.Error(w, "Authorization required", http.StatusUnauthorized)
		return
	}

	// TODO: Implement actual user lookup
	log.Printf("Returning user info for token: %s", authHeader)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := MeResponse{
		UserHandle: "mock_user",
		Devices:    []string{"device1", "device2"},
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding me response: %v", err)
	}
}
