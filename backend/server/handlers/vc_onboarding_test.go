package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"gorm.io/datatypes"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"onboardingportal/config"
	"onboardingportal/models"
	s "onboardingportal/server"
	"onboardingportal/verification"
)

func newVcTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	if err := database.AutoMigrate(&models.Settings{}, &models.Proposal{}, &models.VcPresentationSession{}); err != nil {
		t.Fatalf("migrate test database: %v", err)
	}
	return database
}

func settingsWithFlows(t *testing.T, flows []models.OnboardingFlow) *models.Settings {
	t.Helper()
	encoded, err := json.Marshal(flows)
	if err != nil {
		t.Fatalf("encode flows: %v", err)
	}
	return &models.Settings{OnboardingFlows: datatypes.JSON(encoded)}
}

// TestVcEnabledForRouteHonoursFlowOverride verifies the layering every other
// onboarding default uses: deployment setting first, flow override on top.
func TestVcEnabledForRouteHonoursFlowOverride(t *testing.T) {
	settings := settingsWithFlows(t, []models.OnboardingFlow{
		{Route: "opt-in", VcOnboarding: "true"},
		{Route: "opt-out", VcOnboarding: "false"},
		{Route: "inherit"},
	})

	for _, tc := range []struct {
		name           string
		deploymentWide bool
		route          string
		want           bool
	}{
		{"flow enables what the deployment disabled", false, "opt-in", true},
		{"flow disables what the deployment enabled", true, "opt-out", false},
		{"empty override inherits the deployment setting", true, "inherit", true},
		{"empty override inherits a disabled deployment", false, "inherit", false},
		{"unknown route falls back to the deployment setting", true, "nope", true},
		{"base url falls back to the deployment setting", false, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			policy := verification.TrustPolicy{Enabled: tc.deploymentWide}
			if got := vcEnabledForRoute(settings, policy, tc.route); got != tc.want {
				t.Errorf("vcEnabledForRoute(%q) = %t, want %t", tc.route, got, tc.want)
			}
		})
	}
}

func TestVcAutoAcceptForRouteHonoursFlowOverride(t *testing.T) {
	settings := settingsWithFlows(t, []models.OnboardingFlow{
		{Route: "auto", VcAutoAccept: "true"},
		{Route: "manual", VcAutoAccept: "false"},
		{Route: "inherit"},
	})

	settings.VcAutoAcceptVerified = "false"
	if !vcAutoAcceptForRoute(settings, "auto") {
		t.Error("a flow opting in should auto-accept even when the deployment default is off")
	}
	if vcAutoAcceptForRoute(settings, "inherit") {
		t.Error("an empty override should inherit the disabled deployment default")
	}

	settings.VcAutoAcceptVerified = "true"
	if vcAutoAcceptForRoute(settings, "manual") {
		t.Error("a flow opting out should keep admin review even when the deployment default is on")
	}
	if !vcAutoAcceptForRoute(settings, "inherit") {
		t.Error("an empty override should inherit the enabled deployment default")
	}
}

// storeVerifiedSession writes a verified session owned by owner.
func storeVerifiedSession(t *testing.T, database *gorm.DB, id, owner string, result verification.Result) *models.VcPresentationSession {
	t.Helper()
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("encode result: %v", err)
	}
	now := time.Now()
	session := &models.VcPresentationSession{
		ID:               id,
		KeycloakUsername: owner,
		Status:           models.VcSessionVerified,
		Result:           datatypes.JSON(encoded),
		CreatedAt:        now,
		ExpiresAt:        now.Add(10 * time.Minute),
		VerifiedAt:       &now,
	}
	if err := database.Create(session).Error; err != nil {
		t.Fatalf("store session: %v", err)
	}
	return session
}

func newPartyHandler(database *gorm.DB) *HandlerParty {
	// OIDCDisable keeps the ownership check out of the way for the cases that
	// are about field precedence rather than about who owns the session.
	return &HandlerParty{Server: &s.Server{DB: database}, Config: &config.Config{OIDCDisable: true}}
}

