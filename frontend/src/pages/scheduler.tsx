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
import styles from "styles/Revoke.module.css";

// Scheduler management on the PR /api/* admin surface: list scheduled jobs and
// create or edit one. Read (list) + write (create/edit) follow the same HandlerPR
// template as the other PR features (the PR exposes no delete). Shares Revoke styles.
type Row = Record<string, any>;

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
// getSchedulerList returns { count, data:[…] }; tolerate a bare array / {content}.
const asRows = (v: any): Row[] =>
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

type ListStatus = "loading" | "ok" | "unavailable" | "error";

// Blank form = create mode. Frequency types sec/min/hr take a value ("every N");
// day/week do not. Mirrors the PR's scheduler config shape.
const EMPTY = {
  schedulerType: "",
  processName: "",
  emailID: "",
  schedulerFrequencyType: "",
  schedulerFrequencyValue: "1",
  schedulerDate: "",
  schedulerTime: "",
  enableScheduler: true,
};

const Scheduler: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const toast = useToast();
  const { prConfigured, settingsLoaded } = useSettings();

  // Unavailable in a standalone deployment — bounce direct navigation away
  // (the nav entry is hidden when not co-deployed).
  useEffect(() => {
    if (settingsLoaded && !prConfigured) router.replace("/");
  }, [settingsLoaded, prConfigured, router]);

  const [rows, setRows] = useState<Row[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadList = useCallback(async () => {
    setListStatus("loading");
    try {
      const res = await new API().getSchedulers();
      if (prFailed(res?.data)) {
        setListStatus("error");
        return;
      }
      setRows(asRows(res?.data));
      setListStatus("ok");
    } catch (e: any) {
      const code = e?.response?.status;
      setListStatus(code === 502 || code === 503 ? "unavailable" : "error");
    }
  }, []);

  const set = (k: string, v: string | boolean) => setForm((p) => ({ ...p, [k]: v }));

  const resetForm = () => {
    setForm({ ...EMPTY });
    setEditing(false);
  };

  // Populate the form from a list row (the list returns full records).
  const startEdit = (r: Row) => {
    setForm({
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
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Human-readable frequency for the list (e.g. "Every 5 min", "Daily", "Weekly").
  const frequencyLabel = (r: Row): string => {
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

  const isInterval = ["sec", "min", "hr"].includes(form.schedulerFrequencyType);

  const submit = async () => {
    const emails = toList(form.emailID);
    if (!form.schedulerType || !form.processName.trim() || !form.schedulerFrequencyType || emails.length === 0) {
      toast.error(t("scheduler.form.required"));
      return;
    }
    // Interval types carry a value + interval; day/week clear both (PR convention).
    const body: Record<string, any> = {
      schedulerType: form.schedulerType,
      processName: form.processName.trim(),
      emailID: emails,
      schedulerFrequencyType: form.schedulerFrequencyType,
      schedulerFrequencyValue: isInterval ? form.schedulerFrequencyValue : "",
      schedulerInterval: isInterval ? form.schedulerFrequencyType : "",
      schedulerDate: toApiDate(form.schedulerDate),
      schedulerTime: toApiTime(form.schedulerTime),
      enableScheduler: form.enableScheduler,
    };
    setSubmitting(true);
    try {
      const api = new API();
      const res = editing ? await api.updateScheduler(body) : await api.createScheduler(body);
      if (prFailed(res?.data)) {
        toast.error(prMessage(res?.data) || t("scheduler.form.error"));
      } else {
        toast.success(prMessage(res?.data) || t(editing ? "scheduler.form.updated" : "scheduler.form.created"));
        resetForm();
        loadList();
      }
    } catch (e: any) {
      toast.error(str(e?.response?.data?.message) || str(e?.response?.data) || t("scheduler.form.error"));
    } finally {
      setSubmitting(false);
    }
  };

  // Hidden / redirecting until co-deployment is confirmed.
  if (!prConfigured) {
    return (
      <AdminRoute fetchData={() => {}}>
        <div className={styles.container}>
          <div className={styles.note}>{t("common.loading")}</div>
        </div>
      </AdminRoute>
    );
  }

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

  let list: ReactNode;
  if (listStatus === "loading") list = <div className={styles.note}>{t("common.loading")}</div>;
  else if (listStatus === "unavailable") list = <div className={styles.error}>{t("scheduler.list.unavailable")}</div>;
  else if (listStatus === "error") list = <div className={styles.error}>{t("scheduler.list.error")}</div>;
  else if (rows.length === 0) list = <div className={styles.note}>{t("scheduler.list.empty")}</div>;
  else
    list = (
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
            {rows.map((r, i) => (
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
                  <button type="button" className={styles.refreshBtn} onClick={() => startEdit(r)}>
                    {t("scheduler.list.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <AdminRoute fetchData={loadList}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("scheduler.title")}</h1>
        <p className={styles.description}>{t("scheduler.description")}</p>

        <div className={styles.body}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              {editing ? t("scheduler.form.editHeading", { name: form.processName }) : t("scheduler.form.createHeading")}
            </h2>
            <div className={styles.formGrid}>
              <FormSelect
                label={t("scheduler.form.type")}
                options={typeOptions}
                value={form.schedulerType}
                onChange={(v) => set("schedulerType", v)}
                required
              />
              <FormInput
                label={t("scheduler.form.process")}
                id="processName"
                name="processName"
                type="text"
                placeholder={t("scheduler.form.processPlaceholder")}
                value={form.processName}
                onChange={(e) => set("processName", e.target.value)}
                required
              />
              <FormSelect
                label={t("scheduler.form.frequency")}
                options={frequencyOptions}
                value={form.schedulerFrequencyType}
                onChange={(v) => set("schedulerFrequencyType", v)}
                required
              />
              {isInterval && (
                <FormInput
                  label={t("scheduler.form.every")}
                  id="schedulerFrequencyValue"
                  name="schedulerFrequencyValue"
                  type="number"
                  placeholder="1"
                  value={form.schedulerFrequencyValue}
                  onChange={(e) => set("schedulerFrequencyValue", e.target.value)}
                />
              )}
              <FormInput
                label={t("scheduler.form.startDate")}
                id="schedulerDate"
                name="schedulerDate"
                type="date"
                placeholder=""
                value={form.schedulerDate}
                onChange={(e) => set("schedulerDate", e.target.value)}
              />
              <FormInput
                label={t("scheduler.form.startTime")}
                id="schedulerTime"
                name="schedulerTime"
                type="time"
                placeholder=""
                value={form.schedulerTime}
                onChange={(e) => set("schedulerTime", e.target.value)}
              />
              <FormInput
                label={t("scheduler.form.emails")}
                id="emailID"
                name="emailID"
                type="text"
                placeholder={t("scheduler.form.emailsPlaceholder")}
                value={form.emailID}
                onChange={(e) => set("emailID", e.target.value)}
                required
              />
            </div>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.enableScheduler}
                onChange={(e) => set("enableScheduler", e.target.checked)}
              />
              {t("scheduler.form.enable")}
            </label>
            <p className={styles.hint}>{t("scheduler.form.hint")}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryBtn} onClick={submit} disabled={submitting}>
                {submitting
                  ? t("scheduler.form.submitting")
                  : editing
                  ? t("scheduler.form.update")
                  : t("scheduler.form.create")}
              </button>
              {editing && (
                <button type="button" className={styles.refreshBtn} onClick={resetForm} disabled={submitting}>
                  {t("scheduler.form.cancel")}
                </button>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>{t("scheduler.list.heading")}</h2>
              <button type="button" className={styles.refreshBtn} onClick={loadList}>
                {t("scheduler.list.refresh")}
              </button>
            </div>
            {list}
          </section>
        </div>
      </div>
    </AdminRoute>
  );
};

export default Scheduler;
