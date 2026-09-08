package handlers

import (
	"encoding/json"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
	"log"
	"onboardingportal/config"
	"onboardingportal/models"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type HandlerSettings struct {
	Server *s.Server
	Config *config.Config
}

func NewHandlerSettings(server *s.Server, config *config.Config) *HandlerSettings {
	return &HandlerSettings{
		Server: server,
		Config: config,
	}
}

// GetSettings godoc
// @Summary      Get settings
// @Description  Returns the current onboarding settings.
// @Tags         settings
// @Produce      json
// @Success      200  {object}  models.Settings
// @Failure      500  {object}  map[string]string
// @Router       /settings [get]
func (h *HandlerSettings) GetSettings(c *fiber.Ctx) error {
	var settings models.Settings
	result := h.Server.DB.First(&settings)
	log.Printf("Settings retrieved: %+v", settings)
	if result.Error != nil {
		// If no settings found, return empty description
		return c.JSON(fiber.Map{
			"description":                      "",
			"registrarId":                      os.Getenv("SATELLITE_ISS"),
			"dataspaceId":                      "",
			"prefillAuthRegistry":              false,
			"agreements":                       []string{},
			"logoPath":                         "",
			"faviconPath":                      "",
			"theme":                            nil,
			"themes":                           nil,
			"activeTheme":                      "",
			"requireQualifiedEidasCertificate": false,
		})
	}

	// Redact agreements before returning: replace the stored array (which holds
	// encrypted protected-URL credentials) with the same secret-free view the
	// dedicated agreements endpoint serves.
	if redacted, err := json.Marshal(viewAgreements(decodeAgreements(settings.Agreements))); err == nil {
		settings.Agreements = datatypes.JSON(redacted)
	}

	return c.JSON(settings)
}

// GetPublicSettings godoc
// @Summary      Get public settings
// @Description  Returns only the branding + content fields needed by the public
// @Description  landing page and app-wide theming. Excludes the satellite
// @Description  connection config, registrar/dataspace identifiers and the saved
// @Description  theme library, which are served only to authenticated callers.
// @Tags         settings
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Router       /settings/public [get]
func (h *HandlerSettings) GetPublicSettings(c *fiber.Ctx) error {
	var settings models.Settings
	// Whether the portal is co-deployed with a Participant Registry admin API.
	// Non-secret topology flag used by the UI to show/hide the PR-admin features.
	prConfigured := strings.TrimSpace(h.Config.PrApiBaseUrl) != ""
	if h.Server.DB.First(&settings).Error != nil {
		return c.JSON(fiber.Map{
			"description":                      "",
			"theme":                            nil,
			"logoPath":                         "",
			"faviconPath":                      "",
			"activeTheme":                      "",
			"agreements":                       []publicAgreementView{},
			"prConfigured":                     prConfigured,
			"requireQualifiedEidasCertificate": false,
			"publicOnboardingEnabled":          false,
			"onboardingFlows":                  []fiber.Map{},
		})
	}
	// Deliberately a curated allowlist of public fields — never spread the whole
	// settings struct here, so satellite/registrar config can't leak by default.
	return c.JSON(fiber.Map{
		"description": settings.Description,
		"theme":       settings.Theme,
		"logoPath":    settings.LogoPath,
		"faviconPath": settings.FaviconPath,
		"activeTheme": settings.ActiveTheme,
		"agreements":  publicViewAgreements(decodeAgreements(settings.Agreements)),
		// Onboarding-flow config consumed by the public landing/header and the
		// (authenticated) register flow.
		"defaultAssociationName":           settings.DefaultAssociationName,
		"skipRoles":                        settings.SkipRoles,
		"activeRoles":                      settings.ActiveRoles,
		"defaultRole":                      settings.DefaultRole,
		"autoAcceptProposal":               settings.AutoAcceptProposal,
		"requireQualifiedEidasCertificate": settings.RequireQualifiedEidasCertificate,
		// Topology flag — gates the registry-admin features in the UI.
		"prConfigured": prConfigured,
		// Public-onboarding gate + the enabled flows (with resolved themes).
		// When the gate is off the flows list is empty by construction and the
		// landing page redirects anonymous visitors to login.
		"publicOnboardingEnabled": settings.PublicOnboardingEnabled,
		"onboardingFlows":         publicFlowViews(settings),
	})
}

// UpdateSettings godoc
// @Summary      Update settings
// @Description  Creates or updates onboarding settings.
// @Tags         settings
// @Accept       json
// @Produce      json
// @Param        payload  body      models.Settings  true  "Settings payload"
// @Success      200      {object}  map[string]string
// @Failure      400      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /settings [put]
func (h *HandlerSettings) UpdateSettings(c *fiber.Ctx) error {
	// Pointer fields give merge semantics: only fields present in the request
	// body are updated. This lets the Theme tab save just `theme` without wiping
	// description/registrarId/etc, and vice-versa for the General tab.
	var input struct {
		Description         *string `json:"description"`
		RegistrarId         *string `json:"registrarId"`
		DataspaceId         *string `json:"dataspaceId"`
		PrefillAuthRegistry *bool   `json:"prefillAuthRegistry"`
		AuthRegistryId      *string `json:"authRegistryId"`
		AuthRegistryName    *string `json:"authRegistryName"`
		AuthRegistryUrl     *string `json:"authRegistryUrl"`
		// Agreements are intentionally NOT handled here — they are managed through
		// the dedicated /settings/agreements endpoints (which validate files,
		// fetch URLs and redact/encrypt credentials). Ignoring any `agreements`
		// field in this generic update prevents clobbering them.
		Theme       json.RawMessage `json:"theme"`
		Themes      json.RawMessage `json:"themes"`
		ActiveTheme *string         `json:"activeTheme"`

		// Non-secret satellite connection overrides (credentials stay env-only).
		SatelliteBaseUrl            *string `json:"satelliteBaseUrl"`
		SatelliteIss                *string `json:"satelliteIss"`
		SatelliteAud                *string `json:"satelliteAud"`
		SatelliteVersion            *string `json:"satelliteVersion"`
		SatelliteEpCreationEndpoint *string `json:"satelliteEpCreationEndpoint"`
		SatellitePartiesEndpoint    *string `json:"satellitePartiesEndpoint"`
		SatelliteTokenEndpoint      *string `json:"satelliteTokenEndpoint"`
		SatelliteTokenScope         *string `json:"satelliteTokenScope"`
		DataspaceTitle              *string `json:"dataspaceTitle"`
		VcIssuerBaseUrl             *string `json:"vcIssuerBaseUrl"`
		PrApiBaseUrl                *string `json:"prApiBaseUrl"`

		// Onboarding-flow configuration.
		PublicOnboardingEnabled          *bool           `json:"publicOnboardingEnabled"`
		OnboardingFlows                  json.RawMessage `json:"onboardingFlows"`
		DefaultAssociationName           *string         `json:"defaultAssociationName"`
		SkipRoles                        *string         `json:"skipRoles"`
		ActiveRoles                      *string         `json:"activeRoles"`
		DefaultRole                      *string         `json:"defaultRole"`
		AutoAcceptProposal               *string         `json:"autoAcceptProposal"`
		RequireQualifiedEidasCertificate *bool           `json:"requireQualifiedEidasCertificate"`
	}

	if err := c.BodyParser(&input); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid input")
	}

	var settings models.Settings
	creating := h.Server.DB.First(&settings).Error != nil

	if input.Description != nil {
		settings.Description = *input.Description
	}
	if input.RegistrarId != nil {
		settings.RegistrarId = *input.RegistrarId
	}
	if input.DataspaceId != nil {
		settings.DataspaceId = *input.DataspaceId
	}
	if input.PrefillAuthRegistry != nil {
		settings.PrefillAuthRegistry = *input.PrefillAuthRegistry
	}
	if input.AuthRegistryId != nil {
		settings.AuthRegistryId = strings.TrimSpace(*input.AuthRegistryId)
	}
	if input.AuthRegistryName != nil {
		settings.AuthRegistryName = strings.TrimSpace(*input.AuthRegistryName)
	}
	if input.AuthRegistryUrl != nil {
		settings.AuthRegistryUrl = strings.TrimSpace(*input.AuthRegistryUrl)
	}
	if len(input.Theme) > 0 {
		settings.Theme = datatypes.JSON(input.Theme)
	}
	if len(input.Themes) > 0 {
		// The theme editor rebuilds entries from its own state, which does not
		// carry the branding assets (headerImagePath/faviconPath are written by
		// the dedicated upload endpoints). Merge them back in by theme name so
		// saving the editor never orphans uploaded assets.
		settings.Themes = mergeThemeAssets(settings.Themes, datatypes.JSON(input.Themes))
	}
	if input.ActiveTheme != nil {
		settings.ActiveTheme = *input.ActiveTheme
	}
	if input.PublicOnboardingEnabled != nil {
		settings.PublicOnboardingEnabled = *input.PublicOnboardingEnabled
	}
	if len(input.OnboardingFlows) > 0 {
		var flows []models.OnboardingFlow
		if err := json.Unmarshal(input.OnboardingFlows, &flows); err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "onboardingFlows must be an array of flow objects")
		}
		if err := validateFlows(flows); err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, err.Error())
		}
		settings.OnboardingFlows = datatypes.JSON(input.OnboardingFlows)
	}
	if input.SatelliteBaseUrl != nil {
		settings.SatelliteBaseUrl = strings.TrimSpace(*input.SatelliteBaseUrl)
	}
	if input.SatelliteIss != nil {
		settings.SatelliteIss = strings.TrimSpace(*input.SatelliteIss)
	}
	if input.SatelliteAud != nil {
		settings.SatelliteAud = strings.TrimSpace(*input.SatelliteAud)
	}
	if input.SatelliteVersion != nil {
		settings.SatelliteVersion = strings.TrimSpace(*input.SatelliteVersion)
	}
	if input.SatelliteEpCreationEndpoint != nil {
		settings.SatelliteEpCreationEndpoint = strings.TrimSpace(*input.SatelliteEpCreationEndpoint)
	}
	if input.SatellitePartiesEndpoint != nil {
		settings.SatellitePartiesEndpoint = strings.TrimSpace(*input.SatellitePartiesEndpoint)
	}
	if input.SatelliteTokenEndpoint != nil {
		settings.SatelliteTokenEndpoint = strings.TrimSpace(*input.SatelliteTokenEndpoint)
	}
	if input.SatelliteTokenScope != nil {
		settings.SatelliteTokenScope = strings.TrimSpace(*input.SatelliteTokenScope)
	}
	if input.DataspaceTitle != nil {
		settings.DataspaceTitle = strings.TrimSpace(*input.DataspaceTitle)
	}
	if input.VcIssuerBaseUrl != nil {
		settings.VcIssuerBaseUrl = strings.TrimSpace(*input.VcIssuerBaseUrl)
	}
	if input.PrApiBaseUrl != nil {
		settings.PrApiBaseUrl = strings.TrimSpace(*input.PrApiBaseUrl)
	}
	if input.DefaultAssociationName != nil {
		settings.DefaultAssociationName = strings.TrimSpace(*input.DefaultAssociationName)
	}
	if input.SkipRoles != nil {
		settings.SkipRoles = strings.TrimSpace(*input.SkipRoles)
	}
	if input.ActiveRoles != nil {
		settings.ActiveRoles = strings.TrimSpace(*input.ActiveRoles)
	}
	if input.DefaultRole != nil {
		settings.DefaultRole = strings.TrimSpace(*input.DefaultRole)
	}
	if input.AutoAcceptProposal != nil {
		settings.AutoAcceptProposal = strings.TrimSpace(*input.AutoAcceptProposal)
	}
	if input.RequireQualifiedEidasCertificate != nil {
		settings.RequireQualifiedEidasCertificate = *input.RequireQualifiedEidasCertificate
	}

	if creating {
		if err := h.Server.DB.Create(&settings).Error; err != nil {
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save settings")
		}
	} else {
		if err := h.Server.DB.Save(&settings).Error; err != nil {
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to update settings")
		}
	}

	// Apply the non-secret satellite overrides onto the shared runtime config so
	// they take effect immediately for satellite calls (no restart required).
	h.Config.OverlaySatelliteSettings(&settings)

	return responses.MessageResponse(c, fiber.StatusOK, "Settings updated successfully")
}

