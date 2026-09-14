package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"onboardingportal/integrations/pr"

	"github.com/gofiber/fiber/v2"
)

// Registry reads through the Participant Registry's Keycloak-bearer read API
// (PR-MW /api/v3; backend-consolidation phase 1).
//
// When PR_API_BASE_URL points at a registry that serves /api/v3, every registry
// read handler forwards the operator's own token once and relays the registry's
// response verbatim: the registry filters and pages server-side and its
// envelopes are the ones these handlers used to assemble themselves. The M2M
// path (client-assertion exchange + signed /v3.0 pages walked in-memory) remains
// the fallback for standalone deployments and for registries that predate
// /api/v3, so a portal never breaks on the registry's version.

// prAPIRetryAfter is how long a "route missing" answer is remembered before the
// registry is probed again: an upgraded registry is picked up without a portal
// restart, an old one is not probed on every request.
const prAPIRetryAfter = 5 * time.Minute

// prAPIState remembers whether the configured registry serves /api/v3 and
// rate-limits the fallback warnings (one per retry window).
type prAPIState struct {
	mu            sync.Mutex
	unsupportedAt time.Time
	lastWarnAt    time.Time
}

var registryPRAPI prAPIState

func (s *prAPIState) unsupported(now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return !s.unsupportedAt.IsZero() && now.Sub(s.unsupportedAt) < prAPIRetryAfter
}

func (s *prAPIState) markUnsupported(now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.unsupportedAt = now
}

func (s *prAPIState) shouldWarn(now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.lastWarnAt.IsZero() && now.Sub(s.lastWarnAt) < prAPIRetryAfter {
		return false
	}
	s.lastWarnAt = now
	return true
}

func (s *prAPIState) reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.unsupportedAt = time.Time{}
	s.lastWarnAt = time.Time{}
}

// prRouteMissing reports whether a 404 came from the registry's router (no such
// route: a registry without /api/v3) rather than from the endpoint itself, which
// answers an unknown party with a JSON {error} body.
func prRouteMissing(apiErr *pr.APIError) bool {
	if apiErr.Status != http.StatusNotFound {
		return false
	}
	body := strings.TrimSpace(apiErr.Body)
	return body == "" || !strings.HasPrefix(body, "{")
}

// relayRegistryRead performs GET path?query on the registry's /api/v3 surface
// with the caller's token and writes the registry's answer to c. It returns
// handled=true when a response was written (a success, or an error the endpoint
// itself produced: bad paging, unknown party, registry failure) and
// handled=false when the caller must serve the request over the M2M path: no
// registry configured, no /api/v3 on this registry, the operator's token not
// accepted there, or the registry unreachable.
func (h *HandlerRegistry) relayRegistryRead(c *fiber.Ctx, path string, query url.Values) (bool, error) {
	client := pr.New(h.Config)
	now := time.Now()
	if !client.Configured() || registryPRAPI.unsupported(now) {
		return false, nil
	}

	target := path
	if encoded := query.Encode(); encoded != "" {
		target += "?" + encoded
	}

	var out json.RawMessage
	err := client.Do(prBearer(c), http.MethodGet, target, nil, &out)
	if err == nil {
		if h.Config.SatelliteDebug {
			log.Printf("registry: GET %s served by the PR /api/v3 read API in %s", path, time.Since(now).Round(time.Millisecond))
		}
		return true, c.Type("json").Send(out)
	}

	var apiErr *pr.APIError
	switch {
	case errors.As(err, &apiErr) && prRouteMissing(apiErr):
		registryPRAPI.markUnsupported(now)
		log.Printf("registry: the participant registry has no /api/v3 read API yet (404 on %s); serving registry reads over the M2M path for the next %s", path, prAPIRetryAfter)
		return false, nil
	case errors.As(err, &apiErr) && (apiErr.Status == http.StatusUnauthorized || apiErr.Status == http.StatusForbidden):
		// The registry did not accept the operator's token (its Keycloak realm
		// or client roles differ from the portal's). Keep the view working over
		// the M2M path and say so, once per window, so the misconfiguration is
		// visible without breaking the UI.
		if registryPRAPI.shouldWarn(now) {
			log.Printf("registry: the participant registry rejected the operator token on %s (status %d); serving registry reads over the M2M path", path, apiErr.Status)
		}
		return false, nil
	case errors.As(err, &apiErr):
		// The endpoint answered with an error of its own; relay it faithfully.
		return true, c.Status(apiErr.Status).Type("json").SendString(apiErr.Body)
	default:
		if registryPRAPI.shouldWarn(now) {
			log.Printf("registry: PR /api/v3 read API unreachable (%v); serving registry reads over the M2M path", err)
		}
		return false, nil
	}
}

// prPartiesQuery builds the /api/v3/parties query from the portal's list
// parameters, sending only what is set so the registry's defaults apply to the
// rest.
func prPartiesQuery(page, pageSize int, name, search, partyID, role string, activeOnly, certifiedOnly, mineOnly bool) url.Values {
	query := url.Values{}
	query.Set("page", strconv.Itoa(page))
	query.Set("pageSize", strconv.Itoa(pageSize))
	setIf := func(key, value string) {
		if value = strings.TrimSpace(value); value != "" {
			query.Set(key, value)
		}
	}
	setIf("name", name)
	setIf("search", search)
	setIf("id", partyID)
	setIf("role", role)
	flagIf := func(key string, on bool) {
		if on {
			query.Set(key, "true")
		}
	}
	flagIf("activeOnly", activeOnly)
	flagIf("certifiedOnly", certifiedOnly)
	flagIf("mineOnly", mineOnly)
	return query
}
