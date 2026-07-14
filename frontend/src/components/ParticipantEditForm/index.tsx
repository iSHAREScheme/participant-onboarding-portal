import { useState } from "react";
import API from "api/client";
import { useLanguage } from "../../context/LanguageContext";
import { getSatelliteVersion } from "config/publicEnv";
import styles from "styles/ParticipantDetail.module.css";

type Party = Record<string, any>;
const str = (v: any): string => (v === undefined || v === null ? "" : String(v));
const arr = (v: any): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : [];

// v2.x flat form state (legacy full-PUT path only).
interface V22FormState {
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

const initV22 = (p: Party): V22FormState => {
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

// Party-level editor. On a v3 satellite it edits ONLY party-level fields
// (name + alsoKnownAs) via PATCH /parties/{id}; the party's adherence, company
// info and every other claim are edited individually from the claim cards, not
// here. On a legacy v2.x satellite it falls back to the full-replace PUT form.
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
  const f = (k: string) => t(`participants.detail.fields.${k}`);
  const e = (k: string) => t(`participants.detail.edit.${k}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- v3 party-level state -------------------------------------------------
  const initialName = str(party.name ?? party.party_name);
  const initialAka = arr(party.alsoKnownAs);
  const [name, setName] = useState(initialName);
  const [aka, setAka] = useState<string[]>(initialAka);

  // --- v2.2 full-form state -------------------------------------------------
  const [form, setForm] = useState<V22FormState>(() => initV22(party));
  const set = (k: keyof V22FormState, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

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
        const body: Record<string, any> = {};
        if (name !== initialName) body.name = name;
        const cleanAka = aka.map((s) => s.trim()).filter(Boolean);
        if (JSON.stringify(cleanAka) !== JSON.stringify(initialAka))
          body.alsoKnownAs = cleanAka;
        if (!Object.keys(body).length) {
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
          err?.message ||
          e("saveError")
      );
    } finally {
      setSaving(false);
    }
  };

  const actions = (
    <div className={styles.formActions}>
      <button className={styles.saveBtn} onClick={save} disabled={saving}>
        {saving ? e("saving") : e("save")}
      </button>
      <button className={styles.cancelBtn} onClick={onCancel} disabled={saving}>
        {e("cancel")}
      </button>
    </div>
  );

  // --- v3: party-info only --------------------------------------------------
  if (isV3) {
    return (
      <div className={styles.body}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{e("partyInfoTitle")}</h2>
          <p className={styles.subtitle}>{e("partyInfoHint")}</p>
          <div className={styles.grid}>
            <div className={styles.formRow}>
              <label className={styles.formLabel}>{f("name")}</label>
              <input
                className={styles.formInput}
                value={name}
                onChange={(ev) => setName(ev.target.value)}
              />
            </div>
          </div>
          <div className={styles.repeaterField}>
            <span className={styles.repeaterLabel}>{f("alsoKnownAs")}</span>
            {aka.map((v, i) => (
              <div className={styles.repeaterRow} key={i}>
                <input
                  className={styles.formInput}
                  value={v}
                  onChange={(ev) =>
                    setAka((prev) =>
                      prev.map((x, j) => (j === i ? ev.target.value : x))
                    )
                  }
                />
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() =>
                    setAka((prev) => prev.filter((_, j) => j !== i))
                  }
                  aria-label={e("cancel")}
                >
                  ✕
                </button>
              </div>
            ))}
            <div>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setAka((prev) => [...prev, ""])}
              >
                + {f("alsoKnownAs")}
              </button>
            </div>
          </div>
          {error && <div className={styles.error}>{error}</div>}
          {actions}
        </section>
      </div>
    );
  }

  // --- v2.x: legacy full-replace form ---------------------------------------
  const textRow = (
    key: keyof V22FormState,
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
              !["active", "inactive", "Active", "Inactive"].includes(
                form.status
              ) ? (
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
        {actions}
      </section>
    </div>
  );
};

export default ParticipantEditForm;
