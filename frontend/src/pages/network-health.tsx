import { NextPage } from "next";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/router";
import AdminRoute from "components/AdminRoute";
import { FormInput, FormSelect } from "components";
import API from "api/client";
import { prFailed, prMessage } from "util/prResponse";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import styles from "styles/NetworkHealth.module.css";
import form from "styles/PrForm.module.css";

// The PR /api/getLatestBlockDetails response is a Hyperledger-Fabric ledger view.
// We render it defensively (fields may vary by registry version): overall status,
// last execution, then one card per organisation (mspID) with its peers + the
// block explorer. Anything we don't recognise is simply not shown.
//
// The scheduler lives on this same page: an "Add scheduler" button opens the
// schedule-a-job modal, and the scheduled-jobs list sits below the health view
// (both hit the PR /api/* admin surface, so they belong together).
type Health = Record<string, any>;

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
const asArray = (v: any): any[] => (Array.isArray(v) ? v : []);
// getSchedulerList returns { count, data:[…] }; tolerate a bare array / {content}.
const asRows = (v: any): Health[] =>
  Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Array.isArray(v?.content) ? v.content : [];

// Notification emails travel as an array but edit as a comma-separated string.
const toList = (csv: string): string[] => csv.split(",").map((s) => s.trim()).filter(Boolean);
const fromList = (v: any): string => (Array.isArray(v) ? v.join(", ") : str(v));

