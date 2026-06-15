package handlers

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"onboardingportal/config"
	"onboardingportal/models"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"onboardingportal/utils"

	"github.com/gofiber/fiber/v2"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// maxAgreementBytes caps how much an upstream URL may return (defensive against
// memory exhaustion); agreement PDFs are small.
const maxAgreementBytes = 25 << 20 // 25 MB

// agreementDocTTL is how long a successfully fetched URL document is cached, so
// public downloads don't trigger a credentialed upstream fetch on every hit.
const agreementDocTTL = 5 * time.Minute

// HandlerAgreements manages the onboarding agreement documents stored in
// Settings.Agreements. Reads (list + document download) are public so the
// onboarding flow can present and serve them; mutations are admin-only (wired in
// the routes). Protected-URL credentials are encrypted at rest and redacted on
// read — they never leave the backend.
type HandlerAgreements struct {
	Server *s.Server
	Config *config.Config

	// Short-TTL cache of fetched URL-agreement documents, keyed by agreement id.
	docCacheMu sync.Mutex
	docCache   map[string]cachedDoc
}

// cachedDoc is a validated PDF held in memory until exp.
type cachedDoc struct {
	data []byte
	exp  time.Time
}

func NewHandlerAgreements(server *s.Server, config *config.Config) *HandlerAgreements {
	return &HandlerAgreements{
		Server:   server,
		Config:   config,
		docCache: map[string]cachedDoc{},
	}
}

// Built-in agreement identifiers + bundled file paths (relative to the backend
// working dir; copied into the image at /app/resources). Versions are fixed to
// the published iSHARE document dates.
const (
	builtinTermsID     = "builtin-terms-of-use"
	builtinAccessionID = "builtin-accession-agreement"
	builtinVersion     = "05-03-2025"
)

func builtinAgreements() []models.Agreement {
	return []models.Agreement{
		{
			ID:       builtinTermsID,
			Title:    "Terms of Use",
			Version:  builtinVersion,
			Source:   "builtin",
			Type:     "frameworkAgreement",
			FilePath: "resources/agreements/terms-of-use.pdf",
		},
		{
			ID:       builtinAccessionID,
			Title:    "Accession Agreement for Adhering Parties",
			Version:  builtinVersion,
			Source:   "builtin",
			Type:     "dataspaceAgreement",
			FilePath: "resources/agreements/accession-agreement.pdf",
		},
	}
}

// effectiveAgreementType resolves an agreement's claim type, inferring a sensible
// default for legacy entries that predate the Type field (the known built-ins by
// id, else the mandatory frameworkAgreement).
func effectiveAgreementType(a models.Agreement) string {
	if t := strings.TrimSpace(a.Type); t != "" {
		return t
	}
	switch a.ID {
	case builtinAccessionID:
		return "dataspaceAgreement"
	case builtinTermsID:
		return "frameworkAgreement"
	default:
		return "frameworkAgreement"
	}
}

// agreementDocumentHash returns the SHA-256 hex of an agreement's on-disk
// document (built-in or uploaded). URL-sourced documents return ok=false so the
// caller can fall back to the signed/consent hash rather than fetch at
// completion time.
func agreementDocumentHash(a models.Agreement) (string, bool) {
	if a.Source != "builtin" && a.Source != "file" {
		return "", false
	}
	if strings.TrimSpace(a.FilePath) == "" {
		return "", false
	}
	data, err := os.ReadFile(a.FilePath)
	if err != nil {
		return "", false
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), true
}

// findAgreementByType returns the first configured agreement of the given claim
// type (resolving legacy/empty types), or nil.
func findAgreementByType(list []models.Agreement, claimType string) *models.Agreement {
	for i := range list {
		if effectiveAgreementType(list[i]) == claimType {
			return &list[i]
		}
	}
	return nil
}

