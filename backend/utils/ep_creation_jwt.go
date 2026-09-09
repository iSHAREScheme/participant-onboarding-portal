package utils

import (
	"fmt"
	"strings"
	"time"

	"onboardingportal/signing"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// CreateEpCreationToken builds the signed ep_creation_token JWT for the iSHARE
// ep_creation envelope. The HTTP body is { "ep_creation_token": <this JWT> } and
// the party object is carried in the token payload under partyClaimKey —
// "epRequest" for v2.1.1/v2.2, "parties_info" for v2.0.1 — per the spec's
// jwt_payload_ep_creation_(request_)token. The token is signed (RS256) by the
// registrar with its x5c certificate chain so the satellite can verify it.
func CreateEpCreationToken(iss, aud string, keys *signing.KeySource, partyClaimKey string, party interface{}, ttlSeconds int) (string, error) {
	if !keys.Ready() {
		return "", fmt.Errorf("ep_creation private key is not configured")
	}
	if strings.TrimSpace(iss) == "" {
		return "", fmt.Errorf("ep_creation JWT iss is not configured (REGISTRAR_ID)")
	}
	if strings.TrimSpace(aud) == "" {
		return "", fmt.Errorf("ep_creation JWT aud is not configured")
	}
	if strings.TrimSpace(partyClaimKey) == "" {
		return "", fmt.Errorf("ep_creation party claim key is empty")
	}
	if ttlSeconds <= 0 {
		ttlSeconds = 300
	}

	iat := time.Now().Unix()
	claims := jwt.MapClaims{
		"iss":         iss,
		"sub":         iss,
		"aud":         aud,
		"iat":         iat,
		"nbf":         iat,
		"exp":         iat + int64(ttlSeconds),
		"jti":         uuid.NewString(),
		partyClaimKey: party,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["alg"] = jwt.SigningMethodRS256.Alg()
	token.Header["typ"] = "JWT"

	setX5cHeader(token, keys.X5c())

	return keys.SignJWT(token, "ep_creation_token")
}
