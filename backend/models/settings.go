package models

import "gorm.io/datatypes"

type Settings struct {
	ID          uint                   	`gorm:"primarykey"`
	Description string                 		`json:"description"`
	RegistrarId string                 		`json:"registrarId"`
	DataspaceId string                 		`json:"dataspaceId"`
	Agreements  datatypes.JSONSlice[string] `gorm:"type:json" json:"agreements"`
	LogoPath    string                 		`json:"logoPath"`
	// FaviconPath is the uploaded browser-tab icon; empty means the iSHARE default.
	FaviconPath string                 		`json:"faviconPath"`
	// Theme holds deployment-level colour overrides as a JSON object of
	// {tokenKey: "#hex"}; empty/absent means "use the brand defaults".
	Theme       datatypes.JSON              `gorm:"type:json" json:"theme"`
}
