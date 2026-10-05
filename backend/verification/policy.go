package verification

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
)

// The trust policy is what makes VC onboarding configurable rather than
// hard-coded: an operator declares which credential types this deployment
// accepts, which issuers may sign them, and how each credential's claims land
// on the onboarding form. Defaults ship for the iSHARE v3 credential profile
// (schemas.ishare.eu/v3) and for EUDI-wallet organisational credentials, and an
// operator can add, edit or disable any entry from the Onboarding settings tab.

// Onboarding form fields a mapping may target. The list is closed on purpose:
// a mapping is admin-supplied configuration, and a typo should be rejected at
// save time rather than silently dropping a claim — or writing somewhere the
// onboarding form does not expect.
const (
	FieldCompanyName     = "idCheck.companyName"
	FieldKvkNumber       = "idCheck.kvkNumber"
	FieldPartyID         = "idCheck.partyId"
	FieldPartyName       = "idCheck.partyName"
	FieldCertSubjectName = "idCheck.certSubjectName"
	FieldCertX5c         = "idCheck.certX5c"
	FieldCertX5tS256     = "idCheck.certX5tS256"
	FieldIdpAssertion    = "idCheck.idpAssertion"

	FieldAddress = "location.address"
	FieldZipCode = "location.zipCode"
	FieldCity    = "location.city"
	FieldCountry = "location.country"
	FieldWebsite = "location.website"

	FieldAuthRegistry     = "association.authRegistry"
	FieldAuthRegistryName = "association.authRegistryName"
	FieldAuthRegistryURL  = "association.authRegistryUrl"
	FieldCapabilitiesURL  = "association.capabilitiesUrl"

	FieldContactName  = "account.name"
	FieldContactEmail = "account.email"
	FieldContactPhone = "account.phone"
)

// Credential paths shared by the default mappings of the iSHARE v3 profile.
const (
	pathCredentialSubjectID   = "credentialSubject.id"
	pathCredentialSubjectName = "credentialSubject.name"
)

// MappableFields is the closed set of targets a ClaimMapping may write to.
var MappableFields = map[string]bool{
	FieldCompanyName: true, FieldKvkNumber: true, FieldPartyID: true,
	FieldPartyName: true, FieldCertSubjectName: true, FieldCertX5c: true,
	FieldCertX5tS256: true, FieldIdpAssertion: true,
	FieldAddress: true, FieldZipCode: true, FieldCity: true,
	FieldCountry: true, FieldWebsite: true,
	FieldAuthRegistry: true, FieldAuthRegistryName: true,
	FieldAuthRegistryURL: true, FieldCapabilitiesURL: true,
	FieldContactName: true, FieldContactEmail: true, FieldContactPhone: true,
}

// IdentityFields are the mapping targets that can satisfy the satellite's
// mandatory v3 identity claim. A presentation that fills one of these lets the
// applicant skip the certificate upload / eHerkenning step entirely; one that
// does not is still useful, but the onboarding stays partial.
var IdentityFields = map[string]bool{
	FieldCertX5c: true, FieldIdpAssertion: true,
}

// TrustedIssuer is one issuer allowed to sign an accepted credential type.
type TrustedIssuer struct {
	// DID is the credential's `issuer` value, matched exactly. "*" trusts any
	// issuer, which is only sane for a closed test deployment.
	DID  string `json:"did"`
	Name string `json:"name,omitempty"`
	// ResolverURL is where this issuer publishes its DID document or JWKS.
	// Required for did:ishare (which has no universal resolution rule); optional
	// for did:web, which resolves from the identifier itself. Because an operator
	// sets this, it may point at an internal service and is not SSRF-guarded.
	ResolverURL string `json:"resolverUrl,omitempty"`
}

// ClaimMapping projects one value out of a verified credential onto one
// onboarding form field.
type ClaimMapping struct {
	// Path is a dotted path into the credential payload, with optional numeric
	// indices: "credentialSubject.frameworks[0].capabilityUrl".
	Path string `json:"path"`
	// Field is one of MappableFields.
	Field string `json:"field"`
}

