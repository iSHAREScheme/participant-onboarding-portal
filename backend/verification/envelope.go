// Package verification implements the portal's OID4VP verifier: it accepts a
// Verifiable Presentation from an applicant's wallet, proves that every
// credential inside it was signed by a trusted issuer and is still valid, and
// projects the credential subjects onto the onboarding form.
//
// The portal deliberately verifies in-process rather than delegating to the
// external iSHARE VC issuer: that service is issuance-only (it signs VCs and
// serves OID4VCI offers), and the trust decision here — "which issuers may
// pre-fill an onboarding proposal on this deployment" — is the portal
// operator's, not the issuer's.
//
// Securing mechanism, per the iSHARE v3 VC profile (schemas.ishare.eu/v3):
// credentials travel as W3C VC 2.0 EnvelopedVerifiableCredential objects whose
// `id` is a `data:application/vc+jwt,<JWT>` URL. The JWT is ES256/RS256 signed
// with a `kid` that is a DID URL into the issuer's DID document; no JWK is
// embedded, so the key must always be resolved (see keys.go).
package verification

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
)

const (
	// Data-URL prefixes of the enveloped securing mechanisms (W3C VC 2.0 §4.2).
	credentialJWTPrefix   = "data:application/vc+jwt,"
	presentationJWTPrefix = "data:application/vp+jwt,"

	TypeEnvelopedCredential    = "EnvelopedVerifiableCredential"
	TypeEnvelopedPresentation  = "EnvelopedVerifiablePresentation"
	TypeVerifiablePresentation = "VerifiablePresentation"
)

// maxPresentationBytes bounds an inbound vp_token. A presentation carrying a
// handful of credentials is a few kilobytes; anything past this is abuse.
const maxPresentationBytes = 512 * 1024

// Strings unmarshals a JSON-LD term that may be either a single string or an
// array of strings — the VC data model allows both for `type`.
type Strings []string

func (s *Strings) UnmarshalJSON(data []byte) error {
	var single string
	if err := json.Unmarshal(data, &single); err == nil {
		*s = Strings{single}
		return nil
	}
	var many []string
	if err := json.Unmarshal(data, &many); err != nil {
		return fmt.Errorf("value is neither a string nor an array of strings")
	}
	*s = Strings(many)
	return nil
}

// Contains reports whether the term list carries the given type.
func (s Strings) Contains(want string) bool {
	for _, v := range s {
		if v == want {
			return true
		}
	}
	return false
}

// Presentation is the unsecured view of a verifiable presentation. Only the
// fields the verifier acts on are modelled; unknown members are ignored so a
// richer wallet payload still parses.
type Presentation struct {
	ID     string          `json:"id,omitempty"`
	Type   Strings         `json:"type"`
	Holder json.RawMessage `json:"holder,omitempty"`
	// Credentials are the raw `verifiableCredential` entries, each of which may
	// be an enveloped object, a bare JWT string, or an embedded JSON credential.
	Credentials []json.RawMessage `json:"verifiableCredential,omitempty"`
}

// HolderID extracts the holder identifier, which the data model allows to be
// either a plain string or an object with an `id`.
func (p *Presentation) HolderID() string {
	if len(p.Holder) == 0 {
		return ""
	}
	var asString string
	if err := json.Unmarshal(p.Holder, &asString); err == nil {
		return asString
	}
	var asObject struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(p.Holder, &asObject); err == nil {
		return asObject.ID
	}
	return ""
}

// envelope is the shape shared by EnvelopedVerifiableCredential and
// EnvelopedVerifiablePresentation: the secured token lives in the `id` data URL.
type envelope struct {
	ID   string  `json:"id"`
	Type Strings `json:"type"`
}

// ParsedPresentation is the result of unwrapping a vp_token: the presentation
// metadata plus every credential JWT found inside it, still unverified.
type ParsedPresentation struct {
	Presentation *Presentation
	// PresentationJWT is the VP's own secured token when the presentation itself
	// was enveloped (vp+jwt). Empty for an unsecured JSON presentation — the
	// iSHARE examples publish unsecured presentations, so this is common.
	PresentationJWT string
	// CredentialJWTs are the `vc+jwt` tokens to verify, in presentation order.
	CredentialJWTs []string
}

// ParsePresentation unwraps an inbound vp_token. It accepts, in order:
//
//   - a bare `vp+jwt` compact JWT,
//   - a JSON EnvelopedVerifiablePresentation wrapping one,
//   - a plain JSON VerifiablePresentation.
//
// Parsing never validates a signature; it only establishes what must be
// verified. An input carrying no credential JWT is rejected here rather than
// silently verifying to an empty result.
func ParsePresentation(raw []byte) (*ParsedPresentation, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("presentation is empty")
	}
	if len(raw) > maxPresentationBytes {
		return nil, fmt.Errorf("presentation exceeds the %d byte limit", maxPresentationBytes)
	}

	trimmed := strings.TrimSpace(string(raw))

	// A bare compact JWT (three base64url segments, no JSON punctuation).
	if looksLikeCompactJWT(trimmed) {
		return parsePresentationJWT(trimmed)
	}

	// Quoted JSON string holding a JWT — some wallets post vp_token that way.
	if strings.HasPrefix(trimmed, `"`) {
		var unquoted string
		if err := json.Unmarshal([]byte(trimmed), &unquoted); err == nil && looksLikeCompactJWT(strings.TrimSpace(unquoted)) {
			return parsePresentationJWT(strings.TrimSpace(unquoted))
		}
	}

	var env envelope
	if err := json.Unmarshal([]byte(trimmed), &env); err != nil {
		return nil, fmt.Errorf("presentation is not valid JSON: %w", err)
	}
	if env.Type.Contains(TypeEnvelopedPresentation) {
		token, ok := strings.CutPrefix(env.ID, presentationJWTPrefix)
		if !ok {
			return nil, fmt.Errorf("enveloped presentation id is not a %q data URL", presentationJWTPrefix)
		}
		return parsePresentationJWT(strings.TrimSpace(token))
	}

	presentation, err := decodePresentationBody([]byte(trimmed))
	if err != nil {
		return nil, err
	}
	credentialJWTs, err := collectCredentialJWTs(presentation)
	if err != nil {
		return nil, err
	}
	return &ParsedPresentation{Presentation: presentation, CredentialJWTs: credentialJWTs}, nil
}

