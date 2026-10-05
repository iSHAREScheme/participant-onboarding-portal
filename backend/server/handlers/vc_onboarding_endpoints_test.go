package handlers

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"onboardingportal/config"
	"onboardingportal/models"
	s "onboardingportal/server"
	"onboardingportal/verification"
)

func vcTestPolicyJSON(t *testing.T, requireHolderBinding bool) datatypes.JSON {
	t.Helper()
	policy := verification.TrustPolicy{
		StatusCheck:          verification.StatusCheckSoft,
		RequireHolderBinding: requireHolderBinding,
		AcceptedTypes: []verification.AcceptedCredentialType{{
			Type: "TrustedParticipantCredential", Label: "iSHARE Trusted Participant", Enabled: true,
			Issuers:  []verification.TrustedIssuer{{DID: "did:web:issuer.test"}},
			Mappings: []verification.ClaimMapping{{Path: "credentialSubject.name", Field: verification.FieldPartyName}},
		}},
	}
	encoded, err := json.Marshal(policy)
	if err != nil {
		t.Fatal(err)
	}
	return datatypes.JSON(encoded)
}

func newVcEndpointHandler(t *testing.T, database *gorm.DB, cfg *config.Config) (*fiber.App, *HandlerVcOnboarding) {
	t.Helper()
	handler := NewHandlerVcOnboarding(&s.Server{DB: database}, cfg)
	app := fiber.New()
	app.Post("/onboarding/vc/session", handler.CreateSession)
	app.Get("/onboarding/vc/session/:id", handler.GetSession)
	app.Post("/onboarding/vc/verify", handler.VerifyDirect)
	app.Get("/onboarding/vc/request/:id", handler.GetRequestObject)
	app.Post("/onboarding/vc/response/:id", handler.SubmitResponse)
	app.Get("/settings/vc-onboarding", handler.GetPolicy)
	app.Post("/settings/vc-onboarding", handler.UpdatePolicy)
	return app, handler
}

