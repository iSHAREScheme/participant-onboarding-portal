package satellite

import (
	"crypto/x509"
	"encoding/asn1"
	"regexp"
	"strings"
)

var (
	oidOrganizationIdentifier = asn1.ObjectIdentifier{2, 5, 4, 97}
	ntrCountryPrefix          = regexp.MustCompile(`^NTR([A-Z]{2})`)
	legacyKVKIdentifier       = regexp.MustCompile(`(?i)(?:^|[^A-Z0-9])KVK[\s.-]*(\d{8,})(?:$|[^0-9])`)
)

// OrganizationIdentifierFromX5C returns the organisation identifier of the leaf
// certificate in x5c: the ETSI EN 319 412-1 organizationIdentifier attribute
// (OID 2.5.4.97), falling back to the legacy serialNumber attribute the registry
// also accepts. Empty when the certificate carries neither.
func OrganizationIdentifierFromX5C(x5c string) (string, error) {
	cert, err := parseFirstX5CCertificate(x5c)
	if err != nil {
		return "", err
	}
	return organizationIdentifierFromCertificate(cert), nil
}

func organizationIdentifierFromCertificate(cert *x509.Certificate) string {
	for _, attribute := range cert.Subject.Names {
		if attribute.Type.Equal(oidOrganizationIdentifier) {
			if value, ok := attribute.Value.(string); ok && strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value)
			}
		}
	}
	return strings.TrimSpace(cert.Subject.SerialNumber)
}

// PartyIDFromOrganizationIdentifier derives the party id a registry requires for
// a party registered with a certificate carrying this organisation identifier.
// It mirrors the v3 satellite's alignment rule (calcIshareDid: the id must be
// did:ishare:EU.<CC>.<identifier> for an NTR<CC>… identifier) and the wizard's
// certificate parser, so the backend can make a proposal's id follow its
// certificate no matter what the form ended up with:
//
//	NTRNL-12345678            -> EU.NL.NTRNL-12345678
//	NTRNL-KVK-10000001        -> EU.NL.NTRNL-KVK-10000001
//	did:ishare:… / EU.EORI.…  -> unchanged
//	…KVK12345678… (legacy)    -> EU.EORI.NL.KVK12345678
//	anything else             -> the identifier itself
//
// Empty in, empty out.
func PartyIDFromOrganizationIdentifier(identifier string) string {
	identifier = strings.TrimSpace(identifier)
	if identifier == "" {
		return ""
	}
	lower := strings.ToLower(identifier)
	if strings.HasPrefix(lower, "did:ishare:") || strings.HasPrefix(strings.ToUpper(identifier), "EU.EORI.") {
		return identifier
	}
	if m := ntrCountryPrefix.FindStringSubmatch(identifier); m != nil {
		return "EU." + m[1] + "." + identifier
	}
	if m := legacyKVKIdentifier.FindStringSubmatch(identifier); m != nil {
		return "EU.EORI.NL.KVK" + m[1]
	}
	return identifier
}
