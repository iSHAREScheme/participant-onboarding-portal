// Package pr is the single integration point for the Participant Registry admin
// API (the OIDC-protected "SO.api"), distinct from the public iSHARE satellite
// API (which uses a client assertion). Every PR-admin call goes through Client so
// the connection — base URL, auth, request execution and error mapping — is
// defined once and never differs per endpoint.
//
// Auth model: the portal forwards the operator's own bearer token (the same token
// the admin authenticated to the portal with) on each call. The PR enforces its
// own authorization on that token, so the PR must trust the portal's realm/issuer
// (scope so.api). The client therefore holds no credentials of its own and is
// used per-request with the caller's token.
package pr

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"onboardingportal/config"
)

// ErrNotConfigured is returned when no PR admin API base URL is set.
var ErrNotConfigured = errors.New("participant registry admin API is not configured")

// maxBody caps how much of a PR response we read, guarding against a misbehaving
// upstream.
const maxBody = 4 << 20 // 4 MiB

// APIError carries a non-2xx PR response so callers can mirror its status + body.
type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("PR admin API returned %d: %s", e.Status, e.Body)
}

// Client talks to the PR admin API. It is cheap to construct per request.
type Client struct {
	baseURL string
	http    *http.Client
	debug   bool
}

// New builds a PR client from config. An empty base URL ⇒ not configured.
func New(cfg *config.Config) *Client {
	return &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(cfg.PrApiBaseUrl), "/"),
		http:    &http.Client{Timeout: 20 * time.Second},
		debug:   cfg.SatelliteDebug,
	}
}

// Configured reports whether a PR admin API base URL is set.
func (c *Client) Configured() bool { return c.baseURL != "" }

// Do performs one JSON request against the PR admin API. `body` (if non-nil) is
// JSON-encoded and sent as application/json; on a 2xx response with a body, the
// JSON is decoded into `out` (if non-nil). This is the request shape almost every
// endpoint uses.
func (c *Client) Do(token, method, path string, body, out interface{}) error {
	var reader io.Reader
	contentType := ""
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
		contentType = "application/json"
	}
	return c.execute(token, method, path, reader, contentType, out)
}

// DoRaw performs one request with a pre-encoded body and explicit content type,
// for the rare PR endpoint that does not accept JSON (e.g. /api/trusted/validate,
// which reads a base64 certificate as the verbatim request body). It shares the
// same execution core as Do — auth forwarding and error mapping never differ.
func (c *Client) DoRaw(token, method, path string, rawBody []byte, contentType string, out interface{}) error {
	var reader io.Reader
	if rawBody != nil {
		reader = bytes.NewReader(rawBody)
	}
	return c.execute(token, method, path, reader, contentType, out)
}

// execute is the ONLY place PR requests are run. It forwards the operator's
// bearer token (raw inbound Authorization value, with or without a "Bearer "
// prefix), applies the content type, caps the response body, maps a non-2xx
// response to an *APIError (upstream status + body, so handlers can mirror it),
// and decodes a 2xx JSON body into `out` (if non-nil).
func (c *Client) execute(token, method, path string, body io.Reader, contentType string, out interface{}) error {
	if !c.Configured() {
		return ErrNotConfigured
	}

	req, err := http.NewRequest(method, c.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if auth := normalizeBearer(token); auth != "" {
		req.Header.Set("Authorization", auth)
	}

	if c.debug {
		log.Printf("pr: %s %s", method, req.URL.String())
	}

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return &APIError{Status: res.StatusCode, Body: string(raw)}
	}
	if out != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return err
		}
	}
	return nil
}

// ── Endpoint methods ──────────────────────────────────────────────────────────
// Each PR-admin feature is a thin wrapper over Do(): same shape every time. Add
// new endpoints here (and a matching handler) — never a fresh http client.

