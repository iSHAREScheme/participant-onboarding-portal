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

// Unified lifecycle page: revoke a party from the registry, OR transfer it to
// another satellite. Both actions share this form (prefilled acting-as org +
// a participant picker) and route to their existing PR /api/* endpoints —
// Revoke → POST /pr/revoke, Transfer → POST /pr/transfer.
type Row = Record<string, any>;
type Action = "Revoke" | "Transfer";
type ListStatus = "loading" | "ok" | "unavailable" | "error";

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
// List endpoints return a PagedResult; tolerate a bare array / {content} / {data}.
const asRows = (v: any): Row[] =>
  Array.isArray(v) ? v : Array.isArray(v?.content) ? v.content : Array.isArray(v?.data) ? v.data : [];

const partyIdOf = (p: Row): string => str(p?.party_id ?? p?.id);
const partyNameOf = (p: Row): string => str(p?.party_name ?? p?.name);
const partyOptionLabel = (p: Row): string => {
  const id = partyIdOf(p);
  const name = partyNameOf(p);
  return name ? `${name} — ${id}` : id;
};

// A party is a satellite when it carries the iShareSatellite role — as a v3
// frameworkRole claim (roleId/title) or a v2 roles[] entry.
const SAT_ROLE = "isharesatellite";
const roleMatches = (s: any): boolean =>
  str(s).toLowerCase().replace(/[\s_-]/g, "") === SAT_ROLE;
