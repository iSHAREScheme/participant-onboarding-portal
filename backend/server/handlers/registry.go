package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"onboardingportal/config"
	"onboardingportal/integrations/satellite"
	"onboardingportal/models"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
)

type HandlerRegistry struct {
	Server *s.Server
	Config *config.Config
}

func NewHandlerRegistry(server *s.Server, config *config.Config) *HandlerRegistry {
	return &HandlerRegistry{
		Server: server,
		Config: config,
	}
}

// GetConnection godoc
// @Summary      Satellite connection details
// @Description  Returns the resolved (env + Settings overrides) non-secret satellite connection details. Never includes the private key.
// @Tags         registry
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Router       /registry/connection [get]
func (h *HandlerRegistry) GetConnection(c *fiber.Ctx) error {
	cfg := h.Config
	version := strings.TrimSpace(cfg.SatelliteVersion)
	frameworkAgreementId := strings.TrimSpace(cfg.FrameworkAgreementId)
	if frameworkAgreementId == "" && strings.TrimSpace(cfg.FrameworkId) != "" {
		frameworkAgreementId = strings.TrimSpace(cfg.FrameworkId) + "-tou"
	}
	// A connection needs both a certificate chain and a private key (path or
	// inline). Only report whether they are present — never the key itself.
	certConfigured := strings.TrimSpace(cfg.SatelliteX5c) != "" &&
		(strings.TrimSpace(cfg.SatellitePrivateKey) != "" || strings.TrimSpace(cfg.SatellitePrivateKeyPath) != "")
	return c.JSON(fiber.Map{
		"baseUrl":                         cfg.SatelliteBaseUrl,
		"iss":                             cfg.SatelliteIss,
		"aud":                             cfg.SatelliteAud,
		"version":                         version,
		"claimModel":                      strings.HasPrefix(version, "3"),
		"versionDetect":                   cfg.SatelliteVersionDetect,
		"epCreationEndpoint":              cfg.SatelliteEpCreationEndpoint,
		"partiesEndpoint":                 cfg.SatellitePartiesEndpoint,
		"tokenEndpoint":                   cfg.SatelliteTokenEndpoint,
		"tokenScope":                      cfg.SatelliteTokenScope,
		"registrarId":                     cfg.RegistrarId,
		"dataspaceId":                     cfg.DataspaceId,
		"dataspaceTitle":                  cfg.DataspaceTitle,
		"frameworkId":                     cfg.FrameworkId,
		"frameworkAgreementType":          cfg.FrameworkAgreementType,
		"frameworkAgreementId":            frameworkAgreementId,
		"frameworkAgreementTitle":         cfg.FrameworkAgreementTitle,
		"frameworkRoleId":                 cfg.FrameworkRoleId,
		"frameworkRoleLoa":                cfg.FrameworkRoleLoa,
		"frameworkRoleLegalAdherence":     cfg.FrameworkRoleLegalAdherence,
		"frameworkRoleCompliancyVerified": cfg.FrameworkRoleCompliancy,
		"certificateConfigured":           certConfigured,
		"oidcDisabled":                    cfg.OIDCDisable,
	})
}

// TestConnection godoc
// @Summary      Test the satellite connection
// @Description  Performs a real owner-token exchange and a version probe against the configured satellite and reports the result. Read-only.
// @Tags         registry
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Router       /registry/test [post]
func (h *HandlerRegistry) TestConnection(c *fiber.Ctx) error {
	client := &http.Client{}
	// A successful owner-token exchange proves base URL + issuer + credentials all
	// work end to end (this is the actual "connect").
	token, err := satellite.GetOwnerAccessToken(client, h.Config)
	if err != nil {
		return c.JSON(fiber.Map{
			"ok":            false,
			"tokenObtained": false,
			"error":         err.Error(),
		})
	}
	version, detected := satellite.DetectFrameworkVersion(h.Config)
	if strings.TrimSpace(version) == "" {
		version = strings.TrimSpace(h.Config.SatelliteVersion)
	}
	return c.JSON(fiber.Map{
		"ok":              true,
		"tokenObtained":   token != "",
		"version":         version,
		"claimModel":      strings.HasPrefix(version, "3"),
		"versionDetected": detected,
	})
}

