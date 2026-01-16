const STORAGE_KEY = 'kcTokens'
const EXPIRY_SKEW_SECONDS = 30

export type StoredKeycloakTokens = {
  token?: string
  refreshToken?: string
  idToken?: string
  tokenParsed?: { exp?: number }
  refreshTokenParsed?: { exp?: number }
  idTokenParsed?: { exp?: number }
  accessTokenExp?: number
  refreshTokenExp?: number
  idTokenExp?: number
  storedAt?: number
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

const decodeJwtPayload = (token?: string): Record<string, unknown> | undefined => {
  if (!token || typeof atob !== 'function') return undefined
  const parts = token.split('.')
  if (parts.length < 2) return undefined
  const payload = parts[1]
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  try {
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return undefined
  }
}

const getTokenExp = (token?: string, parsed?: { exp?: number }): number | undefined => {
  const parsedExp = toNumber(parsed?.exp)
  if (parsedExp) return parsedExp
  const payload = decodeJwtPayload(token)
  return toNumber(payload?.exp)
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

const isExpired = (exp?: number): boolean => {
  if (!exp) return true
  return exp <= nowSeconds() + EXPIRY_SKEW_SECONDS
}

export const clearStoredKeycloakTokens = () => {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export const storeKeycloakTokens = (tokens: Record<string, unknown>) => {
  if (typeof window === 'undefined') return
  if (!tokens || typeof tokens !== 'object') {
    clearStoredKeycloakTokens()
    return
  }

  const accessTokenExp = getTokenExp(tokens.token as string | undefined, tokens.tokenParsed as { exp?: number } | undefined)
  const refreshTokenExp = getTokenExp(tokens.refreshToken as string | undefined, tokens.refreshTokenParsed as { exp?: number } | undefined)
  const idTokenExp = getTokenExp(tokens.idToken as string | undefined, tokens.idTokenParsed as { exp?: number } | undefined)

  const payload: StoredKeycloakTokens = {
    ...(tokens as StoredKeycloakTokens),
    accessTokenExp,
    refreshTokenExp,
    idTokenExp,
    storedAt: nowSeconds(),
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {}
}

export const loadStoredKeycloakTokens = (): StoredKeycloakTokens | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const tokens = JSON.parse(raw) as StoredKeycloakTokens
    if (!tokens || typeof tokens !== 'object') {
      clearStoredKeycloakTokens()
      return undefined
    }

    const normalized: StoredKeycloakTokens = {
      ...tokens,
      accessTokenExp:
        toNumber(tokens.accessTokenExp) ??
        getTokenExp(tokens.token, tokens.tokenParsed),
      refreshTokenExp:
        toNumber(tokens.refreshTokenExp) ??
        getTokenExp(tokens.refreshToken, tokens.refreshTokenParsed),
      idTokenExp:
        toNumber(tokens.idTokenExp) ??
        getTokenExp(tokens.idToken, tokens.idTokenParsed),
    }

    if (normalized.refreshToken) {
      if (isExpired(normalized.refreshTokenExp)) {
        clearStoredKeycloakTokens()
        return undefined
      }
    } else if (isExpired(normalized.accessTokenExp)) {
      clearStoredKeycloakTokens()
      return undefined
    }

    if (
      normalized.accessTokenExp !== tokens.accessTokenExp ||
      normalized.refreshTokenExp !== tokens.refreshTokenExp ||
      normalized.idTokenExp !== tokens.idTokenExp
    ) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            ...normalized,
            storedAt: tokens.storedAt ?? nowSeconds(),
          })
        )
      } catch {}
    }

    return normalized
  } catch {
    return undefined
  }
}

export const getStoredAccessToken = (): string | undefined => {
  const tokens = loadStoredKeycloakTokens()
  if (!tokens?.token) return undefined
  if (isExpired(tokens.accessTokenExp)) return undefined
  return tokens.token
}
