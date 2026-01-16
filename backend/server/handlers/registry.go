package handlers

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"onboardingportal/config"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type HandlerRegistry struct {
	Server *s.Server
	Config *config.Config
}

func NewHandlerRegistry(server *s.Server, config *config.Config) *HandlerRegistry {
	return &HandlerRegistry{
		Server: server,
		Config: config,
	}
}

// GetRegistry godoc
// @Summary      List authorisation registries
// @Description  Fetches Authorisation Registry parties from the iSHARE Satellite and returns the decoded JWT payload.
// @Tags         registry
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Failure      500  {object}  map[string]string
// @Router       /registry [get]
func (h *HandlerRegistry) GetRegistry(c *fiber.Ctx) error {
	// Get access token using the same method as in party handler
	accessToken, err := createSatelliteOwnerAccessToken(h.Server.Config)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create access token")
	}

	// Create HTTP client
	client := &http.Client{}

	// Create request to iSHARE test endpoint
	req, err := http.NewRequest("GET", h.Config.SatelliteBaseUrl+"/parties?role=AuthorisationRegistry", nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request")
	}

	// Add authorization header
	req.Header.Add("Authorization", "Bearer "+accessToken)

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to fetch registry data")
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to read response body")
	}

	// Parse response
	var registryData responses.RegistryResponse
	if err := json.Unmarshal(body, &registryData); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to parse registry data")
	}

	// Parse the parties_token JWT to get the actual registry data
	parts := strings.Split(registryData.PartiesToken, ".")
	if len(parts) != 3 {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Invalid JWT format")
	}

	// Decode the payload (second part)
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to decode JWT payload")
	}

	// Parse the decoded payload
	var decodedData map[string]interface{}
	if err := json.Unmarshal(payload, &decodedData); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to parse JWT payload")
	}

	return c.JSON(decodedData)
}

// VerifyTrustedCertificate godoc
// @Summary      Verify trusted certificate
// @Description  Calls the participant registry trusted-list (TODO) and verifies certificate status.
// @Tags         registry
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Failure      500  {object}  map[string]string
// @Router       /registry/trusted-cert [get]
func (h *HandlerRegistry) VerifyTrustedCertificate(c *fiber.Ctx) error {
	// TODO: call trusted_list endpoint: https://dev.ishare.eu/participant-registry-role/trusted-list

	var data map[string]interface{}
	// return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Not implemented")
	return c.JSON(data)
}