// GetDataspaces godoc
// @Summary      List dataspaces from the Participant Registry
// @Description  Fetches the dataspaces registered in the satellite (server-side, owner-token authenticated) and returns a clean [{id, title}] list for selection.
// @Tags         registry
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Router       /registry/dataspaces [get]
func (h *HandlerRegistry) GetDataspaces(c *fiber.Ctx) error {
	client := &http.Client{}
	accessToken, err := satellite.GetOwnerAccessToken(client, h.Config)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to obtain satellite access token")
	}

	req, err := http.NewRequest("GET", joinSatelliteURL(h.Config.SatelliteBaseUrl, h.Config.SatelliteV3Prefix()+"/dataspaces"), nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request")
	}
	req.Header.Add("Authorization", "Bearer "+accessToken)

	resp, err := client.Do(req)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to fetch dataspaces")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if h.Config.SatelliteDebug {
		log.Printf("satellite: GET /dataspaces status=%d", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return responses.ErrorResponse(c, resp.StatusCode, "satellite dataspaces request failed")
	}

	// The response wraps a signed JWT (dataspacesToken / dataspaces_token) whose
	// payload carries the dataspace list; unwrap and flatten to {id, title}.
	var wrapper map[string]interface{}
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to parse dataspaces response")
	}
	token, _ := wrapper["dataspacesToken"].(string)
	if token == "" {
		token, _ = wrapper["dataspaces_token"].(string)
	}

	dataspaces := []fiber.Map{}
	if parts := strings.Split(token, "."); len(parts) == 3 {
		if payload, err := base64.RawURLEncoding.DecodeString(parts[1]); err == nil {
			var claims map[string]interface{}
			if json.Unmarshal(payload, &claims) == nil {
				dataspaces = extractDataspaces(claims)
			}
		}
	}

	return c.JSON(fiber.Map{"dataspaces": dataspaces})
}

// GetFrameworks godoc
// @Summary      List frameworks from the Participant Registry
// @Description  Fetches the frameworks registered in the satellite (server-side, owner-token authenticated), decodes the signed frameworks token and returns the framework rows plus pagination metadata.
// @Tags         registry
// @Produce      json
// @Param        page      query     int  false  "Page number"
// @Param        pageSize  query     int  false  "Page size"
// @Success      200  {object}  map[string]interface{}
// @Router       /registry/frameworks [get]
func (h *HandlerRegistry) GetFrameworks(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	if page < 1 {
		page = 1
	}
	pageSize := c.QueryInt("pageSize", 10)
	if pageSize < 1 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	client := &http.Client{}
	accessToken, err := satellite.GetOwnerAccessToken(client, h.Config)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to obtain satellite access token")
	}

	endpoint := joinSatelliteURL(h.Config.SatelliteBaseUrl, h.Config.SatelliteV3Prefix()+"/frameworks")
	values := url.Values{}
	values.Set("page", strconv.Itoa(page))
	values.Set("pageSize", strconv.Itoa(pageSize))
	endpoint += "?" + values.Encode()

	req, err := http.NewRequest("GET", endpoint, nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request")
	}
	req.Header.Add("Authorization", "Bearer "+accessToken)

	resp, err := client.Do(req)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to fetch frameworks")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if h.Config.SatelliteDebug {
		log.Printf("satellite: GET /frameworks status=%d", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return responses.ErrorResponse(c, resp.StatusCode, "satellite frameworks request failed")
	}

	var wrapper map[string]interface{}
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to parse frameworks response")
	}
	token, _ := wrapper["frameworksToken"].(string)
	if token == "" {
		token, _ = wrapper["frameworks_token"].(string)
	}

	claims := map[string]interface{}{}
	if parts := strings.Split(token, "."); len(parts) == 3 {
		if payload, err := base64.RawURLEncoding.DecodeString(parts[1]); err == nil {
			_ = json.Unmarshal(payload, &claims)
		}
	}
	frameworks, pagination := extractFrameworks(claims)
	if len(pagination) == 0 {
		pagination["currentPage"] = page
		pagination["pageSize"] = pageSize
		pagination["count"] = len(frameworks)
	}

	return c.JSON(fiber.Map{
		"frameworks": frameworks,
		"pagination": pagination,
		"claims":     claims,
	})
}

// extractDataspaces defensively pulls {id, title} entries out of a decoded
// dataspacesToken payload, tolerating the different nestings the satellite may
// use (dataspacesInfo as an array, or wrapping a `dataspaces` array).
func extractDataspaces(claims map[string]interface{}) []fiber.Map {
	out := []fiber.Map{}
	var arr []interface{}
	switch v := claims["dataspacesInfo"].(type) {
	case []interface{}:
		arr = v
	case map[string]interface{}:
		if inner, ok := v["dataspaces"].([]interface{}); ok {
			arr = inner
		}
	}
	if arr == nil {
		if v, ok := claims["dataspaces"].([]interface{}); ok {
			arr = v
		}
	}
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		id, _ := m["id"].(string)
		if strings.TrimSpace(id) == "" {
			continue
		}
		title, _ := m["title"].(string)
		out = append(out, fiber.Map{"id": id, "title": title})
	}
	return out
}

