package handlers

// Public onboarding flows: validation, the public view served to anonymous
// visitors, and the per-theme branding assets (header image + favicon - part
// of the THEME, so one theme can brand any number of flows).

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"

	"onboardingportal/models"
	"onboardingportal/responses"
)

// flowRoutePattern: single lowercase path segment, no slashes ("" = base URL).
var flowRoutePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,63}$`)

func decodeFlows(raw datatypes.JSON) []models.OnboardingFlow {
	var flows []models.OnboardingFlow
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &flows)
	}
	return flows
}

// validateFlows enforces route shape, uniqueness and the reserved-route list.
func validateFlows(flows []models.OnboardingFlow) error {
	seen := map[string]bool{}
	for i, f := range flows {
		route := strings.Trim(strings.TrimSpace(f.Route), "/")
		if route != f.Route {
			return fmt.Errorf("flow %d: route %q must be a bare path segment (no slashes or spaces)", i+1, f.Route)
		}
		if route != "" && !flowRoutePattern.MatchString(route) {
			return fmt.Errorf("flow %d: route %q must match [a-z0-9-], start alphanumeric, max 64 chars", i+1, route)
		}
		if models.ReservedFlowRoutes[route] {
			return fmt.Errorf("flow %d: route %q is reserved by the portal", i+1, route)
		}
		if seen[route] {
			if route == "" {
				return fmt.Errorf("flow %d: only one flow can live at the base URL", i+1)
			}
			return fmt.Errorf("flow %d: route %q is used twice", i+1, route)
		}
		seen[route] = true
		for _, id := range f.AgreementIds {
			if strings.TrimSpace(id) == "" {
				return fmt.Errorf("flow %d: agreement ids must not be blank", i+1)
			}
		}
		if u := strings.TrimSpace(f.AuthRegistryUrl); u != "" {
			parsed, err := url.Parse(u)
			if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
				return fmt.Errorf("flow %d: authorization registry URL %q must be an absolute http(s) URL", i+1, u)
			}
		}
	}
	return nil
}

// flowByRoute returns the configured flow at route, enabled or not: a proposal
// submitted through a flow keeps that flow's dataspace/agreements even if the
// admin unpublishes the flow before approving it.
func flowByRoute(settings *models.Settings, route string) *models.OnboardingFlow {
	if settings == nil || route == "" {
		return nil
	}
	flows := decodeFlows(settings.OnboardingFlows)
	for i := range flows {
		if flows[i].Route == route {
			return &flows[i]
		}
	}
	return nil
}

// flowAgreements narrows the configured agreements to the flow's selection,
// keeping the configured order. An empty selection means all of them; ids that
// no longer exist are skipped.
func flowAgreements(all []models.Agreement, ids []string) []models.Agreement {
	if len(ids) == 0 {
		return all
	}
	wanted := map[string]bool{}
	for _, id := range ids {
		wanted[strings.TrimSpace(id)] = true
	}
	out := make([]models.Agreement, 0, len(ids))
	for _, a := range all {
		if wanted[a.ID] {
			out = append(out, a)
		}
	}
	return out
}

// resolveFlowDataspace layers the dataspace a party joins: deployment config,
// then the Settings override, then the flow the proposal came through.
func resolveFlowDataspace(cfgID, cfgTitle string, settings *models.Settings, route string) (string, string) {
	id, title := cfgID, cfgTitle
	if settings != nil {
		if v := strings.TrimSpace(settings.DataspaceId); v != "" {
			id = v
		}
		if v := strings.TrimSpace(settings.DataspaceTitle); v != "" {
			title = v
		}
	}
	if f := flowByRoute(settings, route); f != nil && strings.TrimSpace(f.DataspaceId) != "" {
		id = strings.TrimSpace(f.DataspaceId)
		if v := strings.TrimSpace(f.DataspaceTitle); v != "" {
			title = v
		}
	}
	return id, title
}

// themeEntries decodes the Themes library preserving unknown keys, so the
// asset paths this file adds coexist with whatever the theme editor stores.
func themeEntries(raw datatypes.JSON) []map[string]interface{} {
	var entries []map[string]interface{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &entries)
	}
	return entries
}

func themeEntryByName(entries []map[string]interface{}, name string) map[string]interface{} {
	for _, e := range entries {
		if n, _ := e["name"].(string); n != "" && n == name {
			return e
		}
	}
	return nil
}

// publicFlowView is what anonymous visitors get per flow: branding + the
// onboarding knobs the register page consumes. Never includes admin fields.
func publicFlowViews(settings models.Settings) []fiber.Map {
	views := []fiber.Map{}
	if !settings.PublicOnboardingEnabled {
		return views
	}
	entries := themeEntries(settings.Themes)
	allAgreements := decodeAgreements(settings.Agreements)
	for _, f := range decodeFlows(settings.OnboardingFlows) {
		if !f.Enabled {
			continue
		}
		agreementIds := f.AgreementIds
		if agreementIds == nil {
			agreementIds = []string{}
		}
		view := fiber.Map{
			"route":              f.Route,
			"title":              f.Title,
			"themeName":          f.ThemeName,
			"description":        f.Description,
			"dataspaceId":        f.DataspaceId,
			"dataspaceTitle":     f.DataspaceTitle,
			"agreementIds":       agreementIds,
			"agreements":         publicViewAgreements(flowAgreements(allAgreements, f.AgreementIds)),
			"authRegistryId":     f.AuthRegistryId,
			"authRegistryName":   f.AuthRegistryName,
			"authRegistryUrl":    f.AuthRegistryUrl,
			"defaultRole":        f.DefaultRole,
			"skipRoles":          f.SkipRoles,
			"activeRoles":        f.ActiveRoles,
			"autoAcceptProposal": f.AutoAcceptProposal,
		}
		if entry := themeEntryByName(entries, f.ThemeName); entry != nil {
			// The colors/fonts as stored by the theme editor, plus asset URLS
			// (never filesystem paths) for the flow page to apply.
			theme := fiber.Map{}
			for k, v := range entry {
				if k == "headerImagePath" || k == "faviconPath" {
					continue
				}
				theme[k] = v
			}
			if p, _ := entry["headerImagePath"].(string); p != "" {
				theme["headerImageUrl"] = "/api/backend/settings/themes/" + f.ThemeName + "/asset/header-image"
			}
			if p, _ := entry["faviconPath"].(string); p != "" {
				theme["faviconUrl"] = "/api/backend/settings/themes/" + f.ThemeName + "/asset/favicon"
			}
			view["theme"] = theme
		}
		views = append(views, view)
	}
	return views
}

// mergeThemeAssets carries the asset paths (written by the upload endpoints)
// from the previously stored theme entries into a freshly submitted library,
// matched by theme name, unless the submitted entry already sets them.
func mergeThemeAssets(existing, incoming datatypes.JSON) datatypes.JSON {
	prev := themeEntries(existing)
	next := themeEntries(incoming)
	if len(prev) == 0 || len(next) == 0 {
		return incoming
	}
	for _, entry := range next {
		name, _ := entry["name"].(string)
		if name == "" {
			continue
		}
		old := themeEntryByName(prev, name)
		if old == nil {
			continue
		}
		for _, field := range []string{"headerImagePath", "faviconPath"} {
			if _, has := entry[field]; !has {
				if v, ok := old[field].(string); ok && v != "" {
					entry[field] = v
				}
			}
		}
	}
	merged, err := json.Marshal(next)
	if err != nil {
		return incoming
	}
	return datatypes.JSON(merged)
}

// sanitizeFlowRoute keeps a submitted flow route only when it matches a
// configured flow (unknown/garbage input degrades to "" = base flow).
func sanitizeFlowRoute(h *HandlerParty, raw string) string {
	route := strings.Trim(strings.TrimSpace(raw), "/")
	if route == "" || !flowRoutePattern.MatchString(route) {
		return ""
	}
	var settings models.Settings
	if h.Server.DB.First(&settings).Error != nil {
		return ""
	}
	for _, f := range decodeFlows(settings.OnboardingFlows) {
		if f.Route == route {
			return route
		}
	}
	return ""
}

// unescapeParam decodes a percent-encoded route parameter (theme names may
// contain spaces).
func unescapeParam(raw string) (string, error) {
	return url.PathUnescape(raw)
}

var themeAssetKinds = map[string]struct {
	field      string
	extensions map[string]bool
	maxBytes   int64
	formField  string
}{
	"header-image": {"headerImagePath", map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true, ".svg": true}, 5 * 1024 * 1024, "image"},
	"favicon":      {"faviconPath", map[string]bool{".ico": true, ".png": true, ".svg": true}, 1 * 1024 * 1024, "favicon"},
}

// UploadThemeAsset stores a header image or favicon INTO a named theme of the
// library (POST /settings/themes/:name/asset/:kind, admin-only).
func (h *HandlerSettings) UploadThemeAsset(c *fiber.Ctx) error {
	kind, ok := themeAssetKinds[c.Params("kind")]
	if !ok {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Unknown asset kind")
	}
	name, err := unescapeParam(c.Params("name"))
	if err != nil || strings.TrimSpace(name) == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Theme name is required")
	}

	file, err := c.FormFile(kind.formField)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "File is required (field '"+kind.formField+"')")
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !kind.extensions[ext] {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid file type")
	}
	if file.Size > kind.maxBytes {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "File too large")
	}

	var settings models.Settings
	if h.Server.DB.First(&settings).Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Settings not initialized")
	}
	entries := themeEntries(settings.Themes)
	entry := themeEntryByName(entries, name)
	if entry == nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Theme not found in the library")
	}

	if err := os.MkdirAll("./uploads", 0o755); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create upload directory")
	}
	// One file per theme+kind: remove the previous asset when replacing.
	if old, _ := entry[kind.field].(string); old != "" {
		if err := os.Remove(old); err != nil {
			log.Printf("Failed to remove old theme asset: %v", err)
		}
	}
	safeName := regexp.MustCompile(`[^a-zA-Z0-9_-]`).ReplaceAllString(name, "_")
	path := fmt.Sprintf("./uploads/theme_%s_%s_%s%s", safeName, c.Params("kind"), time.Now().Format("20060102150405"), ext)
	if err := c.SaveFile(file, path); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save file")
	}

	entry[kind.field] = path
	updated, err := json.Marshal(entries)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to encode themes")
	}
	settings.Themes = datatypes.JSON(updated)
	if err := h.Server.DB.Save(&settings).Error; err != nil {
		if removeErr := os.Remove(path); removeErr != nil {
			log.Printf("Failed to remove theme asset during rollback: %v", removeErr)
		}
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to update settings")
	}
	return c.JSON(fiber.Map{"message": "Asset uploaded", "theme": name, "kind": c.Params("kind")})
}

// GetThemeAsset serves a theme's header image or favicon (public: flow pages
// are anonymous by definition).
func (h *HandlerSettings) GetThemeAsset(c *fiber.Ctx) error {
	kind, ok := themeAssetKinds[c.Params("kind")]
	if !ok {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Unknown asset kind")
	}
	name, err := unescapeParam(c.Params("name"))
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid theme name")
	}
	var settings models.Settings
	if h.Server.DB.First(&settings).Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Not found")
	}
	entry := themeEntryByName(themeEntries(settings.Themes), name)
	if entry == nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Theme not found")
	}
	path, _ := entry[kind.field].(string)
	if path == "" {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "No asset uploaded")
	}
	if _, err := os.Stat(path); err != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Asset file missing")
	}
	return c.SendFile(path)
}
