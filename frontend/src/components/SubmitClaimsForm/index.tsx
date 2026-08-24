import React, { useEffect, useState } from "react";
import { FormInput, FormSelect, Button } from "components";
import { useSubmitParty } from "hooks";
import { useLanguage } from "context/LanguageContext";
import { API } from "api/client";
import { extractCertificateFields } from "util/certificate";
import { md5HexOfFile } from "util/md5";
import styles from "styles/Submit.module.css";
import type {
  AdditionalInfo,
  Claim,
  ClaimType,
  Loa,
  Party,
  YesNoNa,
} from "api/client";

// A loosely-typed working copy of a claim. We keep every field flat (including
// the additionalInfo.* fields under `ai_*` keys) so the edit handlers stay
// uniform; `toClaim` assembles a strict `Claim` on submit.
type ClaimDraft = {
  type: EditableClaimType;
  registrarId: string;
  status: string;
  startDate: string;
  endDate: string;
  [key: string]: string;
};

type EditableClaimType = Exclude<ClaimType, "dataspaceAgreement">;

type ClaimDefaults = {
  registrarId: string;
  frameworkId: string;
  frameworkAgreementType: string;
  frameworkAgreementId: string;
  frameworkAgreementTitle: string;
  frameworkRoleId: string;
  frameworkRoleLoa: Loa;
  frameworkRoleLegalAdherence: YesNoNa;
  frameworkRoleCompliancyVerified: YesNoNa;
  startDate: string;
  endDate: string;
};

const DEFAULT_FRAMEWORK_ID = "iSHARE";
const MINIMUM_CLAIM_TYPES: EditableClaimType[] = [
  "frameworkCompliance",
  "frameworkAgreement",
  "frameworkRole",
  "x509Certificate",
];

// Default certificateType for x509 claims.
const DEFAULT_CERTIFICATE_TYPE = "eSeal";

// iSHARE framework roles. The dropdown shows the human-readable title (label);
// the roleId (value) is what gets stored in the claim / sent to the backend.
const FRAMEWORK_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "ServiceConsumer", label: "Service Consumer" },
  { value: "ServiceProvider", label: "Service Provider" },
  { value: "EntitledParty", label: "Entitled Party" },
  { value: "AuthorisationRegistry", label: "Authorisation Registry" },
  { value: "IdentityProvider", label: "Identity Provider" },
  { value: "IdentityBroker", label: "Identity Broker" },
  { value: "iShareSatellite", label: "iSHARE Satellite" },
];

const roleTitle = (roleId: string): string =>
  FRAMEWORK_ROLE_OPTIONS.find((o) => o.value === roleId)?.label || roleId;

const toDateInputValue = (date: Date) => date.toISOString().slice(0, 10);

// The registry validates claim dates with time.Parse(time.RFC3339), so a bare
// date-input value (yyyy-mm-dd) is rejected with "must be an RFC3339 timestamp".
// Expand it to a full instant (start of day / end of day); values that already
// carry a time component pass through untouched.
const toRfc3339 = (value: string, endOfDay = false): string => {
  const v = value.trim();
  if (!v || v.includes("T")) return v;
  return `${v}T${endOfDay ? "23:59:59" : "00:00:00"}.000Z`;
};

