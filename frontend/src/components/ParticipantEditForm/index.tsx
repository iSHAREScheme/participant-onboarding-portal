import { useState } from "react";
import API from "api/client";
import { useLanguage } from "../../context/LanguageContext";
import { getSatelliteVersion } from "config/publicEnv";
import styles from "styles/ParticipantDetail.module.css";

type Party = Record<string, any>;
const str = (v: any): string => (v === undefined || v === null ? "" : String(v));

interface FormState {
  partyName: string;
  capabilityUrl: string;
  status: string;
  startDate: string;
  endDate: string;
  description: string;
  website: string;
  companyEmail: string;
  companyPhone: string;
  publiclyPublishable: string;
  tags: string;
}

// On a v3 satellite a party's adherence + company info live on its
// frameworkCompliance claim (status/dates/capabilityUrl/additionalInfo), not on
// flat party fields — so that's what the editor reads and writes.
const complianceClaimOf = (p: Party): any =>
  (Array.isArray(p.claims) ? p.claims : []).find(
    (c: any) => c?.type === "frameworkCompliance"
  );

const initFrom = (p: Party, isV3: boolean): FormState => {
  if (isV3) {
    const c = complianceClaimOf(p) ?? {};
    const ai = c.additionalInfo ?? {};
    return {
      partyName: str(p.name ?? p.party_name),
      capabilityUrl: str(c.capabilityUrl),
      status: str(c.status),
      startDate: str(c.startDate ?? c.validFrom),
      endDate: str(c.endDate ?? c.validUntil),
      description: str(ai.description),
      website: str(ai.website),
      companyEmail: str(ai.companyEmail),
      companyPhone: str(ai.companyPhone),
      publiclyPublishable: str(ai.publiclyPublishable) || "false",
      tags: str(ai.tags),
    };
  }
  // v2.x flat shape (legacy PUT path).
  const a = p.adherence ?? {};
  const ai = p.additional_info ?? {};
  return {
    partyName: str(p.party_name ?? p.name),
    capabilityUrl: str(p.capability_url),
    status: str(a.status),
    startDate: str(a.start_date),
    endDate: str(a.end_date),
    description: str(ai.description),
    website: str(ai.website),
    companyEmail: str(ai.company_email),
    companyPhone: str(ai.company_phone),
    publiclyPublishable: str(ai.publicly_publishable) || "false",
    tags: str(ai.tags),
  };
};

