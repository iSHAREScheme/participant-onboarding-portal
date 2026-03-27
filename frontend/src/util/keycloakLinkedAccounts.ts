import type Keycloak from "keycloak-js"

type LinkedAccountRepresentation = {
  providerAlias?: string
  identityProvider?: string
  alias?: string
}

const getLinkedAccountsUrl = (keycloak: Keycloak) =>
  `${keycloak.authServerUrl}/realms/${keycloak.realm}/account/linked-accounts?linked=true`

export const fetchKeycloakLinkedAccounts = async (
  keycloak: Keycloak
): Promise<LinkedAccountRepresentation[]> => {
  if (!keycloak.authenticated) return []

  await keycloak.updateToken(30)

  const response = await fetch(getLinkedAccountsUrl(keycloak), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${keycloak.token}`,
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to load linked accounts (${response.status})`)
  }

  const payload = (await response.json()) as unknown
  if (!Array.isArray(payload)) return []

  return payload.filter(
    (item): item is LinkedAccountRepresentation =>
      Boolean(item) && typeof item === "object"
  )
}

export const hasLinkedIdentityProvider = (
  linkedAccounts: LinkedAccountRepresentation[],
  providerAlias: string
): boolean =>
  linkedAccounts.some(
    (account) => {
      const alias =
        typeof account.providerAlias === "string"
          ? account.providerAlias
          : typeof account.identityProvider === "string"
          ? account.identityProvider
          : typeof account.alias === "string"
          ? account.alias
          : undefined

      return typeof alias === "string" && alias.toLowerCase() === providerAlias.toLowerCase()
    }
  )
