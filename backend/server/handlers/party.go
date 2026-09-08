package handlers

import (
	"bytes"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"

	"onboardingportal/config"
	"onboardingportal/integrations/satellite"
	"onboardingportal/models"
	"onboardingportal/requests"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"onboardingportal/server/middlewares"
	"onboardingportal/utils"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type HandlerParty struct {
	Server *s.Server
	Config *config.Config
}

// CreateSatelliteOwnerAccessToken
func createSatelliteOwnerAccessToken(config *config.Config) (string, error) {
	iss := config.SatelliteIss
	aud := config.SatelliteAud
	x5c := config.SatelliteX5c
	privateKey := config.SatellitePrivateKey
	if strings.TrimSpace(privateKey) == "" {
		return "", fmt.Errorf("satellite private key is not configured")
	}

	return utils.CreateSatelliteOwnerAccessToken(iss, aud, x5c, privateKey)
}

func joinSatelliteURL(base, endpoint string) string {
	trimmedBase := strings.TrimRight(base, "/")
	if endpoint == "" {
		return trimmedBase
	}
	if strings.HasPrefix(endpoint, "/") {
		return trimmedBase + endpoint
	}
	return trimmedBase + "/" + endpoint
}

func (h *HandlerParty) userCanActForKvk(c *fiber.Ctx, kvk string) bool {
	claims := currentClaims(c)
	if claims == nil || strings.TrimSpace(kvk) == "" {
		return false
	}

	var org models.Organization
	if err := h.Server.DB.Where("kvk_number = ?", strings.TrimSpace(kvk)).First(&org).Error; err != nil {
		return false
	}

	var count int64
	h.Server.DB.Model(&models.OrganizationMember{}).
		Where("organization_id = ? AND status = ? AND (keycloak_subject = ? OR email = ? OR username = ?)",
			org.ID,
			"active",
			strings.TrimSpace(claims.Subject),
			strings.TrimSpace(claims.Email),
			strings.TrimSpace(claims.PreferredUsername),
		).
		Count(&count)

	return count > 0
}

func NewHandlerParty(server *s.Server, config *config.Config) *HandlerParty {
	return &HandlerParty{
		Server: server,
		Config: config,
	}
}

func (h *HandlerParty) buildSporSignedRequest(subject string, organizationIdentifier string) (string, error) {
	if h.Config.SporSignedRequestBase64 != "" {
		return h.Config.SporSignedRequestBase64, nil
	}
	iss := strings.TrimSpace(h.Config.RegistrarId)
	aud := strings.TrimSpace(h.Config.SatelliteAud)
	privateKey := strings.TrimSpace(h.Config.SatellitePrivateKey)
	if privateKey == "" {
		return "", fmt.Errorf("SPOR signed request is not configured")
	}
	if iss == "" {
		return "", fmt.Errorf("SPOR issuer is not configured (REGISTRAR_ID)")
	}
	if aud == "" {
		return "", fmt.Errorf("SPOR JWT aud is not configured")
	}
	return utils.CreateSporSignedRequestJWT(
		iss,
		aud,
		subject,
		organizationIdentifier,
		h.Config.SatelliteX5c,
		privateKey,
		300,
	)
}

// buildEpCreationEnvelope wraps an ep_creation party payload in the iSHARE spec
// envelope { "ep_creation_token": "<JWT>" }, signing the token with the
// registrar's key/cert. The party is carried under "epRequest" (v2.1.1/v2.2) or
// "parties_info" (v2.0.1) per the ep_creation flavor. Satellites now require this
// envelope rather than a raw party object.
func (h *HandlerParty) buildEpCreationEnvelope(payload interface{}, flavor epCreationFlavor) ([]byte, error) {
	partyClaimKey := "parties_info"
	if flavor.UseDidIdentifiers {
		partyClaimKey = "epRequest"
	}
	token, err := utils.CreateEpCreationToken(
		strings.TrimSpace(h.Config.RegistrarId),
		strings.TrimSpace(h.Config.SatelliteAud),
		h.Config.SatelliteX5c,
		strings.TrimSpace(h.Config.SatellitePrivateKey),
		partyClaimKey,
		payload,
		300,
	)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]string{"ep_creation_token": token})
}

// CreateParty godoc
// @Summary      Create party in Satellite
// @Description  Forwards the party creation request to the iSHARE Satellite.
// @Tags         parties
// @Accept       json
// @Produce      json
// @Param        payload  body      requests.PartyCreateRequest  true  "Party create payload"
// @Success      200      {object}  map[string]string
// @Failure      400      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /parties [post]
func (h *HandlerParty) CreateParty(c *fiber.Ctx) error {
	// The 2.x ep_creation dialect must not be used against a 3.x (claim-model)
	// satellite. On a v3 registry, party creation goes through the claim-based
	// register-new-party flow (POST /parties → CreateParties); reject here so no
	// path silently creates a v2 party against a v3 participant registry.
	if strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3") {
		return responses.ErrorResponse(c, fiber.StatusBadRequest,
			"A 3.x participant registry is connected; use POST /parties (claim-based register-new-party) instead of this 2.x endpoint.")
	}

	// Parse the request body
	request := requests.PartyCreateRequest{}

	// Detailed validation check for the request body
	decoder := json.NewDecoder(bytes.NewReader(c.Body()))
	decoder.DisallowUnknownFields()
	err := decoder.Decode(&request)
	if err != nil {
		var unmarshalTypeError *json.UnmarshalTypeError

		switch {
		case errors.As(err, &unmarshalTypeError):
			errMsg := fmt.Sprintf("Invalid type for field '%s'. Expected %s, got %s",
				unmarshalTypeError.Field, unmarshalTypeError.Type, unmarshalTypeError.Value)
			return responses.ErrorResponse(c, fiber.StatusBadRequest, errMsg)
		default:
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid create party request data: "+err.Error())
		}
	}

	flavor := epCreationFlavorFromVersion(h.Config.SatelliteVersion)
	normalizedPartyID := normalizePartyID(request.PartyId)
	if normalizedPartyID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "party_id is required")
	}
	request.PartyId = normalizedPartyID

	partyDID := strings.TrimSpace(request.ID)
	partyAliases := request.AlsoKnownAs
	derivedDID := satellite.BuildDidFromPartyID(normalizedPartyID)
	if flavor.UseDidIdentifiers {
		if partyDID == "" {
			partyDID = derivedDID
		} else if partyDID != derivedDID {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "id must match party_id")
		}
		if len(partyAliases) == 0 || strings.TrimSpace(partyAliases[0]) == "" {
			partyAliases = []string{satellite.BuildEoriAlias(normalizedPartyID)}
		}
	} else {
		partyDID = ""
		partyAliases = nil
	}

	sporIdentifier := normalizedPartyID
	if flavor.UseDidIdentifiers {
		sporIdentifier = partyDID
	}
	signedRequest := request.Spor.SignedRequest
	if signedRequest == "" {
		signedRequest, err = h.buildSporSignedRequest(sporIdentifier, sporIdentifier)
		if err != nil {
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, err.Error())
		}
		request.Spor.SignedRequest = signedRequest
	}

	if h.Config.SatelliteDebug {
		if signedRequest == "" {
			log.Printf("satellite: spor signed_request is empty")
		} else {
			log.Printf("satellite: spor signed_request length=%d", len(signedRequest))
		}
	}

	assertionToken, err := createSatelliteOwnerAccessToken(h.Server.Config)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create satellite owner access token.")
	}

	// Create a new HTTP client
	client := &http.Client{}

	accessToken, err := satellite.ExchangeForAccessToken(client, h.Server.Config, assertionToken)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, fmt.Sprintf("Failed to get satellite access token: %v", err))
	}

	var payload interface{}
	if flavor.UseDidIdentifiers {
		payload = satellite.BuildEpCreation211RequestFromRequest(&request, partyDID, partyAliases, signedRequest)
	} else {
		payload = satellite.BuildEpCreation201RequestFromRequest(&request, normalizedPartyID, signedRequest)
	}

	payloadBytes, err := h.buildEpCreationEnvelope(payload, flavor)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to build ep_creation envelope: "+err.Error())
	}

	req, err := http.NewRequest("POST", joinSatelliteURL(h.Config.SatelliteBaseUrl, h.Config.SatelliteEpCreationEndpoint), bytes.NewReader(payloadBytes))
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request to satellite.")
	}

	// Add the access token to the request headers
	req.Header.Add("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	// Send the request
	epRes, err := client.Do(req)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to send request to satellite.")
	}
	defer epRes.Body.Close()

	body, err := io.ReadAll(epRes.Body)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to read response body.")
	}
	if h.Config.SatelliteDebug {
		log.Printf("satellite: ep_creation status=%d body=%s", epRes.StatusCode, string(body))
	}

	// Parse the JSON response
	var responseData map[string]interface{}
	err = json.Unmarshal(body, &responseData)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to parse response body.")
	}
	fmt.Printf("Response: %v\n", responseData)
	// Check the response status
	if epRes.StatusCode != http.StatusOK {
		// try to extract a message, but guard against type issues
		msg, _ := responseData["message"].(string)
		if msg == "" {
			msg = fmt.Sprintf("remote error, status %d", epRes.StatusCode)
		}
		return responses.ErrorResponse(c, epRes.StatusCode, msg)
	}

	return responses.MessageResponse(c, fiber.StatusOK, "Your request is successfully accepted. Verification process started.")
}

