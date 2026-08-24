package satellite

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"onboardingportal/models"
	"onboardingportal/requests"
)

// bareClaimDate matches what an HTML date input produces (yyyy-mm-dd).
var bareClaimDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// NormalizeClaimDates expands bare date-input values in a claim into the
// RFC3339 instants the satellite validates claim dates with — startDate to the
// start of the day, endDate to the end. Values that already carry a time
// component pass through untouched. Defense in depth: the frontend converts
// too, but a stale cached bundle (or any other API client) must not be able to
// fail every party/claim write with "must be an RFC3339 timestamp".
func NormalizeClaimDates(claim map[string]interface{}) {
	for key, suffix := range map[string]string{
		"startDate": "T00:00:00.000Z",
		"endDate":   "T23:59:59.000Z",
	} {
		if raw, ok := claim[key].(string); ok {
			v := strings.TrimSpace(raw)
			if bareClaimDate.MatchString(v) {
				claim[key] = v + suffix
			}
		}
	}
}

type AgreementFile struct {
	Hash       string
	FileBase64 string
}

type AgreementTemplate struct {
	Type  string
	Title string
}

type epCreationAdherence struct {
	Status    string `json:"status"`
	StartDate string `json:"start_date"`
	EndDate   string `json:"end_date"`
}

type epCreationAuthRegistry struct {
	AuthRegisteryName string  `json:"authregistery_name"`
	AuthRegisteryId   string  `json:"authregistery_id"`
	AuthRegisteryUrl  string  `json:"authregistery_url"`
	DataSpaceId       *string `json:"dataspace_id,omitempty"`
	DataSpaceTitle    *string `json:"dataspace_title,omitempty"`
}

type epCreationSpor struct {
	SignedRequest string `json:"signed_request"`
}

type epCreationAdditionalInfo201 struct {
	Description         *string   `json:"description"`
	Logo                *string   `json:"logo"`
	Website             *string   `json:"website"`
	CompanyPhone        *string   `json:"company_phone"`
	CompanyEmail        *string   `json:"company_email"`
	PubliclyPublishable bool      `json:"publicly_publishable"`
	CountriesOperation  *[]string `json:"countries_operation"`
	SectorIndustry      *[]string `json:"sector_industry"`
	Tags                *string   `json:"tags"`
}

type epCreationAdditionalInfo211 struct {
	Description         *string   `json:"description"`
	Logo                *string   `json:"logo"`
	Website             *string   `json:"website"`
	CompanyPhone        *string   `json:"company_phone"`
	CompanyEmail        *string   `json:"company_email"`
	PubliclyPublishable bool      `json:"publicly_publishable"`
	CountriesOperation  *[]string `json:"countries_operation"`
	SectorIndustry      *[]string `json:"sector_industry"`
	Tags                *string   `json:"tags"`
}

type epCreationAgreement201 struct {
	Type               string  `json:"type"`
	Title              string  `json:"title"`
	Status             string  `json:"status"`
	SignDate           string  `json:"sign_date"`
	ExpiryDate         string  `json:"expiry_date"`
	AgreementFile      string  `json:"agreement_file"`
	Framework          string  `json:"framework"`
	DataSpaceId        *string `json:"dataspace_id,omitempty"`
	DataSpaceTitle     *string `json:"dataspace_title,omitempty"`
	CompliancyVerified string  `json:"complaiancy_verified"`
}

type epCreationAgreement211 struct {
	Type               string  `json:"type"`
	Title              string  `json:"title"`
	Status             string  `json:"status"`
	SignDate           string  `json:"sign_date"`
	ExpiryDate         string  `json:"expiry_date"`
	HashFile           string  `json:"hash_file"`
	AgreementFile      string  `json:"agreement_file,omitempty"`
	Framework          string  `json:"framework"`
	DataSpaceId        *string `json:"dataspace_id,omitempty"`
	DataSpaceTitle     *string `json:"dataspace_title,omitempty"`
	CompliancyVerified string  `json:"complaiancy_verified"`
}

type epCreationRole struct {
	Role               *string `json:"role"`
	StartDate          *string `json:"start_date"`
	EndDate            *string `json:"end_date"`
	Loa                *string `json:"loa"`
	CompliancyVerified *string `json:"complaiancy_verified"`
	LegalAdherence     *string `json:"legal_adherence"`
}

