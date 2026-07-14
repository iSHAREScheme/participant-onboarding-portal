import { useMemo } from 'react'

// Keycloak init config. The session is restored on reload via silent check-sso
// (an iframe that reads the Keycloak SSO cookie) — never from web storage — so
// the access/refresh tokens are never persisted where an XSS could read them.
const useKeycloakInitConfig = () => {
  return useMemo(
    () => ({
      onLoad: 'check-sso' as const,
      flow: 'standard' as const,
      pkceMethod: 'S256' as const,
      silentCheckSsoRedirectUri:
        typeof window !== 'undefined'
          ? `${window.location.origin}/silent-check-sso.html`
          : undefined,
      checkLoginIframe: false,
    }),
    []
  )
}

export default useKeycloakInitConfig
