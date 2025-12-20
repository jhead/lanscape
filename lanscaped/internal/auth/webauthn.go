package auth

import (
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/jhead/lanscape/lanscaped/internal/store"
)

// WebAuthnService handles WebAuthn operations
type WebAuthnService struct {
	webauthn *webauthn.WebAuthn
	store    *store.Store
}

// NewWebAuthnService creates a new WebAuthn service
func NewWebAuthnService(store *store.Store) (*WebAuthnService, error) {
	rpID := os.Getenv("WEBAUTHN_RP_ID")
	if rpID == "" {
		rpID = "localhost"
	}

	rpOrigin := os.Getenv("WEBAUTHN_RP_ORIGIN")
	if rpOrigin == "" {
		rpOrigin = "http://localhost:5173"
	}

	config := &webauthn.Config{
		RPDisplayName: "Lanscape",
		RPID:          rpID,
		RPOrigins:     []string{rpOrigin},
	}

	w, err := webauthn.New(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create webauthn instance: %w", err)
	}

	log.Printf("WebAuthn initialized with RP ID: %s, Origin: %s", rpID, rpOrigin)

	return &WebAuthnService{
		webauthn: w,
		store:    store,
	}, nil
}

// WebAuthnUser implements the webauthn.User interface
type WebAuthnUser struct {
	ID          []byte
	Username    string
	Credentials []webauthn.Credential
}

// WebAuthnID returns the user's ID
func (u *WebAuthnUser) WebAuthnID() []byte {
	return u.ID
}

// WebAuthnName returns the user's username
func (u *WebAuthnUser) WebAuthnName() string {
	return u.Username
}

// WebAuthnDisplayName returns the user's display name
func (u *WebAuthnUser) WebAuthnDisplayName() string {
	return u.Username
}

// WebAuthnIcon returns the user's icon (not implemented)
func (u *WebAuthnUser) WebAuthnIcon() string {
	return ""
}

// WebAuthnCredentials returns the user's credentials
func (u *WebAuthnUser) WebAuthnCredentials() []webauthn.Credential {
	return u.Credentials
}

// BeginRegistration starts a WebAuthn registration session
func (s *WebAuthnService) BeginRegistration(username string) (*webauthn.SessionData, *protocol.CredentialCreation, error) {
	// Check if user exists, if not create them
	user, err := s.store.GetUserByUsername(username)
	if err != nil {
		// User doesn't exist, create them
		user, err = s.store.CreateUser(username)
		if err != nil {
			return nil, nil, fmt.Errorf("failed to create user: %w", err)
		}
		log.Printf("Created new user: %s (ID: %d)", username, user.ID)
	} else {
		log.Printf("Found existing user: %s (ID: %d)", username, user.ID)
	}

	// Get existing credentials
	creds, err := s.store.GetCredentialsByUserID(user.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get credentials: %w", err)
	}

	// Convert to webauthn.Credential format
	webauthnCreds := make([]webauthn.Credential, len(creds))
	for i, cred := range creds {
		webauthnCreds[i] = webauthn.Credential{
			ID:        cred.CredentialID,
			PublicKey: cred.PublicKey,
			Flags: webauthn.CredentialFlags{
				BackupEligible: cred.BackupEligible,
				BackupState:    cred.BackupState,
			},
		}
	}

	webauthnUser := &WebAuthnUser{
		ID:          []byte(fmt.Sprintf("%d", user.ID)),
		Username:    user.Username,
		Credentials: webauthnCreds,
	}

	options, sessionData, err := s.webauthn.BeginRegistration(webauthnUser)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to begin registration: %w", err)
	}

	log.Printf("Started WebAuthn registration for user: %s", username)
	return sessionData, options, nil
}

