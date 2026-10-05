package verification

import (
	"bytes"
	"compress/gzip"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"crypto"
	"errors"
	"github.com/golang-jwt/jwt/v5"
)

const (
	testIssuerDID = "did:ishare:EU.NL.NTRNL-10000000"
	testKeyID     = testIssuerDID + "#key-1"
	testSubject   = "did:ishare:EU.NL.NTRNL-12345678"
)

// issuerFixture is a signing issuer plus the DID document that publishes its key.
type issuerFixture struct {
	key         *ecdsa.PrivateKey
	resolverURL string
	server      *httptest.Server
}

func newIssuerFixture(t *testing.T) *issuerFixture {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generating key: %v", err)
	}
	fixture := &issuerFixture{key: key}
	fixture.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(didDocumentJSON(key, testIssuerDID, testKeyID))
	}))
	t.Cleanup(fixture.server.Close)
	fixture.resolverURL = fixture.server.URL + "/.well-known/did.json"
	return fixture
}

func didDocumentJSON(key *ecdsa.PrivateKey, did, kid string) []byte {
	doc := map[string]any{
		"id": did,
		"verificationMethod": []any{map[string]any{
			"id":         kid,
			"type":       "JsonWebKey2020",
			"controller": did,
			"publicKeyJwk": map[string]any{
				"kty": "EC",
				"crv": "P-256",
				"kid": kid,
				"x":   base64.RawURLEncoding.EncodeToString(key.PublicKey.X.FillBytes(make([]byte, 32))),
				"y":   base64.RawURLEncoding.EncodeToString(key.PublicKey.Y.FillBytes(make([]byte, 32))),
			},
		}},
	}
	raw, _ := json.Marshal(doc)
	return raw
}

// signCredential produces a vc+jwt exactly as the companion issuer does: ES256,
// typ vc+jwt, a DID-URL kid and no embedded JWK.
func signCredential(t *testing.T, key *ecdsa.PrivateKey, credential map[string]any) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims(credential))
	token.Header["kid"] = testKeyID
	token.Header["typ"] = "vc+jwt"
	signed, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("signing credential: %v", err)
	}
	return signed
}

// trustedParticipantCredential builds a credential shaped like the iSHARE v3
// TrustedParticipantCredential schema.
func trustedParticipantCredential() map[string]any {
	return map[string]any{
		"@context": []any{"https://www.w3.org/ns/credentials/v2"},
		"id":       "urn:uuid:11111111-2222-3333-4444-555555555555",
		"type":     []any{"VerifiableCredential", "TrustedParticipantCredential"},
		"issuer":   map[string]any{"id": testIssuerDID},
		"credentialSubject": map[string]any{
			"id":   testSubject,
			"name": "Acme Logistics BV",
			"frameworks": []any{map[string]any{
				"id":            "iSHARE",
				"capabilityUrl": "https://acme.example.com/capabilities",
				"additionalInfo": map[string]any{
					"website":             "https://acme.example.com",
					"companyEmail":        "ops@acme.example.com",
					"companyPhone":        "+31201234567",
					"publiclyPublishable": true,
				},
			}},
		},
	}
}

func envelopePresentation(credentialJWTs ...string) []byte {
	entries := make([]any, 0, len(credentialJWTs))
	for _, jwtToken := range credentialJWTs {
		entries = append(entries, map[string]any{
			"@context": "https://www.w3.org/ns/credentials/v2",
			"id":       credentialJWTPrefix + jwtToken,
			"type":     TypeEnvelopedCredential,
		})
	}
	raw, _ := json.Marshal(map[string]any{
		"@context":             []any{"https://www.w3.org/ns/credentials/v2"},
		"type":                 []any{TypeVerifiablePresentation, "ParticipantPresentation"},
		"holder":               testSubject,
		"verifiableCredential": entries,
	})
	return raw
}

// policyTrusting returns a policy that accepts the default iSHARE types from
// the fixture issuer.
func policyTrusting(resolverURL string) TrustPolicy {
	policy := DefaultTrustPolicy()
	policy.StatusCheck = StatusCheckSoft
	for i := range policy.AcceptedTypes {
		policy.AcceptedTypes[i].Issuers = []TrustedIssuer{{
			DID:         testIssuerDID,
			Name:        "iSHARE Test Satellite",
			ResolverURL: resolverURL,
		}}
	}
	return policy
}