// TestApplyVerifiedPresentationOverridesSubmittedValues is the core trust
// property: what the credential proved wins over what the browser sent.
func TestApplyVerifiedPresentationOverridesSubmittedValues(t *testing.T) {
	database := newVcTestDB(t)
	handler := newPartyHandler(database)

	storeVerifiedSession(t, database, "session-1", "applicant", verification.Result{
		Holder: "did:ishare:EU.NL.NTRNL-12345678",
		Fields: map[string]string{
			verification.FieldPartyID:     "did:ishare:EU.NL.NTRNL-12345678",
			verification.FieldPartyName:   "Acme Logistics BV",
			verification.FieldCompanyName: "Acme Logistics BV",
		},
		FieldSources: map[string]string{verification.FieldPartyID: "PartyIdCredential"},
		Credentials: []verification.VerifiedCredential{{
			Type: "PartyIdCredential", Issuer: "did:ishare:EU.NL.NTRNL-10000000", IssuerName: "Test Satellite",
		}},
	})

	// The browser claims a different party entirely.
	proposal := &models.Proposal{
		PartyId:     "EU.EORI.NL000000000",
		PartyName:   "Attacker BV",
		CompanyName: "Attacker BV",
		Status:      "pending",
	}
	if err := handler.applyVerifiedPresentation(nil, proposal, "session-1"); err != nil {
		t.Fatalf("applyVerifiedPresentation: %v", err)
	}

	if proposal.PartyId != "did:ishare:EU.NL.NTRNL-12345678" {
		t.Errorf("party id = %q, want the verified value", proposal.PartyId)
	}
	if proposal.PartyName != "Acme Logistics BV" {
		t.Errorf("party name = %q, want the verified value", proposal.PartyName)
	}
	if !proposal.VcVerified || proposal.IdCheckMethod != "vc" {
		t.Errorf("proposal should be stamped as credential-verified, got verified=%t method=%q", proposal.VcVerified, proposal.IdCheckMethod)
	}
	if proposal.VcCredentialTypes != "PartyIdCredential" {
		t.Errorf("credential types = %q", proposal.VcCredentialTypes)
	}
	if proposal.VcIssuers != "Test Satellite" {
		t.Errorf("issuers = %q", proposal.VcIssuers)
	}
	// Nothing enabled auto-accept, so the proposal still needs a human.
	if proposal.Status != "pending" {
		t.Errorf("status = %q, want pending without auto-accept configured", proposal.Status)
	}
}

// TestApplyVerifiedPresentationLeavesUnprovenFields checks that verification
// only overwrites what it actually proved.
func TestApplyVerifiedPresentationLeavesUnprovenFields(t *testing.T) {
	database := newVcTestDB(t)
	handler := newPartyHandler(database)
	storeVerifiedSession(t, database, "session-1", "applicant", verification.Result{
		Fields: map[string]string{verification.FieldPartyName: "Acme Logistics BV"},
	})

	proposal := &models.Proposal{PartyName: "typed", City: "Rotterdam", ContactEmail: "me@example.com", Status: "pending"}
	if err := handler.applyVerifiedPresentation(nil, proposal, "session-1"); err != nil {
		t.Fatalf("applyVerifiedPresentation: %v", err)
	}
	if proposal.City != "Rotterdam" || proposal.ContactEmail != "me@example.com" {
		t.Error("fields the credential did not prove must keep the applicant's own input")
	}
}

func TestApplyVerifiedPresentationRejectsUnusableSessions(t *testing.T) {
	database := newVcTestDB(t)
	handler := newPartyHandler(database)
	now := time.Now()
	stale := now.Add(-verifiedSessionWindow - time.Hour)
	consumed := now.Add(-time.Minute)

	if err := database.Create(&models.VcPresentationSession{
		ID: "pending", Status: models.VcSessionPending, CreatedAt: now, ExpiresAt: now.Add(time.Minute),
	}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := database.Create(&models.VcPresentationSession{
		ID: "stale", Status: models.VcSessionVerified, Result: datatypes.JSON(`{}`),
		CreatedAt: stale, ExpiresAt: stale, VerifiedAt: &stale,
	}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := database.Create(&models.VcPresentationSession{
		ID: "used", Status: models.VcSessionVerified, Result: datatypes.JSON(`{}`),
		CreatedAt: now, ExpiresAt: now.Add(time.Minute), VerifiedAt: &now, ConsumedAt: &consumed,
	}).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}

	for _, tc := range []struct{ name, id string }{
		{"unknown session", "does-not-exist"},
		{"never completed", "pending"},
		{"outside the usable window", "stale"},
		{"already used for another application", "used"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			proposal := &models.Proposal{Status: "pending"}
			if err := handler.applyVerifiedPresentation(nil, proposal, tc.id); err == nil {
				t.Fatal("expected an error rather than a silently unverified proposal")
			}
			if proposal.VcVerified {
				t.Error("a rejected session must not stamp the proposal as verified")
			}
		})
	}
}

// TestApplyVerifiedPresentationIgnoresEmptySessionID confirms the ordinary
// hand-typed path is untouched.
func TestApplyVerifiedPresentationIgnoresEmptySessionID(t *testing.T) {
	database := newVcTestDB(t)
	handler := newPartyHandler(database)
	proposal := &models.Proposal{PartyName: "typed", Status: "pending"}
	if err := handler.applyVerifiedPresentation(nil, proposal, ""); err != nil {
		t.Fatalf("a proposal without a session id must pass through: %v", err)
	}
	if proposal.VcVerified || proposal.PartyName != "typed" {
		t.Error("submitting without a session id must not change the proposal")
	}
}

