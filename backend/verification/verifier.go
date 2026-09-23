package verification

import (
	"crypto"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Verifier turns an inbound vp_token into onboarding form values. Every
// credential must clear the same gate: an accepted type, an issuer the operator
// trusts, a signature made by a key that issuer publishes, a validity window
// that contains now, and a status list that does not mark it revoked.

// allowedAlgorithms is the signature allow-list. It is explicit so that "none"
// (and any other downgrade) can never be negotiated by the token itself.
var allowedAlgorithms = []string{
	"ES256", "ES384", "ES512",
	"RS256", "RS384", "RS512",
	"PS256", "PS384", "PS512",
	"EdDSA",
}

// Expectation carries the per-session values a presentation must echo back.
// They come from the OID4VP authorization request the portal issued.
type Expectation struct {
	// Nonce is the value the portal generated for this session. When the wallet
	// secures the presentation, the nonce must appear in it; replaying an old
	// presentation then fails.
	Nonce string
	// Audience is the portal's client identifier for this session.
	Audience string
}

// VerifiedCredential is one credential that passed every check.
type VerifiedCredential struct {
	Types      []string       `json:"types"`
	Type       string         `json:"type"`
	Label      string         `json:"label,omitempty"`
	Issuer     string         `json:"issuer"`
	IssuerName string         `json:"issuerName,omitempty"`
	Subject    string         `json:"subject,omitempty"`
	ValidFrom  *time.Time     `json:"validFrom,omitempty"`
	ValidUntil *time.Time     `json:"validUntil,omitempty"`
	Claims     map[string]any `json:"-"`
}

// Result is what the onboarding form consumes.
type Result struct {
	Holder      string               `json:"holder,omitempty"`
	Credentials []VerifiedCredential `json:"credentials"`
	// Fields maps an onboarding field name to the verified value for it.
	Fields map[string]string `json:"fields"`
	// FieldSources records which credential type supplied each field, so the UI
	// and the admin review can show provenance.
	FieldSources map[string]string `json:"fieldSources"`
	// IdentitySatisfied is true when the presentation supplied an identity proof
	// (x509 certificate or IdP assertion) that can serve as the mandatory v3
	// identity claim. When false the onboarding stays partial: the applicant
	// still has to upload a certificate or sign in with eHerkenning.
	IdentitySatisfied bool `json:"identitySatisfied"`
	// Warnings are non-fatal observations worth showing an operator.
	Warnings []string `json:"warnings,omitempty"`
	// VerifiedAt is when the presentation cleared verification.
	VerifiedAt time.Time `json:"verifiedAt"`
}

// Verifier performs presentation verification against a trust policy.
type Verifier struct {
	Policy TrustPolicy
	Keys   KeyResolver
	Status StatusChecker
	// Now is injectable so tests can pin the validation instant.
	Now func() time.Time
}

func NewVerifier(policy TrustPolicy) *Verifier {
	return &Verifier{
		Policy: policy,
		Keys:   NewHTTPKeyResolver(),
		Status: NewHTTPStatusChecker(),
		Now:    time.Now,
	}
}

func (v *Verifier) now() time.Time {
	if v.Now != nil {
		return v.Now()
	}
	return time.Now()
}

// Verify checks a vp_token end to end and projects it onto onboarding fields.
// It does not decide whether VCs are offered on a given flow — callers check
// the flow's identity verification methods before they get here.
func (v *Verifier) Verify(rawPresentation []byte, expect Expectation) (*Result, error) {
	parsed, err := ParsePresentation(rawPresentation)
	if err != nil {
		return nil, err
	}

	result := &Result{
		Holder:       parsed.Presentation.HolderID(),
		Fields:       map[string]string{},
		FieldSources: map[string]string{},
		VerifiedAt:   v.now(),
	}

	if err := v.checkHolderBinding(parsed, expect, result); err != nil {
		return nil, err
	}

	for i, token := range parsed.CredentialJWTs {
		credential, err := v.verifyCredential(token)
		if err != nil {
			return nil, fmt.Errorf("credential %d of %d: %w", i+1, len(parsed.CredentialJWTs), err)
		}
		result.Credentials = append(result.Credentials, *credential)
	}
	if len(result.Credentials) == 0 {
		return nil, fmt.Errorf("presentation carried no acceptable credentials")
	}

	v.applyMappings(result)
	sort.Strings(result.Warnings)
	return result, nil
}

// checkHolderBinding verifies the presentation's own signature when it has one.
// The published iSHARE presentations are unsecured — the credentials carry the
// proofs — so an unsecured presentation is accepted by default but recorded as
// a warning, because without it the nonce cannot be cryptographically bound.
func (v *Verifier) checkHolderBinding(parsed *ParsedPresentation, expect Expectation, result *Result) error {
	if parsed.PresentationJWT == "" {
		if v.Policy.RequireHolderBinding {
			return fmt.Errorf("presentation is not signed by the holder, which this deployment requires")
		}
		result.Warnings = append(result.Warnings,
			"The presentation itself was not signed by the holder, so the session nonce could not be cryptographically bound. Each credential's own signature was still verified.")
		return nil
	}

	payload, err := DecodeJWTPayload(parsed.PresentationJWT)
	if err != nil {
		return fmt.Errorf("presentation token is unreadable: %w", err)
	}
	var claims struct {
		Nonce    string          `json:"nonce"`
		Audience json.RawMessage `json:"aud"`
		Issuer   string          `json:"iss"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return fmt.Errorf("presentation claims are unreadable: %w", err)
	}
	if expect.Nonce != "" && claims.Nonce != expect.Nonce {
		return fmt.Errorf("presentation nonce does not match this session")
	}
	if expect.Audience != "" && !audienceContains(claims.Audience, expect.Audience) {
		return fmt.Errorf("presentation was not addressed to this verifier")
	}

	// The holder's key is resolved through the same trust machinery as an
	// issuer's. A holder we cannot resolve is a warning, not a failure: the
	// credentials inside still carry issuer signatures, which is the claim we
	// actually rely on for pre-filling.
	holder := result.Holder
	if holder == "" {
		holder = claims.Issuer
	}
	if err := v.verifyPresentationSignature(parsed.PresentationJWT, holder); err != nil {
		if v.Policy.RequireHolderBinding {
			return fmt.Errorf("holder binding failed: %w", err)
		}
		result.Warnings = append(result.Warnings, "Holder binding could not be verified: "+err.Error())
	}
	return nil
}

func (v *Verifier) verifyPresentationSignature(token, holder string) error {
	if strings.TrimSpace(holder) == "" {
		return fmt.Errorf("presentation names no holder")
	}
	if v.Keys == nil {
		return fmt.Errorf("no key resolver configured")
	}
	// A holder is not an issuer, so it has no trust-list entry; only did:web
	// holders resolve without configuration.
	_, err := v.parseAndVerify(token, func(kid string) (crypto.PublicKey, error) {
		return v.Keys.ResolveKey(holder, kid, "")
	})
	return err
}

// verifyCredential runs the full gate for one vc+jwt.
func (v *Verifier) verifyCredential(token string) (*VerifiedCredential, error) {
	// Decode before verifying, purely to learn which key and policy apply. No
	// value read here is trusted until the signature check below succeeds.
	payload, err := DecodeJWTPayload(token)
	if err != nil {
		return nil, fmt.Errorf("credential is not a readable JWT: %w", err)
	}
	body, err := credentialBody(payload)
	if err != nil {
		return nil, err
	}

	types := credentialTypes(body)
	if len(types) == 0 {
		return nil, fmt.Errorf("credential declares no type")
	}
	accepted := v.Policy.FindType(types)
	if accepted == nil {
		return nil, fmt.Errorf("credential type %s is not accepted by this deployment", strings.Join(types, ", "))
	}

	issuer := issuerID(body["issuer"])
	if issuer == "" {
		return nil, fmt.Errorf("%s names no issuer", accepted.Type)
	}
	trusted := accepted.IssuerEntry(issuer)
	if trusted == nil {
		return nil, fmt.Errorf("issuer %s is not trusted for %s on this deployment", issuer, accepted.Type)
	}

	if _, err := v.parseAndVerify(token, func(kid string) (crypto.PublicKey, error) {
		return v.Keys.ResolveKey(issuer, kid, trusted.ResolverURL)
	}); err != nil {
		return nil, fmt.Errorf("%s from %s failed signature verification: %w", accepted.Type, issuer, err)
	}

	validFrom, validUntil, err := v.checkValidity(body)
	if err != nil {
		return nil, fmt.Errorf("%s from %s: %w", accepted.Type, issuer, err)
	}

	if err := v.checkStatus(body); err != nil {
		return nil, fmt.Errorf("%s from %s: %w", accepted.Type, issuer, err)
	}

	return &VerifiedCredential{
		Types:      types,
		Type:       accepted.Type,
		Label:      accepted.Label,
		Issuer:     issuer,
		IssuerName: trusted.Name,
		Subject:    subjectID(body["credentialSubject"]),
		ValidFrom:  validFrom,
		ValidUntil: validUntil,
		Claims:     body,
	}, nil
}

// parseAndVerify checks the compact JWS with a key chosen by the token's kid,
// restricted to the algorithm allow-list.
func (v *Verifier) parseAndVerify(token string, resolve func(kid string) (crypto.PublicKey, error)) (*jwt.Token, error) {
	if v.Keys == nil {
		return nil, fmt.Errorf("no key resolver configured")
	}
	return jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
		kid, _ := t.Header["kid"].(string)
		return resolve(kid)
	},
		jwt.WithValidMethods(allowedAlgorithms),
		// The VC body carries its own validity window (validFrom/validUntil),
		// which checkValidity enforces; registered JWT time claims are still
		// honoured by the library when present.
		jwt.WithTimeFunc(v.now),
	)
}

// checkValidity enforces the credential's own validity window.
func (v *Verifier) checkValidity(body map[string]any) (*time.Time, *time.Time, error) {
	now := v.now()
	var from, until *time.Time

	if parsed, ok := parseTime(body["validFrom"]); ok {
		from = &parsed
		if now.Before(parsed) {
			return nil, nil, fmt.Errorf("credential is not valid until %s", parsed.UTC().Format(time.RFC3339))
		}
	}
	if parsed, ok := parseTime(body["validUntil"]); ok {
		until = &parsed
		if now.After(parsed) {
			return nil, nil, fmt.Errorf("credential expired on %s", parsed.UTC().Format(time.RFC3339))
		}
	}
	return from, until, nil
}

// checkStatus applies the configured revocation policy to every status entry.
func (v *Verifier) checkStatus(body map[string]any) error {
	mode := strings.TrimSpace(v.Policy.StatusCheck)
	if mode == "" {
		mode = StatusCheckSoft
	}
	if mode == StatusCheckOff {
		return nil
	}
	entries, err := statusEntries(body["credentialStatus"])
	if err != nil {
		return err
	}
	if len(entries) == 0 {
		if mode == StatusCheckRequired {
			return fmt.Errorf("credential carries no status list but revocation checking is required")
		}
		return nil
	}
	if v.Status == nil {
		if mode == StatusCheckRequired {
			return fmt.Errorf("no status checker configured but revocation checking is required")
		}
		return nil
	}
	for _, entry := range entries {
		purposes, err := v.Status.Check(entry)
		if err != nil {
			if mode == StatusCheckRequired {
				return fmt.Errorf("revocation status could not be established: %w", err)
			}
			// Soft mode: an unreachable list must not block onboarding, but a
			// readable list that says "revoked" still fails below.
			continue
		}
		if len(purposes) > 0 {
			return fmt.Errorf("credential is marked %s by its issuer", strings.Join(purposes, " and "))
		}
	}
	return nil
}

// applyMappings projects every verified credential onto onboarding fields. The
// first credential to supply a field wins, so presentation order decides
// precedence when two credentials carry the same claim.
func (v *Verifier) applyMappings(result *Result) {
	for _, credential := range result.Credentials {
		accepted := v.Policy.FindType(credential.Types)
		if accepted == nil {
			continue
		}
		for _, mapping := range accepted.Mappings {
			if !MappableFields[mapping.Field] {
				continue
			}
			if _, taken := result.Fields[mapping.Field]; taken {
				continue
			}
			raw, ok := ExtractPath(credential.Claims, mapping.Path)
			if !ok {
				continue
			}
			value, ok := StringValue(raw)
			if !ok {
				continue
			}
			result.Fields[mapping.Field] = value
			result.FieldSources[mapping.Field] = credential.Type
			if IdentityFields[mapping.Field] {
				result.IdentitySatisfied = true
			}
		}
	}
}

// credentialBody unwraps the JWT payload into the credential object: the iSHARE
// profile puts the credential at the top level, while the older JWT-VC profile
// nests it under a `vc` claim.
func credentialBody(payload []byte) (map[string]any, error) {
	var body map[string]any
	if err := json.Unmarshal(payload, &body); err != nil {
		return nil, fmt.Errorf("credential claims are not a JSON object: %w", err)
	}
	if nested, ok := body["vc"].(map[string]any); ok {
		// Carry the registered claims that only exist on the envelope.
		for _, key := range []string{"iss", "sub", "exp", "nbf", "iat"} {
			if _, present := nested[key]; !present {
				if value, ok := body[key]; ok {
					nested[key] = value
				}
			}
		}
		return nested, nil
	}
	return body, nil
}

func credentialTypes(body map[string]any) []string {
	switch typed := body["type"].(type) {
	case string:
		return []string{typed}
	case []any:
		types := make([]string, 0, len(typed))
		for _, element := range typed {
			if s, ok := element.(string); ok {
				types = append(types, s)
			}
		}
		return types
	}
	return nil
}

// issuerID reads the `issuer`, which the data model allows to be a string or an
// object with an id. It falls back to nothing rather than guessing.
func issuerID(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case map[string]any:
		if id, ok := typed["id"].(string); ok {
			return strings.TrimSpace(id)
		}
	}
	return ""
}

func subjectID(value any) string {
	switch typed := value.(type) {
	case map[string]any:
		if id, ok := typed["id"].(string); ok {
			return strings.TrimSpace(id)
		}
	case []any:
		if len(typed) > 0 {
			return subjectID(typed[0])
		}
	}
	return ""
}

// statusEntries normalises credentialStatus, which may be absent, a single
// entry, or an array of entries.
func statusEntries(value any) ([]CredentialStatus, error) {
	if value == nil {
		return nil, nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, fmt.Errorf("credentialStatus is unreadable")
	}
	var single CredentialStatus
	if err := json.Unmarshal(raw, &single); err == nil && single.StatusListCredential != "" {
		return []CredentialStatus{single}, nil
	}
	var many []CredentialStatus
	if err := json.Unmarshal(raw, &many); err == nil {
		return many, nil
	}
	return nil, fmt.Errorf("credentialStatus is malformed")
}

func parseTime(value any) (time.Time, bool) {
	s, ok := value.(string)
	if !ok || strings.TrimSpace(s) == "" {
		return time.Time{}, false
	}
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(s))
	if err != nil {
		return time.Time{}, false
	}
	return parsed, true
}

func audienceContains(raw json.RawMessage, want string) bool {
	if len(raw) == 0 {
		return false
	}
	var single string
	if err := json.Unmarshal(raw, &single); err == nil {
		return single == want
	}
	var many []string
	if err := json.Unmarshal(raw, &many); err == nil {
		for _, value := range many {
			if value == want {
				return true
			}
		}
	}
	return false
}
