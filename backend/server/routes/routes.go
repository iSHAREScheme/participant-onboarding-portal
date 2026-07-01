package routes

import (
	"onboardingportal/config"
	"onboardingportal/responses"
	s "onboardingportal/server"
	"onboardingportal/server/handlers"
	"onboardingportal/server/middlewares"

	"github.com/gofiber/fiber/v2"
)

func ConfigureRoutes(server *s.Server, config *config.Config) {
	server.App.Get("/healthcheck", func(c *fiber.Ctx) error {
		return responses.MessageResponse(c, fiber.StatusOK, "Server is running")
	})

	groupParty := server.App.Group("/party")
	GroupPartyRequests(server, groupParty, config)

	// iSHARE v3.0 claim-based party creation (register-new-party)
	groupParties := server.App.Group("/parties")
	GroupPartiesRequests(server, groupParties, config)

	// Add settings routes
	groupSettings := server.App.Group("/")
	GroupSettingsRequests(server, groupSettings, config)

	// Add registry route
	groupRegistry := server.App.Group("/registry")
	GroupRegistryRequests(server, groupRegistry, config)

	groupDelegations := server.App.Group("/delegations")
	GroupDelegationRequests(server, groupDelegations, config)

	// Current user's own account (e.g. profile email/name). Authenticated, not
	// admin-gated — the target user is the token's own subject.
	groupMe := server.App.Group("/me")
	GroupMeRequests(server, groupMe, config)

	// Participant Registry admin proxy (SO.api). Admin-gated; each endpoint
	// forwards the operator's token through the single pr.Client.
	groupPR := server.App.Group("/pr")
	GroupPRRequests(server, groupPR, config)
}

func GroupPartyRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerParty(server, config)

	// Direct v2 party creation (manual operator tool, served by /submit). It
	// registers a party in the satellite with the registrar owner token, so it is
	// admin-only; the governed applicant path is propose → approve → sign →
	// complete (CompleteProposal posts to the satellite internally).
	group.Post("/", middlewares.RequireAdminRole(), handler.CreateParty)
	group.Post("/propose", handler.HandlePropose)
	group.Get("/proposals/:id", handler.GetProposalByID)
	group.Get("/proposals/users/:keycloakUsername", handler.GetProposalByKeycloakUsername)
	group.Put("/proposals/users/:keycloakUsername/sign", handler.SignProposal)
	group.Put("/proposals/users/:keycloakUsername/modify", handler.ModifyProposal)
	group.Put("/proposals/:id/complete", handler.CompleteProposal)

	// Admin-protected endpoints (realm role)
	group.Get("/proposals", middlewares.RequireAdminRole(), handler.GetProposals)
	group.Put("/proposals/:id/approve", middlewares.RequireAdminRole(), handler.ApproveProposal)
	group.Put("/proposals/:id/reject", middlewares.RequireAdminRole(), handler.RejectProposal)
	group.Get("/proposals/:id/agreement", middlewares.RequireAdminRole(), handler.DownloadAgreement)
}

func GroupPartiesRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerParty(server, config)

	// Direct v3 claim-based party creation (manual operator tool, served by
	// /submit). It registers a party in the satellite with the registrar owner
	// token, so it is admin-only; the governed applicant path is propose →
	// approve → sign → complete (CompleteProposal posts to the satellite
	// internally).
	group.Post("/", middlewares.RequireAdminRole(), handler.CreateParties)

	// Admin-protected party/claim updates (proxied to the satellite).
	//   PUT   /parties/:id                  → v2.2 full party-update
	//   PATCH /parties/:id                  → v3.0 update-party-information
	//   PATCH /parties/:id/claims/:claimId  → v3.0 update-claim-information
	group.Put("/:id", middlewares.RequireAdminRole(), handler.UpdateParty)
	group.Patch("/:id", middlewares.RequireAdminRole(), handler.PatchParty)
	group.Patch("/:id/claims/:claimId", middlewares.RequireAdminRole(), handler.PatchClaim)
}

func GroupSettingsRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerSettings(server, config)

	// Full settings (incl. satellite connection config, registrar/dataspace IDs,
	// theme library) require authentication — see the auth middleware allowlist.
	group.Get("/settings", handler.GetSettings)
	// Public branding + content subset for the landing page and app-wide theming.
	group.Get("/settings/public", handler.GetPublicSettings)
	group.Post("/settings", middlewares.RequireAdminRole(), handler.UpdateSettings)
	group.Post("/settings/logo", middlewares.RequireAdminRole(), handler.UploadLogo)
	group.Get("/settings/logo", handler.GetLogo)
	group.Post("/settings/favicon", middlewares.RequireAdminRole(), handler.UploadFavicon)
	group.Get("/settings/favicon", handler.GetFavicon)

	// Onboarding agreements. The document downloads stay public (the landing page
	// previews them before login), but the full list — which carries each
	// agreement's source URL and fetch-auth config — is admin-only; the public
	// landing reads a minimal subset from /settings/public instead. Mutations are
	// admin-only. Protected-URL credentials are encrypted at rest, redacted on read.
	agreements := handlers.NewHandlerAgreements(server, config)
	group.Get("/settings/agreements", middlewares.RequireAdminRole(), agreements.ListAgreements)
	group.Get("/settings/agreements/:id/document", agreements.DownloadAgreementDocument)
	group.Post("/settings/agreements/file", middlewares.RequireAdminRole(), agreements.UploadAgreementFile)
	group.Post("/settings/agreements/url", middlewares.RequireAdminRole(), agreements.AddAgreementURL)
	group.Put("/settings/agreements/:id", middlewares.RequireAdminRole(), agreements.UpdateAgreement)
	group.Delete("/settings/agreements/:id", middlewares.RequireAdminRole(), agreements.DeleteAgreement)

	// Authentication: the realm's identity providers and SMTP settings live in
	// Keycloak and are managed here via the Keycloak Admin API. Admin-only; IdP
	// client secrets and the SMTP password are redacted on read and preserved on
	// update when left blank.
	kc := handlers.NewHandlerKeycloak(server, config)
	group.Get("/settings/idps", middlewares.RequireAdminRole(), kc.ListIdps)
	group.Post("/settings/idps", middlewares.RequireAdminRole(), kc.CreateIdp)
	group.Get("/settings/idps/:alias", middlewares.RequireAdminRole(), kc.GetIdp)
	group.Put("/settings/idps/:alias", middlewares.RequireAdminRole(), kc.UpdateIdp)
	group.Delete("/settings/idps/:alias", middlewares.RequireAdminRole(), kc.DeleteIdp)
	// Per-IdP claim mappers (external claim → Keycloak user attribute).
	group.Get("/settings/idps/:alias/mappers", middlewares.RequireAdminRole(), kc.ListIdpMappers)
	group.Post("/settings/idps/:alias/mappers", middlewares.RequireAdminRole(), kc.CreateIdpMapper)
	group.Delete("/settings/idps/:alias/mappers/:id", middlewares.RequireAdminRole(), kc.DeleteIdpMapper)
	group.Get("/settings/smtp", middlewares.RequireAdminRole(), kc.GetSmtp)
	group.Put("/settings/smtp", middlewares.RequireAdminRole(), kc.UpdateSmtp)
	group.Post("/settings/smtp/test", middlewares.RequireAdminRole(), kc.TestSmtp)

	// Realm user administration for the admin Users page, proxied through the BFF so
	// the Keycloak admin API stays private to the edge and only needs the backend's
	// own admin credentials (callers are gated on the onboarding-admin role).
	group.Get("/users", middlewares.RequireAdminRole(), kc.ListUsers)
	group.Post("/users", middlewares.RequireAdminRole(), kc.CreateUser)
	group.Delete("/users/:id", middlewares.RequireAdminRole(), kc.DeleteUser)
}

func GroupRegistryRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerRegistry(server, config)
	group.Get("/", handler.GetRegistry)
	group.Get("/version", handler.GetSatelliteVersion)
	// The applicant's own registered party (scoped to their token's proposal).
	group.Get("/me/party", handler.GetMyParty)
	// Verifiable-credential offers for the caller's own party, polled from the
	// external iSHARE VC issuer (the portal is the "ObP" poller — it never signs).
	// The party id is derived server-side from the caller's proposal (IDOR-safe).
	group.Get("/me/credentials", handler.GetMyCredentialOffers)
	group.Post("/me/credentials/request", handler.RequestMyCredentials)
	group.Post("/me/credentials/refresh", handler.RefreshMyCredentialOffers)
	group.Post("/me/credentials/reprocess", handler.ReprocessMyCredentials)
	group.Get("/connection", middlewares.RequireAdminRole(), handler.GetConnection)
	group.Post("/test", middlewares.RequireAdminRole(), handler.TestConnection)
	group.Get("/dataspaces", middlewares.RequireAdminRole(), handler.GetDataspaces)
	group.Get("/frameworks", middlewares.RequireAdminRole(), handler.GetFrameworks)
	group.Get("/participants", middlewares.RequireAdminRole(), handler.GetParticipants)
	group.Get("/participants/detail", middlewares.RequireAdminRole(), handler.GetParticipantDetail)
	group.Post("/certificate/validate", handler.VerifyTrustedCertificate)
}

func GroupDelegationRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerDelegation(server, config)
	group.Get("/me", handler.GetOverview)
	group.Post("/idp-connections", handler.CreateIdpConnection)
	group.Post("/members", handler.CreateMember)
}

// GroupPRRequests mounts the Participant-Registry admin proxy. Every endpoint is
// admin-gated and routes through HandlerPR + the single pr.Client (forwarding the
// operator's token), so adding the remaining PR features — dataspace, revoke,
// transfer, scheduler, network health, versions — is a uniform one-method change.
func GroupPRRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerPR(server, config)
	// This portal exposes only satellite-level PR functions. Scheme-owner-only
	// features (trusted list, dataspaces, revoke) are intentionally absent — no route,
	// no handler, no role reference — so non-scheme-owners have nothing to reach.
	// Network/ledger health (read-only).
	group.Get("/network-health", middlewares.RequireAdminRole(), handler.GetNetworkHealth)
	// Transfer a party's ownership to another registry: list (read) + request (write).
	group.Get("/transfer/requests", middlewares.RequireAdminRole(), handler.GetTransferList)
	group.Post("/transfer", middlewares.RequireAdminRole(), handler.CreateTransfer)
	// Scheduler: list (read) + create/edit (write). The PR exposes no delete.
	group.Get("/scheduler", middlewares.RequireAdminRole(), handler.GetSchedulerList)
	group.Post("/scheduler", middlewares.RequireAdminRole(), handler.CreateScheduler)
	group.Put("/scheduler", middlewares.RequireAdminRole(), handler.EditScheduler)
	// Issuer-integration webhooks: subscriber registry (list/get/create/update/
	// delete + secret rotation) and the delivery outbox (list + redeliver +
	// re-emit for a party). Subscriber secrets are write/rotate-only.
	group.Get("/issuer/subscribers", middlewares.RequireAdminRole(), handler.ListIssuerSubscribers)
	group.Post("/issuer/subscribers", middlewares.RequireAdminRole(), handler.CreateIssuerSubscriber)
	group.Get("/issuer/subscribers/:id", middlewares.RequireAdminRole(), handler.GetIssuerSubscriber)
	group.Patch("/issuer/subscribers/:id", middlewares.RequireAdminRole(), handler.UpdateIssuerSubscriber)
	group.Delete("/issuer/subscribers/:id", middlewares.RequireAdminRole(), handler.DeleteIssuerSubscriber)
	group.Post("/issuer/subscribers/:id/rotate-secret", middlewares.RequireAdminRole(), handler.RotateIssuerSubscriberSecret)
	group.Get("/issuer/deliveries", middlewares.RequireAdminRole(), handler.ListIssuerDeliveries)
	group.Post("/issuer/deliveries/:id/redeliver", middlewares.RequireAdminRole(), handler.RedeliverIssuerDelivery)
	group.Post("/issuer/parties/:partyId/reemit", middlewares.RequireAdminRole(), handler.ReemitPartyEvents)
}

func GroupMeRequests(server *s.Server, group fiber.Router, config *config.Config) {
	kc := handlers.NewHandlerKeycloak(server, config)
	// Update the caller's OWN profile (email/name). The Keycloak user id is taken
	// from the token subject, so this can't be used to edit anyone else.
	group.Put("/profile", kc.UpdateMyProfile)
}

// func SetupRoutes(app *fiber.App) {
// 	api := app.Group("/api")

// 	// Add the propose endpoint
// 	api.Post("/propose", handlers.HandlePropose)

// 	// ... other routes ...
// }
