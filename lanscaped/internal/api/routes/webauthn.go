package routes

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/jhead/lanscape/lanscaped/internal/auth"
	"github.com/jhead/lanscape/lanscaped/internal/store"
)

// BeginRegistrationRequest represents a request to begin WebAuthn registration
type BeginRegistrationRequest struct {
	Username string `json:"username"`
}

// BeginRegistrationResponse represents the response from beginning registration
type BeginRegistrationResponse struct {
	Options map[string]interface{} `json:"options"`
	Session string                 `json:"session"`
}

// FinishRegistrationRequest represents a request to finish WebAuthn registration
type FinishRegistrationRequest struct {
	Username string          `json:"username"`
	Session  string          `json:"session"`
	Response json.RawMessage `json:"response"`
}

// FinishRegistrationResponse represents the response from finishing registration
type FinishRegistrationResponse struct {
	Success  bool   `json:"success"`
	Message  string `json:"message,omitempty"`
	UserID   string `json:"user_id,omitempty"`
	Username string `json:"username,omitempty"`
	Token    string `json:"token,omitempty"`
}

// BeginLoginRequest represents a request to begin WebAuthn login
type BeginLoginRequest struct {
	Username string `json:"username"`
}

// BeginLoginResponse represents the response from beginning login
type BeginLoginResponse struct {
	Options map[string]interface{} `json:"options"`
	Session string                 `json:"session"`
}

// FinishLoginRequest represents a request to finish WebAuthn login
type FinishLoginRequest struct {
	Username string          `json:"username"`
	Session  string          `json:"session"`
	Response json.RawMessage `json:"response"`
}

// FinishLoginResponse represents the response from finishing login
type FinishLoginResponse struct {
	Success  bool   `json:"success"`
	Message  string `json:"message,omitempty"`
	Username string `json:"username,omitempty"`
	Token    string `json:"token,omitempty"`
}

