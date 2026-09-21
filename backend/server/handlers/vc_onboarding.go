package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"sort"
	"strings"
	"time"

	"onboardingportal/config"
	"onboardingportal/models"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"onboardingportal/verification"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
)

// Credential-based onboarding: the applicant presents credentials they already
// hold, the portal verifies them, and the onboarding form is pre-filled from
// what was proven rather than from what was typed.
//
// Two ways in, both ending at the same verifier:
//
//   - Cross-device OID4VP. The portal mints a session, renders its request as a
//     QR code, and the wallet fetches the request object and posts the
//     presentation back. The wallet carries no Keycloak token — it is a phone,
//     not the browser session — so those two endpoints are public and are
//     authenticated by the unguessable session id plus a single-use nonce.
//   - Direct submission. The applicant pastes or uploads a presentation in the
//     browser. Same verification, no wallet round-trip, no holder binding.
//
// Nothing the browser reports about a verification is trusted: the result is
// read back from the session row server-side when the proposal is submitted
// (see applyVerifiedPresentation in party.go).

const (
	// vcSessionTTL bounds how long a QR code stays scannable.
	vcSessionTTL = 10 * time.Minute
	// maxDirectPresentationBytes caps a pasted/uploaded presentation.
	maxDirectPresentationBytes = 512 * 1024
)

type HandlerVcOnboarding struct {
	Server *s.Server
	Config *config.Config
}

func NewHandlerVcOnboarding(server *s.Server, cfg *config.Config) *HandlerVcOnboarding {
	return &HandlerVcOnboarding{Server: server, Config: cfg}
}

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

// loadPolicy returns the deployment's trust policy, falling back to the
// packaged default (all iSHARE types known, no issuer trusted, feature off).
func (h *HandlerVcOnboarding) loadPolicy() verification.TrustPolicy {
	var settings models.Settings
	if err := h.Server.DB.First(&settings).Error; err != nil {
		return verification.DefaultTrustPolicy()
	}
	return policyFromSettings(&settings)
}

func policyFromSettings(settings *models.Settings) verification.TrustPolicy {
	if settings == nil || len(settings.VcOnboarding) == 0 {
		return verification.DefaultTrustPolicy()
	}
	var policy verification.TrustPolicy
	if err := json.Unmarshal(settings.VcOnboarding, &policy); err != nil {
		log.Printf("vc-onboarding: stored policy is unreadable, using defaults: %v", err)
		return verification.DefaultTrustPolicy()
	}
	return policy
}

// vcEnabledForRoute layers the per-flow override on top of the deployment
// setting, mirroring how every other onboarding default resolves.
func vcEnabledForRoute(settings *models.Settings, policy verification.TrustPolicy, route string) bool {
	enabled := policy.Enabled
	if flow := flowByRoute(settings, route); flow != nil {
		switch strings.TrimSpace(flow.VcOnboarding) {
		case "true":
			enabled = true
		case "false":
			enabled = false
		}
	}
	return enabled
}

// vcAutoAcceptForRoute reports whether a presentation-verified proposal skips
// admin review, deployment default first and the flow override on top.
func vcAutoAcceptForRoute(settings *models.Settings, route string) bool {
	auto := false
	if settings != nil {
		auto = strings.TrimSpace(settings.VcAutoAcceptVerified) == "true"
	}
	if flow := flowByRoute(settings, route); flow != nil {
		switch strings.TrimSpace(flow.VcAutoAccept) {
		case "true":
			auto = true
		case "false":
			auto = false
		}
	}
	return auto
}

