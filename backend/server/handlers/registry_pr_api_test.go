package handlers

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"onboardingportal/config"
)

// fakePR is a stand-in Participant Registry that records what the relay sends
// and answers with a scripted status/body.
type fakePR struct {
	server *httptest.Server
	calls  atomic.Int32
	status int
	body   string
	// last request seen
	lastAuth  string
	lastPath  string
	lastQuery string
}

func newFakePR(t *testing.T, status int, body string) *fakePR {
	t.Helper()
	f := &fakePR{status: status, body: body}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.calls.Add(1)
		f.lastAuth = r.Header.Get("Authorization")
		f.lastPath = r.URL.Path
		f.lastQuery = r.URL.RawQuery
		if strings.HasPrefix(strings.TrimSpace(f.body), "{") {
			w.Header().Set("Content-Type", "application/json")
		}
		w.WriteHeader(f.status)
		_, _ = io.WriteString(w, f.body)
	}))
	t.Cleanup(f.server.Close)
	return f
}

// relayProbeApp mounts a route that runs relayRegistryRead and reports whether it
// fell back, so each branch of the relay can be asserted without a satellite.
func relayProbeApp(handler *HandlerRegistry, path string, query url.Values) *fiber.App {
	app := fiber.New()
	app.Get("/probe", func(c *fiber.Ctx) error {
		handled, err := handler.relayRegistryRead(c, path, query)
		if !handled {
			return c.Status(fiber.StatusOK).SendString("fallback")
		}
		return err
	})
	return app
}

func probe(t *testing.T, app *fiber.App) (int, string) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/probe", nil)
	request.Header.Set("Authorization", "Bearer operator-token")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("probe: %v", err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	return response.StatusCode, string(body)
}

func TestRelayRegistryReadForwardsTokenAndRelaysBody(t *testing.T) {
	registryPRAPI.reset()
	t.Cleanup(registryPRAPI.reset)
	pr := newFakePR(t, http.StatusOK, `{"data":[{"id":"did:ishare:x"}],"page":1,"pageSize":10,"total":1,"totalPages":1,"registrarId":"did:ishare:r"}`)
	handler := &HandlerRegistry{Config: &config.Config{PrApiBaseUrl: pr.server.URL}}

	status, body := probe(t, relayProbeApp(handler, "/api/v3/parties", url.Values{"page": {"1"}, "mineOnly": {"true"}}))
	if status != http.StatusOK || body != pr.body {
		t.Fatalf("status=%d body=%s, want relayed registry body", status, body)
	}
	if pr.lastAuth != "Bearer operator-token" {
		t.Fatalf("registry saw Authorization %q, want the operator's bearer", pr.lastAuth)
	}
	if pr.lastPath != "/api/v3/parties" || !strings.Contains(pr.lastQuery, "mineOnly=true") || !strings.Contains(pr.lastQuery, "page=1") {
		t.Fatalf("registry saw %s?%s", pr.lastPath, pr.lastQuery)
	}
	if registryPRAPI.unsupported(timeNow()) {
		t.Fatal("a successful relay must not mark the registry unsupported")
	}
}

func TestRelayRegistryReadFallsBackWhenRouteMissingAndRemembersIt(t *testing.T) {
	registryPRAPI.reset()
	t.Cleanup(registryPRAPI.reset)
	pr := newFakePR(t, http.StatusNotFound, "404 page not found\n")
	handler := &HandlerRegistry{Config: &config.Config{PrApiBaseUrl: pr.server.URL}}
	app := relayProbeApp(handler, "/api/v3/dataspaces", nil)

	if status, body := probe(t, app); status != http.StatusOK || body != "fallback" {
		t.Fatalf("first probe status=%d body=%s, want fallback", status, body)
	}
	if !registryPRAPI.unsupported(timeNow()) {
		t.Fatal("router 404 must mark the registry as lacking /api/v3")
	}
	if status, body := probe(t, app); status != http.StatusOK || body != "fallback" {
		t.Fatalf("second probe status=%d body=%s, want fallback", status, body)
	}
	if got := pr.calls.Load(); got != 1 {
		t.Fatalf("registry probed %d times, want 1 (remembered for the retry window)", got)
	}
}

func TestRelayRegistryReadRelaysEndpointErrors(t *testing.T) {
	registryPRAPI.reset()
	t.Cleanup(registryPRAPI.reset)
	pr := newFakePR(t, http.StatusNotFound, `{"error":"participant not found"}`)
	handler := &HandlerRegistry{Config: &config.Config{PrApiBaseUrl: pr.server.URL}}

	status, body := probe(t, relayProbeApp(handler, "/api/v3/parties/did:ishare:missing", nil))
	if status != http.StatusNotFound || body != pr.body {
		t.Fatalf("status=%d body=%s, want the registry's 404 relayed", status, body)
	}
	if registryPRAPI.unsupported(timeNow()) {
		t.Fatal("an endpoint 404 (unknown party) must not mark the registry unsupported")
	}
}

