import { useEffect, useState } from "react";
import API from "api/client";
import { useDataspaces, useFrameworks, type CatalogueEntry } from "hooks";
import { useLanguage } from "../../context/LanguageContext";
import { extractCertificateFields } from "util/certificate";
import styles from "styles/ParticipantDetail.module.css";

// Claims are APPEND-ONLY on the registry: this modal only creates a new claim
// (POST /parties/{id}/claims). A new x509Certificate claim registers an
// additional active certificate — the previous certificate claim keeps its own
// status until it expires or an operator revokes it from its claim card.

// "dataspaceAgreement" / "dataspaceRole" pick from the chosen dataspace's own
// catalogue, "frameworkAgreement" from the framework's; each degrades to free
// text when the catalogue is unavailable or defines nothing.
type Kind =
  | "text"
  | "select"
  | "date"
  | "textarea"
  | "dataspace"
  | "dataspaceAgreement"
  | "dataspaceRole"
  | "frameworkAgreement";

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
    { key: "dataspaceId", kind: "dataspace", required: false },
    { key: "serviceProviderPartyId", kind: "text", required: false },
  ],
  // agreementType is one of the framework's published agreements (Terms of
  // Use, Accession Agreement, ...); picking it fills the title. agreementId
  // identifies this party's agreement instance and defaults to a random id.
  frameworkAgreement: [
    { key: "frameworkId", kind: "text", required: true },
    { key: "agreementType", kind: "frameworkAgreement", required: true },
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
    { key: "dataspaceId", kind: "dataspace", required: true },
    { key: "legalAdherence", kind: "select", required: true, options: YESNONA },
  ],
  // Dataspaces define their own agreement and role vocabularies, so
  // agreementType and roleId are chosen from the selected dataspace's record
  // (free text when it defines none).
  dataspaceAgreement: [
    { key: "dataspaceId", kind: "dataspace", required: true },
    { key: "agreementType", kind: "dataspaceAgreement", required: true },
    { key: "agreementId", kind: "text", required: true },
    { key: "title", kind: "text", required: true },
    { key: "verificationHash", kind: "text", required: false },
  ],
  dataspaceRole: [
    { key: "dataspaceId", kind: "dataspace", required: true },
    { key: "roleId", kind: "dataspaceRole", required: true },
    { key: "title", kind: "text", required: false },
    { key: "loa", kind: "select", required: true, options: LOA },
    { key: "compliancyVerified", kind: "select", required: true, options: YESNONA },
    { key: "legalAdherence", kind: "select", required: true, options: YESNONA },
  ],
  // idpAssertion is deliberately absent: the assertion comes from an IdP login
  // flow and cannot be hand-entered in a form.
};

