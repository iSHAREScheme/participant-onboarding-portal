import { NextPage } from "next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import AdminRoute from "components/AdminRoute";
import Pagination from "components/Pagination";
import API from "api/client";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import styles from "styles/Frameworks.module.css";

type FrameworkRow = {
  id?: string;
  title?: string;
  description?: string;
  status?: string;
  version?: string;
  startDate?: string;
  endDate?: string;
  validFrom?: string;
  validUntil?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: Record<string, any>;
};

type Status = "loading" | "ok" | "notConfigured" | "unavailable" | "error";

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
const num = (v: any, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const Frameworks: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const { prConfigured, settingsLoaded } = useSettings();

  const [frameworks, setFrameworks] = useState<FrameworkRow[]>([]);
  const [claims, setClaims] = useState<Record<string, any> | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string>("");

  useEffect(() => {
    if (settingsLoaded && !prConfigured) router.replace("/");
  }, [settingsLoaded, prConfigured, router]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await new API().fetchFrameworks({ page, pageSize });
      const body = res?.data || {};
      const rows = Array.isArray(body.frameworks) ? body.frameworks : [];
      const pagination = body.pagination || {};
      setFrameworks(rows);
      setClaims(body.claims && typeof body.claims === "object" ? body.claims : null);
      const count = num(pagination.count ?? pagination.total ?? pagination.totalItems, rows.length);
      const apiPageSize = num(pagination.pageSize, pageSize);
      setTotal(count);
      setTotalPages(num(pagination.totalPages, Math.max(1, Math.ceil(count / apiPageSize))));
      setStatus("ok");
    } catch (e: any) {
      const code = e?.response?.status;
      if (code === 501) setStatus("notConfigured");
      else if (code === 502 || code === 503) setStatus("unavailable");
      else setStatus("error");
      setFrameworks([]);
      setClaims(null);
    } finally {
      setRefreshing(false);
    }
  }, [page, pageSize]);

  const onAuthorized = useCallback(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status !== "loading") queueMicrotask(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const meta = useMemo(() => {
    const first = frameworks.length === 0 ? 0 : (page - 1) * pageSize + 1;
    const last = Math.min(page * pageSize, total || first + frameworks.length - 1);
    return t("frameworks.pagination.summary", { first, last, total: total || frameworks.length });
  }, [frameworks.length, page, pageSize, total, t]);

  const renderFact = (label: string, value: any) => (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{str(value) || "—"}</span>
    </div>
  );

  const renderFramework = (row: FrameworkRow, index: number) => {
    const id = row.id || `framework-${index}`;
    const raw = row.raw || row;
    const open = expanded === id;
    return (
      <article className={styles.card} key={`${id}-${index}`}>
        <div className={styles.cardHead}>
          <div>
            <h2 className={styles.cardTitle}>{row.title || row.id || t("frameworks.untitled")}</h2>
            <p className={styles.cardId}>{row.id || "—"}</p>
          </div>
          {row.status && <span className={styles.badge}>{row.status}</span>}
        </div>
        {row.description && <p className={styles.descriptionText}>{row.description}</p>}
        <div className={styles.facts}>
          {renderFact(t("frameworks.fields.version"), row.version)}
          {renderFact(t("frameworks.fields.validFrom"), row.validFrom || row.startDate)}
          {renderFact(t("frameworks.fields.validUntil"), row.validUntil || row.endDate)}
          {renderFact(t("frameworks.fields.updated"), row.updatedAt || row.createdAt)}
        </div>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => setExpanded(open ? "" : id)}
        >
          {open ? t("frameworks.hideRaw") : t("frameworks.showRaw")}
        </button>
        {open && <pre className={styles.raw}>{JSON.stringify(raw, null, 2)}</pre>}
      </article>
    );
  };

  let body;
  if (status === "loading") {
    body = <div className={styles.note}>{t("common.loading")}</div>;
  } else if (status === "notConfigured") {
    body = <div className={styles.note}>{t("frameworks.notConfigured")}</div>;
  } else if (status === "unavailable") {
    body = <div className={styles.error}>{t("frameworks.unavailable")}</div>;
  } else if (status === "error") {
    body = <div className={styles.error}>{t("frameworks.error")}</div>;
  } else if (frameworks.length === 0) {
    body = <div className={styles.note}>{t("frameworks.empty")}</div>;
  } else {
    body = (
      <>
        <div className={styles.summary}>
          <span>{meta}</span>
          {claims?.iss && <span>{t("frameworks.issuer", { issuer: str(claims.iss) })}</span>}
        </div>
        <div className={styles.list}>{frameworks.map(renderFramework)}</div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </>
    );
  }

  return (
    <AdminRoute fetchData={onAuthorized}>
      <main className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>{t("frameworks.title")}</h1>
            <p className={styles.description}>{t("frameworks.description")}</p>
          </div>
          <div className={styles.headerActions}>
            <label className={styles.pageSize}>
              <span>{t("frameworks.pageSize")}</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
              >
                {[10, 20, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button type="button" className={styles.refreshBtn} onClick={load} disabled={refreshing}>
              {refreshing ? t("frameworks.refreshing") : t("frameworks.refresh")}
            </button>
          </div>
        </div>
        <div className={styles.body}>{body}</div>
      </main>
    </AdminRoute>
  );
};

export default Frameworks;
