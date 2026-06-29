package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"onboardingportal/integrations/keycloak"
	"onboardingportal/responses"

	"github.com/gofiber/fiber/v2"
)

// Keycloak user administration (list/create/delete) for the admin Users page,
// served through the BFF. Previously the page called the Keycloak Admin REST API
// directly from the browser, which forced the public edge to expose
// /admin/realms/* and required every portal admin to also hold realm-management
// roles. Routing it here lets the edge keep the admin API private (the backend
// authenticates with its own admin credentials) and gates access purely on the
// onboarding-admin realm role, like every other admin route.

const onboardingAdminRole = "onboarding-admin"

// usersListCap bounds the single-page user fetch. The portal's operator base is
// small; raise this (or add pagination) if a realm ever exceeds it.
const usersListCap = 1000

// userView is the projection the admin Users page consumes. It doubles as the
// decode target for Keycloak user representations (extra fields are ignored).
type userView struct {
	ID               string   `json:"id"`
	Username         string   `json:"username"`
	Email            string   `json:"email"`
	FirstName        string   `json:"firstName"`
	LastName         string   `json:"lastName"`
	Enabled          bool     `json:"enabled"`
	CreatedTimestamp int64    `json:"createdTimestamp"`
	Roles            []string `json:"roles"`
}

// ListUsers godoc
// @Summary List realm users, flagging which hold the onboarding-admin role
// @Router  /users [get]
func (h *HandlerKeycloak) ListUsers(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}

	status, body, err := admin.Do(http.MethodGet, fmt.Sprintf("/users?first=0&max=%d", usersListCap), nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusOK {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, keycloak.ExtractError(status, body))
	}
	var raw []userView
	if err := json.Unmarshal(body, &raw); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to parse Keycloak response")
	}

	// Resolve admin membership with one extra call (the role's members) instead of
	// one role-mapping lookup per user.
	adminIDs := h.adminRoleMembers(admin)

	users := make([]userView, 0, len(raw))
	for _, u := range raw {
		u.Roles = []string{}
		if adminIDs[u.ID] {
			u.Roles = append(u.Roles, onboardingAdminRole)
		}
		users = append(users, u)
	}
	return c.JSON(fiber.Map{"users": users})
}

// adminRoleMembers returns the set of user ids holding the onboarding-admin realm
// role. A failure here is non-fatal — the list still renders, just without the
// admin badge — so it returns an empty set rather than an error.
func (h *HandlerKeycloak) adminRoleMembers(admin *keycloak.AdminClient) map[string]bool {
	ids := map[string]bool{}
	status, body, err := admin.Do(http.MethodGet, fmt.Sprintf("/roles/%s/users?max=%d", escapeSegment(onboardingAdminRole), usersListCap), nil)
	if err != nil || status != http.StatusOK {
		return ids
	}
	var members []userView
	if json.Unmarshal(body, &members) != nil {
		return ids
	}
	for _, m := range members {
		ids[m.ID] = true
	}
	return ids
}

