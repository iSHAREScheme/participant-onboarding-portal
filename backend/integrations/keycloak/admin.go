// Package keycloak is a thin client for the Keycloak Admin REST API. It is used
// by the admin Settings UI to review/configure the realm's identity providers
// and SMTP settings. It authenticates with the master-realm admin credentials
// (password grant via admin-cli); tokens are short-lived and fetched per call,
// not cached.
package keycloak

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// AdminClient targets a single realm's admin API.
type AdminClient struct {
	baseURL  string // e.g. http://keycloak:8080 (no trailing slash)
	realm    string // realm being administered, e.g. onboarding-portal
	username string
	password string
	http     *http.Client
}

// NewAdminClient validates the admin configuration and returns a client. It
// returns an error (rather than a half-configured client) when any required
// value is missing, so callers surface a clear "not configured" message.
func NewAdminClient(baseURL, realm, username, password string) (*AdminClient, error) {
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if baseURL == "" || strings.TrimSpace(realm) == "" ||
		strings.TrimSpace(username) == "" || strings.TrimSpace(password) == "" {
		return nil, fmt.Errorf("Keycloak admin API is not configured (need KEYCLOAK_ADMIN_BASE_URL, realm, KEYCLOAK_ADMIN_USERNAME, KEYCLOAK_ADMIN_PASSWORD)")
	}
	return &AdminClient{
		baseURL:  baseURL,
		realm:    strings.TrimSpace(realm),
		username: username,
		password: password,
		http:     &http.Client{Timeout: 20 * time.Second},
	}, nil
}

// Realm returns the realm this client administers.
func (a *AdminClient) Realm() string { return a.realm }

func (a *AdminClient) token() (string, error) {
	form := url.Values{}
	form.Set("client_id", "admin-cli")
	form.Set("grant_type", "password")
	form.Set("username", a.username)
	form.Set("password", a.password)

	resp, err := a.http.PostForm(a.baseURL+"/realms/master/protocol/openid-connect/token", form)
	if err != nil {
		return "", fmt.Errorf("failed to authenticate to Keycloak admin API: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Keycloak admin authentication failed (status %d)", resp.StatusCode)
	}
	var parsed struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil || strings.TrimSpace(parsed.AccessToken) == "" {
		return "", fmt.Errorf("Keycloak admin authentication returned no access token")
	}
	return parsed.AccessToken, nil
}

// Do performs an admin-API call against /admin/realms/{realm}{path}. A nil body
// sends no payload. It returns the HTTP status and raw response body so callers
// can decode success payloads or surface Keycloak's own error message.
func (a *AdminClient) Do(method, path string, body any) (int, []byte, error) {
	token, err := a.token()
	if err != nil {
		return 0, nil, err
	}

	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		reader = bytes.NewReader(raw)
	}

	endpoint := fmt.Sprintf("%s/admin/realms/%s%s", a.baseURL, url.PathEscape(a.realm), path)
	req, err := http.NewRequest(method, endpoint, reader)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := a.http.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("Keycloak admin request failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, respBody, nil
}

// ExtractError pulls a human-readable message out of a Keycloak admin error body
// (which is usually {"error":"...","errorMessage":"..."} or {"error":"..."}).
func ExtractError(status int, body []byte) string {
	var parsed struct {
		Error        string `json:"error"`
		ErrorMessage string `json:"errorMessage"`
	}
	_ = json.Unmarshal(body, &parsed)
	switch {
	case strings.TrimSpace(parsed.ErrorMessage) != "":
		return parsed.ErrorMessage
	case strings.TrimSpace(parsed.Error) != "":
		return parsed.Error
	default:
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			return fmt.Sprintf("Keycloak returned status %d", status)
		}
		return msg
	}
}