func doJSON(t *testing.T, app *fiber.App, method, target, body string) (int, map[string]interface{}) {
	t.Helper()
	request := httptest.NewRequest(method, target, strings.NewReader(body))
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("%s %s: %v", method, target, err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	decoded := map[string]interface{}{}
	_ = json.Unmarshal(raw, &decoded)
	if decoded["_raw"] == nil {
		decoded["_raw"] = string(raw)
	}
	return response.StatusCode, decoded
}

// The request object must follow OID4VP's redirect_uri client identifier
// scheme: client_id == response_uri, in the request object and in the QR deep
// link; and the presentation definition must match `type` as an array.
func TestCreateSessionAndRequestObjectUseTheResponseURIAsClientID(t *testing.T) {
	database := newVcTestDB(t)
	if err := database.Create(&models.Settings{IdentityMethods: "vc", VcOnboarding: vcTestPolicyJSON(t, false)}).Error; err != nil {
		t.Fatal(err)
	}
	app, _ := newVcEndpointHandler(t, database, &config.Config{OIDCDisable: true, VcVerifierBaseUrl: "https://portal.test/"})

	status, created := doJSON(t, app, "POST", "/onboarding/vc/session", `{"flowRoute":""}`)
	if status != fiber.StatusOK {
		t.Fatalf("create session: %d %v", status, created["_raw"])
	}
	sessionID, _ := created["sessionId"].(string)
	wantClientID := "https://portal.test/onboarding/vc/response/" + sessionID
	if created["clientId"] != wantClientID {
		t.Fatalf("clientId = %v, want %s", created["clientId"], wantClientID)
	}
	walletURL, _ := created["walletUrl"].(string)
	if !strings.Contains(walletURL, "client_id="+url.QueryEscape(wantClientID)) {
		t.Fatalf("wallet deep link must carry the response_uri as client_id: %s", walletURL)
	}

	status, request := doJSON(t, app, "GET", "/onboarding/vc/request/"+sessionID, "")
	if status != fiber.StatusOK {
		t.Fatalf("request object: %d %v", status, request["_raw"])
	}
	if request["client_id"] != wantClientID || request["response_uri"] != wantClientID || request["client_id_scheme"] != "redirect_uri" {
		t.Fatalf("client_id/response_uri mismatch: %v / %v (%v)", request["client_id"], request["response_uri"], request["client_id_scheme"])
	}
	definition, _ := request["presentation_definition"].(map[string]interface{})
	descriptors, _ := definition["input_descriptors"].([]interface{})
	if len(descriptors) != 1 {
		t.Fatalf("input_descriptors = %v", definition["input_descriptors"])
	}
	constraints := descriptors[0].(map[string]interface{})["constraints"].(map[string]interface{})
	field := constraints["fields"].([]interface{})[0].(map[string]interface{})
	paths, _ := json.Marshal(field["path"])
	if string(paths) != `["$.type[*]","$.vc.type[*]"]` {
		t.Fatalf("type constraint path = %s", paths)
	}
	filter := field["filter"].(map[string]interface{})
	if filter["const"] != "TrustedParticipantCredential" || filter["pattern"] != nil {
		t.Fatalf("type filter = %v, want a const match on the member", filter)
	}
}

func seedPendingSession(t *testing.T, database *gorm.DB, id string) {
	t.Helper()
	now := time.Now()
	if err := database.Create(&models.VcPresentationSession{
		ID: id, Nonce: "nonce-1", State: "state-1", Audience: "https://portal.test/onboarding/vc/response/" + id,
		Status: models.VcSessionPending, CreatedAt: now, ExpiresAt: now.Add(5 * time.Minute),
	}).Error; err != nil {
		t.Fatal(err)
	}
}

func postForm(t *testing.T, app *fiber.App, target, form string) (int, string) {
	t.Helper()
	request := httptest.NewRequest("POST", target, strings.NewReader(form))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(response.Body)
	return response.StatusCode, string(raw)
}

func TestSubmitResponseRequiresTheSessionState(t *testing.T) {
	database := newVcTestDB(t)
	if err := database.Create(&models.Settings{IdentityMethods: "vc"}).Error; err != nil {
		t.Fatal(err)
	}
	app, handler := newVcEndpointHandler(t, database, &config.Config{VcVerifierBaseUrl: "https://portal.test"})
	handler.verify = func(verification.TrustPolicy, []byte, verification.Expectation) (*verification.Result, error) {
		t.Fatal("the verifier must not run before state is checked")
		return nil, nil
	}
	seedPendingSession(t, database, "open")

	if status, body := postForm(t, app, "/onboarding/vc/response/open", "vp_token=a.b.c"); status != fiber.StatusBadRequest {
		t.Fatalf("missing state: %d %s", status, body)
	}
	if status, body := postForm(t, app, "/onboarding/vc/response/open", "vp_token=a.b.c&state=other"); status != fiber.StatusBadRequest {
		t.Fatalf("wrong state: %d %s", status, body)
	}
	var session models.VcPresentationSession
	_ = database.Where("id = ?", "open").First(&session).Error
	if session.Status != models.VcSessionPending {
		t.Fatalf("a refused response must not consume the session: %s", session.Status)
	}
}

// The wallet and the browser see an applicant-safe message; the resolver URL
// and dial detail stay in the server log.
func TestSubmitResponseHidesResolverDetailsFromTheApplicant(t *testing.T) {
	database := newVcTestDB(t)
	if err := database.Create(&models.Settings{IdentityMethods: "vc"}).Error; err != nil {
		t.Fatal(err)
	}
	app, handler := newVcEndpointHandler(t, database, &config.Config{VcVerifierBaseUrl: "https://portal.test"})
	handler.verify = func(verification.TrustPolicy, []byte, verification.Expectation) (*verification.Result, error) {
		return nil, fmt.Errorf("credential 1 of 1: TrustedParticipantCredential from did:ishare:X failed signature verification: %w",
			fmt.Errorf("%w: fetching issuer keys from http://ishare-vc-issuer:8080/.well-known/did.json: dial tcp: connection refused", verification.ErrKeyResolution))
	}
	seedPendingSession(t, database, "open")

	status, body := postForm(t, app, "/onboarding/vc/response/open", "vp_token=a.b.c&state=state-1")
	if status != fiber.StatusBadRequest {
		t.Fatalf("status = %d", status)
	}
	if strings.Contains(body, "http://") || strings.Contains(body, "ishare-vc-issuer") {
		t.Fatalf("response leaks the resolver host: %s", body)
	}
	if !strings.Contains(body, "verification keys could not be retrieved") {
		t.Fatalf("response lacks the applicant-safe message: %s", body)
	}
	var session models.VcPresentationSession
	_ = database.Where("id = ?", "open").First(&session).Error
	if session.Status != models.VcSessionFailed || strings.Contains(session.Error, "http://") {
		t.Fatalf("session = %s / %q", session.Status, session.Error)
	}
}

func TestSubmitResponseStoresTheResultAndGetSessionIsOwnerScoped(t *testing.T) {
	database := newVcTestDB(t)
	if err := database.Create(&models.Settings{IdentityMethods: "vc"}).Error; err != nil {
		t.Fatal(err)
	}
	app, handler := newVcEndpointHandler(t, database, &config.Config{VcVerifierBaseUrl: "https://portal.test"})
	var seen verification.Expectation
	handler.verify = func(_ verification.TrustPolicy, _ []byte, expect verification.Expectation) (*verification.Result, error) {
		seen = expect
		return &verification.Result{Fields: map[string]string{verification.FieldPartyName: "Acme"}, HolderBound: true}, nil
	}
	seedPendingSession(t, database, "open")
	if err := database.Model(&models.VcPresentationSession{}).Where("id = ?", "open").Update("keycloak_username", "alice").Error; err != nil {
		t.Fatal(err)
	}

	status, body := postForm(t, app, "/onboarding/vc/response/open", "vp_token=a.b.c&state=state-1")
	if status != fiber.StatusOK {
		t.Fatalf("submit: %d %s", status, body)
	}
	if seen.Nonce != "nonce-1" || seen.Audience != "https://portal.test/onboarding/vc/response/open" {
		t.Fatalf("verifier expectation = %+v, want the session nonce and the response_uri audience", seen)
	}
	var session models.VcPresentationSession
	_ = database.Where("id = ?", "open").First(&session).Error
	if session.Status != models.VcSessionVerified || len(session.Result) == 0 || session.VerifiedAt == nil {
		t.Fatalf("session not stored as verified: %+v", session)
	}

	// The browser poll without claims (OIDC on) must not see alice's session.
	if status, _ := doJSON(t, app, "GET", "/onboarding/vc/session/open", ""); status != fiber.StatusNotFound {
		t.Fatalf("foreign caller status = %d, want 404", status)
	}
	// With OIDC disabled the same handler serves the result.
	devApp, _ := newVcEndpointHandler(t, database, &config.Config{OIDCDisable: true, VcVerifierBaseUrl: "https://portal.test"})
	status, payload := doJSON(t, devApp, "GET", "/onboarding/vc/session/open", "")
	if status != fiber.StatusOK || payload["status"] != models.VcSessionVerified {
		t.Fatalf("owner read: %d %v", status, payload["_raw"])
	}
	result, _ := payload["result"].(map[string]interface{})
	if result["holderBound"] != true {
		t.Fatalf("result must carry holderBound: %v", payload["result"])
	}
}

func TestUpdatePolicyRefusesAutoAcceptWithoutHolderBinding(t *testing.T) {
	database := newVcTestDB(t)
	app, _ := newVcEndpointHandler(t, database, &config.Config{})

	body := `{"policy":{"statusCheck":"soft","requireHolderBinding":false,"acceptedTypes":[]},"autoAcceptVerified":true}`
	if status, payload := doJSON(t, app, "POST", "/settings/vc-onboarding", body); status != fiber.StatusBadRequest {
		t.Fatalf("auto-accept without holder binding must be refused: %d %v", status, payload["_raw"])
	}
	body = `{"policy":{"statusCheck":"soft","requireHolderBinding":true,"acceptedTypes":[]},"autoAcceptVerified":true}`
	if status, payload := doJSON(t, app, "POST", "/settings/vc-onboarding", body); status != fiber.StatusOK {
		t.Fatalf("auto-accept with holder binding must be accepted: %d %v", status, payload["_raw"])
	}
	// Turning holder binding off again while auto-accept stays on is refused too.
	body = `{"policy":{"statusCheck":"soft","requireHolderBinding":false,"acceptedTypes":[]}}`
	if status, payload := doJSON(t, app, "POST", "/settings/vc-onboarding", body); status != fiber.StatusBadRequest {
		t.Fatalf("disabling holder binding under auto-accept must be refused: %d %v", status, payload["_raw"])
	}
}

func TestConsumePresentationSessionIsSingleUse(t *testing.T) {
	database := newVcTestDB(t)
	storeVerifiedSession(t, database, "session-1", "alice", verification.Result{})

	if err := consumePresentationSession(database, "session-1"); err != nil {
		t.Fatalf("first consume: %v", err)
	}
	if err := consumePresentationSession(database, "session-1"); !errors.Is(err, errPresentationConsumed) {
		t.Fatalf("second consume = %v, want errPresentationConsumed", err)
	}
	if err := consumePresentationSession(database, ""); err != nil {
		t.Fatalf("no session id is not an error: %v", err)
	}
}

func testHolderCertificate(t *testing.T) *x509.Certificate {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber: big.NewInt(9),
		Subject:      pkix.Name{CommonName: "holder", Organization: []string{"Acme"}},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

// iSHARE holders publish no DID document; their presentation key is the
// certificate registered in the Participant Registry, matched by x5t#S256.
func TestRegistryHolderResolverMatchesRegisteredCertificates(t *testing.T) {
	certificate := testHolderCertificate(t)
	other := testHolderCertificate(t)
	resolver := &registryHolderResolver{certificates: func(partyID string) ([]*x509.Certificate, error) {
		switch partyID {
		case "did:ishare:EU.NL.NTRNL-1":
			return []*x509.Certificate{certificate, other}, nil
		case "did:ishare:EU.NL.NTRNL-2":
			return []*x509.Certificate{certificate}, nil
		}
		return nil, nil
	}}
	thumb := certificateThumbprint(certificate)

	key, err := resolver.ResolveKey("did:ishare:EU.NL.NTRNL-1", thumb, "")
	if err != nil || key != certificate.PublicKey {
		t.Fatalf("thumbprint kid: %v %v", key, err)
	}
	key, err = resolver.ResolveKey("did:ishare:EU.NL.NTRNL-1", "did:ishare:EU.NL.NTRNL-1#"+thumb, "")
	if err != nil || key != certificate.PublicKey {
		t.Fatalf("DID-URL kid: %v %v", key, err)
	}
	if _, err := resolver.ResolveKey("did:ishare:EU.NL.NTRNL-1", "", ""); err == nil {
		t.Fatal("no kid with two certificates must be ambiguous")
	}
	key, err = resolver.ResolveKey("did:ishare:EU.NL.NTRNL-2", "", "")
	if err != nil || key != certificate.PublicKey {
		t.Fatalf("no kid with one certificate: %v %v", key, err)
	}
	if _, err := resolver.ResolveKey("did:ishare:EU.NL.NTRNL-1", "nope", ""); err == nil {
		t.Fatal("an unknown thumbprint must not resolve")
	}
	if _, err := resolver.ResolveKey("did:ishare:unknown", thumb, ""); err == nil {
		t.Fatal("a holder without certificates must not resolve")
	}
}

// An expired certificate's key may be retired or compromised: it must not vouch
// for a holder, because holder binding unlocks auto-approval.
func TestRegistryHolderResolverIgnoresCertificatesOutsideTheirValidity(t *testing.T) {
	certificate := testHolderCertificate(t) // valid from an hour ago to an hour ahead
	resolver := &registryHolderResolver{
		certificates: func(string) ([]*x509.Certificate, error) { return []*x509.Certificate{certificate}, nil },
	}
	thumb := certificateThumbprint(certificate)

	resolver.now = func() time.Time { return time.Now() }
	if _, err := resolver.ResolveKey("did:ishare:EU.NL.NTRNL-1", thumb, ""); err != nil {
		t.Fatalf("a current certificate must resolve: %v", err)
	}
	resolver.now = func() time.Time { return time.Now().Add(2 * time.Hour) }
	if _, err := resolver.ResolveKey("did:ishare:EU.NL.NTRNL-1", thumb, ""); err == nil {
		t.Fatal("an expired certificate must not resolve")
	}
	resolver.now = func() time.Time { return time.Now().Add(-2 * time.Hour) }
	if _, err := resolver.ResolveKey("did:ishare:EU.NL.NTRNL-1", thumb, ""); err == nil {
		t.Fatal("a not-yet-valid certificate must not resolve")
	}
}

// A revoked (or otherwise inactive) x509Certificate claim no longer belongs to
// the party, so its certificate is not offered as a holder key.
func TestClaimCertificateValuesSkipsInactiveClaims(t *testing.T) {
	record := map[string]interface{}{"claims": []interface{}{
		map[string]interface{}{"type": "x509Certificate", "status": "active", "x5c": "ACTIVE"},
		map[string]interface{}{"type": "x509Certificate", "status": "Active", "x5c": "ACTIVE-CASE"},
		map[string]interface{}{"type": "x509Certificate", "x5c": "NO-STATUS"},
		map[string]interface{}{"type": "x509Certificate", "status": "Revoked", "x5c": "REVOKED"},
		map[string]interface{}{"type": "x509Certificate", "status": "NotActive", "x5c": "NOT-ACTIVE"},
		map[string]interface{}{"type": "frameworkRole", "status": "active", "x5c": "NOT-A-CERT"},
	}}
	got := strings.Join(claimCertificateValues(record), ",")
	if want := "ACTIVE,ACTIVE-CASE,NO-STATUS"; got != want {
		t.Errorf("claimCertificateValues = %q, want %q", got, want)
	}
}