func TestRelayRegistryReadFallsBackWhenTokenRejected(t *testing.T) {
	registryPRAPI.reset()
	t.Cleanup(registryPRAPI.reset)
	pr := newFakePR(t, http.StatusUnauthorized, `{"error":"unauthorized"}`)
	handler := &HandlerRegistry{Config: &config.Config{PrApiBaseUrl: pr.server.URL}}

	if status, body := probe(t, relayProbeApp(handler, "/api/v3/parties", nil)); status != http.StatusOK || body != "fallback" {
		t.Fatalf("status=%d body=%s, want fallback on a rejected token", status, body)
	}
	if registryPRAPI.unsupported(timeNow()) {
		t.Fatal("a rejected token must not mark the registry as lacking /api/v3 (it is a config problem, re-tried per request)")
	}
}

func TestRelayRegistryReadFallsBackWhenNotConfiguredOrUnreachable(t *testing.T) {
	registryPRAPI.reset()
	t.Cleanup(registryPRAPI.reset)

	handler := &HandlerRegistry{Config: &config.Config{}}
	if status, body := probe(t, relayProbeApp(handler, "/api/v3/parties", nil)); status != http.StatusOK || body != "fallback" {
		t.Fatalf("unconfigured: status=%d body=%s, want fallback", status, body)
	}

	pr := newFakePR(t, http.StatusOK, "{}")
	pr.server.Close() // configured but unreachable
	handler = &HandlerRegistry{Config: &config.Config{PrApiBaseUrl: pr.server.URL}}
	if status, body := probe(t, relayProbeApp(handler, "/api/v3/parties", nil)); status != http.StatusOK || body != "fallback" {
		t.Fatalf("unreachable: status=%d body=%s, want fallback", status, body)
	}
	if registryPRAPI.unsupported(timeNow()) {
		t.Fatal("a transport failure must not mark the registry as lacking /api/v3")
	}
}

func TestPRPartiesQuerySendsOnlySetParameters(t *testing.T) {
	query := prPartiesQuery(2, 25, "", " acme ", "", "ServiceProvider", true, false, false)
	if query.Get("page") != "2" || query.Get("pageSize") != "25" {
		t.Fatalf("paging = %v", query)
	}
	if query.Get("search") != "acme" || query.Get("role") != "ServiceProvider" || query.Get("activeOnly") != "true" {
		t.Fatalf("filters = %v", query)
	}
	for _, absent := range []string{"name", "id", "certifiedOnly", "mineOnly"} {
		if _, present := query[absent]; present {
			t.Fatalf("%s must be absent when unset: %v", absent, query)
		}
	}
}

// TestRegistryReadHandlersRelayThroughPRAPI drives the real handlers through the
// relay so a regression in the wiring (a handler that forgot to relay, or relays
// the wrong path) is caught without a satellite.
func TestRegistryReadHandlersRelayThroughPRAPI(t *testing.T) {
	registryPRAPI.reset()
	t.Cleanup(registryPRAPI.reset)
	pr := newFakePR(t, http.StatusOK, `{"ok":true}`)
	handler := &HandlerRegistry{Config: &config.Config{PrApiBaseUrl: pr.server.URL}}
	app := fiber.New()
	app.Get("/registry/participants", handler.GetParticipants)
	app.Get("/registry/participants/detail", handler.GetParticipantDetail)
	app.Get("/registry/participants/history", handler.GetParticipantHistory)
	app.Get("/registry/dataspaces", handler.GetDataspaces)
	app.Get("/registry/frameworks", handler.GetFrameworks)

	tests := []struct {
		portal    string
		wantPath  string
		wantQuery []string
	}{
		{"/registry/participants?page=2&pageSize=20&search=acme&role=ServiceProvider&mineOnly=true", "/api/v3/parties", []string{"page=2", "pageSize=20", "search=acme", "role=ServiceProvider", "mineOnly=true"}},
		{"/registry/participants/detail?eori=did:ishare:EU.NL.NTRNL-KVK-1", "/api/v3/parties/did:ishare:EU.NL.NTRNL-KVK-1", nil},
		{"/registry/participants/history?id=did:ishare:EU.NL.NTRNL-KVK-1", "/api/v3/parties/did:ishare:EU.NL.NTRNL-KVK-1/history", nil},
		{"/registry/dataspaces", "/api/v3/dataspaces", nil},
		{"/registry/frameworks?page=3&pageSize=5", "/api/v3/frameworks", []string{"page=3", "pageSize=5"}},
	}
	for _, tt := range tests {
		t.Run(tt.portal, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, tt.portal, nil)
			request.Header.Set("Authorization", "Bearer operator-token")
			response, err := app.Test(request)
			if err != nil {
				t.Fatalf("request: %v", err)
			}
			defer response.Body.Close()
			body, _ := io.ReadAll(response.Body)
			if response.StatusCode != http.StatusOK || string(body) != pr.body {
				t.Fatalf("status=%d body=%s, want relayed registry body", response.StatusCode, body)
			}
			if pr.lastPath != tt.wantPath {
				t.Fatalf("registry path = %s, want %s", pr.lastPath, tt.wantPath)
			}
			for _, fragment := range tt.wantQuery {
				if !strings.Contains(pr.lastQuery, fragment) {
					t.Fatalf("registry query %q lacks %q", pr.lastQuery, fragment)
				}
			}
			if pr.lastAuth != "Bearer operator-token" {
				t.Fatalf("registry saw Authorization %q", pr.lastAuth)
			}
		})
	}
}

func timeNow() time.Time { return time.Now() }
