package config

import (
	"encoding/base64"
	"fmt"
	"onboardingportal/models"
	"onboardingportal/signing"
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
	Keys                        *signing.KeySource
	SatelliteDebug              bool
	OIDCDisable                 bool
	SporSignedRequestPath       string
	SporSignedRequestBase64     string
	// VcIssuerBaseUrl is the base URL of the external iSHARE VC issuer the portal
	// polls for credential offers (its ObP API, e.g. http://ishare-vc-issuer:8080).
	// Empty = credential issuance is not configured and the dashboard says so.
	VcIssuerBaseUrl string
	// VcIssuerApiKey is the shared bearer token the issuer's ObP API ("obp.api_key"
	// on the issuer) requires on every /v1 request. Sent as Authorization: Bearer
	// on the credential-offer poll. A secret — supplied via env only, never stored
	// in settings or returned to the UI. Empty when the issuer runs auth-disabled.
	VcIssuerApiKey string
	// PrApiBaseUrl is the base URL of the Participant Registry admin API ("SO.api").
	// It is reached server-to-server by forwarding the operator's OIDC bearer token
	// (the same token the portal authenticated the admin with), so the PR must trust
	// the portal's realm/issuer (scope so.api). Empty = PR-admin features disabled.
	PrApiBaseUrl string
	// CorsAllowedOrigins is a comma-separated allow-list of browser origins
	// permitted to call the API cross-origin. Empty = no CORS headers emitted.
	CorsAllowedOrigins string

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
	// KeycloakClientID is the public frontend client (NEXT_PUBLIC_KEYCLOAK_CLIENT_ID),
	// used as the client_id when emailing a newly-created user their set-password link.
	KeycloakClientID string
	// FrontendDomain is the portal's public origin (NEXT_PUBLIC_FRONTEND_DOMAIN); the
	// new-user action email redirects back here once the required actions are done.
	FrontendDomain string
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

// SatelliteV3Prefix returns the path prefix for the satellite's versioned public
// API: "/v3.0" when operating against a v3 (claim-model) satellite, otherwise ""
// (unversioned = legacy 2.x behaviour). The satellite serves v3 endpoints under
// /v3.0/... and keeps the unversioned paths on legacy 2.x behaviour, so v3 calls
// must be explicitly versioned to reach the v3 handlers.
func (c *Config) SatelliteV3Prefix() string {
	if strings.HasPrefix(strings.TrimSpace(c.SatelliteVersion), "3") {
		return "/v3.0"
	}
	return ""
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
	// In the vault key-source modes the key comes from Vault, so a missing
	// key file is not an error; the historic file mode keeps failing fast.
	keySource := strings.TrimSpace(os.Getenv("SATELLITE_KEY_SOURCE"))
	if config.SatellitePrivateKey == "" && config.SatellitePrivateKeyPath != "" &&
		(keySource == "" || keySource == signing.SourceFile) {
		privateKey, err := utils.LoadPrivateKey(config.SatellitePrivateKeyPath)
		if err != nil {
			return err
		}
		config.SatellitePrivateKey = privateKey
	}

	// Key-source abstraction (additive): SATELLITE_KEY_SOURCE unset or "file"
	// wraps the material resolved above and changes nothing; "vault-kv" and
	// "vault-transit" fetch from / sign in Vault. See backend/signing.
	keys, err := signing.Load(signing.Options{
		Source:         keySource,
		PrivateKeyPEM:  config.SatellitePrivateKey,
		PrivateKeyPath: config.SatellitePrivateKeyPath,
		X5c:            config.SatelliteX5c,
		VaultAddr:      os.Getenv("VAULT_ADDR"),
		VaultToken:     os.Getenv("VAULT_TOKEN"),
		RoleID:         envOrFile("VAULT_ROLE_ID"),
		SecretID:       envOrFile("VAULT_SECRET_ID"),
		KVPath:         os.Getenv("VAULT_KV_PATH"),
		TransitPath:    os.Getenv("VAULT_TRANSIT_PATH"),
		TransitKey:     os.Getenv("VAULT_TRANSIT_KEY"),
	})
	if err != nil {
		return err
	}
	config.Keys = keys
	// Back-fill so existing readers (connection status, presence checks) see
	// the effective material regardless of where it came from. The private
	// key stays empty in transit mode - it never enters this process.
	if config.SatellitePrivateKey == "" {
		config.SatellitePrivateKey = keys.PrivateKeyPEM()
	}
	if config.SatelliteX5c == "" {
		config.SatelliteX5c = keys.X5c()
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

	// External iSHARE VC issuer (ObP polling API). Server-to-server base URL; the
	// offer URIs it returns carry the issuer's own public base URL for wallets.
	config.VcIssuerBaseUrl = strings.TrimRight(strings.TrimSpace(os.Getenv("VC_ISSUER_BASE_URL")), "/")
	// Shared bearer the issuer's /v1 ObP API requires (matches the issuer's
	// obp.api_key). Secret → env only.
	config.VcIssuerApiKey = strings.TrimSpace(os.Getenv("VC_ISSUER_API_KEY"))

	// Participant Registry admin API (SO.api). Server-to-server base URL; auth is
	// the forwarded operator token, so no credential is configured here.
	config.PrApiBaseUrl = strings.TrimRight(strings.TrimSpace(os.Getenv("PR_API_BASE_URL")), "/")

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
	config.KeycloakClientID = os.Getenv("NEXT_PUBLIC_KEYCLOAK_CLIENT_ID")
	config.FrontendDomain = strings.TrimRight(os.Getenv("NEXT_PUBLIC_FRONTEND_DOMAIN"), "/")
	config.KeycloakIdp = os.Getenv("NEXT_PUBLIC_KEYCLOAK_IDP")

	config.SatelliteDebug = os.Getenv("SATELLITE_DEBUG") == "true"
	config.OIDCDisable = os.Getenv("OIDC_DISABLE") == "true"

	// Browser origins allowed to call the API cross-origin (comma-separated).
	// Empty = emit no CORS headers; the browser same-origin policy then blocks
	// cross-origin reads. The app's own frontend reaches the API through a
	// same-origin proxy, so this is only needed for extra trusted browser origins.
	config.CorsAllowedOrigins = strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))

	return nil
}

// envOrFile resolves NAME or NAME_FILE (file wins when both are set), for
// secrets that deployments prefer to mount rather than pass inline.
func envOrFile(name string) string {
	if path := strings.TrimSpace(os.Getenv(name + "_FILE")); path != "" {
		if b, err := os.ReadFile(path); err == nil {
			return strings.TrimSpace(string(b))
		}
	}
	return strings.TrimSpace(os.Getenv(name))
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
	set(&config.VcIssuerBaseUrl, s.VcIssuerBaseUrl)
	set(&config.PrApiBaseUrl, s.PrApiBaseUrl)
}
