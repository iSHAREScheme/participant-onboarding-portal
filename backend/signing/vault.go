package signing

// Minimal Vault client over net/http: AppRole (or static token) auth, KV v2
// read, Transit sign. Deliberately dependency-free - the API surface we use
// is three endpoints, and the official SDK would be the heavier supply chain.

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

type vaultClient struct {
	addr  string
	httpc *http.Client

	roleID   string
	secretID string

	mu     sync.Mutex
	token  string
	expiry time.Time // zero for static tokens
	static bool
}

func newVaultClient(addr, staticToken, roleID, secretID string) (*vaultClient, error) {
	c := &vaultClient{
		addr:  strings.TrimRight(addr, "/"),
		httpc: &http.Client{Timeout: 15 * time.Second},
	}
	if staticToken != "" {
		c.token = staticToken
		c.static = true
		return c, nil
	}
	if roleID == "" || secretID == "" {
		return nil, fmt.Errorf("need VAULT_TOKEN or VAULT_ROLE_ID(_FILE)+VAULT_SECRET_ID(_FILE)")
	}
	c.roleID, c.secretID = roleID, secretID
	return c, nil
}

func (c *vaultClient) ensureToken() (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.static {
		return c.token, nil
	}
	if c.token != "" && time.Now().Add(30*time.Second).Before(c.expiry) {
		return c.token, nil
	}
	body, err := json.Marshal(map[string]string{"role_id": c.roleID, "secret_id": c.secretID})
	if err != nil {
		return "", err
	}
	resp, err := c.httpc.Post(c.addr+"/v1/auth/approle/login", "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("approle login: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("approle login: HTTP %d", resp.StatusCode)
	}
	var parsed struct {
		Auth struct {
			ClientToken   string `json:"client_token"`
			LeaseDuration int    `json:"lease_duration"`
		} `json:"auth"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil || parsed.Auth.ClientToken == "" {
		return "", fmt.Errorf("approle login: unexpected response")
	}
	c.token = parsed.Auth.ClientToken
	c.expiry = time.Now().Add(time.Duration(parsed.Auth.LeaseDuration) * time.Second)
	return c.token, nil
}

func (c *vaultClient) do(method, path string, payload any) ([]byte, error) {
	token, err := c.ensureToken()
	if err != nil {
		return nil, err
	}
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, c.addr+"/v1/"+strings.TrimLeft(path, "/"), body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Vault-Token", token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, fmt.Errorf("vault %s %s: HTTP %d", method, path, resp.StatusCode)
	}
	return raw, nil
}

// readKV reads a KV v2 secret. path is the API path including data/, e.g.
// "secret/data/ishare/owner". Returns the string fields and the version.
func (c *vaultClient) readKV(path string) (map[string]string, int, error) {
	raw, err := c.do(http.MethodGet, path, nil)
	if err != nil {
		return nil, 0, err
	}
	var parsed struct {
		Data struct {
			Data     map[string]any `json:"data"`
			Metadata struct {
				Version int `json:"version"`
			} `json:"metadata"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, 0, fmt.Errorf("kv response: %w", err)
	}
	out := make(map[string]string, len(parsed.Data.Data))
	for k, v := range parsed.Data.Data {
		if s, ok := v.(string); ok {
			out[k] = s
		}
	}
	return out, parsed.Data.Metadata.Version, nil
}

// transitSign asks Vault Transit to sign input with RSA PKCS#1 v1.5 over
// SHA-256 (JWT RS256) and returns the raw signature bytes.
func (c *vaultClient) transitSign(mountPath, key string, input []byte) ([]byte, error) {
	payload := map[string]any{
		"input":                base64.StdEncoding.EncodeToString(input),
		"signature_algorithm":  "pkcs1v15",
		"marshaling_algorithm": "asn1",
	}
	raw, err := c.do(http.MethodPost, mountPath+"/sign/"+key+"/sha2-256", payload)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Data struct {
			Signature string `json:"signature"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("transit response: %w", err)
	}
	// Format: vault:v<keyversion>:<base64 signature>
	parts := strings.SplitN(parsed.Data.Signature, ":", 3)
	if len(parts) != 3 {
		return nil, fmt.Errorf("transit signature has unexpected format")
	}
	return base64.StdEncoding.DecodeString(parts[2])
}