func TestVerifyMapsCredentialOntoOnboardingFields(t *testing.T) {
	issuer := newIssuerFixture(t)
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))

	presentation := envelopePresentation(signCredential(t, issuer.key, trustedParticipantCredential()))
	result, err := verifier.Verify(presentation, Expectation{})
	if err != nil {
		t.Fatalf("verify: %v", err)
	}

	want := map[string]string{
		FieldPartyID:         testSubject,
		FieldPartyName:       "Acme Logistics BV",
		FieldCompanyName:     "Acme Logistics BV",
		FieldCapabilitiesURL: "https://acme.example.com/capabilities",
		FieldWebsite:         "https://acme.example.com",
		FieldContactEmail:    "ops@acme.example.com",
		FieldContactPhone:    "+31201234567",
	}
	for field, expected := range want {
		if got := result.Fields[field]; got != expected {
			t.Errorf("field %s = %q, want %q", field, got, expected)
		}
	}
	if result.FieldSources[FieldPartyName] != "TrustedParticipantCredential" {
		t.Errorf("provenance = %q, want TrustedParticipantCredential", result.FieldSources[FieldPartyName])
	}
	// This credential carries no x509/idpAssertion, so onboarding stays partial.
	if result.IdentitySatisfied {
		t.Error("IdentitySatisfied should be false without an x509 or IdP assertion claim")
	}
	if len(result.Warnings) == 0 {
		t.Error("an unsecured presentation should warn about missing holder binding")
	}
}

func TestVerifyDetectsIdentityProofInCredential(t *testing.T) {
	issuer := newIssuerFixture(t)
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))

	credential := trustedParticipantCredential()
	frameworks := credential["credentialSubject"].(map[string]any)["frameworks"].([]any)
	frameworks[0].(map[string]any)["x509Certificates"] = []any{map[string]any{
		"id":              "urn:uuid:cert-1",
		"subjectName":     "CN=Acme Logistics BV,O=Acme,C=NL",
		"certificateType": "eSEAL",
		"x5c":             []any{"MIIBdummycertificatebytes"},
		"x5t#s256":        "RGVhZGJlZWY",
	}}

	result, err := verifier.Verify(envelopePresentation(signCredential(t, issuer.key, credential)), Expectation{})
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if !result.IdentitySatisfied {
		t.Fatal("a credential carrying an x509Certificate claim should satisfy the identity requirement")
	}
	if got := result.Fields[FieldCertX5c]; got != "MIIBdummycertificatebytes" {
		t.Errorf("x5c = %q, want the first array element", got)
	}
	if got := result.Fields[FieldCertSubjectName]; got != "CN=Acme Logistics BV,O=Acme,C=NL" {
		t.Errorf("subjectName = %q", got)
	}
	if got := result.Fields[FieldCertX5tS256]; got != "RGVhZGJlZWY" {
		t.Errorf("x5t#s256 = %q (a path segment containing '#' must still resolve)", got)
	}
}

func TestVerifyRejectsUntrustedIssuer(t *testing.T) {
	issuer := newIssuerFixture(t)
	policy := policyTrusting(issuer.resolverURL)
	for i := range policy.AcceptedTypes {
		policy.AcceptedTypes[i].Issuers = []TrustedIssuer{{
			DID:         "did:ishare:EU.NL.NTRNL-99999999",
			ResolverURL: issuer.resolverURL,
		}}
	}
	verifier := NewVerifier(policy)

	_, err := verifier.Verify(envelopePresentation(signCredential(t, issuer.key, trustedParticipantCredential())), Expectation{})
	if err == nil || !strings.Contains(err.Error(), "not trusted") {
		t.Fatalf("expected an untrusted-issuer error, got %v", err)
	}
}

func TestVerifyRejectsForgedSignature(t *testing.T) {
	issuer := newIssuerFixture(t)
	attacker, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("generating attacker key: %v", err)
	}
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))

	// Signed by a key the issuer's DID document does not publish.
	forged := signCredential(t, attacker, trustedParticipantCredential())
	_, err = verifier.Verify(envelopePresentation(forged), Expectation{})
	if err == nil || !strings.Contains(err.Error(), "signature verification") {
		t.Fatalf("expected a signature failure, got %v", err)
	}
}

