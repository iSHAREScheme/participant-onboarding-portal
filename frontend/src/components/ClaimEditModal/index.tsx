import { useState } from "react";
import API from "api/client";
import { useLanguage } from "../../context/LanguageContext";
import styles from "styles/ParticipantDetail.module.css";

const str = (v: any): string => (v === undefined || v === null ? "" : String(v));

type Kind = "text" | "textarea" | "date" | "select" | "bool";
type FieldSpec = { key: string; kind: Kind };

// Editable (mutable) fields per claim type. Mirrors the satellite's whitelist
// (PR-MW v3ClaimSpecificMutablePatchPaths). The common lifecycle fields
// (status / startDate / endDate) are editable on every claim and handled
// separately below. Anything not listed here is IMMUTABLE and shown read-only.
const TYPE_MUTABLE: Record<string, FieldSpec[]> = {
  frameworkCompliance: [
    { key: "capabilityUrl", kind: "text" },
    { key: "additionalInfo.description", kind: "textarea" },
    { key: "additionalInfo.website", kind: "text" },
    { key: "additionalInfo.companyEmail", kind: "text" },
    { key: "additionalInfo.companyPhone", kind: "text" },
    { key: "additionalInfo.tags", kind: "text" },
    { key: "additionalInfo.publiclyPublishable", kind: "bool" },
  ],
  authRegistry: [
    { key: "name", kind: "text" },
    { key: "authUrl", kind: "text" },
    { key: "serviceIdentifier", kind: "text" },
  ],
  frameworkAgreement: [
    { key: "title", kind: "text" },
    { key: "verificationHash", kind: "text" },
  ],
  frameworkRole: [
    { key: "title", kind: "text" },
    { key: "loa", kind: "select" },
    { key: "compliancyVerified", kind: "select" },
    { key: "legalAdherence", kind: "select" },
  ],
  dataspaceMembership: [
    { key: "capabilityUrl", kind: "text" },
    { key: "legalAdherence", kind: "select" },
    { key: "additionalInfo.description", kind: "textarea" },
    { key: "additionalInfo.website", kind: "text" },
    { key: "additionalInfo.companyEmail", kind: "text" },
    { key: "additionalInfo.companyPhone", kind: "text" },
    { key: "additionalInfo.tags", kind: "text" },
    { key: "additionalInfo.publiclyPublishable", kind: "bool" },
  ],
  dataspaceAgreement: [
    { key: "title", kind: "text" },
    { key: "verificationHash", kind: "text" },
  ],
  dataspaceRole: [
    { key: "title", kind: "text" },
    { key: "loa", kind: "select" },
    { key: "compliancyVerified", kind: "select" },
    { key: "legalAdherence", kind: "select" },
  ],
  x509Certificate: [], // certificate fields are re-issued, never patched
  idpAssertion: [
    { key: "assertion", kind: "textarea" },
    { key: "verificationHash", kind: "text" },
  ],
};

// Immutable, identifying fields shown read-only for context (mirrors
// PR-MW v3ClaimSpecificImmutablePatchPaths). Common read-only: type, registrarId.
const TYPE_READONLY: Record<string, string[]> = {
  frameworkCompliance: ["frameworkId"],
  authRegistry: [
    "authRegistryId",
    "frameworkId",
    "dataspaceId",
    "serviceProviderPartyId",
    "dataspaceName",
  ],
  frameworkAgreement: ["frameworkId", "agreementType", "agreementId"],
  frameworkRole: ["frameworkId", "roleId"],
  dataspaceMembership: ["dataspaceId"],
  dataspaceAgreement: ["dataspaceId", "agreementType", "agreementId"],
  dataspaceRole: ["dataspaceId", "roleId"],
  x509Certificate: ["subjectName", "certificateType", "x5c", "x5t#s256"],
  idpAssertion: [],
};

const STATUS = ["active", "inactive", "revoked", "suspended"];
// x509Certificate claims only know active|revoked on the registry
// (v3X509ClaimStatuses) — a cert is never inactive/suspended, it is revoked.
const X509_STATUS = ["active", "revoked"];
const LOA = ["low", "substantial", "high", "not-applicable"];
const YESNONA = ["yes", "no", "not-applicable"];
const BOOL = ["true", "false"];

const LABEL_OVERRIDES: Record<string, string> = {
  loa: "LoA",
  "x5t#s256": "SHA-256 thumbprint",
  x5c: "Certificate (x5c)",
  authUrl: "Authorization URL",
  capabilityUrl: "Capability URL",
  authRegistryId: "Auth Registry ID",
  serviceProviderPartyId: "Service Provider Party ID",
  serviceIdentifier: "Service Identifier",
  dataspaceId: "Dataspace ID",
  dataspaceName: "Dataspace Name",
  frameworkId: "Framework ID",
  roleId: "Role ID",
  agreementId: "Agreement ID",
  registrarId: "Registrar ID",
  publiclyPublishable: "Publicly Publishable",
};