// Inline editor for a single non-compliance claim (roles, certificates, …):
// status + validity, the fields the v3 claim-patch whitelist allows on any claim.
const ClaimEditor = ({ partyId, claim }: { partyId: string; claim: any }) => {
  const { t } = useLanguage();
  const e = (k: string) => t(`participants.detail.edit.${k}`);
  const f = (k: string) => t(`participants.detail.fields.${k}`);
  const [status, setStatus] = useState(str(claim?.status));
  const [from, setFrom] = useState(str(claim?.startDate ?? claim?.validFrom));
  const [until, setUntil] = useState(str(claim?.endDate ?? claim?.validUntil));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const api = new API();
      await api.patchClaim(partyId, str(claim?.id), {
        status,
        startDate: from,
        endDate: until,
      });
      setMsg(e("saved"));
    } catch (err: any) {
      setMsg(err?.response?.data?.error || err?.response?.data?.message || e("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const label = str(claim?.roleId) || str(claim?.subjectName) || str(claim?.id);

  return (
    <div className={styles.claimCard}>
      <div className={styles.claimHead}>
        <span className={styles.claimType}>{str(claim?.type) || "claim"}</span>
        <span className={styles.subtitle}>{label}</span>
      </div>
      <div className={styles.grid}>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>{f("status")}</label>
          <input
            className={styles.formInput}
            value={status}
            onChange={(ev) => setStatus(ev.target.value)}
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>{f("startDate")}</label>
          <input
            className={styles.formInput}
            value={from}
            onChange={(ev) => setFrom(ev.target.value)}
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel}>{f("endDate")}</label>
          <input
            className={styles.formInput}
            value={until}
            onChange={(ev) => setUntil(ev.target.value)}
          />
        </div>
      </div>
      <div className={styles.formActions}>
        <button className={styles.saveBtn} onClick={save} disabled={saving}>
          {saving ? e("saving") : e("saveClaim")}
        </button>
        {msg && <span className={styles.subtitle}>{msg}</span>}
      </div>
    </div>
  );
};

const ParticipantEditForm = ({
  party,
  id,
  onSaved,
  onCancel,
}: {
  party: Party;
  id: string;
  onSaved: () => void;
  onCancel: () => void;
}) => {
  const { t } = useLanguage();
  const version = getSatelliteVersion();
  const isV3 = version.trim().startsWith("3");
  const [initial] = useState<FormState>(() => initFrom(party, isV3));
  const [form, setForm] = useState<FormState>(() => initFrom(party, isV3));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complianceClaimId = isV3 ? str(complianceClaimOf(party)?.id) : "";

  const set = (k: keyof FormState, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));
  const f = (k: string) => t(`participants.detail.fields.${k}`);
  const e = (k: string) => t(`participants.detail.edit.${k}`);

  // v3 claim PATCH: only the changed frameworkCompliance fields, as the flat
  // dotted keys the satellite's patch whitelist accepts.
  const buildClaimPatch = (): Record<string, any> => {
    const patch: Record<string, any> = {};
    if (form.status !== initial.status) patch.status = form.status;
    if (form.startDate !== initial.startDate) patch.startDate = form.startDate;
    if (form.endDate !== initial.endDate) patch.endDate = form.endDate;
    if (form.capabilityUrl !== initial.capabilityUrl)
      patch.capabilityUrl = form.capabilityUrl;
    if (form.description !== initial.description)
      patch["additionalInfo.description"] = form.description;
    if (form.website !== initial.website)
      patch["additionalInfo.website"] = form.website;
    if (form.companyEmail !== initial.companyEmail)
      patch["additionalInfo.companyEmail"] = form.companyEmail;
    if (form.companyPhone !== initial.companyPhone)
      patch["additionalInfo.companyPhone"] = form.companyPhone;
    if (form.publiclyPublishable !== initial.publiclyPublishable)
      patch["additionalInfo.publiclyPublishable"] = form.publiclyPublishable === "true";
    if (form.tags !== initial.tags) patch["additionalInfo.tags"] = form.tags;
    return patch;
  };

  // v2.2 PUT: full replace — all values must be provided, arrays preserved.
  const buildV22Put = (): any => ({
    id: str(party.party_id ?? party.id),
    schemaVersion: "v2.2",
    party_name: form.partyName,
    registrar_id: str(party.registrar_id),
    capability_url: form.capabilityUrl,
    adherence: {
      status: form.status,
      start_date: form.startDate,
      end_date: form.endDate,
    },
    additional_info: {
      ...(party.additional_info ?? {}),
      description: form.description,
      website: form.website,
      company_email: form.companyEmail,
      company_phone: form.companyPhone,
      publicly_publishable: form.publiclyPublishable,
      tags: form.tags,
    },
    roles: party.roles ?? [],
    agreements: party.agreements ?? [],
    auth_registries: party.authregistery ?? party.authregistries ?? [],
    certificates: party.certificates ?? [],
    ...(party.alsoKnownAs ? { alsoKnownAs: party.alsoKnownAs } : {}),
    ...(party.spor ? { spor: party.spor } : {}),
  });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const api = new API();
      if (isV3) {
        // v3 splits the write: the party name is a party-level field (PATCH the
        // party); adherence + company info live on the frameworkCompliance claim
        // (PATCH the claim).
        let changed = false;
        if (form.partyName !== initial.partyName) {
          await api.patchParty(id, { name: form.partyName });
          changed = true;
        }
        const claimPatch = buildClaimPatch();
        if (Object.keys(claimPatch).length) {
          if (!complianceClaimId) {
            throw new Error(e("noComplianceClaim"));
          }
          await api.patchClaim(id, complianceClaimId, claimPatch);
          changed = true;
        }
        if (!changed) {
          onCancel();
          return;
        }
      } else {
        await api.updateParty(id, buildV22Put());
      }
      onSaved();
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          err?.message ||
          e("saveError")
      );
    } finally {
      setSaving(false);
    }
  };

  const textRow = (
    key: keyof FormState,
    labelKey: string,
    opts?: { textarea?: boolean }
  ) => (
    <div className={styles.formRow}>
      <label className={styles.formLabel}>{f(labelKey)}</label>
      {opts?.textarea ? (
        <textarea
          className={styles.formInput}
          value={form[key]}
          onChange={(ev) => set(key, ev.target.value)}
          rows={2}
        />
      ) : (
        <input
          className={styles.formInput}
          value={form[key]}
          onChange={(ev) => set(key, ev.target.value)}
        />
      )}
    </div>
  );

  // Other real, persisted claims (roles, certificates, …) editable individually.
  // Excludes frameworkCompliance (covered by the form above) and derived display
  // claims (no id → nothing to PATCH).
  const otherClaims = (Array.isArray(party.claims) ? party.claims : []).filter(
    (c: any) => c?.type !== "frameworkCompliance" && str(c?.id)
  );

  return (
    <div className={styles.body}>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{e("title")}</h2>
        <div className={styles.grid}>
          {textRow("partyName", "name")}
          {textRow("capabilityUrl", "capabilityUrl")}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>{f("status")}</label>
            <select
              className={styles.formInput}
              value={form.status}
              onChange={(ev) => set("status", ev.target.value)}
            >
              {form.status &&
              !["active", "inactive", "Active", "Inactive"].includes(form.status) ? (
                <option value={form.status}>{form.status}</option>
              ) : null}
              <option value={isV3 ? "active" : "Active"}>Active</option>
              <option value={isV3 ? "inactive" : "Inactive"}>Inactive</option>
            </select>
          </div>
          {textRow("startDate", "startDate")}
          {textRow("endDate", "endDate")}
          {textRow("website", "website")}
          {textRow("companyEmail", "companyEmail")}
          {textRow("companyPhone", "companyPhone")}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>{f("publiclyPublishable")}</label>
            <select
              className={styles.formInput}
              value={form.publiclyPublishable}
              onChange={(ev) => set("publiclyPublishable", ev.target.value)}
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </div>
          {textRow("tags", "tags")}
        </div>
        {textRow("description", "description", { textarea: true })}

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.formActions}>
          <button className={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? e("saving") : e("save")}
          </button>
          <button
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={saving}
          >
            {e("cancel")}
          </button>
        </div>
      </section>

      {/* v3 per-claim editing for roles / certificates / agreements. */}
      {isV3 && otherClaims.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{e("claimsTitle")}</h2>
          <div className={styles.cards}>
            {otherClaims.map((claim: any, i: number) => (
              <ClaimEditor key={claim?.id ?? i} partyId={id} claim={claim} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ParticipantEditForm;