// NetworkHealth fetches the registry's latest network/ledger status
// (GET {PR}/api/getLatestBlockDetails) — a read-only endpoint on the bearer-
// protected admin surface, and the template every other /api/* method follows
// (transfer, revoke, scheduler, dataspace + trusted-list management).
func (c *Client) NetworkHealth(token string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, "/api/getLatestBlockDetails", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// RevokeList lists the registry's revoke/transfer requests
// (GET {PR}/api/getRevokeList).
func (c *Client) RevokeList(token string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, "/api/getRevokeList", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// InitiateRevoke starts a revoke (POST {PR}/api/initiateRevoke). `body` is the
// RevokeModel the operator submitted; it is forwarded verbatim and the registry's
// FinalResponse ({status, message, …}) is returned.
func (c *Client) InitiateRevoke(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/initiateRevoke", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// TransferList lists the registry's party-transfer requests
// (GET {PR}/api/transferList).
func (c *Client) TransferList(token string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, "/api/transferList", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateTransfer requests transfer of a party to another registry
// (POST {PR}/api/transferRequest). `body` is the TransferModel ({partyId,
// transferTo, …}); the registry's FinalResponse is returned.
func (c *Client) CreateTransfer(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/transferRequest", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// DataspaceList lists the registry's dataspaces (GET {PR}/api/dataSpaceList).
// Returns {count, data:[…]}. A generous page size fetches them all in one read
// (a registry holds relatively few dataspaces).
func (c *Client) DataspaceList(token string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, "/api/dataSpaceList?page=1&pageSize=1000", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// DataspaceByID fetches one dataspace's full record for editing
// (GET {PR}/api/dataSpaceList/edit?id={id}).
func (c *Client) DataspaceByID(token, id string) (json.RawMessage, error) {
	var out json.RawMessage
	path := "/api/dataSpaceList/edit?id=" + url.QueryEscape(id)
	if err := c.Do(token, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateDataspace registers a new dataspace (POST {PR}/api/createDataSpace).
// `body` is the dataspace model; the registry's FinalResponse is returned.
func (c *Client) CreateDataspace(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/createDataSpace", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// EditDataspace updates an existing dataspace (POST {PR}/api/editDataSpace).
// `body` is the dataspace model (identified by its dataspaceID).
func (c *Client) EditDataspace(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/editDataSpace", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// TrustedList lists the registry's trusted certificate authorities
// (GET {PR}/api/ca/list). Returns {count, data:[…]}; a generous page size fetches
// them all in one read.
func (c *Client) TrustedList(token string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, "/api/ca/list?page=1&pageSize=1000", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ValidateTrustedCert validates a certificate before it is added to the trusted
// list (POST {PR}/api/trusted/validate). The PR reads the base64 of the
// certificate file as the verbatim request body (not JSON) and returns a model
// {validity, errors, model:{subject, certificateFingerprint, certificate, …}}
// used to populate the create form.
func (c *Client) ValidateTrustedCert(token, base64Cert string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.DoRaw(token, http.MethodPost, "/api/trusted/validate", []byte(base64Cert), "text/plain", &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateTrustedCA adds a certificate authority to the trusted list
// (POST {PR}/api/ca/create). `body` is the validated certificate model.
func (c *Client) CreateTrustedCA(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/ca/create", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// UpdateTrustedCA updates a trusted certificate authority (POST {PR}/api/ca/update).
func (c *Client) UpdateTrustedCA(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/ca/update", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// DeleteTrustedCA removes a certificate authority from the trusted list
// (POST {PR}/api/deleteTrustedCA). `body` is the certificate model to remove.
func (c *Client) DeleteTrustedCA(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/deleteTrustedCA", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// SchedulerList lists the registry's scheduled jobs (GET {PR}/api/getSchedulerList).
// Returns {count, data:[…]}; a generous page size fetches them all in one read.
func (c *Client) SchedulerList(token string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, "/api/getSchedulerList?page=1&page_size=1000", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateScheduler adds a scheduled job (POST {PR}/api/schedulerConfig/create).
// `body` is the scheduler config; the registry's FinalResponse is returned.
func (c *Client) CreateScheduler(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/schedulerConfig/create", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// EditScheduler updates a scheduled job (POST {PR}/api/schedulerConfig/edit).
func (c *Client) EditScheduler(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/schedulerConfig/edit", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ── Issuer-integration webhooks (ISSUER_INTEGRATION_CONTRACT.md I3/§13–15) ──────
// The PR's issuer-webhook subscriber registry + delivery outbox, all under
// {PR}/api/issuer/*. Subscriber secrets are write/rotate-only (never read back).

// IssuerSubscriberList lists registered issuer-webhook subscribers
// (GET {PR}/api/issuer/subscribers) → { subscribers:[…] }.
func (c *Client) IssuerSubscriberList(token string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, "/api/issuer/subscribers", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// IssuerSubscriberByID fetches one subscriber (GET {PR}/api/issuer/subscribers/{id}).
func (c *Client) IssuerSubscriberByID(token, id string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, "/api/issuer/subscribers/"+url.PathEscape(id), nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateIssuerSubscriber registers a subscriber (POST {PR}/api/issuer/subscribers).
// The PR returns the generated signing secret once, in the response.
func (c *Client) CreateIssuerSubscriber(token string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/issuer/subscribers", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// UpdateIssuerSubscriber edits a subscriber (PATCH {PR}/api/issuer/subscribers/{id}).
func (c *Client) UpdateIssuerSubscriber(token, id string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPatch, "/api/issuer/subscribers/"+url.PathEscape(id), body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// DeleteIssuerSubscriber removes a subscriber (DELETE {PR}/api/issuer/subscribers/{id}).
func (c *Client) DeleteIssuerSubscriber(token, id string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodDelete, "/api/issuer/subscribers/"+url.PathEscape(id), nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// RotateIssuerSubscriberSecret rotates a subscriber's signing secret
// (POST {PR}/api/issuer/subscribers/{id}/rotate-secret). `body` may carry an
// {overlapSeconds} override; the PR returns the new secret once.
func (c *Client) RotateIssuerSubscriberSecret(token, id string, body interface{}) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/issuer/subscribers/"+url.PathEscape(id)+"/rotate-secret", body, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// IssuerDeliveryList lists webhook deliveries (GET {PR}/api/issuer/deliveries),
// forwarding the operator's filter query (status/partyId/subscriberId/limit).
func (c *Client) IssuerDeliveryList(token, rawQuery string) (json.RawMessage, error) {
	path := "/api/issuer/deliveries"
	if strings.TrimSpace(rawQuery) != "" {
		path += "?" + rawQuery
	}
	var out json.RawMessage
	if err := c.Do(token, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// RedeliverIssuerDelivery requeues a failed/dead delivery
// (POST {PR}/api/issuer/deliveries/{id}/redeliver).
func (c *Client) RedeliverIssuerDelivery(token, id string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/issuer/deliveries/"+url.PathEscape(id)+"/redeliver", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ReemitParty re-enqueues a party.updated event for a party
// (POST {PR}/api/issuer/parties/{partyId}/reemit).
func (c *Client) ReemitParty(token, partyID string) (json.RawMessage, error) {
	var out json.RawMessage
	if err := c.Do(token, http.MethodPost, "/api/issuer/parties/"+url.PathEscape(partyID)+"/reemit", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// normalizeBearer ensures a single "Bearer " prefix on a raw token value.
func normalizeBearer(token string) string {
	t := strings.TrimSpace(token)
	if t == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(t), "bearer ") {
		return t
	}
	return "Bearer " + t
}