func (h *HandlerVcOnboarding) verifier(policy verification.TrustPolicy) *verification.Verifier {
	return verification.NewVerifier(policy)
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

// randomToken returns a URL-safe 256-bit random string.
func randomToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func (h *HandlerVcOnboarding) clientID() string {
	if id := strings.TrimSpace(h.Config.VcVerifierClientId); id != "" {
		return id
	}
	if id := strings.TrimSpace(h.Config.RegistrarId); id != "" {
		return id
	}
	return strings.TrimSpace(h.Config.SatelliteIss)
}

// CreateSession opens an OID4VP exchange for the authenticated applicant and
// returns everything the browser needs to render the QR code.
func (h *HandlerVcOnboarding) CreateSession(c *fiber.Ctx) error {
	var settings models.Settings
	_ = h.Server.DB.First(&settings).Error
	policy := policyFromSettings(&settings)

	var body struct {
		FlowRoute string `json:"flowRoute"`
	}
	_ = json.Unmarshal(c.Body(), &body)
	route := sanitizeFlowRouteIn(&settings, body.FlowRoute)

	if !vcEnabledForRoute(&settings, policy, route) {
		return responses.ErrorResponse(c, fiber.StatusNotImplemented, "Credential-based onboarding is not enabled")
	}
	base := strings.TrimRight(strings.TrimSpace(h.Config.VcVerifierBaseUrl), "/")
	if base == "" {
		return responses.ErrorResponse(c, fiber.StatusNotImplemented,
			"Credential-based onboarding is not fully configured: this portal has no publicly reachable verifier URL for wallets to reach")
	}

	owner := currentUsername(c)
	if owner == "" && !h.Config.OIDCDisable {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, "Sign in before presenting credentials")
	}

	id, err := randomToken()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not start a presentation session")
	}
	nonce, err := randomToken()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not start a presentation session")
	}
	state, err := randomToken()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not start a presentation session")
	}

	now := time.Now()
	session := models.VcPresentationSession{
		ID:               id,
		Nonce:            nonce,
		State:            state,
		Audience:         h.clientID(),
		FlowRoute:        route,
		KeycloakUsername: owner,
		Status:           models.VcSessionPending,
		CreatedAt:        now,
		ExpiresAt:        now.Add(vcSessionTTL),
	}
	if err := h.Server.DB.Create(&session).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not start a presentation session")
	}
	h.pruneExpiredSessions()

	requestURI := fmt.Sprintf("%s/onboarding/vc/request/%s", base, id)
	// openid4vp:// is the cross-device scheme wallets register for. Passing the
	// request by reference keeps the QR small enough to scan reliably.
	walletURL := fmt.Sprintf("openid4vp://authorize?client_id=%s&request_uri=%s",
		url.QueryEscape(h.clientID()), url.QueryEscape(requestURI))

	return c.JSON(fiber.Map{
		"sessionId":           id,
		"requestUri":          requestURI,
		"walletUrl":           walletURL,
		"expiresAt":           session.ExpiresAt,
		"status":              session.Status,
		"acceptedCredentials": acceptedCredentialSummary(policy),
	})
}

// GetRequestObject serves the authorization request a wallet fetches by
// request_uri. PUBLIC: a wallet holds no portal session. The unguessable id is
// the capability, and the object discloses only what the wallet must know.
func (h *HandlerVcOnboarding) GetRequestObject(c *fiber.Ctx) error {
	session, err := h.sessionByID(c.Params("id"))
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Unknown or expired presentation request")
	}
	if session.Status != models.VcSessionPending || session.Expired(time.Now()) {
		return responses.ErrorResponse(c, fiber.StatusGone, "This presentation request is no longer open")
	}

	policy := h.loadPolicy()
	base := strings.TrimRight(strings.TrimSpace(h.Config.VcVerifierBaseUrl), "/")

	return c.JSON(fiber.Map{
		"client_id":               session.Audience,
		"client_id_scheme":        "redirect_uri",
		"response_type":           "vp_token",
		"response_mode":           "direct_post",
		"response_uri":            fmt.Sprintf("%s/onboarding/vc/response/%s", base, session.ID),
		"nonce":                   session.Nonce,
		"state":                   session.State,
		"presentation_definition": presentationDefinition(policy),
	})
}

