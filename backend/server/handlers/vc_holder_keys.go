package handlers

import (
	"crypto"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"strings"

	"onboardingportal/integrations/satellite"
)

// Holder keys for presentation (holder-binding) signatures.
//
// A holder is a party, not an issuer: it has no entry in the trust policy, and
// an iSHARE party (did:ishare) publishes no DID document to resolve a key from.
// What it does have is its registered certificates in the Participant Registry.
// registryHolderResolver looks the holder's party up in the registry and offers
// the public keys of its x509 certificates, so a wallet that signs the
// presentation with the party's registered key can be holder-bound, which is
// what lets a deployment require holder binding and skip admin review safely.

type registryHolderResolver struct {
	// certificates returns the party's registered certificates (v3 x509Certificate
	// claims, or the legacy certificates array). Injected so tests need no registry.
	certificates func(partyID string) ([]*x509.Certificate, error)
}

func newRegistryHolderResolver(registry *HandlerRegistry) *registryHolderResolver {
	return &registryHolderResolver{certificates: registry.partyCertificates}
}

// ResolveKey implements verification.KeyResolver for holders. kid may be the
// certificate's x5t#S256 thumbprint, a DID URL ending in it, or empty when the
// party has exactly one registered certificate. resolverURL is unused: holder
// keys come from the registry, never from a URL the presentation supplies.
func (r *registryHolderResolver) ResolveKey(holder, kid, _ string) (crypto.PublicKey, error) {
	holder = strings.TrimSpace(holder)
	if holder == "" {
		return nil, fmt.Errorf("presentation names no holder")
	}
	certificates, err := r.certificates(holder)
	if err != nil {
		return nil, fmt.Errorf("holder %s could not be looked up in the participant registry: %w", holder, err)
	}
	if len(certificates) == 0 {
		return nil, fmt.Errorf("holder %s has no registered certificate to verify the presentation with", holder)
	}
	kid = strings.TrimSpace(kid)
	if kid == "" {
		if len(certificates) == 1 {
			return certificates[0].PublicKey, nil
		}
		return nil, fmt.Errorf("presentation carries no kid and holder %s has %d registered certificates", holder, len(certificates))
	}
	want := kid
	if _, fragment, found := strings.Cut(kid, "#"); found && fragment != "" {
		want = fragment
	}
	for _, certificate := range certificates {
		if certificateThumbprint(certificate) == want {
			return certificate.PublicKey, nil
		}
	}
	return nil, fmt.Errorf("holder %s has no registered certificate with thumbprint %s", holder, want)
}

// certificateThumbprint is the JOSE x5t#S256 value: base64url(sha256(DER)).
func certificateThumbprint(certificate *x509.Certificate) string {
	sum := sha256.Sum256(certificate.Raw)
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// partyCertificates fetches a party from the registry and parses every
// certificate it carries: v3 x509Certificate claims (x5c) and, for unmigrated
// parties, the legacy certificates array.
func (h *HandlerRegistry) partyCertificates(partyID string) ([]*x509.Certificate, error) {
	party, err := h.fetchPartyByID(partyID)
	if err != nil {
		return nil, err
	}
	record, ok := party.(map[string]interface{})
	if !ok {
		return nil, nil
	}
	certificates := make([]*x509.Certificate, 0)
	add := func(x5c string) {
		parsed, err := satellite.ParseX5CCertificate(x5c)
		if err == nil && parsed != nil {
			certificates = append(certificates, parsed)
		}
	}
	for _, claim := range partyClaims(record) {
		if claimType, _ := claim["type"].(string); claimType != "x509Certificate" {
			continue
		}
		if x5c, _ := claim["x5c"].(string); strings.TrimSpace(x5c) != "" {
			add(x5c)
		}
	}
	if legacy, ok := record["certificates"].([]interface{}); ok {
		for _, entry := range legacy {
			if m, ok := entry.(map[string]interface{}); ok {
				if x5c := firstString(m, "x5c", "certificate", "certificate_value"); x5c != "" {
					add(x5c)
				}
			}
		}
	}
	return certificates, nil
}
