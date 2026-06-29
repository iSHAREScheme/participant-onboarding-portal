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
//
// This portal exposes only satellite-level functions (network health, transfer,
// scheduler, issuer webhooks). Scheme-owner-only features (trusted list,
// dataspaces, revoke) are intentionally NOT proxied here — they belong to the
// scheme-owner satellite UI, not this onboarding portal.
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

// ── Issuer-integration webhooks (subscriber registry + delivery outbox) ─────────

// ListIssuerSubscribers proxies GET {PR}/api/issuer/subscribers — registered
// issuer/adapter webhook endpoints (read; secrets are never returned).
func (h *HandlerPR) ListIssuerSubscribers(c *fiber.Ctx) error {
	out, err := h.client.IssuerSubscriberList(prBearer(c))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// GetIssuerSubscriber proxies GET {PR}/api/issuer/subscribers/{id}.
func (h *HandlerPR) GetIssuerSubscriber(c *fiber.Ctx) error {
	out, err := h.client.IssuerSubscriberByID(prBearer(c), c.Params("id"))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// CreateIssuerSubscriber proxies POST {PR}/api/issuer/subscribers. The PR returns
// the generated signing secret once in the response (shown to the operator).
func (h *HandlerPR) CreateIssuerSubscriber(c *fiber.Ctx) error {
	return h.forwardBody(c, h.client.CreateIssuerSubscriber)
}

// UpdateIssuerSubscriber proxies PATCH {PR}/api/issuer/subscribers/{id}.
func (h *HandlerPR) UpdateIssuerSubscriber(c *fiber.Ctx) error {
	var body map[string]interface{}
	if len(c.Body()) > 0 {
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid request body")
		}
	}
	out, err := h.client.UpdateIssuerSubscriber(prBearer(c), c.Params("id"), body)
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// DeleteIssuerSubscriber proxies DELETE {PR}/api/issuer/subscribers/{id}.
func (h *HandlerPR) DeleteIssuerSubscriber(c *fiber.Ctx) error {
	out, err := h.client.DeleteIssuerSubscriber(prBearer(c), c.Params("id"))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// RotateIssuerSubscriberSecret proxies POST {PR}/api/issuer/subscribers/{id}/rotate-secret.
// An optional {overlapSeconds} body is forwarded; the PR returns the new secret once.
func (h *HandlerPR) RotateIssuerSubscriberSecret(c *fiber.Ctx) error {
	var body map[string]interface{}
	if len(c.Body()) > 0 {
		if err := json.Unmarshal(c.Body(), &body); err != nil {
			return responses.ErrorResponse(c, fiber.StatusBadRequest, "Invalid request body")
		}
	}
	out, err := h.client.RotateIssuerSubscriberSecret(prBearer(c), c.Params("id"), body)
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// ListIssuerDeliveries proxies GET {PR}/api/issuer/deliveries, forwarding the
// operator's filter query (status/partyId/subscriberId/limit) verbatim.
func (h *HandlerPR) ListIssuerDeliveries(c *fiber.Ctx) error {
	out, err := h.client.IssuerDeliveryList(prBearer(c), string(c.Request().URI().QueryString()))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// RedeliverIssuerDelivery proxies POST {PR}/api/issuer/deliveries/{id}/redeliver.
func (h *HandlerPR) RedeliverIssuerDelivery(c *fiber.Ctx) error {
	out, err := h.client.RedeliverIssuerDelivery(prBearer(c), c.Params("id"))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}

// ReemitPartyEvents proxies POST {PR}/api/issuer/parties/{partyId}/reemit.
func (h *HandlerPR) ReemitPartyEvents(c *fiber.Ctx) error {
	out, err := h.client.ReemitParty(prBearer(c), c.Params("partyId"))
	if err != nil {
		return relayPRError(c, err)
	}
	return c.Type("json").Send(out)
}