func TestVerifyRejectsUnsignedAlgorithm(t *testing.T) {
	issuer := newIssuerFixture(t)
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))

	// alg=none with an empty signature must never be accepted.
	token := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims(trustedParticipantCredential()))
	token.Header["kid"] = testKeyID
	unsigned, err := token.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("building alg=none token: %v", err)
	}

	if _, err := verifier.Verify(envelopePresentation(unsigned), Expectation{}); err == nil {
		t.Fatal("alg=none must be rejected")
	}
}

func TestVerifyRejectsExpiredCredential(t *testing.T) {
	issuer := newIssuerFixture(t)
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))

	credential := trustedParticipantCredential()
	credential["validFrom"] = "2020-01-01T00:00:00Z"
	credential["validUntil"] = "2021-01-01T00:00:00Z"

	_, err := verifier.Verify(envelopePresentation(signCredential(t, issuer.key, credential)), Expectation{})
	if err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expected an expiry failure, got %v", err)
	}
}

func TestVerifyRejectsNotYetValidCredential(t *testing.T) {
	issuer := newIssuerFixture(t)
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))

	credential := trustedParticipantCredential()
	credential["validFrom"] = time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)

	_, err := verifier.Verify(envelopePresentation(signCredential(t, issuer.key, credential)), Expectation{})
	if err == nil || !strings.Contains(err.Error(), "not valid until") {
		t.Fatalf("expected a not-yet-valid failure, got %v", err)
	}
}

func TestVerifyRejectsRevokedCredential(t *testing.T) {
	issuer := newIssuerFixture(t)

	// A status list where index 7 is set (MSB-first within the byte).
	bits := make([]byte, 16)
	bits[0] = 1 // bit index 7
	statusServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(w, `{"credentialSubject":{"encodedList":%q}}`, encodeList(bits))
	}))
	defer statusServer.Close()

	credential := trustedParticipantCredential()
	credential["credentialStatus"] = map[string]any{
		"id":                   statusServer.URL + "#7",
		"type":                 "BitstringStatusListEntry",
		"statusPurpose":        "revocation",
		"statusListIndex":      "7",
		"statusListCredential": statusServer.URL,
	}

	verifier := NewVerifier(policyTrusting(issuer.resolverURL))
	// httptest binds to loopback, which the SSRF-guarded default client refuses
	// by design; swap in a plain client so the revocation logic is what is tested.
	verifier.Status = &HTTPStatusChecker{Client: statusServer.Client()}

	_, err := verifier.Verify(envelopePresentation(signCredential(t, issuer.key, credential)), Expectation{})
	if err == nil || !strings.Contains(err.Error(), "revocation") {
		t.Fatalf("expected a revocation failure, got %v", err)
	}
}

func TestVerifyAcceptsUnrevokedCredential(t *testing.T) {
	issuer := newIssuerFixture(t)
	statusServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprintf(w, `{"credentialSubject":{"encodedList":%q}}`, encodeList(make([]byte, 16)))
	}))
	defer statusServer.Close()

	credential := trustedParticipantCredential()
	credential["credentialStatus"] = map[string]any{
		"type":                 "BitstringStatusListEntry",
		"statusPurpose":        "revocation",
		"statusListIndex":      "7",
		"statusListCredential": statusServer.URL,
	}

	verifier := NewVerifier(policyTrusting(issuer.resolverURL))
	verifier.Status = &HTTPStatusChecker{Client: statusServer.Client()}

	if _, err := verifier.Verify(envelopePresentation(signCredential(t, issuer.key, credential)), Expectation{}); err != nil {
		t.Fatalf("an unrevoked credential should verify: %v", err)
	}
}

func TestVerifyRejectsUnsecuredEmbeddedCredential(t *testing.T) {
	issuer := newIssuerFixture(t)
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))

	// A plain JSON credential with no proof: accepting it would let an applicant
	// pre-fill the form with self-asserted data.
	raw, _ := json.Marshal(map[string]any{
		"@context":             []any{"https://www.w3.org/ns/credentials/v2"},
		"type":                 []any{TypeVerifiablePresentation},
		"holder":               testSubject,
		"verifiableCredential": []any{trustedParticipantCredential()},
	})

	if _, err := verifier.Verify(raw, Expectation{}); err == nil {
		t.Fatal("an unsecured embedded credential must be rejected")
	}
}

