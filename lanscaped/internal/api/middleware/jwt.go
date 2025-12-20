package middleware

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/jhead/lanscape/lanscaped/internal/auth"
)

// JWTAuthMiddleware validates JWT tokens from cookies or Authorization header
func JWTAuthMiddleware(jwtService *auth.JWTService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var tokenString string

			// Try to get token from cookie first
			cookie, err := r.Cookie("jwt")
			if err == nil && cookie != nil {
				tokenString = cookie.Value
				log.Printf("JWT token found in cookie")
			} else {
				// Try to get token from Authorization header
				authHeader := r.Header.Get("Authorization")
				if authHeader != "" {
					parts := strings.Split(authHeader, " ")
					if len(parts) == 2 && parts[0] == "Bearer" {
						tokenString = parts[1]
						log.Printf("JWT token found in Authorization header")
					}
				}
			}

			if tokenString == "" {
				log.Printf("No JWT token found in request")
				http.Error(w, "Authorization required", http.StatusUnauthorized)
				return
			}

			// Validate token
			claims, err := jwtService.ValidateToken(tokenString)
			if err != nil {
				log.Printf("Invalid JWT token: %v", err)
				http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
				return
			}

			log.Printf("JWT token validated for user: %s (ID: %d)", claims.Username, claims.UserID)

			// Store claims in request context for use in handlers
			ctx := context.WithValue(r.Context(), "jwt_claims", claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetClaimsFromContext extracts JWT claims from request context
func GetClaimsFromContext(r *http.Request) (*auth.Claims, bool) {
	claims, ok := r.Context().Value("jwt_claims").(*auth.Claims)
	return claims, ok
}