// SubmitResponse receives the wallet's presentation. PUBLIC, for the same
// reason as GetRequestObject. The session id in the path plus the state
// parameter must both match, the session must still be open, and it is
// consumed by the first response either way — so a presentation cannot be
// replayed against it.
func (h *HandlerVcOnboarding) SubmitResponse(c *fiber.Ctx) error {
	session, err := h.sessionByID(c.Params("id"))
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Unknown presentation request")
	}
	now := time.Now()
	if session.Status != models.VcSessionPending {
		return responses.ErrorResponse(c, fiber.StatusConflict, "This presentation request has already been answered")
	}
	if session.Expired(now) {
		h.failSession(session, "The presentation request expired before a credential arrived")
		return responses.ErrorResponse(c, fiber.StatusGone, "This presentation request has expired")
	}

	vpToken, state := presentationFromRequest(c)
	if strings.TrimSpace(state) != "" && state != session.State {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "State does not match this presentation request")
	}
	if strings.TrimSpace(vpToken) == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Missing vp_token")
	}

	policy := h.loadPolicy()
	result, err := h.verifier(policy).Verify([]byte(vpToken), verification.Expectation{
		Nonce:    session.Nonce,
		Audience: session.Audience,
	})
	if err != nil {
		// The applicant sees this text, so it must be specific enough to act on
		// without leaking verifier internals.
		log.Printf("vc-onboarding: verification failed for session %s: %v", session.ID, err)
		h.failSession(session, err.Error())
		return responses.ErrorResponse(c, fiber.StatusBadRequest, err.Error())
	}

	encoded, err := json.Marshal(result)
	if err != nil {
		h.failSession(session, "The verified credential could not be stored")
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not store the verification result")
	}

	session.Status = models.VcSessionVerified
	session.Result = datatypes.JSON(encoded)
	session.Error = ""
	session.VerifiedAt = &now
	if err := h.Server.DB.Save(session).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not store the verification result")
	}
	log.Printf("vc-onboarding: session %s verified %d credential(s), identity satisfied=%t",
		session.ID, len(result.Credentials), result.IdentitySatisfied)

	return c.JSON(fiber.Map{"status": models.VcSessionVerified})
}

// GetSession is the browser's poll. Authenticated, and scoped to the caller who
// opened the session so one applicant can never read another's claims.
func (h *HandlerVcOnboarding) GetSession(c *fiber.Ctx) error {
	session, err := h.sessionByID(c.Params("id"))
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Unknown presentation session")
	}
	if !h.callerOwnsSession(c, session) {
		// Same answer as an unknown id: do not confirm that the session exists.
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Unknown presentation session")
	}

	if session.Status == models.VcSessionPending && session.Expired(time.Now()) {
		h.failSession(session, "The presentation request expired")
		session.Status = models.VcSessionExpired
	}

	payload := fiber.Map{
		"sessionId": session.ID,
		"status":    session.Status,
		"expiresAt": session.ExpiresAt,
	}
	if session.Error != "" {
		payload["error"] = session.Error
	}
	if session.Status == models.VcSessionVerified && len(session.Result) > 0 {
		var result verification.Result
		if err := json.Unmarshal(session.Result, &result); err == nil {
			payload["result"] = result
		}
	}
	return c.JSON(payload)
}

// VerifyDirect verifies a presentation pasted or uploaded in the browser. It
// records the outcome as a session so the proposal submission path is
// identical to the wallet flow.
func (h *HandlerVcOnboarding) VerifyDirect(c *fiber.Ctx) error {
	var settings models.Settings
	_ = h.Server.DB.First(&settings).Error
	policy := policyFromSettings(&settings)

	var body struct {
		Presentation string `json:"presentation"`
		FlowRoute    string `json:"flowRoute"`
	}
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid request body")
	}
	route := sanitizeFlowRouteIn(&settings, body.FlowRoute)
	if !vcEnabledForRoute(&settings, policy, route) {
		return responses.ErrorResponse(c, fiber.StatusNotImplemented, "Credential-based onboarding is not enabled")
	}

	presentation := strings.TrimSpace(body.Presentation)
	if presentation == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Paste or upload a verifiable presentation")
	}
	if len(presentation) > maxDirectPresentationBytes {
		return responses.ErrorResponse(c, fiber.StatusRequestEntityTooLarge, "That presentation is too large")
	}

	owner := currentUsername(c)
	if owner == "" && !h.Config.OIDCDisable {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, "Sign in before presenting credentials")
	}

	// No session nonce to bind: a directly submitted presentation was not
	// requested by this portal, so replay protection rests on the credential
	// signatures and validity windows alone.
	result, err := h.verifier(policy).Verify([]byte(presentation), verification.Expectation{})
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, err.Error())
	}

	id, err := randomToken()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not record the verification")
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not record the verification")
	}
	now := time.Now()
	session := models.VcPresentationSession{
		ID:               id,
		Audience:         h.clientID(),
		FlowRoute:        route,
		KeycloakUsername: owner,
		Status:           models.VcSessionVerified,
		Result:           datatypes.JSON(encoded),
		CreatedAt:        now,
		ExpiresAt:        now.Add(vcSessionTTL),
		VerifiedAt:       &now,
	}
	if err := h.Server.DB.Create(&session).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not record the verification")
	}
	h.pruneExpiredSessions()

	return c.JSON(fiber.Map{
		"sessionId": session.ID,
		"status":    session.Status,
		"result":    result,
	})
}

