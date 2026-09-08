package utils

import (
	"fmt"
	"strings"
	"time"

	"onboardingportal/signing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func CreateSporSignedRequestJWT(iss string, aud string, subject string, organizationIdentifier string, keys *signing.KeySource, ttlSeconds int) (string, error) {
	if !keys.Ready() {
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

	iat := time.Now().Unix()
	exp := iat + int64(ttlSeconds)

	claims := jwt.MapClaims{
		"iss":                    iss,
		"sub":                    subject,
		"aud":                    aud,
		"iat":                    iat,
		"nbf":                    iat,
		"exp":                    exp,
		"jti":                    uuid.NewString(),
		"organizationIdentifier": organizationIdentifier,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["alg"] = jwt.SigningMethodRS256.Alg()
	token.Header["typ"] = "JWT"

	setX5cHeader(token, keys.X5c())

	return keys.SignJWT(token, "spor_signed_request")
}