// AcceptedCredentialType is one credential this deployment will accept.
type AcceptedCredentialType struct {
	// Type activates the entry when it appears in the credential's `type` array.
	Type    string `json:"type"`
	Label   string `json:"label,omitempty"`
	Enabled bool   `json:"enabled"`
	// Issuers allowed to sign this type. Empty means nothing is trusted, so the
	// type is effectively off — a safer default than "any issuer".
	Issuers  []TrustedIssuer `json:"issuers"`
	Mappings []ClaimMapping  `json:"mappings"`
}

// TrustPolicy is the whole VC-onboarding configuration.
//
// Whether VCs are offered at all is NOT part of the policy: that is decided by
// the identity verification methods a deployment or onboarding flow enables
// (models.IdentityMethodVC). The policy only says what counts as trustworthy
// once they are.
type TrustPolicy struct {
	// StatusCheck is one of StatusCheckRequired / StatusCheckSoft / StatusCheckOff.
	StatusCheck string `json:"statusCheck"`
	// RequireHolderBinding rejects an unsecured presentation. The published
	// iSHARE examples present unsecured VPs (the credentials carry the proofs),
	// so this defaults to false; turn it on for wallets that sign the VP.
	RequireHolderBinding bool `json:"requireHolderBinding"`
	// AcceptedTypes is the credential-type registry.
	AcceptedTypes []AcceptedCredentialType `json:"acceptedTypes"`
}

// FindType returns the configuration for the first accepted type present in the
// credential's type array.
func (p *TrustPolicy) FindType(credentialTypes []string) *AcceptedCredentialType {
	for i := range p.AcceptedTypes {
		accepted := &p.AcceptedTypes[i]
		if !accepted.Enabled {
			continue
		}
		for _, t := range credentialTypes {
			if t == accepted.Type {
				return accepted
			}
		}
	}
	return nil
}

// IssuerEntry returns the trusted-issuer entry matching did, honouring a "*"
// wildcard entry as a catch-all.
func (a *AcceptedCredentialType) IssuerEntry(did string) *TrustedIssuer {
	var wildcard *TrustedIssuer
	for i := range a.Issuers {
		issuer := &a.Issuers[i]
		if issuer.DID == did {
			return issuer
		}
		if issuer.DID == "*" {
			wildcard = issuer
		}
	}
	return wildcard
}

// Validate reports configuration errors an operator should see at save time.
func (p *TrustPolicy) Validate() error {
	if err := validateStatusCheck(p.StatusCheck); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, accepted := range p.AcceptedTypes {
		name := strings.TrimSpace(accepted.Type)
		if name == "" {
			return fmt.Errorf("a credential type entry is missing its type")
		}
		if seen[name] {
			return fmt.Errorf("credential type %q is configured twice", name)
		}
		seen[name] = true
		if err := accepted.validate(name); err != nil {
			return err
		}
	}
	return nil
}

func validateStatusCheck(value string) error {
	switch strings.TrimSpace(value) {
	case "", StatusCheckRequired, StatusCheckSoft, StatusCheckOff:
		return nil
	default:
		return fmt.Errorf("statusCheck must be one of %q, %q or %q", StatusCheckRequired, StatusCheckSoft, StatusCheckOff)
	}
}

// validate checks one accepted type's issuers and mappings; name is the trimmed
// type used to attribute the error.
func (a *AcceptedCredentialType) validate(name string) error {
	for _, issuer := range a.Issuers {
		if err := issuer.validate(name); err != nil {
			return err
		}
	}
	for _, mapping := range a.Mappings {
		if err := mapping.validate(name); err != nil {
			return err
		}
	}
	return nil
}

func (i *TrustedIssuer) validate(name string) error {
	if strings.TrimSpace(i.DID) == "" {
		return fmt.Errorf("%s: an issuer entry is missing its DID", name)
	}
	resolverURL := strings.TrimSpace(i.ResolverURL)
	if resolverURL != "" && !isHTTPURL(resolverURL) {
		return fmt.Errorf("%s: resolver URL for %q must be http(s)", name, i.DID)
	}
	if resolverURL == "" && !strings.HasPrefix(i.DID, "did:web:") && i.DID != "*" {
		return fmt.Errorf("%s: issuer %q needs a resolver URL (only did:web resolves without one)", name, i.DID)
	}
	return nil
}

