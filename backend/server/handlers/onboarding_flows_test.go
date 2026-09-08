package handlers

import (
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"

	"onboardingportal/models"
)

func TestValidateFlows(t *testing.T) {
	cases := []struct {
		name    string
		flows   []models.OnboardingFlow
		wantErr string // substring; "" = valid
	}{
		{"empty list", nil, ""},
		{"base flow", []models.OnboardingFlow{{Route: ""}}, ""},
		{"slug flow", []models.OnboardingFlow{{Route: "exampledataspace1"}}, ""},
		{"base plus slugs", []models.OnboardingFlow{{Route: ""}, {Route: "a1"}, {Route: "b-2"}}, ""},
		{"reserved route", []models.OnboardingFlow{{Route: "settings"}}, "reserved"},
		{"reserved api", []models.OnboardingFlow{{Route: "api"}}, "reserved"},
		{"uppercase", []models.OnboardingFlow{{Route: "Dataspace"}}, "must match"},
		{"slash", []models.OnboardingFlow{{Route: "a/b"}}, "must match"},
		{"leading dash", []models.OnboardingFlow{{Route: "-x"}}, "must match"},
		{"duplicate", []models.OnboardingFlow{{Route: "x"}, {Route: "x"}}, "used twice"},
		{"two base flows", []models.OnboardingFlow{{Route: ""}, {Route: ""}}, "base URL"},
	}
	for _, tc := range cases {
		err := validateFlows(tc.flows)
		if tc.wantErr == "" && err != nil {
			t.Errorf("%s: unexpected error %v", tc.name, err)
		}
		if tc.wantErr != "" {
			if err == nil {
				t.Errorf("%s: expected error containing %q, got nil", tc.name, tc.wantErr)
			} else if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("%s: error %q does not contain %q", tc.name, err.Error(), tc.wantErr)
			}
		}
	}
}

func TestPublicFlowViews(t *testing.T) {
	themes := datatypes.JSON(`[{"name":"Space One","colors":{"primary":"#123456"},"headerImagePath":"./uploads/x.png"}]`)
	flows := datatypes.JSON(`[
		{"route":"ds1","title":"DS1","themeName":"Space One","enabled":true,"defaultRole":"ServiceProvider"},
		{"route":"off","themeName":"Space One","enabled":false}
	]`)

	// Master switch off: nothing is exposed regardless of flows.
	off := models.Settings{PublicOnboardingEnabled: false, OnboardingFlows: flows, Themes: themes}
	if got := publicFlowViews(off); len(got) != 0 {
		t.Fatalf("master off: expected no flows, got %d", len(got))
	}

	on := models.Settings{PublicOnboardingEnabled: true, OnboardingFlows: flows, Themes: themes}
	views := publicFlowViews(on)
	if len(views) != 1 {
		t.Fatalf("expected 1 enabled flow, got %d", len(views))
	}
	v := views[0]
	if v["route"] != "ds1" || v["defaultRole"] != "ServiceProvider" {
		t.Fatalf("flow fields wrong: %+v", v)
	}
	theme, ok := v["theme"].(fiber.Map)
	if !ok {
		t.Fatalf("theme not resolved: %+v", v["theme"])
	}
	if _, leaked := theme["headerImagePath"]; leaked {
		t.Fatal("filesystem path leaked into the public view")
	}
	if theme["headerImageUrl"] != "/api/backend/settings/themes/Space One/asset/header-image" {
		t.Fatalf("headerImageUrl wrong: %v", theme["headerImageUrl"])
	}
	if _, hasFav := theme["faviconUrl"]; hasFav {
		t.Fatal("faviconUrl should be absent when no favicon uploaded")
	}
}