// UploadLogo godoc
// @Summary      Upload or update logo
// @Description  Accepts a logo file (png, jpg, jpeg, svg) and stores it. Replaces existing logo if present.
// @Tags         settings
// @Accept       mpfd
// @Produce      json
// @Param        logo  formData  file  true  "Logo file (png, jpg, jpeg, svg)"
// @Success      200   {object}  map[string]string
// @Failure      400   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /settings/uploadLogo [post]
func (h *HandlerSettings) UploadLogo(c *fiber.Ctx) error {
	// Get the uploaded file
	file, err := c.FormFile("logo")
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Logo file is required")
	}

	// Validate file extension
	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowedExtensions := map[string]bool{
		".png":  true,
		".jpg":  true,
		".jpeg": true,
		".svg":  true,
	}

	if !allowedExtensions[ext] {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid file type. Only png, jpg, jpeg, svg are allowed")
	}

	// Validate file size (max 5MB)
	maxSize := int64(5 * 1024 * 1024) // 5MB
	if file.Size > maxSize {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "File size exceeds 5MB limit")
	}

	// Ensure uploads directory exists
	uploadDir := "./uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Printf("Failed to ensure uploads dir: %v", err)
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create upload directory")
	}

	// Get or create settings record
	var settings models.Settings
	result := h.Server.DB.First(&settings)

	// Delete old logo file if it exists
	if result.Error == nil && settings.LogoPath != "" {
		if err := os.Remove(settings.LogoPath); err != nil {
			log.Printf("Failed to remove old logo file: %v", err)
			// Continue anyway - not critical
		}
	}

	// Generate unique filename with timestamp
	timestamp := time.Now().Format("20060102150405") // YYYYMMDDhhmmss format
	logoPath := fmt.Sprintf("%s/%s_logo%s", uploadDir, timestamp, ext)

	// Save the file
	if err := c.SaveFile(file, logoPath); err != nil {
		log.Printf("Failed to save logo file: %v", err)
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save logo file")
	}

	// Update or create settings with new logo path
	if result.Error != nil {
		// Create new settings if none exist
		settings = models.Settings{
			LogoPath: logoPath,
		}
		if err := h.Server.DB.Create(&settings).Error; err != nil {
			// Rollback: delete the uploaded file
			if removeErr := os.Remove(logoPath); removeErr != nil {
				log.Printf("Failed to remove logo file during rollback: %v", removeErr)
			}
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save settings")
		}
	} else {
		// Update existing settings
		settings.LogoPath = logoPath
		if err := h.Server.DB.Save(&settings).Error; err != nil {
			// Rollback: delete the uploaded file
			if removeErr := os.Remove(logoPath); removeErr != nil {
				log.Printf("Failed to remove logo file during rollback: %v", removeErr)
			}
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to update settings")
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":  "Logo uploaded successfully",
		"logoPath": logoPath,
	})
}

