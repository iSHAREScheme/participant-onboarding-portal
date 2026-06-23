import { NextPage } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/router";
import AdminRoute from "components/AdminRoute";
import { FormInput, FormSelect } from "components";
import API from "api/client";
import { prFailed, prMessage } from "util/prResponse";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import { useConfirm } from "../context/ConfirmContext";
import { useToast } from "../context/ToastContext";
import styles from "styles/Revoke.module.css";

// Trusted-list (certificate authority) management on the PR /api/* admin surface.
// Add flow: upload a certificate → validate (PR returns subject/fingerprint) →
// pick a type → create. Plus edit (status/type) and delete. Shares Revoke styles.
type Row = Record<string, any>;

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
// ca/list returns { count, data:[…] }; tolerate a bare array / {content}.
const asRows = (v: any): Row[] =>
  Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Array.isArray(v?.content) ? v.content : [];

// Base64 of a file's raw bytes — the verbatim body the PR validate endpoint reads.
const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

type ListStatus = "loading" | "ok" | "unavailable" | "error";

// Blank form = add mode (no fingerprint yet). `Validity` keeps the PR's capital V.
const EMPTY = { certificate: "", subject: "", certificateFingerprint: "", Validity: "", status: "Granted", type: "" };

const Trusted: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const confirm = useConfirm();
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
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadList = useCallback(async () => {
    setListStatus("loading");
    try {
      const res = await new API().getTrustedList();
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

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const resetForm = () => {
    setForm({ ...EMPTY });
    setEditing(false);
    setValidated(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  // Upload → base64 → PR validate. On success the PR returns the parsed subject
  // and fingerprint, which pre-fill the (read-only) identity fields.
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/\.(cer|crt|der|pem|pfx|key)$/i.test(file.name)) {
      toast.error(t("trusted.form.badFile"));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setValidating(true);
    setValidated(false);
    try {
      const buf = await file.arrayBuffer();
      const res = await new API().validateTrustedCert(toBase64(buf));
      const data = res?.data || {};
      const errors: string[] = Array.isArray(data.errors) ? data.errors : [];
      if (errors.length) {
        toast.error(errors.join(", "));
        setForm((p) => ({ ...EMPTY, status: p.status }));
        return;
      }
      const model = data.model || {};
      setForm((p) => ({
        ...p,
        certificate: str(model.certificate),
        subject: str(model.subject),
        certificateFingerprint: str(model.certificateFingerprint),
        Validity: data.validity === true ? "Valid" : "Invalid",
      }));
      setValidated(true);
    } catch (err: any) {
      toast.error(str(err?.response?.data?.message) || str(err?.response?.data) || t("trusted.form.validateError"));
    } finally {
      setValidating(false);
    }
  };

  // Populate the form from a list row to change its status/type (no re-upload).
  const startEdit = (r: Row) => {
    setForm({
      certificate: str(r.certificate),
      subject: str(r.subject),
      certificateFingerprint: str(r.certificateFingerprint),
      Validity: str(r.Validity),
      status: str(r.status) || "Granted",
      type: str(r.type),
    });
    setEditing(true);
    setValidated(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (r: Row) => {
    const label = str(r.subject) || str(r.certificateFingerprint);
    const ok = await confirm({
      danger: true,
      title: t("trusted.confirm.title"),
      message: t("trusted.confirm.message", { target: label }),
      confirmLabel: t("trusted.confirm.button"),
    });
    if (!ok) return;
    try {
      const res = await new API().deleteTrustedCA(r);
      if (prFailed(res?.data)) {
        toast.error(prMessage(res?.data) || t("trusted.form.deleteError"));
        return;
      }
      toast.success(prMessage(res?.data) || t("trusted.form.deleted"));
      if (editing && form.certificateFingerprint === str(r.certificateFingerprint)) resetForm();
      loadList();
    } catch (e: any) {
      toast.error(str(e?.response?.data?.message) || str(e?.response?.data) || t("trusted.form.deleteError"));
    }
  };

  const submit = async () => {
    if (!form.type) {
      toast.error(t("trusted.form.typeRequired"));
      return;
    }
    if (!editing && !form.certificate) {
      toast.error(t("trusted.form.certRequired"));
      return;
    }
    const body: Record<string, any> = {
      certificate: form.certificate,
      subject: form.subject,
      certificateFingerprint: form.certificateFingerprint,
      Validity: form.Validity,
      status: form.status,
      type: form.type,
    };
    setSubmitting(true);
    try {
      const api = new API();
      const res = editing ? await api.updateTrustedCA(body) : await api.createTrustedCA(body);
      if (prFailed(res?.data)) {
        toast.error(prMessage(res?.data) || t("trusted.form.error"));
      } else {
        toast.success(prMessage(res?.data) || t(editing ? "trusted.form.updated" : "trusted.form.created"));
        resetForm();
        loadList();
      }
    } catch (e: any) {
      toast.error(str(e?.response?.data?.message) || str(e?.response?.data) || t("trusted.form.error"));
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
    { value: "Pkio", label: t("trusted.types.pkio") },
    { value: "IshareTest", label: t("trusted.types.ishareTest") },
    { value: "Eidas", label: t("trusted.types.eidas") },
  ];
  const statusOptions = [
    { value: "Granted", label: t("trusted.statuses.granted") },
    { value: "Withdrawn", label: t("trusted.statuses.withdrawn") },
    { value: "Supervision Ceased", label: t("trusted.statuses.supervisionCeased") },
    { value: "Under Supervision", label: t("trusted.statuses.underSupervision") },
  ];

  let list: ReactNode;
  if (listStatus === "loading") list = <div className={styles.note}>{t("common.loading")}</div>;
  else if (listStatus === "unavailable") list = <div className={styles.error}>{t("trusted.list.unavailable")}</div>;
  else if (listStatus === "error") list = <div className={styles.error}>{t("trusted.list.error")}</div>;
  else if (rows.length === 0) list = <div className={styles.note}>{t("trusted.list.empty")}</div>;
  else
    list = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("trusted.list.subject")}</th>
              <th>{t("trusted.list.type")}</th>
              <th>{t("trusted.list.validity")}</th>
              <th>{t("trusted.list.status")}</th>
              <th aria-label={t("trusted.list.actions")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={str(r.certificateFingerprint) || str(r.subject) || i}>
                <td data-label={t("trusted.list.subject")}>{str(r.subject) || "—"}</td>
                <td data-label={t("trusted.list.type")}>{str(r.type) || "—"}</td>
                <td data-label={t("trusted.list.validity")}>{str(r.Validity) || "—"}</td>
                <td data-label={t("trusted.list.status")}>{str(r.status) || "—"}</td>
                <td>
                  <div className={styles.actions} style={{ margin: 0 }}>
                    <button type="button" className={styles.refreshBtn} onClick={() => startEdit(r)}>
                      {t("trusted.list.edit")}
                    </button>
                    <button type="button" className={styles.refreshBtn} onClick={() => remove(r)}>
                      {t("trusted.list.delete")}
                    </button>
                  </div>
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
        <h1 className={styles.title}>{t("trusted.title")}</h1>
        <p className={styles.description}>{t("trusted.description")}</p>

        <div className={styles.body}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              {editing ? t("trusted.form.editHeading", { subject: form.subject }) : t("trusted.form.addHeading")}
            </h2>

            {/* Certificate upload — add mode only; editing changes status/type. */}
            {!editing && (
              <div className={styles.uploadRow}>
                <span className={styles.uploadLabel}>{t("trusted.form.certificate")}</span>
                <input
                  ref={fileRef}
                  type="file"
                  className={styles.fileInput}
                  accept=".cer,.crt,.der,.pem,.pfx,.key"
                  onChange={onFile}
                  disabled={validating || submitting}
                />
                {validating && <span className={styles.hint}>{t("trusted.form.validating")}</span>}
                {validated && form.subject && (
                  <span className={styles.hint}>
                    {form.subject}{" "}
                    <span
                      className={`${styles.badge} ${
                        form.Validity === "Valid" ? styles.badgeValid : styles.badgeInvalid
                      }`}
                    >
                      {form.Validity === "Valid" ? t("trusted.form.valid") : t("trusted.form.invalid")}
                    </span>
                  </span>
                )}
              </div>
            )}

            <div className={styles.formGrid}>
              <FormInput
                label={t("trusted.form.subject")}
                id="subject"
                name="subject"
                type="text"
                placeholder={t("trusted.form.subjectPlaceholder")}
                value={form.subject}
                onChange={() => {}}
                disabled
              />
              <FormInput
                label={t("trusted.form.fingerprint")}
                id="certificateFingerprint"
                name="certificateFingerprint"
                type="text"
                placeholder="—"
                value={form.certificateFingerprint}
                onChange={() => {}}
                disabled
              />
              <FormSelect
                label={t("trusted.form.type")}
                options={typeOptions}
                value={form.type}
                onChange={(v) => set("type", v)}
                required
              />
              <FormSelect
                label={t("trusted.form.status")}
                options={statusOptions}
                value={form.status}
                onChange={(v) => set("status", v)}
              />
            </div>
            <p className={styles.hint}>{t("trusted.form.hint")}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={submit}
                disabled={submitting || validating || (!editing && !validated)}
              >
                {submitting
                  ? t("trusted.form.submitting")
                  : editing
                  ? t("trusted.form.update")
                  : t("trusted.form.create")}
              </button>
              {editing && (
                <button type="button" className={styles.refreshBtn} onClick={resetForm} disabled={submitting}>
                  {t("trusted.form.cancel")}
                </button>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>{t("trusted.list.heading")}</h2>
              <button type="button" className={styles.refreshBtn} onClick={loadList}>
                {t("trusted.list.refresh")}
              </button>
            </div>
            {list}
          </section>
        </div>
      </div>
    </AdminRoute>
  );
};

export default Trusted;
