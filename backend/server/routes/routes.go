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
}

func GroupPartyRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerParty(server, config)

	group.Post("/", handler.CreateParty)
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

	group.Post("/", handler.CreateParties)

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

	// Onboarding agreements. Reads are public (the onboarding flow lists and
	// downloads the documents); mutations are admin-only. Protected-URL
	// credentials are encrypted at rest and redacted on read.
	agreements := handlers.NewHandlerAgreements(server, config)
	group.Get("/settings/agreements", agreements.ListAgreements)
	group.Get("/settings/agreements/:id/document", agreements.DownloadAgreementDocument)
	group.Post("/settings/agreements/file", middlewares.RequireAdminRole(), agreements.UploadAgreementFile)
	group.Post("/settings/agreements/url", middlewares.RequireAdminRole(), agreements.AddAgreementURL)
	group.Put("/settings/agreements/:id", middlewares.RequireAdminRole(), agreements.UpdateAgreement)
	group.Delete("/settings/agreements/:id", middlewares.RequireAdminRole(), agreements.DeleteAgreement)
}

func GroupRegistryRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerRegistry(server, config)
	group.Get("/", handler.GetRegistry)
	group.Get("/version", handler.GetSatelliteVersion)
	group.Get("/connection", middlewares.RequireAdminRole(), handler.GetConnection)
	group.Post("/test", middlewares.RequireAdminRole(), handler.TestConnection)
	group.Get("/dataspaces", middlewares.RequireAdminRole(), handler.GetDataspaces)
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

// func SetupRoutes(app *fiber.App) {
// 	api := app.Group("/api")

// 	// Add the propose endpoint
// 	api.Post("/propose", handlers.HandlePropose)

// 	// ... other routes ...
// }