// CreateParties godoc
// @Summary      Create a v3.0 claim-based party in the Satellite
// @Description  Forwards the iSHARE v3.0 claim-based `party` payload to the Satellite's `POST /parties` (register-new-party) endpoint.
// @Tags         parties
// @Accept       json
// @Produce      json
// @Param        payload  body      requests.PartyV3CreateRequest  true  "v3.0 party payload"
// @Success      200      {object}  map[string]string
// @Failure      400      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /parties [post]
func (h *HandlerParty) CreateParties(c *fiber.Ctx) error {
	// The claim model is a 3.x concept; guard against accidentally posting it to
	// a 2.x satellite that speaks the ep_creation dialect.
	if !strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3") {
		return responses.ErrorResponse(c, fiber.StatusBadRequest,
			"The /parties endpoint requires a 3.x satellite (set SATELLITE_VERSION).")
	}

	// Parse the claim-based party. Unknown top-level fields are tolerated and
	// unknown *claim* fields are required (the claim model is extensible), so we
	// deliberately do not use DisallowUnknownFields here.
	request := requests.PartyV3CreateRequest{}
	if err := json.Unmarshal(c.Body(), &request); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid create party request data: "+err.Error())
	}

	if strings.TrimSpace(request.Name) == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "name is required")
	}
	if len(request.Claims) == 0 {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "at least one claim is required")
	}

	// Normalize identity to a did:ishare id (+ EORI alias) the way the 2.1.1
	// flavor does, while leaving non-ishare DIDs (did:web, did:ebsi, …) intact.
	partyDID, eori := deriveV3Identity(request.ID)
	if partyDID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "id is required")
	}
	aliases := cleanAliases(request.AlsoKnownAs)
	if len(aliases) == 0 && eori != "" {
		aliases = []string{satellite.BuildEoriAlias(eori)}
	}

	// Enforce the framework's minimum-claims rule (spec: register-new-party).
	if err := validateMinimumClaims(&request); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, err.Error())
	}

	status, body, err := h.postV3Party(&request, partyDID, aliases)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}

	// The satellite returns 200 (spec) or 201 on success; the body is a signed
	// partyResponse JWT we don't need to surface to the portal user.
	if status != http.StatusOK && status != http.StatusCreated {
		msg := extractSatelliteError(body)
		if msg == "" {
			msg = fmt.Sprintf("remote error, status %d", status)
		}
		return responses.ErrorResponse(c, status, msg)
	}

	return responses.MessageResponse(c, fiber.StatusOK, "Your request is successfully accepted. Verification process started.")
}

// postPartyPayload obtains a satellite owner access token and POSTs a party
// payload to the satellite's parties endpoint.
// It returns the HTTP status and raw response body so callers can surface the
// satellite's own error message. Reused by both the admin create-party endpoint
// and the onboarding completion flow.
func (h *HandlerParty) postPartyPayload(payload interface{}) (int, []byte, error) {
	assertionToken, err := createSatelliteOwnerAccessToken(h.Server.Config)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to create satellite owner access token: %w", err)
	}

	client := &http.Client{}
	accessToken, err := satellite.ExchangeForAccessToken(client, h.Server.Config, assertionToken)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to get satellite access token: %w", err)
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to prepare request payload: %w", err)
	}

	partiesURL := joinSatelliteURL(h.Config.SatelliteBaseUrl, h.partiesEndpointForVersion())
	req, err := http.NewRequest("POST", partiesURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return 0, nil, fmt.Errorf("failed to create request to satellite: %w", err)
	}
	req.Header.Add("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	res, err := client.Do(req)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to send request to satellite: %w", err)
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read response body: %w", err)
	}
	if h.Config.SatelliteDebug {
		log.Printf("satellite: parties status=%d body=%s", res.StatusCode, string(body))
	}
	return res.StatusCode, body, nil
}

func (h *HandlerParty) postV3Party(request *requests.PartyV3CreateRequest, partyDID string, aliases []string) (int, []byte, error) {
	payload := satellite.BuildEpCreation30RequestFromRequest(request, partyDID, aliases, h.Config.RegistrarId)
	return h.postPartyPayload(payload)
}

func (h *HandlerParty) partiesEndpointForVersion() string {
	endpoint := strings.TrimSpace(h.Config.SatellitePartiesEndpoint)
	if isSatelliteVersion22(h.Config.SatelliteVersion) && (endpoint == "" || endpoint == "/parties") {
		return "/v2.2/parties"
	}
	// v3 claim-model satellites serve party creation under /v3.0/... — the
	// unversioned /parties path is legacy 2.x behaviour.
	if strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3") && (endpoint == "" || endpoint == "/parties") {
		return "/v3.0/parties"
	}
	if endpoint == "" {
		return "/parties"
	}
	return endpoint
}

func truncateForLog(b []byte) string {
	const max = 600
	if len(b) > max {
		return string(b[:max]) + "…"
	}
	return string(b)
}

// forwardPartyWrite proxies a write (PUT/PATCH) to the satellite's party/claim
// update endpoints. The request body is forwarded verbatim — the front-end
// builds the payload that matches the satellite's schema version — and the
// owner access token is attached. The satellite's response is passed back.
func (h *HandlerParty) forwardPartyWrite(c *fiber.Ctx, method, satellitePath string) error {
	return h.forwardPartyWriteBody(c, method, satellitePath, c.Body())
}

// normalizeClaimBody expands bare date-input values (yyyy-mm-dd) in a claim
// JSON body to the RFC3339 instants the satellite requires — the same rule
// party creation applies. Pass-through on parse failure: the satellite then
// produces the authoritative error.
func normalizeClaimBody(body []byte) []byte {
	claim := map[string]interface{}{}
	if err := json.Unmarshal(body, &claim); err != nil {
		return body
	}
	satellite.NormalizeClaimDates(claim)
	out, err := json.Marshal(claim)
	if err != nil {
		return body
	}
	return out
}

func (h *HandlerParty) forwardPartyWriteBody(c *fiber.Ctx, method, satellitePath string, body []byte) error {
	assertionToken, err := createSatelliteOwnerAccessToken(h.Server.Config)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create access token")
	}

	client := &http.Client{}
	accessToken, err := satellite.ExchangeForAccessToken(client, h.Server.Config, assertionToken)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to obtain satellite access token")
	}

	reqURL := joinSatelliteURL(h.Config.SatelliteBaseUrl, satellitePath)

	req, err := http.NewRequest(method, reqURL, bytes.NewReader(body))
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request")
	}
	req.Header.Add("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	if h.Config.SatelliteDebug {
		log.Printf("satellite: %s %s body=%s", method, reqURL, truncateForLog(body))
	}

	res, err := client.Do(req)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to reach satellite")
	}
	defer res.Body.Close()

	respBody, _ := io.ReadAll(res.Body)
	if h.Config.SatelliteDebug {
		log.Printf("satellite: %s %s -> %d body=%s", method, reqURL, res.StatusCode, truncateForLog(respBody))
	}

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		msg := extractSatelliteError(respBody)
		if msg == "" {
			msg = fmt.Sprintf("satellite update failed: status %d", res.StatusCode)
		}
		return responses.ErrorResponse(c, res.StatusCode, msg)
	}

	c.Set("Content-Type", "application/json")
	return c.Status(res.StatusCode).Send(respBody)
}

// UpdateParty godoc
// @Summary      Update a party (v2.2, full replace)
// @Description  Proxies to the Satellite's PUT /parties/{id} (iSHARE 2.2 party-update). The body must be a complete party_creation_request — the existing party is replaced.
// @Tags         registry
// @Accept       json
// @Produce      json
// @Param        id    path  string  true  "Party id / EORI"
// @Success      200   {object}  map[string]interface{}
// @Failure      400   {object}  map[string]string
// @Router       /parties/{id} [put]
func (h *HandlerParty) UpdateParty(c *fiber.Ctx) error {
	if !strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "2") {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Party PUT update requires a 2.x satellite")
	}
	id := strings.TrimSpace(c.Params("id"))
	if id == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "missing party id")
	}
	return h.forwardPartyWrite(c, http.MethodPut, "/parties/"+url.PathEscape(id))
}

// PatchParty godoc
// @Summary      Update party information (v3.0, partial)
// @Description  Proxies to the Satellite's PATCH /parties/{id} (iSHARE 3.0 update-party-information). Only the supplied fields are changed.
// @Tags         registry
// @Accept       json
// @Produce      json
// @Param        id    path  string  true  "Party id / EORI"
// @Success      200   {object}  map[string]interface{}
// @Failure      400   {object}  map[string]string
// @Router       /parties/{id} [patch]
func (h *HandlerParty) PatchParty(c *fiber.Ctx) error {
	if !strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3") {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Party PATCH update requires a 3.x satellite")
	}
	id := strings.TrimSpace(c.Params("id"))
	if id == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "missing party id")
	}
	return h.forwardPartyWrite(c, http.MethodPatch, h.Config.SatelliteV3Prefix()+"/parties/"+url.PathEscape(id))
}

