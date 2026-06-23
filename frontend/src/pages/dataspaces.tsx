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

// Dataspace management on the PR /api/* admin surface: list every dataspace and
// create or edit one. Read (list/detail) + write (create/edit) follow the same
// HandlerPR template as revoke/transfer, and the page shares Revoke's styles.
type Row = Record<string, any>;

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
// dataSpaceList returns { count, data:[…] }; tolerate a bare array / {content}.
const asRows = (v: any): Row[] =>
  Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : Array.isArray(v?.content) ? v.content : [];

// Multi-value fields travel as arrays on the wire but are edited as a single
// comma-separated string in the form. These keep the two representations in sync.
const toList = (csv: string): string[] => csv.split(",").map((s) => s.trim()).filter(Boolean);
const fromList = (v: any): string => (Array.isArray(v) ? v.join(", ") : str(v));

type ListStatus = "loading" | "ok" | "unavailable" | "error";

// Blank form = create mode (no dataspace id yet).
const EMPTY = {
  subject: "",
  dataspaceID: "",
  dataspaceDefinitionURL: "",
  dataspaceWebsite: "",
  tags: "",
  status: "Active",
  countryOfRegistration: "",
  countriesOfOperation: "",
  sectorIndustry: "",
  specificAgreements: "",
};

const Dataspaces: NextPage = () => {
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadList = useCallback(async () => {
    setListStatus("loading");
    try {
      const res = await new API().getManagedDataspaces();
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
    setEditingId(null);
  };

  // Load one dataspace's full record into the form and switch to edit mode.
  const startEdit = async (id: string) => {
    try {
      const res = await new API().getDataspaceDetail(id);
      const d = res?.data || {};
      const dsId = str(d.dataspaceID) || id;
      setForm({
        subject: str(d.subject),
        dataspaceID: dsId,
        dataspaceDefinitionURL: str(d.dataspaceDefinitionURL),
        dataspaceWebsite: str(d.dataspaceWebsite),
        tags: str(d.tags),
        status: str(d.status) || "Active",
        countryOfRegistration: str(d.countryOfRegistration),
        countriesOfOperation: fromList(d.countriesOfOperation),
        sectorIndustry: fromList(d.sectorIndustry),
        specificAgreements: fromList(d.specificAgreements),
      });
      setEditingId(dsId);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error(t("dataspaces.form.loadError"));
    }
  };

  const submit = async () => {
    const subject = form.subject.trim();
    const dataspaceID = form.dataspaceID.trim();
    if (!subject || !dataspaceID) {
      toast.error(t("dataspaces.form.required"));
      return;
    }
    const body: Record<string, any> = {
      subject,
      dataspaceID,
      dataspaceDefinitionURL: form.dataspaceDefinitionURL.trim(),
      dataspaceWebsite: form.dataspaceWebsite.trim(),
      tags: form.tags.trim(),
      status: form.status,
      countryOfRegistration: form.countryOfRegistration.trim(),
      countriesOfOperation: toList(form.countriesOfOperation),
      sectorIndustry: toList(form.sectorIndustry),
      specificAgreements: toList(form.specificAgreements),
    };
    setSubmitting(true);
    try {
      const api = new API();
      const res = editingId ? await api.updateDataspace(body) : await api.createDataspace(body);
      if (prFailed(res?.data)) {
        toast.error(prMessage(res?.data) || t("dataspaces.form.error"));
      } else {
        toast.success(prMessage(res?.data) || t(editingId ? "dataspaces.form.updated" : "dataspaces.form.created"));
        resetForm();
        loadList();
      }
    } catch (e: any) {
      toast.error(
        str(e?.response?.data?.message) || str(e?.response?.data) || t("dataspaces.form.error")
      );
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

  const statusOptions = [
    { value: "New", label: t("dataspaces.status.new") },
    { value: "InProgress", label: t("dataspaces.status.inProgress") },
    { value: "Active", label: t("dataspaces.status.active") },
    { value: "NotActive", label: t("dataspaces.status.notActive") },
  ];

  let list: ReactNode;
  if (listStatus === "loading") list = <div className={styles.note}>{t("common.loading")}</div>;
  else if (listStatus === "unavailable") list = <div className={styles.error}>{t("dataspaces.list.unavailable")}</div>;
  else if (listStatus === "error") list = <div className={styles.error}>{t("dataspaces.list.error")}</div>;
  else if (rows.length === 0) list = <div className={styles.note}>{t("dataspaces.list.empty")}</div>;
  else
    list = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("dataspaces.list.subject")}</th>
              <th>{t("dataspaces.list.id")}</th>
              <th>{t("dataspaces.list.status")}</th>
              <th>{t("dataspaces.list.country")}</th>
              <th aria-label={t("dataspaces.list.actions")} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const id = str(r.dataspaceID);
              return (
                <tr key={id || i}>
                  <td data-label={t("dataspaces.list.subject")}>{str(r.subject) || "—"}</td>
                  <td data-label={t("dataspaces.list.id")}>{id || "—"}</td>
                  <td data-label={t("dataspaces.list.status")}>{str(r.status) || "—"}</td>
                  <td data-label={t("dataspaces.list.country")}>{str(r.countryOfRegistration) || "—"}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.refreshBtn}
                      onClick={() => startEdit(id)}
                      disabled={!id}
                    >
                      {t("dataspaces.list.edit")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  return (
    <AdminRoute fetchData={loadList}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("dataspaces.title")}</h1>
        <p className={styles.description}>{t("dataspaces.description")}</p>

        <div className={styles.body}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>
              {editingId
                ? t("dataspaces.form.editHeading", { id: editingId })
                : t("dataspaces.form.createHeading")}
            </h2>
            <div className={styles.formGrid}>
              <FormInput
                label={t("dataspaces.form.subject")}
                id="subject"
                name="subject"
                type="text"
                placeholder={t("dataspaces.form.subjectPlaceholder")}
                value={form.subject}
                onChange={(e) => set("subject", e.target.value)}
                required
              />
              <FormInput
                label={t("dataspaces.form.dataspaceId")}
                id="dataspaceID"
                name="dataspaceID"
                type="text"
                placeholder="DS..."
                value={form.dataspaceID}
                onChange={(e) => set("dataspaceID", e.target.value)}
                disabled={!!editingId}
                required
              />
              <FormSelect
                label={t("dataspaces.form.status")}
                options={statusOptions}
                value={form.status}
                onChange={(v) => set("status", v)}
              />
              <FormInput
                label={t("dataspaces.form.country")}
                id="countryOfRegistration"
                name="countryOfRegistration"
                type="text"
                placeholder={t("dataspaces.form.countryPlaceholder")}
                value={form.countryOfRegistration}
                onChange={(e) => set("countryOfRegistration", e.target.value)}
              />
              <FormInput
                label={t("dataspaces.form.definitionUrl")}
                id="dataspaceDefinitionURL"
                name="dataspaceDefinitionURL"
                type="text"
                placeholder="https://..."
                value={form.dataspaceDefinitionURL}
                onChange={(e) => set("dataspaceDefinitionURL", e.target.value)}
              />
              <FormInput
                label={t("dataspaces.form.website")}
                id="dataspaceWebsite"
                name="dataspaceWebsite"
                type="text"
                placeholder="https://..."
                value={form.dataspaceWebsite}
                onChange={(e) => set("dataspaceWebsite", e.target.value)}
              />
              <FormInput
                label={t("dataspaces.form.countriesOfOperation")}
                id="countriesOfOperation"
                name="countriesOfOperation"
                type="text"
                placeholder={t("dataspaces.form.listPlaceholder")}
                value={form.countriesOfOperation}
                onChange={(e) => set("countriesOfOperation", e.target.value)}
              />
              <FormInput
                label={t("dataspaces.form.sectorIndustry")}
                id="sectorIndustry"
                name="sectorIndustry"
                type="text"
                placeholder={t("dataspaces.form.listPlaceholder")}
                value={form.sectorIndustry}
                onChange={(e) => set("sectorIndustry", e.target.value)}
              />
              <FormInput
                label={t("dataspaces.form.tags")}
                id="tags"
                name="tags"
                type="text"
                placeholder={t("dataspaces.form.tagsPlaceholder")}
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
              />
              <FormInput
                label={t("dataspaces.form.specificAgreements")}
                id="specificAgreements"
                name="specificAgreements"
                type="text"
                placeholder={t("dataspaces.form.listPlaceholder")}
                value={form.specificAgreements}
                onChange={(e) => set("specificAgreements", e.target.value)}
              />
            </div>
            <p className={styles.hint}>{t("dataspaces.form.listHint")}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryBtn} onClick={submit} disabled={submitting}>
                {submitting
                  ? t("dataspaces.form.submitting")
                  : editingId
                  ? t("dataspaces.form.update")
                  : t("dataspaces.form.create")}
              </button>
              {editingId && (
                <button type="button" className={styles.refreshBtn} onClick={resetForm} disabled={submitting}>
                  {t("dataspaces.form.cancel")}
                </button>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>{t("dataspaces.list.heading")}</h2>
              <button type="button" className={styles.refreshBtn} onClick={loadList}>
                {t("dataspaces.list.refresh")}
              </button>
            </div>
            {list}
          </section>
        </div>
      </div>
    </AdminRoute>
  );
};

export default Dataspaces;