// SeedBuiltinAgreements seeds the bundled iSHARE agreements exactly once, gated by
// Settings.AgreementsInitialized so that an admin who removes a built-in does not
// see it reappear after a restart. Called from main at startup.
func SeedBuiltinAgreements(db *gorm.DB) error {
	var settings models.Settings
	err := db.First(&settings).Error
	if err != nil {
		// No settings row yet — create one carrying just the built-ins.
		raw, mErr := json.Marshal(builtinAgreements())
		if mErr != nil {
			return mErr
		}
		settings = models.Settings{
			Agreements:            datatypes.JSON(raw),
			AgreementsInitialized: true,
		}
		return db.Create(&settings).Error
	}
	if settings.AgreementsInitialized {
		return nil
	}
	// Prepend the built-ins to whatever was migrated from the legacy list.
	merged := append(builtinAgreements(), decodeAgreements(settings.Agreements)...)
	raw, mErr := json.Marshal(merged)
	if mErr != nil {
		return mErr
	}
	settings.Agreements = datatypes.JSON(raw)
	settings.AgreementsInitialized = true
	return db.Save(&settings).Error
}

// decodeAgreements parses the stored agreements JSON, tolerating the legacy
// []string shape (free-text entries) by converting each into an Agreement: a
// URL-looking value becomes a `url` source, anything else a label-only entry.
func decodeAgreements(raw datatypes.JSON) []models.Agreement {
	if len(raw) == 0 {
		return nil
	}
	var list []models.Agreement
	if err := json.Unmarshal(raw, &list); err == nil {
		return list
	}
	var legacy []string
	if err := json.Unmarshal(raw, &legacy); err == nil {
		out := make([]models.Agreement, 0, len(legacy))
		for _, v := range legacy {
			v = strings.TrimSpace(v)
			if v == "" {
				continue
			}
			a := models.Agreement{ID: newAgreementID(), Title: v}
			if strings.HasPrefix(v, "http://") || strings.HasPrefix(v, "https://") {
				a.Source = "url"
				a.URL = v
			} else {
				a.Source = "label"
			}
			out = append(out, a)
		}
		return out
	}
	return nil
}

// newAgreementID returns a short, unique, opaque id for a new agreement entry.
func newAgreementID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		// rand failure is effectively impossible; fall back to a time-based id.
		return fmt.Sprintf("agr_%d", time.Now().UnixNano())
	}
	return "agr_" + hex.EncodeToString(b)
}

// loadAgreements reads the settings row (or a zero value when none exists) and
// returns the decoded agreement list plus whether a row already exists.
func (h *HandlerAgreements) loadAgreements() (models.Settings, []models.Agreement, bool) {
	var settings models.Settings
	exists := h.Server.DB.First(&settings).Error == nil
	return settings, decodeAgreements(settings.Agreements), exists
}

// persistAgreements writes the agreement list back onto the settings row,
// creating the row when it does not exist yet.
func (h *HandlerAgreements) persistAgreements(settings *models.Settings, list []models.Agreement, exists bool) error {
	raw, err := json.Marshal(list)
	if err != nil {
		return err
	}
	settings.Agreements = datatypes.JSON(raw)
	settings.AgreementsInitialized = true
	if exists {
		return h.Server.DB.Save(settings).Error
	}
	return h.Server.DB.Create(settings).Error
}

// ---------------------------------------------------------------------------
// Redacted views (secrets are never serialised to the client)
// ---------------------------------------------------------------------------

type agreementHeaderView struct {
	Name     string `json:"name"`
	Value    string `json:"value,omitempty"` // only for non-secret headers
	Secret   bool   `json:"secret"`
	ValueSet bool   `json:"valueSet"` // a secret value is stored
}

type agreementAuthView struct {
	Method          string                `json:"method"`
	Username        string                `json:"username,omitempty"`
	PasswordSet     bool                  `json:"passwordSet"`
	HeaderName      string                `json:"headerName,omitempty"`
	Scheme          string                `json:"scheme,omitempty"`
	TokenSet        bool                  `json:"tokenSet"`
	TokenURL        string                `json:"tokenUrl,omitempty"`
	ClientID        string                `json:"clientId,omitempty"`
	ClientSecretSet bool                  `json:"clientSecretSet"`
	Scope           string                `json:"scope,omitempty"`
	Headers         []agreementHeaderView `json:"headers,omitempty"`
}

