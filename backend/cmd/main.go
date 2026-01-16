// @title           iSHARE Onboarding API
// @version         1.0
// @description     Backend API for the iSHARE onboarding portal.
// @contact.name    Protium.digital
// @contact.email   joost@protium.digital
// @BasePath        /api
// @schemes         http
package main

import (
	"log"
	"onboardingportal/config"
	"onboardingportal/server"
	"onboardingportal/server/routes"
	fiberSwagger "github.com/swaggo/fiber-swagger"
	_ "onboardingportal/docs"
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

	routes.ConfigureRoutes(server, config)
	if config.Dev {
		server.App.Get("/swagger/*", fiberSwagger.WrapHandler)
	}

	server.Listen()
}
