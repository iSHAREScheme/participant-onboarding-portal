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
	activeOnly := c.Query("activeOnly") == "true"
	certifiedOnly := c.Query("certifiedOnly") == "true"
	mineOnly := c.Query("mineOnly") == "true"

	// "My participants" can't be delegated to the satellite (it ignores
	// registrar query params), so fetch the whole matching set and
	// filter/paginate it here instead.
	if mineOnly {
		return h.getMyParticipants(c, page, pageSize, name, activeOnly, certifiedOnly)
	}

	data, total, totalPages, err := h.fetchPartiesPage(page, pageSize, name, activeOnly, certifiedOnly)
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

// getMyParticipants returns only the parties registered under this portal's
// registrar. The satellite cannot filter /parties by registrar, so we page
// through the whole (satellite-filtered) result set, keep the parties whose
// registrar_id matches ours, and paginate that filtered list in-memory. This
// full fetch only happens for the "My participants" view; the default list
// stays a single satellite page.
func (h *HandlerRegistry) getMyParticipants(c *fiber.Ctx, page, pageSize int, name string, activeOnly, certifiedOnly bool) error {
	registrar := h.resolveRegistrarId()
	if registrar == "" {
		// No registrar configured → we can't identify "our" parties.
		return c.JSON(fiber.Map{
			"data":        []interface{}{},
			"page":        page,
			"pageSize":    pageSize,
			"total":       0,
			"totalPages":  1,
			"registrarId": "",
		})
	}

	all, err := h.fetchAllSatelliteParties(name, activeOnly, certifiedOnly)
	if err != nil {
		return responses.ErrorResponse(c, fiber.StatusInternalServerError, err.Error())
	}

	filtered := filterByRegistrar(all, registrar)

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
	pageData := filtered[start:end]

	if h.Config.SatelliteDebug {
		log.Printf("satellite: my participants registrar=%q matched=%d of %d page=%d/%d", registrar, total, len(all), page, totalPages)
	}

	return c.JSON(fiber.Map{
		"data":        pageData,
		"page":        page,
		"pageSize":    pageSize,
		"total":       total,
		"totalPages":  totalPages,
		"registrarId": registrar,
	})
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

// filterByRegistrar keeps only the parties whose registrar_id equals the given
// registrar. An empty registrar matches nothing (we can't identify "ours").
func filterByRegistrar(parties []interface{}, registrar string) []interface{} {
	out := []interface{}{}
	if registrar == "" {
		return out
	}
	for _, p := range parties {
		if m, ok := p.(map[string]interface{}); ok {
			if rid, _ := m["registrar_id"].(string); rid == registrar {
				out = append(out, p)
			}
		}
	}
	return out
}

// fetchAllSatelliteParties pages through the entire satellite result set for the
// given satellite-side filters and returns every matching party concatenated.
// Used only by the "My participants" view, which post-filters by registrar.
func (h *HandlerRegistry) fetchAllSatelliteParties(name string, activeOnly, certifiedOnly bool) ([]interface{}, error) {
	const pageSize = maxParticipantsPageSize // 100 → fewest round-trips
	const maxPages = 1000                    // safety valve against a misbehaving satellite

	var all []interface{}
	for page := 1; page <= maxPages; page++ {
		data, total, _, err := h.fetchPartiesPage(page, pageSize, name, activeOnly, certifiedOnly)
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

// fetchPartyByID fetches a single party from the satellite by its id/EORI using
// the satellite's exact-match `eori` query. Returns (nil, nil) when no party
// matches.
func (h *HandlerRegistry) fetchPartyByID(id string) (interface{}, error) {
	q := url.Values{}
	q.Set("eori", id)

	decoded, err := h.fetchSatelliteParties("?" + q.Encode())
	if err != nil {
		return nil, err
	}

	data, _, _ := parsePartiesPage(decoded)
	if h.Config.SatelliteDebug {
		log.Printf("satellite: participant detail id=%q matched=%d", id, len(data))
	}
	if len(data) == 0 {
		return nil, nil
	}
	return data[0], nil
}

// fetchSatelliteParties queries the satellite /parties endpoint (with an
// optional query string such as "?role=AuthorisationRegistry"), then unwraps
// the signed parties_token JWT and returns its decoded payload.
func (h *HandlerRegistry) fetchSatelliteParties(query string) (map[string]interface{}, error) {
	// Get access token using the same method as in the party handler.
	accessToken, err := createSatelliteOwnerAccessToken(h.Server.Config)
	if err != nil {
		return nil, fmt.Errorf("Failed to create access token")
	}

	client := &http.Client{}

	req, err := http.NewRequest("GET", h.Config.SatelliteBaseUrl+"/parties"+query, nil)
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

	// Unwrap the parties_token JWT (header.payload.signature) to get the data.
	parts := strings.Split(registryData.PartiesToken, ".")
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

// fetchPartiesPage requests a single page of parties from the satellite,
// applying the optional name search and active/certified filters server-side.
// It returns the page's party objects plus the grand total and total page
// count, deriving the page count (which this satellite omits) from the total.
func (h *HandlerRegistry) fetchPartiesPage(page, pageSize int, name string, activeOnly, certifiedOnly bool) ([]interface{}, int, int, error) {
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
		log.Printf("satellite: participants page=%d pageSize=%d name=%q activeOnly=%t certifiedOnly=%t got=%d total=%d totalPages=%d", page, pageSize, name, activeOnly, certifiedOnly, len(data), total, totalPages)
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