// FinishRegistration completes a WebAuthn registration
func (s *WebAuthnService) FinishRegistration(username string, sessionData *webauthn.SessionData, r *http.Request) (*webauthn.Credential, error) {
	user, err := s.store.GetUserByUsername(username)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Get existing credentials
	creds, err := s.store.GetCredentialsByUserID(user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get credentials: %w", err)
	}

	webauthnCreds := make([]webauthn.Credential, len(creds))
	for i, cred := range creds {
		webauthnCreds[i] = webauthn.Credential{
			ID:        cred.CredentialID,
			PublicKey: cred.PublicKey,
			Flags: webauthn.CredentialFlags{
				BackupEligible: cred.BackupEligible,
				BackupState:    cred.BackupState,
			},
		}
	}

	webauthnUser := &WebAuthnUser{
		ID:          []byte(fmt.Sprintf("%d", user.ID)),
		Username:    user.Username,
		Credentials: webauthnCreds,
	}

	credential, err := s.webauthn.FinishRegistration(webauthnUser, *sessionData, r)
	if err != nil {
		return nil, fmt.Errorf("failed to finish registration: %w", err)
	}

	// Store the credential with flags
	_, err = s.store.CreateCredential(
		user.ID,
		credential.ID,
		credential.PublicKey,
		credential.Flags.BackupEligible,
		credential.Flags.BackupState,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to store credential: %w", err)
	}

	log.Printf("Completed WebAuthn registration for user: %s, credential ID: %s, backupEligible: %v, backupState: %v",
		username, base64.RawURLEncoding.EncodeToString(credential.ID), credential.Flags.BackupEligible, credential.Flags.BackupState)
	return credential, nil
}

// BeginLogin starts a WebAuthn login session
func (s *WebAuthnService) BeginLogin(username string) (*webauthn.SessionData, *protocol.CredentialAssertion, error) {
	user, err := s.store.GetUserByUsername(username)
	if err != nil {
		return nil, nil, fmt.Errorf("user not found: %w", err)
	}

	// Get existing credentials
	creds, err := s.store.GetCredentialsByUserID(user.ID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get credentials: %w", err)
	}

	if len(creds) == 0 {
		return nil, nil, fmt.Errorf("user has no registered credentials")
	}

	// Convert to webauthn.Credential format
	webauthnCreds := make([]webauthn.Credential, len(creds))
	for i, cred := range creds {
		webauthnCreds[i] = webauthn.Credential{
			ID:        cred.CredentialID,
			PublicKey: cred.PublicKey,
			Flags: webauthn.CredentialFlags{
				BackupEligible: cred.BackupEligible,
				BackupState:    cred.BackupState,
			},
		}
	}

	webauthnUser := &WebAuthnUser{
		ID:          []byte(fmt.Sprintf("%d", user.ID)),
		Username:    user.Username,
		Credentials: webauthnCreds,
	}

	options, sessionData, err := s.webauthn.BeginLogin(webauthnUser)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to begin login: %w", err)
	}

	log.Printf("Started WebAuthn login for user: %s", username)
	return sessionData, options, nil
}

// FinishLogin completes a WebAuthn login
func (s *WebAuthnService) FinishLogin(username string, sessionData *webauthn.SessionData, r *http.Request) (*webauthn.Credential, error) {
	user, err := s.store.GetUserByUsername(username)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	// Get existing credentials
	creds, err := s.store.GetCredentialsByUserID(user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get credentials: %w", err)
	}

	webauthnCreds := make([]webauthn.Credential, len(creds))
	for i, cred := range creds {
		log.Printf("Loading credential for login: credential ID: %s, stored backupEligible: %v, stored backupState: %v",
			base64.RawURLEncoding.EncodeToString(cred.CredentialID), cred.BackupEligible, cred.BackupState)
		webauthnCreds[i] = webauthn.Credential{
			ID:        cred.CredentialID,
			PublicKey: cred.PublicKey,
			Flags: webauthn.CredentialFlags{
				BackupEligible: cred.BackupEligible,
				BackupState:    cred.BackupState,
			},
		}
	}

	webauthnUser := &WebAuthnUser{
		ID:          []byte(fmt.Sprintf("%d", user.ID)),
		Username:    user.Username,
		Credentials: webauthnCreds,
	}

	credential, err := s.webauthn.FinishLogin(webauthnUser, *sessionData, r)
	if err != nil {
		return nil, fmt.Errorf("failed to finish login: %w", err)
	}

	log.Printf("Completed WebAuthn login for user: %s, credential ID: %s, backupEligible: %v, backupState: %v",
		username, base64.RawURLEncoding.EncodeToString(credential.ID), credential.Flags.BackupEligible, credential.Flags.BackupState)
	return credential, nil
}
