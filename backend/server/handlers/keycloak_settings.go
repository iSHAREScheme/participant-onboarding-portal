package handlers

import (
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"onboardingportal/config"
	"onboardingportal/integrations/keycloak"
	"onboardingportal/responses"
	s "onboardingportal/server"

	"github.com/gofiber/fiber/v2"
)

// HandlerKeycloak exposes the realm's identity-provider and SMTP configuration
// (which live in Keycloak, not this app's DB) to the admin Settings UI via the
// Keycloak Admin API. Every route is admin-gated; secrets (IdP client secrets,
// SMTP password) are redacted on read and preserved on update when left blank.
type HandlerKeycloak struct {
	Server *s.Server
	Config *config.Config
}

func NewHandlerKeycloak(server *s.Server, config *config.Config) *HandlerKeycloak {
	return &HandlerKeycloak{Server: server, Config: config}
}

func (h *HandlerKeycloak) admin() (*keycloak.AdminClient, error) {
	return keycloak.NewAdminClient(
		h.Config.KeycloakBaseURL,
		h.Config.KeycloakRealm,
		h.Config.KeycloakAdminUsername,
		h.Config.KeycloakAdminPassword,
	)
}

// isSecretIdpConfigKey reports whether an IdP config entry holds a credential
// that must never be returned to the browser.
func isSecretIdpConfigKey(key string) bool {
	l := strings.ToLower(key)
	return strings.Contains(l, "secret") ||
		strings.Contains(l, "password") ||
		strings.Contains(l, "privatekey") ||
		l == "bindcredential"
}

// redactIdp blanks secret config values in place and returns the list of secret
// keys that actually had a value, so the UI can show "set — leave blank to keep".
func redactIdp(rep map[string]any) {
	secretFields := []string{}
	if cfg, ok := rep["config"].(map[string]any); ok {
		for k, v := range cfg {
			if isSecretIdpConfigKey(k) {
				if sv, _ := v.(string); strings.TrimSpace(sv) != "" {
					secretFields = append(secretFields, k)
				}
				cfg[k] = ""
			}
		}
	}
	rep["secretFields"] = secretFields
}

// --- Identity providers --------------------------------------------------

// ListIdps godoc
// @Summary List the realm's configured identity providers (secrets redacted)
// @Router  /settings/idps [get]
func (h *HandlerKeycloak) ListIdps(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	status, body, err := admin.Do(http.MethodGet, "/identity-provider/instances", nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusOK {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, keycloak.ExtractError(status, body))
	}
	var list []map[string]any
	if err := json.Unmarshal(body, &list); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to parse Keycloak response")
	}
	for i := range list {
		redactIdp(list[i])
	}
	return c.JSON(fiber.Map{"idps": list})
}

// GetIdp godoc
// @Summary Get one identity provider by alias (secrets redacted)
// @Router  /settings/idps/{alias} [get]
func (h *HandlerKeycloak) GetIdp(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	alias := strings.TrimSpace(c.Params("alias"))
	rep, status, body, err := h.fetchIdp(admin, alias)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status == http.StatusNotFound {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Identity provider not found")
	}
	if status != http.StatusOK {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, keycloak.ExtractError(status, body))
	}
	redactIdp(rep)
	return c.JSON(fiber.Map{"idp": rep})
}

// fetchIdp returns the raw (unredacted) IdP representation for an alias.
func (h *HandlerKeycloak) fetchIdp(admin *keycloak.AdminClient, alias string) (map[string]any, int, []byte, error) {
	status, body, err := admin.Do(http.MethodGet, "/identity-provider/instances/"+escapeSegment(alias), nil)
	if err != nil {
		return nil, 0, nil, err
	}
	if status != http.StatusOK {
		return nil, status, body, nil
	}
	rep := map[string]any{}
	if err := json.Unmarshal(body, &rep); err != nil {
		return nil, status, body, err
	}
	return rep, status, body, nil
}