// extractFrameworks defensively pulls framework rows from the v3 frameworksToken
// payload. The spec describes a paginated signed JWT; implementations may place
// rows directly under frameworksInfo, frameworksInfo.data, frameworks or data.
func extractFrameworks(claims map[string]interface{}) ([]fiber.Map, fiber.Map) {
	pagination := fiber.Map{}
	var arr []interface{}
	for _, key := range []string{"frameworksInfo", "frameworks", "data"} {
		switch v := claims[key].(type) {
		case []interface{}:
			arr = v
		case map[string]interface{}:
			if arr == nil {
				if inner, ok := v["data"].([]interface{}); ok {
					arr = inner
				} else if inner, ok := v["frameworks"].([]interface{}); ok {
					arr = inner
				}
			}
			for _, pkey := range []string{"currentPage", "page", "pageSize", "total", "totalItems", "totalPages", "count"} {
				if val, ok := v[pkey]; ok {
					pagination[pkey] = val
				}
			}
		}
		if arr != nil {
			break
		}
	}
	for _, pkey := range []string{"currentPage", "page", "pageSize", "total", "totalItems", "totalPages", "count"} {
		if val, ok := claims[pkey]; ok {
			pagination[pkey] = val
		}
	}

	out := []fiber.Map{}
	for _, item := range arr {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		row := fiber.Map{"raw": m}
		for _, key := range []string{"id", "frameworkId", "framework_id"} {
			if s, _ := m[key].(string); strings.TrimSpace(s) != "" {
				row["id"] = s
				break
			}
		}
		for _, key := range []string{"title", "name", "frameworkName", "framework_name"} {
			if s, _ := m[key].(string); strings.TrimSpace(s) != "" {
				row["title"] = s
				break
			}
		}
		for _, key := range []string{"description", "status", "version", "startDate", "endDate", "validFrom", "validUntil", "createdAt", "updatedAt"} {
			if val, ok := m[key]; ok {
				row[key] = val
			}
		}
		out = append(out, row)
	}
	return out, pagination
}

// GetRegistry godoc
// @Summary      List authorisation registries
// @Description  Fetches Authorisation Registry parties from the iSHARE Satellite and returns the decoded JWT payload.
// @Tags         registry
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Failure      500  {object}  map[string]string
// @Router       /registry [get]
func (h *HandlerRegistry) GetRegistry(c *fiber.Ctx) error {
	// Authorisation Registries only — preserves the original behaviour the
	// onboarding/register flow depends on.
	decodedData, err := h.fetchSatelliteParties("?role=AuthorisationRegistry")
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(decodedData)
}

// GetSatelliteVersion godoc
// @Summary      Effective satellite framework version
// @Description  Returns the iSHARE framework version the backend is operating against — auto-detected from the satellite at startup, or the configured SATELLITE_VERSION fallback.
// @Tags         registry
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Router       /registry/version [get]
func (h *HandlerRegistry) GetSatelliteVersion(c *fiber.Ctx) error {
	version := strings.TrimSpace(h.Config.SatelliteVersion)
	return c.JSON(fiber.Map{
		"version":    version,
		"claimModel": strings.HasPrefix(version, "3"),
	})
}

const (
	defaultParticipantsPageSize = 10
	maxParticipantsPageSize     = 100 // satellite maximum page size
)

