package server

import (
	"fmt"
	"log"
	"strings"
	"time"

	"onboardingportal/config"
	"onboardingportal/db"
	"onboardingportal/server/middlewares"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
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

	// CORS. Browsers reach this API through the same-origin Next proxy, so the
	// backend does not need to answer cross-origin browser requests in normal
	// operation. Restrict the allow-list to the origins configured in
	// CORS_ALLOWED_ORIGINS (comma-separated); when unset, no CORS headers are
	// emitted, so the browser same-origin policy blocks cross-origin reads.
	// Credentials stay disabled — auth is a bearer token, never a cookie.
	if origins := strings.TrimSpace(config.CorsAllowedOrigins); origins != "" {
		app.Use(cors.New(cors.Config{
			AllowOrigins:     origins,
			AllowMethods:     "GET,POST,PUT,PATCH,DELETE,OPTIONS",
			AllowHeaders:     "Origin,Content-Type,Accept,Authorization,X-User-Token",
			AllowCredentials: false,
		}))
	}

	app.Use(middlewares.Logger())

	authCfg := middlewares.BuildOIDCConfigFromEnv()
	if config.OIDCDisable {
		// OIDC_DISABLE makes EVERY endpoint anonymous — only ever acceptable for
		// local development. Refuse to start unless DEV=true is also set, so a
		// production deployment can't silently come up with all authentication
		// turned off via a single stray env var (fail closed).
		if !config.Dev {
			return nil, fmt.Errorf("refusing to start: OIDC_DISABLE=true turns off ALL authentication and is only permitted in development — set DEV=true to acknowledge, or remove OIDC_DISABLE in production")
		}
		log.Println("WARNING: OIDC_DISABLE=true — authentication is OFF for every endpoint. Development only; never run this in production.")
	} else {
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

	// Rate limiting — a DoS / abuse / enumeration backstop. Mounted after auth so
	// authenticated requests can be keyed by the caller's stable Keycloak subject:
	// browsers reach this service through the Next proxy, so keying purely on IP
	// would collapse every user onto the proxy's single address. Unauthenticated
	// (public-allowlisted) requests fall back to the client IP, taken from the
	// proxy-forwarded X-Forwarded-For when present. The container healthcheck is
	// never throttled. The default store is in-memory, which suits the single
	// backend instance this app runs.
	app.Use(limiter.New(limiter.Config{
		Max:               300,
		Expiration:        1 * time.Minute,
		LimiterMiddleware: limiter.SlidingWindow{},
		Next: func(c *fiber.Ctx) bool {
			return c.Path() == "/healthcheck"
		},
		KeyGenerator: func(c *fiber.Ctx) string {
			if claims, ok := c.Locals("claims").(*middlewares.KeycloakClaims); ok && claims != nil {
				if sub := strings.TrimSpace(claims.Subject); sub != "" {
					return "sub:" + sub
				}
			}
			return "ip:" + clientIP(c)
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error": "Too many requests, please slow down and try again shortly.",
			})
		},
	}))

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

// clientIP returns the originating client IP for rate-limiting. Browser traffic
// reaches this service through the Next proxy, which forwards the real client IP
// in X-Forwarded-For; use its first entry so visitors aren't all keyed as the
// proxy. Falls back to the direct connection IP for non-proxied requests.
func clientIP(c *fiber.Ctx) string {
	if xff := strings.TrimSpace(c.Get(fiber.HeaderXForwardedFor)); xff != "" {
		if i := strings.IndexByte(xff, ','); i >= 0 {
			return strings.TrimSpace(xff[:i])
		}
		return xff
	}
	return c.IP()
}