// CreateIdp godoc
// @Summary Create a new identity provider
// @Router  /settings/idps [post]
func (h *HandlerKeycloak) CreateIdp(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	rep := map[string]any{}
	if err := json.Unmarshal(c.Body(), &rep); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid identity provider payload")
	}
	delete(rep, "secretFields") // UI-only hint, not a Keycloak field
	if strings.TrimSpace(toStr(rep["alias"])) == "" || strings.TrimSpace(toStr(rep["providerId"])) == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "alias and providerId are required")
	}
	status, body, err := admin.Do(http.MethodPost, "/identity-provider/instances", rep)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusCreated && status != http.StatusNoContent {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}
	return responses.MessageResponse(c, fiber.StatusCreated, "Identity provider created")
}

// UpdateIdp godoc
// @Summary Update an identity provider (blank secrets keep the stored value)
// @Router  /settings/idps/{alias} [put]
func (h *HandlerKeycloak) UpdateIdp(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	alias := strings.TrimSpace(c.Params("alias"))

	current, status, body, err := h.fetchIdp(admin, alias)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status == http.StatusNotFound {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Identity provider not found")
	}
	if status != http.StatusOK {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, keycloak.ExtractError(status, body))
	}

	incoming := map[string]any{}
	if err := json.Unmarshal(c.Body(), &incoming); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid identity provider payload")
	}
	delete(incoming, "secretFields")

	// Overlay the submitted fields onto the stored representation so we never
	// drop Keycloak fields the UI doesn't manage. Config is merged separately so
	// blank secret values fall back to what's already stored.
	incomingConfig, _ := incoming["config"].(map[string]any)
	delete(incoming, "config")
	for k, v := range incoming {
		current[k] = v
	}
	current["alias"] = alias // the path is authoritative

	curConfig, _ := current["config"].(map[string]any)
	if curConfig == nil {
		curConfig = map[string]any{}
	}
	for k, v := range incomingConfig {
		if isSecretIdpConfigKey(k) {
			if sv, _ := v.(string); strings.TrimSpace(sv) == "" {
				continue // keep the stored secret
			}
		}
		curConfig[k] = v
	}
	current["config"] = curConfig

	status, body, err = admin.Do(http.MethodPut, "/identity-provider/instances/"+escapeSegment(alias), current)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}
	return responses.MessageResponse(c, fiber.StatusOK, "Identity provider updated")
}

// DeleteIdp godoc
// @Summary Delete an identity provider
// @Router  /settings/idps/{alias} [delete]
func (h *HandlerKeycloak) DeleteIdp(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	alias := strings.TrimSpace(c.Params("alias"))
	status, body, err := admin.Do(http.MethodDelete, "/identity-provider/instances/"+escapeSegment(alias), nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}
	return responses.MessageResponse(c, fiber.StatusOK, "Identity provider deleted")
}

// --- Identity-provider claim mappers -------------------------------------

// ListIdpMappers returns the per-IdP claim mappers in a simplified shape
// (id, name, the source claim, and the target Keycloak user attribute).
func (h *HandlerKeycloak) ListIdpMappers(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	alias := strings.TrimSpace(c.Params("alias"))
	status, body, err := admin.Do(http.MethodGet, "/identity-provider/instances/"+escapeSegment(alias)+"/mappers", nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusOK {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, keycloak.ExtractError(status, body))
	}
	var raw []map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to parse Keycloak response")
	}
	out := make([]map[string]any, 0, len(raw))
	for _, m := range raw {
		cfg, _ := m["config"].(map[string]any)
		claim := ""
		attr := ""
		if cfg != nil {
			claim = toStr(cfg["claim"])
			if claim == "" {
				claim = toStr(cfg["attribute.name"]) // SAML
			}
			if claim == "" {
				claim = toStr(cfg["attribute.friendly.name"])
			}
			attr = toStr(cfg["user.attribute"])
		}
		out = append(out, map[string]any{
			"id":            toStr(m["id"]),
			"name":          toStr(m["name"]),
			"claim":         claim,
			"userAttribute": attr,
			"type":          toStr(m["identityProviderMapper"]),
		})
	}
	return c.JSON(fiber.Map{"mappers": out})
}

