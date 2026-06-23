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
import styles from "styles/Subscribers.module.css";

// Issuer-integration webhook management on the PR /api/issuer/* admin surface:
// register/edit/delete the issuer/adapter endpoints that receive party lifecycle
// events, rotate their signing secrets, and inspect/redelivery the outbox. The
// PR is the source of truth; this page is a thin operator surface over it.
type Row = Record<string, any>;

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
const asList = <T,>(v: any, key: string): T[] =>
  Array.isArray(v) ? v : Array.isArray(v?.[key]) ? v[key] : [];

// Distinct load outcomes so the operator sees *why* a list is empty/failing —
// the BFF (relayPRError) maps these faithfully: 501 = PR admin API not
// configured, 401/403 = PR rejected the forwarded token, 502/503/504 (or no
// response at all) = PR unavailable/restarting, anything else = generic error.
type ListStatus = "loading" | "ok" | "notConfigured" | "unauthorized" | "unavailable" | "error";
type Tab = "subscribers" | "deliveries";

const classifyError = (e: any): ListStatus => {
  const code = e?.response?.status;
  if (!code) return "unavailable"; // network / BFF unreachable
  if (code === 501) return "notConfigured";
  if (code === 401 || code === 403) return "unauthorized";
  if (code === 502 || code === 503 || code === 504) return "unavailable";
  return "error";
};

const EMPTY_FORM = {
  name: "",
  url: "",
  eventFilter: "",
  secret: "",
  replayProtection: false,
  enabled: true,
};

const DELIVERY_STATUSES = ["", "pending", "failed", "delivered", "dead"] as const;

