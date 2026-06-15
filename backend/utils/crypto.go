package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
)

// secretEncPrefix marks a stored value as AES-GCM encrypted by EncryptSecret.
// Values without it are treated as plaintext on decrypt (defensive: tolerates
// anything stored before encryption was wired in).
const secretEncPrefix = "enc:v1:"

// ParseSecretKey decodes a master key from its env representation. It accepts a
// standard-base64, hex, or raw string and requires the decoded key to be a valid
// AES length (16, 24 or 32 bytes). An empty input yields a nil key (no error) so
// callers can detect "not configured".
func ParseSecretKey(raw string) ([]byte, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	// Try standard base64, then hex, then raw bytes — accept the first that
	// produces a valid AES key length.
	if b, err := base64.StdEncoding.DecodeString(raw); err == nil && validAESKeyLen(len(b)) {
		return b, nil
	}
	if b, err := hex.DecodeString(raw); err == nil && validAESKeyLen(len(b)) {
		return b, nil
	}
	if validAESKeyLen(len(raw)) {
		return []byte(raw), nil
	}
	return nil, fmt.Errorf("secret key must decode to 16, 24 or 32 bytes (base64, hex or raw)")
}

func validAESKeyLen(n int) bool { return n == 16 || n == 24 || n == 32 }

// EncryptSecret encrypts a plaintext secret with AES-256-GCM and returns a
// prefixed, base64-encoded "nonce||ciphertext" string safe to persist. It errors
// when no key is configured so secrets are never stored in the clear by accident.
func EncryptSecret(key []byte, plaintext string) (string, error) {
	if len(key) == 0 {
		return "", errors.New("encryption key is not configured")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return secretEncPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// DecryptSecret reverses EncryptSecret. A value without the encryption prefix is
// returned unchanged (assumed plaintext), so reads never hard-fail on legacy data.
func DecryptSecret(key []byte, stored string) (string, error) {
	if !strings.HasPrefix(stored, secretEncPrefix) {
		return stored, nil
	}
	if len(key) == 0 {
		return "", errors.New("encryption key is not configured")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, secretEncPrefix))
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("encrypted secret is malformed")
	}
	nonce, ciphertext := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// IsEncryptedSecret reports whether a stored value was produced by EncryptSecret.
func IsEncryptedSecret(stored string) bool {
	return strings.HasPrefix(stored, secretEncPrefix)
}
