package models

// OnboardingFlow is one public onboarding entry point. Route "" means the
// base URL; any other value is a single path segment (validated against
// ReservedFlowRoutes and a slug pattern). ThemeName references an entry of
// Settings.Themes by name; the theme carries the branding (colors, fonts,
// header image, favicon). The remaining fields override the deployment-wide
// onboarding settings for this flow only - empty string = inherit.
type OnboardingFlow struct {
	Route       string `json:"route"`
	Title       string `json:"title"`
	ThemeName   string `json:"themeName"`
	Enabled     bool   `json:"enabled"`
	Description string `json:"description"`

	DataspaceId        string `json:"dataspaceId"`
	DefaultRole        string `json:"defaultRole"`
	SkipRoles          string `json:"skipRoles"`
	ActiveRoles        string `json:"activeRoles"`
	AutoAcceptProposal string `json:"autoAcceptProposal"`
}

// ReservedFlowRoutes are path segments a flow route may never use: every
// existing page of the portal plus framework/asset prefixes. Kept here as the
// single source of truth; the settings handler enforces it and the admin UI
// mirrors it for immediate feedback.
var ReservedFlowRoutes = map[string]bool{
	"admin": true, "api": true, "frameworks": true, "network-health": true,
	"organization-access": true, "participants": true, "party": true,
	"profile": true, "register": true, "settings": true, "submit": true,
	"subscribers": true, "transfer": true, "users": true,
	"_next": true, "uploads": true, "resources": true, "env.js": true,
	"favicon.ico": true, "index": true, "login": true, "logout": true,
	"onboard": true,
}
