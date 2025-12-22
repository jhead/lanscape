package routes

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"math/big"
	"net/http"

	"github.com/jhead/lanscape/lanscaped/internal/auth"
)

// JWK represents a JSON Web Key
type JWK struct {
	Kty string `json:"kty"`
	Use string `json:"use,omitempty"`
	Kid string `json:"kid,omitempty"`
	N   string `json:"n"`
	E   string `json:"e"`
	Alg string `json:"alg"`
}

// JWKSet represents a set of JSON Web Keys
type JWKSet struct {
	Keys []JWK `json:"keys"`
}

// HandleJWKS handles the JWKS endpoint for JWT public key
func HandleJWKS(w http.ResponseWriter, r *http.Request, jwtService *auth.JWTService) {
	log.Printf("JWKS request from %s", r.RemoteAddr)

	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	publicKey := jwtService.GetPublicKey()
	if publicKey == nil {
		log.Printf("Public key not available")
		http.Error(w, "Public key not available", http.StatusInternalServerError)
		return
	}

	// Convert RSA public key to JWK format
	// N and E need to be base64url encoded without padding
	nBytes := publicKey.N.Bytes()
	eBytes := big.NewInt(int64(publicKey.E)).Bytes()

	jwk := JWK{
		Kty: "RSA",
		Use: "sig",
		Kid: "lanscape-key-1",
		N:   base64.RawURLEncoding.EncodeToString(nBytes),
		E:   base64.RawURLEncoding.EncodeToString(eBytes),
		Alg: "RS256",
	}

	jwks := JWKSet{
		Keys: []JWK{jwk},
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(jwks); err != nil {
		log.Printf("Error encoding JWKS response: %v", err)
	}
}