// PatchClaim godoc
// @Summary      Update claim information (v3.0, partial)
// @Description  Proxies to the Satellite's PATCH /parties/{partyId}/claims/{claimId} (iSHARE 3.0 update-claim-information).
// @Tags         registry
// @Accept       json
// @Produce      json
// @Param        id       path  string  true  "Party id / EORI"
// @Param        claimId  path  string  true  "Claim id"
// @Success      200      {object}  map[string]interface{}
// @Failure      400      {object}  map[string]string
// @Router       /parties/{id}/claims/{claimId} [patch]
func (h *HandlerParty) PatchClaim(c *fiber.Ctx) error {
	if !strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3") {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Claim PATCH update requires a 3.x satellite")
	}
	id := strings.TrimSpace(c.Params("id"))
	claimId := strings.TrimSpace(c.Params("claimId"))
	if id == "" || claimId == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "missing party id or claim id")
	}
	return h.forwardPartyWriteBody(c, http.MethodPatch, h.Config.SatelliteV3Prefix()+"/parties/"+url.PathEscape(id)+"/claims/"+url.PathEscape(claimId), normalizeClaimBody(c.Body()))
}

// CreateClaim godoc
// @Summary      Add a claim to a party (v3.0)
// @Description  Proxies to the Satellite's POST /parties/{partyId}/claims (iSHARE 3.0 create-claim). Claims are append-only: a new x509Certificate claim registers an additional active certificate — the previous certificate claim keeps its own status until it expires or is explicitly revoked.
// @Tags         registry
// @Accept       json
// @Produce      json
// @Param        id    path  string  true  "Party id / EORI"
// @Success      201   {object}  map[string]interface{}
// @Failure      400   {object}  map[string]string
// @Router       /parties/{id}/claims [post]
func (h *HandlerParty) CreateClaim(c *fiber.Ctx) error {
	if !strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3") {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Claim create requires a 3.x satellite")
	}
	id := strings.TrimSpace(c.Params("id"))
	if id == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "missing party id")
	}
	return h.forwardPartyWriteBody(c, http.MethodPost, h.Config.SatelliteV3Prefix()+"/parties/"+url.PathEscape(id)+"/claims", normalizeClaimBody(c.Body()))
}

type ProposalData struct {
	Roles struct {
		DataOwner    bool `json:"dataOwner"`
		DataConsumer bool `json:"dataConsumer"`
		DataProvider bool `json:"dataProvider"`
	} `json:"roles"`
	M2M struct {
		UseM2M string `json:"useM2M"`
	} `json:"m2m"`
	IDCheck struct {
		CompanyName string `json:"companyName"`
		KvkNumber   string `json:"kvkNumber"`
		PartyId     string `json:"partyId"`
		PartyName   string `json:"partyName"`
		// eIDAS certificate fields captured at the identity-check step, used to
		// build the v3 x509Certificate identity claim at party creation.
		CertSubjectName string `json:"certSubjectName"`
		CertX5c         string `json:"certX5c"`
		CertX5tS256     string `json:"certX5tS256"`
	} `json:"idCheck"`
	Location struct {
		Address string `json:"address"`
		ZipCode string `json:"zipCode"`
		City    string `json:"city"`
		Country string `json:"country"`
		Website string `json:"website"`
	} `json:"location"`
	Association struct {
		AuthRegistry     string `json:"authRegistry"`
		CapabilitiesUrl  string `json:"capabilitiesUrl"`
		AuthRegistryName string `json:"authRegistryName"`
		AuthRegistryUrl  string `json:"authRegistryUrl"`
	} `json:"association"`
	Account struct {
		Name  string `json:"name"`
		Email string `json:"email"`
		Phone string `json:"phone"`
	} `json:"account"`
	KeycloakUsername string `json:"keycloakUsername"`
	Status           string `json:"status"`
	// FlowRoute is the public onboarding flow the applicant came through
	// ("" = base URL). Validated against the configured flows on receipt.
	FlowRoute string `json:"flowRoute"`
}

// kvkFromPartyID extracts the KVK number embedded in a party id of the form
// "EU.EORI.NL.KVK<digits>". Returns "" when the id is not KVK-based (e.g. an
// EORI or DID for a non-Dutch party).
func kvkFromPartyID(partyID string) string {
	idx := strings.Index(strings.ToUpper(partyID), "KVK")
	if idx < 0 {
		return ""
	}
	var b strings.Builder
	for _, r := range partyID[idx+3:] {
		if r >= '0' && r <= '9' {
			b.WriteByte(byte(r))
		} else if b.Len() > 0 {
			break
		}
	}
	return b.String()
}

// HandlePropose godoc
// @Summary      Submit onboarding proposal
// @Description  Accepts a multipart form with JSON data and optional CTT proof file to create a proposal.
// @Tags         proposals
// @Accept       mpfd
// @Produce      json
// @Param        data      formData  string  true  "Proposal JSON payload"
// @Param        cttProof  formData  file    false "CTT proof file"
// @Success      200       {object}  map[string]string
// @Failure      400       {object}  map[string]string
// @Failure      500       {object}  map[string]string
// @Router       /proposals/propose [post]
func (h *HandlerParty) HandlePropose(c *fiber.Ctx) error {
	// Get the form data
	form, err := c.MultipartForm()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Failed to parse form data")
	}

	// Parse the JSON data
	var proposalData ProposalData
	if jsonData := form.Value["data"]; len(jsonData) > 0 {
		if err := json.Unmarshal([]byte(jsonData[0]), &proposalData); err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Failed to parse JSON data")
		}
	}

	// The party identifier is the generic party id — KVK-based for NL eHerkenning
	// parties, but also EORI/DID/other registration numbers for non-Dutch parties.
	// Require that, not a KVK specifically.
	partyID := strings.TrimSpace(proposalData.IDCheck.PartyId)
	if partyID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Proposal is missing a party identifier")
	}
	// KVK is optional: derive it from the party id when KVK-based (for the
	// eHerkenning authorization match below and downstream display). May stay "".
	proposalKvk := strings.TrimSpace(proposalData.IDCheck.KvkNumber)
	if proposalKvk == "" {
		proposalKvk = kvkFromPartyID(partyID)
		proposalData.IDCheck.KvkNumber = proposalKvk
	}

	if !h.Config.OIDCDisable {
		tokenIdentifier := ""
		if rawClaims := c.Locals("claims"); rawClaims != nil {
			if kc, ok := rawClaims.(*middlewares.KeycloakClaims); ok {
				if h.Config.SatelliteDebug {
					log.Printf("auth: claims summary kvk=%q legalSubjectId=%q preferredUsername=%q", kc.KvkNumber, kc.LegalSubjectID, kc.PreferredUsername)
				}
				tokenIdentifier = strings.TrimSpace(kc.LegalEntityIdentifier())
			} else if h.Config.SatelliteDebug {
				log.Printf("auth: unexpected claims type %T", rawClaims)
			}
		} else if h.Config.SatelliteDebug {
			log.Printf("auth: request context missing claims")
		}
		// When the session asserts an organization identity (e.g. eHerkenning's
		// legalSubjectId), it must match the party being onboarded — its KVK or as
		// embedded in the party id — or the user must be delegated. When the session
		// carries NO organization identity (e.g. an eIDAS-certificate login),
		// submission is allowed: authorization is then established by the uploaded
		// certificate, admin verification and the satellite's claim validation at
		// completion, so a non-KVK / non-eHerkenning party is not blocked here.
		if tokenIdentifier != "" {
			matchesParty := tokenIdentifier == proposalKvk ||
				strings.Contains(partyID, tokenIdentifier)
			if !matchesParty && !h.userCanActForKvk(c, proposalKvk) {
				return responses.ErrorResponse(c, fiber.StatusForbidden, "Authenticated user cannot submit proposals for this party")
			}
		}
	}

	// Handle the CTT Proof file
	var cttProofFilePath string
	if files := form.File["cttProof"]; len(files) > 0 {
		cttProofFile := files[0]
		timestamp := time.Now().Format("20060102150405") // YYYYMMDDhhmmss format
		// persist under /app/uploads (WORKDIR=/app); docker volume should bind-mount this dir
		uploadDir := "./uploads"
		if err := os.MkdirAll(uploadDir, 0o755); err != nil {
			log.Printf("Failed to ensure uploads dir: %v", err)
		}
		// Random suffix so two proofs uploaded in the same second don't collide
		// (one would otherwise silently overwrite the other).
		cttProofFilePath = fmt.Sprintf("%s/ctt_%s_%s", uploadDir, timestamp, newAgreementID())
		err := c.SaveFile(cttProofFile, cttProofFilePath)
		if err != nil {
			log.Printf("Failed to save CTT proof file: %v", err)
		}
	}

	// The proposal owner is the authenticated user, never a client-supplied
	// value: it gates who may later read/sign/complete the proposal (see
	// callerMayActOnProposal). Fall back to the submitted value only when OIDC is
	// disabled (local/dev), where there are no claims.
	ownerUsername := strings.TrimSpace(proposalData.KeycloakUsername)
	if !h.Config.OIDCDisable {
		if kc := currentClaims(c); kc != nil && strings.TrimSpace(kc.PreferredUsername) != "" {
			ownerUsername = strings.TrimSpace(kc.PreferredUsername)
		}
	}

	// Save proposal to database
	proposal := models.Proposal{
		FlowRoute:        sanitizeFlowRoute(h, proposalData.FlowRoute),
		CompanyName:      proposalData.IDCheck.CompanyName,
		KvkNumber:        proposalData.IDCheck.KvkNumber,
		PartyId:          proposalData.IDCheck.PartyId,
		PartyName:        proposalData.IDCheck.PartyName,
		DataOwner:        proposalData.Roles.DataOwner,
		DataConsumer:     proposalData.Roles.DataConsumer,
		DataProvider:     proposalData.Roles.DataProvider,
		UseM2M:           proposalData.M2M.UseM2M,
		Address:          proposalData.Location.Address,
		ZipCode:          proposalData.Location.ZipCode,
		City:             proposalData.Location.City,
		Country:          proposalData.Location.Country,
		Website:          proposalData.Location.Website,
		AuthRegistry:     proposalData.Association.AuthRegistry,
		CapabilitiesUrl:  proposalData.Association.CapabilitiesUrl,
		AuthRegistryName: proposalData.Association.AuthRegistryName,
		AuthRegistryUrl:  proposalData.Association.AuthRegistryUrl,
		CttProofPath:     cttProofFilePath,
		ContactName:      proposalData.Account.Name,
		ContactEmail:     proposalData.Account.Email,
		ContactPhone:     proposalData.Account.Phone,
		Status: func() string {
			if proposalData.Status == "signed" {
				return "signed"
			}
			return "pending"
		}(),
		CreatedAt:        time.Now(),
		KeycloakUsername: ownerUsername,
		CertSubjectName:  proposalData.IDCheck.CertSubjectName,
		CertX5c:          proposalData.IDCheck.CertX5c,
		CertX5tS256:      proposalData.IDCheck.CertX5tS256,
	}

	result := h.Server.DB.Create(&proposal)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save proposal to database: "+result.Error.Error())
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message": "Your proposal has been successfully saved.",
		"id":      proposal.ID,
		"status":  proposal.Status,
	})
}

