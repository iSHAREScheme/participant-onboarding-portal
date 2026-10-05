package verification

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"onboardingportal/utils"
)

// Issuer keys are never embedded in an iSHARE VC: the signer deliberately omits
// the `jwk` header and publishes a `kid` that is a DID URL into the issuer's DID
// document (see the issuer's credential.Signer.QualifiedKeyID). A verifier must
// therefore resolve the key out-of-band, which is what this file does.
//
// Two resolution routes, with different trust properties:
//
//   - An admin-configured resolver URL on the trusted-issuer entry. Deployments
//     legitimately point this at an internal service (the compose topology uses
//     http://ishare-vc-issuer:8080), so these fetches are NOT SSRF-guarded —
//     they are operator-supplied, exactly like VC_ISSUER_BASE_URL.
//   - did:web, derived from the identifier inside the wallet's presentation.
//     That input is untrusted, so those fetches go through the SSRF-guarded
//     client and can only reach public addresses.
//
// did:ishare has no universal resolution rule, so an iSHARE issuer must carry an
// explicit resolver URL in the trust list. That is a feature, not a gap: it
// keeps the set of keys that may pre-fill an onboarding proposal under the
// operator's control.

const (
	keyFetchTimeout  = 10 * time.Second
	maxKeyDocBytes   = 256 * 1024
	defaultKeyDocTTL = 10 * time.Minute
)

// KeyResolver resolves the verification key for a credential's issuer.
type KeyResolver interface {
	// ResolveKey returns the public key identified by kid for the given issuer.
	// resolverURL is the operator-configured document location ("" when the
	// issuer entry did not set one).
	ResolveKey(issuer, kid, resolverURL string) (crypto.PublicKey, error)
}

type cachedKeyDoc struct {
	keys map[string]crypto.PublicKey
	// sole is the only key in the document, used when a token carries no kid.
	sole    crypto.PublicKey
	soleSet bool
	expires time.Time
}

// HTTPKeyResolver fetches and caches DID documents / JWKS over HTTP.
type HTTPKeyResolver struct {
	// Guarded reaches only public addresses; used for identifier-derived URLs.
	Guarded *http.Client
	// Direct has no SSRF guard; used only for operator-configured resolver URLs.
	Direct *http.Client
	TTL    time.Duration

	mu    sync.Mutex
	cache map[string]cachedKeyDoc
}

func NewHTTPKeyResolver() *HTTPKeyResolver {
	return &HTTPKeyResolver{
		Guarded: utils.GuardedHTTPClient(keyFetchTimeout),
		Direct:  &http.Client{Timeout: keyFetchTimeout},
		TTL:     defaultKeyDocTTL,
		cache:   map[string]cachedKeyDoc{},
	}
}

