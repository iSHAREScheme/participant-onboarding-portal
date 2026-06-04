package handlers

import (
	"bytes"
	"crypto/md5"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/url"
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

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to prepare request payload.")
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

	assertionToken, err := createSatelliteOwnerAccessToken(h.Server.Config)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create satellite owner access token.")
	}

	client := &http.Client{}

	accessToken, err := satellite.ExchangeForAccessToken(client, h.Server.Config, assertionToken)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, fmt.Sprintf("Failed to get satellite access token: %v", err))
	}

	payload := satellite.BuildEpCreation30RequestFromRequest(&request, partyDID, aliases, h.Config.RegistrarId)
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to prepare request payload.")
	}

	partiesURL := joinSatelliteURL(h.Config.SatelliteBaseUrl, h.Config.SatellitePartiesEndpoint)
	req, err := http.NewRequest("POST", partiesURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request to satellite.")
	}
	req.Header.Add("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

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
		log.Printf("satellite: parties status=%d body=%s", res.StatusCode, string(body))
	}

	// The satellite returns 200 (spec) or 201 on success; the body is a signed
	// partyResponse JWT we don't need to surface to the portal user.
	if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusCreated {
		msg := extractSatelliteError(body)
		if msg == "" {
			msg = fmt.Sprintf("remote error, status %d", res.StatusCode)
		}
		return responses.ErrorResponse(c, res.StatusCode, msg)
	}

	return responses.MessageResponse(c, fiber.StatusOK, "Your request is successfully accepted. Verification process started.")
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
	body := c.Body()

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
	return h.forwardPartyWrite(c, http.MethodPatch, "/parties/"+url.PathEscape(id))
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
	return h.forwardPartyWrite(c, http.MethodPatch, "/parties/"+url.PathEscape(id)+"/claims/"+url.PathEscape(claimId))
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

	proposalKvk := strings.TrimSpace(proposalData.IDCheck.KvkNumber)
	if proposalKvk == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Proposal is missing kvkNumber")
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
		if tokenIdentifier == "" && !h.userCanActForKvk(c, proposalKvk) {
			return responses.ErrorResponse(c, fiber.StatusForbidden, "Authenticated user is missing organization identifier claim and has no delegation for this kvkNumber")
		}
		if tokenIdentifier != proposalKvk && !h.userCanActForKvk(c, proposalKvk) {
			return responses.ErrorResponse(c, fiber.StatusForbidden, "Authenticated user cannot submit proposals for this kvkNumber")
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
		cttProofFilePath = uploadDir + "/" + timestamp
		err := c.SaveFile(cttProofFile, cttProofFilePath)
		if err != nil {
			log.Printf("Failed to save CTT proof file: %v", err)
		}
	}

	// Save proposal to database
	proposal := models.Proposal{
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
		KeycloakUsername: proposalData.KeycloakUsername,
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
func (h *HandlerParty) GetProposalByID(c *fiber.Ctx) error {
	id := c.Params("id")

	var proposal models.Proposal
	result := h.Server.DB.First(&proposal, id)
	if result.Error != nil {
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

	// Handle multiple file uploads
	form, err := c.MultipartForm()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Error processing files")
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

	var filePaths []string
	// Ensure uploads directory exists (WORKDIR=/app ⇒ ./uploads == /app/uploads)
	uploadDir := "./uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Printf("Failed to ensure uploads dir: %v", err)
	}
	for i, file := range files {
		// Generate unique filename using timestamp and index
		timestamp := time.Now().Format("20060102150405")
		filepath := fmt.Sprintf("%s/%s_%d.pdf", uploadDir, timestamp, i)

		if err := c.SaveFile(file, filepath); err != nil {
			// Clean up any files already saved
			for _, path := range filePaths {
				os.Remove(path)
			}
			log.Printf("Error saving agreement file: %s", err)
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save file")
		}
		filePaths = append(filePaths, filepath)
	}

	// Update proposal with file paths
	proposal.SignedAgreementPaths = filePaths
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
func (h *HandlerParty) CompleteProposal(c *fiber.Ctx) error {
	id := c.Params("id")

	// Find the proposal
	var proposal models.Proposal
	result := h.Server.DB.First(&proposal, id)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Proposal not found")
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

	if len(proposal.SignedAgreementPaths) == 0 {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Signed agreements are required to complete proposal")
	}

	flavor := epCreationFlavorFromVersion(h.Config.SatelliteVersion)

	// Read and hash agreement files
	var agreementFiles []satellite.AgreementFile
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

	agreementTemplates := []satellite.AgreementTemplate{
		{Type: "TermsOfUse", Title: "ToU-iSHARE"},
		{Type: "AccessionAgreement", Title: "iSHARE-AA"},
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
	if authRegistryURL == "" {
		authRegistryURL = "https://ar.isharetest.net"
	}

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
	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to marshal request body")
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
		// message, _ := responseData["message"].(string)
		// if message == "" {
		// 	message = "Failed to complete proposal"
		// }
		return responses.ErrorResponse(c, res.StatusCode, "unprocessable")
	}

	// Update the status to completed
	proposal.Status = "completed"

	// Save the changes
	result = h.Server.DB.Save(&proposal)
	if result.Error != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to complete proposal")
	}

	return responses.MessageResponse(c, fiber.StatusOK, "Proposal successfully completed")
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

// deriveV3Identity turns the portal-supplied party id into a did:ishare id and
// the bare EORI it was derived from. A did:ishare id is normalized through the
// EORI form; any other DID method (did:web, did:ebsi, …) is preserved verbatim
// with no EORI alias; a plain EORI/registration number is promoted to a DID.
func deriveV3Identity(rawID string) (did string, eori string) {
	trimmed := strings.TrimSpace(rawID)
	if trimmed == "" {
		return "", ""
	}
	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "did:ishare:") {
		eori = normalizePartyID(trimmed[len("did:ishare:"):])
		return satellite.BuildDidFromPartyID(eori), eori
	}
	if strings.HasPrefix(lower, "did:") {
		return trimmed, ""
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
		// Generate unique filename using timestamp
		timestamp := time.Now().Format("20060102150405")
		filepath := fmt.Sprintf("%s/%s", uploadDir, timestamp)
		cttProofFile := files[0]
		cttProofFilePath = filepath
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

	// Set response headers
	c.Set("Content-Type", "application/pdf")
	c.Set("Content-Disposition", fmt.Sprintf("attachment; filename=agreement-%s-%d.pdf", id, idx))

	// Return the file
	return c.SendFile(proposal.SignedAgreementPaths[idx])
}