func TestVerifyRejectsNonceMismatch(t *testing.T) {
	issuer := newIssuerFixture(t)
	policy := policyTrusting(issuer.resolverURL)
	verifier := NewVerifier(policy)

	// A holder-signed presentation echoing the wrong nonce (replay of an older
	// session) must not verify.
	vp := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims(map[string]any{
		"iss":   testSubject,
		"aud":   "portal-client",
		"nonce": "an-old-nonce",
		"vp": map[string]any{
			"type":   []any{TypeVerifiablePresentation},
			"holder": testSubject,
			"verifiableCredential": []any{map[string]any{
				"id":   credentialJWTPrefix + signCredential(t, issuer.key, trustedParticipantCredential()),
				"type": TypeEnvelopedCredential,
			}},
		},
	}))
	vp.Header["kid"] = testKeyID
	signedVP, err := vp.SignedString(issuer.key)
	if err != nil {
		t.Fatalf("signing presentation: %v", err)
	}

	_, err = verifier.Verify([]byte(signedVP), Expectation{Nonce: "the-current-nonce", Audience: "portal-client"})
	if err == nil || !strings.Contains(err.Error(), "nonce") {
		t.Fatalf("expected a nonce mismatch, got %v", err)
	}
}

func TestVerifyRequireHolderBindingRejectsUnsecuredPresentation(t *testing.T) {
	issuer := newIssuerFixture(t)
	policy := policyTrusting(issuer.resolverURL)
	policy.RequireHolderBinding = true

	_, err := NewVerifier(policy).Verify(envelopePresentation(signCredential(t, issuer.key, trustedParticipantCredential())), Expectation{})
	if err == nil || !strings.Contains(err.Error(), "not signed by the holder") {
		t.Fatalf("expected a holder-binding failure, got %v", err)
	}
}

func encodeList(bits []byte) string {
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	_, _ = gw.Write(bits)
	_ = gw.Close()
	return "u" + base64.RawURLEncoding.EncodeToString(buf.Bytes())
}

type staticKeyResolver struct{ key crypto.PublicKey }

func (r staticKeyResolver) ResolveKey(string, string, string) (crypto.PublicKey, error) {
	return r.key, nil
}

func signedPresentation(t *testing.T, issuer *issuerFixture, nonce, audience string) []byte {
	t.Helper()
	vp := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims(map[string]any{
		"iss":   testSubject,
		"aud":   audience,
		"nonce": nonce,
		"vp": map[string]any{
			"type":   []any{TypeVerifiablePresentation},
			"holder": testSubject,
			"verifiableCredential": []any{map[string]any{
				"id":   credentialJWTPrefix + signCredential(t, issuer.key, trustedParticipantCredential()),
				"type": TypeEnvelopedCredential,
			}},
		},
	}))
	vp.Header["kid"] = testKeyID
	signed, err := vp.SignedString(issuer.key)
	if err != nil {
		t.Fatalf("signing presentation: %v", err)
	}
	return []byte(signed)
}

// HolderBound is what auto-approval keys on: only a presentation the holder
// signed, verified against the holder's key and echoing this session's nonce.
func TestVerifySetsHolderBoundOnlyForSignedPresentationsWithTheSessionNonce(t *testing.T) {
	issuer := newIssuerFixture(t)
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))
	verifier.HolderKeys = staticKeyResolver{key: &issuer.key.PublicKey}

	bound, err := verifier.Verify(signedPresentation(t, issuer, "nonce-1", "https://portal/response"), Expectation{Nonce: "nonce-1", Audience: "https://portal/response"})
	if err != nil {
		t.Fatalf("signed presentation: %v", err)
	}
	if !bound.HolderBound {
		t.Fatal("a signed presentation echoing the session nonce must be holder-bound")
	}
	for _, warning := range bound.Warnings {
		if strings.Contains(warning, "Holder binding") {
			t.Fatalf("no holder-binding warning expected: %q", warning)
		}
	}

	// Direct submission: nothing to bind to, however well signed.
	direct, err := verifier.Verify(signedPresentation(t, issuer, "whatever", "x"), Expectation{})
	if err != nil {
		t.Fatalf("direct: %v", err)
	}
	if direct.HolderBound {
		t.Fatal("without a session nonce a presentation is never holder-bound")
	}

	// Unsecured presentation: credentials fine, binding absent.
	unsecured, err := verifier.Verify(envelopePresentation(signCredential(t, issuer.key, trustedParticipantCredential())), Expectation{Nonce: "nonce-1"})
	if err != nil {
		t.Fatalf("unsecured: %v", err)
	}
	if unsecured.HolderBound {
		t.Fatal("an unsecured presentation must not be holder-bound")
	}
}

