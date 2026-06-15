package models

// Agreement is one onboarding agreement document an applicant reads and signs.
// The Source field determines where the document is served from:
//
//	"builtin" — a PDF bundled with the portal (the iSHARE agreements), read from disk
//	"file"    — an admin-uploaded PDF, read from disk
//	"url"     — fetched live from an (optionally authenticated) external URL
//
// Agreements are stored as a JSON array in Settings.Agreements. Built-ins are
// seeded once on first run and, like any other entry, can be removed by an admin.
type Agreement struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Version string `json:"version"`
	Source  string `json:"source"` // builtin | file | url

	// Type maps the document to the registry claim/agreement it backs:
	//   v3: "frameworkAgreement" | "dataspaceAgreement" (→ the matching claim's
	//       verificationHash)
	//   v2: "TermsOfUse" | "AccessionAgreement"
	// Empty is treated as "frameworkAgreement" (the mandatory v3 claim).
	Type string `json:"type,omitempty"`

	// Built-in / file sources: server-side path to the PDF.
	FilePath string `json:"filePath,omitempty"`

	// URL source: the document location and optional fetch authentication.
	URL  string         `json:"url,omitempty"`
	Auth *AgreementAuth `json:"auth,omitempty"`
}

// AgreementAuth configures how the backend authenticates when fetching a
// protected agreement URL. Secret fields (Password, Token, ClientSecret and any
// header marked Secret) are stored encrypted at rest and are NEVER returned to
// the client — on read they are blanked and a matching "<field>Set" boolean is
// surfaced instead so the UI can show "configured, leave blank to keep".
type AgreementAuth struct {
	// Method selects the scheme: none | basic | bearer | oauth2 | custom.
	Method string `json:"method"`

	// Basic auth.
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"` // secret

	// Bearer token / API key. HeaderName defaults to "Authorization"; Scheme is
	// the optional prefix (e.g. "Bearer") prepended to the token value. For a raw
	// API key set HeaderName (e.g. "X-API-Key") and leave Scheme empty.
	HeaderName string `json:"headerName,omitempty"`
	Scheme     string `json:"scheme,omitempty"`
	Token      string `json:"token,omitempty"` // secret

	// OAuth2 client-credentials grant. The backend exchanges these at TokenURL for
	// an access token, then fetches the document with a Bearer header.
	TokenURL     string `json:"tokenUrl,omitempty"`
	ClientID     string `json:"clientId,omitempty"`
	ClientSecret string `json:"clientSecret,omitempty"` // secret
	Scope        string `json:"scope,omitempty"`

	// Custom headers sent verbatim with the fetch. A header's Value is treated as
	// a secret (encrypted at rest, redacted on read) when Secret is true.
	Headers []AgreementHeader `json:"headers,omitempty"`
}

// AgreementHeader is one custom HTTP header used when fetching a protected URL.
type AgreementHeader struct {
	Name   string `json:"name"`
	Value  string `json:"value,omitempty"`
	Secret bool   `json:"secret,omitempty"`
}
