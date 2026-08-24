import { useEffect, useState } from "react";
import API from "api/client";
import { useLanguage } from "../../context/LanguageContext";
import { extractCertificateFields } from "util/certificate";
import styles from "styles/ParticipantDetail.module.css";

// Claims are APPEND-ONLY on the registry: this modal only creates a new claim
// (POST /parties/{id}/claims). A new x509Certificate claim registers an
// additional active certificate — the previous certificate claim keeps its own
// status until it expires or an operator revokes it from its claim card.

type Kind = "text" | "select" | "date" | "textarea";

interface FieldSpec {
  key: string;
  kind: Kind;
  required: boolean;
  options?: string[];
}

const STATUS = ["active", "inactive", "revoked", "suspended"];
// x509Certificate claims only know active|revoked (v3X509ClaimStatuses).
const X509_STATUS = ["active", "revoked"];
const LOA = ["low", "substantial", "high", "not-applicable"];
const YESNONA = ["yes", "no", "not-applicable"];
// v3 framework-role vocabulary. NB: the v3 model renamed the registry role to
// ParticipantRegistry — new claims must not be written as iShareSatellite.
const ROLE_IDS = [
  "ServiceConsumer",
  "ServiceProvider",
  "EntitledParty",
  "AuthorisationRegistry",
  "IdentityProvider",
  "IdentityBroker",
  "ParticipantRegistry",
];
const DEFAULT_CERTIFICATE_TYPE = "eSeal";

// Addable claim types and their type-specific fields. Required flags mirror
// the satellite's v3ClaimCreateRequiredPaths; registrarId is prefilled from
// the connection config (the satellite also defaults it to its own party).
const TYPE_FIELDS: Record<string, FieldSpec[]> = {
  frameworkCompliance: [
    { key: "frameworkId", kind: "text", required: true },
    { key: "capabilityUrl", kind: "text", required: false },
  ],
  authRegistry: [
    { key: "name", kind: "text", required: true },
    { key: "authRegistryId", kind: "text", required: true },
    { key: "authUrl", kind: "text", required: true },
    { key: "dataspaceId", kind: "text", required: false },
    { key: "serviceProviderPartyId", kind: "text", required: false },
  ],
  frameworkAgreement: [
    { key: "frameworkId", kind: "text", required: true },
    { key: "agreementType", kind: "text", required: true },
    { key: "agreementId", kind: "text", required: true },
    { key: "title", kind: "text", required: true },
    { key: "verificationHash", kind: "text", required: false },
  ],
  frameworkRole: [
    { key: "frameworkId", kind: "text", required: true },
    { key: "roleId", kind: "select", required: true, options: ROLE_IDS },
    { key: "loa", kind: "select", required: true, options: LOA },
    { key: "compliancyVerified", kind: "select", required: true, options: YESNONA },
    { key: "legalAdherence", kind: "select", required: true, options: YESNONA },
  ],
  x509Certificate: [
    { key: "certificateType", kind: "text", required: true },
  ],
  dataspaceMembership: [
    { key: "dataspaceId", kind: "text", required: true },
    { key: "legalAdherence", kind: "select", required: true, options: YESNONA },
  ],
  idpAssertion: [{ key: "assertion", kind: "textarea", required: true }],
};

// Claim types whose create path requires startDate/endDate.
const DATES_REQUIRED = new Set([
  "frameworkCompliance",
  "frameworkRole",
  "x509Certificate",
  "dataspaceMembership",
]);

const LABEL_OVERRIDES: Record<string, string> = {
  loa: "LoA",
  authUrl: "Authorization URL",
  capabilityUrl: "Capability URL",
  authRegistryId: "Auth Registry ID",
  serviceProviderPartyId: "Service Provider Party ID",
  serviceIdentifier: "Service Identifier",
  dataspaceId: "Dataspace ID",
  frameworkId: "Framework ID",
  roleId: "Role ID",
  agreementId: "Agreement ID",
  registrarId: "Registrar ID",
  certificateType: "Certificate Type",
};

