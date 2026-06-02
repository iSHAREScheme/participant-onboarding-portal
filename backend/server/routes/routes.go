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

	group.Get("/settings", handler.GetSettings)
	group.Post("/settings", middlewares.RequireAdminRole(), handler.UpdateSettings)
	group.Post("/settings/logo", middlewares.RequireAdminRole(), handler.UploadLogo)
	group.Get("/settings/logo", handler.GetLogo)
}

func GroupRegistryRequests(server *s.Server, group fiber.Router, config *config.Config) {
	handler := handlers.NewHandlerRegistry(server, config)
	group.Get("/", handler.GetRegistry)
	group.Get("/version", handler.GetSatelliteVersion)
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
