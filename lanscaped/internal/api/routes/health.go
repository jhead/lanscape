package routes

import (
	"encoding/json"
	"log"
	"net/http"
)

// handleHealthz handles the health check endpoint
func HandleHealthz(w http.ResponseWriter, r *http.Request) {
	log.Printf("Health check requested from %s", r.RemoteAddr)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := map[string]string{
		"status": "ok",
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding health check response: %v", err)
	}
}
