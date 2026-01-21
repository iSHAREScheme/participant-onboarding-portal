package requests

type PartiesGetRequest struct {
}

type PartyCreateRequest struct {
	PartyId       string  `json:"party_id"`
	PartyName     string  `json:"party_name"`
	CapabilityUrl *string `json:"capability_url"`
	RegistrarId   string  `json:"registrar_id"`
	Status        *string `json:"status"`
	Adherence     struct {
		Status    string `json:"status"`
		StartDate string `json:"start_date"`
		EndDate   string `json:"end_date"`
	}
	AuthRegistries []struct {
		AuthRegisteryName string  `json:"authregistery_name"`
		AuthRegisteryId   string  `json:"authregistery_id"`
		AuthRegisteryUrl  string  `json:"authregistery_url"`
		DataSpaceId       *string `json:"dataspace_id"`
		DataSpaceTitle    *string `json:"dataspace_title"`
	} `json:"authregistries"`
	AdditionalInfo *struct {
		Description         *string   `json:"description"`
		Logo                *string   `json:"logo"`
		Website             *string   `json:"website"`
		CompanyPhone        *string   `json:"company_phone"`
		CompanyEmail        *string   `json:"company_email"`
		PubliclyPublishable *bool     `json:"publicly_publishable"`
		CountriesOperation  *[]string `json:"countries_operation"`
		SectorIndustry      *[]string `json:"sector_industry"`
		Tags                *string   `json:"tags"`
	} `json:"additional_info"`
	Agreements *[]struct {
		Type                string  `json:"type"`
		Title               string  `json:"title"`
		Status              string  `json:"status"`
		SignDate            string  `json:"sign_date"`
		ExpiryDate          string  `json:"expiry_date"`
		HashFile            string  `json:"hash_file"`
		Framework           string  `json:"framework"`
		DataSpaceId         *string `json:"dataspace_id"`
		DataSpaceTitle      *string `json:"dataspace_title"`
		CompliancyVerified  string  `json:"compliancy_verified"`
	} `json:"agreements"`
	Spor struct {
		SignedRequest string `json:"signed_request"`
	} `json:"spor"`
	Roles *[]struct {
		Role               *string `json:"role"`
		StartDate          *string `json:"start_date"`
		EndDate            *string `json:"end_date"`
		Loa                *string `json:"loa"`
		CompliancyVerified *string `json:"compliancy_verified"`
		LegalAdherence     *string `json:"legal_adherence"`
	} `json:"roles"`
}