// Satellite 2.0.1 ep_creation payload.
type epCreation201Request struct {
	PartyId        string                       `json:"party_id"`
	PartyName      string                       `json:"party_name"`
	CapabilityUrl  *string                      `json:"capability_url,omitempty"`
	RegistrarId    string                       `json:"registrar_id"`
	Adherence      epCreationAdherence          `json:"adherence"`
	AuthRegistries []epCreationAuthRegistry     `json:"auth_registries,omitempty"`
	AdditionalInfo *epCreationAdditionalInfo201 `json:"additional_info,omitempty"`
	Agreements     []epCreationAgreement201     `json:"agreements,omitempty"`
	Spor           epCreationSpor               `json:"spor"`
	Roles          []epCreationRole             `json:"roles,omitempty"`
}

// Satellite 2.1.1 ep_creation payload.
type epCreation211Request struct {
	ID             string                       `json:"id"`
	AlsoKnownAs    []string                     `json:"alsoKnownAs"`
	PartyName      string                       `json:"party_name"`
	CapabilityUrl  *string                      `json:"capability_url,omitempty"`
	RegistrarId    string                       `json:"registrar_id"`
	Adherence      epCreationAdherence          `json:"adherence"`
	AuthRegistries []epCreationAuthRegistry     `json:"auth_registries,omitempty"`
	AdditionalInfo *epCreationAdditionalInfo211 `json:"additional_info,omitempty"`
	Agreements     []epCreationAgreement211     `json:"agreements,omitempty"`
	Spor           epCreationSpor               `json:"spor"`
	Roles          []epCreationRole             `json:"roles,omitempty"`
}

type partyCreate22Request struct {
	ID             string                       `json:"id"`
	AlsoKnownAs    []string                     `json:"alsoKnownAs,omitempty"`
	SchemaVersion  string                       `json:"schemaVersion"`
	PartyName      string                       `json:"party_name"`
	CapabilityUrl  *string                      `json:"capability_url,omitempty"`
	RegistrarId    string                       `json:"registrar_id"`
	Adherence      epCreationAdherence          `json:"adherence"`
	AdditionalInfo *epCreationAdditionalInfo201 `json:"additional_info,omitempty"`
	Agreements     []epCreationAgreement22      `json:"agreements,omitempty"`
	Certificates   []partyCertificate22         `json:"certificates,omitempty"`
	Spor           *epCreationSpor              `json:"spor,omitempty"`
	Roles          []partyRole22                `json:"roles,omitempty"`
	AuthRegs       []partyAuthRegistry22        `json:"auth_registries,omitempty"`
}

type epCreationAgreement22 struct {
	Type               string `json:"type"`
	Title              string `json:"title"`
	Status             string `json:"status"`
	SignDate           string `json:"sign_date"`
	ExpiryDate         string `json:"expiry_date"`
	AgreementFile      string `json:"agreement_file,omitempty"`
	HashFile           string `json:"hash_file,omitempty"`
	Framework          string `json:"framework"`
	DataSpaceId        string `json:"dataspace_id"`
	DataSpaceTitle     string `json:"dataspace_title"`
	CompliancyVerified string `json:"compliancy_verified"`
}

type partyCertificate22 struct {
	SubjectName     string `json:"subject_name"`
	CertificateType string `json:"certificate_type"`
	EnabledFrom     string `json:"enabled_from"`
	X5C             string `json:"x5c"`
	X5T             string `json:"x5t#s256"`
}

type partyRole22 struct {
	Role               string `json:"role"`
	StartDate          string `json:"start_date"`
	EndDate            string `json:"end_date"`
	Loa                string `json:"loa"`
	CompliancyVerified bool   `json:"compliancy_verified"`
	LegalAdherence     bool   `json:"legal_adherence"`
}

type partyAuthRegistry22 struct {
	Name          string `json:"name"`
	ID            string `json:"id"`
	URL           string `json:"url"`
	DataSpaceId   string `json:"dataspace_id"`
	DataSpaceName string `json:"dataspace_name"`
}

func BuildDidFromPartyID(partyID string) string {
	return "did:ishare:" + partyID
}