// The PR stores dates as dd/MM/yyyy and times as HH:mm:ss; the HTML date/time
// inputs use yyyy-MM-dd and HH:mm. These convert between the two.
const toInputDate = (d: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const toApiDate = (d: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const toInputTime = (t: string): string => t.trim().slice(0, 5);
const toApiTime = (t: string): string => (t.trim() ? `${t.trim().slice(0, 5)}:00` : "");

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
type SchedStatus = "loading" | "ok" | "unavailable" | "error";

// Blank scheduler form = create mode. Frequency types sec/min/hr take a value
// ("every N"); day/week do not. Mirrors the PR's scheduler config shape.
const EMPTY_SCHED = {
  schedulerType: "",
  processName: "",
  emailID: "",
  schedulerFrequencyType: "",
  schedulerFrequencyValue: "1",
  schedulerDate: "",
  schedulerTime: "",
  enableScheduler: true,
};

const NetworkHealth: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const toast = useToast();
  const { prConfigured, settingsLoaded } = useSettings();
  // Registry-admin features are unavailable in a standalone deployment — bounce
  // direct navigation away (the nav entry is already hidden when not co-deployed).
  useEffect(() => {
    if (settingsLoaded && !prConfigured) router.replace("/");
  }, [settingsLoaded, prConfigured, router]);

  const [data, setData] = useState<Health | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [refreshing, setRefreshing] = useState(false);

  // Scheduler state.
  const [schedulers, setSchedulers] = useState<Health[]>([]);
  const [schedStatus, setSchedStatus] = useState<SchedStatus>("loading");
  const [schedForm, setSchedForm] = useState({ ...EMPTY_SCHED });
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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

  const loadSchedulers = useCallback(async () => {
    setSchedStatus("loading");
    try {
      const res = await new API().getSchedulers();
      if (prFailed(res?.data)) {
        setSchedStatus("error");
        return;
      }
      setSchedulers(asRows(res?.data));
      setSchedStatus("ok");
    } catch (e: any) {
      const code = e?.response?.status;
      setSchedStatus(code === 502 || code === 503 ? "unavailable" : "error");
    }
  }, []);

  // AdminRoute calls this once when the admin is authenticated.
  const loadAll = useCallback(() => {
    load();
    loadSchedulers();
  }, [load, loadSchedulers]);

  const setField = (k: string, v: string | boolean) => setSchedForm((p) => ({ ...p, [k]: v }));

  const openCreate = () => {
    setSchedForm({ ...EMPTY_SCHED });
    setEditing(false);
    setModalOpen(true);
  };

  // Populate the form from a list row (the list returns full records) and edit it.
  const openEdit = (r: Health) => {
    setSchedForm({
      schedulerType: str(r.schedulerType),
      processName: str(r.processName),
      emailID: fromList(r.emailID),
      schedulerFrequencyType: str(r.schedulerFrequencyType),
      schedulerFrequencyValue: str(r.schedulerFrequencyValue) || "1",
      schedulerDate: toInputDate(str(r.schedulerDate)),
      schedulerTime: toInputTime(str(r.schedulerTime)),
      enableScheduler: r.enableScheduler === true || r.enableScheduler === "true",
    });
    setEditing(true);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setSchedForm({ ...EMPTY_SCHED });
    setEditing(false);
  };

  // Escape closes the modal while it is open.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closeModal is stable enough for this purpose; modalOpen drives attach/detach.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, submitting]);

  // Human-readable frequency for the list (e.g. "Every 5 min", "Daily", "Weekly").
  const frequencyLabel = (r: Health): string => {
    const type = str(r.schedulerFrequencyType);
    if (type === "day") return t("scheduler.frequency.daily");
    if (type === "week") return t("scheduler.frequency.weekly");
    if (type === "sec" || type === "min" || type === "hr") {
      return t("scheduler.frequency.every", {
        value: str(r.schedulerFrequencyValue) || "1",
        unit: t(`scheduler.units.${type}`),
      });
    }
    return type || "—";
  };

  const isInterval = ["sec", "min", "hr"].includes(schedForm.schedulerFrequencyType);

  const submitScheduler = async () => {
    const emails = toList(schedForm.emailID);
    if (
      !schedForm.schedulerType ||
      !schedForm.processName.trim() ||
      !schedForm.schedulerFrequencyType ||
      emails.length === 0
    ) {
      toast.error(t("scheduler.form.required"));
      return;
    }
    // Interval types carry a value + interval; day/week clear both (PR convention).
    const body: Record<string, any> = {
      schedulerType: schedForm.schedulerType,
      processName: schedForm.processName.trim(),
      emailID: emails,
      schedulerFrequencyType: schedForm.schedulerFrequencyType,
      schedulerFrequencyValue: isInterval ? schedForm.schedulerFrequencyValue : "",
      schedulerInterval: isInterval ? schedForm.schedulerFrequencyType : "",
      schedulerDate: toApiDate(schedForm.schedulerDate),
      schedulerTime: toApiTime(schedForm.schedulerTime),
      enableScheduler: schedForm.enableScheduler,
    };
    setSubmitting(true);
    try {
      const api = new API();
      const res = editing ? await api.updateScheduler(body) : await api.createScheduler(body);
      if (prFailed(res?.data)) {
        toast.error(prMessage(res?.data) || t("scheduler.form.error"));
      } else {
        toast.success(prMessage(res?.data) || t(editing ? "scheduler.form.updated" : "scheduler.form.created"));
        setModalOpen(false);
        setSchedForm({ ...EMPTY_SCHED });
        setEditing(false);
        loadSchedulers();
      }
    } catch (e: any) {
      toast.error(str(e?.response?.data?.message) || str(e?.response?.data) || t("scheduler.form.error"));
    } finally {
      setSubmitting(false);
    }
  };

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

  // Scheduled-jobs list (below the health view).
  let schedList: ReactNode;
  if (schedStatus === "loading") schedList = <div className={styles.note}>{t("common.loading")}</div>;
  else if (schedStatus === "unavailable") schedList = note(t("scheduler.list.unavailable"), "error");
  else if (schedStatus === "error") schedList = note(t("scheduler.list.error"), "error");
  else if (schedulers.length === 0) schedList = <div className={styles.note}>{t("scheduler.list.empty")}</div>;
  else
    schedList = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("scheduler.list.process")}</th>
              <th>{t("scheduler.list.type")}</th>
              <th>{t("scheduler.list.frequency")}</th>
              <th>{t("scheduler.list.enabled")}</th>
              <th aria-label={t("scheduler.list.actions")} />
            </tr>
          </thead>
          <tbody>
            {schedulers.map((r, i) => (
              <tr key={str(r.processName) || i}>
                <td data-label={t("scheduler.list.process")}>{str(r.processName) || "—"}</td>
                <td data-label={t("scheduler.list.type")}>{str(r.schedulerType) || "—"}</td>
                <td data-label={t("scheduler.list.frequency")}>{frequencyLabel(r)}</td>
                <td data-label={t("scheduler.list.enabled")}>
                  {r.enableScheduler === true || r.enableScheduler === "true"
                    ? t("scheduler.list.yes")
                    : t("scheduler.list.no")}
                </td>
                <td>
                  <button type="button" className={styles.rowBtn} onClick={() => openEdit(r)}>
                    {t("scheduler.list.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  const typeOptions = [
    { value: "", label: t("scheduler.form.typePlaceholder") },
    { value: "Network Health Check", label: t("scheduler.types.networkHealth") },
  ];
  const frequencyOptions = [
    { value: "", label: t("scheduler.form.frequencyPlaceholder") },
    { value: "sec", label: t("scheduler.units.sec") },
    { value: "min", label: t("scheduler.units.min") },
    { value: "hr", label: t("scheduler.units.hr") },
    { value: "day", label: t("scheduler.frequency.daily") },
    { value: "week", label: t("scheduler.frequency.weekly") },
  ];

  return (
    <AdminRoute fetchData={loadAll}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>{t("networkHealth.title")}</h1>
          <div className={styles.headerActions}>
            <button type="button" className={styles.refreshBtn} onClick={load} disabled={refreshing}>
              {refreshing ? t("networkHealth.refreshing") : t("networkHealth.refresh")}
            </button>
            {prConfigured && (
              <button type="button" className={styles.secondaryBtn} onClick={openCreate}>
                {t("scheduler.form.create")}
              </button>
            )}
          </div>
        </div>
        <p className={styles.description}>{t("networkHealth.description")}</p>
        <div className={styles.body}>
          {body}

          {prConfigured && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>{t("scheduler.list.heading")}</h2>
                <button type="button" className={styles.rowBtn} onClick={loadSchedulers}>
                  {t("scheduler.list.refresh")}
                </button>
              </div>
              {schedList}
            </section>
          )}
        </div>

        {modalOpen && (
          <div className={styles.modalOverlay} onMouseDown={closeModal}>
            <div
              className={styles.modalPanel}
              role="dialog"
              aria-modal="true"
              aria-label={editing ? t("scheduler.form.editHeading", { name: schedForm.processName }) : t("scheduler.form.createHeading")}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className={styles.modalHead}>
                <h2 className={styles.modalTitle}>
                  {editing
                    ? t("scheduler.form.editHeading", { name: schedForm.processName })
                    : t("scheduler.form.createHeading")}
                </h2>
                <button type="button" className={styles.modalClose} aria-label={t("common.cancel")} onClick={closeModal}>
                  ×
                </button>
              </div>

              <div className={form.formGrid}>
                <FormSelect
                  label={t("scheduler.form.type")}
                  options={typeOptions}
                  value={schedForm.schedulerType}
                  onChange={(v) => setField("schedulerType", v)}
                  required
                />
                <FormInput
                  label={t("scheduler.form.process")}
                  id="processName"
                  name="processName"
                  type="text"
                  placeholder={t("scheduler.form.processPlaceholder")}
                  value={schedForm.processName}
                  onChange={(e) => setField("processName", e.target.value)}
                  required
                />
                <FormSelect
                  label={t("scheduler.form.frequency")}
                  options={frequencyOptions}
                  value={schedForm.schedulerFrequencyType}
                  onChange={(v) => setField("schedulerFrequencyType", v)}
                  required
                />
                {isInterval && (
                  <FormInput
                    label={t("scheduler.form.every")}
                    id="schedulerFrequencyValue"
                    name="schedulerFrequencyValue"
                    type="number"
                    placeholder="1"
                    value={schedForm.schedulerFrequencyValue}
                    onChange={(e) => setField("schedulerFrequencyValue", e.target.value)}
                  />
                )}
                <FormInput
                  label={t("scheduler.form.startDate")}
                  id="schedulerDate"
                  name="schedulerDate"
                  type="date"
                  placeholder=""
                  value={schedForm.schedulerDate}
                  onChange={(e) => setField("schedulerDate", e.target.value)}
                />
                <FormInput
                  label={t("scheduler.form.startTime")}
                  id="schedulerTime"
                  name="schedulerTime"
                  type="time"
                  placeholder=""
                  value={schedForm.schedulerTime}
                  onChange={(e) => setField("schedulerTime", e.target.value)}
                />
                <FormInput
                  label={t("scheduler.form.emails")}
                  id="emailID"
                  name="emailID"
                  type="text"
                  placeholder={t("scheduler.form.emailsPlaceholder")}
                  value={schedForm.emailID}
                  onChange={(e) => setField("emailID", e.target.value)}
                  required
                />
              </div>
              <label className={form.checkboxRow}>
                <input
                  type="checkbox"
                  checked={schedForm.enableScheduler}
                  onChange={(e) => setField("enableScheduler", e.target.checked)}
                />
                {t("scheduler.form.enable")}
              </label>
              <p className={form.hint}>{t("scheduler.form.hint")}</p>
              <div className={form.actions}>
                <button type="button" className={form.primaryBtn} onClick={submitScheduler} disabled={submitting}>
                  {submitting
                    ? t("scheduler.form.submitting")
                    : editing
                    ? t("scheduler.form.update")
                    : t("scheduler.form.create")}
                </button>
                <button type="button" className={form.refreshBtn} onClick={closeModal} disabled={submitting}>
                  {t("scheduler.form.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminRoute>
  );
};

export default NetworkHealth;