// GetProposals godoc
// @Summary      List proposals
// @Description  Returns all proposals.
// @Tags         proposals
// @Produce      json
// @Success      200  {array}   models.Proposal
// @Failure      500  {object}  map[string]string
// @Router       /proposals [get]
func (h *HandlerParty) GetProposals(c *fiber.Ctx) error {
	var proposals []models.Proposal
	result := h.Server.DB.Find(&proposals)
	if result.Error != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch proposals",
		})
	}

	return c.JSON(proposals)
}

// GetProposalByID godoc
// @Summary      Get proposal by ID
// @Tags         proposals
// @Produce      json
// @Param        id   path      int  true  "Proposal ID"
// @Success      200  {object}  models.Proposal
// @Failure      404  {object}  map[string]string
// @Router       /proposals/{id} [get]
// isSatelliteAdmin reports whether the authenticated session holds the
// SatelliteAdmin frontend client role (or higher, e.g. SchemeOwner) — the same
// operator role RequireAdminRole enforces on the admin-only routes.
func isSatelliteAdmin(claims *middlewares.KeycloakClaims) bool {
	return middlewares.HasRoleAtLeast(claims, middlewares.RoleSatelliteAdmin)
}

// callerMayActOnProposal authorises access to a single proposal: the session
// must either own it (its preferred_username equals the proposal's
// keycloak_username) or hold the onboarding-admin role. The /party/proposals/*
// routes are keyed by a path parameter rather than the caller's identity, so
// without this check one authenticated applicant could read or mutate another
// applicant's proposal. When OIDC is disabled (local/dev) there are no claims,
// so the check is skipped — consistent with the rest of the handlers.
func (h *HandlerParty) callerMayActOnProposal(c *fiber.Ctx, proposal *models.Proposal) bool {
	if h.Config.OIDCDisable {
		return true
	}
	claims := currentClaims(c)
	if claims == nil {
		return false
	}
	if isSatelliteAdmin(claims) {
		return true
	}
	owner := strings.TrimSpace(proposal.KeycloakUsername)
	return owner != "" && strings.EqualFold(strings.TrimSpace(claims.PreferredUsername), owner)
}

func (h *HandlerParty) GetProposalByID(c *fiber.Ctx) error {
	id := c.Params("id")

	var proposal models.Proposal
	result := h.Server.DB.First(&proposal, id)
	if result.Error != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Proposal not found",
		})
	}

	// Only the proposal owner or an onboarding admin may read it. Return 404
	// (not 403) on denial so sequential proposal IDs can't be enumerated.
	if !h.callerMayActOnProposal(c, &proposal) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Proposal not found",
		})
	}

	return c.JSON(proposal)
}

// GetProposalByKeycloakUsername godoc
// @Summary      Get proposal by Keycloak username
// @Tags         proposals
// @Produce      json
// @Param        keycloakUsername   path  string  true  "Keycloak username"
// @Success      200  {object}  models.Proposal
// @Failure      404  {object}  map[string]string
// @Router       /proposals/keycloak/{keycloakUsername} [get]
func (h *HandlerParty) GetProposalByKeycloakUsername(c *fiber.Ctx) error {
	keycloakUsernameParam := c.Params("keycloakUsername")
	keycloakUsername, err := url.PathUnescape(keycloakUsernameParam)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid keycloak username")
	}

	var proposal models.Proposal
	result := h.Server.DB.Where("keycloak_username = ?", keycloakUsername).First(&proposal)
	if result.Error != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Proposal not found",
		})
	}

	// Only the proposal owner or an onboarding admin may read it.
	if !h.callerMayActOnProposal(c, &proposal) {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "Proposal not found",
		})
	}

	return c.JSON(proposal)
}

// ApproveProposal godoc
// @Summary      Approve a proposal
// @Tags         proposals
// @Produce      json
// @Param        id   path      int  true  "Proposal ID"
// @Success      200  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /proposals/{id}/approve [post]
func (h *HandlerParty) ApproveProposal(c *fiber.Ctx) error {
	id := c.Params("id")

	// Find the proposal
	var proposal models.Proposal
	result := h.Server.DB.First(&proposal, id)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Proposal not found")
	}

	// Update the status to approved
	proposal.Status = "approved"

	// Save the changes
	result = h.Server.DB.Save(&proposal)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to approve proposal")
	}

	// TODO: Here you could add additional logic like:
	// - Sending notifications
	// - Creating the party in the satellite system
	// - Updating other related records

	return responses.MessageResponse(c, fiber.StatusOK, "Proposal successfully approved")
}

// RejectProposal godoc
// @Summary      Reject a proposal
// @Tags         proposals
// @Produce      json
// @Param        id   path      int  true  "Proposal ID"
// @Success      200  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /proposals/{id}/reject [post]
func (h *HandlerParty) RejectProposal(c *fiber.Ctx) error {
	id := c.Params("id")

	// Find the proposal
	var proposal models.Proposal
	result := h.Server.DB.First(&proposal, id)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Proposal not found")
	}

	// Update the status to rejected
	proposal.Status = "rejected"

	// Save the changes
	result = h.Server.DB.Save(&proposal)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to reject proposal")
	}

	return responses.MessageResponse(c, fiber.StatusOK, "Proposal successfully rejected")
}

// SignProposal godoc
// @Summary      Upload signed agreements for a proposal
// @Description  Requires at least two files (signedAgreement1, signedAgreement2...) in multipart form.
// @Tags         proposals
// @Accept       mpfd
// @Produce      json
// @Param        keycloakUsername  path      string  true   "Keycloak username"
// @Param        signedAgreement1  formData  file    true   "Signed agreement #1"
// @Param        signedAgreement2  formData  file    true   "Signed agreement #2"
// @Success      200               {object}  map[string]string
// @Failure      400               {object}  map[string]string
// @Failure      404               {object}  map[string]string
// @Failure      500               {object}  map[string]string
// @Router       /proposals/sign/{keycloakUsername} [post]
// firstFormValue returns the first value submitted for a multipart form field,
// or an empty string when the field is absent.
func firstFormValue(form *multipart.Form, key string) string {
	if form == nil {
		return ""
	}
	if vals, ok := form.Value[key]; ok && len(vals) > 0 {
		return vals[0]
	}
	return ""
}

