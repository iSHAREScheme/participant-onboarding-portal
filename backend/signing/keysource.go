// Package signing centralizes how the backend obtains and uses the party
// signing key. Three sources, selected by SATELLITE_KEY_SOURCE:
//
//	file          (default) the key PEM from env/file, exactly the historic
//	              behavior - absent configuration changes nothing.
//	vault-kv      the key PEM and certificate chain are fetched from a Vault
//	              KV v2 secret at startup and held only in memory.
//	vault-transit the key never leaves Vault: every signature is a Vault
//	              Transit sign call, so each one appears in Vault's audit log
//	              with the caller's authenticated identity.
//
// Every signature - in every mode - emits one "signing-audit" log line with
// the purpose, the key's origin, and the leaf-certificate fingerprint, so
// key usage is traceable regardless of source.
package signing

import (
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"log"
	"strings"
	"sync"

	"github.com/golang-jwt/jwt/v5"
)

const (
	SourceFile         = "file"
	SourceVaultKV      = "vault-kv"
	SourceVaultTransit = "vault-transit"
)

// Options carries everything Load needs; the caller (config.LoadEnvironment)
// remains the single place environment variables are read.
type Options struct {
	Source string // "", "file", "vault-kv", "vault-transit"

	// file mode: material already resolved by the existing env/file logic.
	PrivateKeyPEM  string
	PrivateKeyPath string // origin labeling only
	X5c            string // explicit SATELLITE_X5C; wins over a derived chain in all modes

	// vault modes
	VaultAddr   string
	VaultToken  string // static token (dev); AppRole preferred
	RoleID      string
	SecretID    string
	KVPath      string // KV v2 API path, e.g. secret/data/ishare/owner
	TransitPath string // mount path, default "transit"
	TransitKey  string // transit key name
}

// KeySource is an immutable handle on the signing identity. Safe for
// concurrent use.
type KeySource struct {
	mode        string
	origin      string
	fingerprint string
	x5c         string

	pem       string
	parseOnce sync.Once
	parsed    *rsa.PrivateKey
	parseErr  error

	transit *transitSigner
}

// Load builds a KeySource. Vault modes fetch at startup and fail fast with a
// clear error; file mode never errors here (presence is checked by Ready and
// enforced at first use, preserving historic behavior).
func Load(opts Options) (*KeySource, error) {
	source := strings.TrimSpace(opts.Source)
	if source == "" {
		source = SourceFile
	}

	switch source {
	case SourceFile:
		origin := "env:SATELLITE_PRIVATE_KEY"
		if opts.PrivateKeyPEM != "" && opts.PrivateKeyPath != "" {
			origin = "file:" + opts.PrivateKeyPath
		}
		ks := &KeySource{mode: SourceFile, origin: origin, pem: opts.PrivateKeyPEM, x5c: opts.X5c}
		ks.fingerprint = fingerprintFromX5c(opts.X5c)
		return ks, nil

	case SourceVaultKV, SourceVaultTransit:
		if opts.VaultAddr == "" {
			return nil, fmt.Errorf("SATELLITE_KEY_SOURCE=%s requires VAULT_ADDR", source)
		}
		client, err := newVaultClient(opts.VaultAddr, opts.VaultToken, opts.RoleID, opts.SecretID)
		if err != nil {
			return nil, fmt.Errorf("vault client: %w", err)
		}
		kvPath := opts.KVPath
		if kvPath == "" {
			kvPath = "secret/data/ishare/owner"
		}

		if source == SourceVaultKV {
			data, version, err := client.readKV(kvPath)
			if err != nil {
				return nil, fmt.Errorf("vault kv read %s: %w", kvPath, err)
			}
			keyPEM := strings.TrimSpace(data["private_key"])
			if keyPEM == "" {
				return nil, fmt.Errorf("vault kv %s has no private_key field", kvPath)
			}
			x5c := opts.X5c
			if x5c == "" {
				x5c, err = leafX5cFromChainPEM(data["cert_chain"])
				if err != nil {
					return nil, fmt.Errorf("vault kv %s cert_chain: %w", kvPath, err)
				}
			}
			ks := &KeySource{
				mode:   SourceVaultKV,
				origin: fmt.Sprintf("vault-kv:%s@v%d", kvPath, version),
				pem:    keyPEM + "\n",
				x5c:    x5c,
			}
			ks.fingerprint = fingerprintFromX5c(x5c)
			return ks, nil
		}

		// vault-transit: the chain still comes from KV (for x5c and local
		// verification); the private key stays in Vault.
		transitPath := opts.TransitPath
		if transitPath == "" {
			transitPath = "transit"
		}
		if opts.TransitKey == "" {
			return nil, fmt.Errorf("SATELLITE_KEY_SOURCE=vault-transit requires VAULT_TRANSIT_KEY")
		}
		x5c := opts.X5c
		if x5c == "" {
			data, _, err := client.readKV(kvPath)
			if err != nil {
				return nil, fmt.Errorf("vault kv read %s (cert chain for transit mode): %w", kvPath, err)
			}
			x5c, err = leafX5cFromChainPEM(data["cert_chain"])
			if err != nil {
				return nil, fmt.Errorf("vault kv %s cert_chain: %w", kvPath, err)
			}
		}
		pub, err := publicKeyFromX5c(x5c)
		if err != nil {
			return nil, fmt.Errorf("transit mode needs a parseable leaf certificate for verification: %w", err)
		}
		ks := &KeySource{
			mode:    SourceVaultTransit,
			origin:  fmt.Sprintf("vault-transit:%s/%s", transitPath, opts.TransitKey),
			x5c:     x5c,
			transit: &transitSigner{client: client, path: transitPath, key: opts.TransitKey, pub: pub},
		}
		ks.fingerprint = fingerprintFromX5c(x5c)
		return ks, nil

	default:
		return nil, fmt.Errorf("unknown SATELLITE_KEY_SOURCE %q (file, vault-kv, vault-transit)", source)
	}
}

