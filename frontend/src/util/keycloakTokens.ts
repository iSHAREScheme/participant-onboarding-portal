// Older builds persisted Keycloak tokens in localStorage under this key. Tokens
// are no longer written to web storage — they live only in memory and the session
// is restored via Keycloak silent check-sso. This helper remains solely to purge
// any tokens left behind by those older builds (on startup and on logout).
const STORAGE_KEY = 'kcTokens'

export const clearStoredKeycloakTokens = () => {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}