// TestApplyVerifiedPresentationAutoApproves verifies the operator's per-flow
// decision is what skips manual review — not anything the browser submitted.
func TestApplyVerifiedPresentationAutoApproves(t *testing.T) {
	database := newVcTestDB(t)
	handler := newPartyHandler(database)

	flows, err := json.Marshal([]models.OnboardingFlow{{Route: "fast", VcAutoAccept: "true"}})
	if err != nil {
		t.Fatalf("encode flows: %v", err)
	}
	if err := database.Create(&models.Settings{OnboardingFlows: datatypes.JSON(flows)}).Error; err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	storeVerifiedSession(t, database, "session-1", "applicant", verification.Result{
		Fields: map[string]string{verification.FieldPartyName: "Acme Logistics BV"},
	})

	proposal := &models.Proposal{FlowRoute: "fast", Status: "pending"}
	if err := handler.applyVerifiedPresentation(nil, proposal, "session-1"); err != nil {
		t.Fatalf("applyVerifiedPresentation: %v", err)
	}
	if proposal.Status != "approved" {
		t.Errorf("status = %q, want approved on a flow that auto-accepts verified applications", proposal.Status)
	}
}

// TestApplyVerifiedPresentationRejectsSomeoneElsesSession is the IDOR guard:
// with OIDC on, a session belongs to the applicant who created it.
func TestApplyVerifiedPresentationRejectsSomeoneElsesSession(t *testing.T) {
	database := newVcTestDB(t)
	handler := &HandlerParty{Server: &s.Server{DB: database}, Config: &config.Config{}}
	storeVerifiedSession(t, database, "session-1", "victim", verification.Result{
		Fields: map[string]string{verification.FieldPartyID: "did:ishare:EU.NL.NTRNL-12345678"},
	})

	// No claims on the context ⇒ currentUsername is "", which must never match
	// a stored owner.
	proposal := &models.Proposal{Status: "pending"}
	if err := handler.applyVerifiedPresentation(nil, proposal, "session-1"); err == nil {
		t.Fatal("a caller who does not own the session must be refused")
	}
	if proposal.VcVerified {
		t.Error("a refused session must not stamp the proposal as verified")
	}
}

// TestPolicyFromSettingsFallsBackToDefaults keeps a blank or corrupt stored
// policy from disabling the feature's configuration surface.
func TestPolicyFromSettingsFallsBackToDefaults(t *testing.T) {
	if got := policyFromSettings(&models.Settings{}); len(got.AcceptedTypes) == 0 {
		t.Error("empty settings should yield the packaged default policy")
	}
	if got := policyFromSettings(&models.Settings{VcOnboarding: datatypes.JSON("not json")}); len(got.AcceptedTypes) == 0 {
		t.Error("an unreadable stored policy should fall back to the packaged default")
	}
	// The packaged default must never trust an issuer or switch itself on.
	def := policyFromSettings(nil)
	if def.Enabled {
		t.Error("credential onboarding must be off until an operator enables it")
	}
	for _, accepted := range def.AcceptedTypes {
		if len(accepted.Issuers) != 0 {
			t.Errorf("%s ships with trusted issuers; it must start empty", accepted.Type)
		}
	}
}

// TestFullSettingsHidesTrustPolicy guards a real leak: /settings is
// authenticated but NOT admin-gated, so any signed-in applicant can read it.
// The credential trust policy (issuer DIDs, key-resolution URLs) is operator
// configuration and must not travel there — only the on/off flag the
// onboarding form needs.
func TestFullSettingsHidesTrustPolicy(t *testing.T) {
	database := newVcTestDB(t)

	policy := verification.DefaultTrustPolicy()
	policy.Enabled = true
	policy.AcceptedTypes[0].Issuers = []verification.TrustedIssuer{{
		DID:         "did:ishare:EU.NL.NTRNL-10000000",
		ResolverURL: "https://issuer.internal.example/.well-known/did.json",
	}}
	encoded, err := json.Marshal(policy)
	if err != nil {
		t.Fatalf("encode policy: %v", err)
	}
	if err := database.Create(&models.Settings{VcOnboarding: datatypes.JSON(encoded)}).Error; err != nil {
		t.Fatalf("seed settings: %v", err)
	}

	app := fiber.New()
	handler := NewHandlerSettings(&s.Server{DB: database}, &config.Config{})
	app.Get("/settings", handler.GetSettings)

	response, err := app.Test(httptest.NewRequest("GET", "/settings", nil))
	if err != nil {
		t.Fatalf("get settings: %v", err)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}

	if strings.Contains(string(body), "resolverUrl") || strings.Contains(string(body), "issuer.internal.example") {
		t.Errorf("/settings leaked the credential trust policy: %s", body)
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode body: %v", err)
	}
	if _, present := payload["vcOnboarding"]; present {
		t.Error("/settings must not carry the vcOnboarding policy")
	}
	// The onboarding form reads this flag to decide whether to offer the option.
	if enabled, ok := payload["vcOnboardingEnabled"].(bool); !ok || !enabled {
		t.Errorf("vcOnboardingEnabled = %v, want true", payload["vcOnboardingEnabled"])
	}
}
