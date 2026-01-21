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

// AccessToken represents the OAuth 2.0 access token response.
type AccessToken struct {
	AccessToken *string `json:"access_token,omitempty"`
	TokenType   *string `json:"token_type,omitempty"`
	ExpiresIn   *int64  `json:"expires_in,omitempty"`
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

func (h *HandlerParty) getSatelliteAccessToken(client *http.Client, assertionToken string) (string, error) {
	if assertionToken == "" {
		return "", fmt.Errorf("client assertion is empty")
	}

	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("scope", h.Config.SatelliteTokenScope)
	form.Set("client_id", h.Config.SatelliteIss)
	form.Set("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
	form.Set("client_assertion", assertionToken)

	tokenURL := joinSatelliteURL(h.Config.SatelliteBaseUrl, h.Config.SatelliteTokenEndpoint)
	if h.Config.SatelliteDebug {
		log.Printf("satellite: requesting access token url=%s scope=%s client_id=%s", tokenURL, h.Config.SatelliteTokenScope, h.Config.SatelliteIss)
		parts := strings.Split(assertionToken, ".")
		if len(parts) >= 2 {
			if header, err := base64.RawURLEncoding.DecodeString(parts[0]); err == nil {
				log.Printf("satellite: client assertion header=%s", header)
			} else {
				log.Printf("satellite: failed to decode assertion header: %v", err)
			}
			if payload, err := base64.RawURLEncoding.DecodeString(parts[1]); err == nil {
				log.Printf("satellite: client assertion payload=%s", payload)
			} else {
				log.Printf("satellite: failed to decode assertion payload: %v", err)
			}
		}
	}

	req, err := http.NewRequest("POST", tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}

	if res.StatusCode != http.StatusOK {
		if h.Config.SatelliteDebug {
			log.Printf("satellite: token request failed status=%d body=%s", res.StatusCode, string(body))
		}
		return "", fmt.Errorf("satellite token request failed: status %d", res.StatusCode)
	}

	var tokenResponse AccessToken
	if err := json.Unmarshal(body, &tokenResponse); err != nil {
		return "", fmt.Errorf("failed to parse token response: %w", err)
	}
	if tokenResponse.AccessToken == nil || *tokenResponse.AccessToken == "" {
		return "", fmt.Errorf("token response did not contain an access token")
	}
	if h.Config.SatelliteDebug {
		log.Printf("satellite: received access token (len=%d)", len(*tokenResponse.AccessToken))
	}

	return *tokenResponse.AccessToken, nil
}

func NewHandlerParty(server *s.Server, config *config.Config) *HandlerParty {
	return &HandlerParty{
		Server: server,
		Config: config,
	}
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

	if h.Config.SporSignedRequestBase64 != "" {
		request.Spor.SignedRequest = h.Config.SporSignedRequestBase64
	}

	if h.Config.SatelliteDebug {
		signedRequest := request.Spor.SignedRequest
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

	accessToken, err := h.getSatelliteAccessToken(client, assertionToken)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, fmt.Sprintf("Failed to get satellite access token: %v", err))
	}

	payloadBytes, err := json.Marshal(request)
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
		if tokenIdentifier == "" {
			return responses.ErrorResponse(c, fiber.StatusForbidden, "Authenticated user is missing organization identifier claim")
		}
		if tokenIdentifier != proposalKvk {
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

	// Read and hash agreement files
	var agreementHashes []string
	for _, path := range proposal.SignedAgreementPaths {
		fileContent, err := os.ReadFile(path)
		if err != nil {
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to read agreement file")
		}
		hash := md5.Sum(fileContent)
		agreementHashes = append(agreementHashes, fmt.Sprintf("%x", hash))
	}

	agreementMetadata := []struct {
		Type  string
		Title string
	}{
		{Type: "TermsOfUse", Title: "ToU-iSHARE"},
		{Type: "AccessionAgreement", Title: "iSHARE-AA"},
	}

	agreements := make([]map[string]interface{}, 0, len(agreementHashes))
	for idx, agreementHash := range agreementHashes {
		agreementType := "Agreement"
		agreementTitle := fmt.Sprintf("Agreement-%d", idx+1)
		if idx < len(agreementMetadata) {
			agreementType = agreementMetadata[idx].Type
			agreementTitle = agreementMetadata[idx].Title
		}
		agreements = append(agreements, map[string]interface{}{
			"type":                 agreementType,
			"title":                agreementTitle,
			"status":               "Accepted",
			"sign_date":            time.Now().Format("2006-01-02T15:04:05.000Z"),
			"expiry_date":          time.Now().AddDate(1, 0, 0).Format("2006-01-02T15:04:05.000Z"),
			"hash_file":            agreementHash,
			"framework":            "iSHARE",
			"dataspace_id":         dataspaceId,
			"dataspace_title":      dataspaceTitle,
			"compliancy_verified":  "No",
		})
	}

	normalizedPartyID := proposal.PartyId
	if strings.HasPrefix(normalizedPartyID, "EU.EORI.") {
		normalizedPartyID = strings.TrimPrefix(normalizedPartyID, "EU.EORI.")
	}
	normalizedPartyID = "EU.EORI." + strings.TrimPrefix(normalizedPartyID, "NTR")

	signedRequest := h.Config.SporSignedRequestBase64
	if signedRequest == "" {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "SPOR signed request is not configured")
	}

	authRegistryURL := proposal.AuthRegistryUrl
	if authRegistryURL == "" {
		authRegistryURL = "https://ar.isharetest.net"
	}

	requestBody := map[string]interface{}{
		"party_id":       normalizedPartyID,
		"party_name":     proposal.PartyName,
		"capability_url": proposal.CapabilitiesUrl,
		"registrar_id":   registrarId,
		"adherence": map[string]interface{}{
			"status":     "Active",
			"start_date": time.Now().Format("2006-01-02T15:04:05.000Z"),
			"end_date":   time.Now().AddDate(1, 0, 0).Format("2006-01-02T15:04:05.000Z"),
		},
		"authregistries": []map[string]interface{}{
			{
				"authregistery_id":   proposal.AuthRegistry,
				"authregistery_name": proposal.AuthRegistryName,
				"authregistery_url":  authRegistryURL,
				"dataspace_id":       dataspaceId,
				"dataspace_title":    dataspaceTitle,
			},
		},
			"additional_info": map[string]interface{}{
				"description":          "",
				"logo":                 "",
				"website":              normalizeWebsiteURL(proposal.Website),
				"company_phone":        proposal.ContactPhone,
				"company_email":        proposal.ContactEmail,
				"publicly_publishable": false,
			},
		"spor": map[string]interface{}{
			"signed_request": signedRequest,
		},
			"roles": []map[string]interface{}{
				{
					"role":                "EntitledParty",
					"start_date":          time.Now().Format("2006-01-02T15:04:05.000Z"),
					"end_date":            time.Now().AddDate(1, 0, 0).Format("2006-01-02T15:04:05.000Z"),
					"loa":                 "Substantial",
					"compliancy_verified": true,
					"legal_adherence":     "yes",
				},
			},
	}

	if len(agreements) > 0 {
		requestBody["agreements"] = agreements
	}

	if h.Config.SatelliteDebug {
		if dump, err := json.MarshalIndent(requestBody, "", "  "); err == nil {
			log.Printf("satellite: completeProposal payload %s", string(dump))
		} else {
			log.Printf("satellite: payload marshal error: %v", err)
		}
	}

	// Convert the map to JSON
	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to marshal request body")
	}

	// Create a new HTTP client
	client := &http.Client{}

	accessToken, err := h.getSatelliteAccessToken(client, assertionToken)
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

func normalizeWebsiteURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	if !strings.Contains(trimmed, "://") {
		trimmed = "https://" + trimmed
	}

	if _, err := url.ParseRequestURI(trimmed); err != nil {
		return raw
	}

	return trimmed
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
