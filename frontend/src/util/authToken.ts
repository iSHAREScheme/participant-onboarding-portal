// Bridges the in-memory Keycloak access token to the (non-React) Axios client.
//
// Tokens are deliberately NOT persisted to web storage (localStorage /
// sessionStorage): anything readable by JavaScript is exfiltratable by an XSS.
// The live access token lives only inside the Keycloak instance in memory, and
// the session is restored on reload via Keycloak's silent check-sso (the SSO
// cookie), not from storage.
type AccessTokenProvider = () => Promise<string | undefined>

let provider: AccessTokenProvider | undefined

// Registered once, from _app.tsx, with the live Keycloak instance.
export const setAccessTokenProvider = (fn: AccessTokenProvider | undefined) => {
  provider = fn
}

// Returns a fresh in-memory access token for the Axios Authorization header, or
// undefined when unauthenticated / before Keycloak has finished initialising.
export const getAccessToken = async (): Promise<string | undefined> => {
  if (!provider) return undefined
  try {
    return (await provider()) || undefined
  } catch {
    return undefined
  }
}