// CreateIdpMapper adds a "map external claim -> user attribute" mapper. The right
// Keycloak mapper type is chosen from the IdP's protocol (SAML vs OIDC/social),
// so callers only supply the claim and the target attribute.
func (h *HandlerKeycloak) CreateIdpMapper(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	alias := strings.TrimSpace(c.Params("alias"))

	var input struct {
		Name          string `json:"name"`
		Claim         string `json:"claim"`
		UserAttribute string `json:"userAttribute"`
	}
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid mapper payload")
	}
	claim := strings.TrimSpace(input.Claim)
	attr := strings.TrimSpace(input.UserAttribute)
	if claim == "" || attr == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Both the source claim and the target user attribute are required")
	}

	// Look up the IdP's protocol to choose the matching mapper type.
	idp, status, body, err := h.fetchIdp(admin, alias)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status == http.StatusNotFound {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Identity provider not found")
	}
	if status != http.StatusOK {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, keycloak.ExtractError(status, body))
	}

	mapperType := "oidc-user-attribute-idp-mapper"
	config := map[string]any{"syncMode": "INHERIT", "user.attribute": attr, "claim": claim}
	if strings.EqualFold(toStr(idp["providerId"]), "saml") {
		mapperType = "saml-user-attribute-idp-mapper"
		config = map[string]any{"syncMode": "INHERIT", "user.attribute": attr, "attribute.name": claim}
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		name = attr
	}
	mapper := map[string]any{
		"name":                   name,
		"identityProviderAlias":  alias,
		"identityProviderMapper": mapperType,
		"config":                 config,
	}

	status, body, err = admin.Do(http.MethodPost, "/identity-provider/instances/"+escapeSegment(alias)+"/mappers", mapper)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusCreated && status != http.StatusNoContent {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}
	return responses.MessageResponse(c, fiber.StatusCreated, "Claim mapping added")
}

// DeleteIdpMapper removes a claim mapper from an IdP.
func (h *HandlerKeycloak) DeleteIdpMapper(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	alias := strings.TrimSpace(c.Params("alias"))
	id := strings.TrimSpace(c.Params("id"))
	status, body, err := admin.Do(http.MethodDelete, "/identity-provider/instances/"+escapeSegment(alias)+"/mappers/"+escapeSegment(id), nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}
	return responses.MessageResponse(c, fiber.StatusOK, "Claim mapping removed")
}

// --- SMTP (realm.smtpServer) ---------------------------------------------

// fetchRealm returns the full realm representation (needed because SMTP is a
// field on it and Keycloak's PUT replaces the realm, so we round-trip it).
func (h *HandlerKeycloak) fetchRealm(admin *keycloak.AdminClient) (map[string]any, error) {
	status, body, err := admin.Do(http.MethodGet, "", nil)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, errFromKeycloak(status, body)
	}
	realm := map[string]any{}
	if err := json.Unmarshal(body, &realm); err != nil {
		return nil, err
	}
	return realm, nil
}

// GetSmtp godoc
// @Summary Get the realm SMTP settings (password redacted)
// @Router  /settings/smtp [get]
func (h *HandlerKeycloak) GetSmtp(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	realm, err := h.fetchRealm(admin)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	smtp, _ := realm["smtpServer"].(map[string]any)
	if smtp == nil {
		smtp = map[string]any{}
	}
	passwordSet := strings.TrimSpace(toStr(smtp["password"])) != ""
	delete(smtp, "password")
	return c.JSON(fiber.Map{"smtp": smtp, "passwordSet": passwordSet})
}

// UpdateSmtp godoc
// @Summary Update the realm SMTP settings (blank password keeps the stored one)
// @Router  /settings/smtp [put]
func (h *HandlerKeycloak) UpdateSmtp(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	incoming := map[string]any{}
	if err := json.Unmarshal(c.Body(), &incoming); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid SMTP payload")
	}

	realm, err := h.fetchRealm(admin)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	current, _ := realm["smtpServer"].(map[string]any)
	realm["smtpServer"] = mergeSmtp(current, incoming)

	status, body, err := admin.Do(http.MethodPut, "", realm)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}
	return responses.MessageResponse(c, fiber.StatusOK, "SMTP settings updated")
}

