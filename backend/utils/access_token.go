package utils

import (
	"strings"
	"time"

	"onboardingportal/signing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// CreateSatelliteOwnerAccessToken mints the iSHARE client assertion the
// portal exchanges at the satellite's /connect/token. Signing goes through
// the configured key source (file, vault-kv, or vault-transit) and is
// audit-logged there.
func CreateSatelliteOwnerAccessToken(iss string, aud string, keys *signing.KeySource) (string, error) {
	iat := time.Now().Unix()
	exp := iat + 30

	jti := uuid.NewString()

	claims := jwt.MapClaims{
		"iss": iss,
		"sub": iss,
		"aud": aud,
		"iat": iat,
		"nbf": iat,
		"exp": exp,
		"jti": jti,
	}

	// Create the token
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["alg"] = jwt.SigningMethodRS256.Alg()
	token.Header["typ"] = "JWT"

	setX5cHeader(token, keys.X5c())

	return keys.SignJWT(token, "owner_access_token")
}

// setX5cHeader applies the comma-separated x5c value to the JWT header with
// the same cleaning the helpers always did.
func setX5cHeader(token *jwt.Token, x5c string) {
	if x5c == "" {
		return
	}
	rawParts := strings.Split(x5c, ",")
	cleaned := make([]string, 0, len(rawParts))
	for _, part := range rawParts {
		trimmed := strings.TrimSpace(part)
		trimmed = strings.Trim(trimmed, "\"")
		if trimmed == "" {
			continue
		}
		cleaned = append(cleaned, trimmed)
	}
	if len(cleaned) > 0 {
		token.Header["x5c"] = cleaned
	}
}
