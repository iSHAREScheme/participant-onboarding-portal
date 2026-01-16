package utils

import (
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func CreateSatelliteOwnerAccessToken(iss string, aud string, x5c string, privateKey string) (string, error) {
	iat := time.Now().Unix()
	exp := iat + 30

	// Parse the private key
	parsedKey, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(privateKey))
	if err != nil {
		return "", err
	}

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

	// log.Printf("client assertion header: %+v", token.Header)

	// Sign the token with the private key
	signedToken, err := token.SignedString(parsedKey)
	if err != nil {
		return "", err
	}

	// log.Printf("signed assertion: %+v", signedToken)

	return signedToken, nil
}
