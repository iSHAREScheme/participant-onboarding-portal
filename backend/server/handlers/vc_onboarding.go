package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"onboardingportal/config"
	"onboardingportal/models"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"onboardingportal/verification"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// User-facing errors of the credential-onboarding endpoints.
const (
	errPresentationSessionStart = "Could not start a presentation session"
	errRecordVerification       = "Could not record the verification"
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

	// Shared across requests so the key-document and status-list caches
	// actually hit: a Verifier built per request would fetch the issuer's DID
	// document and status list again on every presentation.
	keys       verification.KeyResolver
	status     verification.StatusChecker
	holderKeys verification.KeyResolver
	// verify is the verification entry point; tests replace it.
	verify func(policy verification.TrustPolicy, raw []byte, expect verification.Expectation) (*verification.Result, error)

	pruneMu   sync.Mutex
	lastPrune time.Time
}

func NewHandlerVcOnboarding(server *s.Server, cfg *config.Config) *HandlerVcOnboarding {
	h := &HandlerVcOnboarding{
		Server: server,
		Config: cfg,
		keys:   verification.NewHTTPKeyResolver(),
		status: verification.NewHTTPStatusChecker(),
	}
	h.holderKeys = newRegistryHolderResolver(NewHandlerRegistry(server, cfg))
	h.verify = func(policy verification.TrustPolicy, raw []byte, expect verification.Expectation) (*verification.Result, error) {
		return h.verifier(policy).Verify(raw, expect)
	}
	return h
}

// verifyPresentation runs the configured verifier (or the test stub).
func (h *HandlerVcOnboarding) verifyPresentation(policy verification.TrustPolicy, raw []byte, expect verification.Expectation) (*verification.Result, error) {
	if h.verify != nil {
		return h.verify(policy, raw, expect)
	}
	return h.verifier(policy).Verify(raw, expect)
}