func (m *ClaimMapping) validate(name string) error {
	if strings.TrimSpace(m.Path) == "" {
		return fmt.Errorf("%s: a mapping is missing its credential path", name)
	}
	if !MappableFields[m.Field] {
		return fmt.Errorf("%s: %q is not an onboarding field that can be pre-filled", name, m.Field)
	}
	return nil
}

// ExtractPath walks a dotted path with optional numeric indices through a
// decoded JSON document. It returns the value and whether the path resolved.
func ExtractPath(document any, path string) (any, bool) {
	current := document
	for _, segment := range strings.Split(strings.TrimSpace(path), ".") {
		if segment == "" {
			return nil, false
		}
		name, indices := splitIndices(segment)
		var ok bool
		if current, ok = descendField(current, name); !ok {
			return nil, false
		}
		if current, ok = descendIndices(current, indices); !ok {
			return nil, false
		}
	}
	return current, true
}

// descendField steps into an object member; an empty name is a pure index
// segment ("[0]") and leaves the value untouched.
func descendField(current any, name string) (any, bool) {
	if name == "" {
		return current, true
	}
	object, ok := current.(map[string]any)
	if !ok {
		return nil, false
	}
	value, ok := object[name]
	return value, ok
}

// descendIndices steps through consecutive array indices ("[0][1]").
func descendIndices(current any, indices []int) (any, bool) {
	for _, index := range indices {
		list, ok := current.([]any)
		if !ok || index < 0 || index >= len(list) {
			return nil, false
		}
		current = list[index]
	}
	return current, true
}

// splitIndices separates "frameworks[0][1]" into "frameworks" and [0 1].
func splitIndices(segment string) (string, []int) {
	name, rest, found := strings.Cut(segment, "[")
	if !found {
		return segment, nil
	}
	var indices []int
	for rest != "" {
		value, remainder, closed := strings.Cut(rest, "]")
		if !closed {
			break
		}
		index, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil {
			break
		}
		indices = append(indices, index)
		rest = strings.TrimPrefix(remainder, "[")
	}
	return name, indices
}

// StringValue renders an extracted claim as the string the onboarding form
// expects. Arrays collapse to their first usable element, which is what the
// x5c mapping needs: the VC profile models x5c as an array while the portal's
// v3 identity claim carries a single base64 certificate.
func StringValue(value any) (string, bool) {
	switch typed := value.(type) {
	case string:
		trimmed := strings.TrimSpace(typed)
		return trimmed, trimmed != ""
	case bool:
		return strconv.FormatBool(typed), true
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64), true
	case json.Number:
		return typed.String(), true
	case []any:
		for _, element := range typed {
			if s, ok := StringValue(element); ok {
				return s, true
			}
		}
	}
	return "", false
}