// GetParticipants godoc
// @Summary      List participants (paginated)
// @Description  Returns one page of parties from the iSHARE Satellite registry. Pagination, name search and the active/certified filters are evaluated by the satellite, so the response stays small regardless of registry size.
// @Tags         registry
// @Produce      json
// @Param        page           query  int     false  "Page number (1-based)"
// @Param        pageSize       query  int     false  "Page size (1-100)"
// @Param        name           query  string  false  "Case-insensitive party-name search (matched as a contains wildcard)"
// @Param        activeOnly     query  bool    false  "Only return parties with active adherence"
// @Param        certifiedOnly  query  bool    false  "Only return certified parties"
// @Param        mineOnly       query  bool    false  "Only return parties registered under this portal's registrar"
// @Success      200  {object}  map[string]interface{}
// @Failure      500  {object}  map[string]string
// @Router       /registry/participants [get]
func (h *HandlerRegistry) GetParticipants(c *fiber.Ctx) error {
	// Server-side pagination: the satellite paginates and can search/filter on
	// its own, so we forward a single page request and pass its totals back to
	// the frontend pager. This keeps the payload small no matter how large the
	// registry grows.
	page := c.QueryInt("page", 1)
	if page < 1 {
		page = 1
	}
	pageSize := c.QueryInt("pageSize", defaultParticipantsPageSize)
	if pageSize < 1 {
		pageSize = defaultParticipantsPageSize
	}
	if pageSize > maxParticipantsPageSize {
		pageSize = maxParticipantsPageSize
	}

	name := strings.TrimSpace(c.Query("name"))
	// `search` is a single free-text term matched against BOTH the party name and
	// the party id (name OR id contains). The satellite can only AND its filters,
	// so this OR match is applied in-memory (see getFilteredParticipants).
	search := strings.TrimSpace(c.Query("search"))
	// `role` is delegated to the satellite (a frameworkRole claim filter on v3, or
	// a plain role= on v2, inside fetchPartiesPage); `id` (exact single-field) is
	// still accepted for direct API callers.
	partyID := strings.TrimSpace(c.Query("id"))
	role := strings.TrimSpace(c.Query("role"))
	activeOnly := c.Query("activeOnly") == "true"
	certifiedOnly := c.Query("certifiedOnly") == "true"
	mineOnly := c.Query("mineOnly") == "true"

	// Some filters can't be delegated to the satellite, so we fetch the whole
	// matching set and filter/paginate in-memory:
	//   - the name-or-id `search` (an OR across two fields),
	//   - "mine" (the satellite ignores registrar query params), and
	//   - active/certified on a v3 claim-model satellite (it ignores
	//     active_only/certified_only — that state lives in the claims).
	// Role IS delegated, so it pre-filters the fetched set server-side.
	claimModel := strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3")
	if search != "" || mineOnly || (claimModel && (activeOnly || certifiedOnly)) {
		return h.getFilteredParticipants(c, page, pageSize, name, search, activeOnly, certifiedOnly, mineOnly, claimModel, role, partyID)
	}

	data, total, totalPages, err := h.fetchPartiesPage(page, pageSize, name, activeOnly, certifiedOnly, role, partyID)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, err.Error())
	}

	return c.JSON(fiber.Map{
		"data":       data,
		"page":       page,
		"pageSize":   pageSize,
		"total":      total,
		"totalPages": totalPages,
	})
}

// getFilteredParticipants fetches the whole matching result set and applies the
// filters the satellite can't do server-side, then paginates in-memory:
//   - mineOnly: keep parties registered under this portal's registrar, and
//   - on a v3 claim-model satellite, active/certified (which the satellite
//     ignores — that state lives in the claims).
//
// The default list (unfiltered, or v2 active/certified) stays a single page.
func (h *HandlerRegistry) getFilteredParticipants(c *fiber.Ctx, page, pageSize int, name, search string, activeOnly, certifiedOnly, mineOnly, claimModel bool, role, partyID string) error {
	registrar := h.resolveRegistrarId()
	if mineOnly && registrar == "" {
		// No registrar configured → we can't identify "our" parties.
		return c.JSON(fiber.Map{
			"data": []interface{}{}, "page": page, "pageSize": pageSize,
			"total": 0, "totalPages": 1, "registrarId": "",
		})
	}

	// v3 ignores active_only/certified_only, so apply them in-memory below; v2
	// can filter them server-side, so let the satellite do it.
	satActive := activeOnly && !claimModel
	satCertified := certifiedOnly && !claimModel

	all, err := h.fetchAllSatelliteParties(name, satActive, satCertified, role, partyID)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, err.Error())
	}

	filtered := make([]interface{}, 0, len(all))
	for _, p := range all {
		m, ok := p.(map[string]interface{})
		if !ok {
			continue
		}
		if search != "" && !partyMatchesSearch(m, search) {
			continue
		}
		if mineOnly && !partyMatchesRegistrar(m, registrar) {
			continue
		}
		if claimModel && activeOnly && !partyIsActive(m) {
			continue
		}
		if claimModel && certifiedOnly && !partyIsCertified(m) {
			continue
		}
		filtered = append(filtered, p)
	}

	total := len(filtered)
	totalPages := 1
	if total > 0 {
		totalPages = (total + pageSize - 1) / pageSize // ceil
	}

	// Slice out the requested page, clamping to the available range.
	start := (page - 1) * pageSize
	if start < 0 {
		start = 0
	}
	if start > total {
		start = total
	}
	end := start + pageSize
	if end > total {
		end = total
	}

	if h.Config.SatelliteDebug {
		log.Printf("satellite: filtered participants search=%q mine=%t active=%t certified=%t claimModel=%t matched=%d of %d page=%d/%d", search, mineOnly, activeOnly, certifiedOnly, claimModel, total, len(all), page, totalPages)
	}

	resp := fiber.Map{
		"data": filtered[start:end], "page": page, "pageSize": pageSize,
		"total": total, "totalPages": totalPages,
	}
	if mineOnly {
		resp["registrarId"] = registrar
	}
	return c.JSON(resp)
}

