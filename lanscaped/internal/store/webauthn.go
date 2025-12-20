package store

import (
	"database/sql"
	"fmt"
)

// WebAuthnCredential represents a WebAuthn credential in the database
type WebAuthnCredential struct {
	ID             int64
	UserID         int64
	CredentialID   []byte
	PublicKey      []byte
	Counter        uint32
	BackupEligible bool
	BackupState    bool
}

// CreateCredential creates a new WebAuthn credential
func (s *Store) CreateCredential(userID int64, credentialID, publicKey []byte, backupEligible, backupState bool) (*WebAuthnCredential, error) {
	backupEligibleInt := 0
	if backupEligible {
		backupEligibleInt = 1
	}
	backupStateInt := 0
	if backupState {
		backupStateInt = 1
	}

	result, err := s.db.Exec(
		"INSERT INTO webauthn_credentials (user_id, credential_id, public_key, backup_eligible, backup_state) VALUES (?, ?, ?, ?, ?)",
		userID, credentialID, publicKey, backupEligibleInt, backupStateInt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create credential: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get credential ID: %w", err)
	}

	return s.GetCredentialByID(id)
}

// GetCredentialByID retrieves a credential by ID
func (s *Store) GetCredentialByID(id int64) (*WebAuthnCredential, error) {
	var cred WebAuthnCredential
	var backupEligibleInt, backupStateInt int

	err := s.db.QueryRow(
		"SELECT id, user_id, credential_id, public_key, counter, backup_eligible, backup_state FROM webauthn_credentials WHERE id = ?",
		id,
	).Scan(&cred.ID, &cred.UserID, &cred.CredentialID, &cred.PublicKey, &cred.Counter, &backupEligibleInt, &backupStateInt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("credential not found")
		}
		return nil, fmt.Errorf("failed to get credential: %w", err)
	}

	cred.BackupEligible = backupEligibleInt != 0
	cred.BackupState = backupStateInt != 0
	return &cred, nil
}

// GetCredentialByCredentialID retrieves a credential by credential ID
func (s *Store) GetCredentialByCredentialID(credentialID []byte) (*WebAuthnCredential, error) {
	var cred WebAuthnCredential
	var backupEligibleInt, backupStateInt int

	err := s.db.QueryRow(
		"SELECT id, user_id, credential_id, public_key, counter, backup_eligible, backup_state FROM webauthn_credentials WHERE credential_id = ?",
		credentialID,
	).Scan(&cred.ID, &cred.UserID, &cred.CredentialID, &cred.PublicKey, &cred.Counter, &backupEligibleInt, &backupStateInt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("credential not found")
		}
		return nil, fmt.Errorf("failed to get credential: %w", err)
	}

	cred.BackupEligible = backupEligibleInt != 0
	cred.BackupState = backupStateInt != 0
	return &cred, nil
}

// GetCredentialsByUserID retrieves all credentials for a user
func (s *Store) GetCredentialsByUserID(userID int64) ([]*WebAuthnCredential, error) {
	rows, err := s.db.Query(
		"SELECT id, user_id, credential_id, public_key, counter, backup_eligible, backup_state FROM webauthn_credentials WHERE user_id = ?",
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query credentials: %w", err)
	}
	defer rows.Close()

	var credentials []*WebAuthnCredential
	for rows.Next() {
		var cred WebAuthnCredential
		var backupEligibleInt, backupStateInt int
		if err := rows.Scan(&cred.ID, &cred.UserID, &cred.CredentialID, &cred.PublicKey, &cred.Counter, &backupEligibleInt, &backupStateInt); err != nil {
			return nil, fmt.Errorf("failed to scan credential: %w", err)
		}
		cred.BackupEligible = backupEligibleInt != 0
		cred.BackupState = backupStateInt != 0
		credentials = append(credentials, &cred)
	}

	return credentials, nil
}

// UpdateCredentialCounter updates the counter for a credential
func (s *Store) UpdateCredentialCounter(credentialID []byte, counter uint32) error {
	_, err := s.db.Exec(
		"UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?",
		counter, credentialID,
	)
	if err != nil {
		return fmt.Errorf("failed to update credential counter: %w", err)
	}
	return nil
}
