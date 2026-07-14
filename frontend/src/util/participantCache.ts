// Short-lived, in-memory cache of raw satellite party objects, populated by the
// participants list. The v3 /parties list already returns each party's full object
// (including claims), so the detail view can render the clicked party instantly
// instead of re-fetching it — a single /parties?eori= lookup costs ~2s on the
// satellite (a fixed per-request cost: projection sync + claim assembly + signing).
//
// The detail view still refreshes in the background, so the data is never stale,
// and a deep-link / cache miss fetches normally. The cache is module-level, so it
// lives for the SPA session and is cleared on a full page reload.

const cache = new Map<string, any>();

const keyOf = (id: unknown): string => (id ?? "").toString().trim();

/** Store raw party objects (from the list or a detail fetch), keyed by party id. */
export function cacheParticipants(parties: any[]): void {
  if (!Array.isArray(parties)) return;
  for (const p of parties) {
    const id = keyOf(p?.party_id ?? p?.id);
    if (id) cache.set(id, p);
  }
}

/** Return the cached raw party object for an id, or undefined on a miss. */
export function getCachedParticipant(id: string): any | undefined {
  return cache.get(keyOf(id));
}

// ---------------------------------------------------------------------------
// List-page cache: the last result for a given list query (page / pageSize /
// name / filter), so returning to the list — e.g. navigating back from a detail
// view — renders instantly and refreshes in the background instead of blocking
// on a re-fetch. Bounded so a long search session can't grow it without limit.
// ---------------------------------------------------------------------------

interface CachedParticipantsList {
  rows: any[];
  totalPages: number;
}

const LIST_CACHE_MAX = 50;
const listCache = new Map<string, CachedParticipantsList>();

/** Store a list page's (normalised) rows + total page count under a query key. */
export function cacheParticipantsList(key: string, rows: any[], totalPages: number): void {
  if (listCache.size >= LIST_CACHE_MAX && !listCache.has(key)) {
    const oldest = listCache.keys().next().value;
    if (oldest !== undefined) listCache.delete(oldest);
  }
  listCache.set(key, { rows, totalPages });
}

/** Return the cached list result for a query key, or undefined on a miss. */
export function getCachedParticipantsList(key: string): CachedParticipantsList | undefined {
  return listCache.get(key);
}

// ---------------------------------------------------------------------------
// Participants list view state — page / search / filter — remembered for the SPA
// session so returning to the list (e.g. back from a detail view) restores the
// page the user was on instead of resetting to page 1.
// ---------------------------------------------------------------------------

export interface ParticipantsListState {
  page: number;
  // Debounced, applied search term (matched against party name OR party id).
  term: string;
  // Raw (un-debounced) contents of the search box.
  search: string;
  // Framework-role filter ("" = all roles).
  role: string;
  filter: string;
}

let listState: ParticipantsListState | null = null;

export function saveParticipantsListState(state: ParticipantsListState): void {
  listState = state;
}

export function getParticipantsListState(): ParticipantsListState | null {
  return listState;
}