// resolveRegistrarId returns the registrar that identifies "us": the configured
// REGISTRAR_ID, falling back to the satellite issuer (SATELLITE_ISS) — the same
// value the settings screen reports as the registrar ID.
func (h *HandlerRegistry) resolveRegistrarId() string {
	if v := strings.TrimSpace(h.Config.RegistrarId); v != "" {
		return v
	}
	return strings.TrimSpace(h.Config.SatelliteIss)
}

// partyMatchesRegistrar reports whether a party was registered under the given
// registrar. v2 carries a top-level registrar_id; v3 carries it per claim.
func partyMatchesRegistrar(m map[string]interface{}, registrar string) bool {
	if registrar == "" {
		return false
	}
	if rid, _ := m["registrar_id"].(string); rid == registrar {
		return true
	}
	for _, c := range partyClaims(m) {
		if rid, _ := c["registrarId"].(string); rid == registrar {
			return true
		}
	}
	return false
}

// partyIsActive reports whether a party is active. v2 reads adherence.status;
// v3 reads the frameworkCompliance claim's status.
func partyIsActive(m map[string]interface{}) bool {
	if a, ok := m["adherence"].(map[string]interface{}); ok {
		if s, _ := a["status"].(string); strings.EqualFold(s, "active") {
			return true
		}
	}
	for _, c := range partyClaims(m) {
		if t, _ := c["type"].(string); t == "frameworkCompliance" {
			if s, _ := c["status"].(string); strings.EqualFold(s, "active") {
				return true
			}
		}
	}
	return false
}

// partyIsCertified reports whether a party has a registered certificate. v2
// carries a certificates array; v3 carries an x509Certificate claim.
func partyIsCertified(m map[string]interface{}) bool {
	if certs, ok := m["certificates"].([]interface{}); ok && len(certs) > 0 {
		return true
	}
	for _, c := range partyClaims(m) {
		if t, _ := c["type"].(string); t == "x509Certificate" {
			return true
		}
	}
	return false
}

// partyClaims returns the party's v3 claim objects (nil for a v2 party).
func partyClaims(m map[string]interface{}) []map[string]interface{} {
	arr, ok := m["claims"].([]interface{})
	if !ok {
		return nil
	}
	out := make([]map[string]interface{}, 0, len(arr))
	for _, c := range arr {
		if cm, ok := c.(map[string]interface{}); ok {
			out = append(out, cm)
		}
	}
	return out
}

// fetchAllSatelliteParties pages through the entire satellite result set for the
// given satellite-side filters and returns every matching party concatenated.
// Used only by the "My participants" view, which post-filters by registrar.
func (h *HandlerRegistry) fetchAllSatelliteParties(name string, activeOnly, certifiedOnly bool, role, partyID string) ([]interface{}, error) {
	const pageSize = maxParticipantsPageSize // 100 → fewest round-trips
	const maxPages = 1000                    // safety valve against a misbehaving satellite

	var all []interface{}
	for page := 1; page <= maxPages; page++ {
		data, total, _, err := h.fetchPartiesPage(page, pageSize, name, activeOnly, certifiedOnly, role, partyID)
		if err != nil {
			return nil, err
		}
		all = append(all, data...)

		if len(data) == 0 {
			break
		}
		if total >= 0 && len(all) >= total {
			break
		}
		if len(data) < pageSize {
			break // a short page means we've reached the end
		}
	}
	return all, nil
}

// GetParticipantDetail godoc
// @Summary      Get one participant by id
// @Description  Returns a single party from the iSHARE Satellite registry, matched exactly on its id/EORI. Used by the participant detail view.
// @Tags         registry
// @Produce      json
// @Param        eori  query  string  true  "Party id / EORI (exact match)"
// @Success      200  {object}  map[string]interface{}
// @Failure      400  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /registry/participants/detail [get]
func (h *HandlerRegistry) GetParticipantDetail(c *fiber.Ctx) error {
	// Accept either ?eori= or ?id= (the satellite matches both party_id forms,
	// EORI and DID, exactly via its `eori` query param).
	id := strings.TrimSpace(c.Query("eori"))
	if id == "" {
		id = strings.TrimSpace(c.Query("id"))
	}
	if id == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "missing participant id")
	}

	party, err := h.fetchPartyByID(id)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, err.Error())
	}
	if party == nil {
		return responses.ErrorResponse(c, fiber.StatusNotFound, "participant not found")
	}
	return c.JSON(fiber.Map{"data": party})
}

