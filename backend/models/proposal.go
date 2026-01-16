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
	CreatedAt       time.Time `json:"createdAt"`
	KeycloakUsername string    `json:"keycloakUsername"`
	SignedAgreementPaths []string  `json:"signedAgreementPaths" gorm:"type:text;serializer:json"`
}

func (Proposal) TableName() string {
	return "proposals"
}