type agreementView struct {
	ID          string             `json:"id"`
	Title       string             `json:"title"`
	Version     string             `json:"version"`
	Source      string             `json:"source"`
	Type        string             `json:"type"`
	Removable   bool               `json:"removable"`
	HasDocument bool               `json:"hasDocument"`
	URL         string             `json:"url,omitempty"`
	Auth        *agreementAuthView `json:"auth,omitempty"`
}

func viewAgreement(a models.Agreement) agreementView {
	v := agreementView{
		ID:        a.ID,
		Title:     a.Title,
		Version:   a.Version,
		Source:    a.Source,
		Type:      effectiveAgreementType(a),
		Removable: true, // every entry, including built-ins, can be removed
		URL:       a.URL,
	}
	switch a.Source {
	case "url":
		v.HasDocument = strings.TrimSpace(a.URL) != ""
	case "builtin", "file":
		v.HasDocument = strings.TrimSpace(a.FilePath) != ""
	}
	if a.Auth != nil {
		av := &agreementAuthView{
			Method:          a.Auth.Method,
			Username:        a.Auth.Username,
			PasswordSet:     a.Auth.Password != "",
			HeaderName:      a.Auth.HeaderName,
			Scheme:          a.Auth.Scheme,
			TokenSet:        a.Auth.Token != "",
			TokenURL:        a.Auth.TokenURL,
			ClientID:        a.Auth.ClientID,
			ClientSecretSet: a.Auth.ClientSecret != "",
			Scope:           a.Auth.Scope,
		}
		for _, hdr := range a.Auth.Headers {
			hv := agreementHeaderView{Name: hdr.Name, Secret: hdr.Secret}
			if hdr.Secret {
				hv.ValueSet = hdr.Value != ""
			} else {
				hv.Value = hdr.Value
			}
			av.Headers = append(av.Headers, hv)
		}
		v.Auth = av
	}
	return v
}

func viewAgreements(list []models.Agreement) []agreementView {
	out := make([]agreementView, 0, len(list))
	for _, a := range list {
		out = append(out, viewAgreement(a))
	}
	return out
}

// ListAgreements returns all configured agreements with secrets redacted.
// Public: the onboarding flow needs the list of documents to sign.
func (h *HandlerAgreements) ListAgreements(c *fiber.Ctx) error {
	_, list, _ := h.loadAgreements()
	return c.JSON(fiber.Map{"agreements": viewAgreements(list)})
}

// UploadAgreementFile stores an admin-uploaded PDF and appends a `file`
// agreement. Multipart fields: file (required PDF), title (required), version.
func (h *HandlerAgreements) UploadAgreementFile(c *fiber.Ctx) error {
	file, err := c.FormFile("file")
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Agreement file is required")
	}
	if strings.ToLower(filepath.Ext(file.Filename)) != ".pdf" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Only PDF files are accepted for agreements")
	}
	if file.Size > int64(20*1024*1024) { // 20MB, matches the onboarding upload cap
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "File size exceeds 20MB limit")
	}
	// Verify the content really is a PDF (not just a .pdf-named file), so the
	// publicly-served document can't be HTML/script masquerading as a PDF.
	if !uploadedFileIsPDF(file) {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "The uploaded file is not a valid PDF")
	}
	title := strings.TrimSpace(c.FormValue("title"))
	if title == "" {
		title = strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename))
	}
	version := strings.TrimSpace(c.FormValue("version"))

	uploadDir := "./uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		log.Printf("Failed to ensure uploads dir: %v", err)
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create upload directory")
	}
	timestamp := time.Now().Format("20060102150405")
	storedPath := fmt.Sprintf("%s/%s_agreement.pdf", uploadDir, timestamp)
	if err := c.SaveFile(file, storedPath); err != nil {
		log.Printf("Failed to save agreement file: %v", err)
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save agreement file")
	}

	settings, list, exists := h.loadAgreements()
	list = append(list, models.Agreement{
		ID:       newAgreementID(),
		Title:    title,
		Version:  version,
		Source:   "file",
		Type:     normalizeAgreementType(c.FormValue("type")),
		FilePath: storedPath,
	})
	if err := h.persistAgreements(&settings, list, exists); err != nil {
		_ = os.Remove(storedPath) // rollback the orphaned file
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save agreement")
	}
	return c.JSON(fiber.Map{"agreement": viewAgreement(list[len(list)-1])})
}