// GetParticipantHistory returns ledger-derived history for a single participant
// from the connected v3 Participant Registry. Existing history is attributed to
// the Fabric/MSP actor available on-ledger; human portal users are only available
// for future writes if the PR records them explicitly.
func (h *HandlerRegistry) GetParticipantHistory(c *fiber.Ctx) error {
	id := strings.TrimSpace(c.Query("eori"))
	if id == "" {
		id = strings.TrimSpace(c.Query("id"))
	}
	if id == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "missing participant id")
	}

	client := &http.Client{}
	accessToken, err := satellite.GetOwnerAccessToken(client, h.Config)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to obtain satellite access token")
	}

	req, err := http.NewRequest("GET", joinSatelliteURL(h.Config.SatelliteBaseUrl, h.Config.SatelliteV3Prefix()+"/parties/"+url.PathEscape(id)+"/history"), nil)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Failed to create request")
	}
	req.Header.Add("Authorization", "Bearer "+accessToken)

	resp, err := client.Do(req)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to fetch participant history")
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		if h.Config.SatelliteDebug {
			log.Printf("satellite: participant history request failed status=%d body=%s", resp.StatusCode, string(body))
		}
		return responses.ErrorResponse(c, resp.StatusCode, "satellite participant history request failed")
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to parse participant history")
	}
	if history, ok := raw["participantHistory"]; ok {
		return c.JSON(fiber.Map{"data": history})
	}

	token := stringField(raw, "participantHistoryToken", "participant_history_token")
	if token == "" {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "participant history token missing")
	}
	decoded, err := decodeJWTPayload(token)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusBadGateway, "Failed to decode participant history token")
	}
	return c.JSON(fiber.Map{"data": decoded["participantHistory"]})
}

// GetMyParty returns the authenticated applicant's OWN party as registered in the
// Participant Registry. The party id is taken from the caller's proposal (looked
// up by the token's username) — never from input — so it can only ever return the
// caller's own party. `data` stays nil until the party is actually admitted to the
// registry; `status` carries the proposal state so the UI can explain the wait.
func (h *HandlerRegistry) GetMyParty(c *fiber.Ctx) error {
	claims := currentClaims(c)
	if claims == nil {
		return responses.ErrorResponse(c, fiber.StatusUnauthorized, "Missing authentication claims")
	}
	username := strings.TrimSpace(claims.PreferredUsername)
	if username == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "Token has no username")
	}

	var proposal models.Proposal
	if err := h.Server.DB.Where("keycloak_username = ?", username).First(&proposal).Error; err != nil {
		return c.JSON(fiber.Map{"status": "none", "data": nil})
	}

	resp := fiber.Map{
		"status":    proposal.Status,
		"partyId":   proposal.PartyId,
		"partyName": proposal.PartyName,
		"data":      nil,
	}
	partyID := strings.TrimSpace(proposal.PartyId)
	if partyID == "" {
		return c.JSON(resp)
	}

	// The party is only present in the registry once it has been admitted.
	party, err := h.fetchPartyByID(partyID)
	if err != nil {
		log.Printf("me/party: satellite lookup failed for %q: %v", partyID, err)
		return c.JSON(resp)
	}
	resp["data"] = party
	return c.JSON(resp)
}

// fetchPartyByID fetches a single party from the satellite by its id. The v3
// /parties endpoint filters by `id` (the DID); v2 satellites use `eori`.
// IMPORTANT: a v3 satellite IGNORES the `eori` param and returns the full
// (unfiltered) page, so querying with the wrong param silently yields the first
// party on the page — a different participant than requested. Returns (nil, nil)
// when no party matches.
func (h *HandlerRegistry) fetchPartyByID(id string) (interface{}, error) {
	q := url.Values{}
	claimModel := strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3")
	if claimModel {
		q.Set("id", id)
	} else {
		q.Set("eori", id)
	}

	decoded, err := h.fetchSatelliteParties("?" + q.Encode())
	if err != nil {
		return nil, err
	}

	data, _, _ := parsePartiesPage(decoded)
	if h.Config.SatelliteDebug {
		log.Printf("satellite: participant detail id=%q matched=%d", id, len(data))
	}
	// Return the party whose id matches the request — never blindly data[0]: if a
	// satellite ignores the filter it returns the whole page in arbitrary order.
	for _, e := range data {
		if m, ok := e.(map[string]interface{}); ok && partyHasID(m, id) {
			return m, nil
		}
	}
	// Fall back to the sole result only when the satellite genuinely narrowed to one.
	if len(data) == 1 {
		return data[0], nil
	}
	return nil, nil
}

