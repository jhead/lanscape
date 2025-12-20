package store

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

// Store represents the database store
type Store struct {
	db *sql.DB
}

// NewStore creates a new database store
func NewStore() (*Store, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "file:lanscaped.db?_foreign_keys=on"
	}

	db, err := sql.Open("sqlite3", dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &Store{db: db}

	if err := store.migrate(); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	log.Println("Database initialized successfully")
	return store, nil
}

// Close closes the database connection
func (s *Store) Close() error {
	return s.db.Close()
}

// migrate runs database migrations
func (s *Store) migrate() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS webauthn_credentials (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			credential_id BLOB NOT NULL UNIQUE,
			public_key BLOB NOT NULL,
			counter INTEGER NOT NULL DEFAULT 0,
			backup_eligible INTEGER NOT NULL DEFAULT 0,
			backup_state INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS webauthn_sessions (
			id TEXT PRIMARY KEY,
			username TEXT NOT NULL,
			session_data BLOB NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			expires_at DATETIME NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON webauthn_credentials(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id)`,
		`CREATE INDEX IF NOT EXISTS idx_webauthn_sessions_expires_at ON webauthn_sessions(expires_at)`,
		`CREATE TABLE IF NOT EXISTS networks (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE,
			headscale_endpoint TEXT NOT NULL,
			api_key TEXT,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS memberships (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			network_id INTEGER NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, network_id),
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY (network_id) REFERENCES networks(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_memberships_network_id ON memberships(network_id)`,
	}

	for _, query := range queries {
		if _, err := s.db.Exec(query); err != nil {
			return fmt.Errorf("failed to execute migration: %w", err)
		}
	}

	// Migrate existing webauthn_credentials table to add backup flags if they don't exist
	// SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS, so we check first
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('webauthn_credentials') WHERE name='backup_eligible'").Scan(&count)
	if err == nil && count == 0 {
		log.Println("Adding backup_eligible and backup_state columns to webauthn_credentials table")
		if _, err := s.db.Exec("ALTER TABLE webauthn_credentials ADD COLUMN backup_eligible INTEGER NOT NULL DEFAULT 0"); err != nil {
			// Column might already exist, log but don't fail
			log.Printf("Note: backup_eligible column migration: %v", err)
		}
		if _, err := s.db.Exec("ALTER TABLE webauthn_credentials ADD COLUMN backup_state INTEGER NOT NULL DEFAULT 0"); err != nil {
			// Column might already exist, log but don't fail
			log.Printf("Note: backup_state column migration: %v", err)
		}
	}

	// Migrate networks table to add api_key column if it doesn't exist
	var networkCount int
	err = s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('networks') WHERE name='api_key'").Scan(&networkCount)
	if err == nil && networkCount == 0 {
		log.Println("Adding api_key column to networks table")
		if _, err := s.db.Exec("ALTER TABLE networks ADD COLUMN api_key TEXT"); err != nil {
			// Column might already exist, log but don't fail
			log.Printf("Note: api_key column migration: %v", err)
		}
	}

	log.Println("Database migrations completed")
	return nil
}

// DB returns the underlying database connection
func (s *Store) DB() *sql.DB {
	return s.db
}