// parsePresentationJWT unwraps a vp+jwt: the presentation body is either the
// `vp` claim (JWT-VC presentation profile) or the payload itself.
func parsePresentationJWT(token string) (*ParsedPresentation, error) {
	payload, err := DecodeJWTPayload(token)
	if err != nil {
		return nil, fmt.Errorf("presentation token is not a readable JWT: %w", err)
	}
	body := payload
	var wrapper struct {
		VP json.RawMessage `json:"vp"`
	}
	if err := json.Unmarshal(payload, &wrapper); err == nil && len(wrapper.VP) > 0 {
		body = wrapper.VP
	}
	presentation, err := decodePresentationBody(body)
	if err != nil {
		return nil, err
	}
	credentialJWTs, err := collectCredentialJWTs(presentation)
	if err != nil {
		return nil, err
	}
	return &ParsedPresentation{
		Presentation:    presentation,
		PresentationJWT: token,
		CredentialJWTs:  credentialJWTs,
	}, nil
}

func decodePresentationBody(body []byte) (*Presentation, error) {
	var presentation Presentation
	if err := json.Unmarshal(body, &presentation); err != nil {
		return nil, fmt.Errorf("presentation body is not a verifiable presentation: %w", err)
	}
	if len(presentation.Type) > 0 && !presentation.Type.Contains(TypeVerifiablePresentation) {
		return nil, fmt.Errorf("presentation type %v does not include %q", []string(presentation.Type), TypeVerifiablePresentation)
	}
	return &presentation, nil
}

// collectCredentialJWTs extracts the secured token from every
// `verifiableCredential` entry. An embedded *unsecured* JSON credential is
// rejected: without a proof there is nothing to verify, and accepting one would
// let an applicant pre-fill the form with self-asserted data.
func collectCredentialJWTs(presentation *Presentation) ([]string, error) {
	tokens := make([]string, 0, len(presentation.Credentials))
	for i, entry := range presentation.Credentials {
		token, err := credentialJWTFromEntry(entry)
		if err != nil {
			return nil, fmt.Errorf("verifiableCredential[%d]: %w", i, err)
		}
		tokens = append(tokens, token)
	}
	if len(tokens) == 0 {
		return nil, fmt.Errorf("presentation carries no verifiable credentials")
	}
	return tokens, nil
}

func credentialJWTFromEntry(entry json.RawMessage) (string, error) {
	// A bare JWT string entry.
	var asString string
	if err := json.Unmarshal(entry, &asString); err == nil {
		asString = strings.TrimSpace(asString)
		if token, ok := strings.CutPrefix(asString, credentialJWTPrefix); ok {
			return strings.TrimSpace(token), nil
		}
		if looksLikeCompactJWT(asString) {
			return asString, nil
		}
		return "", fmt.Errorf("string entry is neither a compact JWT nor a %q data URL", credentialJWTPrefix)
	}

	var env envelope
	if err := json.Unmarshal(entry, &env); err != nil {
		return "", fmt.Errorf("entry is not an object: %w", err)
	}
	if !env.Type.Contains(TypeEnvelopedCredential) {
		return "", fmt.Errorf("entry is not an %s (unsecured credentials are not accepted)", TypeEnvelopedCredential)
	}
	token, ok := strings.CutPrefix(strings.TrimSpace(env.ID), credentialJWTPrefix)
	if !ok {
		return "", fmt.Errorf("enveloped credential id is not a %q data URL", credentialJWTPrefix)
	}
	return strings.TrimSpace(token), nil
}

// looksLikeCompactJWT reports whether s has the shape of a compact JWS. It is a
// routing heuristic only — the signature is checked later.
func looksLikeCompactJWT(s string) bool {
	if strings.ContainsAny(s, "{}\" \n\t") {
		return false
	}
	parts := strings.Split(s, ".")
	if len(parts) != 3 {
		return false
	}
	for _, p := range parts[:2] {
		if p == "" {
			return false
		}
	}
	return true
}

// DecodeJWTPayload base64url-decodes the claims segment of a compact JWT
// WITHOUT verifying the signature. Callers must only use the result to decide
// which key to verify with.
func DecodeJWTPayload(token string) ([]byte, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("expected 3 JWT segments, got %d", len(parts))
	}
	return base64.RawURLEncoding.DecodeString(parts[1])
}

// DecodeJWTHeader base64url-decodes the header segment of a compact JWT. Same
// caveat as DecodeJWTPayload: unverified, used only for key selection.
func DecodeJWTHeader(token string) (map[string]any, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("expected 3 JWT segments, got %d", len(parts))
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, err
	}
	var header map[string]any
	if err := json.Unmarshal(raw, &header); err != nil {
		return nil, err
	}
	return header, nil
}
