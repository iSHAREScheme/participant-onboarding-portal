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