func (r *HTTPKeyResolver) ResolveKey(issuer, kid, resolverURL string) (crypto.PublicKey, error) {
	docURL, operatorSupplied, err := keyDocumentURL(issuer, resolverURL)
	if err != nil {
		return nil, err
	}

	doc, err := r.load(docURL, operatorSupplied)
	if err != nil {
		return nil, err
	}

	kid = strings.TrimSpace(kid)
	if kid == "" {
		if doc.soleSet {
			return doc.sole, nil
		}
		return nil, fmt.Errorf("credential has no kid and issuer %q publishes %d keys", issuer, len(doc.keys))
	}
	if key, ok := doc.keys[kid]; ok {
		return key, nil
	}
	// A bare kid ("key-1") matches a verification method published as a DID URL
	// ("did:ishare:X#key-1"), and vice versa.
	if _, fragment, found := strings.Cut(kid, "#"); found {
		if key, ok := doc.keys[fragment]; ok {
			return key, nil
		}
	}
	if key, ok := doc.keys[issuer+"#"+kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("issuer %q publishes no key with id %q", issuer, kid)
}

const (
	httpScheme  = "http://"
	httpsScheme = "https://"
)

// isHTTPURL reports whether value starts with an http or https scheme.
func isHTTPURL(value string) bool {
	return strings.HasPrefix(value, httpScheme) || strings.HasPrefix(value, httpsScheme)
}

// keyDocumentURL decides where an issuer's keys are published and whether that
// location came from the operator (trusted) or from the presentation (guarded).
func keyDocumentURL(issuer, resolverURL string) (string, bool, error) {
	if trimmed := strings.TrimSpace(resolverURL); trimmed != "" {
		if !isHTTPURL(trimmed) {
			return "", false, fmt.Errorf("resolver URL for %q must be http(s)", issuer)
		}
		return trimmed, true, nil
	}
	if derived, ok := didWebDocumentURL(issuer); ok {
		return derived, false, nil
	}
	return "", false, fmt.Errorf("no resolver URL configured for issuer %q (only did:web resolves without one)", issuer)
}

// didWebDocumentURL implements did:web resolution: did:web:example.com:a:b →
// https://example.com/a/b/did.json, with the bare form using /.well-known/.
func didWebDocumentURL(did string) (string, bool) {
	rest, ok := strings.CutPrefix(strings.TrimSpace(did), "did:web:")
	if !ok || rest == "" {
		return "", false
	}
	segments := strings.Split(rest, ":")
	for i, s := range segments {
		decoded, err := url.PathUnescape(s)
		if err != nil {
			return "", false
		}
		segments[i] = decoded
	}
	host := segments[0]
	if host == "" || strings.ContainsAny(host, "/?#") {
		return "", false
	}
	if len(segments) == 1 {
		return httpsScheme + host + "/.well-known/did.json", true
	}
	return httpsScheme + host + "/" + strings.Join(segments[1:], "/") + "/did.json", true
}

func (r *HTTPKeyResolver) load(docURL string, operatorSupplied bool) (cachedKeyDoc, error) {
	r.mu.Lock()
	if entry, ok := r.cache[docURL]; ok && time.Now().Before(entry.expires) {
		r.mu.Unlock()
		return entry, nil
	}
	r.mu.Unlock()

	client := r.Guarded
	if operatorSupplied {
		client = r.Direct
	}
	if client == nil {
		client = utils.GuardedHTTPClient(keyFetchTimeout)
	}

	resp, err := client.Get(docURL)
	if err != nil {
		return cachedKeyDoc{}, fmt.Errorf("fetching issuer keys from %s: %w", docURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return cachedKeyDoc{}, fmt.Errorf("issuer key document %s returned status %d", docURL, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxKeyDocBytes+1))
	if err != nil {
		return cachedKeyDoc{}, err
	}
	if len(body) > maxKeyDocBytes {
		return cachedKeyDoc{}, fmt.Errorf("issuer key document %s exceeds %d bytes", docURL, maxKeyDocBytes)
	}

	keys, err := ParseKeyDocument(body)
	if err != nil {
		return cachedKeyDoc{}, fmt.Errorf("issuer key document %s: %w", docURL, err)
	}
	if len(keys) == 0 {
		return cachedKeyDoc{}, fmt.Errorf("issuer key document %s publishes no usable keys", docURL)
	}

	ttl := r.TTL
	if ttl <= 0 {
		ttl = defaultKeyDocTTL
	}
	entry := cachedKeyDoc{keys: keys, expires: time.Now().Add(ttl)}
	if len(keys) == 1 {
		for _, only := range keys {
			entry.sole, entry.soleSet = only, true
		}
	}

	r.mu.Lock()
	if r.cache == nil {
		r.cache = map[string]cachedKeyDoc{}
	}
	r.cache[docURL] = entry
	r.mu.Unlock()
	return entry, nil
}

// didDocument models the parts of a DID document that carry verification keys.
type didDocument struct {
	ID                 string            `json:"id"`
	VerificationMethod []json.RawMessage `json:"verificationMethod"`
	AssertionMethod    []json.RawMessage `json:"assertionMethod"`
	Keys               []json.RawMessage `json:"keys"`
}

type verificationMethod struct {
	ID           string          `json:"id"`
	Type         string          `json:"type"`
	PublicKeyJwk json.RawMessage `json:"publicKeyJwk"`
}

// ParseKeyDocument accepts either a DID document or a bare JWKS and returns the
// published keys indexed by every identifier they can be referenced with.
func ParseKeyDocument(body []byte) (map[string]crypto.PublicKey, error) {
	var doc didDocument
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, fmt.Errorf("not valid JSON: %w", err)
	}

	keys := map[string]crypto.PublicKey{}

	// A JWKS: {"keys":[{...jwk...}]}.
	for _, raw := range doc.Keys {
		jwk, key, err := parseJWK(raw)
		if err != nil {
			continue
		}
		index(keys, jwk.Kid, doc.ID, key)
	}

	// A DID document: verificationMethod / embedded assertionMethod entries.
	// assertionMethod may also hold plain string references to a method already
	// listed above, which unmarshal into an empty struct and are skipped.
	for _, raw := range append(append([]json.RawMessage{}, doc.VerificationMethod...), doc.AssertionMethod...) {
		var method verificationMethod
		if err := json.Unmarshal(raw, &method); err != nil {
			continue
		}
		if len(method.PublicKeyJwk) == 0 {
			continue
		}
		_, key, err := parseJWK(method.PublicKeyJwk)
		if err != nil {
			continue
		}
		index(keys, method.ID, doc.ID, key)
	}

	return keys, nil
}

// index registers a key under its full id and, when the id is a DID URL, its
// bare fragment too, so either spelling of a kid resolves.
func index(keys map[string]crypto.PublicKey, id, controller string, key crypto.PublicKey) {
	id = strings.TrimSpace(id)
	if id == "" {
		// A JWKS entry without a kid is still usable when it is the only key.
		keys[fmt.Sprintf("__anonymous_%d", len(keys))] = key
		return
	}
	keys[id] = key
	if _, fragment, found := strings.Cut(id, "#"); found && fragment != "" {
		if _, exists := keys[fragment]; !exists {
			keys[fragment] = key
		}
	} else if controller != "" {
		if qualified := controller + "#" + id; keys[qualified] == nil {
			keys[qualified] = key
		}
	}
}

type jwk struct {
	Kty string `json:"kty"`
	Crv string `json:"crv"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	X   string `json:"x"`
	Y   string `json:"y"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// parseJWK converts a JSON Web Key into a public key. Only signature algorithms
// the iSHARE VC profile allows are supported (ES256/384/521, RS*, EdDSA).
func parseJWK(raw json.RawMessage) (jwk, crypto.PublicKey, error) {
	var k jwk
	if err := json.Unmarshal(raw, &k); err != nil {
		return k, nil, err
	}
	if k.Use != "" && k.Use != "sig" {
		return k, nil, fmt.Errorf("key use %q is not for signatures", k.Use)
	}

	switch strings.ToUpper(k.Kty) {
	case "EC":
		curve, err := curveByName(k.Crv)
		if err != nil {
			return k, nil, err
		}
		x, err := decodeBase64URLBigInt(k.X)
		if err != nil {
			return k, nil, fmt.Errorf("EC x: %w", err)
		}
		y, err := decodeBase64URLBigInt(k.Y)
		if err != nil {
			return k, nil, fmt.Errorf("EC y: %w", err)
		}
		if !curve.IsOnCurve(x, y) {
			return k, nil, fmt.Errorf("EC point is not on curve %s", k.Crv)
		}
		return k, &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil

	case "RSA":
		n, err := decodeBase64URLBigInt(k.N)
		if err != nil {
			return k, nil, fmt.Errorf("RSA modulus: %w", err)
		}
		e, err := decodeBase64URLBigInt(k.E)
		if err != nil {
			return k, nil, fmt.Errorf("RSA exponent: %w", err)
		}
		if !e.IsInt64() || e.Int64() < 3 {
			return k, nil, fmt.Errorf("RSA exponent out of range")
		}
		if n.BitLen() < 2048 {
			return k, nil, fmt.Errorf("RSA modulus is shorter than 2048 bits")
		}
		return k, &rsa.PublicKey{N: n, E: int(e.Int64())}, nil

	case "OKP":
		if !strings.EqualFold(k.Crv, "Ed25519") {
			return k, nil, fmt.Errorf("unsupported OKP curve %q", k.Crv)
		}
		x, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(k.X, "="))
		if err != nil {
			return k, nil, fmt.Errorf("OKP x: %w", err)
		}
		if len(x) != ed25519.PublicKeySize {
			return k, nil, fmt.Errorf("Ed25519 key is %d bytes, want %d", len(x), ed25519.PublicKeySize)
		}
		return k, ed25519.PublicKey(x), nil
	}

	return k, nil, fmt.Errorf("unsupported key type %q", k.Kty)
}

func curveByName(name string) (elliptic.Curve, error) {
	switch strings.ToUpper(strings.TrimSpace(name)) {
	case "P-256":
		return elliptic.P256(), nil
	case "P-384":
		return elliptic.P384(), nil
	case "P-521":
		return elliptic.P521(), nil
	}
	return nil, fmt.Errorf("unsupported curve %q", name)
}

func decodeBase64URLBigInt(s string) (*big.Int, error) {
	if strings.TrimSpace(s) == "" {
		return nil, fmt.Errorf("value is empty")
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(raw), nil
}