const Subscribers: NextPage = () => {
  const { t } = useLanguage();
  const router = useRouter();
  const toast = useToast();
  const { prConfigured, settingsLoaded } = useSettings();

  // Issuer webhooks are a co-deployed PR feature; bounce direct navigation away
  // when the PR is not configured (the nav entry is hidden in that case too).
  useEffect(() => {
    if (settingsLoaded && !prConfigured) router.replace("/");
  }, [settingsLoaded, prConfigured, router]);

  const [tab, setTab] = useState<Tab>("subscribers");

  // Subscribers tab state.
  const [subs, setSubs] = useState<Row[]>([]);
  const [subStatus, setSubStatus] = useState<ListStatus>("loading");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Show-once secret (returned by create / rotate; never retrievable again).
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);

  // Deliveries tab state.
  const [deliveries, setDeliveries] = useState<Row[]>([]);
  const [delStatus, setDelStatus] = useState<ListStatus>("loading");
  const [filters, setFilters] = useState({ status: "", partyId: "", subscriberId: "" });
  const [reemitPartyId, setReemitPartyId] = useState("");
  const [busyId, setBusyId] = useState<string>("");

  const loadSubs = useCallback(async () => {
    setSubStatus("loading");
    try {
      const res = await new API().listIssuerSubscribers();
      if (prFailed(res?.data)) {
        setSubStatus("error");
        return;
      }
      setSubs(asList<Row>(res?.data, "subscribers"));
      setSubStatus("ok");
    } catch (e: any) {
      setSubStatus(classifyError(e));
    }
  }, []);

  const loadDeliveries = useCallback(async () => {
    setDelStatus("loading");
    try {
      const params: Record<string, any> = { limit: 200 };
      if (filters.status) params.status = filters.status;
      if (filters.partyId.trim()) params.partyId = filters.partyId.trim();
      if (filters.subscriberId) params.subscriberId = filters.subscriberId;
      const res = await new API().listIssuerDeliveries(params);
      if (prFailed(res?.data)) {
        setDelStatus("error");
        return;
      }
      setDeliveries(asList<Row>(res?.data, "deliveries"));
      setDelStatus("ok");
    } catch (e: any) {
      setDelStatus(classifyError(e));
    }
  }, [filters]);

  // Switch to the deliveries tab and load it. Loading happens in this event
  // handler (not an effect) to avoid a cascading setState-in-effect.
  const openDeliveries = () => {
    setTab("deliveries");
    loadDeliveries();
  };

  const set = (k: keyof typeof EMPTY_FORM, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
  };

  const startEdit = (row: Row) => {
    setForm({
      name: str(row.name),
      url: str(row.url),
      eventFilter: str(row.eventFilter),
      secret: "", // never populated on edit; the stored secret is not retrievable
      replayProtection: !!row.replayProtection,
      enabled: row.enabled !== false,
    });
    setEditingId(str(row.id));
    setSecret(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async () => {
    const name = form.name.trim();
    const url = form.url.trim();
    if (!editingId && !name) {
      toast.error(t("subscribers.form.nameRequired"));
      return;
    }
    if (!url) {
      toast.error(t("subscribers.form.urlRequired"));
      return;
    }
    if (!/^https:\/\//i.test(url)) {
      toast.error(t("subscribers.form.urlHttps"));
      return;
    }
    setSubmitting(true);
    try {
      const api = new API();
      if (editingId) {
        const res = await api.updateIssuerSubscriber(editingId, {
          url,
          eventFilter: form.eventFilter.trim(),
          replayProtection: form.replayProtection,
          enabled: form.enabled,
        });
        if (prFailed(res?.data)) {
          toast.error(prMessage(res?.data) || t("subscribers.form.error"));
        } else {
          toast.success(t("subscribers.form.updated"));
          resetForm();
          loadSubs();
        }
      } else {
        const body: Record<string, any> = {
          name,
          url,
          eventFilter: form.eventFilter.trim(),
          replayProtection: form.replayProtection,
          enabled: form.enabled,
        };
        // If the operator pasted an existing secret (e.g. an already-deployed
        // issuer's HMAC), register with it; otherwise the PR generates one.
        const supplied = form.secret.trim();
        if (supplied) body.secret = supplied;
        const res = await api.createIssuerSubscriber(body);
        if (prFailed(res?.data)) {
          toast.error(prMessage(res?.data) || t("subscribers.form.error"));
        } else {
          // Only reveal a secret the PR generated; a supplied one is already known.
          if (res?.data?.secretGenerated && str(res?.data?.secret)) {
            setSecret({ name, value: str(res?.data?.secret) });
          }
          toast.success(t("subscribers.form.created"));
          resetForm();
          loadSubs();
        }
      }
    } catch (e: any) {
      toast.error(str(e?.response?.data) || t("subscribers.form.error"));
    } finally {
      setSubmitting(false);
    }
  };

  const rotate = async (row: Row) => {
    const id = str(row.id);
    if (!id) return;
    if (typeof window !== "undefined" && !window.confirm(t("subscribers.list.rotateConfirm"))) return;
    setBusyId(id);
    try {
      const res = await new API().rotateIssuerSubscriberSecret(id);
      const newSecret = str(res?.data?.secret);
      if (newSecret) setSecret({ name: str(row.name), value: newSecret });
      toast.success(t("subscribers.list.rotated"));
      loadSubs();
    } catch (e: any) {
      toast.error(str(e?.response?.data) || t("subscribers.list.rotateError"));
    } finally {
      setBusyId("");
    }
  };

  const remove = async (row: Row) => {
    const id = str(row.id);
    if (!id) return;
    if (typeof window !== "undefined" && !window.confirm(t("subscribers.list.deleteConfirm"))) return;
    setBusyId(id);
    try {
      await new API().deleteIssuerSubscriber(id);
      toast.success(t("subscribers.list.deleted"));
      if (editingId === id) resetForm();
      loadSubs();
    } catch (e: any) {
      toast.error(str(e?.response?.data) || t("subscribers.list.deleteError"));
    } finally {
      setBusyId("");
    }
  };

  const redeliver = async (row: Row) => {
    const id = str(row.id);
    if (!id) return;
    setBusyId(id);
    try {
      await new API().redeliverIssuerDelivery(id);
      toast.success(t("subscribers.deliveries.redelivered"));
      loadDeliveries();
    } catch (e: any) {
      toast.error(str(e?.response?.data) || t("subscribers.deliveries.redeliverError"));
    } finally {
      setBusyId("");
    }
  };

  const reemit = async () => {
    const partyId = reemitPartyId.trim();
    if (!partyId) {
      toast.error(t("subscribers.deliveries.reemitRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await new API().reemitPartyEvents(partyId);
      const n = res?.data?.enqueued ?? 0;
      toast.success(t("subscribers.deliveries.reemitted", { count: n }));
      setReemitPartyId("");
      loadDeliveries();
    } catch (e: any) {
      toast.error(str(e?.response?.data) || t("subscribers.deliveries.reemitError"));
    } finally {
      setSubmitting(false);
    }
  };

  const subName = (id: string): string => {
    const found = subs.find((s) => str(s.id) === id);
    return found ? str(found.name) : id;
  };

  const statusBadge = (status: string): ReactNode => {
    const s = status.toLowerCase();
    let cls = styles.badgeMuted;
    if (s === "delivered") cls = styles.badgeOk;
    else if (s === "failed" || s === "pending") cls = styles.badgeWarn;
    else if (s === "dead") cls = styles.badgeErr;
    return <span className={`${styles.badge} ${cls}`}>{status || "—"}</span>;
  };

  // Renders a non-ok list state with a message specific to *why* it failed, and a
  // retry where retrying can actually help (transient unavailability / generic
  // errors). notConfigured/unauthorized are shown without retry — they need an
  // operator/config change, not a refresh.
  const failureView = (status: ListStatus, retry: () => void): ReactNode => {
    const withRetry = (msgKey: string) => (
      <div className={styles.error}>
        {t(msgKey)}{" "}
        <button type="button" className={styles.refreshBtn} onClick={retry}>
          {t("subscribers.status.retry")}
        </button>
      </div>
    );
    switch (status) {
      case "loading":
        return <div className={styles.note}>{t("common.loading")}</div>;
      case "notConfigured":
        return <div className={styles.note}>{t("subscribers.status.notConfigured")}</div>;
      case "unauthorized":
        return <div className={styles.error}>{t("subscribers.status.unauthorized")}</div>;
      case "unavailable":
        return withRetry("subscribers.status.unavailable");
      default:
        return withRetry("subscribers.status.error");
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

  const secretBox = secret && (
    <div className={styles.secretBox}>
      <p className={styles.secretLabel}>{t("subscribers.secret.heading", { name: secret.name })}</p>
      <div className={styles.secretValue}>{secret.value}</div>
      <div className={styles.actions}>
        <button type="button" className={styles.refreshBtn} onClick={() => setSecret(null)}>
          {t("subscribers.secret.dismiss")}
        </button>
      </div>
    </div>
  );

  // ── Subscribers tab ───────────────────────────────────────────────────────
  let subList: ReactNode;
  if (subStatus !== "ok") subList = failureView(subStatus, loadSubs);
  else if (subs.length === 0) subList = <div className={styles.note}>{t("subscribers.list.empty")}</div>;
  else
    subList = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("subscribers.list.name")}</th>
              <th>{t("subscribers.list.url")}</th>
              <th>{t("subscribers.list.events")}</th>
              <th>{t("subscribers.list.enabled")}</th>
              <th>{t("subscribers.list.lastStatus")}</th>
              <th aria-label={t("subscribers.list.actions")} />
            </tr>
          </thead>
          <tbody>
            {subs.map((r, i) => {
              const id = str(r.id);
              return (
                <tr key={id || i}>
                  <td data-label={t("subscribers.list.name")}>{str(r.name) || "—"}</td>
                  <td data-label={t("subscribers.list.url")} className={styles.mono}>{str(r.url) || "—"}</td>
                  <td data-label={t("subscribers.list.events")}>{str(r.eventFilter) || t("subscribers.list.eventsDefault")}</td>
                  <td data-label={t("subscribers.list.enabled")}>
                    {r.enabled !== false ? t("common.yes") : t("common.no")}
                  </td>
                  <td data-label={t("subscribers.list.lastStatus")}>{statusBadge(str(r.lastDeliveryStatus))}</td>
                  <td>
                    <div className={styles.rowActions}>
                      <button type="button" className={styles.refreshBtn} onClick={() => startEdit(r)} disabled={!id}>
                        {t("subscribers.list.edit")}
                      </button>
                      <button type="button" className={styles.refreshBtn} onClick={() => rotate(r)} disabled={!id || busyId === id}>
                        {t("subscribers.list.rotate")}
                      </button>
                      <button type="button" className={styles.dangerBtn} onClick={() => remove(r)} disabled={!id || busyId === id}>
                        {t("subscribers.list.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  const subscribersTab = (
    <div className={styles.body}>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>
          {editingId ? t("subscribers.form.editHeading", { name: form.name }) : t("subscribers.form.createHeading")}
        </h2>
        <div className={styles.formGrid}>
          <FormInput
            label={t("subscribers.form.name")}
            id="name"
            name="name"
            type="text"
            placeholder={t("subscribers.form.namePlaceholder")}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={!!editingId}
            required
          />
          <FormInput
            label={t("subscribers.form.url")}
            id="url"
            name="url"
            type="text"
            placeholder="https://issuer.example.com/webhook/party"
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
            required
          />
          <FormInput
            label={t("subscribers.form.eventFilter")}
            id="eventFilter"
            name="eventFilter"
            type="text"
            placeholder="claim.revoked, party.revoked"
            value={form.eventFilter}
            onChange={(e) => set("eventFilter", e.target.value)}
          />
          {!editingId && (
            <FormInput
              label={t("subscribers.form.secret")}
              id="secret"
              name="secret"
              type="text"
              placeholder={t("subscribers.form.secretPlaceholder")}
              value={form.secret}
              onChange={(e) => set("secret", e.target.value)}
            />
          )}
        </div>
        <p className={styles.hint}>{t("subscribers.form.eventFilterHint")}</p>
        {!editingId && <p className={styles.hint}>{t("subscribers.form.secretHint")}</p>}
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={form.replayProtection}
            onChange={(e) => set("replayProtection", e.target.checked)}
          />
          {t("subscribers.form.replayProtection")}
        </label>
        <label className={styles.checkboxRow}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />
          {t("subscribers.form.enabled")}
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={submit} disabled={submitting}>
            {submitting
              ? t("subscribers.form.submitting")
              : editingId
              ? t("subscribers.form.update")
              : t("subscribers.form.create")}
          </button>
          {editingId && (
            <button type="button" className={styles.refreshBtn} onClick={resetForm} disabled={submitting}>
              {t("subscribers.form.cancel")}
            </button>
          )}
        </div>
        {secretBox}
      </section>

      <section className={styles.card}>
        <div className={styles.listHead}>
          <h2 className={styles.cardTitle}>{t("subscribers.list.heading")}</h2>
          <button type="button" className={styles.refreshBtn} onClick={loadSubs}>
            {t("subscribers.list.refresh")}
          </button>
        </div>
        {subList}
      </section>
    </div>
  );

  // ── Deliveries tab ────────────────────────────────────────────────────────
  let delList: ReactNode;
  if (delStatus !== "ok") delList = failureView(delStatus, loadDeliveries);
  else if (deliveries.length === 0) delList = <div className={styles.note}>{t("subscribers.deliveries.empty")}</div>;
  else
    delList = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("subscribers.deliveries.created")}</th>
              <th>{t("subscribers.deliveries.event")}</th>
              <th>{t("subscribers.deliveries.party")}</th>
              <th>{t("subscribers.deliveries.subscriber")}</th>
              <th>{t("subscribers.deliveries.status")}</th>
              <th>{t("subscribers.deliveries.attempts")}</th>
              <th aria-label={t("subscribers.deliveries.actions")} />
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d, i) => {
              const id = str(d.id);
              const status = str(d.status);
              const retriable = status === "failed" || status === "dead";
              return (
                <tr key={id || i}>
                  <td data-label={t("subscribers.deliveries.created")} className={styles.mono}>{str(d.createdAt) || "—"}</td>
                  <td data-label={t("subscribers.deliveries.event")}>{str(d.eventType) || "—"}</td>
                  <td data-label={t("subscribers.deliveries.party")} className={styles.mono}>{str(d.partyId) || "—"}</td>
                  <td data-label={t("subscribers.deliveries.subscriber")}>{subName(str(d.subscriberId))}</td>
                  <td data-label={t("subscribers.deliveries.status")} title={str(d.lastError)}>{statusBadge(status)}</td>
                  <td data-label={t("subscribers.deliveries.attempts")}>{str(d.attempts) || "0"}</td>
                  <td>
                    {retriable && (
                      <button type="button" className={styles.refreshBtn} onClick={() => redeliver(d)} disabled={!id || busyId === id}>
                        {t("subscribers.deliveries.redeliver")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  const statusOptions = DELIVERY_STATUSES.map((s) => ({
    value: s,
    label: s ? t(`subscribers.deliveries.statuses.${s}`) : t("subscribers.deliveries.statuses.all"),
  }));
  const subscriberOptions = [
    { value: "", label: t("subscribers.deliveries.allSubscribers") },
    ...subs.map((s) => ({ value: str(s.id), label: str(s.name) })),
  ];

  const deliveriesTab = (
    <div className={styles.body}>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>{t("subscribers.deliveries.reemitHeading")}</h2>
        <p className={styles.hint}>{t("subscribers.deliveries.reemitHint")}</p>
        <div className={styles.filters}>
          <div className={styles.filterField}>
            <FormInput
              label={t("subscribers.deliveries.party")}
              id="reemitPartyId"
              name="reemitPartyId"
              type="text"
              placeholder="EU.NL.NTRNL-12345678"
              value={reemitPartyId}
              onChange={(e) => setReemitPartyId(e.target.value)}
            />
          </div>
          <button type="button" className={styles.primaryBtn} onClick={reemit} disabled={submitting}>
            {t("subscribers.deliveries.reemit")}
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.listHead}>
          <h2 className={styles.cardTitle}>{t("subscribers.deliveries.heading")}</h2>
          <button type="button" className={styles.refreshBtn} onClick={loadDeliveries}>
            {t("subscribers.list.refresh")}
          </button>
        </div>
        <div className={styles.filters}>
          <div className={styles.filterField}>
            <FormSelect
              label={t("subscribers.deliveries.status")}
              options={statusOptions}
              value={filters.status}
              onChange={(v) => setFilters((p) => ({ ...p, status: v }))}
            />
          </div>
          <div className={styles.filterField}>
            <FormSelect
              label={t("subscribers.deliveries.subscriber")}
              options={subscriberOptions}
              value={filters.subscriberId}
              onChange={(v) => setFilters((p) => ({ ...p, subscriberId: v }))}
            />
          </div>
          <div className={styles.filterField}>
            <FormInput
              label={t("subscribers.deliveries.partyFilter")}
              id="partyFilter"
              name="partyFilter"
              type="text"
              placeholder="EU.NL.NTRNL-12345678"
              value={filters.partyId}
              onChange={(e) => setFilters((p) => ({ ...p, partyId: e.target.value }))}
            />
          </div>
          <button type="button" className={styles.refreshBtn} onClick={loadDeliveries}>
            {t("subscribers.deliveries.applyFilters")}
          </button>
        </div>
        {delList}
      </section>
    </div>
  );

  return (
    <AdminRoute fetchData={loadSubs}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("subscribers.title")}</h1>
        <p className={styles.description}>{t("subscribers.description")}</p>

        <div className={styles.tabBar}>
          <button
            type="button"
            className={`${styles.tab} ${tab === "subscribers" ? styles.tabActive : ""}`}
            onClick={() => setTab("subscribers")}
          >
            {t("subscribers.tabs.subscribers")}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === "deliveries" ? styles.tabActive : ""}`}
            onClick={openDeliveries}
          >
            {t("subscribers.tabs.deliveries")}
          </button>
        </div>

        {tab === "subscribers" ? subscribersTab : deliveriesTab}
      </div>
    </AdminRoute>
  );
};

export default Subscribers;