const humanize = (key: string): string => {
  const base = key.startsWith("additionalInfo.") ? key.slice(15) : key;
  return (
    LABEL_OVERRIDES[base] ||
    base
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
};

const getVal = (claim: any, key: string): string => {
  if (key.startsWith("additionalInfo."))
    return str(claim?.additionalInfo?.[key.slice(15)]);
  return str(claim?.[key]);
};

const optionsFor = (key: string, claimType?: string): string[] => {
  if (key === "status")
    return claimType === "x509Certificate" ? X509_STATUS : STATUS;
  if (key === "loa") return LOA;
  if (key === "compliancyVerified" || key === "legalAdherence") return YESNONA;
  if (key.endsWith("publiclyPublishable")) return BOOL;
  return [];
};

// Per-claim editor. Shows the identifying/immutable fields read-only and only the
// fields the satellite actually accepts on a claim PATCH as editable, then sends
// just the changed fields to PATCH /parties/{id}/claims/{claimId}.
const ClaimEditModal = ({
  partyId,
  claim,
  onSaved,
  onClose,
}: {
  partyId: string;
  claim: any;
  onSaved: () => void;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const e = (k: string) => t(`participants.detail.edit.${k}`);
  const claimTypeLabel = (type: string): string => {
    const key = `submit.claimTypes.${type}`;
    const label = t(key);
    return label === key ? type : label;
  };

  const type = str(claim?.type);
  const claimId = str(claim?.id);
  const mutable = TYPE_MUTABLE[type] ?? [];
  const readonly = ["type", "registrarId", ...(TYPE_READONLY[type] ?? [])];

  // Claim dates are stored as RFC3339 instants; a date input needs bare
  // yyyy-mm-dd (an RFC3339 value renders as EMPTY), so trim for display and
  // expand back to an instant on save.
  const DATE_KEYS = ["startDate", "endDate"];
  const toRfc3339 = (value: string, endOfDay = false): string => {
    const v = value.trim();
    if (!v || v.includes("T")) return v;
    return `${v}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z`;
  };

  const editableKeys = ["status", "startDate", "endDate", ...mutable.map((m) => m.key)];
  const initial: Record<string, string> = {};
  editableKeys.forEach((k) => {
    const v = getVal(claim, k);
    initial[k] = DATE_KEYS.includes(k) ? v.slice(0, 10) : v;
  });
  const [form, setForm] = useState<Record<string, string>>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const patch: Record<string, any> = {};
      ["status", "startDate", "endDate"].forEach((k) => {
        if (form[k] === initial[k]) return;
        patch[k] = DATE_KEYS.includes(k)
          ? toRfc3339(form[k], k === "endDate")
          : form[k];
      });
      mutable.forEach((m) => {
        if (form[m.key] === initial[m.key]) return;
        patch[m.key] = m.kind === "bool" ? form[m.key] === "true" : form[m.key];
      });
      if (!Object.keys(patch).length) {
        onClose();
        return;
      }
      await new API().patchClaim(partyId, claimId, patch);
      onSaved();
    } catch (e2: any) {
      setErr(
        e2?.response?.data?.error ||
          e2?.response?.data?.message ||
          e2?.message ||
          e("saveError")
      );
    } finally {
      setSaving(false);
    }
  };

  const editField = (key: string, kind: Kind) => {
    const opts = optionsFor(key, type);
    return (
      <div className={styles.formRow} key={key}>
        <label className={styles.formLabel}>{humanize(key)}</label>
        {kind === "select" || kind === "bool" ? (
          <select
            className={styles.formInput}
            value={form[key] ?? ""}
            onChange={(ev) => set(key, ev.target.value)}
          >
            {form[key] && !opts.includes(form[key]) ? (
              <option value={form[key]}>{form[key]}</option>
            ) : null}
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : kind === "textarea" ? (
          <textarea
            className={styles.formInput}
            rows={3}
            value={form[key] ?? ""}
            onChange={(ev) => set(key, ev.target.value)}
          />
        ) : (
          <input
            className={styles.formInput}
            type={kind === "date" ? "date" : "text"}
            value={form[key] ?? ""}
            onChange={(ev) => set(key, ev.target.value)}
          />
        )}
      </div>
    );
  };

  const roVals = readonly
    .map((k) => ({ k, v: getVal(claim, k) }))
    .filter((r) => r.v);

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className={styles.modalPanel} onClick={(ev) => ev.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.claimType}>
            {e("editClaimTitle")}: {claimTypeLabel(type)}
          </span>
          <button
            type="button"
            className={styles.modalClose}
            onClick={onClose}
            aria-label={e("cancel")}
          >
            &times;
          </button>
        </div>
        <div className={styles.modalBody}>
          {/* Read-only identifying fields (immutable) */}
          <div className={styles.grid}>
            {roVals.map(({ k, v }) => (
              <div className={styles.formRow} key={k}>
                <label className={styles.formLabel}>{humanize(k)}</label>
                <input className={styles.formInput} value={v} disabled readOnly />
              </div>
            ))}
          </div>

          {/* Editable: common lifecycle + type-specific mutable fields */}
          <div className={styles.grid}>
            {editField("status", "select")}
            {editField("startDate", "date")}
            {editField("endDate", "date")}
            {mutable
              .filter((m) => m.kind !== "textarea")
              .map((m) => editField(m.key, m.kind))}
          </div>
          {mutable
            .filter((m) => m.kind === "textarea")
            .map((m) => editField(m.key, m.kind))}

          {mutable.length === 0 && (
            <p className={styles.subtitle}>{e("noEditableClaimFields")}</p>
          )}

          {err && <div className={styles.error}>{err}</div>}

          <div className={styles.formActions}>
            <button className={styles.saveBtn} onClick={save} disabled={saving}>
              {saving ? e("saving") : e("saveClaim")}
            </button>
            <button
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={saving}
            >
              {e("cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClaimEditModal;
