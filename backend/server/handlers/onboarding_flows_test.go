package handlers

import (
	"encoding/json"
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

func TestPublicFlowViewsAgreementsAndAuthRegistry(t *testing.T) {
	agreements := datatypes.JSON(`[
		{"id":"tou","title":"ToU","version":"1","type":"frameworkAgreement","filePath":"/x/tou.pdf"},
		{"id":"dsa","title":"DSA","version":"2","type":"dataspaceAgreement","url":"https://example.org/dsa.pdf","auth":{"method":"basic","username":"u","password":"secret"}}
	]`)
	flows := datatypes.JSON(`[
		{"route":"all","enabled":true},
		{"route":"tou-only","enabled":true,"agreementIds":["tou","gone"],
		 "dataspaceId":"ds-1","dataspaceTitle":"Space One",
		 "authRegistryId":"EU.EORI.NLAR","authRegistryName":"AR One","authRegistryUrl":"https://ar.example.org"}
	]`)
	s := models.Settings{PublicOnboardingEnabled: true, OnboardingFlows: flows, Agreements: agreements}
	views := publicFlowViews(s)
	if len(views) != 2 {
		t.Fatalf("expected 2 flows, got %d", len(views))
	}

	// Empty selection = every configured agreement.
	all, _ := views[0]["agreements"].([]publicAgreementView)
	if len(all) != 2 {
		t.Fatalf("empty agreementIds should expose all agreements, got %d", len(all))
	}
	if ids, _ := views[0]["agreementIds"].([]string); ids == nil || len(ids) != 0 {
		t.Fatalf("agreementIds should serialise as an empty list, got %v", views[0]["agreementIds"])
	}

	// Explicit selection: only existing selected ids, in configured order, public view only.
	sub, _ := views[1]["agreements"].([]publicAgreementView)
	if len(sub) != 1 || sub[0].ID != "tou" {
		t.Fatalf("expected only 'tou' agreement, got %+v", sub)
	}
	raw, _ := json.Marshal(views[1])
	if strings.Contains(string(raw), "secret") || strings.Contains(string(raw), "/x/tou.pdf") {
		t.Fatalf("agreement secrets/paths leaked into the public flow view: %s", raw)
	}
	if views[1]["dataspaceId"] != "ds-1" || views[1]["dataspaceTitle"] != "Space One" {
		t.Fatalf("dataspace fields wrong: %+v", views[1])
	}
	if views[1]["authRegistryId"] != "EU.EORI.NLAR" || views[1]["authRegistryUrl"] != "https://ar.example.org" {
		t.Fatalf("auth registry fields wrong: %+v", views[1])
	}
}

func TestValidateFlowsAgreementsAndAuthRegistry(t *testing.T) {
	if err := validateFlows([]models.OnboardingFlow{{Route: "a", AgreementIds: []string{"tou", " "}}}); err == nil {
		t.Fatal("blank agreement id should be rejected")
	}
	if err := validateFlows([]models.OnboardingFlow{{Route: "a", AuthRegistryUrl: "ar.example.org"}}); err == nil {
		t.Fatal("non-absolute auth registry URL should be rejected")
	}
	if err := validateFlows([]models.OnboardingFlow{{Route: "a", AuthRegistryUrl: "https://ar.example.org", AgreementIds: []string{"tou"}}}); err != nil {
		t.Fatalf("valid flow rejected: %v", err)
	}
}

func TestResolveFlowDataspace(t *testing.T) {
	flows := datatypes.JSON(`[{"route":"ds1","enabled":false,"dataspaceId":"flow-ds","dataspaceTitle":"Flow DS"},{"route":"plain","enabled":true}]`)
	s := &models.Settings{DataspaceId: "settings-ds", DataspaceTitle: "Settings DS", OnboardingFlows: flows}

	if id, title := resolveFlowDataspace("cfg-ds", "Cfg DS", nil, "ds1"); id != "cfg-ds" || title != "Cfg DS" {
		t.Fatalf("no settings: got %s/%s", id, title)
	}
	if id, title := resolveFlowDataspace("cfg-ds", "Cfg DS", s, ""); id != "settings-ds" || title != "Settings DS" {
		t.Fatalf("settings override: got %s/%s", id, title)
	}
	if id, title := resolveFlowDataspace("cfg-ds", "Cfg DS", s, "plain"); id != "settings-ds" || title != "Settings DS" {
		t.Fatalf("flow without dataspace should inherit: got %s/%s", id, title)
	}
	// A disabled flow still resolves: the proposal was submitted through it.
	if id, title := resolveFlowDataspace("cfg-ds", "Cfg DS", s, "ds1"); id != "flow-ds" || title != "Flow DS" {
		t.Fatalf("flow override: got %s/%s", id, title)
	}

	all := []models.Agreement{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	if got := flowAgreements(all, nil); len(got) != 3 {
		t.Fatalf("nil selection should return all, got %d", len(got))
	}
	if got := flowAgreements(all, []string{"c", "a", "zz"}); len(got) != 2 || got[0].ID != "a" || got[1].ID != "c" {
		t.Fatalf("selection should keep configured order and drop unknown ids, got %+v", got)
	}
}
