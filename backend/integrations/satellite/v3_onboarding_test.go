package satellite

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"math/big"
	"onboardingportal/models"
	"testing"
	"time"
)

func testCertificateX5C(t *testing.T, subject pkix.Name) (string, string) {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}

	template := &x509.Certificate{
		SerialNumber: big.NewInt(42),
		Subject:      subject,
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
	}

	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create certificate: %v", err)
	}

	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse certificate: %v", err)
	}

	return base64.StdEncoding.EncodeToString(der), parsed.Subject.String()
}

func minimalV3ClaimConfig() V3OnboardingClaimConfig {
	return V3OnboardingClaimConfig{
		RegistrarID:        "EU.EORI.NL.REGISTRAR",
		FrameworkID:        "iSHARE",
		AgreementType:      "TermsOfUse",
		AgreementID:        "terms",
		AgreementTitle:     "Terms",
		RoleID:             "EntitledParty",
		Loa:                "substantial",
		LegalAdherence:     "yes",
		CompliancyVerified: "no",
		StartDate:          "2026-01-01T00:00:00Z",
		EndDate:            "2027-01-01T00:00:00Z",
	}
}

func TestBuildV3OnboardingClaimsDerivesSubjectNameFromCertificate(t *testing.T) {
	x5c, expectedSubject := testCertificateX5C(t, pkix.Name{
		CommonName:   "Participant 2",
		Organization: []string{"Example Organization"},
		Country:      []string{"NL"},
		SerialNumber: "12345678",
	})

	claims, err := BuildV3OnboardingClaims(&models.Proposal{
		CertSubjectName: "CN=stale frontend formatted value",
		CertX5c:         x5c,
		CertX5tS256:     "thumbprint",
	}, minimalV3ClaimConfig())
	if err != nil {
		t.Fatalf("BuildV3OnboardingClaims returned error: %v", err)
	}

	for _, claim := range claims {
		if claim["type"] != "x509Certificate" {
			continue
		}
		if got := claim["subjectName"]; got != expectedSubject {
			t.Fatalf("subjectName = %q, want %q", got, expectedSubject)
		}
		return
	}

	t.Fatal("x509Certificate claim not found")
}

func TestBuildV3OnboardingClaimsRejectsInvalidX5C(t *testing.T) {
	_, err := BuildV3OnboardingClaims(&models.Proposal{
		CertSubjectName: "CN=ignored",
		CertX5c:         "not a certificate",
		CertX5tS256:     "thumbprint",
	}, minimalV3ClaimConfig())
	if err == nil {
		t.Fatal("expected invalid x5c error")
	}
}
