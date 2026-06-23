package models

import "gorm.io/datatypes"

type Settings struct {
	ID                  uint   `gorm:"primarykey"`
	Description         string `json:"description"`
	RegistrarId         string `json:"registrarId"`
	DataspaceId         string `json:"dataspaceId"`
	PrefillAuthRegistry bool   `json:"prefillAuthRegistry"`
	AuthRegistryId      string `json:"authRegistryId"`
	AuthRegistryName    string `json:"authRegistryName"`
	AuthRegistryUrl     string `json:"authRegistryUrl"`
	// Agreements is the JSON array of onboarding agreement documents (see
	// models.Agreement). Stored raw so it tolerates the legacy []string shape on
	// read and is managed through the dedicated /settings/agreements endpoints
	// (which redact secrets) rather than the generic settings update.
	Agreements datatypes.JSON `gorm:"type:json" json:"agreements"`
	// AgreementsInitialized guards one-time seeding of the bundled iSHARE
	// agreements: once true, removed built-ins are not re-added on restart.
	AgreementsInitialized bool   `json:"agreementsInitialized"`
	LogoPath              string `json:"logoPath"`
	// FaviconPath is the uploaded browser-tab icon; empty means the iSHARE default.
	FaviconPath string `json:"faviconPath"`
	// Theme holds the LIVE colour/font overrides published to all visitors as a
	// JSON object of {tokenKey: "#hex", fontHeading, fontBody}; empty/absent means
	// "use the brand defaults".
	Theme datatypes.JSON `gorm:"type:json" json:"theme"`
	// Themes is the saved library of named themes a deployment can switch between,
	// stored as a JSON array of {name, colors, fontHeading, fontBody}.
	Themes datatypes.JSON `gorm:"type:json" json:"themes"`
	// ActiveTheme is the name of the theme currently published to all visitors
	// (empty means the iSHARE brand default). Its values are mirrored into Theme.
	ActiveTheme string `json:"activeTheme"`

	// Onboarding-flow configuration, admin-editable from the Onboarding settings
	// tab. Each mirrors a NEXT_PUBLIC_* env var; an empty string means "not
	// configured — fall back to the env default". Booleans are stored as the
	// strings "true"/"false" (or "" when unset) so the env fallback is unambiguous.
	DefaultAssociationName string `json:"defaultAssociationName"`
	SkipRoles              string `json:"skipRoles"`
	ActiveRoles            string `json:"activeRoles"`
	DefaultRole            string `json:"defaultRole"`
	AutoAcceptProposal     string `json:"autoAcceptProposal"`

	// Satellite connection overrides (non-secret). Each is empty by default, in
	// which case the matching deploy env var is used; a non-empty value overrides
	// it. The client certificate + private key are NOT here — they stay env-only.
	SatelliteBaseUrl            string `json:"satelliteBaseUrl"`
	SatelliteIss                string `json:"satelliteIss"`
	SatelliteAud                string `json:"satelliteAud"`
	SatelliteVersion            string `json:"satelliteVersion"`
	SatelliteEpCreationEndpoint string `json:"satelliteEpCreationEndpoint"`
	SatellitePartiesEndpoint    string `json:"satellitePartiesEndpoint"`
	SatelliteTokenEndpoint      string `json:"satelliteTokenEndpoint"`
	SatelliteTokenScope         string `json:"satelliteTokenScope"`
	DataspaceTitle              string `json:"dataspaceTitle"`
	// VcIssuerBaseUrl is the external iSHARE VC issuer the dashboard polls for
	// credential offers. Non-secret URL, admin-editable; overrides the
	// VC_ISSUER_BASE_URL env default when set. The issuer API key (if any) stays
	// env-only and is never stored here.
	VcIssuerBaseUrl string `json:"vcIssuerBaseUrl"`
	// PrApiBaseUrl is the Participant Registry admin API (SO.api) base URL the
	// portal proxies admin actions to (forwarding the operator's token). Non-secret,
	// admin-editable; overrides the PR_API_BASE_URL env default when set.
	PrApiBaseUrl string `json:"prApiBaseUrl"`
}
