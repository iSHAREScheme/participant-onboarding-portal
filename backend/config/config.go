package config

import (
	"encoding/base64"
	"fmt"
	"onboardingportal/utils"
	"os"
	"strings"
)

type Config struct {
	SQLiteHost                  string
	SQLitePort                  string
	SQLiteUser                  string
	SQLitePassword              string
	SQLiteDBName                string
	ServerPort                  string
	SatelliteBaseUrl            string
	SatelliteEpCreationEndpoint string
	SatelliteTokenEndpoint      string
	SatelliteTokenScope         string
	SatelliteIss                string
	RegistrarId                 string
	DataspaceId                 string
	DataspaceTitle              string
	SatelliteAud                string
	SatelliteX5c                string
	SatellitePrivateKeyPath     string
	SatellitePrivateKey         string
	SatelliteDebug              bool
	OIDCDisable                 bool
	SporSignedRequestPath       string
	SporSignedRequestBase64     string

	// Inbound API auth (JWT)
	AuthPublicKeyPath string
	AuthPublicKey     string
	AuthIssuer        string
	AuthAudience      string

	Dev bool

	// Simple header-based RBAC
	RBACHeaderName string
	RBACAdminToken string
}

func NewConfig() *Config {
	return &Config{}
}

func (config *Config) LoadEnvironment() error {
	config.Dev = os.Getenv("DEV") == "true"

	// SQLite Configuration
	config.SQLiteHost = os.Getenv("SQLITE_HOST")
	config.SQLitePort = os.Getenv("SQLITE_PORT")
	config.SQLiteUser = os.Getenv("SQLITE_USER")
	config.SQLitePassword = os.Getenv("SQLITE_PASSWORD")
	config.SQLiteDBName = os.Getenv("SQLITE_DB_NAME")

	// Server Configuration
	config.ServerPort = os.Getenv("SERVER_PORT")

	// Satellite Configuration
	config.SatelliteBaseUrl = os.Getenv("SATELLITE_BASE_URL")
	config.SatelliteEpCreationEndpoint = os.Getenv("SATELLITE_EP_CREATION_ENDPOINT")
	if config.SatelliteEpCreationEndpoint == "" {
		config.SatelliteEpCreationEndpoint = "/ep_creation"
	}
	config.SatelliteTokenEndpoint = os.Getenv("SATELLITE_TOKEN_ENDPOINT")
	if config.SatelliteTokenEndpoint == "" {
		config.SatelliteTokenEndpoint = "/connect/token"
	}
	config.SatelliteTokenScope = os.Getenv("SATELLITE_TOKEN_SCOPE")
	if config.SatelliteTokenScope == "" {
		config.SatelliteTokenScope = "iSHARE"
	}
	config.SatelliteIss = os.Getenv("SATELLITE_ISS")
	config.SatelliteAud = os.Getenv("SATELLITE_AUD")
	config.RegistrarId = os.Getenv("REGISTRAR_ID")
	config.DataspaceId = os.Getenv("DATASPACE_ID")
	config.DataspaceTitle = os.Getenv("DATASPACE_TITLE")
	config.SatelliteX5c = os.Getenv("SATELLITE_X5C")
	config.SatellitePrivateKeyPath = os.Getenv("SATELLITE_PRIVATE_KEY_PATH")

	config.SatellitePrivateKey = normalizePEM(os.Getenv("SATELLITE_PRIVATE_KEY"))
	if config.SatellitePrivateKey == "" && config.SatellitePrivateKeyPath != "" {
		privateKey, err := utils.LoadPrivateKey(config.SatellitePrivateKeyPath)
		if err != nil {
			return err
		}
		config.SatellitePrivateKey = privateKey
	}

	config.SporSignedRequestPath = strings.TrimSpace(os.Getenv("SPOR_SIGNED_REQUEST_PATH"))
	if config.SporSignedRequestPath == "" {
		config.SporSignedRequestPath = "resources/spor-signed-request.pdf"
	}
	if config.SporSignedRequestPath != "" {
		data, err := os.ReadFile(config.SporSignedRequestPath)
		if err != nil {
			return fmt.Errorf("failed to read SPOR signed request from %s: %w", config.SporSignedRequestPath, err)
		}
		config.SporSignedRequestBase64 = base64.StdEncoding.EncodeToString(data)
	}

	// Inbound auth configuration
	config.AuthPublicKeyPath = os.Getenv("AUTH_PUBLIC_KEY_PATH")
	config.AuthIssuer = os.Getenv("AUTH_ISSUER")
	config.AuthAudience = os.Getenv("AUTH_AUDIENCE")

	// Prefer key from file if path is provided, otherwise use AUTH_PUBLIC_KEY
	if config.AuthPublicKeyPath != "" {
		if pub, err := utils.LoadPublicKey(config.AuthPublicKeyPath); err == nil {
			config.AuthPublicKey = pub
		} else {
			return err
		}
	} else {
		config.AuthPublicKey = os.Getenv("AUTH_PUBLIC_KEY")
	}

	// RBAC config
	config.RBACHeaderName = os.Getenv("RBAC_HEADER_NAME")
	if config.RBACHeaderName == "" {
		config.RBACHeaderName = "X-RBAC-Token"
	}
	config.RBACAdminToken = os.Getenv("RBAC_ADMIN_TOKEN")

	config.SatelliteDebug = os.Getenv("SATELLITE_DEBUG") == "true"
	config.OIDCDisable = os.Getenv("OIDC_DISABLE") == "true"

	return nil
}

func normalizePEM(raw string) string {
	if raw == "" {
		return ""
	}
	normalized := strings.ReplaceAll(raw, "\\r", "")
	normalized = strings.ReplaceAll(normalized, "\\n", "\n")
	return normalized
}
