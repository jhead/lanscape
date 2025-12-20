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

// NewClient creates a new Headscale client
func NewClient() (*Client, error) {
	endpoint := os.Getenv("HEADSCALE_ENDPOINT")
	if endpoint == "" {
		endpoint = "http://localhost:8080"
	}

	apiKey := os.Getenv("HEADSCALE_API_KEY")

	log.Printf("Headscale client initialized with endpoint: %s", endpoint)

	return &Client{
		baseURL: endpoint,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}, nil
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
