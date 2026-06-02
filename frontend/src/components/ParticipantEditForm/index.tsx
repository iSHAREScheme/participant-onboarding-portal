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

const initFrom = (p: Party): FormState => {
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

// Inline editor for a single real claim (v3 claims-capable satellites). The
// satellite we target exposes no claims, so this stays unrendered here, but the
// PATCH /parties/{id}/claims/{claimId} path is wired end-to-end.
const ClaimEditor = ({ partyId, claim }: { partyId: string; claim: any }) => {
  const { t } = useLanguage();
  const e = (k: string) => t(`participants.detail.edit.${k}`);
  const f = (k: string) => t(`participants.detail.fields.${k}`);
  const [status, setStatus] = useState(str(claim?.status));
  const [from, setFrom] = useState(str(claim?.validFrom ?? claim?.startDate));
  const [until, setUntil] = useState(str(claim?.validUntil ?? claim?.endDate));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const api = new API();
      await api.patchClaim(partyId, str(claim?.id), {
        status,
        validFrom: from,
        validUntil: until,
      });
      setMsg(e("saved"));
    } catch (err: any) {
      setMsg(err?.response?.data?.error || e("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.claimCard}>
      <div className={styles.claimHead}>
        <span className={styles.claimType}>{str(claim?.type) || "claim"}</span>
        <span className={styles.subtitle}>{str(claim?.id)}</span>
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
  const [initial] = useState<FormState>(() => initFrom(party));
  const [form, setForm] = useState<FormState>(() => initFrom(party));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof FormState, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));
  const f = (k: string) => t(`participants.detail.fields.${k}`);
  const e = (k: string) => t(`participants.detail.edit.${k}`);

  // v3.0 PATCH: only the changed party-level fields (partyUpdate is partial).
  const buildV3Patch = (): any => {
    const body: any = {};
    if (form.partyName !== initial.partyName) body.party_name = form.partyName;
    if (form.capabilityUrl !== initial.capabilityUrl)
      body.capability_url = form.capabilityUrl;
    const adh: any = {};
    if (form.status !== initial.status) adh.status = form.status;
    if (form.startDate !== initial.startDate) adh.start_date = form.startDate;
    if (form.endDate !== initial.endDate) adh.end_date = form.endDate;
    if (Object.keys(adh).length) body.adherence = adh;
    const ai: any = {};
    if (form.description !== initial.description) ai.description = form.description;
    if (form.website !== initial.website) ai.website = form.website;
    if (form.companyEmail !== initial.companyEmail)
      ai.company_email = form.companyEmail;
    if (form.companyPhone !== initial.companyPhone)
      ai.company_phone = form.companyPhone;
    if (form.publiclyPublishable !== initial.publiclyPublishable)
      ai.publicly_publishable = form.publiclyPublishable;
    if (form.tags !== initial.tags) ai.tags = form.tags;
    if (Object.keys(ai).length) body.additional_info = ai;
    return body;
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
        const body = buildV3Patch();
        if (Object.keys(body).length === 0) {
          onCancel();
          return;
        }
        await api.patchParty(id, body);
      } else {
        await api.updateParty(id, buildV22Put());
      }
      onSaved();
    } catch (err: any) {
      setError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
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

  const realClaims = Array.isArray(party.claims) ? party.claims : [];

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
              !["Active", "Inactive"].includes(form.status) ? (
                <option value={form.status}>{form.status}</option>
              ) : null}
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
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

      {/* v3 per-claim editing — only when the satellite actually exposes claims. */}
      {isV3 && realClaims.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{e("claimsTitle")}</h2>
          <div className={styles.cards}>
            {realClaims.map((claim: any, i: number) => (
              <ClaimEditor key={claim?.id ?? i} partyId={id} claim={claim} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default ParticipantEditForm;
