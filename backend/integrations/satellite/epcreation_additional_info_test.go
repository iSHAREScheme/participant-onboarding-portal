package satellite

import (
	"onboardingportal/requests"
	"testing"
)

// The satellite rejects any created claim whose additionalInfo lacks
// publiclyPublishable ("additionalInfo.publiclyPublishable is required"), which
// broke approving every proposal that carried a website, e-mail or phone.
func TestNormalizeClaimAdditionalInfoDefaultsPubliclyPublishable(t *testing.T) {
	claim := map[string]interface{}{
		"type":           "frameworkCompliance",
		"additionalInfo": map[string]interface{}{"website": "https://weshare.eu"},
	}
	NormalizeClaimAdditionalInfo(claim)
	info := claim["additionalInfo"].(map[string]interface{})
	if info["publiclyPublishable"] != false {
		t.Fatalf("publiclyPublishable = %v, want false default", info["publiclyPublishable"])
	}
	if info["website"] != "https://weshare.eu" {
		t.Fatalf("website must be kept: %v", info["website"])
	}

	explicit := map[string]interface{}{
		"additionalInfo": map[string]interface{}{"website": "https://weshare.eu", "publiclyPublishable": true},
	}
	NormalizeClaimAdditionalInfo(explicit)
	if explicit["additionalInfo"].(map[string]interface{})["publiclyPublishable"] != true {
		t.Fatal("an explicit true must be preserved")
	}

	null := map[string]interface{}{
		"additionalInfo": map[string]interface{}{"website": "https://weshare.eu", "publiclyPublishable": nil},
	}
	NormalizeClaimAdditionalInfo(null)
	if null["additionalInfo"].(map[string]interface{})["publiclyPublishable"] != false {
		t.Fatal("a null flag is as absent as a missing one")
	}

	empty := map[string]interface{}{"type": "frameworkCompliance", "additionalInfo": map[string]interface{}{}}
	NormalizeClaimAdditionalInfo(empty)
	if _, present := empty["additionalInfo"]; present {
		t.Fatal("an empty additionalInfo object must be dropped, it would be rejected too")
	}

	none := map[string]interface{}{"type": "frameworkRole", "roleId": "ServiceProvider"}
	NormalizeClaimAdditionalInfo(none)
	if _, present := none["additionalInfo"]; present || len(none) != 2 {
		t.Fatalf("a claim without additionalInfo must be untouched: %v", none)
	}
}

func TestBuildEpCreation30RequestCompletesAdditionalInfo(t *testing.T) {
	request := &requests.PartyV3CreateRequest{
		Name: "WUR",
		Claims: []map[string]interface{}{
			{"type": "frameworkCompliance", "additionalInfo": map[string]interface{}{"website": "weshare.eu"}},
			{"type": "frameworkRole", "roleId": "ServiceProvider"},
		},
	}
	payload := BuildEpCreation30RequestFromRequest(request, "did:ishare:EU.NL.NTRNL-KVK-1", nil, "did:ishare:registrar")
	if len(payload.Claims) != 2 {
		t.Fatalf("claims = %d, want 2", len(payload.Claims))
	}
	info, ok := payload.Claims[0]["additionalInfo"].(map[string]interface{})
	if !ok || info["publiclyPublishable"] != false {
		t.Fatalf("compliance additionalInfo = %#v, want publiclyPublishable=false", payload.Claims[0]["additionalInfo"])
	}
	if _, present := payload.Claims[1]["additionalInfo"]; present {
		t.Fatalf("role claim must not gain additionalInfo: %#v", payload.Claims[1])
	}
}