// HandleBeginRegistration handles the beginning of WebAuthn registration
func HandleBeginRegistration(w http.ResponseWriter, r *http.Request, webauthnService *auth.WebAuthnService, dbStore *store.Store) {
	log.Printf("Begin registration request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BeginRegistrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding begin registration request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}

	sessionData, options, err := webauthnService.BeginRegistration(req.Username)
	if err != nil {
		log.Printf("Error beginning registration: %v", err)
		http.Error(w, "Failed to begin registration", http.StatusInternalServerError)
		return
	}

	// Store session data in database with a unique ID
	sessionID := base64.RawURLEncoding.EncodeToString([]byte(req.Username + time.Now().String()))
	expiresAt := time.Now().Add(5 * time.Minute) // Sessions expire after 5 minutes

	if err := dbStore.CreateSession(sessionID, req.Username, sessionData, expiresAt); err != nil {
		log.Printf("Error creating session: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Convert options to JSON-serializable format
	optionsJSON, err := json.Marshal(options)
	if err != nil {
		log.Printf("Error marshaling options: %v", err)
		http.Error(w, "Failed to prepare registration options", http.StatusInternalServerError)
		return
	}

	var optionsMap map[string]interface{}
	if err := json.Unmarshal(optionsJSON, &optionsMap); err != nil {
		log.Printf("Error unmarshaling options: %v", err)
		http.Error(w, "Failed to prepare registration options", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := BeginRegistrationResponse{
		Options: optionsMap,
		Session: sessionID,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding begin registration response: %v", err)
	}
}

// HandleFinishRegistration handles the completion of WebAuthn registration
func HandleFinishRegistration(w http.ResponseWriter, r *http.Request, webauthnService *auth.WebAuthnService, dbStore *store.Store, jwtService *auth.JWTService) {
	log.Printf("Finish registration request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Read the body to extract username and session
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading request body: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var req FinishRegistrationRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		log.Printf("Error decoding finish registration request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}

	if req.Session == "" {
		http.Error(w, "session is required", http.StatusBadRequest)
		return
	}

	// Retrieve session data from database
	session, err := dbStore.GetSession(req.Session)
	if err != nil {
		log.Printf("Session not found or expired: %s, error: %v", req.Session, err)
		http.Error(w, "Invalid or expired session", http.StatusBadRequest)
		return
	}

	// Verify username matches session
	if session.Username != req.Username {
		log.Printf("Username mismatch: session has %s, request has %s", session.Username, req.Username)
		http.Error(w, "Username mismatch", http.StatusBadRequest)
		return
	}

	// Reconstruct the request body with just the response field for the library
	// The library expects the credential creation response in the request body
	// The response field contains the full credential creation response
	newReq, err := http.NewRequest("POST", r.URL.String(), bytes.NewReader(req.Response))
	if err != nil {
		log.Printf("Error creating request: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	newReq.Header.Set("Content-Type", "application/json")

	// Remove session after use
	if err := dbStore.DeleteSession(req.Session); err != nil {
		log.Printf("Error deleting session: %v", err)
		// Continue anyway as the session is already consumed
	}

	credential, err := webauthnService.FinishRegistration(req.Username, session.Data, newReq)
	if err != nil {
		log.Printf("Error finishing registration: %v", err)
		http.Error(w, "Failed to finish registration: "+err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("Registration completed successfully for user: %s, credential ID: %s", req.Username, base64.RawURLEncoding.EncodeToString(credential.ID))

	// Get user to generate JWT token
	user, err := dbStore.GetUserByUsername(req.Username)
	if err != nil {
		log.Printf("Error getting user for JWT generation: %v", err)
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Generate JWT token without JID (network-specific tokens are minted on-demand)
	// Empty JID for initial login token - network-specific tokens are generated when connecting
	token, err := jwtService.GenerateToken(user.ID, user.Username, "")
	if err != nil {
		log.Printf("Error generating JWT token: %v", err)
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Set JWT token in cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "jwt",
		Value:    token,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false, // Set to true in production with HTTPS
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := FinishRegistrationResponse{
		Success:  true,
		Message:  "Registration completed successfully",
		Username: req.Username,
		UserID:   strconv.FormatInt(user.ID, 10),
		Token:    token,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding finish registration response: %v", err)
	}
}

// HandleBeginLogin handles the beginning of WebAuthn login
func HandleBeginLogin(w http.ResponseWriter, r *http.Request, webauthnService *auth.WebAuthnService, dbStore *store.Store) {
	log.Printf("Begin login request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BeginLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding begin login request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}

	sessionData, options, err := webauthnService.BeginLogin(req.Username)
	if err != nil {
		log.Printf("Error beginning login: %v", err)
		http.Error(w, "Failed to begin login: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Store session data in database with a unique ID
	sessionID := base64.RawURLEncoding.EncodeToString([]byte(req.Username + time.Now().String()))
	expiresAt := time.Now().Add(5 * time.Minute) // Sessions expire after 5 minutes

	if err := dbStore.CreateSession(sessionID, req.Username, sessionData, expiresAt); err != nil {
		log.Printf("Error creating session: %v", err)
		http.Error(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	// Convert options to JSON-serializable format
	optionsJSON, err := json.Marshal(options)
	if err != nil {
		log.Printf("Error marshaling options: %v", err)
		http.Error(w, "Failed to prepare login options", http.StatusInternalServerError)
		return
	}

	var optionsMap map[string]interface{}
	if err := json.Unmarshal(optionsJSON, &optionsMap); err != nil {
		log.Printf("Error unmarshaling options: %v", err)
		http.Error(w, "Failed to prepare login options", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := BeginLoginResponse{
		Options: optionsMap,
		Session: sessionID,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding begin login response: %v", err)
	}
}

// HandleFinishLogin handles the completion of WebAuthn login
func HandleFinishLogin(w http.ResponseWriter, r *http.Request, webauthnService *auth.WebAuthnService, dbStore *store.Store, jwtService *auth.JWTService) {
	log.Printf("Finish login request from %s", r.RemoteAddr)

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Read the body to extract username and session
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading request body: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	var req FinishLoginRequest
	if err := json.Unmarshal(bodyBytes, &req); err != nil {
		log.Printf("Error decoding finish login request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}

	if req.Session == "" {
		http.Error(w, "session is required", http.StatusBadRequest)
		return
	}

	// Retrieve session data from database
	session, err := dbStore.GetSession(req.Session)
	if err != nil {
		log.Printf("Session not found or expired: %s, error: %v", req.Session, err)
		http.Error(w, "Invalid or expired session", http.StatusBadRequest)
		return
	}

	// Verify username matches session
	if session.Username != req.Username {
		log.Printf("Username mismatch: session has %s, request has %s", session.Username, req.Username)
		http.Error(w, "Username mismatch", http.StatusBadRequest)
		return
	}

	// Reconstruct the request body with just the response field for the library
	newReq, err := http.NewRequest("POST", r.URL.String(), bytes.NewReader(req.Response))
	if err != nil {
		log.Printf("Error creating request: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	newReq.Header.Set("Content-Type", "application/json")

	// Remove session after use
	if err := dbStore.DeleteSession(req.Session); err != nil {
		log.Printf("Error deleting session: %v", err)
		// Continue anyway as the session is already consumed
	}

	credential, err := webauthnService.FinishLogin(req.Username, session.Data, newReq)
	if err != nil {
		log.Printf("Error finishing login: %v", err)
		http.Error(w, "Failed to finish login: "+err.Error(), http.StatusBadRequest)
		return
	}

	log.Printf("Login completed successfully for user: %s, credential ID: %s", req.Username, base64.RawURLEncoding.EncodeToString(credential.ID))

	// Get user to generate JWT token
	user, err := dbStore.GetUserByUsername(req.Username)
	if err != nil {
		log.Printf("Error getting user for JWT generation: %v", err)
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Generate JWT token without JID (network-specific tokens are minted on-demand)
	// Empty JID for initial login token - network-specific tokens are generated when connecting
	token, err := jwtService.GenerateToken(user.ID, user.Username, "")
	if err != nil {
		log.Printf("Error generating JWT token: %v", err)
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Set JWT token in cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "jwt",
		Value:    token,
		Path:     "/",
		MaxAge:   86400, // 24 hours
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   false, // Set to true in production with HTTPS
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := FinishLoginResponse{
		Success:  true,
		Message:  "Login completed successfully",
		Username: req.Username,
		Token:    token,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding finish login response: %v", err)
	}
}