const isSatellite = (p: Row): boolean => {
  const claims = Array.isArray(p?.claims) ? p.claims : [];
  if (claims.some((c: any) => c?.type === "frameworkRole" && (roleMatches(c?.roleId) || roleMatches(c?.title))))
    return true;
  const roles = Array.isArray(p?.roles) ? p.roles : [];
  return roles.some((r: any) => roleMatches(typeof r === "string" ? r : r?.role));
};

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

  const [ready, setReady] = useState(false);
  const [action, setAction] = useState<Action>("Revoke");

  // Preselect Transfer when arrived at via the redirect from the old /transfer
  // route (?action=transfer).
  useEffect(() => {
    if (router.isReady && str(router.query.action).toLowerCase() === "transfer") {
      queueMicrotask(() => setAction("Transfer"));
    }
  }, [router.isReady, router.query.action]);
  const [submitting, setSubmitting] = useState(false);

  // Acting-as organisation: this satellite's registrar id (the operator can only
  // act as their own org), prefilled read-only.
  const [org, setOrg] = useState("");
  const [partyId, setPartyId] = useState("");
  const [transferTo, setTransferTo] = useState("");

  // Own parties (the participant picker) and other network satellites (the
  // transfer target picker, derived client-side from the participants list).
  const [ownParties, setOwnParties] = useState<Row[]>([]);
  const [satellites, setSatellites] = useState<Row[]>([]);
  const [satStatus, setSatStatus] = useState<ListStatus>("loading");
  const satLoadedRef = useRef(false);

  // Request lists, one per action.
  const [revokeReqs, setRevokeReqs] = useState<Row[]>([]);
  const [transferReqs, setTransferReqs] = useState<Row[]>([]);
  const [revokeStatus, setRevokeStatus] = useState<ListStatus>("loading");
  const [transferStatus, setTransferStatus] = useState<ListStatus>("loading");

  const listStatusFromError = (e: any): ListStatus => {
    const code = e?.response?.status;
    return code === 502 || code === 503 ? "unavailable" : "error";
  };

  const loadOrg = useCallback(async () => {
    try {
      const res = await new API().fetchConnection();
      const d = res?.data ?? {};
      setOrg(str(d.registrarId) || str(d.iss));
    } catch {
      /* org prefill is best-effort; the party id alone is enough to revoke */
    }
  }, []);

  const loadOwnParties = useCallback(async () => {
    try {
      const res = await new API().fetchParticipants({ mineOnly: true, pageSize: 100 });
      setOwnParties(asRows(res?.data));
    } catch {
      setOwnParties([]);
    }
  }, []);

  const loadRevokeReqs = useCallback(async () => {
    setRevokeStatus("loading");
    try {
      const res = await new API().getRevokeRequests();
      if (prFailed(res?.data)) return setRevokeStatus("error");
      setRevokeReqs(asRows(res?.data));
      setRevokeStatus("ok");
    } catch (e) {
      setRevokeStatus(listStatusFromError(e));
    }
  }, []);

  const loadTransferReqs = useCallback(async () => {
    setTransferStatus("loading");
    try {
      const res = await new API().getTransferRequests();
      if (prFailed(res?.data)) return setTransferStatus("error");
      setTransferReqs(asRows(res?.data));
      setTransferStatus("ok");
    } catch (e) {
      setTransferStatus(listStatusFromError(e));
    }
  }, []);

  // Other satellites in the network: page through participants and keep those
  // with the iShareSatellite role, excluding ourselves. Deferred until Transfer
  // is selected so the (multi-page) scan isn't paid for on every visit.
  const loadSatellites = useCallback(async () => {
    setSatStatus("loading");
    try {
      const self = org.trim();
      const found: Row[] = [];
      const pageSize = 100;
      const maxPages = 10; // safety cap; the scan is bounded by totalPages anyway
      for (let page = 1; page <= maxPages; page++) {
        const res = await new API().fetchParticipants({ page, pageSize });
        const body = res?.data ?? {};
        const arr = asRows(body);
        arr.forEach((p) => {
          if (isSatellite(p) && partyIdOf(p) !== self) found.push(p);
        });
        const totalPages = Number(body?.totalPages) || 1;
        if (page >= totalPages || arr.length < pageSize) break;
      }
      setSatellites(found);
      setSatStatus("ok");
    } catch {
      setSatStatus("error");
    }
  }, [org]);

  const onReady = useCallback(() => setReady(true), []);

  // Initial load once authorized: org + own parties + both request lists (the
  // lists are single cheap calls; the satellite scan stays deferred). Deferred
  // to a microtask so the loaders' synchronous setState stays out of the effect
  // body (react-hooks/set-state-in-effect), matching the participants page.
  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => {
      loadOrg();
      loadOwnParties();
      loadRevokeReqs();
      loadTransferReqs();
    });
  }, [ready, loadOrg, loadOwnParties, loadRevokeReqs, loadTransferReqs]);

  // Lazily scan for satellites the first time Transfer is opened.
  useEffect(() => {
    if (ready && action === "Transfer" && !satLoadedRef.current) {
      satLoadedRef.current = true;
      queueMicrotask(loadSatellites);
    }
  }, [ready, action, loadSatellites]);

  const partyOptions = ownParties
    .map((p) => ({ value: partyIdOf(p), label: partyOptionLabel(p) }))
    .filter((o) => o.value);
  const satelliteOptions = satellites
    .map((p) => ({ value: partyIdOf(p), label: partyOptionLabel(p) }))
    .filter((o) => o.value);

  const noParties = partyOptions.length === 0;
  const noSatellites = satStatus === "ok" && satelliteOptions.length === 0;

  const submit = async () => {
    const party = partyId.trim();
    if (!party) {
      toast.error(action === "Transfer" ? t("transfer.form.required") : t("revoke.form.required"));
      return;
    }
    if (action === "Transfer" && !transferTo.trim()) {
      toast.error(t("transfer.form.required"));
      return;
    }

    const ok = await confirm(
      action === "Transfer"
        ? {
            title: t("transfer.confirm.title"),
            message: t("transfer.confirm.message", { party, target: transferTo.trim() }),
            confirmLabel: t("transfer.confirm.button"),
          }
        : {
            danger: true,
            title: t("revoke.confirm.title"),
            message: t("revoke.confirm.message", { target: party }),
            confirmLabel: t("revoke.confirm.button"),
          }
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      if (action === "Transfer") {
        const res = await new API().createTransfer({ partyId: party, transferTo: transferTo.trim() });
        if (prFailed(res?.data)) {
          toast.error(prMessage(res?.data) || t("transfer.form.error"));
        } else {
          toast.success(prMessage(res?.data) || t("transfer.form.success"));
          setPartyId("");
          setTransferTo("");
          loadTransferReqs();
        }
      } else {
        const res = await new API().initiateRevoke({ revokingOrg: org.trim(), partyID: party, type: "Revoke" });
        if (prFailed(res?.data)) {
          toast.error(prMessage(res?.data) || t("revoke.form.error"));
        } else {
          toast.success(prMessage(res?.data) || t("revoke.form.success"));
          setPartyId("");
          loadRevokeReqs();
        }
      }
    } catch (e: any) {
      const fallback = action === "Transfer" ? t("transfer.form.error") : t("revoke.form.error");
      toast.error(str(e?.response?.data?.message) || str(e?.response?.data) || fallback);
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

  const isTransfer = action === "Transfer";
  const submitDisabled =
    submitting || noParties || !partyId.trim() || (isTransfer && (noSatellites || !transferTo.trim()));

  const renderList = (rows: Row[], status: ListStatus, kind: Action): ReactNode => {
    const ns = kind === "Transfer" ? "transfer" : "revoke";
    if (status === "loading") return <div className={styles.note}>{t("common.loading")}</div>;
    if (status === "unavailable") return <div className={styles.error}>{t(`${ns}.list.unavailable`)}</div>;
    if (status === "error") return <div className={styles.error}>{t(`${ns}.list.error`)}</div>;
    if (rows.length === 0) return <div className={styles.note}>{t(`${ns}.list.empty`)}</div>;
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            {kind === "Transfer" ? (
              <tr>
                <th>{t("transfer.list.party")}</th>
                <th>{t("transfer.list.from")}</th>
                <th>{t("transfer.list.to")}</th>
                <th>{t("transfer.list.status")}</th>
                <th>{t("transfer.list.date")}</th>
              </tr>
            ) : (
              <tr>
                <th>{t("revoke.list.org")}</th>
                <th>{t("revoke.list.party")}</th>
                <th>{t("revoke.list.type")}</th>
                <th>{t("revoke.list.status")}</th>
                <th>{t("revoke.list.date")}</th>
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map((r, i) =>
              kind === "Transfer" ? (
                <tr key={str(r.requestID) || i}>
                  <td data-label={t("transfer.list.party")}>{str(r.partyId) || str(r.partyID) || "—"}</td>
                  <td data-label={t("transfer.list.from")}>{str(r.creatorOrg) || "—"}</td>
                  <td data-label={t("transfer.list.to")}>{str(r.transferTo) || "—"}</td>
                  <td data-label={t("transfer.list.status")}>{str(r.status) || "—"}</td>
                  <td data-label={t("transfer.list.date")}>{str(r.requestDate) || str(r.createdDate) || "—"}</td>
                </tr>
              ) : (
                <tr key={str(r.requestID) || i}>
                  <td data-label={t("revoke.list.org")}>{str(r.revokingOrg) || str(r.creatorOrg) || "—"}</td>
                  <td data-label={t("revoke.list.party")}>{str(r.partyID) || "—"}</td>
                  <td data-label={t("revoke.list.type")}>{str(r.type) || "—"}</td>
                  <td data-label={t("revoke.list.status")}>{str(r.status) || "—"}</td>
                  <td data-label={t("revoke.list.date")}>{str(r.createdDate) || "—"}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <AdminRoute fetchData={onReady}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("revoke.titleCombined")}</h1>
        <p className={styles.description}>{t("revoke.description")}</p>

        <div className={styles.body}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("revoke.form.heading")}</h2>

            <div className={styles.segment} role="tablist" aria-label={t("revoke.form.type")}>
              {(["Revoke", "Transfer"] as Action[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  role="tab"
                  aria-selected={action === a}
                  className={`${styles.segmentBtn} ${action === a ? styles.segmentBtnActive : ""}`}
                  onClick={() => setAction(a)}
                >
                  {a === "Transfer" ? t("revoke.types.transfer") : t("revoke.types.revoke")}
                </button>
              ))}
            </div>

            <div className={styles.formGrid}>
              <FormInput
                disabled
                label={isTransfer ? t("revoke.form.fromRegistry") : t("revoke.form.revokingOrg")}
                id="org"
                name="org"
                type="text"
                placeholder=""
                value={org}
                onChange={() => {}}
              />
              <div>
                <FormSelect
                  label={t("revoke.form.participant")}
                  options={partyOptions}
                  value={partyId}
                  onChange={setPartyId}
                  required
                  disabled={noParties}
                />
                {noParties && <p className={styles.fieldNote}>{t("revoke.form.noParties")}</p>}
              </div>
              {isTransfer && (
                <div>
                  <FormSelect
                    label={t("transfer.form.transferTo")}
                    options={satelliteOptions}
                    value={transferTo}
                    onChange={setTransferTo}
                    required
                    disabled={noSatellites || satStatus === "loading"}
                  />
                  {noSatellites && <p className={styles.fieldNote}>{t("revoke.form.noSatellites")}</p>}
                </div>
              )}
            </div>

            <p className={styles.hint}>{isTransfer ? t("transfer.form.hint") : t("revoke.form.hint")}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={isTransfer ? styles.primaryBtn : styles.dangerBtn}
                onClick={submit}
                disabled={submitDisabled}
              >
                {submitting
                  ? t("revoke.form.submitting")
                  : isTransfer
                  ? t("transfer.form.submit")
                  : t("revoke.form.submit")}
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>
                {isTransfer ? t("transfer.list.heading") : t("revoke.list.heading")}
              </h2>
              <button
                type="button"
                className={styles.refreshBtn}
                onClick={isTransfer ? loadTransferReqs : loadRevokeReqs}
              >
                {t("revoke.list.refresh")}
              </button>
            </div>
            {isTransfer
              ? renderList(transferReqs, transferStatus, "Transfer")
              : renderList(revokeReqs, revokeStatus, "Revoke")}
          </section>
        </div>
      </div>
    </AdminRoute>
  );
};

export default Revoke;
