package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
)

// Session represents a WebAuthn session in the database
type Session struct {
	ID        string
	Username  string
	Data      *webauthn.SessionData
	CreatedAt time.Time
	ExpiresAt time.Time
}

// CreateSession creates a new session
func (s *Store) CreateSession(sessionID, username string, sessionData *webauthn.SessionData, expiresAt time.Time) error {
	// Serialize session data to JSON
	dataJSON, err := json.Marshal(sessionData)
	if err != nil {
		return fmt.Errorf("failed to marshal session data: %w", err)
	}

	_, err = s.db.Exec(
		"INSERT INTO webauthn_sessions (id, username, session_data, expires_at) VALUES (?, ?, ?, ?)",
		sessionID, username, dataJSON, expiresAt,
	)
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}

	log.Printf("Created session %s for user %s, expires at %v", sessionID, username, expiresAt)
	return nil
}

// GetSession retrieves a session by ID
func (s *Store) GetSession(sessionID string) (*Session, error) {
	var session Session
	var dataJSON []byte
	var createdAt, expiresAt string

	err := s.db.QueryRow(
		"SELECT id, username, session_data, created_at, expires_at FROM webauthn_sessions WHERE id = ?",
		sessionID,
	).Scan(&session.ID, &session.Username, &dataJSON, &createdAt, &expiresAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("session not found")
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}

	// Parse expiration time (SQLite stores as datetime string)
	var parseErr error
	session.ExpiresAt, parseErr = time.Parse("2006-01-02 15:04:05", expiresAt)
	if parseErr != nil {
		// Try with timezone format
		session.ExpiresAt, parseErr = time.Parse(time.RFC3339, expiresAt)
		if parseErr != nil {
			return nil, fmt.Errorf("failed to parse expiration time: %w", parseErr)
		}
	}

	// Check if session is expired
	if time.Now().After(session.ExpiresAt) {
		// Delete expired session
		_ = s.DeleteSession(sessionID)
		return nil, fmt.Errorf("session expired")
	}

	// Deserialize session data
	session.Data = &webauthn.SessionData{}
	if err := json.Unmarshal(dataJSON, session.Data); err != nil {
		return nil, fmt.Errorf("failed to unmarshal session data: %w", err)
	}

	session.CreatedAt, parseErr = time.Parse("2006-01-02 15:04:05", createdAt)
	if parseErr != nil {
		// Try with timezone format
		session.CreatedAt, parseErr = time.Parse(time.RFC3339, createdAt)
		if parseErr != nil {
			// If parsing fails, just use current time
			session.CreatedAt = time.Now()
		}
	}
	return &session, nil
}

// DeleteSession deletes a session by ID
func (s *Store) DeleteSession(sessionID string) error {
	result, err := s.db.Exec("DELETE FROM webauthn_sessions WHERE id = ?", sessionID)
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("Deleted session %s", sessionID)
	}
	return nil
}

// CleanupExpiredSessions removes all expired sessions
func (s *Store) CleanupExpiredSessions() error {
	result, err := s.db.Exec("DELETE FROM webauthn_sessions WHERE expires_at < ?", time.Now())
	if err != nil {
		return fmt.Errorf("failed to cleanup expired sessions: %w", err)
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		log.Printf("Cleaned up %d expired session(s)", rowsAffected)
	}
	return nil
}