// ---------------------------------------------------------------------------
// Admin configuration
// ---------------------------------------------------------------------------

// GetPolicy returns the credential-onboarding configuration for the settings UI.
func (h *HandlerVcOnboarding) GetPolicy(c *fiber.Ctx) error {
	var settings models.Settings
	_ = h.Server.DB.First(&settings).Error
	policy := policyFromSettings(&settings)
	return c.JSON(fiber.Map{
		"policy":             policy,
		"autoAcceptVerified": strings.TrimSpace(settings.VcAutoAcceptVerified) == "true",
		"verifierBaseUrl":    h.Config.VcVerifierBaseUrl,
		"clientId":           h.clientID(),
		"mappableFields":     sortedMappableFields(),
	})
}

// UpdatePolicy replaces the configuration after validating it, so a typo in a
// mapping target is refused at save time rather than silently dropping claims.
func (h *HandlerVcOnboarding) UpdatePolicy(c *fiber.Ctx) error {
	var body struct {
		Policy             verification.TrustPolicy `json:"policy"`
		AutoAcceptVerified *bool                    `json:"autoAcceptVerified"`
	}
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid request body")
	}
	if err := body.Policy.Validate(); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, err.Error())
	}
	encoded, err := json.Marshal(body.Policy)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Configuration could not be stored")
	}

	var settings models.Settings
	if err := h.Server.DB.First(&settings).Error; err != nil {
		settings = models.Settings{}
	}
	settings.VcOnboarding = datatypes.JSON(encoded)
	if body.AutoAcceptVerified != nil {
		settings.VcAutoAcceptVerified = "false"
		if *body.AutoAcceptVerified {
			settings.VcAutoAcceptVerified = "true"
		}
	}
	if settings.ID == 0 {
		if err := h.Server.DB.Create(&settings).Error; err != nil {
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not save the configuration")
		}
	} else if err := h.Server.DB.Save(&settings).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Could not save the configuration")
	}
	return c.JSON(fiber.Map{"policy": body.Policy, "autoAcceptVerified": settings.VcAutoAcceptVerified == "true"})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (h *HandlerVcOnboarding) sessionByID(id string) (*models.VcPresentationSession, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, fmt.Errorf("missing session id")
	}
	var session models.VcPresentationSession
	if err := h.Server.DB.Where("id = ?", id).First(&session).Error; err != nil {
		return nil, err
	}
	return &session, nil
}

// callerOwnsSession gates the browser-facing read on the session's owner.
func (h *HandlerVcOnboarding) callerOwnsSession(c *fiber.Ctx, session *models.VcPresentationSession) bool {
	if h.Config.OIDCDisable {
		return true
	}
	owner := strings.TrimSpace(session.KeycloakUsername)
	return owner != "" && owner == currentUsername(c)
}

func (h *HandlerVcOnboarding) failSession(session *models.VcPresentationSession, reason string) {
	session.Status = models.VcSessionFailed
	session.Error = reason
	if err := h.Server.DB.Save(session).Error; err != nil {
		log.Printf("vc-onboarding: could not record failure for session %s: %v", session.ID, err)
	}
}

// pruneExpiredSessions drops long-dead rows so the table cannot grow without
// bound. Sessions are short-lived, so a generous grace period is plenty.
func (h *HandlerVcOnboarding) pruneExpiredSessions() {
	cutoff := time.Now().Add(-24 * time.Hour)
	if err := h.Server.DB.Where("expires_at < ?", cutoff).
		Delete(&models.VcPresentationSession{}).Error; err != nil {
		log.Printf("vc-onboarding: pruning expired sessions failed: %v", err)
	}
}

// presentationFromRequest reads vp_token/state from either a direct_post form
// body or a JSON body, since wallets differ.
func presentationFromRequest(c *fiber.Ctx) (string, string) {
	if token := c.FormValue("vp_token"); strings.TrimSpace(token) != "" {
		return token, c.FormValue("state")
	}
	var body struct {
		VPToken json.RawMessage `json:"vp_token"`
		State   string          `json:"state"`
	}
	if err := json.Unmarshal(c.Body(), &body); err != nil {
		return "", ""
	}
	// vp_token may be a JSON string or an embedded JSON object.
	var asString string
	if err := json.Unmarshal(body.VPToken, &asString); err == nil {
		return asString, body.State
	}
	return string(body.VPToken), body.State
}

