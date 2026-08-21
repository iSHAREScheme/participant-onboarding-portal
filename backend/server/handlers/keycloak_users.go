package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"onboardingportal/integrations/keycloak"
	"onboardingportal/responses"
	"onboardingportal/server/middlewares"

	"github.com/gofiber/fiber/v2"
)

// Keycloak user administration (list/create/delete) for the admin Users page,
// served through the BFF. Previously the page called the Keycloak Admin REST API
// directly from the browser, which forced the public edge to expose
// /admin/realms/* and required every portal admin to also hold realm-management
// roles. Routing it here lets the edge keep the admin API private (the backend
// authenticates with its own admin credentials) and gates access purely on the
// onboarding-admin realm role, like every other admin route.

// createRoles are the frontend client roles the Users admin screen can assign and
// display, in DESCENDING privilege order — the order also drives the list badge
// (highest held role first).
var createRoles = []string{
	middlewares.RoleSatelliteAdmin,
	middlewares.RolePartyAdmin,
	middlewares.RoleUser,
}

// normalizeCreateRole maps a create-user role input to a canonical frontend client
// role. It accepts the client-role names and the legacy "admin"/"user" values, and
// defaults an empty value to the least-privilege User role.
func normalizeCreateRole(s string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "user":
		return middlewares.RoleUser, true
	case "partyadmin":
		return middlewares.RolePartyAdmin, true
	case "satelliteadmin", "admin":
		return middlewares.RoleSatelliteAdmin, true
	default:
		return "", false
	}
}

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

	// Resolve each user's frontend client roles from the roles' member lists
	// (one call per role) instead of a role-mapping lookup per user.
	membership := h.frontendRoleMembership(admin)

	users := make([]userView, 0, len(raw))
	for _, u := range raw {
		if roles := membership[u.ID]; roles != nil {
			u.Roles = roles
		} else {
			u.Roles = []string{}
		}
		users = append(users, u)
	}
	return c.JSON(fiber.Map{"users": users})
}

// frontendRoleMembership returns userID -> the createRoles that user holds, in
// descending-privilege order (createRoles order). A per-role lookup failure is
// non-fatal — that role is just omitted — so the list still renders.
func (h *HandlerKeycloak) frontendRoleMembership(admin *keycloak.AdminClient) map[string][]string {
	out := map[string][]string{}
	clientUUID, err := frontendClientUUID(admin)
	if err != nil {
		return out
	}
	for _, role := range createRoles {
		status, body, err := admin.Do(http.MethodGet, fmt.Sprintf("/clients/%s/roles/%s/users?max=%d", escapeSegment(clientUUID), escapeSegment(role), usersListCap), nil)
		if err != nil || status != http.StatusOK {
			continue
		}
		var members []userView
		if json.Unmarshal(body, &members) != nil {
			continue
		}
		for _, m := range members {
			out[m.ID] = append(out[m.ID], role)
		}
	}
	return out
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
		Role      string `json:"role"` // SatelliteAdmin | PartyAdmin | User (default User)
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
	// Validate the role BEFORE creating the user, so a bad value doesn't leave an
	// orphaned account with no role.
	role, ok := normalizeCreateRole(input.Role)
	if !ok {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "role must be one of SatelliteAdmin, PartyAdmin or User")
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

	if err := h.assignClientRole(admin, userID, role); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "User created but role assignment failed: "+err.Error())
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
// frontendClientUUID resolves the internal id of the "frontend" Keycloak client,
// whose client roles carry the satellite RBAC.
func frontendClientUUID(admin *keycloak.AdminClient) (string, error) {
	status, body, err := admin.Do(http.MethodGet, "/clients?clientId="+escapeSegment(middlewares.FrontendClientID), nil)
	if err != nil {
		return "", err
	}
	if status != http.StatusOK {
		return "", fmt.Errorf("%s", keycloak.ExtractError(status, body))
	}
	var clients []map[string]any
	if err := json.Unmarshal(body, &clients); err != nil {
		return "", err
	}
	if len(clients) == 0 {
		return "", fmt.Errorf("keycloak client %q not found", middlewares.FrontendClientID)
	}
	id, _ := clients[0]["id"].(string)
	if id == "" {
		return "", fmt.Errorf("keycloak client %q has no id", middlewares.FrontendClientID)
	}
	return id, nil
}

// assignClientRole grants a frontend client role to a user (the client
// role-mappings POST needs the full role representation, so fetch it first).
// setUserPartyID records the party a user belongs to as the "partyId" user
// attribute. A realm protocol mapper surfaces it as the partyId token claim that
// PR-MW's authorizePartyScope reads, so a PartyAdmin is scoped to this party.
// GET-merge-PUT so other attributes are preserved.
func (h *HandlerKeycloak) setUserPartyID(admin *keycloak.AdminClient, userID, partyID string) error {
	status, body, err := admin.Do(http.MethodGet, "/users/"+escapeSegment(userID), nil)
	if err != nil {
		return err
	}
	if status != http.StatusOK {
		return fmt.Errorf("%s", keycloak.ExtractError(status, body))
	}
	var user map[string]any
	if err := json.Unmarshal(body, &user); err != nil {
		return err
	}
	attrs, _ := user["attributes"].(map[string]any)
	if attrs == nil {
		attrs = map[string]any{}
	}
	attrs["partyId"] = []string{partyID}
	user["attributes"] = attrs
	status, body, err = admin.Do(http.MethodPut, "/users/"+escapeSegment(userID), user)
	if err != nil {
		return err
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return fmt.Errorf("%s", keycloak.ExtractError(status, body))
	}
	return nil
}

func (h *HandlerKeycloak) assignClientRole(admin *keycloak.AdminClient, userID, roleName string) error {
	clientUUID, err := frontendClientUUID(admin)
	if err != nil {
		return err
	}
	status, body, err := admin.Do(http.MethodGet, "/clients/"+escapeSegment(clientUUID)+"/roles/"+escapeSegment(roleName), nil)
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
	status, body, err = admin.Do(http.MethodPost, "/users/"+escapeSegment(userID)+"/role-mappings/clients/"+escapeSegment(clientUUID), payload)
	if err != nil {
		return err
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return fmt.Errorf("%s", keycloak.ExtractError(status, body))
	}
	return nil
}
