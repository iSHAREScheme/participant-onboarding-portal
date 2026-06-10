package satellite

import (
	"fmt"
	"strings"

	"onboardingportal/models"
)

// V3OnboardingClaimConfig carries the deployment's framework-specific identifiers
// used to assemble a v3 claim-based party from an onboarding proposal. The
// proposal supplies the party-specific data (id, name, capability url, contact,
// identity proof); these values come from configuration.
type V3OnboardingClaimConfig struct {
	RegistrarID        string
	FrameworkID        string
	AgreementType      string
	AgreementID        string
	AgreementTitle     string
	RoleID             string
	Loa                string
	LegalAdherence     string
	CompliancyVerified string
	VerificationHash   string // SHA-256 hex of the signed agreement artifact
	StartDate          string
	EndDate            string
}

// BuildV3OnboardingClaims assembles the minimum valid v3 claim set the satellite
// requires for register-new-party: frameworkCompliance, frameworkAgreement,
// frameworkRole and a mandatory identity claim — x509Certificate (from a captured
// eIDAS certificate) or idpAssertion (from a verified eHerkenning session).
//
// It returns an error when no identity proof is available, since the satellite
// rejects any party without one (and additionally requires an x509 certificate
// for framework roles other than ServiceConsumer/EntitledParty).
func BuildV3OnboardingClaims(proposal *models.Proposal, cfg V3OnboardingClaimConfig) ([]map[string]interface{}, error) {
	claims := make([]map[string]interface{}, 0, 4)

	// 1) frameworkCompliance — the party adheres to the framework.
	compliance := map[string]interface{}{
		"type":        "frameworkCompliance",
		"registrarId": cfg.RegistrarID,
		"status":      "active",
		"frameworkId": cfg.FrameworkID,
		"startDate":   cfg.StartDate,
		"endDate":     cfg.EndDate,
	}
	if strings.TrimSpace(proposal.CapabilitiesUrl) != "" {
		compliance["capabilityUrl"] = proposal.CapabilitiesUrl
	}
	additionalInfo := map[string]interface{}{}
	if strings.TrimSpace(proposal.Website) != "" {
		additionalInfo["website"] = normalizeWebsiteURL(proposal.Website)
	}
	if strings.TrimSpace(proposal.ContactEmail) != "" {
		additionalInfo["companyEmail"] = proposal.ContactEmail
	}
	if strings.TrimSpace(proposal.ContactPhone) != "" {
		additionalInfo["companyPhone"] = proposal.ContactPhone
	}
	if len(additionalInfo) > 0 {
		compliance["additionalInfo"] = additionalInfo
	}
	claims = append(claims, compliance)

	// 2) frameworkAgreement — the signed framework agreement (e.g. Terms of Use).
	agreement := map[string]interface{}{
		"type":          "frameworkAgreement",
		"registrarId":   cfg.RegistrarID,
		"status":        "active",
		"frameworkId":   cfg.FrameworkID,
		"agreementType": cfg.AgreementType,
		"agreementId":   cfg.AgreementID,
		"title":         cfg.AgreementTitle,
	}
	// verificationHash must be a SHA-256 hex string when present.
	if cfg.VerificationHash != "" {
		agreement["verificationHash"] = cfg.VerificationHash
	}
	claims = append(claims, agreement)

	// 3) frameworkRole — the party's role within the framework.
	claims = append(claims, map[string]interface{}{
		"type":               "frameworkRole",
		"registrarId":        cfg.RegistrarID,
		"status":             "active",
		"frameworkId":        cfg.FrameworkID,
		"roleId":             cfg.RoleID,
		"startDate":          cfg.StartDate,
		"endDate":            cfg.EndDate,
		"loa":                cfg.Loa,
		"compliancyVerified": cfg.CompliancyVerified,
		"legalAdherence":     cfg.LegalAdherence,
	})

	// 4) Mandatory identity claim: eIDAS certificate or eHerkenning assertion.
	switch {
	case strings.TrimSpace(proposal.CertX5c) != "":
		claims = append(claims, map[string]interface{}{
			"type":        "x509Certificate",
			"registrarId": cfg.RegistrarID,
			"status":      "active",
			"startDate":   cfg.StartDate,
			"endDate":     cfg.EndDate,
			"subjectName": proposal.CertSubjectName,
			// Per the iSHARE v3.0 spec, certificateType is a free string (example
			// "eSEAL") and x5c is a single base64 string (not an array).
			"certificateType": "eSEAL",
			"x5c":             proposal.CertX5c,
			"x5t#s256":        proposal.CertX5tS256,
		})
	case strings.TrimSpace(proposal.IdpAssertion) != "":
		claims = append(claims, map[string]interface{}{
			"type":        "idpAssertion",
			"registrarId": cfg.RegistrarID,
			"status":      "active",
			"assertion":   proposal.IdpAssertion,
		})
	default:
		return nil, fmt.Errorf("no identity proof captured for this proposal (eIDAS certificate or eHerkenning assertion); it is required to create a v3 party")
	}

	return claims, nil
}