// GetLogo godoc
// @Summary      Get logo file
// @Description  Returns the uploaded logo file
// @Tags         settings
// @Produce      image/png,image/jpeg,image/svg+xml
// @Success      200  {file}  file
// @Failure      404  {object}  map[string]string
// @Router       /settings/logo [get]
func (h *HandlerSettings) GetLogo(c *fiber.Ctx) error {
	var settings models.Settings
	result := h.Server.DB.First(&settings)

	if result.Error != nil || settings.LogoPath == "" {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Logo not found")
	}

	// Check if file exists
	if _, err := os.Stat(settings.LogoPath); os.IsNotExist(err) {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Logo file not found")
	}

	// Serve the file with proper content type
	return c.SendFile(settings.LogoPath)
}

// UploadFavicon godoc
// @Summary      Upload or update the favicon
// @Description  Accepts a favicon file (ico, png, svg) and stores it. Replaces existing favicon if present.
// @Tags         settings
// @Accept       mpfd
// @Produce      json
// @Param        favicon  formData  file  true  "Favicon file (ico, png, svg)"
// @Success      200   {object}  map[string]string
// @Failure      400   {object}  map[string]string
// @Failure      500   {object}  map[string]string
// @Router       /settings/favicon [post]
func (h *HandlerSettings) UploadFavicon(c *fiber.Ctx) error {
	file, err := c.FormFile("favicon")
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Favicon file is required")
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	allowedExtensions := map[string]bool{
		".ico": true,
		".png": true,
		".svg": true,
	}
	if !allowedExtensions[ext] {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid file type. Only ico, png, svg are allowed")
	}

	// Favicons are tiny; cap at 1MB.
	if file.Size > int64(1*1024*1024) {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "File size exceeds 1MB limit")
	}

	uploadDir := "./uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Printf("Failed to ensure uploads dir: %v", err)
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create upload directory")
	}

	var settings models.Settings
	result := h.Server.DB.First(&settings)

	// Delete old favicon file if it exists
	if result.Error == nil && settings.FaviconPath != "" {
		if err := os.Remove(settings.FaviconPath); err != nil {
			log.Printf("Failed to remove old favicon file: %v", err)
		}
	}

	timestamp := time.Now().Format("20060102150405")
	faviconPath := fmt.Sprintf("%s/%s_favicon%s", uploadDir, timestamp, ext)

	if err := c.SaveFile(file, faviconPath); err != nil {
		log.Printf("Failed to save favicon file: %v", err)
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save favicon file")
	}

	if result.Error != nil {
		settings = models.Settings{FaviconPath: faviconPath}
		if err := h.Server.DB.Create(&settings).Error; err != nil {
			if removeErr := os.Remove(faviconPath); removeErr != nil {
				log.Printf("Failed to remove favicon file during rollback: %v", removeErr)
			}
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save settings")
		}
	} else {
		settings.FaviconPath = faviconPath
		if err := h.Server.DB.Save(&settings).Error; err != nil {
			if removeErr := os.Remove(faviconPath); removeErr != nil {
				log.Printf("Failed to remove favicon file during rollback: %v", removeErr)
			}
			return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to update settings")
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"message":     "Favicon uploaded successfully",
		"faviconPath": faviconPath,
	})
}

// GetFavicon godoc
// @Summary      Get favicon file
// @Description  Returns the uploaded favicon file
// @Tags         settings
// @Produce      image/x-icon,image/png,image/svg+xml
// @Success      200  {file}  file
// @Failure      404  {object}  map[string]string
// @Router       /settings/favicon [get]
func (h *HandlerSettings) GetFavicon(c *fiber.Ctx) error {
	var settings models.Settings
	result := h.Server.DB.First(&settings)

	if result.Error != nil || settings.FaviconPath == "" {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Favicon not found")
	}

	if _, err := os.Stat(settings.FaviconPath); os.IsNotExist(err) {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Favicon file not found")
	}

	return c.SendFile(settings.FaviconPath)
}
