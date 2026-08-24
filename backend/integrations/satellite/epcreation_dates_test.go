package satellite

import "testing"

// The satellite validates claim dates with time.Parse(time.RFC3339); an HTML
// date input produces bare yyyy-mm-dd, which it rejects. The BFF must expand
// bare dates regardless of which (possibly stale) frontend sent them, and must
// never touch values that already carry a time component.
func TestNormalizeClaimDates(t *testing.T) {
	claim := map[string]interface{}{
		"type":      "frameworkCompliance",
		"startDate": "2026-08-24",
		"endDate":   "2027-08-24",
	}
	NormalizeClaimDates(claim)
	if claim["startDate"] != "2026-08-24T00:00:00.000Z" {
		t.Fatalf("startDate not expanded: %v", claim["startDate"])
	}
	if claim["endDate"] != "2027-08-24T23:59:59.000Z" {
		t.Fatalf("endDate not expanded: %v", claim["endDate"])
	}

	passthrough := map[string]interface{}{
		"startDate": "2026-08-24T12:34:56Z",
		"endDate":   "",
		"other":     "2026-08-24",
	}
	NormalizeClaimDates(passthrough)
	if passthrough["startDate"] != "2026-08-24T12:34:56Z" {
		t.Fatalf("RFC3339 startDate must pass through: %v", passthrough["startDate"])
	}
	if passthrough["endDate"] != "" {
		t.Fatalf("empty endDate must pass through: %v", passthrough["endDate"])
	}
	if passthrough["other"] != "2026-08-24" {
		t.Fatalf("non-date keys must not be touched: %v", passthrough["other"])
	}
}
