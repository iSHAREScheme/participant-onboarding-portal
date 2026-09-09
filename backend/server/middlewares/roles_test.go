package middlewares

import "testing"

func claimsWithClientRoles(roles ...string) *KeycloakClaims {
	c := &KeycloakClaims{}
	c.ResourceAccess = map[string]struct {
		Roles []string `json:"roles"`
	}{FrontendClientID: {Roles: roles}}
	return c
}

func TestHasRoleAtLeast(t *testing.T) {
	cases := []struct {
		name     string
		claims   *KeycloakClaims
		required string
		want     bool
	}{
		{"satelliteadmin passes satelliteadmin", claimsWithClientRoles(RoleSatelliteAdmin), RoleSatelliteAdmin, true},
		{"schemeowner outranks satelliteadmin", claimsWithClientRoles(RoleSchemeOwner), RoleSatelliteAdmin, true},
		{"partyadmin below satelliteadmin fails", claimsWithClientRoles(RolePartyAdmin), RoleSatelliteAdmin, false},
		{"user below satelliteadmin fails", claimsWithClientRoles(RoleUser), RoleSatelliteAdmin, false},
		{"partyadmin passes user", claimsWithClientRoles(RolePartyAdmin), RoleUser, true},
		{"no roles fails", claimsWithClientRoles(), RoleSatelliteAdmin, false},
		{"nil claims fails", nil, RoleSatelliteAdmin, false},
		{"unknown role name never satisfies", claimsWithClientRoles("Nonsense"), RoleSatelliteAdmin, false},
		{"realm role does NOT count (client roles only)", func() *KeycloakClaims {
			c := &KeycloakClaims{}
			c.RealmAccess.Roles = []string{RoleSatelliteAdmin, "onboarding-admin"}
			return c
		}(), RoleSatelliteAdmin, false},
	}
	for _, c := range cases {
		if got := HasRoleAtLeast(c.claims, c.required); got != c.want {
			t.Errorf("%s: HasRoleAtLeast=%v want %v", c.name, got, c.want)
		}
	}
}