// CreateUser godoc
// @Summary Create a realm user (optionally onboarding-admin) and email a set-password link
// @Router  /users [post]
func (h *HandlerKeycloak) CreateUser(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}

	var input struct {
		Email     string `json:"email"`
		FirstName string `json:"firstName"`
		LastName  string `json:"lastName"`
		Role      string `json:"role"` // "user" (default) or "admin"
	}
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid user payload")
	}
	email := strings.TrimSpace(input.Email)
	firstName := strings.TrimSpace(input.FirstName)
	lastName := strings.TrimSpace(input.LastName)
	if email == "" || firstName == "" || lastName == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "email, firstName and lastName are required")
	}

	requiredActions := []string{"VERIFY_EMAIL", "UPDATE_PASSWORD"}
	newUser := map[string]any{
		"username":        email, // the realm is registrationEmailAsUsername
		"email":           email,
		"firstName":       firstName,
		"lastName":        lastName,
		"enabled":         true,
		"emailVerified":   false,
		"requiredActions": requiredActions,
	}
	status, body, err := admin.Do(http.MethodPost, "/users", newUser)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status == http.StatusConflict {
		return responses.ErrorResponse(c, fiber.StatusConflict, "A user with that email already exists")
	}
	if status != http.StatusCreated && status != http.StatusNoContent {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}

	// admin.Do doesn't surface the Location header, so resolve the new id by username.
	userID, err := h.findUserIDByUsername(admin, email)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if userID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "User created but could not be located")
	}

	if strings.EqualFold(input.Role, "admin") {
		if err := h.assignRealmRole(admin, userID, onboardingAdminRole); err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadGateway, "User created but role assignment failed: "+err.Error())
		}
	}

	// Email the new user a verify-email + set-password link that returns them to the portal.
	q := url.Values{}
	if h.Config.KeycloakClientID != "" {
		q.Set("client_id", h.Config.KeycloakClientID)
	}
	if h.Config.FrontendDomain != "" {
		q.Set("redirect_uri", h.Config.FrontendDomain+"/register")
	}
	invitePath := "/users/" + escapeSegment(userID) + "/execute-actions-email"
	if enc := q.Encode(); enc != "" {
		invitePath += "?" + enc
	}
	istatus, ibody, err := admin.Do(http.MethodPut, invitePath, requiredActions)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if istatus != http.StatusNoContent && istatus != http.StatusOK {
		// The account exists; only the invitation email failed — surface that distinctly.
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "User created, but the invitation email failed: "+keycloak.ExtractError(istatus, ibody))
	}
	return responses.MessageResponse(c, fiber.StatusCreated, "User created and invitation email sent")
}

// DeleteUser godoc
// @Summary Delete a realm user
// @Router  /users/{id} [delete]
func (h *HandlerKeycloak) DeleteUser(c *fiber.Ctx) error {
	userID := strings.TrimSpace(c.Params("id"))
	if userID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "User id is required")
	}
	// Guard against an admin deleting their own account and locking themselves out.
	if claims := currentClaims(c); claims != nil && strings.TrimSpace(claims.Subject) == userID {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "You cannot delete your own account")
	}

	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	status, body, err := admin.Do(http.MethodDelete, "/users/"+escapeSegment(userID), nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}
	return responses.MessageResponse(c, fiber.StatusOK, "User deleted")
}

// findUserIDByUsername returns the id of the user whose username exactly matches,
// or "" if none. Used to recover the new id after a create (the admin API returns
// it only in a Location header, which the thin client doesn't expose).
func (h *HandlerKeycloak) findUserIDByUsername(admin *keycloak.AdminClient, username string) (string, error) {
	status, body, err := admin.Do(http.MethodGet, "/users?exact=true&username="+url.QueryEscape(username), nil)
	if err != nil {
		return "", err
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("%s", keycloak.ExtractError(status, body))
	}
	var found []userView
	if err := json.Unmarshal(body, &found); err != nil {
		return "", err
	}
	if len(found) == 0 {
		return "", nil
	}
	return found[0].ID, nil
}

// assignRealmRole grants a realm role to a user (the role-mappings POST needs the
// role's id + name, so it looks the role up first).
func (h *HandlerKeycloak) assignRealmRole(admin *keycloak.AdminClient, userID, roleName string) error {
	status, body, err := admin.Do(http.MethodGet, "/roles/"+escapeSegment(roleName), nil)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("%s", keycloak.ExtractError(status, body))
	}
	role := map[string]any{}
	if err := json.Unmarshal(body, &role); err != nil {
		return err
	}
	payload := []map[string]any{{"id": role["id"], "name": role["name"]}}
	status, body, err = admin.Do(http.MethodPost, "/users/"+escapeSegment(userID)+"/role-mappings/realm", payload)
	if err != nil {
		return err
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return fmt.Errorf("%s", keycloak.ExtractError(status, body))
	}
	return nil
}
