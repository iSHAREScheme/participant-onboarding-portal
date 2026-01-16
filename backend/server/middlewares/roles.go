package middlewares

import (
	"github.com/gofiber/fiber/v2"
)

// RequireRealmRole enforces a Keycloak realm role on the authenticated user.
func RequireRealmRole(role string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		rawClaims := c.Locals("claims")
		claims, ok := rawClaims.(*KeycloakClaims)
		if !ok || claims == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "missing auth claims",
			})
		}

		for _, r := range claims.RealmAccess.Roles {
			if r == role {
				return c.Next()
			}
		}

		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "forbidden",
		})
	}
}

// RequireAdminRole enforces the onboarding admin realm role.
func RequireAdminRole() fiber.Handler {
	return RequireRealmRole("onboarding-admin")
}
