package middlewares

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

type OIDCConfig struct {
	Issuer   string // e.g. https://keycloak.example.com/realms/<realm>
	Audience string // your backend’s client_id
	JWKSURL  string // e.g. https://keycloak.example.com/realms/<realm>/protocol/openid-connect/certs
}

// KeycloakClaims captures the standard registered claims plus commonly used Keycloak fields.
type KeycloakClaims struct {
	jwt.RegisteredClaims
	PreferredUsername string `json:"preferred_username,omitempty"`
	Email             string `json:"email,omitempty"`
	// Idp is the identity-provider alias the session authenticated through
	// (e.g. eHerkenning). Brokered Keycloak logins expose this as the "idp" claim.
	Idp         string `json:"idp,omitempty"`
	RealmAccess struct {
		Roles []string `json:"roles"`
	} `json:"realm_access,omitempty"`
	ResourceAccess map[string]struct {
		Roles []string `json:"roles"`
	} `json:"resource_access,omitempty"`
	KvkNumber            string `json:"kvkNumber,omitempty"`
	KvkNumberPascalCase  string `json:"KvkNumber,omitempty"`
	CompanyName          string `json:"companyName,omitempty"`
	CompanyNameLowerCase string `json:"companyname,omitempty"`
	CompanyNamePascal    string `json:"CompanyName,omitempty"`
	LegalSubjectID       string `json:"legalSubjectId,omitempty"`
	LegalSubjectIDUpper  string `json:"legalSubjectID,omitempty"`
	LegalSubjectIDPascal string `json:"LegalSubjectId,omitempty"`
}

func (k *KeycloakClaims) OrganizationName() string {
	if k == nil {
		return ""
	}
	switch {
	case k.CompanyName != "":
		return k.CompanyName
	case k.CompanyNameLowerCase != "":
		return k.CompanyNameLowerCase
	case k.CompanyNamePascal != "":
		return k.CompanyNamePascal
	default:
		return ""
	}
}

// LegalEntityIdentifier returns the organization identifier asserted by the
// authenticated session. A plain username is intentionally not an organization
// claim; non-IdP/eIDAS-certificate flows prove organization identity elsewhere.
func (k *KeycloakClaims) LegalEntityIdentifier() string {
	if k == nil {
		return ""
	}
	switch {
	case k.KvkNumber != "":
		return k.KvkNumber
	case k.KvkNumberPascalCase != "":
		return k.KvkNumberPascalCase
	case k.LegalSubjectID != "":
		return k.LegalSubjectID
	case k.LegalSubjectIDUpper != "":
		return k.LegalSubjectIDUpper
	case k.LegalSubjectIDPascal != "":
		return k.LegalSubjectIDPascal
	default:
		return ""
	}
}

func Auth(cfg OIDCConfig) (fiber.Handler, error) {
	if cfg.Issuer == "" || cfg.Audience == "" || cfg.JWKSURL == "" {
		return nil, fmt.Errorf("missing OIDC config")
	}

	jwks, err := newJWKSCache(cfg.JWKSURL)
	if err != nil {
		log.Printf("auth: jwks init failed, will retry on demand: %v", err)
	}

	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithAudience(cfg.Audience),
		jwt.WithIssuer(cfg.Issuer),
		jwt.WithExpirationRequired(),
	)

	return func(c *fiber.Ctx) error {
		path := c.Path()
		method := c.Method()

		if path == "/healthcheck" {
			return c.Next()
		}

		if method == fiber.MethodGet || method == fiber.MethodHead {
			switch path {
			// "/settings" is intentionally NOT public — it carries the satellite
			// connection config + registrar/dataspace IDs. The landing page and
			// app-wide theming use the curated "/settings/public" subset instead.
			case "/settings/public", "/settings/logo", "/settings/favicon", "/settings/agreements", "/registry":
				return c.Next()
			}
			// Public agreement document downloads (/settings/agreements/<id>/document).
			// These are loaded as raw <a href>/<link> GETs that carry no bearer
			// token; the documents are not confidential (every applicant signs them).
			if strings.HasPrefix(path, "/settings/agreements/") && strings.HasSuffix(path, "/document") {
				return c.Next()
			}
		}

		authz := c.Get("Authorization")
		if !strings.HasPrefix(strings.ToLower(authz), "bearer ") {
			log.Printf("auth: missing bearer token header path=%s", c.Path())
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "missing bearer token"})
		}
		tokenString := strings.TrimSpace(authz[len("Bearer "):])
		if tokenString == "" {
			log.Printf("auth: empty bearer token path=%s", c.Path())
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "missing bearer token"})
		}

		claims := &KeycloakClaims{}
		token, err := parser.ParseWithClaims(tokenString, claims, jwks.Keyfunc)
		if err != nil {
			log.Printf("auth: token parse failed path=%s err=%v", c.Path(), err)
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}
		if token == nil || !token.Valid {
			log.Printf("auth: token validation failed path=%s", c.Path())
			return c.Status(http.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}

		c.Locals("claims", claims)
		return c.Next()
	}, nil
}

