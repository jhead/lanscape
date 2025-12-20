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
