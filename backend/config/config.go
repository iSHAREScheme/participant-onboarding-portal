package config

import (
	"encoding/base64"
	"fmt"
	"onboardingportal/models"
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
	SatellitePartiesEndpoint    string
	SatelliteTokenEndpoint      string
	SatelliteTokenScope         string
	SatelliteVersion            string
	SatelliteVersionDetect      bool
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

	// AgreementAuthKey is the AES master key (16/24/32 bytes) used to encrypt the
	// fetch credentials of protected agreement URLs at rest. Nil when
	// AGREEMENT_AUTH_MASTER_KEY is unset — in which case adding a protected URL is
	// refused rather than storing secrets in the clear.
	AgreementAuthKey []byte

	KeycloakBaseURL       string
	KeycloakRealm         string
	KeycloakAdminUsername string
	KeycloakAdminPassword string
	// KeycloakIdp is the eHerkenning identity-provider alias (shared with the
	// frontend via NEXT_PUBLIC_KEYCLOAK_IDP) used to verify eHerkenning signing.
	KeycloakIdp string

	// v3.0 claim-based party creation (register-new-party). All default to the
	// iSHARE Framework conventions (no config needed for an iSHARE PR); override
	// per deployment. The proposal supplies the party-specific data.
	FrameworkId                 string
	FrameworkAgreementType      string
	FrameworkAgreementId        string
	FrameworkAgreementTitle     string
	FrameworkRoleId             string
	FrameworkRoleLoa            string
	FrameworkRoleLegalAdherence string
	FrameworkRoleCompliancy     string
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
	// v3.0 satellites expose the standard iSHARE `POST /parties` endpoint for
	// claim-based party creation (`register-new-party`) instead of ep_creation.
	config.SatellitePartiesEndpoint = os.Getenv("SATELLITE_PARTIES_ENDPOINT")
	if config.SatellitePartiesEndpoint == "" {
		config.SatellitePartiesEndpoint = "/parties"
	}
	config.SatelliteTokenEndpoint = os.Getenv("SATELLITE_TOKEN_ENDPOINT")
	if config.SatelliteTokenEndpoint == "" {
		config.SatelliteTokenEndpoint = "/connect/token"
	}
	config.SatelliteTokenScope = os.Getenv("SATELLITE_TOKEN_SCOPE")
	if config.SatelliteTokenScope == "" {
		config.SatelliteTokenScope = "iSHARE"
	}
	config.SatelliteVersion = os.Getenv("SATELLITE_VERSION")
	if config.SatelliteVersion == "" {
		config.SatelliteVersion = "2.0.1"
	}
	// Auto-detect the connected framework version from the satellite's
	// discovery endpoints at startup (default on). Set to "false" to pin the
	// configured SATELLITE_VERSION.
	config.SatelliteVersionDetect = os.Getenv("SATELLITE_VERSION_DETECT") != "false"
	config.SatelliteIss = os.Getenv("SATELLITE_ISS")
	config.SatelliteAud = os.Getenv("SATELLITE_AUD")
	config.RegistrarId = os.Getenv("REGISTRAR_ID")
	config.DataspaceId = os.Getenv("DATASPACE_ID")
	config.DataspaceTitle = os.Getenv("DATASPACE_TITLE")

	// v3.0 claim defaults. This portal targets the iSHARE Framework + iSHARE
	// Participant Registry, so every value defaults to the iSHARE conventions and
	// works with no configuration; override any of them per deployment.
	config.FrameworkId = os.Getenv("FRAMEWORK_ID")
	if config.FrameworkId == "" {
		config.FrameworkId = "iSHARE"
	}
	config.FrameworkAgreementType = os.Getenv("FRAMEWORK_AGREEMENT_TYPE")
	if config.FrameworkAgreementType == "" {
		config.FrameworkAgreementType = "TermsOfUse"
	}
	config.FrameworkAgreementId = os.Getenv("FRAMEWORK_AGREEMENT_ID")
	config.FrameworkAgreementTitle = os.Getenv("FRAMEWORK_AGREEMENT_TITLE")
	if config.FrameworkAgreementTitle == "" {
		config.FrameworkAgreementTitle = "iSHARE Terms of Use"
	}
	config.FrameworkRoleId = os.Getenv("FRAMEWORK_ROLE_ID")
	if config.FrameworkRoleId == "" {
		// Non-M2M role: avoids forcing an x509 cert for eHerkenning parties.
		config.FrameworkRoleId = "EntitledParty"
	}
	config.FrameworkRoleLoa = os.Getenv("FRAMEWORK_ROLE_LOA")
	if config.FrameworkRoleLoa == "" {
		config.FrameworkRoleLoa = "substantial"
	}
	config.FrameworkRoleLegalAdherence = os.Getenv("FRAMEWORK_ROLE_LEGAL_ADHERENCE")
	if config.FrameworkRoleLegalAdherence == "" {
		config.FrameworkRoleLegalAdherence = "yes"
	}
	config.FrameworkRoleCompliancy = os.Getenv("FRAMEWORK_ROLE_COMPLIANCY_VERIFIED")
	if config.FrameworkRoleCompliancy == "" {
		config.FrameworkRoleCompliancy = "no"
	}

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

	if sporPathRaw, ok := os.LookupEnv("SPOR_SIGNED_REQUEST_PATH"); ok {
		config.SporSignedRequestPath = strings.TrimSpace(sporPathRaw)
	} else {
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

	// Master key for encrypting protected-agreement-URL credentials at rest.
	if key, err := utils.ParseSecretKey(os.Getenv("AGREEMENT_AUTH_MASTER_KEY")); err != nil {
		return fmt.Errorf("invalid AGREEMENT_AUTH_MASTER_KEY: %w", err)
	} else {
		config.AgreementAuthKey = key
	}

	config.KeycloakBaseURL = strings.TrimRight(os.Getenv("KEYCLOAK_ADMIN_BASE_URL"), "/")
	if config.KeycloakBaseURL == "" {
		config.KeycloakBaseURL = strings.TrimRight(os.Getenv("NEXT_PUBLIC_KEYCLOAK_BASE_URL"), "/")
	}
	config.KeycloakRealm = os.Getenv("NEXT_PUBLIC_KEYCLOAK_REALM")
	config.KeycloakAdminUsername = os.Getenv("KEYCLOAK_ADMIN_USERNAME")
	config.KeycloakAdminPassword = os.Getenv("KEYCLOAK_ADMIN_PASSWORD")
	config.KeycloakIdp = os.Getenv("NEXT_PUBLIC_KEYCLOAK_IDP")

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

// OverlaySatelliteSettings overrides the non-secret satellite-connection config
// with any non-empty values persisted in Settings. Empty settings values leave
// the env-derived config untouched (so a field reverts to its env default on the
// next restart when cleared). Credentials (cert + private key) are never overlaid
// — they stay env-only.
func (config *Config) OverlaySatelliteSettings(s *models.Settings) {
	if s == nil {
		return
	}
	set := func(dst *string, v string) {
		if strings.TrimSpace(v) != "" {
			*dst = v
		}
	}
	set(&config.SatelliteBaseUrl, s.SatelliteBaseUrl)
	set(&config.SatelliteIss, s.SatelliteIss)
	set(&config.SatelliteAud, s.SatelliteAud)
	set(&config.SatelliteVersion, s.SatelliteVersion)
	set(&config.SatelliteEpCreationEndpoint, s.SatelliteEpCreationEndpoint)
	set(&config.SatellitePartiesEndpoint, s.SatellitePartiesEndpoint)
	set(&config.SatelliteTokenEndpoint, s.SatelliteTokenEndpoint)
	set(&config.SatelliteTokenScope, s.SatelliteTokenScope)
	set(&config.RegistrarId, s.RegistrarId)
	set(&config.DataspaceId, s.DataspaceId)
	set(&config.DataspaceTitle, s.DataspaceTitle)
}
