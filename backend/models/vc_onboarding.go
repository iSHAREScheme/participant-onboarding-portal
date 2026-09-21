package models

import (
	"time"

	"gorm.io/datatypes"
)

// Presentation session states.
const (
	VcSessionPending  = "pending"
	VcSessionVerified = "verified"
	VcSessionFailed   = "failed"
	VcSessionExpired  = "expired"
)

// VcPresentationSession is one OID4VP exchange: the portal mints a session,
// shows its request as a QR code, and the applicant's wallet posts a
// presentation back against it.
//
// The wallet arrives with no Keycloak token — it is a phone, not the browser
// session — so the wallet-facing endpoints authenticate on the session itself:
// an unguessable 256-bit id, a single-use nonce, and a short expiry. The
// browser-facing poll is authenticated normally and additionally checks that
// the caller owns the session, so one applicant can never read another's
// verified claims.
type VcPresentationSession struct {
	// ID is a cryptographically random identifier; it is also the bearer of
	// authority on the wallet-facing endpoints.
	ID string `gorm:"primaryKey;size:64" json:"id"`
	// Nonce is echoed by a holder-signed presentation to defeat replay.
	Nonce string `json:"nonce"`
	// State is returned by the wallet so the response can be matched back.
	State string `json:"state"`
	// Audience is the client identifier the portal presented to the wallet.
	Audience string `json:"audience"`
	// FlowRoute records which onboarding flow opened the session, so per-flow
	// overrides apply to the resulting proposal.
	FlowRoute string `json:"flowRoute"`
	// KeycloakUsername is the applicant who opened the session and the only
	// caller allowed to read its result.
	KeycloakUsername string `json:"keycloakUsername"`

	Status string `json:"status"`
	// Error holds the applicant-safe failure reason when Status is failed.
	Error string `json:"error,omitempty"`
	// Result is the marshalled verification.Result once the presentation has
	// been verified.
	Result datatypes.JSON `gorm:"type:json" json:"result,omitempty"`

	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  time.Time  `json:"expiresAt"`
	VerifiedAt *time.Time `json:"verifiedAt,omitempty"`
	// ConsumedAt is set when a proposal was built from this verification, so one
	// presentation cannot silently back several applications.
	ConsumedAt *time.Time `json:"consumedAt,omitempty"`
}

func (VcPresentationSession) TableName() string {
	return "vc_presentation_sessions"
}

// Expired reports whether the session's window has closed.
func (s *VcPresentationSession) Expired(now time.Time) bool {
	return !s.ExpiresAt.IsZero() && now.After(s.ExpiresAt)
}
