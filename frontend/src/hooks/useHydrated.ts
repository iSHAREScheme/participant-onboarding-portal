import { useSyncExternalStore } from "react";

// A subscribe function that never fires: hydration status flips exactly once
// (server / first client render -> after hydration) and never changes again.
const emptySubscribe = () => () => {};

/**
 * Returns `false` during server rendering and the first client render, then
 * `true` once the component has hydrated on the client.
 *
 * Use this to gate browser-only UI (e.g. DOMPurify-sanitised HTML) instead of a
 * `useState` + `useEffect` "mounted" flag, which trips react-hooks/set-state-in-effect.
 * Built on useSyncExternalStore so the server/client snapshots stay consistent
 * and no hydration mismatch is introduced.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true, // client snapshot
    () => false, // server snapshot
  );
}
