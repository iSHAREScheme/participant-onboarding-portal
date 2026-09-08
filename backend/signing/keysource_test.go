package signing

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// testIdentity generates an RSA key + self-signed cert and returns the key,
// its PKCS#1 PEM, and the certificate chain PEM.
func testIdentity(t *testing.T) (*rsa.PrivateKey, string, string) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "signing-test", SerialNumber: "EU.EORI.NLTEST"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyPEM := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	chainPEM := string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	return key, keyPEM, chainPEM
}

func signAndVerify(t *testing.T, ks *KeySource, pub *rsa.PublicKey) {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{"iss": "test", "exp": time.Now().Unix() + 30})
	signed, err := ks.SignJWT(token, "test_token")
	if err != nil {
		t.Fatalf("SignJWT: %v", err)
	}
	parsed, err := jwt.Parse(signed, func(*jwt.Token) (interface{}, error) { return pub, nil },
		jwt.WithValidMethods([]string{"RS256"}))
	if err != nil || !parsed.Valid {
		t.Fatalf("signature does not verify: %v", err)
	}
}

func TestFileMode(t *testing.T) {
	key, keyPEM, chainPEM := testIdentity(t)
	x5c, err := leafX5cFromChainPEM(chainPEM)
	if err != nil {
		t.Fatal(err)
	}
	ks, err := Load(Options{Source: "file", PrivateKeyPEM: keyPEM, PrivateKeyPath: "/app/keys/sat-key.pem", X5c: x5c})
	if err != nil {
		t.Fatal(err)
	}
	if !ks.Ready() {
		t.Fatal("file mode with key should be Ready")
	}
	if ks.Origin() != "file:/app/keys/sat-key.pem" {
		t.Fatalf("origin = %q", ks.Origin())
	}
	signAndVerify(t, ks, &key.PublicKey)
}

func TestFileModeUnconfigured(t *testing.T) {
	ks, err := Load(Options{})
	if err != nil {
		t.Fatal(err)
	}
	if ks.Ready() {
		t.Fatal("empty file mode must not be Ready")
	}
	if _, err := ks.SignJWT(jwt.New(jwt.SigningMethodRS256), "test_token"); err == nil {
		t.Fatal("signing without a key must error")
	}
}

// fakeVault serves approle login, the KV secret, and transit signing backed
// by the test key.
func fakeVault(t *testing.T, key *rsa.PrivateKey, keyPEM, chainPEM string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/auth/approle/login", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			RoleID   string `json:"role_id"`
			SecretID string `json:"secret_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.RoleID != "test-role" || body.SecretID != "test-secret" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"auth": map[string]any{"client_token": "test-token", "lease_duration": 3600},
		})
	})
	mux.HandleFunc("/v1/secret/data/ishare/owner", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Vault-Token") != "test-token" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{
				"data":     map[string]any{"private_key": keyPEM, "cert_chain": chainPEM},
				"metadata": map[string]any{"version": 3},
			},
		})
	})
	mux.HandleFunc("/v1/transit/sign/owner/sha2-256", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Vault-Token") != "test-token" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		var body struct {
			Input string `json:"input"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		input, _ := base64.StdEncoding.DecodeString(body.Input)
		digest := sha256.Sum256(input)
		sig, err := rsa.SignPKCS1v15(rand.Reader, key, 0x5, digest[:]) // crypto.SHA256 == 5
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]any{"signature": "vault:v1:" + base64.StdEncoding.EncodeToString(sig)},
		})
	})
	return httptest.NewServer(mux)
}

func TestVaultKVMode(t *testing.T) {
	key, keyPEM, chainPEM := testIdentity(t)
	srv := fakeVault(t, key, keyPEM, chainPEM)
	defer srv.Close()

	ks, err := Load(Options{
		Source: "vault-kv", VaultAddr: srv.URL,
		RoleID: "test-role", SecretID: "test-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if ks.Origin() != "vault-kv:secret/data/ishare/owner@v3" {
		t.Fatalf("origin = %q", ks.Origin())
	}
	if ks.X5c() == "" {
		t.Fatal("x5c should be derived from the chain")
	}
	signAndVerify(t, ks, &key.PublicKey)
}

func TestVaultTransitMode(t *testing.T) {
	key, keyPEM, chainPEM := testIdentity(t)
	srv := fakeVault(t, key, keyPEM, chainPEM)
	defer srv.Close()

	ks, err := Load(Options{
		Source: "vault-transit", VaultAddr: srv.URL,
		RoleID: "test-role", SecretID: "test-secret", TransitKey: "owner",
	})
	if err != nil {
		t.Fatal(err)
	}
	if ks.PrivateKeyPEM() != "" {
		t.Fatal("transit mode must not hold a private key in process")
	}
	if !ks.Ready() {
		t.Fatal("transit mode should be Ready")
	}
	signAndVerify(t, ks, &key.PublicKey)
}

func TestBadSource(t *testing.T) {
	if _, err := Load(Options{Source: "hsm"}); err == nil {
		t.Fatal("unknown source must error")
	}
}