// agreementURLInput is the JSON body for adding/updating a URL agreement.
type agreementURLInput struct {
	Title   string                `json:"title"`
	Version string                `json:"version"`
	Type    string                `json:"type"`
	URL     string                `json:"url"`
	Auth    *models.AgreementAuth `json:"auth"`
}

// normalizeAgreementType validates an incoming type, defaulting unknown/empty to
// the mandatory frameworkAgreement.
func normalizeAgreementType(t string) string {
	switch strings.TrimSpace(t) {
	case "frameworkAgreement", "dataspaceAgreement", "TermsOfUse", "AccessionAgreement":
		return strings.TrimSpace(t)
	default:
		return "frameworkAgreement"
	}
}

// AddAgreementURL appends a `url` agreement, encrypting any provided credentials.
func (h *HandlerAgreements) AddAgreementURL(c *fiber.Ctx) error {
	var input agreementURLInput
	if err := c.BodyParser(&input); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid input")
	}
	input.Title = strings.TrimSpace(input.Title)
	input.URL = strings.TrimSpace(input.URL)
	if input.Title == "" || input.URL == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Title and URL are required")
	}
	if !strings.HasPrefix(input.URL, "http://") && !strings.HasPrefix(input.URL, "https://") {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "URL must start with http:// or https://")
	}
	auth, err := h.prepareAuthForStore(input.Auth, nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, err.Error())
	}

	settings, list, exists := h.loadAgreements()
	list = append(list, models.Agreement{
		ID:      newAgreementID(),
		Title:   input.Title,
		Version: strings.TrimSpace(input.Version),
		Source:  "url",
		Type:    normalizeAgreementType(input.Type),
		URL:     input.URL,
		Auth:    auth,
	})
	if err := h.persistAgreements(&settings, list, exists); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to save agreement")
	}
	return c.JSON(fiber.Map{"agreement": viewAgreement(list[len(list)-1])})
}

// UpdateAgreement edits an existing entry's metadata and (for URL sources) its
// location and auth. Secret fields left blank keep their stored value.
func (h *HandlerAgreements) UpdateAgreement(c *fiber.Ctx) error {
	id := c.Params("id")
	var input agreementURLInput
	if err := c.BodyParser(&input); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid input")
	}

	settings, list, exists := h.loadAgreements()
	if !exists {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Agreement not found")
	}
	idx := -1
	for i := range list {
		if list[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Agreement not found")
	}

	if t := strings.TrimSpace(input.Title); t != "" {
		list[idx].Title = t
	}
	list[idx].Version = strings.TrimSpace(input.Version)
	if strings.TrimSpace(input.Type) != "" {
		list[idx].Type = normalizeAgreementType(input.Type)
	}
	if list[idx].Source == "url" {
		if u := strings.TrimSpace(input.URL); u != "" {
			if !strings.HasPrefix(u, "http://") && !strings.HasPrefix(u, "https://") {
				return responses.ErrorResponse(c, fiber.StatusBadRequest, "URL must start with http:// or https://")
			}
			list[idx].URL = u
		}
		auth, err := h.prepareAuthForStore(input.Auth, list[idx].Auth)
		if err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, err.Error())
		}
		list[idx].Auth = auth
	}

	if err := h.persistAgreements(&settings, list, exists); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to update agreement")
	}
	h.invalidateAgreementDoc(id) // drop any stale cached copy
	return c.JSON(fiber.Map{"agreement": viewAgreement(list[idx])})
}

// DeleteAgreement removes an entry. An admin-uploaded file is deleted from disk;
// bundled built-in assets are left in place (only the entry is removed).
func (h *HandlerAgreements) DeleteAgreement(c *fiber.Ctx) error {
	id := c.Params("id")
	settings, list, exists := h.loadAgreements()
	if !exists {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Agreement not found")
	}
	idx := -1
	for i := range list {
		if list[i].ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Agreement not found")
	}
	removed := list[idx]
	list = append(list[:idx], list[idx+1:]...)
	if err := h.persistAgreements(&settings, list, exists); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to delete agreement")
	}
	if removed.Source == "file" && removed.FilePath != "" {
		if err := os.Remove(removed.FilePath); err != nil && !os.IsNotExist(err) {
			log.Printf("Failed to remove agreement file %s: %v", removed.FilePath, err)
		}
	}
	h.invalidateAgreementDoc(id) // drop any cached copy
	return responses.MessageResponse(c, fiber.StatusOK, "Agreement removed")
}

