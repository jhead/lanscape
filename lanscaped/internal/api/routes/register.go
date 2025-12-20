package routes

import (
	"encoding/json"
	"log"
	"net/http"
)

// RegisterRequest represents a user registration request
type RegisterRequest struct {
	PublicKey string `json:"public_key"`
	Handle    string `json:"handle,omitempty"`
}

// RegisterResponse represents a user registration response
type RegisterResponse struct {
	UserHandle string `json:"user_handle"`
	Token      string `json:"token"`
}

// handleRegister handles user registration
func HandleRegister(w http.ResponseWriter, r *http.Request) {
	log.Printf("Registration request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding registration request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.PublicKey == "" {
		http.Error(w, "public_key is required", http.StatusBadRequest)
		return
	}

	// TODO: Implement actual registration logic
	// For now, return a mock response
	log.Printf("Registering user with public key (length: %d)", len(req.PublicKey))

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	response := RegisterResponse{
		UserHandle: "user_" + req.PublicKey[:8],        // Mock handle
		Token:      "mock_token_" + req.PublicKey[:16], // Mock token
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding registration response: %v", err)
	}
}
