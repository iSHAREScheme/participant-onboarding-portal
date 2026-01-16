import { useMemo } from 'react'
import { loadStoredKeycloakTokens } from 'util/keycloakTokens'

const useKeycloakInitConfig = () => {
  const storedTokens = useMemo(() => loadStoredKeycloakTokens(), [])

  return useMemo(
    () => ({
      onLoad: 'check-sso' as const,
      flow: 'standard' as const,
      pkceMethod: 'S256' as const,
      silentCheckSsoRedirectUri:
        typeof window !== 'undefined'
          ? `${window.location.origin}/silent-check-sso.html`
          : undefined,
      token: storedTokens?.token,
      refreshToken: storedTokens?.refreshToken,
      idToken: storedTokens?.idToken,
      checkLoginIframe: false,
    }),
    [storedTokens?.idToken, storedTokens?.refreshToken, storedTokens?.token]
  )
}

export default useKeycloakInitConfig
