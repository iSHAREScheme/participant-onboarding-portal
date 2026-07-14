package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"onboardingportal/models"
	"onboardingportal/responses"

	"github.com/gofiber/fiber/v2"
)

// The portal does NOT issue or sign credentials itself. An external iSHARE VC
// issuer receives party.created/updated webhooks from the Participant Registry,
// builds + signs the VCs, and exposes OID4VCI credential-offer URIs. The portal
// is the "ObP" in that design: it polls the issuer for the offers belonging to
// the caller's party and relays them to the dashboard, which renders them as QR
// codes / wallet deep links. See ../ishare-vc-issuer (DESIGN.md §7 Poll Contract).

// issuerHTTPTimeout bounds every call to the external issuer.
const issuerHTTPTimeout = 10 * time.Second

// callerProposal loads the proposal owned by the authenticated caller, matched on
// the token's preferred_username (the identity HandlePropose stamps on creation).
// Returns nil when the caller has no proposal or no usable identity. This is the
// IDOR boundary: the party id we poll the issuer with is derived here from the
// caller's own token — never taken from the request — so a user can only ever see
// their own credential offers.
func (h *HandlerRegistry) callerProposal(c *fiber.Ctx) *models.Proposal {
	claims := currentClaims(c)
	if claims == nil {
		return nil
	}
	username := strings.TrimSpace(claims.PreferredUsername)
	if username == "" {
		return nil
	}
	var proposal models.Proposal
	if err := h.Server.DB.Where("keycloak_username = ?", username).First(&proposal).Error; err != nil {
		return nil
	}
	return &proposal
}

// issuerConfigured reports whether an external VC issuer URL is set. No issuer ⇒
// the dashboard shows a "not configured" note instead of the credentials list.
func (h *HandlerRegistry) issuerConfigured() bool {
	return strings.TrimSpace(h.Config.VcIssuerBaseUrl) != ""
}

// issuerJSON performs a server-to-server request to the external issuer's ObP API
// and decodes the JSON response into out (when non-nil). A non-nil reqBody is sent
// as a JSON request payload (e.g. the credential_types for an issuance request).
// Returns the HTTP status code so callers can distinguish transport failures from
// issuer-side errors.
func (h *HandlerRegistry) issuerJSON(method, path string, reqBody, out interface{}) (int, error) {
	base := strings.TrimRight(strings.TrimSpace(h.Config.VcIssuerBaseUrl), "/")
	if base == "" {
		return 0, fmt.Errorf("vc issuer not configured")
	}
	var bodyReader io.Reader
	if reqBody != nil {
		raw, err := json.Marshal(reqBody)
		if err != nil {
			return 0, err
		}
		bodyReader = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, base+path, bodyReader)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")
	if reqBody != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	// The issuer's ObP API ("obp.api_key") requires a shared bearer on every /v1
	// request; attach it when configured. Without it a secured issuer answers 401
	// and the dashboard shows "unavailable".
	if key := strings.TrimSpace(h.Config.VcIssuerApiKey); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	client := &http.Client{Timeout: issuerHTTPTimeout}
	res, err := client.Do(req)
	if err != nil {
		return 0, err
	}
	defer res.Body.Close()

	// Cap the body to guard against a misbehaving/oversized upstream response.
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return res.StatusCode, err
	}
	// Only decode JSON on a 2xx. A non-2xx issuer response is frequently plaintext
	// (e.g. a 401 "missing bearer token" when VC_ISSUER_API_KEY is unset), and
	// feeding that to json.Unmarshal yielded the misleading "invalid character 'm'
	// looking for beginning of value" errors. Surface the status + a short body
	// snippet so the caller logs a clear, actionable diagnostic instead.
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		snippet := strings.TrimSpace(string(body))
		if len(snippet) > 200 {
			snippet = snippet[:200]
		}
		if snippet != "" {
			return res.StatusCode, fmt.Errorf("issuer returned %d: %s", res.StatusCode, snippet)
		}
		return res.StatusCode, fmt.Errorf("issuer returned %d", res.StatusCode)
	}
	if out != nil && len(body) > 0 {
		if err := json.Unmarshal(body, out); err != nil {
			return res.StatusCode, fmt.Errorf("issuer returned non-JSON (status %d): %w", res.StatusCode, err)
		}
	}
	return res.StatusCode, nil
}

// offerPath builds the issuer ObP path for the caller's party id, URL-escaping the
// id (it is an iSHARE identifier, but escaping keeps the path safe regardless).
func offerPath(partyID, suffix string) string {
	return "/v1/parties/" + url.PathEscape(partyID) + suffix
}