// Key-resolution failures are classified so the handler can answer without
// exposing the resolver URL or dial error.
func TestVerifyClassifiesKeyResolutionFailures(t *testing.T) {
	issuer := newIssuerFixture(t)
	dead := httptest.NewServer(http.NotFoundHandler())
	deadURL := dead.URL + "/.well-known/did.json"
	dead.Close()

	_, err := NewVerifier(policyTrusting(deadURL)).Verify(envelopePresentation(signCredential(t, issuer.key, trustedParticipantCredential())), Expectation{})
	if !errors.Is(err, ErrKeyResolution) {
		t.Fatalf("err = %v, want ErrKeyResolution in the chain", err)
	}
}

// Soft mode tolerates a status entry it cannot read (warning), required mode
// refuses it with the status-list error class.
func TestVerifySoftModeWarnsOnMalformedCredentialStatus(t *testing.T) {
	issuer := newIssuerFixture(t)
	credential := trustedParticipantCredential()
	credential["credentialStatus"] = "not-a-status-entry"
	presentation := envelopePresentation(signCredential(t, issuer.key, credential))

	policy := policyTrusting(issuer.resolverURL)
	policy.StatusCheck = StatusCheckSoft
	result, err := NewVerifier(policy).Verify(presentation, Expectation{})
	if err != nil {
		t.Fatalf("soft mode must verify: %v", err)
	}
	found := false
	for _, warning := range result.Warnings {
		if warning == warnStatusMalformed {
			found = true
		}
	}
	if !found {
		t.Fatalf("soft mode must warn about the malformed status: %v", result.Warnings)
	}

	policy.StatusCheck = StatusCheckRequired
	if _, err := NewVerifier(policy).Verify(presentation, Expectation{}); !errors.Is(err, ErrStatusList) {
		t.Fatalf("required mode err = %v, want ErrStatusList", err)
	}
}

// A holder signature only proves who signed. Party A wrapping party B's
// credentials in a presentation signed with A's own key must not count as
// holder-bound, or B's application could be auto-approved on A's say-so.
func TestVerifyHolderMustBeTheCredentialSubject(t *testing.T) {
	issuer := newIssuerFixture(t)
	verifier := NewVerifier(policyTrusting(issuer.resolverURL))
	verifier.HolderKeys = staticKeyResolver{key: &issuer.key.PublicKey}

	const otherParty = "did:ishare:EU.NL.NTRNL-87654321"
	vp := jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims(map[string]any{
		"iss":   otherParty,
		"aud":   "https://portal/response",
		"nonce": "nonce-1",
		"vp": map[string]any{
			"type":   []any{TypeVerifiablePresentation},
			"holder": otherParty,
			"verifiableCredential": []any{map[string]any{
				// trustedParticipantCredential is about testSubject, not otherParty.
				"id":   credentialJWTPrefix + signCredential(t, issuer.key, trustedParticipantCredential()),
				"type": TypeEnvelopedCredential,
			}},
		},
	}))
	vp.Header["kid"] = testKeyID
	signed, err := vp.SignedString(issuer.key)
	if err != nil {
		t.Fatalf("signing presentation: %v", err)
	}

	result, err := verifier.Verify([]byte(signed), Expectation{Nonce: "nonce-1", Audience: "https://portal/response"})
	if err != nil {
		t.Fatalf("the credentials themselves are valid, so verification should succeed: %v", err)
	}
	if result.HolderBound {
		t.Fatal("a holder that is not the credential subject must not be holder-bound")
	}
	found := false
	for _, warning := range result.Warnings {
		if warning == warnHolderNotSubject {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected a warning explaining the missing binding, got %v", result.Warnings)
	}
}
