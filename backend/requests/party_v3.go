package requests

// PartyV3CreateRequest mirrors the iSHARE v3.0 `party` schema posted by the
// portal's claim-based submit form (frontend `Party`):
//
//	{ id, name, alsoKnownAs?, schemaVersion: "v3.0", claims: [...] }
//
// Claims are intentionally kept as generic maps rather than a typed,
// discriminated union. The v3 claim model is open/extensible and carries
// type-specific keys — including the literal JSON key "x5t#s256" — that survive
// a round trip far more reliably as raw maps than as tagged Go structs. The
// handler reads only the shared skeleton fields (`type`, `registrarId`,
// `status`) for validation and defaulting; everything else is forwarded to the
// satellite verbatim.
type PartyV3CreateRequest struct {
	ID            string                   `json:"id"`
	Name          string                   `json:"name"`
	AlsoKnownAs   []string                 `json:"alsoKnownAs,omitempty"`
	SchemaVersion string                   `json:"schemaVersion"`
	Claims        []map[string]interface{} `json:"claims"`
}