// TestSmtp godoc
// @Summary Send a test email using the submitted SMTP settings
// @Router  /settings/smtp/test [post]
func (h *HandlerKeycloak) TestSmtp(c *fiber.Ctx) error {
	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}
	incoming := map[string]any{}
	if err := json.Unmarshal(c.Body(), &incoming); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid SMTP payload")
	}
	to := strings.TrimSpace(toStr(incoming["to"]))
	if to == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "A recipient email address is required for the test")
	}
	delete(incoming, "to")

	// A blank password means "use the one already stored", so the admin can test
	// without re-typing it — pull the stored realm SMTP settings to fill it in.
	realm, err := h.fetchRealm(admin)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	current, _ := realm["smtpServer"].(map[string]any)
	settings := mergeSmtp(current, incoming)

	// Keycloak masks the stored SMTP password on read ("**********"), so it can't
	// be replayed as a real credential. When auth is on and we don't have a usable
	// password (blank, or the mask), ask the admin to re-enter it for the test —
	// otherwise the server rejects the login with a confusing 535.
	if toStr(settings["auth"]) == "true" {
		pw := strings.TrimSpace(toStr(settings["password"]))
		if pw == "" || pw == "**********" {
			return responses.ErrorResponse(c, fiber.StatusBadRequest,
				"Enter the SMTP password in the form to run a test — the saved password can't be read back for security.")
		}
	}

	log.Printf("smtp: test attempt to=%s host=%s:%s user=%q passwordLen=%d masked=%v ssl=%s starttls=%s auth=%s",
		to, toStr(settings["host"]), toStr(settings["port"]), toStr(settings["user"]),
		len(toStr(settings["password"])), toStr(settings["password"]) == "**********",
		toStr(settings["ssl"]), toStr(settings["starttls"]), toStr(settings["auth"]))

	// Send a real message to the chosen recipient with the configured server.
	// (Keycloak's own test only mails the admin user; sending here verifies
	// delivery to an address the admin actually controls.)
	if err := sendTestEmail(settings, to); err != nil {
		log.Printf("smtp: test send to %s via %s:%s (ssl=%s starttls=%s auth=%s) failed: %v",
			to, toStr(settings["host"]), toStr(settings["port"]),
			toStr(settings["ssl"]), toStr(settings["starttls"]), toStr(settings["auth"]), err)
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "SMTP test failed: "+err.Error())
	}
	return responses.MessageResponse(c, fiber.StatusOK, "Test email sent to "+to)
}

