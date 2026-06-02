package models

import "time"

type Organization struct {
	ID                 uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	KvkNumber          string    `json:"kvkNumber" gorm:"uniqueIndex;not null"`
	CompanyName        string    `json:"companyName"`
	VerifiedBySubject  string    `json:"verifiedBySubject"`
	VerifiedByUsername string    `json:"verifiedByUsername"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

func (Organization) TableName() string {
	return "organizations"
}

type OrganizationMember struct {
	ID               uint         `json:"id" gorm:"primaryKey;autoIncrement"`
	OrganizationID   uint         `json:"organizationId" gorm:"index;not null"`
	Organization     Organization `json:"organization,omitempty" gorm:"foreignKey:OrganizationID"`
	Email            string       `json:"email" gorm:"index"`
	KeycloakSubject  string       `json:"keycloakSubject" gorm:"index"`
	Username         string       `json:"username" gorm:"index"`
	ProviderAlias    string       `json:"providerAlias"`
	Role             string       `json:"role"`
	Status           string       `json:"status" gorm:"index"`
	InvitedBySubject string       `json:"invitedBySubject"`
	CreatedAt        time.Time    `json:"createdAt"`
	UpdatedAt        time.Time    `json:"updatedAt"`
}

func (OrganizationMember) TableName() string {
	return "organization_members"
}

type OrganizationIdpConnection struct {
	ID               uint         `json:"id" gorm:"primaryKey;autoIncrement"`
	OrganizationID   uint         `json:"organizationId" gorm:"index;not null"`
	Organization     Organization `json:"organization,omitempty" gorm:"foreignKey:OrganizationID"`
	ProviderType     string       `json:"providerType"`
	Alias            string       `json:"alias"`
	DisplayName      string       `json:"displayName"`
	IssuerURL        string       `json:"issuerUrl"`
	ClientID         string       `json:"clientId"`
	Status           string       `json:"status"`
	CreatedBySubject string       `json:"createdBySubject"`
	CreatedAt        time.Time    `json:"createdAt"`
	UpdatedAt        time.Time    `json:"updatedAt"`
}

func (OrganizationIdpConnection) TableName() string {
	return "organization_idp_connections"
}
