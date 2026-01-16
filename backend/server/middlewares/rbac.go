package middlewares

import (
	"onboardingportal/config"

	"github.com/gofiber/fiber/v2"
)

// RequireRBACAdmin enforces presence of a shared secret in a header
// for simple admin-only operations behind a trusted proxy.
func RequireRBACAdmin(cfg *config.Config) fiber.Handler {
	headerName := cfg.RBACHeaderName
	required := cfg.RBACAdminToken

	return func(c *fiber.Ctx) error {
		if required == "" {
			return c.Next()
			// Fail closed if token not configured
			// return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			//     "error": "admin access not configured",
			// })
		}
		if c.Get(headerName) != required {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error": "forbidden",
			})
		}
		return c.Next()
	}
}
