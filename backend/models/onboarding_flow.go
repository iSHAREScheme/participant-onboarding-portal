package models

// OnboardingFlow is one published onboarding entry point. A deployment can
// expose several (the base URL and/or named routes such as /exampledataspace1),
// each branded by a theme from the theme library and each free to override the
// deployment-wide onboarding defaults. Stored as JSON in Settings.OnboardingFlows.
type OnboardingFlow struct {
	// Route is a single lowercase path segment ("" = the base URL).
	Route     string `json:"route"`
	Title     string `json:"title"`
	ThemeName string `json:"themeName"` // name of a saved theme in Settings.Themes
	Enabled   bool   `json:"enabled"`

	// Landing-page copy; empty falls back to the general description.
	Description string `json:"description"`

	// Dataspace the party joins through this flow (picked from the registry's
	// dataspaces); empty inherits the deployment default. The title travels
	// along so party creation does not need a second registry round-trip.
	DataspaceId    string `json:"dataspaceId"`
	DataspaceTitle string `json:"dataspaceTitle"`

	// AgreementIds selects which configured agreements this flow asks the
	// applicant to sign; empty means every configured agreement.
	AgreementIds []string `json:"agreementIds"`

	// Authorization registry the applicant is associated with when onboarding
	// through this flow (picked from the registry's authorisation registries);
	// an empty id inherits the global prefill setting.
	AuthRegistryId   string `json:"authRegistryId"`
	AuthRegistryName string `json:"authRegistryName"`
	AuthRegistryUrl  string `json:"authRegistryUrl"`

	// Per-flow overrides of the onboarding defaults; empty inherits.
	DefaultRole        string `json:"defaultRole"`
	SkipRoles          string `json:"skipRoles"`          // "true" | "false" | ""
	ActiveRoles        string `json:"activeRoles"`        // comma-separated
	AutoAcceptProposal string `json:"autoAcceptProposal"` // "true" | "false" | ""

	// IdentityMethods overrides which identity verification methods this flow
	// offers (comma-separated, see models.KnownIdentityMethods; "" = inherit the
	// deployment setting). This is what lets one deployment onboard a dataspace
	// that accepts only eIDAS seals alongside another that onboards from
	// Verifiable Credentials.
	IdentityMethods string `json:"identityMethods"`
	// VcAutoAccept overrides whether a presentation-verified proposal skips
	// admin review on this flow ("true" | "false" | "" = inherit).
	VcAutoAccept string `json:"vcAutoAccept"`
}

// ReservedFlowRoutes are portal paths a flow route may never shadow.
var ReservedFlowRoutes = map[string]bool{
	"admin": true, "api": true, "frameworks": true, "network-health": true,
	"organization-access": true, "participants": true, "party": true,
	"profile": true, "register": true, "settings": true, "submit": true,
	"subscribers": true, "transfer": true, "users": true, "_next": true,
	"uploads": true, "resources": true, "env.js": true, "favicon.ico": true,
	"index": true, "login": true, "logout": true, "onboard": true,
}