func BuildEoriAlias(partyID string) string {
	return "eori:" + partyID
}

func BuildEpCreation201RequestFromRequest(request *requests.PartyCreateRequest, partyID string, signedRequest string) epCreation201Request {
	payload := epCreation201Request{
		PartyId:       partyID,
		PartyName:     request.PartyName,
		CapabilityUrl: request.CapabilityUrl,
		RegistrarId:   request.RegistrarId,
		Adherence: epCreationAdherence{
			Status:    request.Adherence.Status,
			StartDate: request.Adherence.StartDate,
			EndDate:   request.Adherence.EndDate,
		},
		Spor: epCreationSpor{
			SignedRequest: signedRequest,
		},
	}
	payload.AuthRegistries = buildAuthRegistriesFromRequest(request)
	payload.AdditionalInfo = buildAdditionalInfo201FromRequest(request)
	payload.Agreements = buildAgreements201FromRequest(request)
	payload.Roles = buildRolesFromRequest(request)
	return payload
}

func BuildEpCreation211RequestFromRequest(request *requests.PartyCreateRequest, partyDID string, aliases []string, signedRequest string) epCreation211Request {
	payload := epCreation211Request{
		ID:            partyDID,
		AlsoKnownAs:   aliases,
		PartyName:     request.PartyName,
		CapabilityUrl: request.CapabilityUrl,
		RegistrarId:   request.RegistrarId,
		Adherence: epCreationAdherence{
			Status:    request.Adherence.Status,
			StartDate: request.Adherence.StartDate,
			EndDate:   request.Adherence.EndDate,
		},
		Spor: epCreationSpor{
			SignedRequest: signedRequest,
		},
	}
	payload.AuthRegistries = buildAuthRegistriesFromRequest(request)
	payload.AdditionalInfo = buildAdditionalInfo211FromRequest(request)
	payload.Agreements = buildAgreements211FromRequest(request)
	payload.Roles = buildRolesFromRequest(request)
	return payload
}

func BuildEpCreation201RequestFromProposal(proposal *models.Proposal, partyID string, signedRequest string, registrarId string, authRegistryURL string, dataspaceId string, dataspaceTitle string, agreements []epCreationAgreement201, startDate string, endDate string) epCreation201Request {
	payload := epCreation201Request{
		PartyId:       partyID,
		PartyName:     proposal.PartyName,
		CapabilityUrl: stringPtr(proposal.CapabilitiesUrl),
		RegistrarId:   registrarId,
		Adherence: epCreationAdherence{
			Status:    "Active",
			StartDate: startDate,
			EndDate:   endDate,
		},
		AdditionalInfo: buildAdditionalInfo201FromProposal(proposal),
		Spor: epCreationSpor{
			SignedRequest: signedRequest,
		},
		Roles:      buildDefaultRoles(startDate, endDate),
		Agreements: agreements,
	}
	payload.AuthRegistries = buildAuthRegistriesFromProposal(proposal, registrarId, authRegistryURL, dataspaceId, dataspaceTitle)
	return payload
}

func BuildEpCreation211RequestFromProposal(proposal *models.Proposal, partyDID string, aliases []string, signedRequest string, registrarId string, authRegistryURL string, dataspaceId string, dataspaceTitle string, agreements []epCreationAgreement211, startDate string, endDate string) epCreation211Request {
	payload := epCreation211Request{
		ID:            partyDID,
		AlsoKnownAs:   aliases,
		PartyName:     proposal.PartyName,
		CapabilityUrl: stringPtr(proposal.CapabilitiesUrl),
		RegistrarId:   registrarId,
		Adherence: epCreationAdherence{
			Status:    "Active",
			StartDate: startDate,
			EndDate:   endDate,
		},
		AdditionalInfo: buildAdditionalInfo211FromProposal(proposal),
		Spor: epCreationSpor{
			SignedRequest: signedRequest,
		},
		Roles:      buildDefaultRoles(startDate, endDate),
		Agreements: agreements,
	}
	payload.AuthRegistries = buildAuthRegistriesFromProposal(proposal, registrarId, authRegistryURL, dataspaceId, dataspaceTitle)
	return payload
}

