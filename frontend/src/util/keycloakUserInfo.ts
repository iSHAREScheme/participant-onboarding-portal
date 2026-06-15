import type Keycloak from "keycloak-js";

// userInfo is associated with a Keycloak instance out-of-band, via a WeakMap keyed
// by the instance, instead of being assigned onto the instance directly. The
// Keycloak instance is a memoized/context value that React tracks, so mutating it
// (e.g. `(keycloak as any).userInfo = info`) trips react-hooks/immutability. A
// WeakMap keeps the same shared channel between the auth provider and consumers
// (e.g. the register page) without mutating a React-tracked object, and entries are
// garbage-collected automatically when the instance goes away.
const userInfoStore = new WeakMap<Keycloak, unknown>();

/** Stash the loaded userInfo for a given Keycloak instance. */
export function setKeycloakUserInfo(keycloak: Keycloak, info: unknown): void {
  userInfoStore.set(keycloak, info);
}

/** Read the userInfo previously stashed for a given Keycloak instance, if any. */
export function getKeycloakUserInfo(keycloak: Keycloak): unknown {
  return userInfoStore.get(keycloak);
}

/**
 * Refresh the Keycloak token, load the latest userInfo, stash it (see above) and
 * return it. Keeping the Keycloak method calls in this module-level helper — rather
 * than inline in a component — avoids react-hooks/immutability flagging method calls
 * on the React-tracked Keycloak instance as mutations.
 */
export async function refreshKeycloakUserInfo(
  keycloak: Keycloak
): Promise<unknown> {
  await keycloak.updateToken(0);
  const info = await keycloak.loadUserInfo();
  setKeycloakUserInfo(keycloak, info);
  return info;
}