// Claim types whose create path requires startDate/endDate.
const DATES_REQUIRED = new Set([
  "frameworkCompliance",
  "frameworkRole",
  "x509Certificate",
  "dataspaceMembership",
  "dataspaceRole",
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

// Claim types whose agreementId is prefilled with a fresh random identifier:
// the id names this party's agreement instance and nothing else supplies it.
const AGREEMENT_TYPES = new Set(["frameworkAgreement", "dataspaceAgreement"]);
let agreementIdCounter = 0;
const randomAgreementId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `agr-${Date.now().toString(36)}-${(++agreementIdCounter).toString(36)}`;

// The catalogue options for a field plus the current value when the catalogue
// does not list it, so a value entered before the list loaded is never dropped.
const catalogueOptions = (entries: CatalogueEntry[], current: string): CatalogueEntry[] =>
  current && !entries.some((entry) => entry.id === current)
    ? [...entries, { id: current, title: current }]
    : entries;

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

  // Switching type keeps the claim skeleton and drops type-specific values so
  // nothing typed for one type leaks into another (e.g. a dataspaceRole
  // free-text roleId surviving into the frameworkRole select).
  const changeType = (next: string) => {
    setType(next);
    setForm((prev) => ({
      status: prev.status,
      startDate: prev.startDate,
      endDate: prev.endDate,
      certificateType: DEFAULT_CERTIFICATE_TYPE,
      frameworkId: prev.frameworkId,
      ...(AGREEMENT_TYPES.has(next) ? { agreementId: randomAgreementId() } : {}),
    }));
    setCertFile("");
    setCertError("");
  };
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Registered dataspaces, so every dataspaceId is chosen from the registry's
  // own list instead of typed by hand.
  const {
    optionsWith: dataspaceOptions,
    agreementsFor: dataspaceAgreementsFor,
    rolesFor: dataspaceRolesFor,
    loading: dataspacesLoading,
    available: dataspacesAvailable,
  } = useDataspaces();
  // The framework catalogue, for frameworkAgreement's agreementType.
  const { agreementsFor: frameworkAgreementsFor, loading: frameworksLoading } = useFrameworks(
    type === "frameworkAgreement"
  );

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Choosing a dataspace re-scopes the dependent vocabulary: an agreementType or
  // roleId taken from another dataspace's catalogue is cleared together with
  // the title it filled, so a stale value cannot be submitted against the
  // newly chosen dataspace. Free-text values (no catalogue) are kept.
  const setDataspace = (v: string) =>
    setForm((p) => {
      const next: Record<string, string> = { ...p, dataspaceId: v };
      const agreements = dataspaceAgreementsFor(v);
      if (p.agreementType && agreements.length > 0 && !agreements.some((a) => a.id === p.agreementType)) {
        next.agreementType = "";
        next.title = "";
      }
      const roles = dataspaceRolesFor(v);
      if (p.roleId && roles.length > 0 && !roles.some((r) => r.id === p.roleId)) {
        next.roleId = "";
        next.title = "";
      }
      return next;
    });

  // Picking a catalogue entry stores its id and fills the human title.
  const pickCatalogueEntry = (key: string, entries: CatalogueEntry[], id: string) =>
    setForm((p) => ({
      ...p,
      [key]: id,
      title: entries.find((entry) => entry.id === id)?.title ?? p.title ?? "",
    }));

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

  // A dataspace field is a dropdown over the registry's dataspaces, so a claim
  // can only be written against a dataspace that actually exists. The list is a
  // convenience: when it cannot be loaded (registry unreachable, or none
  // registered) the field degrades to free text so claim creation is never
  // blocked by the selector.
  const dataspaceSelect = (f: FieldSpec) => (
    <select
      className={styles.formInput}
      value={form[f.key] ?? ""}
      disabled={dataspacesLoading}
      onChange={(ev) => setDataspace(ev.target.value)}
    >
      <option value="">{dataspacesLoading ? e("dataspacesLoading") : "—"}</option>
      {dataspaceOptions(form[f.key] ?? "").map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  // A select over a catalogue (a dataspace's or framework's agreements or roles).
  const catalogueSelect = (f: FieldSpec, entries: CatalogueEntry[], loading: boolean) => (
    <select
      className={styles.formInput}
      value={form[f.key] ?? ""}
      disabled={loading}
      onChange={(ev) => pickCatalogueEntry(f.key, entries, ev.target.value)}
    >
      <option value="">{loading ? e("catalogueLoading") : "—"}</option>
      {catalogueOptions(entries, form[f.key] ?? "").map((entry) => (
        <option key={entry.id} value={entry.id}>
          {entry.title && entry.title !== entry.id ? `${entry.title} (${entry.id})` : entry.id}
        </option>
      ))}
    </select>
  );

  // A dependent field before its parent is chosen: a disabled select that says so.
  const pickParentFirst = (message: string) => (
    <select className={styles.formInput} value="" disabled>
      <option value="">{message}</option>
    </select>
  );

  // The catalogue control for a dependent field, or null when the field should
  // stay free text (catalogue unavailable, or the parent defines no entries).
  const catalogueControl = (f: FieldSpec) => {
    if (f.kind === "dataspaceAgreement" || f.kind === "dataspaceRole") {
      if (!dataspacesLoading && !dataspacesAvailable) return null;
      const dataspaceId = form.dataspaceId ?? "";
      if (!dataspaceId) return pickParentFirst(e("pickDataspaceFirst"));
      const entries = f.kind === "dataspaceAgreement" ? dataspaceAgreementsFor(dataspaceId) : dataspaceRolesFor(dataspaceId);
      if (!dataspacesLoading && entries.length === 0) return null;
      return catalogueSelect(f, entries, dataspacesLoading);
    }
    if (f.kind === "frameworkAgreement") {
      const frameworkId = form.frameworkId ?? "";
      if (!frameworkId) return pickParentFirst(e("pickFrameworkFirst"));
      const entries = frameworkAgreementsFor(frameworkId);
      if (!frameworksLoading && entries.length === 0) return null;
      return catalogueSelect(f, entries, frameworksLoading);
    }
    return null;
  };

  // The input control for one field. A dataspace field falls through to the text
  // input when the registry's list is unavailable, so it is still fillable.
  const fieldControl = (f: FieldSpec) => {
    if (f.kind === "dataspace" && (dataspacesLoading || dataspacesAvailable)) {
      return dataspaceSelect(f);
    }
    const catalogue = catalogueControl(f);
    if (catalogue) {
      return catalogue;
    }
    if (f.kind === "select") {
      return (
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
      );
    }
    if (f.kind === "textarea") {
      return (
        <textarea
          className={styles.formInput}
          rows={3}
          value={form[f.key] ?? ""}
          onChange={(ev) => set(f.key, ev.target.value)}
        />
      );
    }
    return (
      <input
        className={styles.formInput}
        type={f.kind === "date" ? "date" : "text"}
        value={form[f.key] ?? ""}
        onChange={(ev) => set(f.key, ev.target.value)}
      />
    );
  };

  const field = (f: FieldSpec) => (
    <div className={styles.formRow} key={f.key}>
      <label className={styles.formLabel}>
        {humanize(f.key)}
        {f.required ? " *" : ""}
      </label>
      {fieldControl(f)}
    </div>
  );

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(ev) => {
        if (ev.key === "Escape") onClose();
      }}
    >
      <div
        className={styles.modalPanel}
        onClick={(ev) => ev.stopPropagation()}
        onKeyDown={(ev) => ev.stopPropagation()}
      >
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
                onChange={(ev) => changeType(ev.target.value)}
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
