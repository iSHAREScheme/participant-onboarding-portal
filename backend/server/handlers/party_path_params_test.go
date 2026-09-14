package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v2"
)

// Fiber does not unescape route parameters (UnescapePath is off), so a
// did:ishare party id reaches a handler as did%3Aishare%3A…. Every satellite
// URL built from such a parameter must decode it first, otherwise url.PathEscape
// double-encodes it and the satellite reports "party not found" for every
// DID-identified party (observed on POST /parties/{id}/claims).
func TestPartyPathParamDecodesPercentEncodedRouteValues(t *testing.T) {
	app := fiber.New()
	app.Post("/parties/:id/claims/:claimId", func(c *fiber.Ctx) error {
		id, err := partyPathParam(c, "id")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).SendString(err.Error())
		}
		claimID, err := partyPathParam(c, "claimId")
		if err != nil {
			return c.Status(fiber.StatusBadRequest).SendString(err.Error())
		}
		return c.JSON(fiber.Map{"id": id, "claimId": claimID, "forwarded": "/v3.0/parties/" + url.PathEscape(id) + "/claims/" + url.PathEscape(claimID)})
	})

	const partyID = "did:ishare:EU.EORI.NLWURAURORA001"
	request := httptest.NewRequest(http.MethodPost, "/parties/"+url.PathEscape(partyID)+"/claims/"+url.PathEscape("claim id/with slash"), nil)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status=%d body=%s", response.StatusCode, body)
	}
	var got struct {
		ID        string `json:"id"`
		ClaimID   string `json:"claimId"`
		Forwarded string `json:"forwarded"`
	}
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got.ID != partyID {
		t.Fatalf("id = %q, want the decoded party id %q", got.ID, partyID)
	}
	if got.ClaimID != "claim id/with slash" {
		t.Fatalf("claimId = %q, want the decoded claim id", got.ClaimID)
	}
	// The forwarded satellite path is single-encoded: colons stay literal (a
	// path segment may carry them) and no %25 double-encoding appears.
	if got.Forwarded != "/v3.0/parties/did:ishare:EU.EORI.NLWURAURORA001/claims/claim%20id%2Fwith%20slash" {
		t.Fatalf("forwarded path = %q", got.Forwarded)
	}

	// Fiber really does hand the raw encoded value over; guard the premise so a
	// future UnescapePath change is noticed (the helper stays correct either way).
	rawApp := fiber.New()
	rawApp.Get("/raw/:id", func(c *fiber.Ctx) error { return c.SendString(c.Params("id")) })
	rawResponse, err := rawApp.Test(httptest.NewRequest(http.MethodGet, "/raw/did%3Aishare%3AEU.EORI.NLWURAURORA001", nil))
	if err != nil {
		t.Fatalf("raw request: %v", err)
	}
	defer rawResponse.Body.Close()
	raw, _ := io.ReadAll(rawResponse.Body)
	if string(raw) != "did%3Aishare%3AEU.EORI.NLWURAURORA001" && string(raw) != partyID {
		t.Fatalf("unexpected raw param %q", raw)
	}
}
