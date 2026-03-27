const STORAGE_KEY = "idpActionState"

export type StoredIdpActionState = {
  action?: string
  alias?: string
  status: "pending" | "success" | "cancelled" | "error"
  updatedAt: number
}

const getAliasFromAction = (action?: string): string | undefined => {
  if (!action || !action.startsWith("idp_link:")) return undefined
  return action.slice("idp_link:".length) || undefined
}

export const loadStoredIdpActionState = (): StoredIdpActionState | undefined => {
  if (typeof window === "undefined") return undefined

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as StoredIdpActionState
    if (!parsed || typeof parsed !== "object" || typeof parsed.status !== "string") {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

export const clearStoredIdpActionState = () => {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export const setPendingIdpLinkAction = (alias: string) => {
  if (typeof window === "undefined") return
  try {
    const next: StoredIdpActionState = {
      action: `idp_link:${alias}`,
      alias,
      status: "pending",
      updatedAt: Date.now(),
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
}

export const setCompletedIdpAction = (
  status: "success" | "cancelled" | "error",
  action?: string
) => {
  if (typeof window === "undefined") return
  try {
    const next: StoredIdpActionState = {
      action,
      alias: getAliasFromAction(action),
      status,
      updatedAt: Date.now(),
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
}
