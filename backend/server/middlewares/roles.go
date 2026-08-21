package middlewares

import (
	"github.com/gofiber/fiber/v2"
)

// Satellite RBAC roles, reused verbatim from the participant-registry stack
// (PR-MW authz.go). They are Keycloak CLIENT roles of the frontend client (in
// resource_access.<FrontendClientID>.roles), NOT realm roles. SchemeOwner is
// intentionally NOT used by this satellite portal (scheme-governance lives in the
// separate, private SchemeOwner UI) — but it is listed in the rank map because a
// SchemeOwner out-ranks a SatelliteAdmin and must therefore still pass any
// SatelliteAdmin-gated route.
const (
	RoleSchemeOwner    = "SchemeOwner"
	RoleSatelliteAdmin = "SatelliteAdmin"
	RolePartyAdmin     = "PartyAdmin"
	RoleUser           = "User"
)

// FrontendClientID is the Keycloak client whose roles carry the satellite RBAC.
// Both the portal and the PR-UI use client "frontend", so one assignment governs
// both. Overridable if a deployment renames the client.
var FrontendClientID = "frontend"

// roleRank mirrors PR-MW's precedence (higher satisfies lower). Unknown roles rank 0.
var roleRank = map[string]int{
	RoleSchemeOwner:    4,
	RoleSatelliteAdmin: 3,
	RolePartyAdmin:     2,
	RoleUser:           1,
}

// clientRoles returns the caller's roles on the frontend client.
func clientRoles(claims *KeycloakClaims) []string {
	if claims == nil {
		return nil
	}
	if ra, ok := claims.ResourceAccess[FrontendClientID]; ok {
		return ra.Roles
	}
	return nil
}

// HasRoleAtLeast reports whether the caller holds a frontend client role whose
// rank is >= the required role's rank (so SchemeOwner satisfies SatelliteAdmin).
func HasRoleAtLeast(claims *KeycloakClaims, required string) bool {
	want := roleRank[required]
	if want == 0 {
		return false
	}
	for _, r := range clientRoles(claims) {
		if roleRank[r] >= want {
			return true
		}
	}
	return false
}

// RequireClientRoleAtLeast enforces a minimum frontend client role (rank-aware).
func RequireClientRoleAtLeast(required string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("claims").(*KeycloakClaims)
		if !ok || claims == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing auth claims"})
		}
		if HasRoleAtLeast(claims, required) {
			return c.Next()
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	}
}

// RequireAdminRole gates the portal's operator surface. It now requires the
// SatelliteAdmin frontend client role (SchemeOwner also passes, by rank) — the
// satellite RBAC, replacing the former onboarding-admin realm role. The name is
// kept so the ~53 call sites are unchanged.
func RequireAdminRole() fiber.Handler {
	return RequireClientRoleAtLeast(RoleSatelliteAdmin)
}

// RequireRealmRole enforces a Keycloak realm role (retained for any non-satellite
// realm-role needs; the satellite RBAC uses the client-role helpers above).
func RequireRealmRole(role string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		claims, ok := c.Locals("claims").(*KeycloakClaims)
		if !ok || claims == nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "missing auth claims"})
		}
		for _, r := range claims.RealmAccess.Roles {
			if r == role {
				return c.Next()
			}
		}
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "forbidden"})
	}
}
