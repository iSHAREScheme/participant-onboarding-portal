package utils

import (
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func CreateSporSignedRequestJWT(iss string, aud string, subject string, organizationIdentifier string, x5c string, privateKey string, ttlSeconds int) (string, error) {
	if strings.TrimSpace(privateKey) == "" {
		return "", fmt.Errorf("SPOR private key is not configured")
	}
	if strings.TrimSpace(iss) == "" {
		return "", fmt.Errorf("SPOR JWT iss is not configured")
	}
	if strings.TrimSpace(aud) == "" {
		return "", fmt.Errorf("SPOR JWT aud is not configured")
	}
	if strings.TrimSpace(subject) == "" {
		return "", fmt.Errorf("SPOR JWT subject is empty")
	}
	if strings.TrimSpace(organizationIdentifier) == "" {
		return "", fmt.Errorf("SPOR JWT organizationIdentifier is empty")
	}

	if ttlSeconds <= 0 {
		ttlSeconds = 300
	}

	parsedKey, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(privateKey))
	if err != nil {
		return "", err
	}

	iat := time.Now().Unix()
	exp := iat + int64(ttlSeconds)

	claims := jwt.MapClaims{
		"iss":                   iss,
		"sub":                   subject,
		"aud":                   aud,
		"iat":                   iat,
		"nbf":                   iat,
		"exp":                   exp,
		"jti":                   uuid.NewString(),
		"organizationIdentifier": organizationIdentifier,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["alg"] = jwt.SigningMethodRS256.Alg()
	token.Header["typ"] = "JWT"

	if x5c != "" {
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

	signedToken, err := token.SignedString(parsedKey)
	if err != nil {
		return "", err
	}

	return signedToken, nil
}