func (h *HandlerParty) SignProposal(c *fiber.Ctx) error {
	keycloakUsernameParam := c.Params("keycloakUsername")
	keycloakUsername, err := url.PathUnescape(keycloakUsernameParam)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid keycloak username")
	}

	// Get existing proposal
	var proposal models.Proposal
	result := h.Server.DB.Where("keycloak_username = ?", keycloakUsername).First(&proposal)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Proposal not found")
	}

	// Only the proposal owner or an onboarding admin may sign it. Without this,
	// any authenticated user could upload signed agreements to — or consent-sign
	// via eHerkenning — another applicant's proposal.
	if !h.callerMayActOnProposal(c, &proposal) {
		return responses.ErrorResponse(c, fiber.StatusForbidden, "You are not allowed to sign this proposal")
	}

	// Parse the multipart form (fields and optional file uploads).
	form, err := c.MultipartForm()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Error processing files")
	}

	// Determine the chosen signing method. eHerkenning is consent-based and
	// uploads no documents; manual signing uploads the signed PDFs.
	signingMethod := strings.ToLower(strings.TrimSpace(firstFormValue(form, "signingMethod")))

	if signingMethod == "eherkenning" {
		// The authenticated eHerkenning identity combined with explicit consent
		// constitutes the signature, so no files are expected here.
		consent := strings.ToLower(strings.TrimSpace(firstFormValue(form, "eherkenningConsent")))
		if consent != "true" {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "eHerkenning signing requires explicit consent")
		}

		// Verify server-side that the caller genuinely authenticated through the
		// eHerkenning identity provider, so a forged request cannot sign on their
		// behalf. Skipped only when OIDC is disabled (local/dev) and no claims exist.
		if !h.Config.OIDCDisable {
			claims := currentClaims(c)
			if claims == nil {
				return responses.ErrorResponse(c, fiber.StatusUnauthorized, "Missing authentication claims")
			}
			expectedIdp := strings.TrimSpace(h.Config.KeycloakIdp)
			if expectedIdp == "" {
				// Mirror the frontend's default alias when none is configured.
				expectedIdp = "eHerkenning"
			}
			if !strings.EqualFold(strings.TrimSpace(claims.Idp), expectedIdp) {
				return responses.ErrorResponse(c, fiber.StatusForbidden, "Session was not authenticated via eHerkenning")
			}
		}

		// Capture the eHerkenning identity assertion for the v3 idpAssertion claim.
		// Prefer an explicit form value, but fall back to the request's bearer token
		// (the eHerkenning-brokered session this endpoint authenticated), so capture
		// does not depend on the client sending it explicitly.
		assertion := firstFormValue(form, "idpAssertion")
		if assertion == "" {
			authz := c.Get("Authorization")
			if len(authz) > 7 && strings.EqualFold(authz[:7], "Bearer ") {
				assertion = strings.TrimSpace(authz[7:])
			}
		}
		if assertion != "" {
			proposal.IdpAssertion = assertion
		}
		proposal.SignedAgreementPaths = nil
		proposal.SignedVia = "eherkenning"
		proposal.Status = "signed"

		if err := h.Server.DB.Save(&proposal).Error; err != nil {
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to update proposal")
		}

		return responses.MessageResponse(c, fiber.StatusOK, "Agreements signed successfully")
	}

	// Count the number of signedAgreement files
	var files []*multipart.FileHeader
	for i := 1; ; i++ {
		key := fmt.Sprintf("signedAgreement%d", i)
		if f := form.File[key]; len(f) > 0 {
			files = append(files, f[0])
		} else {
			break
		}
	}

	if len(files) < 2 {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "At least 2 signed agreements are required")
	}

	// Validate every upload really is a PDF (magic bytes), not just a .pdf-named
	// file, before storing any. A signed agreement is later downloaded by an admin,
	// so a non-PDF (HTML/script or malware) masquerading as one must be rejected.
	for _, file := range files {
		if !uploadedFileIsPDF(file) {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Each signed agreement must be a valid PDF")
		}
	}

	var filePaths []string
	// Ensure uploads directory exists (WORKDIR=/app ⇒ ./uploads == /app/uploads)
	uploadDir := "./uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Printf("Failed to ensure uploads dir: %v", err)
	}
	for i, file := range files {
		// Unique, non-guessable filename. A second-granularity timestamp alone
		// collides when two applicants sign within the same second — one file would
		// silently overwrite the other (cross-applicant data mix-up) — so include a
		// random id.
		storedPath := fmt.Sprintf("%s/%s_%d_%s.pdf", uploadDir, time.Now().Format("20060102150405"), i, newAgreementID())

		if err := c.SaveFile(file, storedPath); err != nil {
			// Clean up any files already saved
			for _, path := range filePaths {
				os.Remove(path)
			}
			log.Printf("Error saving agreement file: %s", err)
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save file")
		}
		filePaths = append(filePaths, storedPath)
	}

	// Update proposal with file paths
	proposal.SignedAgreementPaths = filePaths
	proposal.SignedVia = "manual"
	proposal.Status = "signed"

	if err := h.Server.DB.Save(&proposal).Error; err != nil {
		// Clean up saved files on database error
		for _, path := range filePaths {
			os.Remove(path)
		}
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to update proposal")
	}

	return responses.MessageResponse(c, fiber.StatusOK, "Agreements signed successfully")
}

// buildEherkenningConsentRecord renders a human-readable record of a consent-based
// eHerkenning signature. It is used as the agreement artifact (hashed and attached
// to each agreement template) when a proposal was signed via eHerkenning rather
// than by uploading signed PDFs.
func buildEherkenningConsentRecord(p *models.Proposal) []byte {
	var b strings.Builder
	b.WriteString("iSHARE onboarding — electronic signature via eHerkenning\n")
	b.WriteString("=========================================================\n\n")
	b.WriteString("The iSHARE agreements listed below were read, accepted and signed\n")
	b.WriteString("electronically using a verified eHerkenning identity. The signer confirmed\n")
	b.WriteString("that this action qualifies as a signature.\n\n")
	fmt.Fprintf(&b, "Party ID:     %s\n", p.PartyId)
	fmt.Fprintf(&b, "Party name:   %s\n", p.PartyName)
	fmt.Fprintf(&b, "Company name: %s\n", p.CompanyName)
	fmt.Fprintf(&b, "KVK number:   %s\n", p.KvkNumber)
	fmt.Fprintf(&b, "Contact:      %s <%s>\n", p.ContactName, p.ContactEmail)
	b.WriteString("Signed via:   eHerkenning\n")
	b.WriteString("\nAgreements accepted:\n")
	b.WriteString("  - Terms of Use (ToU-iSHARE)\n")
	b.WriteString("  - Accession Agreement (iSHARE-AA)\n")
	return []byte(b.String())
}

// CompleteProposal godoc
// @Summary      Complete a signed proposal
// @Tags         proposals
// @Produce      json
// @Param        id   path      int  true  "Proposal ID"
// @Success      200  {object}  map[string]string
// @Failure      400  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /proposals/{id}/complete [post]
// grantOnboardingPartyAdmin makes the applicant the PartyAdmin of the party they
// just onboarded (U2 role model): it assigns the PartyAdmin frontend client role
// and records their party id as a KC user attribute (surfaced as the partyId claim
// PR-MW scopes on). Best-effort: the party is already created by this point, so a
// failure is logged and never blocks completion. No-op under OIDC-disabled (dev).
func (h *HandlerParty) grantOnboardingPartyAdmin(proposal *models.Proposal) {
	if h.Config.OIDCDisable {
		return
	}
	username := strings.TrimSpace(proposal.KeycloakUsername)
	partyID := strings.TrimSpace(proposal.PartyId)
	if username == "" || partyID == "" {
		return
	}
	hk := &HandlerKeycloak{Server: h.Server, Config: h.Config}
	admin, err := hk.admin()
	if err != nil {
		log.Printf("onboarding: keycloak admin unavailable, not granting PartyAdmin to %q: %v", username, err)
		return
	}
	userID, err := hk.findUserIDByUsername(admin, username)
	if err != nil || userID == "" {
		log.Printf("onboarding: could not resolve keycloak user %q to grant PartyAdmin: %v", username, err)
		return
	}
	if err := hk.assignClientRole(admin, userID, middlewares.RolePartyAdmin); err != nil {
		log.Printf("onboarding: could not assign PartyAdmin to %q (party %q): %v", username, partyID, err)
	}
	if err := hk.setUserPartyID(admin, userID, partyID); err != nil {
		log.Printf("onboarding: could not set partyId=%q on %q: %v", partyID, username, err)
	}
}