// DownloadAgreementDocument serves an agreement's PDF. Built-in/file sources are
// streamed from disk; URL sources are fetched live with the configured auth
// (credentials decrypted just-in-time, server-side) and streamed to the client.
// Public so onboarding applicants can read the documents they must sign.
func (h *HandlerAgreements) DownloadAgreementDocument(c *fiber.Ctx) error {
	id := c.Params("id")
	_, list, _ := h.loadAgreements()
	var found *models.Agreement
	for i := range list {
		if list[i].ID == id {
			found = &list[i]
			break
		}
	}
	if found == nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "Agreement not found")
	}

	switch found.Source {
	case "builtin", "file":
		if found.FilePath == "" {
			return responses.ErrorResponse(c, fiber.StatusNotFound, "Agreement document not found")
		}
		if _, err := os.Stat(found.FilePath); os.IsNotExist(err) {
			return responses.ErrorResponse(c, fiber.StatusNotFound, "Agreement document not found")
		}
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", agreementFilename(found)))
		return c.SendFile(found.FilePath)
	case "url":
		// Serve a fresh-enough cached copy when available; otherwise fetch live
		// (SSRF-guarded + PDF-validated) and cache the result.
		if data, ok := h.cachedAgreementDoc(found.ID); ok {
			return serveAgreementPDF(c, found, data)
		}
		data, err := h.fetchAgreementURL(found)
		if err != nil {
			log.Printf("Failed to fetch agreement URL (%s): %v", found.ID, err)
			return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to fetch the agreement document")
		}
		h.storeAgreementDoc(found.ID, data)
		return serveAgreementPDF(c, found, data)
	default:
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "This agreement has no downloadable document")
	}
}

// agreementFilename derives a friendly download filename from the title.
func agreementFilename(a *models.Agreement) string {
	name := strings.TrimSpace(a.Title)
	if name == "" {
		name = "agreement"
	}
	name = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			return r
		case r == ' ' || r == '-' || r == '_':
			return '-'
		default:
			return -1
		}
	}, name)
	return name + ".pdf"
}

// ---------------------------------------------------------------------------
// Secret handling + authenticated fetch
// ---------------------------------------------------------------------------

// prepareAuthForStore validates an incoming auth config and returns a copy with
// secrets encrypted. A blank secret keeps the matching value from `existing`
// (used on update so the UI need not re-send credentials). Returns nil for the
// "none" method. Errors when a secret must be encrypted but no master key is set.
func (h *HandlerAgreements) prepareAuthForStore(incoming, existing *models.AgreementAuth) (*models.AgreementAuth, error) {
	if incoming == nil || incoming.Method == "" || strings.EqualFold(incoming.Method, "none") {
		return nil, nil
	}
	keepOrEncrypt := func(incomingVal, existingEnc string) (string, error) {
		if incomingVal == "" {
			return existingEnc, nil // keep what was stored (possibly empty)
		}
		return utils.EncryptSecret(h.Config.AgreementAuthKey, incomingVal)
	}

	out := &models.AgreementAuth{
		Method:     strings.ToLower(strings.TrimSpace(incoming.Method)),
		Username:   strings.TrimSpace(incoming.Username),
		HeaderName: strings.TrimSpace(incoming.HeaderName),
		Scheme:     strings.TrimSpace(incoming.Scheme),
		TokenURL:   strings.TrimSpace(incoming.TokenURL),
		ClientID:   strings.TrimSpace(incoming.ClientID),
		Scope:      strings.TrimSpace(incoming.Scope),
	}

	var existPwd, existTok, existSecret string
	if existing != nil {
		existPwd, existTok, existSecret = existing.Password, existing.Token, existing.ClientSecret
	}

	var err error
	switch out.Method {
	case "basic":
		if out.Password, err = keepOrEncrypt(incoming.Password, existPwd); err != nil {
			return nil, secretKeyError(err)
		}
	case "bearer":
		if out.Token, err = keepOrEncrypt(incoming.Token, existTok); err != nil {
			return nil, secretKeyError(err)
		}
	case "oauth2":
		if out.TokenURL == "" {
			return nil, fmt.Errorf("token URL is required for OAuth2 client credentials")
		}
		if out.ClientSecret, err = keepOrEncrypt(incoming.ClientSecret, existSecret); err != nil {
			return nil, secretKeyError(err)
		}
	case "custom":
		for _, hdr := range incoming.Headers {
			name := strings.TrimSpace(hdr.Name)
			if name == "" {
				continue
			}
			nh := models.AgreementHeader{Name: name, Secret: hdr.Secret}
			if hdr.Secret {
				if nh.Value, err = keepOrEncrypt(hdr.Value, findHeaderValue(existing, name)); err != nil {
					return nil, secretKeyError(err)
				}
			} else {
				nh.Value = hdr.Value
			}
			out.Headers = append(out.Headers, nh)
		}
	default:
		return nil, fmt.Errorf("unsupported auth method %q", out.Method)
	}
	return out, nil
}

