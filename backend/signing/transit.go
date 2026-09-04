package signing

// jwt/v5 SigningMethod backed by Vault Transit: the signing string goes to
// Vault, the private key never enters this process. Verification uses the
// leaf certificate's public key locally.

import (
	"github.com/golang-jwt/jwt/v5"
)

type transitSigner struct {
	client *vaultClient
	path   string
	key    string
	pub    interface{} // *rsa.PublicKey, for local verification
}

type transitMethod struct {
	signer *transitSigner
}

func (m *transitMethod) Alg() string { return jwt.SigningMethodRS256.Alg() }

func (m *transitMethod) Sign(signingString string, _ interface{}) ([]byte, error) {
	return m.signer.client.transitSign(m.signer.path, m.signer.key, []byte(signingString))
}

func (m *transitMethod) Verify(signingString string, sig []byte, _ interface{}) error {
	return jwt.SigningMethodRS256.Verify(signingString, sig, m.signer.pub)
}