// presentationDefinition describes what the portal is asking for, derived from
// the enabled credential types so the wallet only offers credentials that can
// actually pre-fill this deployment's form.
func presentationDefinition(policy verification.TrustPolicy) fiber.Map {
	descriptors := make([]fiber.Map, 0, len(policy.AcceptedTypes))
	for _, accepted := range policy.AcceptedTypes {
		if !accepted.Enabled || len(accepted.Issuers) == 0 {
			continue
		}
		name := accepted.Label
		if name == "" {
			name = accepted.Type
		}
		descriptors = append(descriptors, fiber.Map{
			"id":    accepted.Type,
			"name":  name,
			"group": []string{"onboarding"},
			"constraints": fiber.Map{
				"fields": []fiber.Map{{
					"path":   []string{"$.type"},
					"filter": fiber.Map{"type": "string", "pattern": accepted.Type},
				}},
			},
		})
	}
	return fiber.Map{
		"id":                "ishare-onboarding",
		"name":              "iSHARE participant onboarding",
		"purpose":           "Pre-fill your onboarding application from credentials you already hold.",
		"input_descriptors": descriptors,
		"submission_requirements": []fiber.Map{{
			"name":  "Onboarding credential",
			"rule":  "pick",
			"count": 1,
			"from":  "onboarding",
		}},
	}
}

// acceptedCredentialSummary is the applicant-facing list of what may be
// presented; it deliberately omits resolver URLs and other operator config.
func acceptedCredentialSummary(policy verification.TrustPolicy) []fiber.Map {
	summary := make([]fiber.Map, 0, len(policy.AcceptedTypes))
	for _, accepted := range policy.AcceptedTypes {
		if !accepted.Enabled || len(accepted.Issuers) == 0 {
			continue
		}
		issuers := make([]string, 0, len(accepted.Issuers))
		for _, issuer := range accepted.Issuers {
			name := strings.TrimSpace(issuer.Name)
			if name == "" {
				name = issuer.DID
			}
			issuers = append(issuers, name)
		}
		label := accepted.Label
		if label == "" {
			label = accepted.Type
		}
		summary = append(summary, fiber.Map{"type": accepted.Type, "label": label, "issuers": issuers})
	}
	return summary
}

func sortedMappableFields() []string {
	fields := make([]string, 0, len(verification.MappableFields))
	for field := range verification.MappableFields {
		fields = append(fields, field)
	}
	sort.Strings(fields)
	return fields
}

// ---------------------------------------------------------------------------
// Consuming a verification when the proposal is submitted
// ---------------------------------------------------------------------------

// verifiedSessionWindow is how long a verified presentation stays usable for
// submitting a proposal. The QR itself expires in minutes; the applicant then
// needs time to finish the remaining steps of the form.
const verifiedSessionWindow = 24 * time.Hour

// applyVerifiedPresentation is the trust boundary for pre-filled proposals.
//
// The browser sends only a session id. Everything the presentation proved is
// re-read here from the session row and written over whatever was submitted,
// so a tampered form body cannot pass off an unverified party id, certificate
// or contact address as verified. An unknown, unowned, unverified, expired or
// already-consumed session is a hard error rather than a silent downgrade:
// submitting with a session id is a claim to have been verified, and a claim
// we cannot substantiate must not become a pending proposal that merely looks
// hand-typed.
func (h *HandlerParty) applyVerifiedPresentation(c *fiber.Ctx, proposal *models.Proposal, sessionID string) error {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil
	}

	var session models.VcPresentationSession
	if err := h.Server.DB.Where("id = ?", sessionID).First(&session).Error; err != nil {
		return fmt.Errorf("that credential verification is no longer available; please present your credentials again")
	}
	if !h.Config.OIDCDisable {
		owner := strings.TrimSpace(session.KeycloakUsername)
		if owner == "" || owner != currentUsername(c) {
			// Same message as "not found": never confirm someone else's session.
			return fmt.Errorf("that credential verification is no longer available; please present your credentials again")
		}
	}
	if session.Status != models.VcSessionVerified {
		return fmt.Errorf("that credential verification did not complete; please present your credentials again")
	}
	if session.ConsumedAt != nil {
		return fmt.Errorf("that credential verification has already been used for an application; please present your credentials again")
	}
	if session.VerifiedAt == nil || time.Since(*session.VerifiedAt) > verifiedSessionWindow {
		return fmt.Errorf("that credential verification has expired; please present your credentials again")
	}

	var result verification.Result
	if len(session.Result) == 0 || json.Unmarshal(session.Result, &result) != nil {
		return fmt.Errorf("that credential verification could not be read; please present your credentials again")
	}

	applyVerifiedFields(proposal, result.Fields)

	proposal.VcVerified = true
	proposal.VcVerifiedAt = session.VerifiedAt
	proposal.VcHolder = result.Holder
	proposal.IdCheckMethod = "vc"
	proposal.VcCredentialTypes = strings.Join(credentialTypeNames(result), ", ")
	proposal.VcIssuers = strings.Join(credentialIssuers(result), ", ")
	if encoded, err := json.Marshal(fiber.Map{
		"fields":            result.Fields,
		"fieldSources":      result.FieldSources,
		"identitySatisfied": result.IdentitySatisfied,
		"warnings":          result.Warnings,
	}); err == nil {
		proposal.VcPrefill = string(encoded)
	}

	// Skipping manual review is the operator's decision, resolved server-side
	// from the deployment default plus the flow override — never from the
	// submitted status.
	var settings models.Settings
	if h.Server.DB.First(&settings).Error == nil &&
		vcAutoAcceptForRoute(&settings, proposal.FlowRoute) &&
		proposal.Status == "pending" {
		proposal.Status = "approved"
		log.Printf("vc-onboarding: proposal for %q auto-approved from a verified presentation (flow %q)",
			proposal.PartyId, proposal.FlowRoute)
	}
	return nil
}

