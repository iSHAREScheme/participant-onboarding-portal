import { useCallback, useEffect, useRef, useState } from "react";

export interface UseFitRowsOptions {
  /** Fallback row height (px), used only until a real row can be measured. Default 44. */
  rowHeight?: number;
  /** Fallback header-row height (px), used only until the real <thead> can be measured. Default 44. */
  theadHeight?: number;
  /** Never return fewer than this many rows. Default 3. */
  min?: number;
  /** Never return more than this many rows. Default 100. */
  max?: number;
  /** Fixed row count on mobile, where rows render as variable-height cards. Default 5. */
  mobileRows?: number;
  /** Media query that defines "mobile". Default "(max-width: 640px)". */
  mobileQuery?: string;
  /** Value returned before the first measurement. Default null. */
  fallback?: number | null;
  /** Re-measure whenever this changes (e.g. the row count, so the real row height
   *  gets picked up once data renders — a size change the ResizeObserver can't see,
   *  because the scroll container is flex-sized independently of its content). */
  recomputeKey?: unknown;
  /** Pixels shaved off the available height so sub-pixel rounding never adds a scrollbar. Default 2. */
  safetyPx?: number;
}

/**
 * Returns how many table rows fit the scroll container WITHOUT it scrolling, so a
 * table fills the screen on any device and reflows on resize.
 *
 * Attach the returned `ref` to the table's scroll container — the element with
 * `overflow:auto` that flex-grows to fill the leftover height. The hook reads that
 * element's real `clientHeight` (flex has already subtracted the header, footer,
 * toolbar and pager, so no strip needs estimating) and divides by the real measured
 * row height, falling back to the supplied estimates only until the first row
 * renders. A ResizeObserver re-measures on any size change; `recomputeKey` covers
 * content-driven changes (e.g. the first data load) the observer can't see.
 *
 * On mobile, rows render as variable-height cards, so it returns a fixed small count
 * instead of measuring. `rows` is `null` until the first measurement, which lets a
 * server-paginated caller defer its first fetch until the size is known.
 */
export function useFitRows(options: UseFitRowsOptions = {}) {
  const {
    rowHeight = 44,
    theadHeight = 44,
    min = 3,
    max = 100,
    mobileRows = 5,
    mobileQuery = "(max-width: 640px)",
    fallback = null,
    recomputeKey,
    safetyPx = 2,
  } = options;

  const [rows, setRows] = useState<number | null>(fallback);
  const elRef = useRef<HTMLElement | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef(0);

  const measure = useCallback(() => {
    if (typeof window === "undefined") return;
    // Mobile: rows render as variable-height cards, so use a fixed small count.
    if (window.matchMedia && window.matchMedia(mobileQuery).matches) {
      setRows((prev) => (prev === mobileRows ? prev : mobileRows));
      return;
    }
    const el = elRef.current;
    if (!el) return;
    const available = el.clientHeight; // real space inside the scroll container
    if (available <= 0) return; // not laid out yet
    const theadEl = el.querySelector("thead");
    const theadH = theadEl ? theadEl.getBoundingClientRect().height : theadHeight;
    // Skip blank spacer rows (aria-hidden) so we measure a real data row.
    const rowEl = el.querySelector("tbody tr:not([aria-hidden='true'])");
    const rowH = rowEl ? rowEl.getBoundingClientRect().height : rowHeight;
    const fit = Math.floor((available - theadH - safetyPx) / Math.max(1, rowH));
    const clamped = Math.max(min, Math.min(max, fit));
    setRows((prev) => (prev === clamped ? prev : clamped));
  }, [rowHeight, theadHeight, min, max, mobileRows, mobileQuery, safetyPx]);

  const schedule = useCallback(() => {
    if (typeof window === "undefined") return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(measure);
  }, [measure]);

  // Callback ref: observe the scroll container's size and measure as soon as it
  // mounts (it can mount after the hook, e.g. once an admin route authorizes).
  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      elRef.current = node;
      if (node) {
        if (typeof ResizeObserver !== "undefined") {
          roRef.current = new ResizeObserver(schedule);
          roRef.current.observe(node);
        }
        schedule();
      }
    },
    [schedule]
  );

  // Window resize / orientation as a backstop, plus recomputeKey-driven re-measures.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      window.removeEventListener("resize", schedule);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [schedule, recomputeKey]);

  // Disconnect the observer on unmount.
  useEffect(
    () => () => {
      if (roRef.current) roRef.current.disconnect();
    },
    []
  );

  return { rows, ref };
}

export default useFitRows;