const buildInitialDefaults = (): ClaimDefaults => {
  const start = new Date();
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  return {
    registrarId: "",
    frameworkId: DEFAULT_FRAMEWORK_ID,
    frameworkAgreementType: "TermsOfUse",
    frameworkAgreementId: `${DEFAULT_FRAMEWORK_ID}-tou`,
    frameworkAgreementTitle: "iSHARE Terms of Use",
    frameworkRoleId: "EntitledParty",
    frameworkRoleLoa: "substantial",
    frameworkRoleLegalAdherence: "yes",
    frameworkRoleCompliancyVerified: "no",
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
};

const emptyToDefault = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() !== "" ? value : fallback;

const toLoa = (value: unknown, fallback: Loa): Loa => {
  if (value === "low" || value === "substantial" || value === "high" || value === "not-applicable") {
    return value;
  }
  return fallback;
};

const toYesNoNa = (value: unknown, fallback: YesNoNa): YesNoNa => {
  if (value === "yes" || value === "no" || value === "not-applicable") {
    return value;
  }
  return fallback;
};

const defaultsFromConnection = (
  current: ClaimDefaults,
  connection: Record<string, unknown>
): ClaimDefaults => ({
  ...current,
  registrarId: emptyToDefault(connection.registrarId, current.registrarId),
  frameworkId: emptyToDefault(connection.frameworkId, current.frameworkId),
  frameworkAgreementType: emptyToDefault(
    connection.frameworkAgreementType,
    current.frameworkAgreementType
  ),
  frameworkAgreementId: emptyToDefault(
    connection.frameworkAgreementId,
    current.frameworkAgreementId
  ),
  frameworkAgreementTitle: emptyToDefault(
    connection.frameworkAgreementTitle,
    current.frameworkAgreementTitle
  ),
  frameworkRoleId: emptyToDefault(connection.frameworkRoleId, current.frameworkRoleId),
  frameworkRoleLoa: toLoa(connection.frameworkRoleLoa, current.frameworkRoleLoa),
  frameworkRoleLegalAdherence: toYesNoNa(
    connection.frameworkRoleLegalAdherence,
    current.frameworkRoleLegalAdherence
  ),
  frameworkRoleCompliancyVerified: toYesNoNa(
    connection.frameworkRoleCompliancyVerified,
    current.frameworkRoleCompliancyVerified
  ),
});

const applyClaimDefaults = (claim: ClaimDraft, defaults: ClaimDefaults): ClaimDraft => {
  const next: ClaimDraft = {
    ...claim,
    registrarId: claim.registrarId || defaults.registrarId,
    startDate: claim.startDate || defaults.startDate,
    endDate: claim.endDate || defaults.endDate,
  };

  switch (claim.type) {
    case "frameworkCompliance":
      next.frameworkId = next.frameworkId || defaults.frameworkId;
      next.ai_publiclyPublishable = next.ai_publiclyPublishable || "false";
      break;
    case "frameworkAgreement":
      next.frameworkId = next.frameworkId || defaults.frameworkId;
      next.agreementType = next.agreementType || defaults.frameworkAgreementType;
      next.agreementId = next.agreementId || defaults.frameworkAgreementId;
      next.title = next.title || defaults.frameworkAgreementTitle;
      break;
    case "frameworkRole":
      next.frameworkId = next.frameworkId || defaults.frameworkId;
      next.roleId = next.roleId || defaults.frameworkRoleId;
      next.title = next.title || roleTitle(next.roleId);
      next.loa = next.loa || defaults.frameworkRoleLoa;
      next.legalAdherence = next.legalAdherence || defaults.frameworkRoleLegalAdherence;
      next.compliancyVerified =
        next.compliancyVerified || defaults.frameworkRoleCompliancyVerified;
      break;
    case "x509Certificate":
      next.certificateType = next.certificateType || DEFAULT_CERTIFICATE_TYPE;
      break;
    case "dataspaceMembership":
      next.legalAdherence = next.legalAdherence || "not-applicable";
      next.ai_publiclyPublishable = next.ai_publiclyPublishable || "false";
      break;
    default:
      break;
  }

  return next;
};

const newClaimDraft = (type: EditableClaimType, defaults: ClaimDefaults): ClaimDraft =>
  applyClaimDefaults(
    {
      type,
      registrarId: "",
      status: "active",
      startDate: "",
      endDate: "",
    },
    defaults
  );

const buildAdditionalInfo = (d: ClaimDraft): AdditionalInfo => ({
  description: d.ai_description || undefined,
  website: d.ai_website || undefined,
  companyEmail: d.ai_companyEmail || undefined,
  publiclyPublishable: d.ai_publiclyPublishable === "true",
});

// Map a draft to the strict, discriminated Claim shape from the spec.
const toClaim = (d: ClaimDraft): Claim => {
  const base = {
    registrarId: d.registrarId,
    status: d.status as Claim["status"],
    ...(d.startDate ? { startDate: toRfc3339(d.startDate) } : {}),
    ...(d.endDate ? { endDate: toRfc3339(d.endDate, true) } : {}),
  };

  switch (d.type) {
    case "frameworkCompliance":
      return {
        ...base,
        type: "frameworkCompliance",
        frameworkId: d.frameworkId || "",
        capabilityUrl: d.capabilityUrl || undefined,
        additionalInfo: buildAdditionalInfo(d),
      };
    case "authRegistry":
      return {
        ...base,
        type: "authRegistry",
        name: d.name || "",
        authRegistryId: d.authRegistryId || "",
        authUrl: d.authUrl || "",
        dataspaceId: d.dataspaceId || undefined,
        serviceProviderPartyId: d.serviceProviderPartyId || undefined,
      };
    case "frameworkAgreement":
      return {
        ...base,
        type: "frameworkAgreement",
        frameworkId: d.frameworkId || "",
        agreementType: d.agreementType || "",
        agreementId: d.agreementId || "",
        title: d.title || "",
        verificationHash: d.verificationHash || undefined,
      };
    case "frameworkRole":
      return {
        ...base,
        type: "frameworkRole",
        frameworkId: d.frameworkId || "",
        roleId: d.roleId || "",
        title: d.title || undefined,
        loa: (d.loa || "not-applicable") as Loa,
        compliancyVerified: (d.compliancyVerified || "not-applicable") as YesNoNa,
        legalAdherence: (d.legalAdherence || "not-applicable") as YesNoNa,
      };
    case "x509Certificate":
      return {
        ...base,
        type: "x509Certificate",
        subjectName: d.subjectName || "",
        certificateType: d.certificateType || "",
        x5c: d.x5c || "",
        "x5t#s256": d["x5t#s256"] || "",
      };
    case "dataspaceMembership":
      return {
        ...base,
        type: "dataspaceMembership",
        dataspaceId: d.dataspaceId || "",
        capabilityUrl: d.capabilityUrl || undefined,
        legalAdherence: (d.legalAdherence || "not-applicable") as YesNoNa,
        additionalInfo: buildAdditionalInfo(d),
      };
    case "idpAssertion":
      return {
        ...base,
        type: "idpAssertion",
        assertion: d.assertion || "",
      };
  }
};

const SubmitClaimsForm: React.FC = () => {
  const { t } = useLanguage();
  const { submitParty, loading, error, response } = useSubmitParty();
  const [claimDefaults, setClaimDefaults] =
    useState<ClaimDefaults>(buildInitialDefaults);

  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [alsoKnownAs, setAlsoKnownAs] = useState<string[]>([]);
  const [claims, setClaims] = useState<ClaimDraft[]>(() =>
    MINIMUM_CLAIM_TYPES.map((type) => newClaimDraft(type, buildInitialDefaults()))
  );
  // Tracks which upload zone is currently being dragged over (by zone id).
  const [dragZone, setDragZone] = useState<string | null>(null);

  // --- Creation wizard --------------------------------------------------------
  // The single-page form is split into steps, starting from the certificate:
  // most of the party's identity (party id, name, subject, validity) derives
  // from the uploaded cert. Claim drafts keep their fixed MINIMUM_CLAIM_TYPES
  // positions — each step just renders a subset of them:
  //   0 certificate (claim 3) → 1 party identity → 2 framework claims (0-2)
  //   → 3 additional claims (4+) → 4 review & create.
  const WIZARD_STEPS = ["certificate", "party", "framework", "extras", "review"];
  const [step, setStep] = useState(0);
  const [wizardError, setWizardError] = useState<string | null>(null);
  // Creating a party is permanent (no delete, only edit/revoke), so the review
  // step requires an explicit confirmation before the Create button arms.
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const claimStepOf = (index: number) => (index === 3 ? 0 : index <= 2 ? 2 : 3);

  const stepError = (): string | null => {
    if (step === 1) {
      if (!partyId.trim()) return "submit.wizard.needPartyId";
      if (!partyName.trim()) return "submit.wizard.needPartyName";
    }
    if (step === 2) {
      const [compliance, agreement, role] = claims;
      if (!compliance?.frameworkId?.trim()) return "submit.wizard.needFramework";
      if (
        !agreement?.agreementType?.trim() ||
        !agreement?.agreementId?.trim() ||
        !agreement?.title?.trim()
      )
        return "submit.wizard.needAgreement";
      if (!role?.roleId?.trim()) return "submit.wizard.needRole";
    }
    return null;
  };

  const goNext = () => {
    const err = stepError();
    setWizardError(err);
    if (!err) setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };
  const goBack = () => {
    setWizardError(null);
    setReviewConfirmed(false);
    setStep((s) => Math.max(s - 1, 0));
  };

  // The registry requires an x509 certificate unless the party's framework role
  // is ServiceConsumer or EntitledParty (mirrors ValidateV3PartyOnboardingClaims).
  const certMissing = !claims[3]?.x5c;
  const certRequired = !["ServiceConsumer", "EntitledParty"].includes(
    claims[2]?.roleId || ""
  );

  useEffect(() => {
    let mounted = true;
    new API()
      .fetchConnection()
      .then((res) => {
        if (!mounted) return;
        const connection = (res?.data || {}) as Record<string, unknown>;
        const nextDefaults = defaultsFromConnection(buildInitialDefaults(), connection);
        setClaimDefaults(nextDefaults);
        setClaims((prev) =>
          prev.map((claim) => applyClaimDefaults(claim, nextDefaults))
        );
      })
      .catch(() => {
        // Prefill is a convenience. The required fields remain editable if the
        // connection endpoint cannot be reached.
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Option lists are rebuilt per render so their labels follow the active
  // language. Values stay stable (they map onto the API enums).
  const claimTypeOptions = [
    { value: "frameworkCompliance", label: t("submit.claimTypes.frameworkCompliance") },
    { value: "authRegistry", label: t("submit.claimTypes.authRegistry") },
    { value: "frameworkAgreement", label: t("submit.claimTypes.frameworkAgreement") },
    { value: "frameworkRole", label: t("submit.claimTypes.frameworkRole") },
    { value: "x509Certificate", label: t("submit.claimTypes.x509Certificate") },
    { value: "dataspaceMembership", label: t("submit.claimTypes.dataspaceMembership") },
    { value: "idpAssertion", label: t("submit.claimTypes.idpAssertion") },
  ];

  const statusOptions = [
    { value: "active", label: t("submit.status.active") },
    { value: "inactive", label: t("submit.status.inactive") },
    { value: "revoked", label: t("submit.status.revoked") },
    { value: "suspended", label: t("submit.status.suspended") },
  ];

  const loaOptions = [
    { value: "low", label: t("submit.loa.low") },
    { value: "substantial", label: t("submit.loa.substantial") },
    { value: "high", label: t("submit.loa.high") },
    { value: "not-applicable", label: t("submit.loa.notApplicable") },
  ];

  const yesNoNaOptions = [
    { value: "yes", label: t("submit.yesNoNa.yes") },
    { value: "no", label: t("submit.yesNoNa.no") },
    { value: "not-applicable", label: t("submit.yesNoNa.notApplicable") },
  ];

  const booleanOptions = [
    { value: "true", label: t("submit.booleanOptions.yes") },
    { value: "false", label: t("submit.booleanOptions.no") },
  ];

  const isMinimumClaim = (index: number) => index < MINIMUM_CLAIM_TYPES.length;

  const addClaim = () =>
    setClaims((prev) => [...prev, newClaimDraft("frameworkCompliance", claimDefaults)]);

  const removeClaim = (index: number) =>
    setClaims((prev) =>
      isMinimumClaim(index) ? prev : prev.filter((_, i) => i !== index)
    );

  const updateClaim = (index: number, key: string, value: string) =>
    setClaims((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [key]: value } : c))
    );

  // Merge several fields into one claim in a single update (used by uploads).
  const updateClaimFields = (index: number, fields: Record<string, string>) =>
    setClaims((prev) =>
      prev.map((c, i) => {
        if (i !== index) return c;
        const next = { ...c };
        for (const [k, v] of Object.entries(fields)) next[k] = v;
        return next;
      })
    );

  // Switching type keeps the shared skeleton fields and drops type-specific ones.
  const changeClaimType = (index: number, type: EditableClaimType) =>
    setClaims((prev) =>
      prev.map((c, i) =>
        i === index && !isMinimumClaim(index)
          ? applyClaimDefaults(
              {
                type,
                registrarId: c.registrarId,
                status: c.status,
                startDate: c.startDate,
                endDate: c.endDate,
              },
              claimDefaults
            )
          : c
      )
    );

  const addAlsoKnownAs = () => setAlsoKnownAs((prev) => [...prev, ""]);

  const updateAlsoKnownAs = (index: number, value: string) =>
    setAlsoKnownAs((prev) => prev.map((v, i) => (i === index ? value : v)));

  const removeAlsoKnownAs = (index: number) =>
    setAlsoKnownAs((prev) => prev.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Only the review step submits — Enter on an earlier step advances instead
    // (the form fires submit on Enter in any input).
    if (step !== WIZARD_STEPS.length - 1) {
      goNext();
      return;
    }
    // Never submit without the explicit review confirmation (creation is
    // permanent — a party can only be edited or revoked afterwards).
    if (!reviewConfirmed) return;
    const aka = alsoKnownAs.map((s) => s.trim()).filter(Boolean);
    const party: Party = {
      id: partyId,
      name: partyName,
      schemaVersion: "v3.0",
      ...(aka.length ? { alsoKnownAs: aka } : {}),
      claims: claims.map(toClaim),
    };
    // submitParty posts this v3 payload to /parties, which the backend forwards
    // to the satellite's `register-new-party` endpoint.
    submitParty(party);
  };

  // Reusable text input bound to a claim field.
  const claimInput = (
    index: number,
    key: string,
    label: string,
    placeholder = "",
    required = false
  ) => (
    <FormInput
      label={label}
      id={`claim-${index}-${key}`}
      name={`claim-${index}-${key}`}
      type="text"
      placeholder={placeholder}
      required={required}
      value={claims[index][key] || ""}
      onChange={(e) => updateClaim(index, key, e.target.value)}
    />
  );

  // Read-only static field: still bound (so it is submitted) but not editable —
  // used for defaults that must not be changed on this screen (registrarId,
  // start/end dates, frameworkId).
  const claimStatic = (index: number, key: string, label: string) => (
    <FormInput
      label={label}
      id={`claim-${index}-${key}`}
      name={`claim-${index}-${key}`}
      type="text"
      placeholder=""
      disabled
      value={claims[index][key] || ""}
      onChange={() => {}}
    />
  );

  // --- File uploads: certificate → x5c/x5t#s256/subjectName; agreement PDF → md5 hash ---

  const handleCertFile = async (index: number, file: File) => {
    if (!/\.(pem|crt|cer|der)$/i.test(file.name)) {
      updateClaimFields(index, {
        _certError: t("submit.upload.certInvalidType"),
        _certFile: "",
      });
      return;
    }
    if (file.size > 1024 * 1024) {
      updateClaimFields(index, {
        _certError: t("submit.upload.certTooLarge"),
        _certFile: "",
      });
      return;
    }
    try {
      const parsed = await extractCertificateFields(file);
      updateClaimFields(index, {
        x5c: parsed.x5c,
        "x5t#s256": parsed.thumbprint,
        subjectName: parsed.subjectName,
        // Default the claim window to the certificate's own validity.
        ...(parsed.validFrom
          ? { startDate: toDateInputValue(new Date(parsed.validFrom)) }
          : {}),
        ...(parsed.validTo
          ? { endDate: toDateInputValue(new Date(parsed.validTo)) }
          : {}),
        _certFile: file.name,
        _certError: "",
      });
      // Derive the party identity from the certificate — prefill only, never
      // overwrite something the operator already typed.
      if (parsed.partyId) {
        setPartyId((prev) => prev || parsed.partyId!.replace(/^did:ishare:/i, ""));
      }
      if (parsed.organizationName) {
        setPartyName((prev) => prev || parsed.organizationName!);
      }
    } catch (err: any) {
      updateClaimFields(index, {
        _certError: err?.message || t("submit.upload.certParseError"),
        _certFile: "",
        x5c: "",
        "x5t#s256": "",
        subjectName: "",
      });
    }
  };

  const clearCert = (index: number) =>
    updateClaimFields(index, {
      x5c: "",
      "x5t#s256": "",
      subjectName: "",
      _certFile: "",
      _certError: "",
    });

  const handleAgreementFile = async (index: number, file: File) => {
    const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
    if (!isPdf) {
      updateClaimFields(index, {
        _agreementError: t("submit.upload.agreementInvalidType"),
        _agreementFile: "",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      updateClaimFields(index, {
        _agreementError: t("submit.upload.agreementTooLarge"),
        _agreementFile: "",
      });
      return;
    }
    try {
      const hash = await md5HexOfFile(file);
      updateClaimFields(index, {
        verificationHash: hash,
        _agreementFile: file.name,
        _agreementError: "",
      });
    } catch (err: any) {
      updateClaimFields(index, {
        _agreementError: err?.message || t("submit.upload.agreementReadError"),
        _agreementFile: "",
        verificationHash: "",
      });
    }
  };

  const clearAgreement = (index: number) =>
    updateClaimFields(index, {
      verificationHash: "",
      _agreementFile: "",
      _agreementError: "",
    });

  // Reusable drag-and-drop upload zone (mirrors the v2 certificate uploader).
  const uploadZone = (opts: {
    zoneId: string;
    inputId: string;
    accept: string;
    icon: string;
    text: string;
    fileName?: string;
    error?: string;
    onFile: (file: File) => void;
    onRemove: () => void;
  }) => (
    <div>
      <label
        htmlFor={opts.inputId}
        className={`${styles.uploadContainer} ${
          dragZone === opts.zoneId ? styles.dragActive : ""
        }`}
        onDrop={(e) => {
          e.preventDefault();
          setDragZone(null);
          const f = e.dataTransfer.files?.[0];
          if (f) opts.onFile(f);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragZone(opts.zoneId);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragZone(null);
        }}
      >
        <input
          id={opts.inputId}
          type="file"
          accept={opts.accept}
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) opts.onFile(f);
            e.target.value = "";
          }}
        />
        <div className={styles.uploadIcon}>{opts.icon}</div>
        <div className={styles.uploadText}>{opts.text}</div>
        <div className={styles.orText}>{t("submit.upload.or")}</div>
        <div className={styles.browseButton}>{t("submit.upload.browse")}</div>
      </label>
      {opts.error && <div className={styles.errorMessage}>{opts.error}</div>}
      {opts.fileName && (
        <div className={styles.fileInfo}>
          <span className={styles.fileName}>{opts.fileName}</span>
          <button
            type="button"
            className={styles.removeButton}
            onClick={opts.onRemove}
            aria-label={t("submit.actions.remove")}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );

  // Full-width upload controls shown beneath a claim's grid fields.
  const renderTypeUploads = (claim: ClaimDraft, index: number) => {
    if (claim.type === "x509Certificate") {
      return (
        <div className={styles.repeaterField}>
          {uploadZone({
            zoneId: `cert-${index}`,
            inputId: `cert-file-${index}`,
            accept: ".pem,.crt,.cer,.der",
            icon: "🔒",
            text: t("submit.upload.certText"),
            fileName: claim._certFile,
            error: claim._certError,
            onFile: (file) => handleCertFile(index, file),
            onRemove: () => clearCert(index),
          })}
          {claim._certFile && (
            <>
              <FormInput
                label={t("submit.claim.subjectName")}
                id={`cert-subject-${index}`}
                name={`cert-subject-${index}`}
                type="text"
                placeholder=""
                disabled
                value={claim.subjectName || ""}
                onChange={() => {}}
              />
              <FormInput
                label={t("submit.claim.x5t")}
                id={`cert-thumb-${index}`}
                name={`cert-thumb-${index}`}
                type="text"
                placeholder=""
                disabled
                value={claim["x5t#s256"] || ""}
                onChange={() => {}}
              />
            </>
          )}
        </div>
      );
    }
    if (claim.type === "frameworkAgreement") {
      return (
        <div className={styles.repeaterField}>
          {uploadZone({
            zoneId: `agreement-${index}`,
            inputId: `agreement-file-${index}`,
            accept: ".pdf,application/pdf",
            icon: "📄",
            text: t("submit.upload.agreementText"),
            fileName: claim._agreementFile,
            error: claim._agreementError,
            onFile: (file) => handleAgreementFile(index, file),
            onRemove: () => clearAgreement(index),
          })}
          {claim._agreementFile && (
            <FormInput
              label={t("submit.claim.verificationHash")}
              id={`agreement-hash-${index}`}
              name={`agreement-hash-${index}`}
              type="text"
              placeholder=""
              disabled
              value={claim.verificationHash || ""}
              onChange={() => {}}
            />
          )}
        </div>
      );
    }
    return null;
  };

  const renderTypeFields = (claim: ClaimDraft, index: number) => {
    switch (claim.type) {
      case "frameworkCompliance":
        return (
          <>
            {claimStatic(index, "frameworkId", t("submit.claim.frameworkId"))}
            {claimInput(index, "capabilityUrl", t("submit.claim.capabilityUrl"), t("submit.placeholders.url"))}
            {claimInput(index, "ai_description", t("submit.claim.description"))}
            {claimInput(index, "ai_website", t("submit.claim.website"), t("submit.placeholders.url"))}
            {claimInput(index, "ai_companyEmail", t("submit.claim.companyEmail"))}
            <FormSelect
              label={t("submit.claim.publiclyPublishable")}
              options={booleanOptions}
              value={claim.ai_publiclyPublishable || "false"}
              onChange={(v) => updateClaim(index, "ai_publiclyPublishable", v)}
            />
          </>
        );
      case "authRegistry":
        return (
          <>
            {claimInput(index, "name", t("submit.claim.authRegistryName"), "", true)}
            {claimInput(index, "authRegistryId", t("submit.claim.authRegistryId"), "", true)}
            {claimInput(index, "authUrl", t("submit.claim.authRegistryUrl"), t("submit.placeholders.url"), true)}
            {claimInput(index, "dataspaceId", t("submit.claim.dataspaceId"))}
            {claimInput(index, "serviceProviderPartyId", t("submit.claim.serviceProviderPartyId"))}
          </>
        );
      case "frameworkAgreement":
        return (
          <>
            {claimStatic(index, "frameworkId", t("submit.claim.frameworkId"))}
            {claimInput(index, "agreementType", t("submit.claim.agreementType"), t("submit.placeholders.agreementType"), true)}
            {claimInput(index, "agreementId", t("submit.claim.agreementId"), "", true)}
            {claimInput(index, "title", t("submit.claim.title"), "", true)}
          </>
        );
      case "frameworkRole":
        return (
          <>
            {claimStatic(index, "frameworkId", t("submit.claim.frameworkId"))}
            <FormSelect
              label={t("submit.claim.roleId")}
              options={FRAMEWORK_ROLE_OPTIONS}
              value={claim.roleId || ""}
              onChange={(v) =>
                updateClaimFields(index, { roleId: v, title: roleTitle(v) })
              }
              required
            />
            <FormSelect
              label={t("submit.claim.loa")}
              options={loaOptions}
              value={claim.loa || "not-applicable"}
              onChange={(v) => updateClaim(index, "loa", v)}
              required
            />
            <FormSelect
              label={t("submit.claim.compliancyVerified")}
              options={yesNoNaOptions}
              value={claim.compliancyVerified || "not-applicable"}
              onChange={(v) => updateClaim(index, "compliancyVerified", v)}
              required
            />
            <FormSelect
              label={t("submit.claim.legalAdherence")}
              options={yesNoNaOptions}
              value={claim.legalAdherence || "not-applicable"}
              onChange={(v) => updateClaim(index, "legalAdherence", v)}
              required
            />
          </>
        );
      case "x509Certificate":
        return (
          <>
            {claimInput(index, "certificateType", t("submit.claim.certificateType"), t("submit.placeholders.certificateType"), true)}
          </>
        );
      case "dataspaceMembership":
        return (
          <>
            {claimInput(index, "dataspaceId", t("submit.claim.dataspaceId"), "", true)}
            {claimInput(index, "capabilityUrl", t("submit.claim.capabilityUrl"), t("submit.placeholders.url"))}
            <FormSelect
              label={t("submit.claim.legalAdherence")}
              options={yesNoNaOptions}
              value={claim.legalAdherence || "not-applicable"}
              onChange={(v) => updateClaim(index, "legalAdherence", v)}
              required
            />
            {claimInput(index, "ai_description", t("submit.claim.description"))}
            {claimInput(index, "ai_website", t("submit.claim.website"), t("submit.placeholders.url"))}
            <FormSelect
              label={t("submit.claim.publiclyPublishable")}
              options={booleanOptions}
              value={claim.ai_publiclyPublishable || "false"}
              onChange={(v) => updateClaim(index, "ai_publiclyPublishable", v)}
            />
          </>
        );
      case "idpAssertion":
        return <>{claimInput(index, "assertion", t("submit.claim.assertion"), "", true)}</>;
      default:
        return null;
    }
  };

  // Compact one-line summary per claim for the review step.
  const claimSummary = (c: ClaimDraft): string => {
    const main =
      c.type === "frameworkRole"
        ? roleTitle(c.roleId || "")
        : c.type === "x509Certificate"
        ? c.subjectName || t("submit.wizard.noCertificate")
        : c.type === "frameworkAgreement" || c.type === "dataspaceAgreement"
        ? c.title || c.agreementId || ""
        : c.type === "authRegistry"
        ? c.name || ""
        : c.type === "dataspaceMembership"
        ? c.dataspaceId || ""
        : c.frameworkId || "";
    const dates = c.startDate ? ` · ${c.startDate} → ${c.endDate || "…"}` : "";
    return `${main} · ${c.status}${dates}`;
  };

  const stepIndicator = (
    <div className={styles.stepsContainer}>
      {WIZARD_STEPS.map((key, i) => (
        <div key={key} className={styles.stepWrapper}>
          <div
            className={`${styles.stepLabel} ${
              i <= step ? styles.completed : ""
            }`}
          >
            {t(`submit.steps.${key}`)}
          </div>
          <div
            className={`${styles.step} ${
              i === step ? styles.active : i < step ? styles.completed : ""
            }`}
          />
        </div>
      ))}
    </div>
  );

  return (
    <form onSubmit={handleSubmit}>
      {stepIndicator}

      {step === 0 && (
        <p className={styles.wizardHint}>{t("submit.wizard.certHint")}</p>
      )}

      {step === 1 && (
      <div className={styles.section}>
        {/* No card title: the step indicator already reads "Party details". */}
        <div className={styles.formGrid}>
          <FormInput
            label={t("submit.identity.partyId")}
            id="party_id"
            name="party_id"
            type="text"
            prefix="did:ishare:"
            placeholder={t("submit.identity.partyIdPlaceholder")}
            required
            value={partyId}
            onChange={(e) =>
              setPartyId(e.target.value.replace(/^\s*did:ishare:/i, ""))
            }
          />
          <FormInput
            label={t("submit.identity.partyName")}
            id="party_name"
            name="party_name"
            type="text"
            placeholder={t("submit.identity.partyNamePlaceholder")}
            required
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
          />
          <FormInput
            label={t("submit.identity.schemaVersion")}
            id="schema_version"
            name="schema_version"
            type="text"
            placeholder="v3.0"
            disabled
            value="v3.0"
            onChange={() => {}}
          />
        </div>

        <div className={styles.repeaterField}>
          <span className={styles.repeaterLabel}>
            {t("submit.identity.alsoKnownAs")}
          </span>
          {alsoKnownAs.map((value, index) => (
            <div className={styles.repeaterRow} key={index}>
              <FormInput
                label={t("submit.identity.alsoKnownAsPlaceholder")}
                id={`also_known_as_${index}`}
                name={`also_known_as_${index}`}
                type="text"
                placeholder={t("submit.identity.alsoKnownAsPlaceholder")}
                value={value}
                onChange={(e) => updateAlsoKnownAs(index, e.target.value)}
              />
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => removeAlsoKnownAs(index)}
                aria-label={t("submit.actions.remove")}
              >
                ✕
              </button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="secondary"
              icon={<div>+</div>}
              onClick={addAlsoKnownAs}
            >
              {t("submit.actions.addAlsoKnownAs")}
            </Button>
          </div>
        </div>
      </div>
      )}

      {step === 3 && claims.length <= MINIMUM_CLAIM_TYPES.length && (
        <p className={styles.wizardHint}>{t("submit.wizard.extrasHint")}</p>
      )}

      {claims.map((claim, index) =>
        claimStepOf(index) !== step ? null : (
        <div className={styles.section} key={index}>
          {/* Card chrome differs by step: the certificate card carries no title
              (the step indicator already says "Certificate", and "Claim 4" made
              no sense once it moved first); framework cards are titled by their
              claim type with the divider BETWEEN title and content; extra
              claims keep the original numbered layout. */}
          {claimStepOf(index) === 3 && <div className={styles.sectionBar}></div>}
          {claimStepOf(index) !== 0 && (
            <div className={styles.sectionHeader}>
              <div className={styles.sectionHeading}>
                <h2 className={styles.sectionTitle}>
                  {claimStepOf(index) === 2
                    ? t("submit.claimTypes." + claim.type)
                    : t("submit.claim.heading", {
                        index: index + 1,
                        type: t("submit.claimTypes." + claim.type),
                      })}
                </h2>
                {isMinimumClaim(index) && (
                  <span className={styles.requiredBadge}>
                    {t("submit.claim.minimum")}
                  </span>
                )}
              </div>
              {!isMinimumClaim(index) && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => removeClaim(index)}
                >
                  {t("submit.actions.remove")}
                </Button>
              )}
            </div>
          )}
          {claimStepOf(index) === 2 && (
            <div className={styles.sectionDivider}></div>
          )}
          <div className={styles.formGrid}>
            <FormSelect
              label={t("submit.claim.type")}
              options={claimTypeOptions}
              value={claim.type}
              onChange={(v) => changeClaimType(index, v as EditableClaimType)}
              disabled={isMinimumClaim(index)}
              required
            />
            <FormSelect
              label={t("submit.claim.status")}
              options={statusOptions}
              value={claim.status}
              onChange={(v) => updateClaim(index, "status", v)}
              required
            />
            {claimStatic(index, "registrarId", t("submit.claim.registrarId"))}
            {claimStatic(index, "startDate", t("submit.claim.startDate"))}
            {claimStatic(index, "endDate", t("submit.claim.endDate"))}
            {renderTypeFields(claim, index)}
          </div>
          {renderTypeUploads(claim, index)}
        </div>
        )
      )}

      {step === 3 && (
        <div className={styles.buttonGroup}>
          <Button
            type="button"
            variant="secondary"
            icon={<div>+</div>}
            onClick={addClaim}
          >
            {t("submit.actions.addClaim")}
          </Button>
        </div>
      )}

      {step === WIZARD_STEPS.length - 1 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("submit.review.heading")}</h2>
          <div className={styles.reviewBlock}>
            <h3>{t("submit.identity.heading")}</h3>
            <p className={styles.reviewLine}>
              did:ishare:{partyId} — {partyName || "—"}
            </p>
            {alsoKnownAs.filter((a) => a.trim()).length > 0 && (
              <p className={styles.reviewLine}>
                {t("submit.identity.alsoKnownAs")}:{" "}
                {alsoKnownAs.filter((a) => a.trim()).join(", ")}
              </p>
            )}
          </div>
          {claims.map((c, i) => (
            <div className={styles.reviewBlock} key={i}>
              <h3>{t("submit.claimTypes." + c.type)}</h3>
              <p className={styles.reviewLine}>{claimSummary(c)}</p>
            </div>
          ))}
          {certMissing && certRequired && (
            <div className={styles.warnMessage}>
              {t("submit.wizard.certRequiredWarn")}
            </div>
          )}
          <div className={styles.warnMessage}>
            {t("submit.review.permanentNote")}
          </div>
          <label className={styles.confirmRow}>
            <input
              type="checkbox"
              checked={reviewConfirmed}
              onChange={(e) => setReviewConfirmed(e.target.checked)}
            />
            <span>{t("submit.review.confirmLabel")}</span>
          </label>
        </div>
      )}

      {wizardError && (
        <div className={styles.errorMessage}>{t(wizardError)}</div>
      )}
      {error && (
        <div className={styles.errorMessage}>
          {t("submit.messages.submitError", {
            message: String((error as any)?.message || ""),
          })}
        </div>
      )}
      {response && (
        <div className={styles.uploadText}>
          {t("submit.messages.submitSuccess")}
        </div>
      )}

      <div className={styles.wizardNav}>
        <div>
          {step > 0 && (
            <Button type="button" variant="secondary" onClick={goBack}>
              {t("submit.wizard.back")}
            </Button>
          )}
        </div>
        <div>
          {step < WIZARD_STEPS.length - 1 ? (
            <Button type="button" variant="primary" onClick={goNext}>
              {t("submit.wizard.next")}
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              disabled={loading || !reviewConfirmed}
            >
              {loading
                ? t("submit.actions.submitting")
                : t("submit.actions.create")}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
};

export default SubmitClaimsForm;