// sendTestEmail sends a short plaintext message to `to` using the given Keycloak
// smtpServer settings. It mirrors Keycloak's connection logic: implicit TLS when
// ssl=true, STARTTLS when starttls=true, optional PLAIN auth otherwise.
func sendTestEmail(s map[string]any, to string) error {
	host := strings.TrimSpace(toStr(s["host"]))
	port := strings.TrimSpace(toStr(s["port"]))
	if host == "" || port == "" {
		return fmt.Errorf("host and port are required")
	}
	from := strings.TrimSpace(toStr(s["from"]))
	if from == "" {
		from = "no-reply@" + host
	}
	addr := net.JoinHostPort(host, port)
	msg := []byte("From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: iSHARE onboarding portal — SMTP test\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" +
		"This is a test message from the iSHARE onboarding portal. " +
		"If you received it, the SMTP settings are working.\r\n")

	dialer := &net.Dialer{Timeout: 15 * time.Second}
	var client *smtp.Client
	if toStr(s["ssl"]) == "true" {
		conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: host})
		if err != nil {
			return fmt.Errorf("TLS connection failed: %w", err)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("SMTP handshake failed: %w", err)
		}
	} else {
		conn, err := dialer.Dial("tcp", addr)
		if err != nil {
			return fmt.Errorf("connection failed: %w", err)
		}
		client, err = smtp.NewClient(conn, host)
		if err != nil {
			return fmt.Errorf("SMTP handshake failed: %w", err)
		}
		// Upgrade to TLS whenever the server advertises STARTTLS (or it was asked
		// for). Without this, net/smtp's PLAIN auth refuses to run over a plaintext
		// connection — the usual cause of an SMTP test failing despite correct
		// credentials (e.g. port 587 with the StartTLS box left unchecked).
		if ok, _ := client.Extension("STARTTLS"); ok || toStr(s["starttls"]) == "true" {
			if err := client.StartTLS(&tls.Config{ServerName: host}); err != nil {
				return fmt.Errorf("STARTTLS failed: %w", err)
			}
		}
	}
	defer client.Close()

	if toStr(s["auth"]) == "true" {
		auth := smtp.PlainAuth("", toStr(s["user"]), toStr(s["password"]), host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("authentication failed: %w", err)
		}
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("sender rejected: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("recipient rejected: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// mergeSmtp builds the smtpServer map to persist: the submitted values, but with
// a blank password replaced by the currently-stored one (so the secret is never
// wiped just because the form didn't re-send it).
func mergeSmtp(current, incoming map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range incoming {
		out[k] = v
	}
	if strings.TrimSpace(toStr(out["password"])) == "" {
		if current != nil {
			if p, ok := current["password"]; ok {
				out["password"] = p
			} else {
				delete(out, "password")
			}
		} else {
			delete(out, "password")
		}
	}
	return out
}

// --- Current user's own profile -----------------------------------------

// UpdateMyProfile lets the authenticated user change their own email / name.
// The Keycloak user id is taken from the token subject — never from input — so a
// caller can only ever modify their own account (no IDOR). It goes through the
// admin API because the browser-side Account API isn't reachable cross-origin
// here (it returns 401 for the frontend client's token).
func (h *HandlerKeycloak) UpdateMyProfile(c *fiber.Ctx) error {
	claims := currentClaims(c)
	if claims == nil {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, "Missing authentication claims")
	}
	userID := strings.TrimSpace(claims.Subject)
	if userID == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Token has no subject")
	}

	var input struct {
		Email     *string `json:"email"`
		FirstName *string `json:"firstName"`
		LastName  *string `json:"lastName"`
	}
	if err := json.Unmarshal(c.Body(), &input); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid profile payload")
	}

	admin, err := h.admin()
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusServiceUnavailable, err.Error())
	}

	// Fetch the current user representation and overlay only the changed fields,
	// so attributes we don't manage are preserved on the PUT.
	status, body, err := admin.Do(http.MethodGet, "/users/"+escapeSegment(userID), nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusOK {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, keycloak.ExtractError(status, body))
	}
	user := map[string]any{}
	if err := json.Unmarshal(body, &user); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to parse Keycloak user")
	}
	if input.Email != nil {
		user["email"] = strings.TrimSpace(*input.Email)
	}
	if input.FirstName != nil {
		user["firstName"] = strings.TrimSpace(*input.FirstName)
	}
	if input.LastName != nil {
		user["lastName"] = strings.TrimSpace(*input.LastName)
	}

	status, body, err = admin.Do(http.MethodPut, "/users/"+escapeSegment(userID), user)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, err.Error())
	}
	if status != http.StatusNoContent && status != http.StatusOK {
		return responses.ErrorResponse(c, status, keycloak.ExtractError(status, body))
	}
	return responses.MessageResponse(c, fiber.StatusOK, "Profile updated")
}

func toStr(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func escapeSegment(s string) string {
	// Aliases are simple slugs, but guard against a stray slash breaking the path.
	return strings.ReplaceAll(s, "/", "%2F")
}

func errFromKeycloak(status int, body []byte) error {
	return fiber.NewError(http.StatusBadGateway, keycloak.ExtractError(status, body))
}
