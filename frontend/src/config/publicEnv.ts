import publicEnvKeys from '../../scripts/public-env-keys'

const PUBLIC_ENV_KEYS = publicEnvKeys as string[]

export type PublicEnvKey = typeof PUBLIC_ENV_KEYS[number]
export type PublicEnv = Partial<Record<PublicEnvKey, string>>

declare global {
  interface Window {
    __ENV?: PublicEnv
  }
}

export function getPublicEnv(): PublicEnv {
  const env: PublicEnv = {}

  if (typeof process !== 'undefined' && process.env) {
    for (const key of PUBLIC_ENV_KEYS) {
      const value = process.env[key]
      if (typeof value === 'string') {
        env[key] = value
      }
    }
  }

  if (typeof window !== 'undefined') {
    const winEnv = window.__ENV
    if (winEnv && typeof winEnv === 'object') {
      return { ...env, ...winEnv }
    }
  }

  return env
}

/**
 * Raw satellite / iSHARE scheme version. This is the exact same value the
 * backend reads from SATELLITE_VERSION, so the front and back end interpret a
 * single source of truth. Supported values: 2.0, 2.1.1, 2.2 and 3.0 (and patch
 * variants such as 2.0.1). Defaults to "2.0.1" to match the backend default.
 */
export function getSatelliteVersion(): string {
  const env = getPublicEnv()
  return (env['SATELLITE_VERSION'] || '2.0.1').trim()
}

/**
 * Whether the given satellite version uses the claim-based participant model
 * (/parties + claims), introduced in the 3.x line. Everything in the 2.x line
 * (2.0, 2.1.1, 2.2, …) uses the flat party/proposal schema. Prefix based to
 * mirror the backend's version handling (backend/server/handlers/party.go).
 */
export function usesClaimModel(version: string = getSatelliteVersion()): boolean {
  return version.trim().startsWith('3')
}
