package routes

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/jhead/lanscape/lanscaped/internal/api/middleware"
	"github.com/jhead/lanscape/lanscaped/internal/store"
	"github.com/jhead/lanscape/lanscaped/internal/tailnet"
)

// OnboardHeadscaleResponse represents the response from the headscale onboarding endpoint
type OnboardHeadscaleResponse struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	Onboarded bool   `json:"onboarded"`
}

// HandleOnboardHeadscale handles the headscale onboarding endpoint
func HandleOnboardHeadscale(w http.ResponseWriter, r *http.Request, store *store.Store, headscaleClient *tailnet.Client) {
	log.Printf("Headscale onboarding request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract JWT claims from context
	claims, ok := middleware.GetClaimsFromContext(r)
	if !ok {
		log.Printf("Failed to extract JWT claims from context")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	userID := claims.UserID
	username := claims.Username

	log.Printf("Processing headscale onboarding for user: %s (ID: %d)", username, userID)

	// Get user from database
	user, err := store.GetUserByID(userID)
	if err != nil {
		log.Printf("Error fetching user: %v", err)
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Check if user is already onboarded
	if user.HeadscaleOnboarded {
		log.Printf("User %s (ID: %d) is already onboarded to Headscale", username, userID)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)

		response := OnboardHeadscaleResponse{
			Success:   true,
			Message:   "User is already onboarded to Headscale",
			Onboarded: true,
		}

		if err := json.NewEncoder(w).Encode(response); err != nil {
			log.Printf("Error encoding response: %v", err)
		}
		return
	}

	// Create user in Headscale
	log.Printf("Creating user %s in Headscale", username)
	_, err = headscaleClient.CreateUser(username)
	if err != nil {
		log.Printf("Error creating user in Headscale: %v", err)
		http.Error(w, "Failed to create user in Headscale", http.StatusInternalServerError)
		return
	}

	// Mark user as onboarded in database
	if err := store.MarkHeadscaleOnboarded(userID); err != nil {
		log.Printf("Error marking user as onboarded: %v", err)
		// User was created in Headscale but we failed to update DB
		// This is a partial success, but we should still return an error
		http.Error(w, "User created in Headscale but failed to update database", http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully onboarded user %s (ID: %d) to Headscale", username, userID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := OnboardHeadscaleResponse{
		Success:   true,
		Message:   "User successfully onboarded to Headscale",
		Onboarded: true,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}