// Example config wiring (e.g., in main.go)
func BuildOIDCConfigFromEnv() OIDCConfig {
	// For Keycloak 21+: issuer usually like: https://<host>/realms/<realm>
	issuer := os.Getenv("OIDC_ISSUER")
	jwks := os.Getenv("OIDC_JWKS_URL") // issuer + "/protocol/openid-connect/certs"
	aud := os.Getenv("OIDC_AUDIENCE")  // your backend's client_id (confidential or public)
	return OIDCConfig{Issuer: issuer, Audience: aud, JWKSURL: jwks}
}

type jwksCache struct {
	url    string
	client *http.Client
	mu     sync.RWMutex
	keys   map[string]*rsa.PublicKey
}

func newJWKSCache(url string) (*jwksCache, error) {
	cache := &jwksCache{
		url: strings.TrimSpace(url),
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		keys: make(map[string]*rsa.PublicKey),
	}

	if cache.url == "" {
		return nil, fmt.Errorf("jwks url is empty")
	}

	if err := cache.refresh(); err != nil {
		return cache, err
	}

	return cache, nil
}

func (c *jwksCache) Keyfunc(token *jwt.Token) (interface{}, error) {
	kid, _ := token.Header["kid"].(string)
	if kid == "" {
		log.Printf("auth: token missing kid header")
		return nil, fmt.Errorf("jwks: token missing kid header")
	}

	if key := c.get(kid); key != nil {
		return key, nil
	}

	if err := c.refresh(); err != nil {
		log.Printf("auth: jwks refresh failed kid=%s err=%v", kid, err)
		return nil, err
	}

	if key := c.get(kid); key != nil {
		return key, nil
	}

	log.Printf("auth: jwks key not found kid=%s", kid)
	return nil, fmt.Errorf("jwks: no key found for kid %s", kid)
}

func (c *jwksCache) get(kid string) *rsa.PublicKey {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.keys[kid]
}

func (c *jwksCache) refresh() error {
	resp, err := c.client.Get(c.url)
	if err != nil {
		return fmt.Errorf("jwks: fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks: unexpected status %d", resp.StatusCode)
	}

	var body struct {
		Keys []struct {
			Kty string   `json:"kty"`
			Kid string   `json:"kid"`
			Alg string   `json:"alg"`
			N   string   `json:"n"`
			E   string   `json:"e"`
			X5c []string `json:"x5c"`
		} `json:"keys"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return fmt.Errorf("jwks: decode failed: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey, len(body.Keys))
	for _, k := range body.Keys {
		if k.Kty != "RSA" {
			continue
		}
		pub, err := rsaFromJWK(k.N, k.E, k.X5c)
		if err != nil {
			return fmt.Errorf("jwks: build rsa key for kid %s: %w", k.Kid, err)
		}
		keys[k.Kid] = pub
	}

	if len(keys) == 0 {
		return fmt.Errorf("jwks: no usable RSA keys returned")
	}

	c.mu.Lock()
	c.keys = keys
	c.mu.Unlock()

	return nil
}

func rsaFromJWK(nB64, eB64 string, x5c []string) (*rsa.PublicKey, error) {
	if len(x5c) > 0 {
		certDER, err := base64.StdEncoding.DecodeString(x5c[0])
		if err == nil {
			if pub, err := parseRSAPublicKeyFromCert(certDER); err == nil {
				return pub, nil
			}
		}
	}

	nBytes, err := base64.RawURLEncoding.DecodeString(nB64)
	if err != nil {
		return nil, fmt.Errorf("decode modulus: %w", err)
	}

	eBytes, err := base64.RawURLEncoding.DecodeString(eB64)
	if err != nil {
		return nil, fmt.Errorf("decode exponent: %w", err)
	}

	n := new(big.Int).SetBytes(nBytes)
	if n.Sign() <= 0 {
		return nil, fmt.Errorf("invalid modulus")
	}

	var e int
	if len(eBytes) == 0 {
		return nil, fmt.Errorf("empty exponent")
	}
	for _, b := range eBytes {
		e = e<<8 | int(b)
	}
	if e <= 0 {
		return nil, fmt.Errorf("invalid exponent")
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}

func parseRSAPublicKeyFromCert(der []byte) (*rsa.PublicKey, error) {
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, err
	}
	pub, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("certificate does not contain RSA public key")
	}
	return pub, nil
}
