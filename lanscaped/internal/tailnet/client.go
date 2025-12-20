package tailnet

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// Client represents a Headscale REST API client
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new Headscale client with default endpoint from environment
func NewClient() (*Client, error) {
	endpoint := os.Getenv("HEADSCALE_ENDPOINT")
	if endpoint == "" {
		endpoint = "http://localhost:8080"
	}

	apiKey := os.Getenv("HEADSCALE_API_KEY")

	log.Printf("Headscale client initialized with endpoint: %s", endpoint)

	return NewClientWithEndpoint(endpoint, apiKey), nil
}

// NewClientWithEndpoint creates a new Headscale client with a specific endpoint
func NewClientWithEndpoint(endpoint, apiKey string) *Client {
	log.Printf("Headscale client initialized with endpoint: %s", endpoint)
	return &Client{
		baseURL: endpoint,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// CreateUserRequest represents the request to create a user in Headscale
type CreateUserRequest struct {
	Name string `json:"name"`
}

// CreateUserResponse represents the response from creating a user
type CreateUserResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// HeadscaleUserResponse represents the nested user response from Headscale
type HeadscaleUserResponse struct {
	User struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		CreatedAt   string `json:"createdAt,omitempty"`
		DisplayName string `json:"displayName,omitempty"`
		Email       string `json:"email,omitempty"`
	} `json:"user"`
}

// HeadscaleUsersListResponse represents the response from listing users (with name filter)
type HeadscaleUsersListResponse struct {
	Users []struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		CreatedAt   string `json:"createdAt,omitempty"`
		DisplayName string `json:"displayName,omitempty"`
		Email       string `json:"email,omitempty"`
	} `json:"users"`
}

// CreateUser creates a new user in Headscale
func (c *Client) CreateUser(username string) (*CreateUserResponse, error) {
	url := fmt.Sprintf("%s/api/v1/user", c.baseURL)

	reqBody := CreateUserRequest{
		Name: username,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	}

	log.Printf("Creating user in Headscale: %s", username)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Headscale returns 200 OK or 201 Created for successful user creation
	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		// Try to parse as nested user response first
		var nestedResp HeadscaleUserResponse
		if err := json.Unmarshal(body, &nestedResp); err == nil && nestedResp.User.Name != "" {
			log.Printf("Successfully created user in Headscale: %s (ID: %s)", username, nestedResp.User.ID)
			return &CreateUserResponse{
				ID:   nestedResp.User.ID,
				Name: nestedResp.User.Name,
			}, nil
		}

		// Fallback to flat response structure
		var userResp CreateUserResponse
		if err := json.Unmarshal(body, &userResp); err != nil {
			return nil, fmt.Errorf("failed to unmarshal response: %w", err)
		}
		log.Printf("Successfully created user in Headscale: %s (ID: %s)", username, userResp.ID)
		return &userResp, nil
	}

	if resp.StatusCode == http.StatusConflict {
		log.Printf("User already exists in Headscale: %s", username)
		// User already exists, return a success response
		return &CreateUserResponse{
			Name: username,
		}, nil
	}

	return nil, fmt.Errorf("headscale API error: status %d, body: %s", resp.StatusCode, string(body))
}

// GetUser retrieves a user by name from Headscale
func (c *Client) GetUser(username string) (*CreateUserResponse, error) {
	url := fmt.Sprintf("%s/api/v1/user?name=%s", c.baseURL, username)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	}

	log.Printf("Getting user from Headscale: %s", username)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode == http.StatusOK {
		// Try to parse as users list response (most common format)
		var usersListResp HeadscaleUsersListResponse
		if err := json.Unmarshal(body, &usersListResp); err == nil && len(usersListResp.Users) > 0 {
			user := usersListResp.Users[0]
			if user.ID == "" {
				log.Printf("Warning: User ID is empty in users list response")
				return nil, fmt.Errorf("user ID is empty in Headscale response")
			}
			log.Printf("Successfully retrieved user from Headscale: %s (ID: %s)", username, user.ID)
			return &CreateUserResponse{
				ID:   user.ID,
				Name: user.Name,
			}, nil
		}

		// Try to parse as nested user response
		var nestedResp HeadscaleUserResponse
		if err := json.Unmarshal(body, &nestedResp); err == nil && nestedResp.User.Name != "" {
			if nestedResp.User.ID == "" {
				log.Printf("Warning: User ID is empty in nested response")
				return nil, fmt.Errorf("user ID is empty in Headscale response")
			}
			log.Printf("Successfully retrieved user from Headscale: %s (ID: %s)", username, nestedResp.User.ID)
			return &CreateUserResponse{
				ID:   nestedResp.User.ID,
				Name: nestedResp.User.Name,
			}, nil
		}

		// Fallback to flat response structure
		var userResp CreateUserResponse
		if err := json.Unmarshal(body, &userResp); err != nil {
			log.Printf("Failed to parse response, body: %s", string(body))
			return nil, fmt.Errorf("failed to unmarshal response: %w", err)
		}
		if userResp.ID == "" {
			log.Printf("Warning: User ID is empty in flat response, body: %s", string(body))
			return nil, fmt.Errorf("user ID is empty in Headscale response")
		}
		log.Printf("Successfully retrieved user from Headscale: %s (ID: %s)", username, userResp.ID)
		return &userResp, nil
	}

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("user not found: %s", username)
	}

	return nil, fmt.Errorf("headscale API error: status %d, body: %s", resp.StatusCode, string(body))
}

// CreatePreauthKeyRequest represents the request to create a preauth key in Headscale
type CreatePreauthKeyRequest struct {
	User       uint64 `json:"user"`
	Reusable   bool   `json:"reusable,omitempty"`
	Ephemeral  bool   `json:"ephemeral,omitempty"`
	Expiration string `json:"expiration,omitempty"`
}

// CreatePreauthKeyResponse represents the response from creating a preauth key
type CreatePreauthKeyResponse struct {
	PreAuthKey struct {
		Key  string `json:"key"`
		User struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"user"`
		Reusable   bool   `json:"reusable"`
		Ephemeral  bool   `json:"ephemeral"`
		Expiration string `json:"expiration"`
	} `json:"preAuthKey"`
}

// CreatePreauthKey creates a new preauth key in Headscale for a user by user ID
func (c *Client) CreatePreauthKey(userID uint64, reusable bool, ephemeral bool, expiration *time.Time) (*CreatePreauthKeyResponse, error) {
	url := fmt.Sprintf("%s/api/v1/preauthkey", c.baseURL)

	reqBody := CreatePreauthKeyRequest{
		User:      userID,
		Reusable:  reusable,
		Ephemeral: ephemeral,
	}

	if expiration != nil {
		reqBody.Expiration = expiration.Format(time.RFC3339)
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
	}

	log.Printf("Creating preauth key in Headscale for user ID: %d (reusable: %v, ephemeral: %v)", userID, reusable, ephemeral)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		var preauthResp CreatePreauthKeyResponse
		if err := json.Unmarshal(body, &preauthResp); err != nil {
			log.Printf("Failed to unmarshal preauth key response: %v", err)
			return nil, fmt.Errorf("failed to unmarshal response: %w", err)
		}
		if preauthResp.PreAuthKey.Key == "" {
			log.Printf("Warning: Preauth key is empty in response")
			return nil, fmt.Errorf("preauth key is empty in Headscale response")
		}
		log.Printf("Successfully created preauth key in Headscale for user ID: %d", userID)
		return &preauthResp, nil
	}

	return nil, fmt.Errorf("headscale API error: status %d, body: %s", resp.StatusCode, string(body))
}
