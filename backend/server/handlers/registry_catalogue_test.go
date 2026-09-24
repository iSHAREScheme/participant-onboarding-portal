package handlers

import (
	"testing"

	"github.com/gofiber/fiber/v2"
)

// The claim forms offer a dataspace's own agreements and roles for the
// agreementType / roleId of dataspace claims, so the catalogue the registry
// publishes with each dataspace must survive the BFF's normalisation, and a
// legacy satellite that publishes none must yield empty lists rather than nil.
func TestExtractDataspacesCarriesAgreementsAndRoles(t *testing.T) {
	claims := map[string]interface{}{
		"dataspacesInfo": map[string]interface{}{
			"data": []interface{}{
				map[string]interface{}{
					"id":    "ctt-dataspace",
					"title": "CTT Dataspace",
					"agreements": []interface{}{
						map[string]interface{}{"id": "DataspaceAgreement", "title": "Dataspace Agreement", "required": true},
						map[string]interface{}{"title": "no id, dropped"},
					},
					"roles": []interface{}{
						map[string]interface{}{"id": "DataProvider", "title": "Data Provider", "agreements": []interface{}{"DataspaceAgreement", " ", 7}},
					},
				},
				map[string]interface{}{"dataspace_id": "legacy", "dataspace_title": "Legacy 2.x"},
			},
		},
	}

	rows := extractDataspaces(claims)
	if len(rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(rows))
	}

	agreements, _ := rows[0]["agreements"].([]fiber.Map)
	if len(agreements) != 1 || agreements[0]["id"] != "DataspaceAgreement" || agreements[0]["title"] != "Dataspace Agreement" {
		t.Fatalf("agreements = %#v", rows[0]["agreements"])
	}
	roles, _ := rows[0]["roles"].([]fiber.Map)
	if len(roles) != 1 || roles[0]["id"] != "DataProvider" {
		t.Fatalf("roles = %#v", rows[0]["roles"])
	}
	if required, _ := roles[0]["agreements"].([]string); len(required) != 1 || required[0] != "DataspaceAgreement" {
		t.Fatalf("role agreements = %#v, want only the non-empty string ids", roles[0]["agreements"])
	}

	if legacyAgreements, ok := rows[1]["agreements"].([]fiber.Map); !ok || legacyAgreements == nil || len(legacyAgreements) != 0 {
		t.Fatalf("legacy row agreements = %#v, want an empty non-nil list", rows[1]["agreements"])
	}
	if rows[1]["id"] != "legacy" || rows[1]["title"] != "Legacy 2.x" {
		t.Fatalf("legacy row = %#v", rows[1])
	}
}

func TestExtractFrameworksCarriesAgreementsAndRoles(t *testing.T) {
	claims := map[string]interface{}{
		"frameworksInfo": map[string]interface{}{
			"data": []interface{}{
				map[string]interface{}{
					"id":    "iSHARE",
					"title": "iSHARE Framework",
					"agreements": []interface{}{
						map[string]interface{}{"id": "TermsOfUse", "title": "Terms of Use", "required": true},
						map[string]interface{}{"id": "AccessionAgreement", "title": "Accession Agreement", "required": true},
					},
					"roles": []interface{}{
						map[string]interface{}{"id": "ServiceProvider", "title": "Service Provider", "agreements": []interface{}{"TermsOfUse", "AccessionAgreement"}},
					},
				},
			},
			"totalCount": 1,
		},
	}

	rows, _ := extractFrameworks(claims)
	if len(rows) != 1 || rows[0]["id"] != "iSHARE" {
		t.Fatalf("rows = %#v", rows)
	}
	agreements, _ := rows[0]["agreements"].([]fiber.Map)
	if len(agreements) != 2 || agreements[1]["id"] != "AccessionAgreement" {
		t.Fatalf("agreements = %#v", rows[0]["agreements"])
	}
	roles, _ := rows[0]["roles"].([]fiber.Map)
	if len(roles) != 1 || roles[0]["title"] != "Service Provider" {
		t.Fatalf("roles = %#v", rows[0]["roles"])
	}
}
