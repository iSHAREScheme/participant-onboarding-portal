package server

import (
	"fmt"
	"onboardingportal/config"
	"onboardingportal/db"
	"onboardingportal/server/middlewares"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"gorm.io/gorm"
)

type Server struct {
	App    *fiber.App
	Config *config.Config
	DB     *gorm.DB
}

func NewServer(config *config.Config) (*Server, error) {
	// Fiber's default request body limit is 4MB, which silently stalls/blocks
	// larger multipart uploads (e.g. two signed-agreement PDFs, logos, or
	// certificates). Raise it so those uploads complete.
	app := fiber.New(fiber.Config{
		BodyLimit: 50 * 1024 * 1024, // 50 MB
	})

	// Enable CORS
	app.Use(cors.New())

	app.Use(middlewares.Logger())

	authCfg := middlewares.BuildOIDCConfigFromEnv()
	if !config.OIDCDisable {
		if authCfg.Issuer == "" || authCfg.Audience == "" || authCfg.JWKSURL == "" {
			return nil, fmt.Errorf("OIDC is required; set OIDC_ISSUER, OIDC_AUDIENCE, OIDC_JWKS_URL or set OIDC_DISABLE=true")
		}
		authMiddleware, err := middlewares.Auth(authCfg)
		if err != nil {
			return nil, err
		}

		// JWT authentication middleware (healthcheck stays public)
		app.Use(authMiddleware)
	}

	db, err := db.Init(config)
	if err != nil {
		return nil, err
	}

	return &Server{
		App:    app,
		Config: config,
		DB:     db,
	}, nil
}

func (server *Server) Listen() {
	server.App.Listen(":" + server.Config.ServerPort)
}
