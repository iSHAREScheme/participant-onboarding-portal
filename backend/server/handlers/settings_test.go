package handlers

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"onboardingportal/config"
	"onboardingportal/models"
	s "onboardingportal/server"
)

// newSettingsTestHandler creates an isolated settings handler and Fiber app.
func newSettingsTestHandler(t *testing.T) (*fiber.App, *HandlerSettings, *gorm.DB) {
	t.Helper()

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	database, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open settings test database: %v", err)
	}
	if err := database.AutoMigrate(&models.Settings{}); err != nil {
		t.Fatalf("migrate settings test database: %v", err)
	}

	app := fiber.New()
	handler := NewHandlerSettings(&s.Server{DB: database}, &config.Config{})
	return app, handler, database
}

// TestQualifiedEidasSettingDefaultsToDisabled verifies clean deployments do not
// enforce the optional qualified-certificate rule.
func TestQualifiedEidasSettingDefaultsToDisabled(t *testing.T) {
	app, handler, _ := newSettingsTestHandler(t)
	app.Get("/settings/public", handler.GetPublicSettings)

	response, err := app.Test(httptest.NewRequest("GET", "/settings/public", nil))
	if err != nil {
		t.Fatalf("get public settings: %v", err)
	}
	defer response.Body.Close()

	var body map[string]interface{}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode public settings: %v", err)
	}
	if enabled, ok := body["requireQualifiedEidasCertificate"].(bool); !ok || enabled {
		t.Fatalf("expected qualified eIDAS validation to default to false, got %#v", body["requireQualifiedEidasCertificate"])
	}
}

// TestQualifiedEidasSettingCanBeEnabled verifies the admin update is persisted
// and published to the onboarding flow.
func TestQualifiedEidasSettingCanBeEnabled(t *testing.T) {
	app, handler, database := newSettingsTestHandler(t)
	app.Post("/settings", handler.UpdateSettings)
	app.Get("/settings/public", handler.GetPublicSettings)

	request := httptest.NewRequest(
		"POST",
		"/settings",
		strings.NewReader(`{"requireQualifiedEidasCertificate":true}`),
	)
	request.Header.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("update settings: %v", err)
	}
	response.Body.Close()
	if response.StatusCode != fiber.StatusOK {
		t.Fatalf("expected update status 200, got %d", response.StatusCode)
	}

	var saved models.Settings
	if err := database.First(&saved).Error; err != nil {
		t.Fatalf("read saved settings: %v", err)
	}
	if !saved.RequireQualifiedEidasCertificate {
		t.Fatal("expected qualified eIDAS setting to be persisted as enabled")
	}

	response, err = app.Test(httptest.NewRequest("GET", "/settings/public", nil))
	if err != nil {
		t.Fatalf("get public settings: %v", err)
	}
	defer response.Body.Close()

	var body map[string]interface{}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode public settings: %v", err)
	}
	if enabled, ok := body["requireQualifiedEidasCertificate"].(bool); !ok || !enabled {
		t.Fatalf("expected qualified eIDAS validation to be public and enabled, got %#v", body["requireQualifiedEidasCertificate"])
	}
}