func BuildParty22RequestFromProposal(proposal *models.Proposal, partyDID string, aliases []string, registrarId string, authRegistryURL string, dataspaceId string, dataspaceTitle string, agreements []epCreationAgreement22, startDate string, endDate string) (partyCreate22Request, error) {
	payload := partyCreate22Request{
		ID:            partyDID,
		AlsoKnownAs:   aliases,
		SchemaVersion: "v2.2",
		PartyName:     proposal.PartyName,
		CapabilityUrl: stringPtr(proposal.CapabilitiesUrl),
		RegistrarId:   registrarId,
		Adherence: epCreationAdherence{
			Status:    "Active",
			StartDate: startDate,
			EndDate:   endDate,
		},
		AdditionalInfo: buildAdditionalInfo201FromProposal(proposal),
		Roles:          buildDefaultRoles22(startDate, endDate),
		Agreements:     agreements,
	}

	if strings.TrimSpace(proposal.CertX5c) != "" {
		subjectName, err := subjectNameFromX5C(proposal.CertX5c)
		if err != nil {
			return partyCreate22Request{}, fmt.Errorf("invalid eIDAS certificate payload: %w", err)
		}
		payload.Certificates = []partyCertificate22{
			{
				SubjectName:     subjectName,
				CertificateType: "eSEAL",
				EnabledFrom:     startDate,
				X5C:             strings.TrimSpace(proposal.CertX5c),
				X5T:             strings.TrimSpace(proposal.CertX5tS256),
			},
		}
	} else if strings.TrimSpace(proposal.IdpAssertion) != "" {
		payload.Spor = &epCreationSpor{
			SignedRequest: strings.TrimSpace(proposal.IdpAssertion),
		}
	} else {
		return partyCreate22Request{}, fmt.Errorf("no identity proof captured for this proposal (eIDAS certificate or eHerkenning assertion); it is required to create a v2.2 party")
	}

	payload.AuthRegs = buildAuthRegistries22FromProposal(proposal, registrarId, authRegistryURL, dataspaceId, dataspaceTitle)
	return payload, nil
}

func buildAuthRegistriesFromProposal(proposal *models.Proposal, registrarId string, authRegistryURL string, dataspaceId string, dataspaceTitle string) []epCreationAuthRegistry {
	authRegistryId := strings.TrimSpace(proposal.AuthRegistry)
	if authRegistryId == "" || authRegistryId == strings.TrimSpace(registrarId) {
		return nil
	}
	return []epCreationAuthRegistry{
		{
			AuthRegisteryId:   authRegistryId,
			AuthRegisteryName: strings.TrimSpace(proposal.AuthRegistryName),
			AuthRegisteryUrl:  strings.TrimSpace(authRegistryURL),
			DataSpaceId:       stringPtr(strings.TrimSpace(dataspaceId)),
			DataSpaceTitle:    stringPtr(strings.TrimSpace(dataspaceTitle)),
		},
	}
}

func buildAuthRegistries22FromProposal(proposal *models.Proposal, registrarId string, authRegistryURL string, dataspaceId string, dataspaceTitle string) []partyAuthRegistry22 {
	authRegistryId := strings.TrimSpace(proposal.AuthRegistry)
	if authRegistryId == "" || authRegistryId == strings.TrimSpace(registrarId) {
		return nil
	}
	return []partyAuthRegistry22{
		{
			ID:            authRegistryId,
			Name:          strings.TrimSpace(proposal.AuthRegistryName),
			URL:           strings.TrimSpace(authRegistryURL),
			DataSpaceId:   strings.TrimSpace(dataspaceId),
			DataSpaceName: strings.TrimSpace(dataspaceTitle),
		},
	}
}

func BuildAgreements201FromFiles(files []AgreementFile, metadata []AgreementTemplate, dataspaceId string, dataspaceTitle string, signDate string, expiryDate string) []epCreationAgreement201 {
	if len(files) == 0 {
		return nil
	}
	agreements := make([]epCreationAgreement201, 0, len(files))
	for idx, agreement := range files {
		agreementType := "Agreement"
		agreementTitle := fmt.Sprintf("Agreement-%d", idx+1)
		if idx < len(metadata) {
			agreementType = metadata[idx].Type
			agreementTitle = metadata[idx].Title
		}
		agreements = append(agreements, epCreationAgreement201{
			Type:               agreementType,
			Title:              agreementTitle,
			Status:             "Accepted",
			SignDate:           signDate,
			ExpiryDate:         expiryDate,
			AgreementFile:      agreement.FileBase64,
			Framework:          "iSHARE",
			DataSpaceId:        stringPtr(dataspaceId),
			DataSpaceTitle:     stringPtr(dataspaceTitle),
			CompliancyVerified: "no",
		})
	}
	return agreements
}