func (h *HandlerParty) CompleteProposal(c *fiber.Ctx) error {
	id := c.Params("id")

	// Find the proposal
	var proposal models.Proposal
	result := h.Server.DB.First(&proposal, id)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Proposal not found")
	}

	// Only the proposal owner or an onboarding admin may complete it and trigger
	// party creation in the satellite.
	if !h.callerMayActOnProposal(c, &proposal) {
		return responses.ErrorResponse(c, fiber.StatusForbidden, "You are not allowed to complete this proposal")
	}

	// Verify that the proposal is in the correct state (should be signed)
	if proposal.Status != "signed" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Proposal must be signed before completion")
	}

	// TODO: Here you could add additional logic like:
	// - Sending notifications
	// - Creating the party in the satellite system
	// - Updating other related records

	assertionToken, err := createSatelliteOwnerAccessToken(h.Server.Config)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create satellite owner access token.")
	}

	// Get settings from database
	var settings models.Settings
	settingsResult := h.Server.DB.First(&settings)

	// Determine registrarId - use settings if available, fallback to env var
	registrarId := h.Config.RegistrarId
	if settingsResult.Error == nil && settings.RegistrarId != "" {
		registrarId = settings.RegistrarId
	}

	dataspaceId := h.Config.DataspaceId
	dataspaceTitle := h.Config.DataspaceTitle
	if settingsResult.Error == nil && settings.DataspaceId != "" {
		dataspaceId = settings.DataspaceId
	}
	// A proposal that came through a configured onboarding flow with its own
	// dataspace joins THAT dataspace instead of the deployment default.
	if settingsResult.Error == nil && proposal.FlowRoute != "" {
		for _, f := range decodeFlows(settings.OnboardingFlows) {
			if f.Route == proposal.FlowRoute && f.DataspaceId != "" {
				dataspaceId = f.DataspaceId
				break
			}
		}
	}

	// Preflight: the satellite rejects ep_creation when registrar_id does not equal
	// the owner-token issuer. An empty registrar_id is a configuration gap, so fail
	// fast here with a clear, actionable message rather than letting the satellite
	// reject it opaquely. The satellite's own message is surfaced for anything else
	// (see the response handling below).
	if strings.TrimSpace(registrarId) == "" {
		return responses.ErrorResponse(c, fiber.StatusUnprocessableEntity,
			"Cannot complete onboarding: Registrar ID is not configured. Set it in Settings → General, or via the REGISTRAR_ID environment variable (it must match SATELLITE_ISS).")
	}

	// v3.0 (claim-model) satellites use the claim-based register-new-party
	// (/parties) endpoint instead of the 2.x ep_creation dialect.
	if strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3") {
		return h.completeProposalV3(c, &proposal, registrarId)
	}
	if isSatelliteVersion22(h.Config.SatelliteVersion) {
		return h.completeProposalV22(c, &proposal, registrarId)
	}

	flavor := epCreationFlavorFromVersion(h.Config.SatelliteVersion)

	agreementTemplates := []satellite.AgreementTemplate{
		{Type: "TermsOfUse", Title: "ToU-iSHARE"},
		{Type: "AccessionAgreement", Title: "iSHARE-AA"},
	}

	// Build the agreement payload for the satellite. Manual signing hashes the
	// uploaded PDFs; eHerkenning signing is consent-based (no documents), so we
	// synthesise a consent record and attach it to every agreement template.
	var agreementFiles []satellite.AgreementFile
	if proposal.SignedVia == "eherkenning" {
		record := buildEherkenningConsentRecord(&proposal)
		hash := md5.Sum(record)
		consent := satellite.AgreementFile{
			Hash:       fmt.Sprintf("%x", hash),
			FileBase64: base64.StdEncoding.EncodeToString(record),
		}
		for range agreementTemplates {
			agreementFiles = append(agreementFiles, consent)
		}
	} else {
		if len(proposal.SignedAgreementPaths) == 0 {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Signed agreements are required to complete proposal")
		}
		// Read and hash the uploaded agreement files.
		for _, path := range proposal.SignedAgreementPaths {
			fileContent, err := os.ReadFile(path)
			if err != nil {
				return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to read agreement file")
			}
			hash := md5.Sum(fileContent)
			agreementFiles = append(agreementFiles, satellite.AgreementFile{
				Hash:       fmt.Sprintf("%x", hash),
				FileBase64: base64.StdEncoding.EncodeToString(fileContent),
			})
		}
	}

	startDate := time.Now().Format("2006-01-02T15:04:05.000Z")
	endDate := time.Now().AddDate(1, 0, 0).Format("2006-01-02T15:04:05.000Z")

	normalizedPartyID := normalizePartyID(proposal.PartyId)
	if normalizedPartyID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "party_id is required")
	}
	partyDID := satellite.BuildDidFromPartyID(normalizedPartyID)
	aliases := []string{satellite.BuildEoriAlias(normalizedPartyID)}
	sporIdentifier := normalizedPartyID
	if flavor.UseDidIdentifiers {
		sporIdentifier = partyDID
	}
	signedRequest, err := h.buildSporSignedRequest(sporIdentifier, sporIdentifier)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, err.Error())
	}

	authRegistryURL := proposal.AuthRegistryUrl

	var payload interface{}
	if flavor.UseDidIdentifiers {
		agreements := satellite.BuildAgreements211FromFiles(agreementFiles, agreementTemplates, dataspaceId, dataspaceTitle, startDate, endDate)
		payload = satellite.BuildEpCreation211RequestFromProposal(&proposal, partyDID, aliases, signedRequest, registrarId, authRegistryURL, dataspaceId, dataspaceTitle, agreements, startDate, endDate)
	} else {
		agreements := satellite.BuildAgreements201FromFiles(agreementFiles, agreementTemplates, dataspaceId, dataspaceTitle, startDate, endDate)
		payload = satellite.BuildEpCreation201RequestFromProposal(&proposal, normalizedPartyID, signedRequest, registrarId, authRegistryURL, dataspaceId, dataspaceTitle, agreements, startDate, endDate)
	}

	if h.Config.SatelliteDebug {
		if dump, err := json.MarshalIndent(payload, "", "  "); err == nil {
			log.Printf("satellite: completeProposal payload %s", string(dump))
		} else {
			log.Printf("satellite: payload marshal error: %v", err)
		}
	}

	// Convert the payload to JSON
	jsonBody, err := h.buildEpCreationEnvelope(payload, flavor)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to build ep_creation envelope: "+err.Error())
	}

	// Create a new HTTP client
	client := &http.Client{}

	accessToken, err := satellite.ExchangeForAccessToken(client, h.Server.Config, assertionToken)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, fmt.Sprintf("Failed to get satellite access token: %v", err))
	}

	req, err := http.NewRequest("POST", joinSatelliteURL(h.Config.SatelliteBaseUrl, h.Config.SatelliteEpCreationEndpoint), bytes.NewBuffer(jsonBody))
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request to satellite.")
	}

	// Create request with bytes.Buffer containing JSON data
	// req, err := http.NewRequest("POST", h.Config.SatelliteBaseUrl+"/ep_creation", bytes.NewBuffer(jsonBody))
	// if err != nil {
	// 	return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request to satellite.")
	// }

	// Add the access token to the request headers
	req.Header.Add("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	// Send the request
	res, err := client.Do(req)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to send request to satellite.")
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to read response body.")
	}
	if h.Config.SatelliteDebug {
		log.Printf("satellite: ep_creation status=%d body=%s", res.StatusCode, string(body))
	}

	// Parse the JSON response
	// var responseData map[string]interface{}
	// err = json.Unmarshal(body, &responseData)
	// if err != nil {
	// 	return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to parse response body.")
	// }

	// Check the response status
	if res.StatusCode != http.StatusOK {
		// Surface the satellite's own error message so failures are diagnosable
		// instead of an opaque "unprocessable". PR-MW returns {"message": "..."}
		// (ep_creation) or {"error_msg": "..."}; fall back to the raw body.
		detail := strings.TrimSpace(string(body))
		var parsed struct {
			Message  string `json:"message"`
			ErrorMsg string `json:"error_msg"`
		}
		if json.Unmarshal(body, &parsed) == nil {
			if parsed.Message != "" {
				detail = parsed.Message
			} else if parsed.ErrorMsg != "" {
				detail = parsed.ErrorMsg
			}
		}
		if detail == "" {
			detail = "Satellite rejected the party registration"
		}
		log.Printf("satellite: ep_creation rejected status=%d detail=%s", res.StatusCode, detail)
		return responses.ErrorResponse(c, res.StatusCode, detail)
	}

	// Update the status to completed. Persist the canonical identifier used by
	// the satellite so follow-up flows (credential issuer polling, webhooks) use
	// the same party id as the registry.
	if flavor.UseDidIdentifiers {
		proposal.PartyId = partyDID
	} else {
		proposal.PartyId = normalizedPartyID
	}
	proposal.Status = "completed"
	// U2: onboarding a party makes the applicant its PartyAdmin (best-effort).
	h.grantOnboardingPartyAdmin(&proposal)

	// Save the changes
	result = h.Server.DB.Save(&proposal)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to complete proposal")
	}

	return responses.MessageResponse(c, fiber.StatusOK, "Proposal successfully completed")
}

