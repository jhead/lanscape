package routes

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jhead/lanscape/lanscaped/internal/api/middleware"
)

// MeResponse represents the /v1/me endpoint response
type MeResponse struct {
	UserHandle string   `json:"user_handle"`
	Devices    []string `json:"devices,omitempty"`
}

// HandleMe handles the /v1/me introspection endpoint
// This endpoint is protected by JWT middleware, so we can extract user info from the token
func HandleMe(w http.ResponseWriter, r *http.Request) {
	log.Printf("Me request from %s", r.RemoteAddr)

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Get JWT claims from context (set by JWT middleware)
	claims, ok := middleware.GetClaimsFromContext(r)
	if !ok {
		log.Printf("Me request without valid JWT claims")
		http.Error(w, "Authorization required", http.StatusUnauthorized)
		return
	}

	log.Printf("Returning user info for user: %s (ID: %d)", claims.Username, claims.UserID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := MeResponse{
		UserHandle: claims.Username,
		Devices:    []string{}, // TODO: Fetch actual devices from store if needed
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding me response: %v", err)
	}
}