const humanize = (key: string): string =>
  LABEL_OVERRIDES[key] ||
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());

const today = (): string => new Date().toISOString().slice(0, 10);
const inOneYear = (): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
};
const toDateInput = (iso: string): string => (iso ? iso.slice(0, 10) : "");

// The registry validates claim dates with time.Parse(time.RFC3339); a bare
// date-input value (yyyy-mm-dd) is rejected. Expand to a full instant.
const toRfc3339 = (value: string, endOfDay = false): string => {
  const v = value.trim();
  if (!v || v.includes("T")) return v;
  return `${v}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z`;
};

const AddClaimModal = ({
  partyId,
  onSaved,
  onClose,
}: {
  partyId: string;
  onSaved: () => void;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const e = (k: string) => t(`participants.detail.edit.${k}`);
  const claimTypeLabel = (ct: string): string => {
    const key = `submit.claimTypes.${ct}`;
    const label = t(key);
    return label === key ? ct : label;
  };

  const [type, setType] = useState<string>("frameworkRole");
  const [form, setForm] = useState<Record<string, string>>({
    status: "active",
    startDate: today(),
    endDate: inOneYear(),
    certificateType: DEFAULT_CERTIFICATE_TYPE,
  });
  const [registrarId, setRegistrarId] = useState("");
  const [certFile, setCertFile] = useState("");
  const [certError, setCertError] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Prefill registrar + framework defaults from the connection config; purely a
  // convenience — the fields stay editable and the satellite defaults registrarId.
  useEffect(() => {
    let mounted = true;
    new API()
      .fetchConnection()
      .then((res) => {
        if (!mounted) return;
        const conn = (res?.data || {}) as Record<string, any>;
        if (conn.registrarId) setRegistrarId(String(conn.registrarId));
        if (conn.frameworkId)
          setForm((p) => ({ ...p, frameworkId: p.frameworkId || String(conn.frameworkId) }));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleCertFile = async (file: File) => {
    setCertError("");
    if (!/\.(pem|crt|cer|der)$/i.test(file.name)) {
      setCertError(t("submit.upload.certInvalidType"));
      return;
    }
    if (file.size > 1024 * 1024) {
      setCertError(t("submit.upload.certTooLarge"));
      return;
    }
    try {
      const parsed = await extractCertificateFields(file);
      setCertFile(file.name);
      setForm((p) => ({
        ...p,
        x5c: parsed.x5c,
        "x5t#s256": parsed.thumbprint,
        subjectName: parsed.subjectName,
        // Default the claim window to the certificate's own validity.
        startDate: toDateInput(parsed.validFrom || "") || p.startDate,
        endDate: toDateInput(parsed.validTo || "") || p.endDate,
      }));
    } catch (err2: any) {
      setCertFile("");
      setCertError(err2?.message || t("submit.upload.certParseError"));
      setForm((p) => ({ ...p, x5c: "", "x5t#s256": "", subjectName: "" }));
    }
  };

  const fields = TYPE_FIELDS[type] ?? [];
  const datesRequired = DATES_REQUIRED.has(type);

  const missing = (): string[] => {
    const out: string[] = [];
    fields.forEach((f) => {
      if (f.required && !String(form[f.key] ?? "").trim()) out.push(humanize(f.key));
    });
    if (datesRequired) {
      if (!form.startDate) out.push("Start Date");
      if (!form.endDate) out.push("End Date");
    }
    if (type === "x509Certificate" && !form.x5c) out.push(e("addClaimCertRequired"));
    return out;
  };

  const save = async () => {
    const gaps = missing();
    if (gaps.length) {
      setErr(`${e("addClaimMissing")}: ${gaps.join(", ")}`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const claim: Record<string, any> = {
        type,
        status: form.status || "active",
        ...(registrarId ? { registrarId } : {}),
        ...(form.startDate ? { startDate: toRfc3339(form.startDate) } : {}),
        ...(form.endDate ? { endDate: toRfc3339(form.endDate, true) } : {}),
      };
      fields.forEach((f) => {
        const v = String(form[f.key] ?? "").trim();
        if (v) claim[f.key] = v;
      });
      if (type === "x509Certificate") {
        claim.subjectName = form.subjectName;
        claim.x5c = form.x5c;
        claim["x5t#s256"] = form["x5t#s256"];
      }
      if (type === "frameworkRole" && form.roleId && !claim.title) {
        claim.title = form.roleId;
      }
      await new API().createClaim(partyId, claim);
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

  const field = (f: FieldSpec) => (
    <div className={styles.formRow} key={f.key}>
      <label className={styles.formLabel}>
        {humanize(f.key)}
        {f.required ? " *" : ""}
      </label>
      {f.kind === "select" ? (
        <select
          className={styles.formInput}
          value={form[f.key] ?? ""}
          onChange={(ev) => set(f.key, ev.target.value)}
        >
          <option value="">—</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : f.kind === "textarea" ? (
        <textarea
          className={styles.formInput}
          rows={3}
          value={form[f.key] ?? ""}
          onChange={(ev) => set(f.key, ev.target.value)}
        />
      ) : (
        <input
          className={styles.formInput}
          type={f.kind === "date" ? "date" : "text"}
          value={form[f.key] ?? ""}
          onChange={(ev) => set(f.key, ev.target.value)}
        />
      )}
    </div>
  );

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className={styles.modalPanel} onClick={(ev) => ev.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.claimType}>{e("addClaimTitle")}</span>
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
          <div className={styles.grid}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{e("addClaimType")}</label>
              <select
                className={styles.formInput}
                value={type}
                onChange={(ev) => setType(ev.target.value)}
              >
                {Object.keys(TYPE_FIELDS).map((ct) => (
                  <option key={ct} value={ct}>
                    {claimTypeLabel(ct)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>Status</label>
              <select
                className={styles.formInput}
                value={form.status ?? "active"}
                onChange={(ev) => set("status", ev.target.value)}
              >
                {(type === "x509Certificate" ? X509_STATUS : STATUS).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                Start Date{datesRequired ? " *" : ""}
              </label>
              <input
                className={styles.formInput}
                type="date"
                value={form.startDate ?? ""}
                onChange={(ev) => set("startDate", ev.target.value)}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                End Date{datesRequired ? " *" : ""}
              </label>
              <input
                className={styles.formInput}
                type="date"
                value={form.endDate ?? ""}
                onChange={(ev) => set("endDate", ev.target.value)}
              />
            </div>
            {fields.filter((f) => f.kind !== "textarea").map(field)}
          </div>
          {fields.filter((f) => f.kind === "textarea").map(field)}

          {type === "x509Certificate" && (
            <div className={styles.formRow}>
              <label className={styles.formLabel}>
                {e("addClaimCertUpload")} *
              </label>
              <input
                className={styles.formInput}
                type="file"
                accept=".pem,.crt,.cer,.der"
                onChange={(ev) => {
                  const file = ev.target.files?.[0];
                  if (file) void handleCertFile(file);
                }}
              />
              {certFile && (
                <p className={styles.subtitle}>
                  {certFile}
                  {form.subjectName ? ` — ${form.subjectName}` : ""}
                </p>
              )}
              {certError && <div className={styles.error}>{certError}</div>}
              <p className={styles.subtitle}>{e("addClaimCertHint")}</p>
            </div>
          )}

          {err && <div className={styles.error}>{err}</div>}
          <div className={styles.formActions}>
            <button className={styles.saveBtn} onClick={save} disabled={saving}>
              {saving ? e("saving") : e("addClaimSubmit")}
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

export default AddClaimModal;
