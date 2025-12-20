package store

import (
	"database/sql"
	"fmt"
	"strings"
	"time"
)

// Network represents a network in the database
type Network struct {
	ID                int64
	Name              string
	HeadscaleEndpoint string
	APIKey            string
	CreatedAt         time.Time
}

// Membership represents a user-network membership
type Membership struct {
	ID        int64
	UserID    int64
	NetworkID int64
	CreatedAt time.Time
}

// CreateNetwork creates a new network
func (s *Store) CreateNetwork(name, headscaleEndpoint, apiKey string) (*Network, error) {
	result, err := s.db.Exec(
		"INSERT INTO networks (name, headscale_endpoint, api_key) VALUES (?, ?, ?)",
		name, headscaleEndpoint, apiKey,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create network: %w", err)
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get network ID: %w", err)
	}

	return s.GetNetworkByID(id)
}

// GetNetworkByID retrieves a network by ID
func (s *Store) GetNetworkByID(id int64) (*Network, error) {
	var network Network
	var createdAt string

	err := s.db.QueryRow(
		"SELECT id, name, headscale_endpoint, api_key, created_at FROM networks WHERE id = ?",
		id,
	).Scan(&network.ID, &network.Name, &network.HeadscaleEndpoint, &network.APIKey, &createdAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("network not found")
		}
		return nil, fmt.Errorf("failed to get network: %w", err)
	}

	network.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return &network, nil
}

// GetNetworkByName retrieves a network by name
func (s *Store) GetNetworkByName(name string) (*Network, error) {
	var network Network
	var createdAt string

	err := s.db.QueryRow(
		"SELECT id, name, headscale_endpoint, api_key, created_at FROM networks WHERE name = ?",
		name,
	).Scan(&network.ID, &network.Name, &network.HeadscaleEndpoint, &network.APIKey, &createdAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("network not found")
		}
		return nil, fmt.Errorf("failed to get network: %w", err)
	}

	network.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return &network, nil
}

// ListNetworks lists all networks
func (s *Store) ListNetworks() ([]*Network, error) {
	rows, err := s.db.Query(
		"SELECT id, name, headscale_endpoint, api_key, created_at FROM networks ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list networks: %w", err)
	}
	defer rows.Close()

	var networks []*Network
	for rows.Next() {
		var network Network
		var createdAt string

		if err := rows.Scan(&network.ID, &network.Name, &network.HeadscaleEndpoint, &createdAt); err != nil {
			return nil, fmt.Errorf("failed to scan network: %w", err)
		}

		network.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		networks = append(networks, &network)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating networks: %w", err)
	}

	return networks, nil
}

// DeleteNetwork deletes a network (cascades to memberships)
func (s *Store) DeleteNetwork(id int64) error {
	result, err := s.db.Exec("DELETE FROM networks WHERE id = ?", id)
	if err != nil {
		return fmt.Errorf("failed to delete network: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("network not found")
	}

	return nil
}

// JoinNetwork creates a membership record for a user joining a network
func (s *Store) JoinNetwork(userID, networkID int64) error {
	_, err := s.db.Exec(
		"INSERT INTO memberships (user_id, network_id) VALUES (?, ?)",
		userID, networkID,
	)
	if err != nil {
		// Check if it's a unique constraint violation (user already in network)
		errStr := err.Error()
		if strings.Contains(errStr, "UNIQUE constraint failed") && strings.Contains(errStr, "memberships") {
			return fmt.Errorf("user is already a member of this network")
		}
		return fmt.Errorf("failed to join network: %w", err)
	}

	return nil
}

// GetUserNetworks retrieves all networks a user is a member of
func (s *Store) GetUserNetworks(userID int64) ([]*Network, error) {
	rows, err := s.db.Query(
		`SELECT n.id, n.name, n.headscale_endpoint, n.api_key, n.created_at 
		 FROM networks n
		 INNER JOIN memberships m ON n.id = m.network_id
		 WHERE m.user_id = ?
		 ORDER BY n.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get user networks: %w", err)
	}
	defer rows.Close()

	var networks []*Network
	for rows.Next() {
		var network Network
		var createdAt string

		if err := rows.Scan(&network.ID, &network.Name, &network.HeadscaleEndpoint, &network.APIKey, &createdAt); err != nil {
			return nil, fmt.Errorf("failed to scan network: %w", err)
		}

		network.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		networks = append(networks, &network)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating networks: %w", err)
	}

	return networks, nil
}

// IsUserInNetwork checks if a user is a member of a network
func (s *Store) IsUserInNetwork(userID, networkID int64) (bool, error) {
	var count int
	err := s.db.QueryRow(
		"SELECT COUNT(*) FROM memberships WHERE user_id = ? AND network_id = ?",
		userID, networkID,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check membership: %w", err)
	}

	return count > 0, nil
}
