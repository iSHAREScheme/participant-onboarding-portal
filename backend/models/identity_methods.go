package models

import (
	"fmt"
	"strings"
)

// Identity verification methods an onboarding flow can offer. A deployment
// picks which of these its applicants may use, and each onboarding flow may
// narrow or widen that choice — so a dataspace that trusts only eIDAS seals,
// or one that onboards purely from Verifiable Credentials, gets exactly that
// identity step and nothing else.
const (
	IdentityMethodEidas       = "eidas"
	IdentityMethodEherkenning = "eherkenning"
	IdentityMethodVC          = "vc"
)

// KnownIdentityMethods lists every method in its canonical order.
var KnownIdentityMethods = []string{
	IdentityMethodEidas,
	IdentityMethodEherkenning,
	IdentityMethodVC,
}

// DefaultIdentityMethods is what a deployment offers until an admin chooses.
// It reproduces the portal's behaviour before the setting existed — eIDAS and
// eHerkenning — so upgrading changes nothing. Verifiable Credentials are
// deliberately left out: they stay off until an admin enables them and names
// the issuers they trust.
const DefaultIdentityMethods = IdentityMethodEidas + "," + IdentityMethodEherkenning

// ParseIdentityMethods normalises a comma-separated method list: it trims,
// lowercases, drops duplicates and returns the methods in canonical order.
// An empty input yields nil (meaning "not set, inherit"). Unknown methods are
// an error rather than silently ignored, so a typo is caught when an admin
// saves instead of quietly removing an identity option from a live flow.
func ParseIdentityMethods(raw string) ([]string, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	requested := map[string]bool{}
	for _, part := range strings.Split(raw, ",") {
		method := strings.ToLower(strings.TrimSpace(part))
		if method == "" {
			continue
		}
		if !isKnownIdentityMethod(method) {
			return nil, fmt.Errorf("%q is not an identity verification method (use %s)",
				method, strings.Join(KnownIdentityMethods, ", "))
		}
		requested[method] = true
	}
	if len(requested) == 0 {
		return nil, fmt.Errorf("select at least one identity verification method")
	}
	methods := make([]string, 0, len(requested))
	for _, method := range KnownIdentityMethods {
		if requested[method] {
			methods = append(methods, method)
		}
	}
	return methods, nil
}

func isKnownIdentityMethod(method string) bool {
	for _, known := range KnownIdentityMethods {
		if known == method {
			return true
		}
	}
	return false
}
