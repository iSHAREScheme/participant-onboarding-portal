import { useCallback, useEffect, useState } from "react";
import API, {
  type VcAcceptedType,
  type VcTrustPolicy,
} from "api/client";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";
import styles from "styles/Settings.module.css";

// Admin editor for credential-based onboarding.
//
// Everything here is a trust decision: which credential types this deployment
// will accept, which issuers may sign them, where those issuers publish their
// keys, and which onboarding field each claim is allowed to fill. The backend
// validates the same rules on save, so a bad mapping target or an issuer with
// no resolvable keys is refused rather than silently ignored at verification
// time.

const STATUS_CHECK_OPTIONS: { value: VcTrustPolicy["statusCheck"]; label: string; hint: string }[] = [
  {
    value: "soft",
    label: "Soft (recommended)",
    hint: "A credential marked revoked is rejected, but an unreachable status list only warns.",
  },
  {
    value: "required",
    label: "Required",
    hint: "Revocation must be checkable. An unreachable status list fails verification.",
  },
  { value: "off", label: "Off", hint: "Revocation is not checked at all." },
];

const emptyType = (): VcAcceptedType => ({
  type: "",
  label: "",
  enabled: true,
  issuers: [],
  mappings: [],
});

interface Props {
  // Whether VCs are currently enabled as an identity method. That switch lives
  // on the Identity verification card (it is one method among several), so this
  // card only reflects it, live, as the admin toggles it.
  vcEnabled: boolean;
}

