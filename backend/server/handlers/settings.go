package handlers

import (
	"onboardingportal/config"
	"onboardingportal/models"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
	"os"
	"log"
	"fmt"
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
			"description": "",
			"registrarId": os.Getenv("SATELLITE_ISS"),
			"dataspaceId": "",
			"agreements":  []string{},
			"logoPath":    "",
		})
	}

	return c.JSON(settings)
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
	var input struct {
		Description string   `json:"description"`
		RegistrarId string   `json:"registrarId"`
		DataspaceId string   `json:"dataspaceId"`
		Agreements  []string `json:"agreements"`
	}

	if err := c.BodyParser(&input); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid input")
	}

	var settings models.Settings
	result := h.Server.DB.First(&settings)

	if result.Error != nil {
		// Create new settings if none exist
		settings = models.Settings{
			Description: input.Description,
			RegistrarId: input.RegistrarId,
			DataspaceId: input.DataspaceId,
			Agreements:  datatypes.JSONSlice[string](input.Agreements),
		}
		h.Server.DB.Create(&settings)
	} else {
		// Update existing settings
		settings.Description = input.Description
		settings.RegistrarId = input.RegistrarId
		settings.DataspaceId = input.DataspaceId
		settings.Agreements = datatypes.JSONSlice[string](input.Agreements)
		h.Server.DB.Save(&settings)
	}

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