func BuildAgreements211FromFiles(files []AgreementFile, metadata []AgreementTemplate, dataspaceId string, dataspaceTitle string, signDate string, expiryDate string) []epCreationAgreement211 {
	if len(files) == 0 {
		return nil
	}
	agreements := make([]epCreationAgreement211, 0, len(files))
	for idx, agreement := range files {
		agreementType := "Agreement"
		agreementTitle := fmt.Sprintf("Agreement-%d", idx+1)
		if idx < len(metadata) {
			agreementType = metadata[idx].Type
			agreementTitle = metadata[idx].Title
		}
		agreements = append(agreements, epCreationAgreement211{
			Type:               agreementType,
			Title:              agreementTitle,
			Status:             "Accepted",
			SignDate:           signDate,
			ExpiryDate:         expiryDate,
			HashFile:           agreement.Hash,
			AgreementFile:      agreement.FileBase64,
			Framework:          "iSHARE",
			DataSpaceId:        stringPtr(dataspaceId),
			DataSpaceTitle:     stringPtr(dataspaceTitle),
			CompliancyVerified: "no",
		})
	}
	return agreements
}

func BuildAgreements22FromFiles(files []AgreementFile, metadata []AgreementTemplate, dataspaceId string, dataspaceTitle string, signDate string, expiryDate string) []epCreationAgreement22 {
	if len(files) == 0 {
		return nil
	}
	agreements := make([]epCreationAgreement22, 0, len(files))
	for idx, agreement := range files {
		agreementType := "Agreement"
		agreementTitle := fmt.Sprintf("Agreement-%d", idx+1)
		if idx < len(metadata) {
			agreementType = metadata[idx].Type
			agreementTitle = metadata[idx].Title
		}
		agreements = append(agreements, epCreationAgreement22{
			Type:               agreementType,
			Title:              agreementTitle,
			Status:             "Accepted",
			SignDate:           signDate,
			ExpiryDate:         expiryDate,
			AgreementFile:      agreement.FileBase64,
			Framework:          "iSHARE",
			DataSpaceId:        strings.TrimSpace(dataspaceId),
			DataSpaceTitle:     strings.TrimSpace(dataspaceTitle),
			CompliancyVerified: "no",
		})
	}
	return agreements
}

func buildAuthRegistriesFromRequest(request *requests.PartyCreateRequest) []epCreationAuthRegistry {
	if len(request.AuthRegistries) == 0 {
		return nil
	}
	authregistries := make([]epCreationAuthRegistry, 0, len(request.AuthRegistries))
	for _, registry := range request.AuthRegistries {
		authregistries = append(authregistries, epCreationAuthRegistry{
			AuthRegisteryName: registry.AuthRegisteryName,
			AuthRegisteryId:   registry.AuthRegisteryId,
			AuthRegisteryUrl:  registry.AuthRegisteryUrl,
			DataSpaceId:       registry.DataSpaceId,
			DataSpaceTitle:    registry.DataSpaceTitle,
		})
	}
	return authregistries
}

func buildAdditionalInfo201FromRequest(request *requests.PartyCreateRequest) *epCreationAdditionalInfo201 {
	if request.AdditionalInfo == nil {
		return nil
	}
	publiclyPublishable := false
	if request.AdditionalInfo.PubliclyPublishable != nil {
		publiclyPublishable = *request.AdditionalInfo.PubliclyPublishable
	}
	return &epCreationAdditionalInfo201{
		Description:         request.AdditionalInfo.Description,
		Logo:                request.AdditionalInfo.Logo,
		Website:             request.AdditionalInfo.Website,
		CompanyPhone:        request.AdditionalInfo.CompanyPhone,
		CompanyEmail:        request.AdditionalInfo.CompanyEmail,
		PubliclyPublishable: publiclyPublishable,
		CountriesOperation:  request.AdditionalInfo.CountriesOperation,
		SectorIndustry:      request.AdditionalInfo.SectorIndustry,
		Tags:                request.AdditionalInfo.Tags,
	}
}

