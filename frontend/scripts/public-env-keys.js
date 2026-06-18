module.exports = [
  'NEXT_PUBLIC_BASE_SERVER_URL',
  'NEXT_PUBLIC_FRONTEND_DOMAIN',
  'NEXT_PUBLIC_KEYCLOAK_BASE_URL',
  'NEXT_PUBLIC_KEYCLOAK_REALM',
  'NEXT_PUBLIC_KEYCLOAK_CLIENT_ID',
  'NEXT_PUBLIC_IDP_ONLY',
  'NEXT_PUBLIC_KEYCLOAK_IDP',
  'NEXT_PUBLIC_ALWAYS_M2M',
  'NEXT_PUBLIC_ALWAYS_EHERKENNING',
  // NOTE: the onboarding-flow settings — association name, skip-roles, active
  // roles, default role and auto-accept — are intentionally NOT published here.
  // They are managed at runtime in the admin UI (Settings → Onboarding), stored
  // in the database, and read by the client from /settings/public, so they are
  // not duplicated into the public window.__ENV.
  'NEXT_PUBLIC_DISABLE_ADMIN_ROUTES',
  'NEXT_PUBLIC_NO_NOTIFY',
  // Backend var (shared via the root .env). Surfaced to the client so the UI can
  // select the iSHARE schema version: major 3+ => v3, otherwise v2.
  'SATELLITE_VERSION',
];
