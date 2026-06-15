package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"onboardingportal/config"
	"onboardingportal/models"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"onboardingportal/server/middlewares"

	"github.com/gofiber/fiber/v2"
)

type HandlerDelegation struct {
	Server *s.Server
	Config *config.Config
}

func NewHandlerDelegation(server *s.Server, config *config.Config) *HandlerDelegation {
	return &HandlerDelegation{Server: server, Config: config}
}

type delegationOverview struct {
	VerifiedOrganization *models.Organization               `json:"verifiedOrganization,omitempty"`
	Memberships          []models.OrganizationMember        `json:"memberships"`
	IdpConnections       []models.OrganizationIdpConnection `json:"idpConnections"`
	Members              []models.OrganizationMember        `json:"members"`
}

type upsertIdpConnectionRequest struct {
	KvkNumber    string `json:"kvkNumber"`
	ProviderType string `json:"providerType"`
	Alias        string `json:"alias"`
	DisplayName  string `json:"displayName"`
	IssuerURL    string `json:"issuerUrl"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

type createMemberRequest struct {
	KvkNumber     string `json:"kvkNumber"`
	Email         string `json:"email"`
	ProviderAlias string `json:"providerAlias"`
	Role          string `json:"role"`
}

func currentClaims(c *fiber.Ctx) *middlewares.KeycloakClaims {
	claims, _ := c.Locals("claims").(*middlewares.KeycloakClaims)
	return claims
}

func strictLegalEntityIdentifier(claims *middlewares.KeycloakClaims) string {
	if claims == nil {
		return ""
	}
	switch {
	case claims.KvkNumber != "":
		return strings.TrimSpace(claims.KvkNumber)
	case claims.KvkNumberPascalCase != "":
		return strings.TrimSpace(claims.KvkNumberPascalCase)
	case claims.LegalSubjectID != "":
		return strings.TrimSpace(claims.LegalSubjectID)
	case claims.LegalSubjectIDUpper != "":
		return strings.TrimSpace(claims.LegalSubjectIDUpper)
	case claims.LegalSubjectIDPascal != "":
		return strings.TrimSpace(claims.LegalSubjectIDPascal)
	default:
		return ""
	}
}

func organizationNameFromClaims(claims *middlewares.KeycloakClaims) string {
	return strings.TrimSpace(claims.OrganizationName())
}

func (h *HandlerDelegation) ensureVerifiedOrganization(c *fiber.Ctx) (*models.Organization, *middlewares.KeycloakClaims, error) {
	claims := currentClaims(c)
	kvk := strictLegalEntityIdentifier(claims)
	if kvk == "" {
		return nil, claims, fiber.NewError(fiber.StatusForbidden, "Current session has no eHerkenning organization identifier")
	}

	org := &models.Organization{}
	companyName := organizationNameFromClaims(claims)
	err := h.Server.DB.Where("kvk_number = ?", kvk).First(org).Error
	if err == nil {
		if org.CompanyName == "" && companyName != "" {
			org.CompanyName = companyName
			_ = h.Server.DB.Save(org).Error
		}
		return org, claims, nil
	}

	org = &models.Organization{
		KvkNumber:          kvk,
		CompanyName:        companyName,
		VerifiedBySubject:  claims.Subject,
		VerifiedByUsername: claims.PreferredUsername,
	}
	if err := h.Server.DB.Create(org).Error; err != nil {
		return nil, claims, fiber.NewError(fiber.StatusInternalServerError, "Failed to create organization delegation record")
	}

	owner := models.OrganizationMember{
		OrganizationID:   org.ID,
		Email:            strings.TrimSpace(claims.Email),
		KeycloakSubject:  strings.TrimSpace(claims.Subject),
		Username:         strings.TrimSpace(claims.PreferredUsername),
		Role:             "owner",
		Status:           "active",
		InvitedBySubject: strings.TrimSpace(claims.Subject),
	}
	_ = h.Server.DB.Create(&owner).Error

	return org, claims, nil
}

func (h *HandlerDelegation) actorOwnsOrganization(claims *middlewares.KeycloakClaims, kvk string) (*models.Organization, bool) {
	if claims == nil || strings.TrimSpace(kvk) == "" {
		return nil, false
	}

	org := &models.Organization{}
	if err := h.Server.DB.Where("kvk_number = ?", strings.TrimSpace(kvk)).First(org).Error; err != nil {
		return nil, false
	}

	var count int64
	h.Server.DB.Model(&models.OrganizationMember{}).
		Where("organization_id = ? AND status = ? AND role = ? AND (keycloak_subject = ? OR email = ? OR username = ?)",
			org.ID,
			"active",
			"owner",
			strings.TrimSpace(claims.Subject),
			strings.TrimSpace(claims.Email),
			strings.TrimSpace(claims.PreferredUsername),
		).
		Count(&count)

	return org, count > 0
}

func (h *HandlerDelegation) GetOverview(c *fiber.Ctx) error {
	claims := currentClaims(c)
	if claims == nil {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, "missing auth claims")
	}

	var verifiedOrg *models.Organization
	if org, _, err := h.ensureVerifiedOrganization(c); err == nil {
		verifiedOrg = org
	}

	var memberships []models.OrganizationMember
	h.Server.DB.Preload("Organization").
		Where("status = ? AND (keycloak_subject = ? OR email = ? OR username = ?)",
			"active",
			strings.TrimSpace(claims.Subject),
			strings.TrimSpace(claims.Email),
			strings.TrimSpace(claims.PreferredUsername),
		).
		Find(&memberships)

	var idpConnections []models.OrganizationIdpConnection
	var members []models.OrganizationMember
	if verifiedOrg != nil {
		h.Server.DB.Where("organization_id = ?", verifiedOrg.ID).Order("created_at desc").Find(&idpConnections)
		h.Server.DB.Where("organization_id = ?", verifiedOrg.ID).Order("created_at desc").Find(&members)
	}

	return c.Status(fiber.StatusOK).JSON(delegationOverview{
		VerifiedOrganization: verifiedOrg,
		Memberships:          memberships,
		IdpConnections:       idpConnections,
		Members:              members,
	})
}

func (h *HandlerDelegation) CreateIdpConnection(c *fiber.Ctx) error {
	claims := currentClaims(c)
	var req upsertIdpConnectionRequest
	if err := c.BodyParser(&req); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid IdP connection payload")
	}

	org, ok := h.actorOwnsOrganization(claims, req.KvkNumber)
	if !ok {
		return responses.ErrorResponse(c, fiber.StatusForbidden, "Only an organization owner can create IdP connections")
	}

	providerType := strings.TrimSpace(req.ProviderType)
	alias := strings.TrimSpace(req.Alias)
	if providerType == "" || alias == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "providerType and alias are required")
	}

	if err := h.provisionKeycloakIdp(req); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, err.Error())
	}

	connection := models.OrganizationIdpConnection{
		OrganizationID:   org.ID,
		ProviderType:     providerType,
		Alias:            alias,
		DisplayName:      strings.TrimSpace(req.DisplayName),
		IssuerURL:        strings.TrimSpace(req.IssuerURL),
		ClientID:         strings.TrimSpace(req.ClientID),
		Status:           "configured",
		CreatedBySubject: strings.TrimSpace(claims.Subject),
	}

	if err := h.Server.DB.Create(&connection).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create IdP connection")
	}

	return c.Status(fiber.StatusCreated).JSON(connection)
}

func (h *HandlerDelegation) provisionKeycloakIdp(req upsertIdpConnectionRequest) error {
	if h.Config.KeycloakBaseURL == "" || h.Config.KeycloakRealm == "" ||
		h.Config.KeycloakAdminUsername == "" || h.Config.KeycloakAdminPassword == "" {
		return fmt.Errorf("Keycloak admin provisioning is not configured")
	}

	token, err := h.keycloakAdminToken()
	if err != nil {
		return err
	}

	providerID, config, err := keycloakIdpConfig(req)
	if err != nil {
		return err
	}

	payload := map[string]any{
		"alias":                     strings.TrimSpace(req.Alias),
		"displayName":               strings.TrimSpace(req.DisplayName),
		"providerId":                providerID,
		"enabled":                   true,
		"trustEmail":                true,
		"storeToken":                false,
		"addReadTokenRoleOnCreate":  false,
		"linkOnly":                  false,
		"firstBrokerLoginFlowAlias": "first broker login",
		"config":                    config,
	}
	if payload["displayName"] == "" {
		payload["displayName"] = strings.TrimSpace(req.Alias)
	}

	body, _ := json.Marshal(payload)
	endpoint := fmt.Sprintf("%s/admin/realms/%s/identity-provider/instances", h.Config.KeycloakBaseURL, url.PathEscape(h.Config.KeycloakRealm))
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("failed to provision Keycloak IdP: %w", err)
	}
	defer response.Body.Close()

	responseBody, _ := io.ReadAll(response.Body)
	if response.StatusCode == http.StatusCreated || response.StatusCode == http.StatusNoContent || response.StatusCode == http.StatusConflict {
		return nil
	}

	return fmt.Errorf("Keycloak IdP provisioning failed: status %d %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
}

func (h *HandlerDelegation) keycloakAdminToken() (string, error) {
	form := url.Values{}
	form.Set("client_id", "admin-cli")
	form.Set("grant_type", "password")
	form.Set("username", h.Config.KeycloakAdminUsername)
	form.Set("password", h.Config.KeycloakAdminPassword)

	endpoint := h.Config.KeycloakBaseURL + "/realms/master/protocol/openid-connect/token"
	response, err := http.PostForm(endpoint, form)
	if err != nil {
		return "", fmt.Errorf("failed to authenticate to Keycloak admin API: %w", err)
	}
	defer response.Body.Close()

	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Keycloak admin authentication failed: status %d %s", response.StatusCode, strings.TrimSpace(string(body)))
	}

	var parsed struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", err
	}
	if parsed.AccessToken == "" {
		return "", fmt.Errorf("Keycloak admin authentication returned no access token")
	}

	return parsed.AccessToken, nil
}

func keycloakIdpConfig(req upsertIdpConnectionRequest) (string, map[string]string, error) {
	providerType := strings.TrimSpace(req.ProviderType)
	clientID := strings.TrimSpace(req.ClientID)
	clientSecret := strings.TrimSpace(req.ClientSecret)
	issuerURL := strings.TrimSpace(req.IssuerURL)

	switch providerType {
	case "google":
		if clientID == "" || clientSecret == "" {
			return "", nil, fmt.Errorf("clientId and clientSecret are required for Google")
		}
		return "google", map[string]string{
			"clientId":     clientID,
			"clientSecret": clientSecret,
			"syncMode":     "IMPORT",
			"useJwksUrl":   "true",
		}, nil
	case "microsoft":
		if clientID == "" || clientSecret == "" {
			return "", nil, fmt.Errorf("clientId and clientSecret are required for Microsoft")
		}
		if issuerURL == "" {
			issuerURL = "https://login.microsoftonline.com/common/v2.0"
		}
		return "oidc", oidcProviderConfig(clientID, clientSecret, issuerURL), nil
	case "okta", "generic-oidc":
		if clientID == "" || clientSecret == "" || issuerURL == "" {
			return "", nil, fmt.Errorf("clientId, clientSecret and issuerUrl are required for OIDC")
		}
		return "oidc", oidcProviderConfig(clientID, clientSecret, issuerURL), nil
	case "generic-saml":
		if issuerURL == "" {
			return "", nil, fmt.Errorf("issuerUrl must point to SAML metadata for SAML IdPs")
		}
		return "saml", map[string]string{
			"metadataDescriptorUrl": issuerURL,
			"syncMode":              "IMPORT",
		}, nil
	default:
		return "", nil, fmt.Errorf("unsupported providerType %q", providerType)
	}
}

func oidcProviderConfig(clientID, clientSecret, issuerURL string) map[string]string {
	issuerURL = strings.TrimRight(issuerURL, "/")
	metadataURL := issuerURL
	if !strings.Contains(metadataURL, "/.well-known/") {
		metadataURL = issuerURL + "/.well-known/openid-configuration"
	}
	return map[string]string{
		"clientId":              clientID,
		"clientSecret":          clientSecret,
		"syncMode":              "IMPORT",
		"useJwksUrl":            "true",
		"validateSignature":     "true",
		"issuer":                issuerURL,
		"metadataDescriptorUrl": metadataURL,
		"defaultScope":          "openid profile email",
		"backchannelSupported":  "true",
	}
}

func (h *HandlerDelegation) CreateMember(c *fiber.Ctx) error {
	claims := currentClaims(c)
	var req createMemberRequest
	if err := c.BodyParser(&req); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid member payload")
	}

	org, ok := h.actorOwnsOrganization(claims, req.KvkNumber)
	if !ok {
		return responses.ErrorResponse(c, fiber.StatusForbidden, "Only an organization owner can delegate access")
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "email is required")
	}

	role := strings.TrimSpace(req.Role)
	if role == "" {
		role = "contributor"
	}

	member := models.OrganizationMember{
		OrganizationID:   org.ID,
		Email:            email,
		ProviderAlias:    strings.TrimSpace(req.ProviderAlias),
		Role:             role,
		Status:           "active",
		InvitedBySubject: strings.TrimSpace(claims.Subject),
	}

	if err := h.Server.DB.Create(&member).Error; err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create delegated member")
	}

	return c.Status(fiber.StatusCreated).JSON(member)
}
