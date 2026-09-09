package models

import "time"

type Proposal struct {
	ID              uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	CompanyName     string    `json:"companyName"`
	KvkNumber       string    `json:"kvkNumber"`
	PartyId         string    `json:"partyId"`
	PartyName       string    `json:"partyName"`
	DataOwner       bool      `json:"dataOwner"`
	DataConsumer    bool      `json:"dataConsumer"`
	DataProvider    bool      `json:"dataProvider"`
	UseM2M          string    `json:"useM2M"`
	Address         string    `json:"address"`
	ZipCode         string    `json:"zipCode"`
	City            string    `json:"city"`
	Country         string    `json:"country"`
	Website         string    `json:"website"`
	AuthRegistry    string    `json:"authRegistry"`
	AuthRegistryName string    `json:"authRegistryName"`
	AuthRegistryUrl  string    `json:"authRegistryUrl"`
	CapabilitiesUrl string    `json:"capabilitiesUrl"`
	CttProofPath    string    `json:"cttProofPath"`
	ContactName     string    `json:"contactName"`
	ContactEmail    string    `json:"contactEmail"`
	ContactPhone    string    `json:"contactPhone"`
	Status          string    `json:"status"`
	// FlowRoute records which public onboarding flow produced this proposal
	// ("" = the base URL / no flow). Party creation uses it to apply the
	// flow's dataspace override.
	FlowRoute string `json:"flowRoute"`
	CreatedAt       time.Time `json:"createdAt"`
	KeycloakUsername string    `json:"keycloakUsername"`
	SignedAgreementPaths []string  `json:"signedAgreementPaths" gorm:"type:text;serializer:json"`
	// SignedVia records how the proposal was signed: "manual" (uploaded PDFs)
	// or "eherkenning" (consent-based signing via a verified eHerkenning session).
	SignedVia            string    `json:"signedVia"`
	// Identity proof captured during onboarding, required to build the mandatory
	// v3 identity claim at party creation: the eIDAS certificate (x509Certificate
	// claim) or the eHerkenning assertion (idpAssertion claim).
	CertSubjectName string `json:"certSubjectName"`
	CertX5c         string `json:"certX5c" gorm:"type:text"`
	CertX5tS256     string `json:"certX5tS256"`
	IdpAssertion    string `json:"idpAssertion" gorm:"type:text"`
}

func (Proposal) TableName() string {
	return "proposals"
}