// applyVerifiedFields writes verified values over the submitted ones. Only
// fields the verifier actually proved are touched; the rest of the form is the
// applicant's own input and is left alone.
func applyVerifiedFields(proposal *models.Proposal, fields map[string]string) {
	targets := map[string]*string{
		verification.FieldCompanyName:      &proposal.CompanyName,
		verification.FieldKvkNumber:        &proposal.KvkNumber,
		verification.FieldPartyID:          &proposal.PartyId,
		verification.FieldPartyName:        &proposal.PartyName,
		verification.FieldCertSubjectName:  &proposal.CertSubjectName,
		verification.FieldCertX5c:          &proposal.CertX5c,
		verification.FieldCertX5tS256:      &proposal.CertX5tS256,
		verification.FieldIdpAssertion:     &proposal.IdpAssertion,
		verification.FieldAddress:          &proposal.Address,
		verification.FieldZipCode:          &proposal.ZipCode,
		verification.FieldCity:             &proposal.City,
		verification.FieldCountry:          &proposal.Country,
		verification.FieldWebsite:          &proposal.Website,
		verification.FieldAuthRegistry:     &proposal.AuthRegistry,
		verification.FieldAuthRegistryName: &proposal.AuthRegistryName,
		verification.FieldAuthRegistryURL:  &proposal.AuthRegistryUrl,
		verification.FieldCapabilitiesURL:  &proposal.CapabilitiesUrl,
		verification.FieldContactName:      &proposal.ContactName,
		verification.FieldContactEmail:     &proposal.ContactEmail,
		verification.FieldContactPhone:     &proposal.ContactPhone,
	}
	for field, value := range fields {
		if target, ok := targets[field]; ok && strings.TrimSpace(value) != "" {
			*target = value
		}
	}
}

// markPresentationConsumed ties a verification to the proposal it produced.
func (h *HandlerParty) markPresentationConsumed(sessionID string) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return
	}
	now := time.Now()
	if err := h.Server.DB.Model(&models.VcPresentationSession{}).
		Where("id = ? AND consumed_at IS NULL", sessionID).
		Update("consumed_at", now).Error; err != nil {
		log.Printf("vc-onboarding: could not mark session %s consumed: %v", sessionID, err)
	}
}

func credentialTypeNames(result verification.Result) []string {
	seen := map[string]bool{}
	names := make([]string, 0, len(result.Credentials))
	for _, credential := range result.Credentials {
		if credential.Type == "" || seen[credential.Type] {
			continue
		}
		seen[credential.Type] = true
		names = append(names, credential.Type)
	}
	return names
}

func credentialIssuers(result verification.Result) []string {
	seen := map[string]bool{}
	issuers := make([]string, 0, len(result.Credentials))
	for _, credential := range result.Credentials {
		name := credential.IssuerName
		if strings.TrimSpace(name) == "" {
			name = credential.Issuer
		}
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		issuers = append(issuers, name)
	}
	return issuers
}