// secretKeyError surfaces a clear, actionable message when encryption fails for
// lack of a configured master key.
func secretKeyError(err error) error {
	if err != nil && strings.Contains(err.Error(), "key is not configured") {
		return fmt.Errorf("set AGREEMENT_AUTH_MASTER_KEY to store protected-URL credentials")
	}
	return err
}

func findHeaderValue(auth *models.AgreementAuth, name string) string {
	if auth == nil {
		return ""
	}
	for _, h := range auth.Headers {
		if strings.EqualFold(h.Name, name) {
			return h.Value
		}
	}
	return ""
}

// fetchAgreementURL performs the authenticated GET for a URL agreement and
// returns the response body (caller closes), its content type, or an error.
func (h *HandlerAgreements) fetchAgreementURL(a *models.Agreement) ([]byte, error) {
	if !strings.HasPrefix(a.URL, "http://") && !strings.HasPrefix(a.URL, "https://") {
		return nil, fmt.Errorf("unsupported URL scheme")
	}
	// SSRF guard: the dialer Control runs for every connection (including
	// redirects and the resolved IP after DNS), so internal/loopback/link-local
	// targets are blocked even via redirect or DNS rebinding.
	dialer := &net.Dialer{Timeout: 10 * time.Second, Control: ssrfGuardControl}
	client := &http.Client{
		Timeout:   30 * time.Second,
		Transport: &http.Transport{DialContext: dialer.DialContext},
	}
	req, err := http.NewRequest(http.MethodGet, a.URL, nil)
	if err != nil {
		return nil, err
	}
	if err := h.applyFetchAuth(req, a.Auth, client); err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream returned status %d", resp.StatusCode)
	}
	// Read with a hard cap, then verify it really is a PDF before we ever serve
	// it publicly — never trust/forward the upstream content type.
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxAgreementBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxAgreementBytes {
		return nil, fmt.Errorf("document exceeds %d bytes", maxAgreementBytes)
	}
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		return nil, fmt.Errorf("fetched document is not a PDF")
	}
	return data, nil
}

// ssrfGuardControl is the net.Dialer Control hook: it rejects connections to
// non-public IP ranges, defeating SSRF to internal services / cloud metadata.
func ssrfGuardControl(network, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("could not parse dial address %q", address)
	}
	if isBlockedIP(ip) {
		return fmt.Errorf("blocked non-public address %s", ip)
	}
	return nil
}

// isBlockedIP reports whether an address must not be reached when fetching an
// admin-supplied agreement URL (loopback, private, link-local incl. the cloud
// metadata 169.254.169.254, unspecified, and CGNAT 100.64.0.0/10).
func isBlockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() ||
		ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsInterfaceLocalMulticast() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil && ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
		return true
	}
	return false
}

