import { NextPage } from "next";
import { useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import AdminRoute from "components/AdminRoute";
import Pagination from "components/Pagination";
import API from "api/client";
import { useFitRows } from "hooks";
import { useLanguage } from "../context/LanguageContext";
import styles from "styles/Participants.module.css";

// A normalized, display-ready view of a participant. The satellite /parties
// payload differs between schema versions (v2 uses party_id/adherence/roles;
// v3 uses id/name/claims), so we extract defensively and fall back to "—".
interface ParticipantRow {
  partyId: string;
  name: string;
  roles: string[];
  status: string;
  startDate: string;
  endDate: string;
}

// The backend returns one page of parties under `data`; tolerate the other
// shapes an older code path or a 3.x satellite might return.
const extractParties = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  return (
    data?.data ??
    data?.parties_info?.data ??
    data?.parties?.data ??
    data?.parties ??
    []
  );
};

const normalize = (p: any): ParticipantRow => {
  const partyId = p?.party_id ?? p?.id ?? "";
  const name = p?.party_name ?? p?.name ?? "";

  // v2: roles is an array of { role }. v3: a frameworkRole claim per role.
  let roles: string[] = [];
  if (Array.isArray(p?.roles)) {
    roles = p.roles
      .map((r: any) => (typeof r === "string" ? r : r?.role))
      .filter(Boolean);
  }
  if (!roles.length && Array.isArray(p?.claims)) {
    roles = p.claims
      .filter((c: any) => c?.type === "frameworkRole")
      .map((c: any) => c?.roleId ?? c?.title)
      .filter(Boolean);
  }

  const status = p?.adherence?.status ?? p?.status ?? "";
  const startDate = p?.adherence?.start_date ?? p?.startDate ?? "";
  const endDate = p?.adherence?.end_date ?? p?.endDate ?? "";

  return { partyId, name, roles, status, startDate, endDate };
};

type FilterMode = "all" | "mine" | "active" | "certified";

const SEARCH_DEBOUNCE_MS = 350;

// "+N" badge for the roles beyond the first one shown. Its hover/focus tooltip
// is rendered into a body portal with fixed positioning, so the table's scroll
// container can't clip it (e.g. on the top rows).
const RoleMoreBadge = ({ extras }: { extras: string[] }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left + r.width / 2, top: r.top });
  };
  const hide = () => setPos(null);

  return (
    <span
      ref={ref}
      className={styles.roleMore}
      tabIndex={0}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      +{extras.length}
      {pos !== null && typeof document !== "undefined"
        ? (createPortal(
            <span
              className={styles.roleTooltip}
              role="tooltip"
              style={{ left: pos.left, top: pos.top }}
            >
              {extras.map((role, k) => (
                <span key={k} className={styles.roleTooltipItem}>
                  {role}
                </span>
              ))}
            </span>,
            document.body
          ) as ReactNode)
        : null}
    </span>
  );
};