// GetMyCredentialOffers polls the external issuer for the credential offers that
// belong to the authenticated caller's party and relays the result to the
// dashboard. The response mirrors the issuer's poll contract
// ({status, results[], generated_at?, error?}) plus an issuerConfigured flag.
func (h *HandlerRegistry) GetMyCredentialOffers(c *fiber.Ctx) error {
	proposal := h.callerProposal(c)
	status := "none"
	partyID := ""
	if proposal != nil {
		status = proposal.Status
		partyID = strings.TrimSpace(proposal.PartyId)
	}

	resp := fiber.Map{
		"issuerConfigured": h.issuerConfigured(),
		"status":           status,
		"results":          []any{},
	}
	// Nothing to poll until the issuer is configured and the party exists in the
	// registry (party id assigned on admission).
	if !h.issuerConfigured() || partyID == "" {
		return c.JSON(resp)
	}

	var out map[string]interface{}
	code, err := h.issuerJSON(fiber.MethodGet, offerPath(partyID, "/offers"), nil, &out)
	if err != nil {
		log.Printf("vc-issuer: offers poll failed for %q: %v", partyID, err)
		resp["status"] = "unavailable"
		return c.JSON(resp)
	}
	if code < 200 || code >= 300 {
		log.Printf("vc-issuer: offers poll returned %d for %q", code, partyID)
		resp["status"] = "unavailable"
		return c.JSON(resp)
	}

	// Relay the issuer's fields (status/results/generated_at/error/party_id),
	// keeping our issuerConfigured flag.
	for k, v := range out {
		resp[k] = v
	}
	resp["issuerConfigured"] = true
	return c.JSON(resp)
}

// RefreshMyCredentialOffers asks the issuer to mint fresh offer URIs for the
// caller's already-issued credentials (used when offers have expired) without
// revoking or rebuilding them.
func (h *HandlerRegistry) RefreshMyCredentialOffers(c *fiber.Ctx) error {
	return h.issuerAction(c, "/offers/refresh")
}

// ReprocessMyCredentials re-triggers the issuer's reconcile for the caller's
// party (recovery path when a previous poll ended in "failed").
func (h *HandlerRegistry) ReprocessMyCredentials(c *fiber.Ctx) error {
	return h.issuerAction(c, "/reprocess")
}

// issuerAction is the shared body for the POST recovery endpoints: it resolves
// the caller's party, guards configuration/admission, proxies the POST, and
// relays the issuer's JSON.
func (h *HandlerRegistry) issuerAction(c *fiber.Ctx, suffix string) error {
	proposal := h.callerProposal(c)
	if proposal == nil || strings.TrimSpace(proposal.PartyId) == "" {
		return responses.ErrorResponse(c, fiber.StatusConflict, "Your party has not been admitted yet")
	}
	if !h.issuerConfigured() {
		return responses.ErrorResponse(c, fiber.StatusNotImplemented, "Credential issuance is not configured")
	}

	partyID := strings.TrimSpace(proposal.PartyId)
	var out map[string]interface{}
	code, err := h.issuerJSON(fiber.MethodPost, offerPath(partyID, suffix), nil, &out)
	if err != nil || code < 200 || code >= 300 {
		log.Printf("vc-issuer: action %q failed for %q: code=%d err=%v", suffix, partyID, code, err)
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "The credential issuer is currently unavailable")
	}
	if out == nil {
		out = map[string]interface{}{}
	}
	out["issuerConfigured"] = true
	return c.JSON(out)
}

// RequestMyCredentials triggers on-demand issuance of the named credential types
// for the authenticated caller's party. Issuance is portal-driven: the issuer
// builds only the requested types that are buildable from the party's registry
// claims, signs them, and exposes OID4VCI offers — which the dashboard then polls
// for. The party id is derived from the caller's token (never from input), so a
// user can only ever request credentials for their own party. Body:
// {"credentialTypes":["PartyCredential", ...]}.
func (h *HandlerRegistry) RequestMyCredentials(c *fiber.Ctx) error {
	proposal := h.callerProposal(c)
	if proposal == nil || strings.TrimSpace(proposal.PartyId) == "" {
		return responses.ErrorResponse(c, fiber.StatusConflict, "Your party has not been admitted yet")
	}
	if !h.issuerConfigured() {
		return responses.ErrorResponse(c, fiber.StatusNotImplemented, "Credential issuance is not configured")
	}

	var input struct {
		CredentialTypes []string `json:"credentialTypes"`
	}
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid request body")
	}
	types := make([]string, 0, len(input.CredentialTypes))
	for _, t := range input.CredentialTypes {
		if s := strings.TrimSpace(t); s != "" {
			types = append(types, s)
		}
	}
	if len(types) == 0 {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Select at least one credential to request")
	}

	partyID := strings.TrimSpace(proposal.PartyId)
	var out map[string]interface{}
	// POST /v1/parties/{id}/credentials {credential_types:[...]} → 202 + job_id.
	code, err := h.issuerJSON(fiber.MethodPost, offerPath(partyID, "/credentials"),
		map[string]any{"credential_types": types}, &out)
	if err != nil || code < 200 || code >= 300 {
		log.Printf("vc-issuer: credential request failed for %q (types=%v): code=%d err=%v", partyID, types, code, err)
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "The credential issuer is currently unavailable")
	}
	if out == nil {
		out = map[string]interface{}{}
	}
	out["issuerConfigured"] = true
	return c.JSON(out)
}
