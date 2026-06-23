package handlers

import (
	"encoding/json"
	"errors"

	"onboardingportal/config"
	"onboardingportal/integrations/pr"
	"onboardingportal/responses"
	s "onboardingportal/server"

	"github.com/gofiber/fiber/v2"
)

// HandlerPR proxies Participant-Registry admin actions to the PR admin API
// (SO.api). Every PR-admin endpoint shares this handler and the single pr.Client,
// so the integration — auth (forwarded operator token), request execution and
// error mapping — never differs per endpoint. Routes are admin-gated here; the PR
// enforces its own authorization on the forwarded token.
type HandlerPR struct {
	Server *s.Server
	Config *config.Config
	client *pr.Client
}

func NewHandlerPR(server *s.Server, cfg *config.Config) *HandlerPR {
	return &HandlerPR{Server: server, Config: cfg, client: pr.New(cfg)}
}

// prBearer returns the raw inbound Authorization header to forward to the PR
// (the operator's own token, already validated by the auth middleware).
func prBearer(c *fiber.Ctx) string { return c.Get(fiber.HeaderAuthorization) }

// relayPRError maps a pr.Client error to a Fiber response: not-configured → 501,
// an upstream non-2xx → the same status + body (so a PR 401/403/4xx surfaces
// faithfully), and any transport failure → 502.
func relayPRError(c *fiber.Ctx, err error) error {
	if errors.Is(err, pr.ErrNotConfigured) {
		return responses.ErrorResponse(c, fiber.StatusNotImplemented, "Participant registry admin API is not configured")
	}
	var apiErr *pr.APIError
	if errors.As(err, &apiErr) {
		return c.Status(apiErr.Status).Type("json").SendString(apiErr.Body)
	}
	return responses.ErrorResponse(c, fiber.StatusBadGateway, "The participant registry is currently unavailable")
}

// GetNetworkHealth proxies GET {PR}/api/getLatestBlockDetails — the canonical
// PR-admin (/api/*) proxy on the co-deployed bearer surface: admin-gated, the
// operator's token forwarded, the upstream response (or status) relayed. Every
// other /api/* endpoint follows this exact three-line shape.
func (h *HandlerPR) GetNetworkHealth(c *fiber.Ctx) error {
	out, err := h.client.NetworkHealth(prBearer(c))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// GetRevokeList proxies GET {PR}/api/getRevokeList — the registry's revoke/transfer
// requests (read).
func (h *HandlerPR) GetRevokeList(c *fiber.Ctx) error {
	out, err := h.client.RevokeList(prBearer(c))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// forwardBody is the shared write-handler body: parse the JSON request body and
// run it through a pr.Client write method (forwarding the operator's token),
// relaying the registry's response or mirrored error. Every POST PR-admin handler
// is a one-liner over this — the write pattern never differs per endpoint.
func (h *HandlerPR) forwardBody(
	c *fiber.Ctx,
	call func(token string, body interface{}) (json.RawMessage, error),
) error {
	var body map[string]interface{}
	if len(c.Body()) > 0 {
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid request body")
		}
	}
	out, err := call(prBearer(c), body)
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// InitiateRevoke proxies POST {PR}/api/initiateRevoke (RevokeModel body). Gated
// behind a confirmation in the UI.
func (h *HandlerPR) InitiateRevoke(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.InitiateRevoke)
}

// GetTransferList proxies GET {PR}/api/transferList — party-transfer requests (read).
func (h *HandlerPR) GetTransferList(c *fiber.Ctx) error {
	out, err := h.client.TransferList(prBearer(c))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// CreateTransfer proxies POST {PR}/api/transferRequest (TransferModel body) —
// request transfer of a party to another registry.
func (h *HandlerPR) CreateTransfer(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.CreateTransfer)
}

// GetDataspaceList proxies GET {PR}/api/dataSpaceList — the registry's
// dataspaces with full records (read).
func (h *HandlerPR) GetDataspaceList(c *fiber.Ctx) error {
	out, err := h.client.DataspaceList(prBearer(c))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// GetDataspaceDetail proxies GET {PR}/api/dataSpaceList/edit?id={id} — one
// dataspace's full record, used to populate the edit form.
func (h *HandlerPR) GetDataspaceDetail(c *fiber.Ctx) error {
	id := c.Query("id")
	if id == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "A dataspace id is required")
	}
	out, err := h.client.DataspaceByID(prBearer(c), id)
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// CreateDataspace proxies POST {PR}/api/createDataSpace (dataspace model body).
func (h *HandlerPR) CreateDataspace(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.CreateDataspace)
}

// EditDataspace proxies POST {PR}/api/editDataSpace (dataspace model body).
func (h *HandlerPR) EditDataspace(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.EditDataspace)
}

// GetTrustedList proxies GET {PR}/api/ca/list — the registry's trusted
// certificate authorities with full records (read).
func (h *HandlerPR) GetTrustedList(c *fiber.Ctx) error {
	out, err := h.client.TrustedList(prBearer(c))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// ValidateTrustedCert proxies POST {PR}/api/trusted/validate. The frontend posts
// JSON { certificate: "<base64>" } (uniform with the rest of the API); this hop
// forwards the base64 to the PR as the verbatim body it expects, keeping the
// non-JSON quirk contained to the integration layer.
func (h *HandlerPR) ValidateTrustedCert(c *fiber.Ctx) error {
	var in struct {
		Certificate string `json:"certificate"`
	}
	if err := json.Unmarshal(c.Body(), &in); err != nil || in.Certificate == "" {
		return responses.ErrorResponse(c, fiber.StatusBadRequest, "A base64-encoded certificate is required")
	}
	out, err := h.client.ValidateTrustedCert(prBearer(c), in.Certificate)
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// CreateTrustedCA proxies POST {PR}/api/ca/create (validated certificate model).
func (h *HandlerPR) CreateTrustedCA(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.CreateTrustedCA)
}

// UpdateTrustedCA proxies POST {PR}/api/ca/update (certificate model body).
func (h *HandlerPR) UpdateTrustedCA(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.UpdateTrustedCA)
}

// DeleteTrustedCA proxies POST {PR}/api/deleteTrustedCA (certificate model body).
func (h *HandlerPR) DeleteTrustedCA(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.DeleteTrustedCA)
}

// GetSchedulerList proxies GET {PR}/api/getSchedulerList — the registry's
// scheduled jobs with full records (read).
func (h *HandlerPR) GetSchedulerList(c *fiber.Ctx) error {
	out, err := h.client.SchedulerList(prBearer(c))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// CreateScheduler proxies POST {PR}/api/schedulerConfig/create (scheduler config body).
func (h *HandlerPR) CreateScheduler(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.CreateScheduler)
}

// EditScheduler proxies POST {PR}/api/schedulerConfig/edit (scheduler config body).
func (h *HandlerPR) EditScheduler(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.EditScheduler)
}
