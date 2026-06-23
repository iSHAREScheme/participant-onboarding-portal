import { NextPage } from "next";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/router";
import AdminRoute from "components/AdminRoute";
import API from "api/client";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import styles from "styles/NetworkHealth.module.css";

// The PR /api/getLatestBlockDetails response is a Hyperledger-Fabric ledger view.
// We render it defensively (fields may vary by registry version): overall status,
// last execution, then one card per organisation (mspID) with its peers + the
// block explorer. Anything we don't recognise is simply not shown.
type Health = Record<string, any>;

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
const asArray = (v: any): any[] => (Array.isArray(v) ? v : []);

// "Healthy"/"OK"/"up" → true; "UnHealthy"/"down" → false; unknown → null (neutral).
const healthState = (s: string): boolean | null => {
  const v = s.toLowerCase();
  if (!v) return null;
  if (/(^|[^a-z])unhealthy|down|error|fail/.test(v)) return false;
  if (/healthy|ok|up|active|good/.test(v)) return true;
  return null;
};

const fmtDate = (v: any): string => {
  const s = str(v);
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString();
};

const HealthPill = ({ value }: { value: string }) => {
  const state = healthState(value);
  const cls = state === true ? styles.healthy : state === false ? styles.unhealthy : styles.neutral;
  return <span className={`${styles.pill} ${cls}`}>{value || "—"}</span>;
};

type Status = "loading" | "ok" | "notConfigured" | "unavailable" | "error";

const NetworkHealth: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const { prConfigured, settingsLoaded } = useSettings();
  // Registry-admin features are unavailable in a standalone deployment — bounce
  // direct navigation away (the nav entry is already hidden when not co-deployed).
  useEffect(() => {
    if (settingsLoaded && !prConfigured) router.replace("/");
  }, [settingsLoaded, prConfigured, router]);
  const [data, setData] = useState<Health | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await new API().getNetworkHealth();
      setData(res?.data && typeof res.data === "object" ? res.data : {});
      setStatus("ok");
    } catch (e: any) {
      const code = e?.response?.status;
      if (code === 501) setStatus("notConfigured");
      else if (code === 502 || code === 503) setStatus("unavailable");
      else setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  const sats = asArray(data?.satelliteDetails);

  const note = (msg: string, tone: "info" | "error" = "info"): ReactNode => (
    <div className={tone === "error" ? styles.error : styles.note}>{msg}</div>
  );

  // Per-organisation card: org id + overall health, a peers table, and the
  // explorer block info when present.
  const renderSatellite = (sat: Health, i: number) => {
    const peers = asArray(sat.peerDetails);
    const explorerName = str(sat.explorerName);
    const explorerStatus = str(sat.explorerStatus);
    const explorerBlock = str(sat.explorerBlockNo);
    return (
      <div className={styles.orgCard} key={`${str(sat.mspID)}-${i}`}>
        <div className={styles.orgHead}>
          <span className={styles.orgName}>{str(sat.mspID) || t("networkHealth.org")}</span>
          <HealthPill value={str(sat.healthStatus ?? sat.status)} />
        </div>

        {peers.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("networkHealth.peerName")}</th>
                  <th>{t("networkHealth.blockNo")}</th>
                  <th>{t("networkHealth.health")}</th>
                </tr>
              </thead>
              <tbody>
                {peers.map((p, j) => (
                  <tr key={`${str(p.peerName)}-${j}`}>
                    <td data-label={t("networkHealth.peerName")}>{str(p.peerName) || "—"}</td>
                    <td data-label={t("networkHealth.blockNo")}>{str(p.peerBlockNo) || "—"}</td>
                    <td data-label={t("networkHealth.health")}>
                      <HealthPill value={str(p.healthStatus ?? p.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(explorerName || explorerBlock || explorerStatus) && (
          <div className={styles.explorer}>
            <span className={styles.explorerLabel}>{t("networkHealth.explorer")}</span>
            <span className={styles.explorerVal}>
              {explorerName || "—"}
              {explorerBlock ? ` · ${t("networkHealth.blockNo")} ${explorerBlock}` : ""}
            </span>
            {explorerStatus && <HealthPill value={explorerStatus} />}
          </div>
        )}
      </div>
    );
  };

  let body: ReactNode;
  if (!prConfigured) {
    // Settings still loading, or not co-deployed (the effect above redirects away).
    body = <div className={styles.note}>{t("common.loading")}</div>;
  } else if (status === "loading") {
    body = <div className={styles.note}>{t("common.loading")}</div>;
  } else if (status === "notConfigured") {
    body = note(t("networkHealth.notConfigured"));
  } else if (status === "unavailable") {
    body = note(t("networkHealth.unavailable"), "error");
  } else if (status === "error") {
    body = note(t("networkHealth.loadError"), "error");
  } else {
    body = (
      <>
        <div className={styles.summary}>
          <div className={styles.fact}>
            <span className={styles.factLabel}>{t("networkHealth.overall")}</span>
            <HealthPill value={str(data?.status)} />
          </div>
          <div className={styles.fact}>
            <span className={styles.factLabel}>{t("networkHealth.lastExecution")}</span>
            <span className={styles.factValue}>{fmtDate(data?.lastUpdatedDate)}</span>
          </div>
          {str(data?.notificationStatus) && (
            <div className={styles.fact}>
              <span className={styles.factLabel}>{t("networkHealth.notificationStatus")}</span>
              <span className={styles.factValue}>{str(data?.notificationStatus)}</span>
            </div>
          )}
        </div>

        {sats.length > 0 ? (
          <div className={styles.orgs}>{sats.map(renderSatellite)}</div>
        ) : (
          note(t("networkHealth.empty"))
        )}
      </>
    );
  }

  return (
    <AdminRoute fetchData={load}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t("networkHealth.title")}</h1>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={load}
            disabled={refreshing}
          >
            {refreshing ? t("networkHealth.refreshing") : t("networkHealth.refresh")}
          </button>
        </div>
        <p className={styles.description}>{t("networkHealth.description")}</p>
        <div className={styles.body}>{body}</div>
      </div>
    </AdminRoute>
  );
};

export default NetworkHealth;
