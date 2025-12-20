package routes

import (
	"encoding/json"
	"log"
	"net/http"
)

// AdoptDeviceRequest represents a device adoption request
type AdoptDeviceRequest struct {
	Name     string `json:"name"`
	Platform string `json:"platform,omitempty"`
}

// AdoptDeviceResponse represents a device adoption response
type AdoptDeviceResponse struct {
	DeviceID   string `json:"device_id"`
	PreauthKey string `json:"preauth_key"`
	ExpiresAt  string `json:"expires_at,omitempty"`
}

// handleAdoptDevice handles device adoption
func HandleAdoptDevice(w http.ResponseWriter, r *http.Request) {
	log.Printf("Device adoption request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// TODO: Implement authentication middleware
	// For now, check for Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		log.Printf("Device adoption request without authorization")
		http.Error(w, "Authorization required", http.StatusUnauthorized)
		return
	}

	var req AdoptDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding device adoption request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	// TODO: Implement actual device adoption logic
	log.Printf("Adopting device: %s (platform: %s)", req.Name, req.Platform)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	response := AdoptDeviceResponse{
		DeviceID:   "device_" + req.Name,
		PreauthKey: "mock_preauth_key_" + req.Name,
		ExpiresAt:  "2024-12-31T23:59:59Z",
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding device adoption response: %v", err)
	}
}