func (k *KeySource) Mode() string   { return k.mode }
func (k *KeySource) Origin() string { return k.origin }
func (k *KeySource) X5c() string    { return k.x5c }

// Ready reports whether signing can work: a key PEM is present, or transit is
// configured. Mirrors the historic "is the private key configured" checks.
func (k *KeySource) Ready() bool {
	if k == nil {
		return false
	}
	return strings.TrimSpace(k.pem) != "" || k.transit != nil
}

// PrivateKeyPEM exposes the in-memory PEM for the modes that hold one -
// empty in transit mode. Kept for backward-compatible config population.
func (k *KeySource) PrivateKeyPEM() string { return k.pem }

// SignJWT signs the token and emits the audit line. purpose is a short label
// like "owner_access_token".
func (k *KeySource) SignJWT(token *jwt.Token, purpose string) (string, error) {
	if k == nil || !k.Ready() {
		return "", fmt.Errorf("satellite signing key is not configured")
	}

	var signed string
	var err error
	if k.transit != nil {
		token.Method = &transitMethod{signer: k.transit}
		token.Header["alg"] = token.Method.Alg()
		signed, err = token.SignedString(nil)
	} else {
		k.parseOnce.Do(func() {
			k.parsed, k.parseErr = jwt.ParseRSAPrivateKeyFromPEM([]byte(k.pem))
		})
		if k.parseErr != nil {
			return "", fmt.Errorf("parse signing key (%s): %w", k.origin, k.parseErr)
		}
		signed, err = token.SignedString(k.parsed)
	}
	if err != nil {
		log.Printf("signing-audit purpose=%s origin=%q fingerprint=%s alg=RS256 result=error err=%q",
			purpose, k.origin, k.fingerprint, err.Error())
		return "", err
	}
	log.Printf("signing-audit purpose=%s origin=%q fingerprint=%s alg=RS256 result=ok",
		purpose, k.origin, k.fingerprint)
	return signed, nil
}

// leafX5cFromChainPEM extracts the first CERTIFICATE block of a PEM chain as
// a single base64 (standard) DER entry - the same shape the deploy scripts
// have always derived for SATELLITE_X5C.
func leafX5cFromChainPEM(chainPEM string) (string, error) {
	rest := []byte(chainPEM)
	for {
		var block *pem.Block
		block, rest = pem.Decode(rest)
		if block == nil {
			return "", fmt.Errorf("no CERTIFICATE block found")
		}
		if block.Type == "CERTIFICATE" {
			return base64.StdEncoding.EncodeToString(block.Bytes), nil
		}
	}
}

func leafDERFromX5c(x5c string) ([]byte, error) {
	first := strings.TrimSpace(strings.Trim(strings.Split(x5c, ",")[0], "\""))
	if first == "" {
		return nil, fmt.Errorf("empty x5c")
	}
	return base64.StdEncoding.DecodeString(first)
}

func publicKeyFromX5c(x5c string) (*rsa.PublicKey, error) {
	der, err := leafDERFromX5c(x5c)
	if err != nil {
		return nil, err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, err
	}
	pub, ok := cert.PublicKey.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("leaf certificate key is not RSA")
	}
	return pub, nil
}

// fingerprintFromX5c is the SHA-256 of the leaf certificate DER (the standard
// certificate fingerprint), or "unknown" when no x5c is configured.
func fingerprintFromX5c(x5c string) string {
	der, err := leafDERFromX5c(x5c)
	if err != nil {
		return "unknown"
	}
	sum := sha256.Sum256(der)
	return hex.EncodeToString(sum[:])
}
