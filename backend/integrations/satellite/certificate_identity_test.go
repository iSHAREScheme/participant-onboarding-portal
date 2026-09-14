package satellite

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

func testCertificateWithOrganizationIdentifier(t *testing.T, identifier string) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(7),
		Subject: pkix.Name{
			CommonName:   "JoostTest",
			Organization: []string{"testorg"},
			Country:      []string{"NL"},
			ExtraNames: []pkix.AttributeTypeAndValue{
				{Type: asn1.ObjectIdentifier{2, 5, 4, 97}, Value: identifier},
			},
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

func TestOrganizationIdentifierFromX5CReadsTheETSIAttribute(t *testing.T) {
	x5c := testCertificateWithOrganizationIdentifier(t, "NTRNL-1123982439")
	got, err := OrganizationIdentifierFromX5C(x5c)
	if err != nil {
		t.Fatalf("OrganizationIdentifierFromX5C: %v", err)
	}
	if got != "NTRNL-1123982439" {
		t.Fatalf("organizationIdentifier = %q, want NTRNL-1123982439", got)
	}
	if _, err := OrganizationIdentifierFromX5C("not-a-certificate"); err == nil {
		t.Fatal("garbage x5c must be an error, not an empty identifier")
	}
}

// The derived id must be exactly what a v3 satellite's calcIshareDid alignment
// check expects for the certificate, otherwise party creation is rejected with
// "certificate organizationIdentifier does not align with party id".
func TestPartyIDFromOrganizationIdentifierMirrorsTheRegistryRule(t *testing.T) {
	cases := map[string]string{
		"NTRNL-1123982439":                  "EU.NL.NTRNL-1123982439",
		" NTRNL-KVK-10000001 ":              "EU.NL.NTRNL-KVK-10000001",
		"NTRDE-HRB12345":                    "EU.DE.NTRDE-HRB12345",
		"EU.EORI.NLWURAURORA001":            "EU.EORI.NLWURAURORA001",
		"did:ishare:EU.NL.NTRNL-1123982439": "did:ishare:EU.NL.NTRNL-1123982439",
		"KVK12345678":                       "EU.EORI.NL.KVK12345678",
		"VATNL-123456789B01":                "VATNL-123456789B01",
		"":                                  "",
	}
	for identifier, want := range cases {
		if got := PartyIDFromOrganizationIdentifier(identifier); got != want {
			t.Errorf("PartyIDFromOrganizationIdentifier(%q) = %q, want %q", identifier, got, want)
		}
	}
}