// partyHasID reports whether a party object's identifier matches id, checking the
// v3 `id` (DID) and v2 `party_id` fields.
func partyHasID(m map[string]interface{}, id string) bool {
	for _, k := range []string{"id", "party_id"} {
		if v, ok := m[k].(string); ok && v == id {
			return true
		}
	}
	return false
}

// partyMatchesSearch reports whether a free-text query matches a party by EITHER
// its name OR its id (case-insensitive, substring). This OR-across-fields match
// is applied in-memory because the satellite can only AND its query filters.
func partyMatchesSearch(m map[string]interface{}, q string) bool {
	q = strings.ToLower(strings.TrimSpace(q))
	if q == "" {
		return true
	}
	if strings.Contains(strings.ToLower(stringField(m, "name", "party_name", "partyName")), q) {
		return true
	}
	if strings.Contains(strings.ToLower(stringField(m, "id", "party_id", "partyId")), q) {
		return true
	}
	if aka, ok := m["alsoKnownAs"].([]interface{}); ok {
		for _, a := range aka {
			if s, ok := a.(string); ok && strings.Contains(strings.ToLower(s), q) {
				return true
			}
		}
	}
	return false
}

// fetchSatelliteParties queries the satellite /parties endpoint (with an
// optional query string such as "?role=AuthorisationRegistry"), then unwraps
// the signed parties_token JWT and returns its decoded payload.
func (h *HandlerRegistry) fetchSatelliteParties(query string) (map[string]interface{}, error) {
	client := &http.Client{}

	// Exchange the owner client assertion at /connect/token for a real access
	// token and use THAT as the API bearer. Sending the raw assertion as a bearer
	// only works against lenient satellites; conformant ones reject it (401).
	accessToken, err := satellite.GetOwnerAccessToken(client, h.Config)
	if err != nil {
		return nil, fmt.Errorf("Failed to obtain satellite access token")
	}

	req, err := http.NewRequest("GET", h.Config.SatelliteBaseUrl+h.Config.SatelliteV3Prefix()+"/parties"+query, nil)
	if err != nil {
		return nil, fmt.Errorf("Failed to create request")
	}
	req.Header.Add("Authorization", "Bearer "+accessToken)

	if h.Config.SatelliteDebug {
		log.Printf("satellite: GET %s", req.URL.String())
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Failed to fetch registry data")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("Failed to read response body")
	}

	if resp.StatusCode != http.StatusOK {
		if h.Config.SatelliteDebug {
			log.Printf("satellite: parties request failed status=%d body=%s", resp.StatusCode, string(body))
		}
		return nil, fmt.Errorf("satellite parties request failed: status %d", resp.StatusCode)
	}

	var registryData responses.RegistryResponse
	if err := json.Unmarshal(body, &registryData); err != nil {
		return nil, fmt.Errorf("Failed to parse registry data")
	}

	// Unwrap the signed parties JWT (header.payload.signature). v2 returns it as
	// `parties_token`, v3 as `partiesToken` — use whichever the satellite sent.
	partiesToken := registryData.PartiesToken
	if partiesToken == "" {
		partiesToken = registryData.PartiesTokenV3
	}
	parts := strings.Split(partiesToken, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("Invalid JWT format")
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("Failed to decode JWT payload")
	}

	var decodedData map[string]interface{}
	if err := json.Unmarshal(payload, &decodedData); err != nil {
		return nil, fmt.Errorf("Failed to parse JWT payload")
	}

	return decodedData, nil
}

func decodeJWTPayload(token string) (map[string]interface{}, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid JWT format")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	decoded := make(map[string]interface{})
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}