const VcOnboardingSettings: React.FC<Props> = ({ vcEnabled }) => {
  const toast = useToast();
  const confirm = useConfirm();

  const [policy, setPolicy] = useState<VcTrustPolicy | null>(null);
  const [autoAccept, setAutoAccept] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  const [verifierBaseUrl, setVerifierBaseUrl] = useState("");
  const [clientId, setClientId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // No setLoading(true) here: `loading` starts true and this only runs on
  // mount, so setting it synchronously inside the effect would just trigger a
  // cascading render.
  const load = useCallback(async () => {
    try {
      const { data } = await new API().fetchVcPolicy();
      setPolicy(data.policy);
      setAutoAccept(data.autoAcceptVerified);
      setFields(data.mappableFields ?? []);
      setVerifierBaseUrl(data.verifierBaseUrl ?? "");
      setClientId(data.clientId ?? "");
    } catch {
      toast.error("Could not load the credential onboarding configuration");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    if (!policy) return;
    setSaving(true);
    try {
      await new API().updateVcPolicy(policy, autoAccept);
      toast.success("Credential onboarding configuration saved");
    } catch (err) {
      const detail = (err as { response?: { data?: { message?: string; error?: string } } })
        ?.response?.data;
      toast.error(detail?.message || detail?.error || "Could not save the configuration");
    } finally {
      setSaving(false);
    }
  }, [autoAccept, policy, toast]);

  // --- immutable updates on the accepted-type list --------------------------
  const updateType = useCallback((index: number, patch: Partial<VcAcceptedType>) => {
    setPolicy((prev) => {
      if (!prev) return prev;
      const acceptedTypes = prev.acceptedTypes.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry
      );
      return { ...prev, acceptedTypes };
    });
  }, []);

  const removeType = useCallback(
    async (index: number) => {
      if (!policy) return;
      const entry = policy.acceptedTypes[index];
      const ok = await confirm({
        title: "Remove credential type",
        message: `Stop accepting ${entry.label || entry.type}? Applicants will no longer be able to onboard with it.`,
      });
      if (!ok) return;
      setPolicy((prev) =>
        prev ? { ...prev, acceptedTypes: prev.acceptedTypes.filter((_, i) => i !== index) } : prev
      );
    },
    [confirm, policy]
  );

  if (loading) return <p className={styles.helperText}>Loading…</p>;
  if (!policy) return null;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Onboarding with Verifiable Credentials (VCs)</h2>
      <p className={styles.cardHint}>
        Let applicants present Verifiable Credentials they already hold instead of typing their
        details and proving identity by hand. Whatever a credential proves is filled in and
        treated as verified; anything it does not prove still has to be completed the usual way.
      </p>

      <p className={styles.helperText}>
        {vcEnabled
          ? "VCs are enabled under Identity verification above. Applicants can present credentials from the issuers trusted below."
          : "VCs are currently off. Enable them under Identity verification above; you can configure trusted issuers here in the meantime, and nothing is accepted until then."}
      </p>

      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={autoAccept}
          onChange={(e) => setAutoAccept(e.target.checked)}
        />
        Skip admin review for applications backed by a verified presentation
      </label>

      <label className={styles.checkboxLabel}>
        <input
          type="checkbox"
          checked={policy.requireHolderBinding}
          onChange={(e) => setPolicy({ ...policy, requireHolderBinding: e.target.checked })}
        />
        Require the wallet to sign the presentation itself (holder binding)
      </label>
      <p className={styles.helperText}>
        The published iSHARE example presentations are unsigned — the credentials inside carry
        the proofs — so leaving this off is the interoperable choice. Turn it on only if every
        wallet you accept signs the presentation, otherwise verification will fail.
      </p>

      <div className={styles.formGroup}>
        <label htmlFor="vc-status-check">Revocation checking</label>
        <select
          id="vc-status-check"
          className={styles.fontSelect}
          value={policy.statusCheck || "soft"}
          onChange={(e) =>
            setPolicy({ ...policy, statusCheck: e.target.value as VcTrustPolicy["statusCheck"] })
          }
        >
          {STATUS_CHECK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className={styles.helperText}>
          {STATUS_CHECK_OPTIONS.find((o) => o.value === (policy.statusCheck || "soft"))?.hint}
        </p>
      </div>

      <p className={styles.helperText}>
        Wallets reach this portal at <code>{verifierBaseUrl || "(not configured)"}</code> and know
        it as <code>{clientId || "(not configured)"}</code>.
        {!verifierBaseUrl &&
          " Set VC_VERIFIER_BASE_URL to a publicly reachable URL before the QR flow can work; applicants can still paste a presentation without it."}
      </p>

      <h4 className={styles.cardTitle}>Accepted credentials</h4>
      <p className={styles.cardHint}>
        A credential type with no trusted issuer is never accepted, whatever its enabled flag
        says — naming the issuers is what switches it on.
      </p>

      {policy.acceptedTypes.map((accepted, index) => (
        <AcceptedTypeEditor
          key={`${accepted.type}-${index}`}
          accepted={accepted}
          fields={fields}
          onChange={(patch) => updateType(index, patch)}
          onRemove={() => removeType(index)}
        />
      ))}

      <button
        type="button"
        className={styles.addButton}
        onClick={() =>
          setPolicy({ ...policy, acceptedTypes: [...policy.acceptedTypes, emptyType()] })
        }
      >
        Add credential type
      </button>

      <div className={styles.editorActions}>
        <button type="button" className={styles.saveButton} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save VC settings"}
        </button>
      </div>
    </section>
  );
};

// --- one credential type ----------------------------------------------------

interface TypeEditorProps {
  accepted: VcAcceptedType;
  fields: string[];
  onChange: (patch: Partial<VcAcceptedType>) => void;
  onRemove: () => void;
}

const AcceptedTypeEditor: React.FC<TypeEditorProps> = ({ accepted, fields, onChange, onRemove }) => {
  const [open, setOpen] = useState(false);
  const issuerCount = accepted.issuers?.length ?? 0;

  return (
    <div className={styles.idpEditor}>
      <div className={styles.idpMain}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={accepted.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          <span className={styles.idpName}>{accepted.label || accepted.type || "New type"}</span>
        </label>
        <span className={styles.idpMeta}>
          {issuerCount === 0
            ? "no trusted issuer — not accepted"
            : `${issuerCount} trusted issuer${issuerCount === 1 ? "" : "s"}`}
          {" · "}
          {accepted.mappings?.length ?? 0} mapped field
          {(accepted.mappings?.length ?? 0) === 1 ? "" : "s"}
        </span>
        <div className={styles.idpActions}>
          <button type="button" className={styles.idpActionBtn} onClick={() => setOpen(!open)}>
            {open ? "Close" : "Edit"}
          </button>
          <button type="button" className={`${styles.idpActionBtn} ${styles.idpActionDanger}`} onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      {open && (
        <div>
          <div className={styles.fieldRow}>
            <div className={styles.formGroup}>
              <label>Credential type</label>
              <input
                className={styles.input}
                value={accepted.type}
                placeholder="TrustedParticipantCredential"
                onChange={(e) => onChange({ type: e.target.value })}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Display name</label>
              <input
                className={styles.input}
                value={accepted.label ?? ""}
                placeholder="iSHARE Trusted Participant"
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </div>
          </div>

          <h5>Trusted issuers</h5>
          <p className={styles.helperText}>
            The DID in the credential&apos;s <code>issuer</code> field. A <code>did:web</code>{" "}
            issuer resolves on its own; anything else (including <code>did:ishare</code>) needs the
            URL of its DID document or JWKS.
          </p>
          {(accepted.issuers ?? []).map((issuer, i) => (
            <div className={styles.configRow} key={i}>
              <input
                className={styles.input}
                value={issuer.did}
                placeholder="did:ishare:EU.NL.NTRNL-10000000"
                onChange={(e) =>
                  onChange({
                    issuers: accepted.issuers.map((entry, j) =>
                      j === i ? { ...entry, did: e.target.value } : entry
                    ),
                  })
                }
              />
              <input
                className={styles.input}
                value={issuer.name ?? ""}
                placeholder="Name shown to applicants"
                onChange={(e) =>
                  onChange({
                    issuers: accepted.issuers.map((entry, j) =>
                      j === i ? { ...entry, name: e.target.value } : entry
                    ),
                  })
                }
              />
              <input
                className={styles.input}
                value={issuer.resolverUrl ?? ""}
                placeholder="https://issuer.example.com/.well-known/did.json"
                onChange={(e) =>
                  onChange({
                    issuers: accepted.issuers.map((entry, j) =>
                      j === i ? { ...entry, resolverUrl: e.target.value } : entry
                    ),
                  })
                }
              />
              <button
                type="button"
                className={`${styles.idpActionBtn} ${styles.idpActionDanger}`}
                onClick={() =>
                  onChange({ issuers: accepted.issuers.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.addButton}
            onClick={() =>
              onChange({ issuers: [...(accepted.issuers ?? []), { did: "", name: "", resolverUrl: "" }] })
            }
          >
            Add issuer
          </button>

          <h5>Claim mapping</h5>
          <p className={styles.helperText}>
            Each row copies one value out of the credential into one onboarding field. Paths are
            dotted, with array indices — for example{" "}
            <code>credentialSubject.frameworks[0].capabilityUrl</code>. Mapping{" "}
            <code>idCheck.certX5c</code> or <code>idCheck.idpAssertion</code> lets the credential
            supply the identity proof, so the applicant skips the certificate step entirely.
          </p>
          {(accepted.mappings ?? []).map((mapping, i) => (
            <div className={styles.configRow} key={i}>
              <input
                className={styles.input}
                value={mapping.path}
                placeholder="credentialSubject.name"
                onChange={(e) =>
                  onChange({
                    mappings: accepted.mappings.map((entry, j) =>
                      j === i ? { ...entry, path: e.target.value } : entry
                    ),
                  })
                }
              />
              <select
                className={styles.fontSelect}
                value={mapping.field}
                onChange={(e) =>
                  onChange({
                    mappings: accepted.mappings.map((entry, j) =>
                      j === i ? { ...entry, field: e.target.value } : entry
                    ),
                  })
                }
              >
                <option value="">Select a field…</option>
                {fields.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`${styles.idpActionBtn} ${styles.idpActionDanger}`}
                onClick={() =>
                  onChange({ mappings: accepted.mappings.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.addButton}
            onClick={() =>
              onChange({ mappings: [...(accepted.mappings ?? []), { path: "", field: "" }] })
            }
          >
            Add mapping
          </button>
        </div>
      )}
    </div>
  );
};

export default VcOnboardingSettings;
