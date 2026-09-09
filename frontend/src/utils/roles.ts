// Satellite RBAC on the frontend Keycloak client. Reused from the participant-
// registry stack: SatelliteAdmin is the operator role; SchemeOwner out-ranks it and
// therefore also passes. These are CLIENT roles of the "frontend" client
// (resource_access.frontend.roles), NOT realm roles — replacing the former
// onboarding-admin realm role.
export const OPERATOR_ROLES = ["SatelliteAdmin", "SchemeOwner"] as const;

type ResourceRoleChecker = { hasResourceRole?: (role: string, resource?: string) => boolean };

// isSatelliteOperator reports whether the session holds SatelliteAdmin (or higher)
// on the frontend client. hasResourceRole with no resource uses the adapter's own
// clientId, so it follows a client rename automatically.
export function isSatelliteOperator(kc: ResourceRoleChecker | null | undefined): boolean {
  if (!kc || typeof kc.hasResourceRole !== "function") return false;
  return OPERATOR_ROLES.some((r) => kc.hasResourceRole!(r));
}

// tokenHasOperatorRole reads the same client roles from a parsed token, for places
// without the adapter handy (e.g. post-login routing).
export function tokenHasOperatorRole(
  tokenParsed: { resource_access?: Record<string, { roles?: string[] }> } | undefined | null,
  clientId = "frontend",
): boolean {
  const roles = tokenParsed?.resource_access?.[clientId]?.roles ?? [];
  return OPERATOR_ROLES.some((r) => roles.includes(r));
}
