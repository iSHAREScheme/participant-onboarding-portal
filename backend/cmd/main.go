// @title           iSHARE Onboarding API
// @version         1.0
// @description     Backend API for the iSHARE onboarding portal.
// @contact.name    Protium.digital
// @contact.email   joost@protium.digital
// @BasePath        /api
// @schemes         http
package main

import (
	fiberSwagger "github.com/swaggo/fiber-swagger"
	"log"
	"onboardingportal/config"
	_ "onboardingportal/docs"
	"onboardingportal/integrations/satellite"
	"onboardingportal/models"
	"onboardingportal/server"
	"onboardingportal/server/routes"
)

func main() {
	config := config.NewConfig()
	err := config.LoadEnvironment()
	if err != nil {
		log.Fatalf("Error loading environment variables: %v", err)
	}

	server, err := server.NewServer(config)
	if err != nil {
		log.Fatalf("Error creating server: %v", err)
	}

	// Apply any persisted (non-secret) satellite-connection overrides from the
	// admin Settings onto the env-derived config, before version detection, so the
	// portal targets the satellite configured from the UI.
	var settings models.Settings
	if server.DB.First(&settings).Error == nil {
		config.OverlaySatelliteSettings(&settings)
	}

	// Auto-detect the connected iSHARE framework version and select the latest
	// supported one; fall back to the configured SATELLITE_VERSION when the
	// satellite advertises none.
	if config.SatelliteVersionDetect {
		if v, ok := satellite.DetectFrameworkVersion(config); ok {
			if v != config.SatelliteVersion {
				log.Printf("satellite: detected framework version %q (configured was %q) — using detected", v, config.SatelliteVersion)
			} else {
				log.Printf("satellite: detected framework version %q", v)
			}
			config.SatelliteVersion = v
		} else {
			log.Printf("satellite: no framework version advertised; using configured SATELLITE_VERSION=%q", config.SatelliteVersion)
		}
	}

	routes.ConfigureRoutes(server, config)
	if config.Dev {
		server.App.Get("/swagger/*", fiberSwagger.WrapHandler)
	}

	server.Listen()
}
