package responses

type RegistryResponse struct {
	// The satellite wraps the parties list in a signed JWT. v2 names this field
	// `parties_token` (snake_case); v3 uses `partiesToken` (camelCase). Go's JSON
	// case-insensitive matching does NOT bridge the two (the underscore breaks
	// EqualFold), so both are mapped and the caller uses whichever is populated.
	PartiesToken   string `json:"parties_token"`
	PartiesTokenV3 string `json:"partiesToken"`
}