// DefaultTrustPolicy is the starting configuration an operator edits. It
// enumerates the iSHARE v3 credential types and an EUDI-wallet organisational
// profile, with mappings wired to the real schema field names but with NO
// trusted issuers: nothing verifies until an operator names the issuers their
// dataspace trusts, even once VCs are enabled as an identity method.
func DefaultTrustPolicy() TrustPolicy {
	return TrustPolicy{
		StatusCheck: StatusCheckSoft,
		AcceptedTypes: []AcceptedCredentialType{
			{
				Type:    "TrustedParticipantCredential",
				Label:   "iSHARE Trusted Participant",
				Enabled: true,
				Mappings: []ClaimMapping{
					{Path: pathCredentialSubjectID, Field: FieldPartyID},
					{Path: pathCredentialSubjectName, Field: FieldPartyName},
					{Path: pathCredentialSubjectName, Field: FieldCompanyName},
					{Path: "credentialSubject.frameworks[0].capabilityUrl", Field: FieldCapabilitiesURL},
					{Path: "credentialSubject.frameworks[0].additionalInfo.website", Field: FieldWebsite},
					{Path: "credentialSubject.frameworks[0].additionalInfo.companyEmail", Field: FieldContactEmail},
					{Path: "credentialSubject.frameworks[0].additionalInfo.companyPhone", Field: FieldContactPhone},
					// Identity proof, when the credential carries it: these let the
					// applicant skip the certificate upload entirely.
					{Path: "credentialSubject.frameworks[0].x509Certificates[0].x5c[0]", Field: FieldCertX5c},
					{Path: "credentialSubject.frameworks[0].x509Certificates[0].subjectName", Field: FieldCertSubjectName},
					{Path: "credentialSubject.frameworks[0].x509Certificates[0].x5t#s256", Field: FieldCertX5tS256},
					{Path: "credentialSubject.frameworks[0].idpAssertions[0].assertion", Field: FieldIdpAssertion},
				},
			},
			{
				Type:    "PartyIdCredential",
				Label:   "iSHARE Party Identifier",
				Enabled: true,
				Mappings: []ClaimMapping{
					{Path: pathCredentialSubjectID, Field: FieldPartyID},
					{Path: pathCredentialSubjectName, Field: FieldPartyName},
					{Path: pathCredentialSubjectName, Field: FieldCompanyName},
				},
			},
			{
				Type:    "DataspaceParticipantCredential",
				Label:   "iSHARE Dataspace Participant",
				Enabled: true,
				Mappings: []ClaimMapping{
					{Path: pathCredentialSubjectID, Field: FieldPartyID},
					{Path: pathCredentialSubjectName, Field: FieldPartyName},
					{Path: pathCredentialSubjectName, Field: FieldCompanyName},
				},
			},
			{
				Type:    "FrameworkComplianceCredential",
				Label:   "iSHARE Framework Compliance",
				Enabled: true,
				Mappings: []ClaimMapping{
					{Path: pathCredentialSubjectID, Field: FieldPartyID},
					{Path: "credentialSubject.frameworks[0].capabilityUrl", Field: FieldCapabilitiesURL},
					{Path: "credentialSubject.frameworks[0].additionalInfo.website", Field: FieldWebsite},
					{Path: "credentialSubject.frameworks[0].additionalInfo.companyEmail", Field: FieldContactEmail},
					{Path: "credentialSubject.frameworks[0].additionalInfo.companyPhone", Field: FieldContactPhone},
					{Path: "credentialSubject.frameworks[0].x509Certificates[0].x5c[0]", Field: FieldCertX5c},
					{Path: "credentialSubject.frameworks[0].x509Certificates[0].subjectName", Field: FieldCertSubjectName},
					{Path: "credentialSubject.frameworks[0].x509Certificates[0].x5t#s256", Field: FieldCertX5tS256},
				},
			},
			{
				// EUDI-wallet organisational identity. There is no iSHARE schema for
				// this one, so the mapping follows the EUDI Legal Person profile and
				// is the entry an operator is most likely to adjust to their issuer.
				Type:    "LegalPersonIdentificationData",
				Label:   "EUDI Legal Person (LPID)",
				Enabled: false,
				Mappings: []ClaimMapping{
					{Path: "credentialSubject.legalPersonIdentifier", Field: FieldPartyID},
					{Path: "credentialSubject.legalName", Field: FieldPartyName},
					{Path: "credentialSubject.legalName", Field: FieldCompanyName},
					{Path: "credentialSubject.registeredAddress.streetAddress", Field: FieldAddress},
					{Path: "credentialSubject.registeredAddress.postCode", Field: FieldZipCode},
					{Path: "credentialSubject.registeredAddress.locality", Field: FieldCity},
					{Path: "credentialSubject.registeredAddress.country", Field: FieldCountry},
					{Path: "credentialSubject.contactEmail", Field: FieldContactEmail},
					{Path: "credentialSubject.contactPhone", Field: FieldContactPhone},
				},
			},
		},
	}
}