func buildAdditionalInfo211FromRequest(request *requests.PartyCreateRequest) *epCreationAdditionalInfo211 {
	if request.AdditionalInfo == nil {
		return nil
	}
	publiclyPublishable := false
	if request.AdditionalInfo.PubliclyPublishable != nil {
		publiclyPublishable = *request.AdditionalInfo.PubliclyPublishable
	}
	return &epCreationAdditionalInfo211{
		Description:         request.AdditionalInfo.Description,
		Logo:                request.AdditionalInfo.Logo,
		Website:             request.AdditionalInfo.Website,
		CompanyPhone:        request.AdditionalInfo.CompanyPhone,
		CompanyEmail:        request.AdditionalInfo.CompanyEmail,
		PubliclyPublishable: publiclyPublishable,
		CountriesOperation:  request.AdditionalInfo.CountriesOperation,
		SectorIndustry:      request.AdditionalInfo.SectorIndustry,
		Tags:                request.AdditionalInfo.Tags,
	}
}

func buildAgreements201FromRequest(request *requests.PartyCreateRequest) []epCreationAgreement201 {
	if request.Agreements == nil || len(*request.Agreements) == 0 {
		return nil
	}
	agreements := make([]epCreationAgreement201, 0, len(*request.Agreements))
	for _, agreement := range *request.Agreements {
		agreements = append(agreements, epCreationAgreement201{
			Type:               agreement.Type,
			Title:              agreement.Title,
			Status:             agreement.Status,
			SignDate:           agreement.SignDate,
			ExpiryDate:         agreement.ExpiryDate,
			AgreementFile:      agreement.AgreementFile,
			Framework:          agreement.Framework,
			DataSpaceId:        agreement.DataSpaceId,
			DataSpaceTitle:     agreement.DataSpaceTitle,
			CompliancyVerified: agreement.CompliancyVerified,
		})
	}
	return agreements
}

func buildAgreements211FromRequest(request *requests.PartyCreateRequest) []epCreationAgreement211 {
	if request.Agreements == nil || len(*request.Agreements) == 0 {
		return nil
	}
	agreements := make([]epCreationAgreement211, 0, len(*request.Agreements))
	for _, agreement := range *request.Agreements {
		agreements = append(agreements, epCreationAgreement211{
			Type:               agreement.Type,
			Title:              agreement.Title,
			Status:             agreement.Status,
			SignDate:           agreement.SignDate,
			ExpiryDate:         agreement.ExpiryDate,
			HashFile:           agreement.HashFile,
			AgreementFile:      agreement.AgreementFile,
			Framework:          agreement.Framework,
			DataSpaceId:        agreement.DataSpaceId,
			DataSpaceTitle:     agreement.DataSpaceTitle,
			CompliancyVerified: agreement.CompliancyVerified,
		})
	}
	return agreements
}

func buildRolesFromRequest(request *requests.PartyCreateRequest) []epCreationRole {
	if request.Roles == nil || len(*request.Roles) == 0 {
		return nil
	}
	roles := make([]epCreationRole, 0, len(*request.Roles))
	for _, role := range *request.Roles {
		roles = append(roles, epCreationRole{
			Role:               role.Role,
			StartDate:          role.StartDate,
			EndDate:            role.EndDate,
			Loa:                role.Loa,
			CompliancyVerified: role.CompliancyVerified,
			LegalAdherence:     role.LegalAdherence,
		})
	}
	return roles
}

func buildAdditionalInfo201FromProposal(proposal *models.Proposal) *epCreationAdditionalInfo201 {
	return &epCreationAdditionalInfo201{
		Description:         stringPtr(""),
		Logo:                stringPtr(""),
		Website:             stringPtr(normalizeWebsiteURL(proposal.Website)),
		CompanyPhone:        stringPtr(proposal.ContactPhone),
		CompanyEmail:        stringPtr(proposal.ContactEmail),
		PubliclyPublishable: false,
	}
}

