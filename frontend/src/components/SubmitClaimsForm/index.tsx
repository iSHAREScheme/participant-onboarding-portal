import React, { useState } from "react";
import { FormInput, FormSelect, Button } from "components";
import { useSubmitParty } from "hooks";
import { useLanguage } from "context/LanguageContext";
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
  type: ClaimType;
  registrarId: string;
  status: string;
  startDate: string;
  endDate: string;
  [key: string]: string;
};

const newClaimDraft = (type: ClaimType): ClaimDraft => ({
  type,
  registrarId: "",
  status: "active",
  startDate: "",
  endDate: "",
});

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
    ...(d.startDate ? { startDate: d.startDate } : {}),
    ...(d.endDate ? { endDate: d.endDate } : {}),
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

  const [partyId, setPartyId] = useState("");
  const [partyName, setPartyName] = useState("");
  const [alsoKnownAs, setAlsoKnownAs] = useState<string[]>([]);
  const [claims, setClaims] = useState<ClaimDraft[]>([
    newClaimDraft("frameworkCompliance"),
  ]);
  // Tracks which upload zone is currently being dragged over (by zone id).
  const [dragZone, setDragZone] = useState<string | null>(null);

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

  const addClaim = () =>
    setClaims((prev) => [...prev, newClaimDraft("frameworkCompliance")]);

  const removeClaim = (index: number) =>
    setClaims((prev) => prev.filter((_, i) => i !== index));

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
  const changeClaimType = (index: number, type: ClaimType) =>
    setClaims((prev) =>
      prev.map((c, i) =>
        i === index
          ? {
              type,
              registrarId: c.registrarId,
              status: c.status,
              startDate: c.startDate,
              endDate: c.endDate,
            }
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
      const { x5c, thumbprint, subjectName } = await extractCertificateFields(
        file
      );
      updateClaimFields(index, {
        x5c,
        "x5t#s256": thumbprint,
        subjectName,
        _certFile: file.name,
        _certError: "",
      });
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
            {claimInput(index, "frameworkId", t("submit.claim.frameworkId"), t("submit.placeholders.framework"), true)}
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
            {claimInput(index, "frameworkId", t("submit.claim.frameworkId"), "", true)}
            {claimInput(index, "agreementType", t("submit.claim.agreementType"), t("submit.placeholders.agreementType"), true)}
            {claimInput(index, "agreementId", t("submit.claim.agreementId"), "", true)}
            {claimInput(index, "title", t("submit.claim.title"), "", true)}
          </>
        );
      case "frameworkRole":
        return (
          <>
            {claimInput(index, "frameworkId", t("submit.claim.frameworkId"), "", true)}
            {claimInput(index, "roleId", t("submit.claim.roleId"), t("submit.placeholders.roleId"), true)}
            {claimInput(index, "title", t("submit.claim.title"))}
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

  return (
    <form onSubmit={handleSubmit}>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("submit.identity.heading")}</h2>
        <div className={styles.formGrid}>
          <FormInput
            label={t("submit.identity.partyId")}
            id="party_id"
            name="party_id"
            type="text"
            placeholder={t("submit.identity.partyIdPlaceholder")}
            required
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
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

      {claims.map((claim, index) => (
        <div className={styles.section} key={index}>
          <div className={styles.sectionBar}></div>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              {t("submit.claim.heading", {
                index: index + 1,
                type: t("submit.claimTypes." + claim.type),
              })}
            </h2>
            <Button
              type="button"
              variant="secondary"
              onClick={() => removeClaim(index)}
            >
              {t("submit.actions.remove")}
            </Button>
          </div>
          <div className={styles.formGrid}>
            <FormSelect
              label={t("submit.claim.type")}
              options={claimTypeOptions}
              value={claim.type}
              onChange={(v) => changeClaimType(index, v as ClaimType)}
              required
            />
            <FormSelect
              label={t("submit.claim.status")}
              options={statusOptions}
              value={claim.status}
              onChange={(v) => updateClaim(index, "status", v)}
              required
            />
            {claimInput(index, "registrarId", t("submit.claim.registrarId"), "", true)}
            {claimInput(index, "startDate", t("submit.claim.startDate"), t("submit.placeholders.date"))}
            {claimInput(index, "endDate", t("submit.claim.endDate"), t("submit.placeholders.date"))}
            {renderTypeFields(claim, index)}
          </div>
          {renderTypeUploads(claim, index)}
        </div>
      ))}

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

      <br />

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

      <div className={styles.buttonGroup}>
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? t("submit.actions.submitting") : t("submit.actions.create")}
        </Button>
      </div>
    </form>
  );
};

export default SubmitClaimsForm;