const Participants: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  // Holds a translation key (not a message) so the loader needn't depend on t.
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState(""); // debounced, applied search term
  const [filter, setFilter] = useState<FilterMode>("all");
  const [authorized, setAuthorized] = useState(false);
  // Guards against out-of-order responses: only the latest request applies.
  const reqIdRef = useRef(0);

  // The page size is how many rows fit the viewport, so the table fills the
  // screen on any device. It's null until measured, which lets the first fetch
  // wait for a real size instead of guessing (and re-fetching).
  const { rows: pageSize, ref: fitRef } = useFitRows({
    rowHeight: 41,
    theadHeight: 41,
    recomputeKey: participants.length,
  });

  // Debounce the search box, and reset to the first page when the applied term
  // changes (a different result set starts at page 1).
  useEffect(() => {
    const term = search.trim();
    const id = setTimeout(() => {
      setName(term);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // When the fitted page size changes (e.g. the viewport was resized), restart at
  // page 1 — the satellite's page boundaries move with the page size.
  const prevSizeRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      prevSizeRef.current !== null &&
      pageSize !== null &&
      pageSize !== prevSizeRef.current
    ) {
      setPage(1);
    }
    prevSizeRef.current = pageSize;
  }, [pageSize]);

  const load = useCallback(async () => {
    if (!pageSize) return;
    const reqId = ++reqIdRef.current;
    setIsLoading(true);
    setErrorKey(null);
    try {
      const api = new API();
      const res = await api.fetchParticipants({
        page,
        pageSize,
        name: name || undefined,
        activeOnly: filter === "active" || undefined,
        certifiedOnly: filter === "certified" || undefined,
        mineOnly: filter === "mine" || undefined,
      });
      // A newer request started while this one was in flight — drop the result.
      if (reqId !== reqIdRef.current) return;
      const body = res.data ?? {};
      setParticipants(extractParties(body).map(normalize));
      setTotalPages(Math.max(1, Number(body.totalPages) || 1));
    } catch (e) {
      if (reqId !== reqIdRef.current) return;
      setErrorKey("participants.error");
      setParticipants([]);
      setTotalPages(1);
    } finally {
      if (reqId === reqIdRef.current) setIsLoading(false);
    }
  }, [page, name, filter, pageSize]);

  // AdminRoute calls this once the admin is authorized (stable identity so it
  // doesn't retrigger AdminRoute's effect); fetching is driven by the effect
  // below.
  const onAuthorized = useCallback(() => setAuthorized(true), []);

  // Fetch whenever we're authorized and have a measured page size; load's
  // identity changes with page/search/filter/pageSize.
  useEffect(() => {
    if (authorized && pageSize) load();
  }, [authorized, pageSize, load]);

  const formatDate = (value: string): string => {
    if (!value) return "—";
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d.toLocaleDateString();
  };

  const goToPage = (next: number) => {
    setPage((prev) => {
      const target = Math.min(Math.max(1, next), totalPages);
      return target === prev ? prev : target;
    });
  };

  const changeFilter = (value: FilterMode) => {
    setFilter(value);
    setPage(1); // a different result set starts at page 1
  };

  const openDetail = (partyId: string) => {
    if (partyId) router.push(`/participants/${encodeURIComponent(partyId)}`);
  };

  const hasQuery = name.length > 0 || filter !== "all";
  // Controls are available as soon as we're authorized (even while loading or
  // when a search yields zero rows), so the user can always adjust or refresh.
  const showToolbar = authorized;
  const showInitialLoading = isLoading && participants.length === 0;
  const showEmpty = !isLoading && !errorKey && participants.length === 0;
  const showTable = participants.length > 0;
  // Pad short pages with blank rows so the table keeps a constant height.
  const blankRows = Math.max(0, (pageSize ?? 0) - participants.length);

  return (
    <AdminRoute fetchData={onAuthorized}>
      <div className={styles.container}>
        {showToolbar && (
          <div className={styles.toolbar}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder={t("participants.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className={styles.statusSelect}
              value={filter}
              onChange={(e) => changeFilter(e.target.value as FilterMode)}
            >
              <option value="all">{t("participants.filters.all")}</option>
              <option value="mine">{t("participants.filters.mine")}</option>
              <option value="active">{t("participants.filters.active")}</option>
              <option value="certified">
                {t("participants.filters.certified")}
              </option>
            </select>
            <button
              className={styles.refreshButton}
              onClick={load}
              disabled={isLoading}
              title={t("participants.refresh")}
              aria-label={t("participants.refresh")}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
        )}

        {/* The scroll container always renders so useFitRows can measure the real
            available height (its clientHeight) even before the first row loads. */}
        <div ref={fitRef} className={styles.tableWrap}>
          {showInitialLoading && (
            <div className={styles.loading}>{t("participants.loading")}</div>
          )}
          {errorKey && <div className={styles.error}>{t(errorKey)}</div>}

          {showEmpty && (
            <div className={styles.empty}>
              {hasQuery ? t("participants.noResults") : t("participants.empty")}
            </div>
          )}

          {showTable && (
            <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("participants.table.partyId")}</th>
                <th>{t("participants.table.name")}</th>
                <th>{t("participants.table.roles")}</th>
                <th>{t("participants.table.status")}</th>
                <th>{t("participants.table.startDate")}</th>
                <th>{t("participants.table.endDate")}</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p, i) => (
                <tr
                  key={`${p.partyId}-${(page - 1) * (pageSize ?? 0) + i}`}
                  className={styles.clickableRow}
                  role="link"
                  tabIndex={0}
                  onClick={() => openDetail(p.partyId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDetail(p.partyId);
                    }
                  }}
                >
                  <td
                    data-label={t("participants.table.partyId")}
                    title={p.partyId || undefined}
                  >
                    {p.partyId || "—"}
                  </td>
                  <td
                    data-label={t("participants.table.name")}
                    title={p.name || undefined}
                  >
                    {p.name || "—"}
                  </td>
                  <td
                    className={styles.rolesCell}
                    data-label={t("participants.table.roles")}
                  >
                    {p.roles.length ? (
                      <div className={styles.roleList}>
                        <span className={styles.roleBadge} title={p.roles[0]}>
                          {p.roles[0]}
                        </span>
                        {p.roles.length > 1 && (
                          <RoleMoreBadge extras={p.roles.slice(1)} />
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label={t("participants.table.status")}>
                    {p.status ? (
                      <span
                        className={`${styles.status} ${
                          p.status.toLowerCase() === "active"
                            ? styles.active
                            : styles.inactive
                        }`}
                      >
                        {p.status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label={t("participants.table.startDate")}>
                    {formatDate(p.startDate)}
                  </td>
                  <td data-label={t("participants.table.endDate")}>
                    {formatDate(p.endDate)}
                  </td>
                </tr>
              ))}
              {/* Pad short pages (e.g. the last one) with blank rows so the
                  table keeps the same height across pages. Only when there is
                  more than one page, to avoid blank rows under a small result
                  set. */}
              {totalPages > 1 &&
                Array.from({ length: blankRows }).map((_, i) => (
                  <tr key={`empty-${i}`} aria-hidden="true">
                    <td colSpan={6}>&nbsp;</td>
                  </tr>
                ))}
            </tbody>
            </table>
          )}
        </div>

        {showTable && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={goToPage}
          />
        )}
      </div>
    </AdminRoute>
  );
};

export default Participants;
