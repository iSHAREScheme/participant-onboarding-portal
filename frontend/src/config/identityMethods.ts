// Identity verification methods an onboarding flow can offer. Mirrors
// backend/models/identity_methods.go, which is authoritative: the backend
// validates every saved list and serves the resolved deployment choice.

export type IdentityMethod = "eidas" | "eherkenning" | "vc"

// Canonical order, also the order options are listed in admin screens.
export const IDENTITY_METHODS: IdentityMethod[] = ["eidas", "eherkenning", "vc"]

// Used only when nothing was served (e.g. a request failed): eIDAS and
// eHerkenning, VCs off. The backend applies the same default.
export const DEFAULT_IDENTITY_METHODS = "eidas,eherkenning"

// parseIdentityMethods turns a stored comma-separated list into known methods,
// in canonical order, ignoring anything unrecognised.
export const parseIdentityMethods = (raw?: string | null): IdentityMethod[] => {
  const wanted = new Set(
    String(raw ?? "")
      .split(",")
      .map((m) => m.trim().toLowerCase())
      .filter(Boolean)
  )
  return IDENTITY_METHODS.filter((m) => wanted.has(m))
}

export const serializeIdentityMethods = (methods: IdentityMethod[]): string =>
  IDENTITY_METHODS.filter((m) => methods.includes(m)).join(",")
