package routes

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/jhead/lanscape/lanscaped/internal/api/middleware"
	"github.com/jhead/lanscape/lanscaped/internal/store"
	"github.com/jhead/lanscape/lanscaped/internal/tailnet"
)

// CreateNetworkRequest represents the request to create a network
type CreateNetworkRequest struct {
	Name              string `json:"name"`
	HeadscaleEndpoint string `json:"headscale_endpoint"`
	APIKey            string `json:"api_key"`
}

// CreateNetworkResponse represents the response from creating a network
type CreateNetworkResponse struct {
	ID                int64  `json:"id"`
	Name              string `json:"name"`
	HeadscaleEndpoint string `json:"headscale_endpoint"`
	CreatedAt         string `json:"created_at"`
	// Note: API key is not returned in response for security
}

// ListNetworksResponse represents the response from listing networks
type ListNetworksResponse struct {
	Networks []NetworkResponse `json:"networks"`
}

// NetworkResponse represents a network in API responses
type NetworkResponse struct {
	ID                int64  `json:"id"`
	Name              string `json:"name"`
	HeadscaleEndpoint string `json:"headscale_endpoint"`
	CreatedAt         string `json:"created_at"`
}

// HandleCreateNetwork handles POST /v1/networks
func HandleCreateNetwork(w http.ResponseWriter, r *http.Request, store *store.Store) {
	log.Printf("Create network request from %s", r.RemoteAddr)

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

	log.Printf("Processing network creation for user: %s (ID: %d)", username, userID)

	var req CreateNetworkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.Name == "" {
		http.Error(w, "Network name is required", http.StatusBadRequest)
		return
	}
	if req.HeadscaleEndpoint == "" {
		http.Error(w, "Headscale endpoint is required", http.StatusBadRequest)
		return
	}

	// Create network
	network, err := store.CreateNetwork(req.Name, req.HeadscaleEndpoint, req.APIKey)
	if err != nil {
		log.Printf("Error creating network: %v", err)
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			http.Error(w, "Network name already exists", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to create network", http.StatusInternalServerError)
		return
	}

	log.Printf("Network created: %s (ID: %d)", network.Name, network.ID)

	// Auto-join the creator to the network
	if err := store.JoinNetwork(userID, network.ID); err != nil {
		log.Printf("Error joining user to network: %v", err)
		// Network was created but user couldn't join - this is a partial failure
		// We'll still return success but log the error
		log.Printf("Warning: Network created but user %s (ID: %d) could not be auto-joined", username, userID)
	}

	// Auto-provision user in the network's headscale
	// Use the network-specific API key
	headscaleClient := tailnet.NewClientWithEndpoint(network.HeadscaleEndpoint, network.APIKey)
	log.Printf("Auto-provisioning user %s in Headscale endpoint: %s", username, network.HeadscaleEndpoint)
	_, err = headscaleClient.CreateUser(username)
	if err != nil {
		log.Printf("Error auto-provisioning user in Headscale: %v", err)
		// Log but don't fail - user can be provisioned later
		log.Printf("Warning: User %s could not be auto-provisioned in Headscale for network %s", username, network.Name)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)

	response := CreateNetworkResponse{
		ID:                network.ID,
		Name:              network.Name,
		HeadscaleEndpoint: network.HeadscaleEndpoint,
		CreatedAt:         network.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}

// HandleListNetworks handles GET /v1/networks
func HandleListNetworks(w http.ResponseWriter, r *http.Request, store *store.Store) {
	log.Printf("List networks request from %s", r.RemoteAddr)

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract JWT claims from context
	_, ok := middleware.GetClaimsFromContext(r)
	if !ok {
		log.Printf("Failed to extract JWT claims from context")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// List all networks
	networks, err := store.ListNetworks()
	if err != nil {
		log.Printf("Error listing networks: %v", err)
		http.Error(w, "Failed to list networks", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	networkResponses := make([]NetworkResponse, len(networks))
	for i, network := range networks {
		networkResponses[i] = NetworkResponse{
			ID:                network.ID,
			Name:              network.Name,
			HeadscaleEndpoint: network.HeadscaleEndpoint,
			CreatedAt:         network.CreatedAt.Format("2006-01-02T15:04:05Z"),
		}
	}

	response := ListNetworksResponse{
		Networks: networkResponses,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}

// HandleJoinNetwork handles PUT /v1/networks/:id/join
func HandleJoinNetwork(w http.ResponseWriter, r *http.Request, store *store.Store) {
	log.Printf("Join network request from %s", r.RemoteAddr)

	if r.Method != http.MethodPut {
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

	// Extract network ID from URL path variable
	idStr := r.PathValue("id")
	if idStr == "" {
		http.Error(w, "Network ID is required", http.StatusBadRequest)
		return
	}

	networkID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid network ID", http.StatusBadRequest)
		return
	}

	log.Printf("Processing network join for user: %s (ID: %d) to network ID: %d", username, userID, networkID)

	// Check if network exists
	network, err := store.GetNetworkByID(networkID)
	if err != nil {
		log.Printf("Error fetching network: %v", err)
		http.Error(w, "Network not found", http.StatusNotFound)
		return
	}

	// Join network
	if err := store.JoinNetwork(userID, networkID); err != nil {
		log.Printf("Error joining network: %v", err)
		if strings.Contains(err.Error(), "already a member") {
			http.Error(w, "User is already a member of this network", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to join network", http.StatusInternalServerError)
		return
	}

	log.Printf("User %s (ID: %d) joined network %s (ID: %d)", username, userID, network.Name, networkID)

	// Auto-provision user in the network's headscale
	// Use the network-specific API key
	headscaleClient := tailnet.NewClientWithEndpoint(network.HeadscaleEndpoint, network.APIKey)
	log.Printf("Auto-provisioning user %s in Headscale endpoint: %s", username, network.HeadscaleEndpoint)
	_, err = headscaleClient.CreateUser(username)
	if err != nil {
		log.Printf("Error auto-provisioning user in Headscale: %v", err)
		// Log but don't fail - user can be provisioned later
		log.Printf("Warning: User %s could not be auto-provisioned in Headscale for network %s", username, network.Name)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := map[string]interface{}{
		"success":    true,
		"message":    "Successfully joined network",
		"network_id": networkID,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}

// HandleDeleteNetwork handles DELETE /v1/networks/:id
func HandleDeleteNetwork(w http.ResponseWriter, r *http.Request, store *store.Store) {
	log.Printf("Delete network request from %s", r.RemoteAddr)

	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract JWT claims from context
	_, ok := middleware.GetClaimsFromContext(r)
	if !ok {
		log.Printf("Failed to extract JWT claims from context")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Extract network ID from URL path variable
	idStr := r.PathValue("id")
	if idStr == "" {
		http.Error(w, "Network ID is required", http.StatusBadRequest)
		return
	}

	networkID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid network ID", http.StatusBadRequest)
		return
	}

	log.Printf("Processing network deletion for network ID: %d", networkID)

	// Delete network
	if err := store.DeleteNetwork(networkID); err != nil {
		log.Printf("Error deleting network: %v", err)
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Network not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete network", http.StatusInternalServerError)
		return
	}

	log.Printf("Network ID %d deleted successfully", networkID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := map[string]interface{}{
		"success":    true,
		"message":    "Network deleted successfully",
		"network_id": networkID,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}