// uploadedFileIsPDF checks the magic bytes of a multipart upload.
func uploadedFileIsPDF(file *multipart.FileHeader) bool {
	f, err := file.Open()
	if err != nil {
		return false
	}
	defer f.Close()
	head := make([]byte, 5)
	n, _ := io.ReadFull(f, head)
	return n >= 5 && bytes.HasPrefix(head[:n], []byte("%PDF-"))
}

// serveAgreementPDF returns validated PDF bytes with a forced PDF content type
// and nosniff, so a non-PDF payload can never be rendered as HTML on our origin.
func serveAgreementPDF(c *fiber.Ctx, a *models.Agreement, data []byte) error {
	c.Set("Content-Type", "application/pdf")
	c.Set("X-Content-Type-Options", "nosniff")
	c.Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", agreementFilename(a)))
	return c.Send(data)
}

// cachedAgreementDoc returns a non-expired cached document for an id, if any.
func (h *HandlerAgreements) cachedAgreementDoc(id string) ([]byte, bool) {
	h.docCacheMu.Lock()
	defer h.docCacheMu.Unlock()
	e, ok := h.docCache[id]
	if !ok || time.Now().After(e.exp) {
		return nil, false
	}
	return e.data, true
}

// storeAgreementDoc caches a fetched document under id with the configured TTL.
func (h *HandlerAgreements) storeAgreementDoc(id string, data []byte) {
	h.docCacheMu.Lock()
	defer h.docCacheMu.Unlock()
	h.docCache[id] = cachedDoc{data: data, exp: time.Now().Add(agreementDocTTL)}
}

// invalidateAgreementDoc drops any cached document for id (on update/delete).
func (h *HandlerAgreements) invalidateAgreementDoc(id string) {
	h.docCacheMu.Lock()
	defer h.docCacheMu.Unlock()
	delete(h.docCache, id)
}

// applyFetchAuth decrypts the stored credentials and attaches them to the
// outbound request per the configured method.
func (h *HandlerAgreements) applyFetchAuth(req *http.Request, auth *models.AgreementAuth, client *http.Client) error {
	if auth == nil || auth.Method == "" || strings.EqualFold(auth.Method, "none") {
		return nil
	}
	dec := func(stored string) (string, error) {
		return utils.DecryptSecret(h.Config.AgreementAuthKey, stored)
	}
	switch strings.ToLower(auth.Method) {
	case "basic":
		pwd, err := dec(auth.Password)
		if err != nil {
			return err
		}
		req.SetBasicAuth(auth.Username, pwd)
	case "bearer":
		tok, err := dec(auth.Token)
		if err != nil {
			return err
		}
		header := auth.HeaderName
		if header == "" {
			header = "Authorization"
		}
		value := tok
		if auth.Scheme != "" {
			value = auth.Scheme + " " + tok
		}
		req.Header.Set(header, value)
	case "oauth2":
		secret, err := dec(auth.ClientSecret)
		if err != nil {
			return err
		}
		token, err := fetchOAuth2Token(client, auth.TokenURL, auth.ClientID, secret, auth.Scope)
		if err != nil {
			return err
		}
		req.Header.Set("Authorization", "Bearer "+token)
	case "custom":
		for _, hdr := range auth.Headers {
			if strings.TrimSpace(hdr.Name) == "" {
				continue
			}
			value := hdr.Value
			if hdr.Secret {
				v, err := dec(hdr.Value)
				if err != nil {
					return err
				}
				value = v
			}
			req.Header.Set(hdr.Name, value)
		}
	}
	return nil
}

// fetchOAuth2Token runs a client-credentials grant and returns the access token.
func fetchOAuth2Token(client *http.Client, tokenURL, clientID, clientSecret, scope string) (string, error) {
	form := url.Values{}
	form.Set("grant_type", "client_credentials")
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	if scope != "" {
		form.Set("scope", scope)
	}
	req, err := http.NewRequest(http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("token endpoint returned status %d", resp.StatusCode)
	}
	var parsed struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", err
	}
	if parsed.AccessToken == "" {
		return "", fmt.Errorf("token endpoint did not return an access_token")
	}
	return parsed.AccessToken, nil
}
