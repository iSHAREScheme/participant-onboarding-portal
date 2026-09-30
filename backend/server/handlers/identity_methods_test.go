package handlers

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"

	"onboardingportal/config"
	"onboardingportal/models"
	s "onboardingportal/server"
)

// TestIdentityMethodsForRoute verifies the layering every onboarding knob uses:
// the flow's own override first, then the deployment choice, then the default.
func TestIdentityMethodsForRoute(t *testing.T) {
	settings := settingsWithFlows(t, []models.OnboardingFlow{
		{Route: "vc-only", IdentityMethods: "vc"},
		{Route: "seal-and-vc", IdentityMethods: "VC, eidas"},
		{Route: "inherit"},
		// The base-URL flow (route "") must be honoured too: the register page
		// applies it in the browser, so the server has to agree.
		{Route: "", IdentityMethods: "eherkenning"},
	})

	for _, tc := range []struct {
		name       string
		deployment string
		route      string
		want       string
	}{
		{"flow override wins over the deployment", "eidas,eherkenning", "vc-only", "vc"},
		{"override is normalised to canonical order", "", "seal-and-vc", "eidas,vc"},
		{"empty override inherits the deployment", "eidas,vc", "inherit", "eidas,vc"},
		{"unset everywhere falls back to the default", "", "inherit", models.DefaultIdentityMethods},
		{"unknown route uses the deployment", "eidas", "no-such-flow", "eidas"},
		{"base-URL flow override applies", "eidas,vc", "", "eherkenning"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			settings.IdentityMethods = tc.deployment
			got := strings.Join(identityMethodsForRoute(settings, tc.route), ",")
			if got != tc.want {
				t.Errorf("identityMethodsForRoute(%q) = %q, want %q", tc.route, got, tc.want)
			}
		})
	}
}

// TestVerifiableCredentialsAreOffByDefault pins the requirement that a fresh
// deployment does not offer VCs until an admin enables them.
func TestVerifiableCredentialsAreOffByDefault(t *testing.T) {
	if identityMethodOffered(&models.Settings{}, "", models.IdentityMethodVC) {
		t.Fatal("VCs must be off until an admin enables them")
	}
	if identityMethodOffered(nil, "", models.IdentityMethodVC) {
		t.Fatal("VCs must be off when no settings row exists yet")
	}
	// The default reproduces the portal's behaviour before the setting existed.
	for _, method := range []string{models.IdentityMethodEidas, models.IdentityMethodEherkenning} {
		if !identityMethodOffered(&models.Settings{}, "", method) {
			t.Errorf("%s should be offered by default, as it was before this was configurable", method)
		}
	}
}

func TestNormalizeIdentityMethods(t *testing.T) {
	for _, tc := range []struct {
		in, want string
		wantErr  bool
	}{
		{"vc,eidas", "eidas,vc", false},            // canonical order
		{" EIDAS , eidas ,vc ", "eidas,vc", false}, // trimmed, lowercased, deduplicated
		{"", "", false},                            // empty = inherit / default
		{"eidas,passport", "", true},               // unknown method
		{" , ,", "", true},                         // explicitly nothing
	} {
		got, err := normalizeIdentityMethods(tc.in)
		if (err != nil) != tc.wantErr {
			t.Errorf("normalizeIdentityMethods(%q) error = %v, wantErr %t", tc.in, err, tc.wantErr)
			continue
		}
		if !tc.wantErr && got != tc.want {
			t.Errorf("normalizeIdentityMethods(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

// TestSubmitResponseRefusedWhenVCsSwitchedOff covers the window between a QR
// code being shown and the wallet answering: if an admin turned VCs off in
// between, the wallet's presentation must be refused rather than verified.
func TestSubmitResponseRefusedWhenVCsSwitchedOff(t *testing.T) {
	database := newVcTestDB(t)
	if err := database.Create(&models.Settings{IdentityMethods: "eidas"}).Error; err != nil {
		t.Fatalf("seed settings: %v", err)
	}
	now := time.Now()
	if err := database.Create(&models.VcPresentationSession{
		ID: "open-session", State: "st", Status: models.VcSessionPending,
		CreatedAt: now, ExpiresAt: now.Add(5 * time.Minute),
	}).Error; err != nil {
		t.Fatalf("seed session: %v", err)
	}

	app := fiber.New()
	handler := NewHandlerVcOnboarding(&s.Server{DB: database}, &config.Config{})
	app.Post("/onboarding/vc/response/:id", handler.SubmitResponse)

	request := httptest.NewRequest("POST", "/onboarding/vc/response/open-session",
		strings.NewReader("vp_token=eyJ.eyJ.sig&state=st"))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("submit response: %v", err)
	}
	if response.StatusCode != fiber.StatusForbidden {
		t.Errorf("status = %d, want %d", response.StatusCode, fiber.StatusForbidden)
	}

	var session models.VcPresentationSession
	if err := database.Where("id = ?", "open-session").First(&session).Error; err != nil {
		t.Fatalf("reload session: %v", err)
	}
	if session.Status != models.VcSessionFailed {
		t.Errorf("session status = %q, want %q so the browser stops waiting", session.Status, models.VcSessionFailed)
	}
}

// TestUpdateSettingsRejectsUnknownIdentityMethod makes a typo fail at save
// time instead of silently removing an identity option from a live flow.
func TestUpdateSettingsRejectsUnknownIdentityMethod(t *testing.T) {
	app, handler, _ := newSettingsTestHandler(t)
	app.Post("/settings", handler.UpdateSettings)

	request := httptest.NewRequest("POST", "/settings", strings.NewReader(`{"identityMethods":"eidas,passport"}`))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}
	if response.StatusCode != fiber.StatusBadRequest {
		t.Errorf("status = %d, want %d", response.StatusCode, fiber.StatusBadRequest)
	}
}
