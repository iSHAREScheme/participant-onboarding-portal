package handlers

import (
	"strings"

	"onboardingportal/models"
)

// Identity verification methods: which of eIDAS, eHerkenning and Verifiable
// Credentials an applicant may use. The deployment sets a default and each
// onboarding flow may override it, the same layering every other onboarding
// knob uses — so each dataspace's onboarding UI offers exactly the identity
// options that dataspace accepts.

// flowAtRoute finds the flow whose route is exactly route, INCLUDING the base
// URL flow (route ""). flowByRoute deliberately skips "" for the older
// per-flow overrides; identity methods must not, because the register page
// applies a base-URL flow's override in the browser. If the server resolved
// differently it would offer an identity method it then refuses to serve.
func flowAtRoute(settings *models.Settings, route string) *models.OnboardingFlow {
	if settings == nil {
		return nil
	}
	flows := decodeFlows(settings.OnboardingFlows)
	for i := range flows {
		if flows[i].Route == route {
			return &flows[i]
		}
	}
	return nil
}

// deploymentIdentityMethods is the deployment-wide choice, falling back to
// models.DefaultIdentityMethods when unset (or unreadable).
func deploymentIdentityMethods(settings *models.Settings) []string {
	if settings != nil {
		if methods, err := models.ParseIdentityMethods(settings.IdentityMethods); err == nil && len(methods) > 0 {
			return methods
		}
	}
	methods, _ := models.ParseIdentityMethods(models.DefaultIdentityMethods)
	return methods
}

// identityMethodsForRoute resolves what the flow at route offers: its own
// override when set, otherwise the deployment choice.
func identityMethodsForRoute(settings *models.Settings, route string) []string {
	if flow := flowAtRoute(settings, route); flow != nil {
		if methods, err := models.ParseIdentityMethods(flow.IdentityMethods); err == nil && len(methods) > 0 {
			return methods
		}
	}
	return deploymentIdentityMethods(settings)
}

// identityMethodOffered reports whether method is available on the flow at route.
func identityMethodOffered(settings *models.Settings, route, method string) bool {
	for _, offered := range identityMethodsForRoute(settings, route) {
		if offered == method {
			return true
		}
	}
	return false
}

// normalizeIdentityMethods validates and canonicalises a submitted list for
// storage. An empty value is kept as "" (inherit / use the default).
func normalizeIdentityMethods(raw string) (string, error) {
	methods, err := models.ParseIdentityMethods(raw)
	if err != nil {
		return "", err
	}
	return strings.Join(methods, ","), nil
}