func stringField(raw map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := raw[key].(string); ok && strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// fetchPartiesPage requests a single page of parties from the satellite,
// applying the optional name search and active/certified filters server-side.
// It returns the page's party objects plus the grand total and total page
// count, deriving the page count (which this satellite omits) from the total.
func (h *HandlerRegistry) fetchPartiesPage(page, pageSize int, name string, activeOnly, certifiedOnly bool, role, partyID string) ([]interface{}, int, int, error) {
	q := url.Values{}
	q.Set("page", strconv.Itoa(page))
	// Send both page-size spellings: this satellite honours snake_case
	// `page_size`, while canonical iSHARE v3 satellites use camelCase
	// `pageSize`. A satellite ignores the spelling it doesn't recognise.
	q.Set("page_size", strconv.Itoa(pageSize))
	q.Set("pageSize", strconv.Itoa(pageSize))

	// The satellite only matches names when the query contains wildcards
	// (`*Zah*` matches "Zahra"; a bare `Zah` matches nothing), so wrap the
	// user's term in `*...*` for a contains-style search. Filtered queries
	// report the matching total_count, so the derived page count is correct.
	if name != "" {
		q.Set("name", "*"+name+"*")
	}
	if activeOnly {
		q.Set("active_only", "true")
	}
	if certifiedOnly {
		q.Set("certified_only", "true")
	}
	// Party-id search: the satellite's `id` filter matches the party id, EORI
	// and DID aliases (contains), so a partial term works.
	if partyID != "" {
		q.Set("id", partyID)
	}
	// Role filter: a v3 claim-model satellite filters roles via a frameworkRole
	// claim filter (it ignores a bare `role=`); a v2 satellite accepts `role=`.
	if role != "" {
		if strings.HasPrefix(strings.TrimSpace(h.Config.SatelliteVersion), "3") {
			q.Set("claimFilter[frameworkRole.roleId]", role)
		} else {
			q.Set("role", role)
		}
	}

	decoded, err := h.fetchSatelliteParties("?" + q.Encode())
	if err != nil {
		return nil, 0, 0, err
	}

	data, total, totalPages := parsePartiesPage(decoded)

	// The satellite reports total_count but not a total page count, so derive
	// it. Fall back to this page's length if even the total is missing.
	if total < 0 {
		total = len(data)
	}
	if totalPages <= 0 {
		if pageSize > 0 && total > 0 {
			totalPages = (total + pageSize - 1) / pageSize // ceil
		} else {
			totalPages = 1
		}
	}

	if h.Config.SatelliteDebug {
		log.Printf("satellite: participants page=%d pageSize=%d name=%q id=%q role=%q activeOnly=%t certifiedOnly=%t got=%d total=%d totalPages=%d", page, pageSize, name, partyID, role, activeOnly, certifiedOnly, len(data), total, totalPages)
	}

	return data, total, totalPages, nil
}

// parsePartiesPage extracts the party array, total party count, and total page
// count from a decoded parties_token payload. It tolerates both the v2 shape
// (parties_info / count) and the v3 shape (partiesInfo / totalCount /
// totalPages). total is -1 and totalPages is 0 when the satellite omits them.
func parsePartiesPage(decoded map[string]interface{}) (data []interface{}, total int, totalPages int) {
	total = -1

	info := decoded
	if m, ok := decoded["parties_info"].(map[string]interface{}); ok {
		info = m
	} else if m, ok := decoded["partiesInfo"].(map[string]interface{}); ok {
		info = m
	}

	if arr, ok := info["data"].([]interface{}); ok {
		data = arr
	}

	// Grand total of matching parties. The field name varies by satellite
	// (v3 totalCount; this satellite total_count) and may sit inside the
	// wrapper or at the top level, so check both. We deliberately do NOT fall
	// back to `count`: on this satellite `count` is the CURRENT page size (10),
	// not the grand total, and treating it as the total stops paging after the
	// first page. When no explicit total is present, total stays -1 and paging
	// terminates on an empty/short page instead.
	for _, src := range []map[string]interface{}{info, decoded} {
		if v, ok := toInt(src["totalCount"]); ok {
			total = v
			break
		}
		if v, ok := toInt(src["total_count"]); ok {
			total = v
			break
		}
	}

	// Total PAGE count. Only trust unambiguous "total pages" fields. NOTE: this
	// satellite also returns `pageCount`, but that is the CURRENT page number
	// (1 on page 1, 2 on page 2), NOT the total — using it makes page 1 look
	// like the last page and stops pagination immediately, so it is ignored.
	for _, src := range []map[string]interface{}{info, decoded} {
		if v, ok := toInt(src["totalPages"]); ok {
			totalPages = v
			break
		}
		if v, ok := toInt(src["total_pages"]); ok {
			totalPages = v
			break
		}
	}

	return data, total, totalPages
}

// toInt coerces a JSON-decoded number (float64) or int to int.
func toInt(v interface{}) (int, bool) {
	switch n := v.(type) {
	case float64:
		return int(n), true
	case int:
		return n, true
	}
	return 0, false
}

// VerifyTrustedCertificate godoc
// @Summary      Verify trusted certificate
// @Description  Calls the participant registry trusted-list (TODO) and verifies certificate status.
// @Tags         registry
// @Produce      json
// @Success      200  {object}  map[string]interface{}
// @Failure      500  {object}  map[string]string
// @Router       /registry/trusted-cert [get]
func (h *HandlerRegistry) VerifyTrustedCertificate(c *fiber.Ctx) error {
	// TODO: call trusted_list endpoint: https://dev.ishare.eu/participant-registry-role/trusted-list

	var data map[string]interface{}
	// return responses.ErrorResponse(c, fiber.StatusInternalServerError, "Not implemented")
	return c.JSON(data)
}
