package models

import "gorm.io/datatypes"

type Settings struct {
	ID          uint                   	`gorm:"primarykey"`
	Description string                 		`json:"description"`
	RegistrarId string                 		`json:"registrarId"`
	DataspaceId string                 		`json:"dataspaceId"`
	Agreements  datatypes.JSONSlice[string] `gorm:"type:json" json:"agreements"`
	LogoPath    string                 		`json:"logoPath"`
}
