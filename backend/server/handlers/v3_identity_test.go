package handlers

import "testing"

// A v3 satellite requires a certificate-registered party's id to equal
// calcIshareDid(cert organizationIdentifier): did:ishare:EU.<CC>.<identifier>
// for NTR<CC> identifiers. deriveV3Identity must preserve/produce that shape —
// the legacy EU.EORI canonicalisation rewriting NTR ids made every
// NTR-certificate party creation fail the satellite's alignment check.
func TestDeriveV3IdentityNTRAlignment(t *testing.T) {
	cases := []struct {
		in      string
		wantDid string
	}{
		{"NTRNL-12345678", "did:ishare:EU.NL.NTRNL-12345678"},
		{"EU.NL.NTRNL-12345678", "did:ishare:EU.NL.NTRNL-12345678"},
		{"did:ishare:EU.NL.NTRNL-12345678", "did:ishare:EU.NL.NTRNL-12345678"},
		// Lowercase ntr… cannot derive a country on the satellite either
		// (calcIshareDid matches uppercase only) — legacy canonicalisation applies.
		{"ntrnl-12345678", "did:ishare:EU.EORI.ntrnl-12345678"},
		{"did:web:example.com", "did:web:example.com"}, // non-ishare DIDs pass through
	}
	for _, c := range cases {
		did, _ := deriveV3Identity(c.in)
		if did != c.wantDid {
			t.Fatalf("deriveV3Identity(%q) did = %q, want %q", c.in, did, c.wantDid)
		}
	}

	// Legacy EORI-style ids keep the historical canonicalisation.
	did, eori := deriveV3Identity("EU.EORI.NL123456789")
	if did != "did:ishare:EU.EORI.NL123456789" || eori != "EU.EORI.NL123456789" {
		t.Fatalf("legacy EORI id changed: did=%q eori=%q", did, eori)
	}
}
