import { NextPage } from "next";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/router";
import AdminRoute from "components/AdminRoute";
import { FormInput } from "components";
import API from "api/client";
import { prFailed, prMessage } from "util/prResponse";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import { useConfirm } from "../context/ConfirmContext";
import { useToast } from "../context/ToastContext";
import styles from "styles/Revoke.module.css";

// Transfer a party's ownership to another registry. Follows the PR /api/* admin
// write template (a confirmed POST + a relayed FinalResponse) alongside a
// read-only list of existing transfer requests. Shares Revoke's styles.
type Row = Record<string, any>;

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
// transferList returns a PagedResult; tolerate a bare array / {content} / {data}.
const asRows = (v: any): Row[] =>
  Array.isArray(v) ? v : Array.isArray(v?.content) ? v.content : Array.isArray(v?.data) ? v.data : [];

type ListStatus = "loading" | "ok" | "unavailable" | "error";

const Transfer: NextPage = () => {
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
  const [form, setForm] = useState({ partyId: "", transferTo: "" });
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setListStatus("loading");
    try {
      const res = await new API().getTransferRequests();
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
    const partyId = form.partyId.trim();
    const transferTo = form.transferTo.trim();
    if (!partyId || !transferTo) {
      toast.error(t("transfer.form.required"));
      return;
    }
    const ok = await confirm({
      title: t("transfer.confirm.title"),
      message: t("transfer.confirm.message", { party: partyId, target: transferTo }),
      confirmLabel: t("transfer.confirm.button"),
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await new API().createTransfer({ partyId, transferTo });
      if (prFailed(res?.data)) {
        toast.error(prMessage(res?.data) || t("transfer.form.error"));
      } else {
        toast.success(prMessage(res?.data) || t("transfer.form.success"));
        setForm({ partyId: "", transferTo: "" });
        loadRequests();
      }
    } catch (e: any) {
      toast.error(
        str(e?.response?.data?.message) || str(e?.response?.data) || t("transfer.form.error")
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

  let list: ReactNode;
  if (listStatus === "loading") list = <div className={styles.note}>{t("common.loading")}</div>;
  else if (listStatus === "unavailable") list = <div className={styles.error}>{t("transfer.list.unavailable")}</div>;
  else if (listStatus === "error") list = <div className={styles.error}>{t("transfer.list.error")}</div>;
  else if (requests.length === 0) list = <div className={styles.note}>{t("transfer.list.empty")}</div>;
  else
    list = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("transfer.list.party")}</th>
              <th>{t("transfer.list.from")}</th>
              <th>{t("transfer.list.to")}</th>
              <th>{t("transfer.list.status")}</th>
              <th>{t("transfer.list.date")}</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r, i) => (
              <tr key={str(r.requestID) || i}>
                <td data-label={t("transfer.list.party")}>{str(r.partyId) || str(r.partyID) || "—"}</td>
                <td data-label={t("transfer.list.from")}>{str(r.creatorOrg) || "—"}</td>
                <td data-label={t("transfer.list.to")}>{str(r.transferTo) || "—"}</td>
                <td data-label={t("transfer.list.status")}>{str(r.status) || "—"}</td>
                <td data-label={t("transfer.list.date")}>{str(r.requestDate) || str(r.createdDate) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <AdminRoute fetchData={loadRequests}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("transfer.title")}</h1>
        <p className={styles.description}>{t("transfer.description")}</p>

        <div className={styles.body}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("transfer.form.heading")}</h2>
            <div className={styles.formGrid}>
              <FormInput
                label={t("transfer.form.partyId")}
                id="partyId"
                name="partyId"
                type="text"
                placeholder="EU.EORI.NL000000000"
                value={form.partyId}
                onChange={(e) => set("partyId", e.target.value)}
              />
              <FormInput
                label={t("transfer.form.transferTo")}
                id="transferTo"
                name="transferTo"
                type="text"
                placeholder={t("transfer.form.transferToPlaceholder")}
                value={form.transferTo}
                onChange={(e) => set("transferTo", e.target.value)}
              />
            </div>
            <p className={styles.hint}>{t("transfer.form.hint")}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryBtn} onClick={submit} disabled={submitting}>
                {submitting ? t("transfer.form.submitting") : t("transfer.form.submit")}
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>{t("transfer.list.heading")}</h2>
              <button type="button" className={styles.refreshBtn} onClick={loadRequests}>
                {t("transfer.list.refresh")}
              </button>
            </div>
            {list}
          </section>
        </div>
      </div>
    </AdminRoute>
  );
};

export default Transfer;
