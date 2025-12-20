package store

import (
	"database/sql"
	"fmt"
	"time"
)

// User represents a user in the database
type User struct {
	ID                 int64
	Username           string
	CreatedAt          time.Time
	HeadscaleOnboarded bool
}

// CreateUser creates a new user
func (s *Store) CreateUser(username string) (*User, error) {
	result, err := s.db.Exec(
		"INSERT INTO users (username) VALUES (?)",
		username,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get user ID: %w", err)
	}

	return s.GetUserByID(id)
}

// GetUserByID retrieves a user by ID
func (s *Store) GetUserByID(id int64) (*User, error) {
	var user User
	var createdAt string
	var headscaleOnboarded int

	err := s.db.QueryRow(
		"SELECT id, username, created_at, headscale_onboarded FROM users WHERE id = ?",
		id,
	).Scan(&user.ID, &user.Username, &createdAt, &headscaleOnboarded)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	user.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	user.HeadscaleOnboarded = headscaleOnboarded != 0
	return &user, nil
}

// GetUserByUsername retrieves a user by username
func (s *Store) GetUserByUsername(username string) (*User, error) {
	var user User
	var createdAt string
	var headscaleOnboarded int

	err := s.db.QueryRow(
		"SELECT id, username, created_at, headscale_onboarded FROM users WHERE username = ?",
		username,
	).Scan(&user.ID, &user.Username, &createdAt, &headscaleOnboarded)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	user.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	user.HeadscaleOnboarded = headscaleOnboarded != 0
	return &user, nil
}

// MarkHeadscaleOnboarded marks a user as onboarded to Headscale
func (s *Store) MarkHeadscaleOnboarded(userID int64) error {
	_, err := s.db.Exec(
		"UPDATE users SET headscale_onboarded = 1 WHERE id = ?",
		userID,
	)
	if err != nil {
		return fmt.Errorf("failed to mark user as onboarded: %w", err)
	}
	return nil
}
