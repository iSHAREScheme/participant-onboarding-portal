package handlers

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"math/big"
	"testing"
	"time"
)

// A v3 satellite requires a certificate-registered party's id to equal
// calcIshareDid(cert organizationIdentifier): did:ishare:EU.<CC>.<identifier>
// for NTR<CC> identifiers. deriveV3Identity must preserve/produce that shape —
// the legacy EU.EORI canonicalisation rewriting NTR ids made every
// NTR-certificate party creation fail the satellite's alignment check.
func TestDeriveV3IdentityNTRAlignment(t *testing.T) {
	cases := []struct {
		in      string
		wantDid string
	}{
		{"NTRNL-12345678", "did:ishare:EU.NL.NTRNL-12345678"},
		{"EU.NL.NTRNL-12345678", "did:ishare:EU.NL.NTRNL-12345678"},
		{"did:ishare:EU.NL.NTRNL-12345678", "did:ishare:EU.NL.NTRNL-12345678"},
		// Lowercase ntr… cannot derive a country on the satellite either
		// (calcIshareDid matches uppercase only) — legacy canonicalisation applies.
		{"ntrnl-12345678", "did:ishare:EU.EORI.ntrnl-12345678"},
		{"did:web:example.com", "did:web:example.com"}, // non-ishare DIDs pass through
	}
	for _, c := range cases {
		did, _ := deriveV3Identity(c.in)
		if did != c.wantDid {
			t.Fatalf("deriveV3Identity(%q) did = %q, want %q", c.in, did, c.wantDid)
		}
	}

	// Legacy EORI-style ids keep the historical canonicalisation.
	did, eori := deriveV3Identity("EU.EORI.NL123456789")
	if did != "did:ishare:EU.EORI.NL123456789" || eori != "EU.EORI.NL123456789" {
		t.Fatalf("legacy EORI id changed: did=%q eori=%q", did, eori)
	}
}

// Regression for "certificate organizationIdentifier does not align with party
// id" on approval: the wizard's KVK prefill rebuilt EU.EORI.NL.KVK<kvk> over the
// certificate-derived id. With a certificate present the backend must derive the
// id the registry will accept, and deriveV3Identity must turn it into exactly
// calcIshareDid(organizationIdentifier).
func TestAlignPartyIDWithCertificateFollowsTheCertificate(t *testing.T) {
	x5c := testX5CWithOrganizationIdentifier(t, "NTRNL-1123982439")

	aligned, changed := alignPartyIDWithCertificate("EU.EORI.NL.KVK1123982439", x5c)
	if !changed || aligned != "EU.NL.NTRNL-1123982439" {
		t.Fatalf("aligned = %q changed=%t, want EU.NL.NTRNL-1123982439 (changed)", aligned, changed)
	}
	if did, _ := deriveV3Identity(aligned); did != "did:ishare:EU.NL.NTRNL-1123982439" {
		t.Fatalf("deriveV3Identity(aligned) = %q, want the registry's expected did", did)
	}

	// Already aligned (any case): nothing changes.
	if _, changed := alignPartyIDWithCertificate("eu.nl.ntrnl-1123982439", x5c); changed {
		t.Fatal("an id that already matches the certificate must be kept")
	}
	// No certificate, or an unparsable one: the given id is kept verbatim.
	if got, changed := alignPartyIDWithCertificate("EU.EORI.NL.KVK1123982439", ""); changed || got != "EU.EORI.NL.KVK1123982439" {
		t.Fatalf("without a certificate the id must be kept, got %q changed=%t", got, changed)
	}
	if got, changed := alignPartyIDWithCertificate("EU.EORI.NL.KVK1123982439", "garbage"); changed || got != "EU.EORI.NL.KVK1123982439" {
		t.Fatalf("with an unparsable certificate the id must be kept, got %q changed=%t", got, changed)
	}
}

func testX5CWithOrganizationIdentifier(t *testing.T, identifier string) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(3),
		Subject: pkix.Name{
			CommonName:   "JoostTest",
			Organization: []string{"testorg"},
			Country:      []string{"NL"},
			ExtraNames:   []pkix.AttributeTypeAndValue{{Type: asn1.ObjectIdentifier{2, 5, 4, 97}, Value: identifier}},
		},
		NotBefore: time.Now().Add(-time.Hour),
		NotAfter:  time.Now().Add(time.Hour),
		KeyUsage:  x509.KeyUsageDigitalSignature,
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}
	return base64.StdEncoding.EncodeToString(der)
}
