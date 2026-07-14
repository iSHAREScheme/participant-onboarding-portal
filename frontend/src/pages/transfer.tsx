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
import styles from "styles/Transfer.module.css";

// Transfer a party's ownership to another participant registry (satellite). The
// acting-as org is this registry (prefilled, read-only); the operator picks one of
// their own parties and a destination satellite, and the request is POSTed to the
// PR /api/* transfer endpoint. This is a satellite-level function; scheme-owner-only
// features (revoke, dataspaces, trusted list) are intentionally not part of this portal.
type Row = Record<string, any>;
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

  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Acting-as organisation: this satellite's registrar id (prefilled, read-only).
  const [org, setOrg] = useState("");
  const [partyId, setPartyId] = useState("");
  const [transferTo, setTransferTo] = useState("");

  // Own parties (the participant picker) and other network satellites (the
  // transfer target picker, derived client-side from the participants list).
  const [ownParties, setOwnParties] = useState<Row[]>([]);
  const [satellites, setSatellites] = useState<Row[]>([]);
  const [satStatus, setSatStatus] = useState<ListStatus>("loading");
  const satLoadedRef = useRef(false);

  const [transferReqs, setTransferReqs] = useState<Row[]>([]);
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
      /* org prefill is best-effort; the party id alone identifies the transfer */
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
  // with the iShareSatellite role, excluding ourselves.
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

  // Initial load once authorized: org + own parties + the transfer request list.
  // Deferred to a microtask so the loaders' synchronous setState stays out of the
  // effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!ready) return;
    queueMicrotask(() => {
      loadOrg();
      loadOwnParties();
      loadTransferReqs();
    });
  }, [ready, loadOrg, loadOwnParties, loadTransferReqs]);

  // Scan for destination satellites once authorized (the multi-page scan runs once).
  useEffect(() => {
    if (ready && !satLoadedRef.current) {
      satLoadedRef.current = true;
      queueMicrotask(loadSatellites);
    }
  }, [ready, loadSatellites]);

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
    if (!party || !transferTo.trim()) {
      toast.error(t("transfer.form.required"));
      return;
    }

    const ok = await confirm({
      title: t("transfer.confirm.title"),
      message: t("transfer.confirm.message", { party, target: transferTo.trim() }),
      confirmLabel: t("transfer.confirm.button"),
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await new API().createTransfer({ partyId: party, transferTo: transferTo.trim() });
      if (prFailed(res?.data)) {
        toast.error(prMessage(res?.data) || t("transfer.form.error"));
      } else {
        toast.success(prMessage(res?.data) || t("transfer.form.success"));
        setPartyId("");
        setTransferTo("");
        loadTransferReqs();
      }
    } catch (e: any) {
      toast.error(str(e?.response?.data?.message) || str(e?.response?.data) || t("transfer.form.error"));
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

  const submitDisabled =
    submitting || noParties || noSatellites || !partyId.trim() || !transferTo.trim();

  const renderList = (rows: Row[], status: ListStatus): ReactNode => {
    if (status === "loading") return <div className={styles.note}>{t("common.loading")}</div>;
    if (status === "unavailable") return <div className={styles.error}>{t("transfer.list.unavailable")}</div>;
    if (status === "error") return <div className={styles.error}>{t("transfer.list.error")}</div>;
    if (rows.length === 0) return <div className={styles.note}>{t("transfer.list.empty")}</div>;
    return (
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
            {rows.map((r, i) => (
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
  };

  return (
    <AdminRoute fetchData={onReady}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t("transfer.title")}</h1>
        <p className={styles.description}>{t("transfer.description")}</p>

        <div className={styles.body}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("transfer.form.heading")}</h2>

            <div className={styles.formGrid}>
              <FormInput
                disabled
                label={t("transfer.form.fromRegistry")}
                id="org"
                name="org"
                type="text"
                placeholder=""
                value={org}
                onChange={() => {}}
              />
              <div>
                <FormSelect
                  label={t("transfer.form.participant")}
                  options={partyOptions}
                  value={partyId}
                  onChange={setPartyId}
                  required
                  disabled={noParties}
                />
                {noParties && <p className={styles.fieldNote}>{t("transfer.form.noParties")}</p>}
              </div>
              <div>
                <FormSelect
                  label={t("transfer.form.transferTo")}
                  options={satelliteOptions}
                  value={transferTo}
                  onChange={setTransferTo}
                  required
                  disabled={noSatellites || satStatus === "loading"}
                />
                {noSatellites && <p className={styles.fieldNote}>{t("transfer.form.noSatellites")}</p>}
              </div>
            </div>

            <p className={styles.hint}>{t("transfer.form.hint")}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={submit}
                disabled={submitDisabled}
              >
                {submitting ? t("transfer.form.submitting") : t("transfer.form.submit")}
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.listHead}>
              <h2 className={styles.cardTitle}>{t("transfer.list.heading")}</h2>
              <button type="button" className={styles.refreshBtn} onClick={loadTransferReqs}>
                {t("transfer.list.refresh")}
              </button>
            </div>
            {renderList(transferReqs, transferStatus)}
          </section>
        </div>
      </div>
    </AdminRoute>
  );
};

export default Transfer;
