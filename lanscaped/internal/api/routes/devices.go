package routes

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jhead/lanscape/lanscaped/internal/api/middleware"
	"github.com/jhead/lanscape/lanscaped/internal/store"
	"github.com/jhead/lanscape/lanscaped/internal/tailnet"
)

// AdoptDeviceRequest represents a device adoption request
type AdoptDeviceRequest struct {
	NetworkID int64  `json:"network_id"`
	Name      string `json:"name,omitempty"`
	Platform  string `json:"platform,omitempty"`
}

// AdoptDeviceResponse represents a device adoption response
type AdoptDeviceResponse struct {
	PreauthKey        string `json:"preauth_key"`
	HeadscaleEndpoint string `json:"headscale_endpoint"`
}

// HandleAdoptDevice handles device adoption
func HandleAdoptDevice(w http.ResponseWriter, r *http.Request, store *store.Store) {
	log.Printf("Device adoption request from %s", r.RemoteAddr)

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

	var req AdoptDeviceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding device adoption request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.NetworkID == 0 {
		http.Error(w, "network_id is required", http.StatusBadRequest)
		return
	}

	log.Printf("Processing device adoption for user: %s (ID: %d) in network ID: %d", username, userID, req.NetworkID)

	// Check if network exists
	network, err := store.GetNetworkByID(req.NetworkID)
	if err != nil {
		log.Printf("Error fetching network: %v", err)
		http.Error(w, "Network not found", http.StatusNotFound)
		return
	}

	// Check if user is a member of the network
	isMember, err := store.IsUserInNetwork(userID, req.NetworkID)
	if err != nil {
		log.Printf("Error checking network membership: %v", err)
		http.Error(w, "Failed to verify network membership", http.StatusInternalServerError)
		return
	}

	if !isMember {
		log.Printf("User %s (ID: %d) is not a member of network %s (ID: %d)", username, userID, network.Name, req.NetworkID)
		http.Error(w, "You must be a member of this network to add devices", http.StatusForbidden)
		return
	}

	// Create Headscale client for this network
	headscaleClient := tailnet.NewClientWithEndpoint(network.HeadscaleEndpoint, network.APIKey)

	// Ensure user exists in Headscale (create if not exists)
	log.Printf("Ensuring user %s exists in Headscale endpoint: %s", username, network.HeadscaleEndpoint)
	_, err = headscaleClient.CreateUser(username)
	if err != nil {
		log.Printf("Error ensuring user exists in Headscale: %v", err)
		// Continue anyway - user might already exist
	}

	// Get user from Headscale to retrieve the user ID
	log.Printf("Retrieving user %s from Headscale to get user ID", username)
	userResp, err := headscaleClient.GetUser(username)
	if err != nil {
		log.Printf("Error retrieving user from Headscale: %v", err)
		http.Error(w, "Failed to retrieve user from Headscale: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Convert user ID string to uint64
	headscaleUserID, err := strconv.ParseUint(userResp.ID, 10, 64)
	if err != nil {
		log.Printf("Error parsing user ID: %v", err)
		http.Error(w, "Failed to parse user ID: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Retrieved user ID %d for user %s", headscaleUserID, username)

	// Create preauth key in Headscale
	// Set expiration to 24 hours from now
	expiration := time.Now().Add(24 * time.Hour)
	preauthResp, err := headscaleClient.CreatePreauthKey(headscaleUserID, false, false, &expiration)
	if err != nil {
		log.Printf("Error creating preauth key in Headscale: %v", err)
		http.Error(w, "Failed to create preauth key: "+err.Error(), http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully created preauth key for user %s in network %s", username, network.Name)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	response := AdoptDeviceResponse{
		PreauthKey:        preauthResp.PreAuthKey.Key,
		HeadscaleEndpoint: network.HeadscaleEndpoint,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding device adoption response: %v", err)
	}
}
