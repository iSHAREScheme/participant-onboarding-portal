package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"onboardingportal/config"
	"onboardingportal/utils"
)

func main() {
	cfg := config.NewConfig()
	if err := cfg.LoadEnvironment(); err != nil {
		log.Fatalf("failed to load environment: %v", err)
	}

	signedToken, err := utils.CreateSatelliteOwnerAccessToken(
		cfg.SatelliteIss,
		cfg.SatelliteAud,
		cfg.SatelliteX5c,
		cfg.SatellitePrivateKey,
	)
	if err != nil {
		log.Fatalf("failed to create token: %v", err)
	}

	parts := strings.Split(signedToken, ".")
	if len(parts) != 3 {
		log.Fatalf("unexpected token format")
	}

	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		log.Fatalf("failed to decode header: %v", err)
	}

	var header map[string]interface{}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		log.Fatalf("failed to unmarshal header: %v", err)
	}

	headerBytes, _ := json.MarshalIndent(header, "", "  ")

	fmt.Printf("Header:%s\n\n", headerBytes)
	fmt.Printf("Signed token:\n%s\n", signedToken)
}