// applicantSafeVerificationError is what the wallet and the browser get to see.
// Classified failures (an issuer's keys or status list not retrievable) are
// replaced by a fixed sentence: their detail names the operator's resolver URL
// or a dial target. Every other verifier message is about the credential itself
// (untrusted issuer, expired, revoked, wrong nonce) and is safe as is.
func applicantSafeVerificationError(err error) string {
	switch {
	case errors.Is(err, verification.ErrKeyResolution):
		return "The issuer's verification keys could not be retrieved. Please try again later or contact the operator."
	case errors.Is(err, verification.ErrStatusList):
		return "The credential's revocation status could not be checked. Please try again later or contact the operator."
	}
	return err.Error()
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

// vcAutoAcceptForRoute reports whether a presentation-verified proposal skips
// admin review, deployment default first and the flow override on top.
func vcAutoAcceptForRoute(settings *models.Settings, route string) bool {
	auto := false
	if settings != nil {
		auto = strings.TrimSpace(settings.VcAutoAcceptVerified) == "true"
	}
	if flow := flowAtRoute(settings, route); flow != nil {
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
	verifier := verification.NewVerifier(policy)
	if h.keys != nil {
		verifier.Keys = h.keys
	}
	if h.status != nil {
		verifier.Status = h.status
	}
	verifier.HolderKeys = h.holderKeys
	return verifier
}

// responseURI is where a wallet posts the presentation for a session. Under
// OID4VP's redirect_uri client identifier scheme it is also the client_id the
// wallet addresses the presentation to, so it doubles as the session audience.
func (h *HandlerVcOnboarding) responseURI(sessionID string) string {
	base := strings.TrimRight(strings.TrimSpace(h.Config.VcVerifierBaseUrl), "/")
	if base == "" {
		return ""
	}
	return fmt.Sprintf("%s/onboarding/vc/response/%s", base, sessionID)
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

	if !identityMethodOffered(&settings, route, models.IdentityMethodVC) {
		return responses.ErrorResponse(c, fiber.StatusNotImplemented, "Verifiable Credentials are not accepted on this onboarding flow")
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
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, errPresentationSessionStart)
	}
	nonce, err := randomToken()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, errPresentationSessionStart)
	}
	state, err := randomToken()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, errPresentationSessionStart)
	}

	now := time.Now()
	responseURI := h.responseURI(id)
	session := models.VcPresentationSession{
		ID:               id,
		Nonce:            nonce,
		State:            state,
		Audience:         responseURI,
		FlowRoute:        route,
		KeycloakUsername: owner,
		Status:           models.VcSessionPending,
		CreatedAt:        now,
		ExpiresAt:        now.Add(vcSessionTTL),
	}
	if err := h.Server.DB.Create(&session).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, errPresentationSessionStart)
	}
	h.pruneExpiredSessions()

	requestURI := fmt.Sprintf("%s/onboarding/vc/request/%s", base, id)
	// openid4vp:// is the cross-device scheme wallets register for. Passing the
	// request by reference keeps the QR small enough to scan reliably. With the
	// redirect_uri client identifier scheme the client_id IS the response_uri.
	walletURL := fmt.Sprintf("openid4vp://authorize?client_id=%s&request_uri=%s",
		url.QueryEscape(responseURI), url.QueryEscape(requestURI))

	return c.JSON(fiber.Map{
		"sessionId":           id,
		"clientId":            responseURI,
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
	// OID4VP: with client_id_scheme "redirect_uri" the client_id MUST equal the
	// response_uri the wallet posts to; a DID here makes conformant wallets
	// refuse the request. The session audience was minted as that URI.
	responseURI := h.responseURI(session.ID)

	return c.JSON(fiber.Map{
		"client_id":               responseURI,
		"client_id_scheme":        "redirect_uri",
		"response_type":           "vp_token",
		"response_mode":           "direct_post",
		"response_uri":            responseURI,
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
	// state is the second factor next to the session id in the path: a response
	// without it, or with another session's, is not this request's answer.
	if strings.TrimSpace(state) == "" || state != session.State {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "State does not match this presentation request")
	}
	if strings.TrimSpace(vpToken) == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Missing vp_token")
	}

	var settings models.Settings
	_ = h.Server.DB.First(&settings).Error
	if !identityMethodOffered(&settings, session.FlowRoute, models.IdentityMethodVC) {
		// Switched off between showing the QR code and the wallet answering.
		h.failSession(session, "Verifiable Credentials are no longer accepted on this onboarding flow")
		return responses.ErrorResponse(c, fiber.StatusForbidden, "Verifiable Credentials are no longer accepted on this onboarding flow")
	}

	policy := policyFromSettings(&settings)
	result, err := h.verifyPresentation(policy, []byte(vpToken), verification.Expectation{
		Nonce:    session.Nonce,
		Audience: session.Audience,
	})
	if err != nil {
		// The full error (which may name an internal resolver host) goes to the
		// log; the applicant gets a message they can act on.
		log.Printf("vc-onboarding: verification failed for session %s: %v", session.ID, err)
		safe := applicantSafeVerificationError(err)
		h.failSession(session, safe)
		return responses.ErrorResponse(c, fiber.StatusBadRequest, safe)
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
	if !identityMethodOffered(&settings, route, models.IdentityMethodVC) {
		return responses.ErrorResponse(c, fiber.StatusNotImplemented, "Verifiable Credentials are not accepted on this onboarding flow")
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
	// requested by this portal, so it can never be holder-bound (Result.HolderBound
	// stays false) and never qualifies for skipping admin review.
	result, err := h.verifyPresentation(policy, []byte(presentation), verification.Expectation{})
	if err != nil {
		log.Printf("vc-onboarding: direct verification failed for %q: %v", owner, err)
		return responses.ErrorResponse(c, fiber.StatusBadRequest, applicantSafeVerificationError(err))
	}

	id, err := randomToken()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, errRecordVerification)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, errRecordVerification)
	}
	now := time.Now()
	session := models.VcPresentationSession{
		ID:               id,
		FlowRoute:        route,
		KeycloakUsername: owner,
		Status:           models.VcSessionVerified,
		Result:           datatypes.JSON(encoded),
		CreatedAt:        now,
		ExpiresAt:        now.Add(vcSessionTTL),
		VerifiedAt:       &now,
	}
	if err := h.Server.DB.Create(&session).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, errRecordVerification)
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
		"clientId":           h.responseURI("{sessionId}"),
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
	// Skipping admin review on a presentation that is not bound to its holder
	// would let a replayed (public) credential set become an approved proposal,
	// so the two settings are only accepted together.
	autoAccept := strings.TrimSpace(settings.VcAutoAcceptVerified) == "true"
	if body.AutoAcceptVerified != nil {
		autoAccept = *body.AutoAcceptVerified
	}
	if autoAccept && !body.Policy.RequireHolderBinding {
		return responses.ErrorResponse(c, fiber.StatusBadRequest,
			"Skipping admin review requires holder binding: enable 'Require the wallet to sign the presentation' first")
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

// pruneInterval bounds how often the expired-session sweep runs; it used to run
// on every session creation, on the applicant's hot path.
const pruneInterval = 10 * time.Minute

// pruneExpiredSessions drops long-dead rows so the table cannot grow without
// bound. Sessions are short-lived, so a generous grace period is plenty. At most
// one sweep per pruneInterval per process.
func (h *HandlerVcOnboarding) pruneExpiredSessions() {
	h.pruneMu.Lock()
	if time.Since(h.lastPrune) < pruneInterval {
		h.pruneMu.Unlock()
		return
	}
	h.lastPrune = time.Now()
	h.pruneMu.Unlock()

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
				// `type` is an array; match its members (VC 2.0 top level and
				// the JWT-VC profile's nested vc), not the array as a string.
				"fields": []fiber.Map{{
					"path":   []string{"$.type[*]", "$.vc.type[*]"},
					"filter": fiber.Map{"type": "string", "const": accepted.Type},
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
	session, result, err := h.loadVerifiedPresentation(c, sessionID)
	if err != nil {
		return err
	}
	if result == nil {
		return nil
	}
	h.stampVerifiedPresentation(proposal, session, result)
	return nil
}

// loadVerifiedPresentation resolves a submitted session id to its verified
// result, or refuses it. A nil result with a nil error means no session was
// submitted. Runs BEFORE the proposal's identifiers are checked, so the party
// id and certificate the presentation proved are what the authorization match
// and the certificate/party-id alignment judge.
func (h *HandlerParty) loadVerifiedPresentation(c *fiber.Ctx, sessionID string) (*models.VcPresentationSession, *verification.Result, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil, nil, nil
	}

	var session models.VcPresentationSession
	if err := h.Server.DB.Where("id = ?", sessionID).First(&session).Error; err != nil {
		return nil, nil, fmt.Errorf("that credential verification is no longer available; please present your credentials again")
	}
	if !h.Config.OIDCDisable {
		owner := strings.TrimSpace(session.KeycloakUsername)
		if owner == "" || owner != currentUsername(c) {
			// Same message as "not found": never confirm someone else's session.
			return nil, nil, fmt.Errorf("that credential verification is no longer available; please present your credentials again")
		}
	}
	if session.Status != models.VcSessionVerified {
		return nil, nil, fmt.Errorf("that credential verification did not complete; please present your credentials again")
	}
	if session.ConsumedAt != nil {
		return nil, nil, fmt.Errorf("that credential verification has already been used for an application; please present your credentials again")
	}
	if session.VerifiedAt == nil || time.Since(*session.VerifiedAt) > verifiedSessionWindow {
		return nil, nil, fmt.Errorf("that credential verification has expired; please present your credentials again")
	}

	var result verification.Result
	if len(session.Result) == 0 || json.Unmarshal(session.Result, &result) != nil {
		return nil, nil, fmt.Errorf("that credential verification could not be read; please present your credentials again")
	}
	return &session, &result, nil
}

// applyVerifiedFieldsToProposalData writes the verified values over the
// submitted form BEFORE the identifier checks run, so alignment and the
// eHerkenning authorization match see the party the credential names.
func applyVerifiedFieldsToProposalData(data *ProposalData, fields map[string]string) {
	targets := map[string]*string{
		verification.FieldCompanyName:      &data.IDCheck.CompanyName,
		verification.FieldKvkNumber:        &data.IDCheck.KvkNumber,
		verification.FieldPartyID:          &data.IDCheck.PartyId,
		verification.FieldPartyName:        &data.IDCheck.PartyName,
		verification.FieldCertSubjectName:  &data.IDCheck.CertSubjectName,
		verification.FieldCertX5c:          &data.IDCheck.CertX5c,
		verification.FieldCertX5tS256:      &data.IDCheck.CertX5tS256,
		verification.FieldAddress:          &data.Location.Address,
		verification.FieldZipCode:          &data.Location.ZipCode,
		verification.FieldCity:             &data.Location.City,
		verification.FieldCountry:          &data.Location.Country,
		verification.FieldWebsite:          &data.Location.Website,
		verification.FieldAuthRegistry:     &data.Association.AuthRegistry,
		verification.FieldAuthRegistryName: &data.Association.AuthRegistryName,
		verification.FieldAuthRegistryURL:  &data.Association.AuthRegistryUrl,
		verification.FieldCapabilitiesURL:  &data.Association.CapabilitiesUrl,
		verification.FieldContactName:      &data.Account.Name,
		verification.FieldContactEmail:     &data.Account.Email,
		verification.FieldContactPhone:     &data.Account.Phone,
	}
	for field, value := range fields {
		if target, ok := targets[field]; ok && strings.TrimSpace(value) != "" {
			*target = value
		}
	}
	data.IDCheck.IdCheckMethod = "vc"
}

// stampVerifiedPresentation writes the verified fields and the evidence onto the
// proposal and applies the review policy.
func (h *HandlerParty) stampVerifiedPresentation(proposal *models.Proposal, session *models.VcPresentationSession, result *verification.Result) {
	applyVerifiedFields(proposal, result.Fields)

	proposal.VcVerified = true
	proposal.VcVerifiedAt = session.VerifiedAt
	proposal.VcHolder = result.Holder
	proposal.IdCheckMethod = "vc"
	proposal.VcCredentialTypes = strings.Join(credentialTypeNames(*result), ", ")
	proposal.VcIssuers = strings.Join(credentialIssuers(*result), ", ")
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
	// submitted status — and only for a presentation bound to its holder: an
	// unbound one may be a replay of credentials that are public.
	var settings models.Settings
	if h.Server.DB.First(&settings).Error == nil &&
		vcAutoAcceptForRoute(&settings, proposal.FlowRoute) &&
		proposal.Status == "pending" {
		if !result.HolderBound {
			log.Printf("vc-onboarding: proposal for %q keeps manual review: the presentation was not holder-bound (flow %q)",
				proposal.PartyId, proposal.FlowRoute)
		} else {
			proposal.Status = "approved"
			log.Printf("vc-onboarding: proposal for %q auto-approved from a holder-bound presentation (flow %q)",
				proposal.PartyId, proposal.FlowRoute)
		}
	}
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

// errPresentationConsumed is returned when a session was already used.
var errPresentationConsumed = errors.New("that credential verification has already been used for an application; please present your credentials again")

// consumePresentationSession ties a verification to the proposal being created,
// atomically: the conditional UPDATE claims the session and a second caller
// racing on the same id finds no row to claim. Run inside the transaction that
// inserts the proposal so a failed insert leaves the session unconsumed.
func consumePresentationSession(tx *gorm.DB, sessionID string) error {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil
	}
	res := tx.Model(&models.VcPresentationSession{}).
		Where("id = ? AND consumed_at IS NULL", sessionID).
		Update("consumed_at", time.Now())
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errPresentationConsumed
	}
	return nil
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