func (h *HandlerParty) completeProposalV22(c *fiber.Ctx, proposal *models.Proposal, registrarId string) error {
	normalizedPartyID := normalizePartyID(proposal.PartyId)
	if normalizedPartyID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "party_id is required")
	}
	partyDID := satellite.BuildDidFromPartyID(normalizedPartyID)
	aliases := []string{satellite.BuildEoriAlias(normalizedPartyID)}

	startDate := time.Now().Format("2006-01-02T15:04:05.000Z")
	endDate := time.Now().AddDate(1, 0, 0).Format("2006-01-02T15:04:05.000Z")

	agreementTemplates := []satellite.AgreementTemplate{
		{Type: "TermsOfUse", Title: "ToU-iSHARE"},
		{Type: "AccessionAgreement", Title: "iSHARE-AA"},
	}

	var agreementFiles []satellite.AgreementFile
	if proposal.SignedVia == "eherkenning" {
		record := buildEherkenningConsentRecord(proposal)
		hash := md5.Sum(record)
		consent := satellite.AgreementFile{
			Hash:       fmt.Sprintf("%x", hash),
			FileBase64: base64.StdEncoding.EncodeToString(record),
		}
		for range agreementTemplates {
			agreementFiles = append(agreementFiles, consent)
		}
	} else {
		if len(proposal.SignedAgreementPaths) == 0 {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Signed agreements are required to complete proposal")
		}
		for _, path := range proposal.SignedAgreementPaths {
			fileContent, err := os.ReadFile(path)
			if err != nil {
				return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to read agreement file")
			}
			hash := md5.Sum(fileContent)
			agreementFiles = append(agreementFiles, satellite.AgreementFile{
				Hash:       fmt.Sprintf("%x", hash),
				FileBase64: base64.StdEncoding.EncodeToString(fileContent),
			})
		}
	}

	var settings models.Settings
	settingsResult := h.Server.DB.First(&settings)
	dataspaceId := h.Config.DataspaceId
	dataspaceTitle := h.Config.DataspaceTitle
	if settingsResult.Error == nil {
		if strings.TrimSpace(settings.DataspaceId) != "" {
			dataspaceId = settings.DataspaceId
		}
		if strings.TrimSpace(settings.DataspaceTitle) != "" {
			dataspaceTitle = settings.DataspaceTitle
		}
	}

	authRegistryURL := proposal.AuthRegistryUrl

	agreements := satellite.BuildAgreements22FromFiles(agreementFiles, agreementTemplates, dataspaceId, dataspaceTitle, startDate, endDate)
	payload, err := satellite.BuildParty22RequestFromProposal(proposal, partyDID, aliases, registrarId, authRegistryURL, dataspaceId, dataspaceTitle, agreements, startDate, endDate)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusUnprocessableEntity, "Cannot complete onboarding: "+err.Error())
	}

	status, body, err := h.postPartyPayload(payload)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to create party: "+err.Error())
	}
	if status != http.StatusOK && status != http.StatusCreated {
		msg := extractSatelliteError(body)
		if msg == "" {
			msg = fmt.Sprintf("Satellite rejected the party registration (status %d)", status)
		}
		log.Printf("satellite: parties rejected status=%d detail=%s", status, msg)
		return responses.ErrorResponse(c, status, msg)
	}

	// Store the canonical DID because 2.2 registers parties through /parties and
	// downstream issuer/webhook flows key credentials by the registry DID.
	proposal.PartyId = partyDID
	proposal.Status = "completed"
	// U2: onboarding a party makes the applicant its PartyAdmin (best-effort).
	h.grantOnboardingPartyAdmin(proposal)
	if err := h.Server.DB.Save(proposal).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to complete proposal")
	}
	return responses.MessageResponse(c, fiber.StatusOK, "Proposal successfully completed")
}

// completeProposalV3 creates the party on a v3.0 (claim-model) satellite via the
// register-new-party (/parties) endpoint, assembling the claim set from the
// proposal plus the deployment's framework configuration.
func (h *HandlerParty) completeProposalV3(c *fiber.Ctx, proposal *models.Proposal, registrarId string) error {
	partyDID, eori := deriveV3Identity(proposal.PartyId)
	if partyDID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "party_id is required")
	}
	var aliases []string
	if eori != "" {
		aliases = []string{satellite.BuildEoriAlias(eori)}
	}

	startDate := time.Now().Format("2006-01-02T15:04:05.000Z")
	endDate := time.Now().AddDate(1, 0, 0).Format("2006-01-02T15:04:05.000Z")

	agreementID := strings.TrimSpace(h.Config.FrameworkAgreementId)
	if agreementID == "" {
		// Deterministic fallback when the deployment hasn't pinned an id.
		agreementID = h.Config.FrameworkId + "-tou"
	}

	// Resolve a verificationHash per agreement type from the configured
	// agreements: each claim carries the SHA-256 of the actual document the party
	// agreed to. URL-sourced/unavailable documents fall back to the signed-artifact
	// (or eHerkenning consent) hash so completion never hard-fails on hashing.
	var settings models.Settings
	h.Server.DB.First(&settings)
	configuredAgreements := decodeAgreements(settings.Agreements)
	signedHash, _ := h.agreementVerificationHash(proposal)

	frameworkHash := signedHash
	if fa := findAgreementByType(configuredAgreements, "frameworkAgreement"); fa != nil {
		if docHash, ok := agreementDocumentHash(*fa); ok {
			frameworkHash = docHash
		}
	}

	includeDataspace := false
	dataspaceHash := ""
	dataspaceTitle := strings.TrimSpace(h.Config.DataspaceTitle)
	if da := findAgreementByType(configuredAgreements, "dataspaceAgreement"); da != nil {
		includeDataspace = true
		if strings.TrimSpace(da.Title) != "" {
			dataspaceTitle = da.Title
		}
		if docHash, ok := agreementDocumentHash(*da); ok {
			dataspaceHash = docHash
		} else {
			dataspaceHash = signedHash
		}
	}

	claims, err := satellite.BuildV3OnboardingClaims(proposal, satellite.V3OnboardingClaimConfig{
		RegistrarID:        registrarId,
		FrameworkID:        h.Config.FrameworkId,
		AgreementType:      h.Config.FrameworkAgreementType,
		AgreementID:        agreementID,
		AgreementTitle:     h.Config.FrameworkAgreementTitle,
		RoleID:             h.Config.FrameworkRoleId,
		Loa:                h.Config.FrameworkRoleLoa,
		LegalAdherence:     h.Config.FrameworkRoleLegalAdherence,
		CompliancyVerified: h.Config.FrameworkRoleCompliancy,
		VerificationHash:   frameworkHash,
		StartDate:          startDate,
		EndDate:            endDate,

		IncludeDataspaceAgreement: includeDataspace,
		DataspaceID:               h.Config.DataspaceId,
		DataspaceAgreementType:    "DataspaceAgreement",
		DataspaceAgreementID:      h.Config.FrameworkId + "-dsa",
		DataspaceAgreementTitle:   dataspaceTitle,
		DataspaceVerificationHash: dataspaceHash,
	})
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusUnprocessableEntity, "Cannot complete onboarding: "+err.Error())
	}

	request := &requests.PartyV3CreateRequest{
		ID:            partyDID,
		Name:          proposal.PartyName,
		AlsoKnownAs:   aliases,
		SchemaVersion: "v3.0",
		Claims:        claims,
	}

	status, body, err := h.postV3Party(request, partyDID, aliases)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to create party: "+err.Error())
	}
	if status != http.StatusOK && status != http.StatusCreated {
		msg := extractSatelliteError(body)
		if msg == "" {
			msg = fmt.Sprintf("Satellite rejected the party registration (status %d)", status)
		}
		log.Printf("satellite: parties rejected status=%d detail=%s", status, msg)
		return responses.ErrorResponse(c, status, msg)
	}

	// Store the canonical DID because v3 registers parties through /parties and
	// downstream issuer/webhook flows key credentials by the registry DID.
	proposal.PartyId = partyDID
	proposal.Status = "completed"
	// U2: onboarding a party makes the applicant its PartyAdmin (best-effort).
	h.grantOnboardingPartyAdmin(proposal)
	if err := h.Server.DB.Save(proposal).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to complete proposal")
	}
	return responses.MessageResponse(c, fiber.StatusOK, "Proposal successfully completed")
}

// agreementVerificationHash returns the SHA-256 hex of the signed-agreement
// artifact for the frameworkAgreement claim's verificationHash: the eHerkenning
// consent record for consent-based signing, otherwise the first uploaded signed
// agreement file.
func (h *HandlerParty) agreementVerificationHash(proposal *models.Proposal) (string, error) {
	if proposal.SignedVia == "eherkenning" || len(proposal.SignedAgreementPaths) == 0 {
		sum := sha256.Sum256(buildEherkenningConsentRecord(proposal))
		return hex.EncodeToString(sum[:]), nil
	}
	content, err := os.ReadFile(proposal.SignedAgreementPaths[0])
	if err != nil {
		return "", fmt.Errorf("failed to read signed agreement: %w", err)
	}
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:]), nil
}

func normalizePartyID(raw string) string {
	normalized := strings.TrimSpace(raw)
	if normalized == "" {
		return ""
	}
	if strings.HasPrefix(normalized, "EU.EORI.") {
		normalized = strings.TrimPrefix(normalized, "EU.EORI.")
	}
	normalized = strings.TrimPrefix(normalized, "NTR")
	normalized = "EU.EORI." + strings.TrimPrefix(normalized, "NTR")
	return normalized
}

type epCreationFlavor struct {
	UseDidIdentifiers bool
}

// ep_creation differences:
//   - 2.0.1: party_id, hash_file, publicly_publishable boolean, SPOR uses EORI.
//   - 2.1.1: id + alsoKnownAs (DID/EORI), hash_file + agreement_file (base64),
//     publicly_publishable string, SPOR uses DID.
func epCreationFlavorFromVersion(raw string) epCreationFlavor {
	trimmed := strings.TrimSpace(raw)
	if strings.HasPrefix(trimmed, "2.1") {
		return epCreationFlavor{UseDidIdentifiers: true}
	}
	return epCreationFlavor{UseDidIdentifiers: false}
}

func isSatelliteVersion22(raw string) bool {
	trimmed := strings.TrimSpace(raw)
	return strings.HasPrefix(trimmed, "2.2")
}

// deriveV3Identity turns the portal-supplied party id into a did:ishare id and
// the bare EORI it was derived from. A did:ishare id is normalized through the
// EORI form; any other DID method (did:web, did:ebsi, …) is preserved verbatim
// with no EORI alias; a plain EORI/registration number is promoted to a DID.
// ntrAlignedID matches ids already in the satellite's calcIshareDid shape
// (EU.<CC>.<identifier>), and ntrIdentifier matches bare ETSI NTR<CC>…
// organizationIdentifier values that must be LIFTED into that shape.
// Uppercase only, mirroring the satellite's calcIshareDid regex (NTR[A-Z][A-Z]):
// an identifier it cannot derive a country from gains nothing from lifting.
var (
	ntrAlignedID  = regexp.MustCompile(`^EU\.[A-Z]{2}\.NTR[A-Z]{2}`)
	ntrIdentifier = regexp.MustCompile(`^NTR([A-Z]{2})`)
)

