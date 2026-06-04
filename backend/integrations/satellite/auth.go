package satellite

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"onboardingportal/config"
	"onboardingportal/utils"
)

// GetOwnerAccessToken mints the satellite-owner iSHARE client assertion and
// exchanges it at the satellite's token endpoint for an access_token. The returned
// access_token — NOT the raw client assertion — is what must be sent as the API
// Bearer.
//
// Some lenient satellites accept the raw client assertion directly as a bearer, but
// conformant ones reject it (the assertion is a credential for /connect/token, not
// an API access token). Routing every call through this exchange keeps both read
// and write paths correct regardless of the satellite's strictness.
type cachedAccessToken struct {
	token   string
	expires time.Time
}

var (
	tokenCacheMu sync.Mutex
	tokenCache   = map[string]cachedAccessToken{}
)

func GetOwnerAccessToken(client *http.Client, cfg *config.Config) (string, error) {
	// Reuse a still-valid access token instead of re-running the (~1s) token
	// exchange on every satellite call. Keyed by endpoint + identity.
	key := cfg.SatelliteBaseUrl + "|" + cfg.SatelliteIss + "|" + cfg.SatelliteAud
	tokenCacheMu.Lock()
	if e, ok := tokenCache[key]; ok && time.Now().Before(e.expires) {
		tok := e.token
		tokenCacheMu.Unlock()
		return tok, nil
	}
	tokenCacheMu.Unlock()

	privateKey := strings.TrimSpace(cfg.SatellitePrivateKey)
	if privateKey == "" {
		return "", fmt.Errorf("satellite private key is not configured")
	}
	assertion, err := utils.CreateSatelliteOwnerAccessToken(
		cfg.SatelliteIss, cfg.SatelliteAud, cfg.SatelliteX5c, privateKey,
	)
	if err != nil {
		return "", fmt.Errorf("failed to create client assertion: %w", err)
	}
	token, err := ExchangeForAccessToken(client, cfg, assertion)
	if err != nil {
		return "", err
	}

	tokenCacheMu.Lock()
	tokenCache[key] = cachedAccessToken{token: token, expires: accessTokenExpiry(token)}
	tokenCacheMu.Unlock()
	return token, nil
}

// accessTokenExpiry returns when the cached token should stop being used: the
// access token's own JWT `exp` minus a 30s safety margin, or a short fallback
// (60s) if the token can't be decoded.
func accessTokenExpiry(token string) time.Time {
	fallback := time.Now().Add(60 * time.Second)
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return fallback
	}
	seg := parts[1]
	if m := len(seg) % 4; m != 0 {
		seg += strings.Repeat("=", 4-m)
	}
	raw, err := base64.URLEncoding.DecodeString(seg)
	if err != nil {
		return fallback
	}
	var claims struct {
		Exp int64 `json:"exp"`
	}
	if json.Unmarshal(raw, &claims) != nil || claims.Exp == 0 {
		return fallback
	}
	exp := time.Unix(claims.Exp, 0).Add(-30 * time.Second)
	if exp.Before(time.Now()) {
		return fallback
	}
	return exp
}

// ExchangeForAccessToken posts an already-minted iSHARE client assertion to the
// satellite's token endpoint (grant_type=client_credentials, jwt-bearer assertion)
// and returns the issued access_token. Use this when the raw assertion is also
// needed elsewhere (e.g. a v3 signed_request); otherwise prefer GetOwnerAccessToken.
func ExchangeForAccessToken(client *http.Client, cfg *config.Config, assertion string) (string, error) {
	if strings.TrimSpace(assertion) == "" {
		return "", fmt.Errorf("client assertion is empty")
	}
	if client == nil {
		client = http.DefaultClient
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("scope", cfg.SatelliteTokenScope)
	form.Set("client_id", cfg.SatelliteIss)
	form.Set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
	form.Set("client_assertion", assertion)

	tokenURL := joinTokenURL(cfg.SatelliteBaseUrl, cfg.SatelliteTokenEndpoint)
	if cfg.SatelliteDebug {
		log.Printf("satellite: requesting access token url=%s scope=%s client_id=%s", tokenURL, cfg.SatelliteTokenScope, cfg.SatelliteIss)
		logClientAssertion(assertion)
	}

	req, err := http.NewRequest(http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}

	if res.StatusCode != http.StatusOK {
		if cfg.SatelliteDebug {
			log.Printf("satellite: token request failed status=%d body=%s", res.StatusCode, string(body))
		}
		return "", fmt.Errorf("satellite token request failed: status %d", res.StatusCode)
	}

	var parsed struct {
		AccessToken *string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("failed to parse token response: %w", err)
	}
	if parsed.AccessToken == nil || *parsed.AccessToken == "" {
		return "", fmt.Errorf("token response did not contain an access token")
	}
	if cfg.SatelliteDebug {
		log.Printf("satellite: received access token (len=%d)", len(*parsed.AccessToken))
	}

	return *parsed.AccessToken, nil
}

func joinTokenURL(base, endpoint string) string {
	trimmed := strings.TrimRight(base, "/")
	switch {
	case endpoint == "":
		return trimmed
	case strings.HasPrefix(endpoint, "/"):
		return trimmed + endpoint
	default:
		return trimmed + "/" + endpoint
	}
}

// logClientAssertion decodes the (non-secret) header and payload segments of the
// assertion for debugging. The signature segment is never logged.
func logClientAssertion(assertion string) {
	parts := strings.Split(assertion, ".")
	if len(parts) < 2 {
		return
	}
	if header, err := base64.RawURLEncoding.DecodeString(parts[0]); err == nil {
		log.Printf("satellite: client assertion header=%s", header)
	}
	if payload, err := base64.RawURLEncoding.DecodeString(parts[1]); err == nil {
		log.Printf("satellite: client assertion payload=%s", payload)
	}
}
