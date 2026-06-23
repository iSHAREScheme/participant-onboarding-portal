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
import { useConfirm } from "../context/ConfirmContext";
import { useToast } from "../context/ToastContext";
import styles from "styles/Revoke.module.css";

// Revoke a party from the registry (and optionally transfer it). Write/mutation
// template for the PR /api/* admin surface: a confirmed POST + a relayed
// FinalResponse, plus a read-only list of existing requests.
type Row = Record<string, any>;

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
// getRevokeList returns a PagedResult; tolerate a bare array / {content} / {data}.
const asRows = (v: any): Row[] =>
  Array.isArray(v) ? v : Array.isArray(v?.content) ? v.content : Array.isArray(v?.data) ? v.data : [];

type ListStatus = "loading" | "ok" | "unavailable" | "error";

const Revoke: NextPage = () => {
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

  const [requests, setRequests] = useState<Row[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>("loading");
  const [form, setForm] = useState({ revokingOrg: "", partyID: "", type: "Revoke", transferToPartyID: "" });
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setListStatus("loading");
    try {
      const res = await new API().getRevokeRequests();
      if (prFailed(res?.data)) {
        setListStatus("error");
        return;
      }
      setRequests(asRows(res?.data));
      setListStatus("ok");
    } catch (e: any) {
      const code = e?.response?.status;
      setListStatus(code === 502 || code === 503 ? "unavailable" : "error");
    }
  }, []);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const target = form.partyID.trim() || form.revokingOrg.trim();
    if (!target) {
      toast.error(t("revoke.form.required"));
      return;
    }
    const ok = await confirm({
      danger: true,
      title: t("revoke.confirm.title"),
      message: t("revoke.confirm.message", { target }),
      confirmLabel: t("revoke.confirm.button"),
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        revokingOrg: form.revokingOrg.trim(),
        partyID: form.partyID.trim(),
        type: form.type,
      };
      if (form.type === "Transfer") body.transferToPartyID = form.transferToPartyID.trim();
      const res = await new API().initiateRevoke(body);
      if (prFailed(res?.data)) {
        toast.error(prMessage(res?.data) || t("revoke.form.error"));
      } else {
        toast.success(prMessage(res?.data) || t("revoke.form.success"));
        setForm({ revokingOrg: "", partyID: "", type: "Revoke", transferToPartyID: "" });
        loadRequests();
      }
    } catch (e: any) {
      toast.error(
        str(e?.response?.data?.message) || str(e?.response?.data) || t("revoke.form.error")
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

  const typeOptions = [
    { value: "Revoke", label: t("revoke.types.revoke") },
    { value: "Transfer", label: t("revoke.types.transfer") },
  ];

  let list: ReactNode;
  if (listStatus === "loading") list = <div className={styles.note}>{t("common.loading")}</div>;
  else if (listStatus === "unavailable") list = <div className={styles.error}>{t("revoke.list.unavailable")}</div>;
  else if (listStatus === "error") list = <div className={styles.error}>{t("revoke.list.error")}</div>;
  else if (requests.length === 0) list = <div className={styles.note}>{t("revoke.list.empty")}</div>;
  else
    list = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("revoke.list.org")}</th>
              <th>{t("revoke.list.party")}</th>
              <th>{t("revoke.list.type")}</th>
              <th>{t("revoke.list.status")}</th>
              <th>{t("revoke.list.date")}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r, i) => (
              <tr key={str(r.requestID) || i}>
                <td data-label={t("revoke.list.org")}>{str(r.revokingOrg) || str(r.creatorOrg) || "—"}</td>
                <td data-label={t("revoke.list.party")}>{str(r.partyID) || "—"}</td>
                <td data-label={t("revoke.list.type")}>{str(r.type) || "—"}</td>
                <td data-label={t("revoke.list.status")}>{str(r.status) || "—"}</td>
                <td data-label={t("revoke.list.date")}>{str(r.createdDate) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <AdminRoute fetchData={loadRequests}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("revoke.title")}</h1>
        <p className={styles.description}>{t("revoke.description")}</p>

        <div className={styles.body}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("revoke.form.heading")}</h2>
            <div className={styles.formGrid}>
              <FormInput
                label={t("revoke.form.revokingOrg")}
                id="revokingOrg"
                name="revokingOrg"
                type="text"
                placeholder={t("revoke.form.orgPlaceholder")}
                value={form.revokingOrg}
                onChange={(e) => set("revokingOrg", e.target.value)}
              />
              <FormInput
                label={t("revoke.form.partyId")}
                id="partyID"
                name="partyID"
                type="text"
                placeholder="EU.EORI.NL000000000"
                value={form.partyID}
                onChange={(e) => set("partyID", e.target.value)}
              />
              <FormSelect
                label={t("revoke.form.type")}
                options={typeOptions}
                value={form.type}
                onChange={(v) => set("type", v)}
              />
              {form.type === "Transfer" && (
                <FormInput
                  label={t("revoke.form.transferTo")}
                  id="transferToPartyID"
                  name="transferToPartyID"
                  type="text"
                  placeholder="EU.EORI.NL000000000"
                  value={form.transferToPartyID}
                  onChange={(e) => set("transferToPartyID", e.target.value)}
                />
              )}
            </div>
            <p className={styles.hint}>{t("revoke.form.hint")}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.dangerBtn} onClick={submit} disabled={submitting}>
                {submitting ? t("revoke.form.submitting") : t("revoke.form.submit")}
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>{t("revoke.list.heading")}</h2>
              <button type="button" className={styles.refreshBtn} onClick={loadRequests}>
                {t("revoke.list.refresh")}
              </button>
            </div>
            {list}
          </section>
        </div>
      </div>
    </AdminRoute>
  );
};

export default Revoke;