func deriveV3Identity(rawID string) (did string, eori string) {
	trimmed := strings.TrimSpace(rawID)
	if trimmed == "" {
		return "", ""
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "did:ishare:") {
		trimmed = strings.TrimSpace(trimmed[len("did:ishare:"):])
		lower = strings.ToLower(trimmed)
	} else if strings.HasPrefix(lower, "did:") {
		return trimmed, ""
	}
	// A v3 satellite requires a certificate-registered party's id to equal
	// calcIshareDid(cert organizationIdentifier) = did:ishare:EU.<CC>.<identifier>
	// for NTR<CC> identifiers. Ids already in that shape pass through verbatim,
	// and bare NTR<CC>… identifiers are lifted into it — the legacy EU.EORI
	// canonicalisation below must never rewrite them, or no NTR-certificate
	// party can pass the satellite's alignment check.
	if ntrAlignedID.MatchString(trimmed) {
		return satellite.BuildDidFromPartyID(trimmed), ""
	}
	if m := ntrIdentifier.FindStringSubmatch(trimmed); m != nil {
		return satellite.BuildDidFromPartyID("EU." + strings.ToUpper(m[1]) + "." + trimmed), ""
	}
	eori = normalizePartyID(trimmed)
	return satellite.BuildDidFromPartyID(eori), eori
}

// cleanAliases trims, de-duplicates and drops empty alsoKnownAs entries.
func cleanAliases(aliases []string) []string {
	seen := map[string]bool{}
	cleaned := make([]string, 0, len(aliases))
	for _, alias := range aliases {
		a := strings.TrimSpace(alias)
		if a == "" || seen[a] {
			continue
		}
		seen[a] = true
		cleaned = append(cleaned, a)
	}
	return cleaned
}

// validateMinimumClaims enforces the v3 "register-new-party" rule: a party must
// provide frameworkCompliance, frameworkAgreement and frameworkRole claims plus
// at least one identity-proof claim (x509Certificate or idpAssertion).
func validateMinimumClaims(request *requests.PartyV3CreateRequest) error {
	present := map[string]bool{}
	for _, claim := range request.Claims {
		if t, ok := claim["type"].(string); ok {
			present[strings.TrimSpace(t)] = true
		}
	}

	var missing []string
	for _, required := range []string{"frameworkCompliance", "frameworkAgreement", "frameworkRole"} {
		if !present[required] {
			missing = append(missing, required)
		}
	}
	if !present["x509Certificate"] && !present["idpAssertion"] {
		missing = append(missing, "x509Certificate or idpAssertion")
	}

	if len(missing) > 0 {
		return fmt.Errorf("missing required claim(s): %s", strings.Join(missing, ", "))
	}
	return nil
}

// extractSatelliteError pulls a human-readable message out of a satellite error
// body, tolerating the common JSON envelopes; returns "" when none is found.
func extractSatelliteError(body []byte) string {
	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ""
	}
	for _, key := range []string{"message", "error_description", "error", "detail"} {
		if v, ok := parsed[key].(string); ok && strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// ModifyProposal godoc
// @Summary      Modify a rejected proposal
// @Description  Accepts a multipart form with JSON data and optional CTT proof file.
// @Tags         proposals
// @Accept       mpfd
// @Produce      json
// @Param        keycloakUsername  path      string  true  "Keycloak username"
// @Param        data              formData  string  true  "Proposal JSON payload"
// @Param        cttProof          formData  file    false "CTT proof file"
// @Success      200               {object}  map[string]string
// @Failure      400               {object}  map[string]string
// @Failure      404               {object}  map[string]string
// @Failure      500               {object}  map[string]string
// @Router       /proposals/modify/{keycloakUsername} [post]
func (h *HandlerParty) ModifyProposal(c *fiber.Ctx) error {
	keycloakUsernameParam := c.Params("keycloakUsername")
	keycloakUsername, err := url.PathUnescape(keycloakUsernameParam)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid keycloak username")
	}

	// Find the existing proposal
	var existingProposal models.Proposal
	result := h.Server.DB.Where("keycloak_username = ?", keycloakUsername).First(&existingProposal)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Proposal not found")
	}

	// Only the proposal owner or an onboarding admin may modify it.
	if !h.callerMayActOnProposal(c, &existingProposal) {
		return responses.ErrorResponse(c, fiber.StatusForbidden, "You are not allowed to modify this proposal")
	}

	// Verify that the proposal is in rejected state
	if existingProposal.Status != "rejected" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Only rejected proposals can be modified")
	}

	// Get the form data
	form, err := c.MultipartForm()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Failed to parse form data")
	}

	// Parse the JSON data
	var proposalData ProposalData
	if jsonData := form.Value["data"]; len(jsonData) > 0 {
		if err := json.Unmarshal([]byte(jsonData[0]), &proposalData); err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Failed to parse JSON data")
		}
	}

	// Handle the CTT Proof file
	var cttProofFilePath string
	if files := form.File["cttProof"]; len(files) > 0 {
		uploadDir := "./uploads"
		if err := os.MkdirAll(uploadDir, 0o755); err != nil {
			log.Printf("Failed to ensure uploads dir: %v", err)
		}
		// Unique filename: timestamp + random id so two proofs uploaded in the same
		// second don't collide (one would otherwise silently overwrite the other).
		cttProofFile := files[0]
		cttProofFilePath = fmt.Sprintf("%s/ctt_%s_%s", uploadDir, time.Now().Format("20060102150405"), newAgreementID())
		err := c.SaveFile(cttProofFile, cttProofFilePath)
		if err != nil {
			log.Printf("Failed to save CTT proof file: %v", err)
		}
	}

	// Update the existing proposal
	existingProposal.CompanyName = proposalData.IDCheck.CompanyName
	existingProposal.KvkNumber = proposalData.IDCheck.KvkNumber
	existingProposal.PartyId = proposalData.IDCheck.PartyId
	existingProposal.PartyName = proposalData.IDCheck.PartyName
	existingProposal.DataOwner = proposalData.Roles.DataOwner
	existingProposal.DataConsumer = proposalData.Roles.DataConsumer
	existingProposal.DataProvider = proposalData.Roles.DataProvider
	existingProposal.UseM2M = proposalData.M2M.UseM2M
	existingProposal.Address = proposalData.Location.Address
	existingProposal.ZipCode = proposalData.Location.ZipCode
	existingProposal.City = proposalData.Location.City
	existingProposal.Country = proposalData.Location.Country
	existingProposal.Website = proposalData.Location.Website
	existingProposal.AuthRegistry = proposalData.Association.AuthRegistry
	existingProposal.CapabilitiesUrl = proposalData.Association.CapabilitiesUrl
	existingProposal.AuthRegistryName = proposalData.Association.AuthRegistryName
	existingProposal.AuthRegistryUrl = proposalData.Association.AuthRegistryUrl
	if cttProofFilePath != "" {
		existingProposal.CttProofPath = cttProofFilePath
	}
	existingProposal.ContactName = proposalData.Account.Name
	existingProposal.ContactEmail = proposalData.Account.Email
	existingProposal.ContactPhone = proposalData.Account.Phone
	existingProposal.Status = "pending" // Reset status to pending after modification

	// Save the updated proposal
	result = h.Server.DB.Save(&existingProposal)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to update proposal: "+result.Error.Error())
	}

	return responses.MessageResponse(c, fiber.StatusOK, "Your proposal has been successfully updated.")
}

// DownloadAgreement godoc
// @Summary      Download a signed agreement file
// @Tags         proposals
// @Produce      application/pdf
// @Param        id     path   int    true  "Proposal ID"
// @Param        index  query  int    false "Agreement file index (default 0)"
// @Success      200    {file}  file
// @Failure      400    {object}  map[string]string
// @Failure      404    {object}  map[string]string
// @Router       /proposals/{id}/agreement [get]
func (h *HandlerParty) DownloadAgreement(c *fiber.Ctx) error {
	id := c.Params("id")
	fileIndex := c.Query("index", "0") // Default to first file if no index specified

	// Get proposal from database
	var proposal models.Proposal
	result := h.Server.DB.First(&proposal, id)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Agreement not found")
	}

	// Check if agreements exist
	if len(proposal.SignedAgreementPaths) == 0 {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "No signed agreements found")
	}

	// Convert index to integer
	idx, err := strconv.Atoi(fileIndex)
	if err != nil || idx < 0 || idx >= len(proposal.SignedAgreementPaths) {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid agreement index")
	}

	// Set response headers. attachment forces a download (never an inline render)
	// and nosniff stops the browser MIME-guessing, so a stored file that isn't
	// really a PDF can't be served as active content to the admin viewing it.
	c.Set("Content-Type", "application/pdf")
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=agreement-%s-%d.pdf", id, idx))

	// Return the file
	return c.SendFile(proposal.SignedAgreementPaths[idx])
}