func buildAdditionalInfo211FromProposal(proposal *models.Proposal) *epCreationAdditionalInfo211 {
	return &epCreationAdditionalInfo211{
		Description:         stringPtr(""),
		Logo:                stringPtr(""),
		Website:             stringPtr(normalizeWebsiteURL(proposal.Website)),
		CompanyPhone:        stringPtr(proposal.ContactPhone),
		CompanyEmail:        stringPtr(proposal.ContactEmail),
		PubliclyPublishable: false,
	}
}

func buildDefaultRoles(startDate string, endDate string) []epCreationRole {
	role := "EntitledParty"
	loa := "Substantial"
	compliancyVerified := "yes"
	legalAdherence := "yes"
	return []epCreationRole{
		{
			Role:               stringPtr(role),
			StartDate:          stringPtr(startDate),
			EndDate:            stringPtr(endDate),
			Loa:                stringPtr(loa),
			CompliancyVerified: stringPtr(compliancyVerified),
			LegalAdherence:     stringPtr(legalAdherence),
		},
	}
}

func buildDefaultRoles22(startDate string, endDate string) []partyRole22 {
	return []partyRole22{
		{
			Role:               "EntitledParty",
			StartDate:          startDate,
			EndDate:            endDate,
			Loa:                "Substantial",
			CompliancyVerified: true,
			LegalAdherence:     true,
		},
	}
}

func stringPtr(value string) *string {
	return &value
}

func normalizeWebsiteURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	if !strings.Contains(trimmed, "://") {
		trimmed = "https://" + trimmed
	}

	if _, err := url.ParseRequestURI(trimmed); err != nil {
		return raw
	}

	return trimmed
}

// ---------------------------------------------------------------------------
// iSHARE v3.0 party creation (POST /parties, `register-new-party`).
//
// Unlike the 2.0.1 / 2.1.1 ep_creation payloads, the v3 satellite accepts the
// claim-based `party` schema directly, so we forward it almost verbatim. The
// claims stay as generic maps to preserve every type-specific field (including
// the literal "x5t#s256" key) without a lossy struct round-trip. There is no
// SPOR / signed_request in v3 — creation is gated by the satellite-owner Bearer
// token plus claim validation on the satellite side.
// ---------------------------------------------------------------------------

// epCreation30Request is the v3.0 `party` payload sent to the satellite.
type epCreation30Request struct {
	ID            string                   `json:"id"`
	Name          string                   `json:"name"`
	AlsoKnownAs   []string                 `json:"alsoKnownAs,omitempty"`
	SchemaVersion string                   `json:"schemaVersion"`
	Claims        []map[string]interface{} `json:"claims"`
}

// BuildEpCreation30RequestFromRequest assembles the v3.0 party payload:
//   - `id` is the normalized did:ishare identifier
//   - `alsoKnownAs` carries the portal-supplied aliases (already cleaned)
//   - `schemaVersion` is pinned to "v3.0" as the spec requires
//   - each claim's `registrarId` defaults to the configured registrar and
//     `status` defaults to "active" when the portal left them blank; all other
//     claim fields pass through untouched.
func BuildEpCreation30RequestFromRequest(request *requests.PartyV3CreateRequest, partyDID string, aliases []string, registrarID string) epCreation30Request {
	claims := make([]map[string]interface{}, 0, len(request.Claims))
	for _, claim := range request.Claims {
		if claim == nil {
			continue
		}
		normalized := make(map[string]interface{}, len(claim))
		for k, v := range claim {
			normalized[k] = v
		}
		if registrarID != "" {
			if existing, ok := normalized["registrarId"].(string); !ok || strings.TrimSpace(existing) == "" {
				normalized["registrarId"] = registrarID
			}
		}
		if status, ok := normalized["status"].(string); !ok || strings.TrimSpace(status) == "" {
			normalized["status"] = "active"
		}
		NormalizeClaimDates(normalized)
		claims = append(claims, normalized)
	}

	return epCreation30Request{
		ID:            partyDID,
		Name:          request.Name,
		AlsoKnownAs:   aliases,
		SchemaVersion: "v3.0",
		Claims:        claims,
	}
}
