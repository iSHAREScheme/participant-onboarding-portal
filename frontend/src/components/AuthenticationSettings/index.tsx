import { useState, useCallback, useEffect } from "react";
import API from "api/client";
import { useLanguage } from "../../context/LanguageContext";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";
import styles from "styles/Settings.module.css";

// A Keycloak identity-provider representation (loosely typed: Keycloak emits many
// optional fields and provider-specific config we pass through untouched).
type IdpRep = Record<string, any>;

// One row of an IdP's `config` map in the editor. Secret rows render masked; when
// editing, `wasSet` means a value is stored server-side (blank = keep it).
type ConfigRow = { key: string; value: string; secret: boolean; wasSet: boolean };

// Common providerId values offered in the dropdown. "oidc"/"saml" are the generic
// protocols; the rest are Keycloak's built-in social providers.
const PROVIDER_OPTIONS = [
  "oidc",
  "saml",
  "google",
  "microsoft",
  "github",
  "gitlab",
  "facebook",
  "linkedin-openid-connect",
  "bitbucket",
  "twitter",
  "openshift-v4",
];

const SECRET_RE = /secret|password|privatekey|bindcredential/i;
const isSecretKey = (k: string) => SECRET_RE.test(k);
const str = (v: any) => (v === undefined || v === null ? "" : String(v));

interface IdpEditorState {
  isNew: boolean;
  originalAlias: string;
  alias: string;
  displayName: string;
  providerId: string;
  enabled: boolean;
  trustEmail: boolean;
  config: ConfigRow[];
}

const AuthenticationSettings = () => {
  const { t } = useLanguage();
  const toast = useToast();
  const confirm = useConfirm();
  const flash = useCallback(
    (kind: "success" | "error", text: string) =>
      kind === "success" ? toast.success(text) : toast.error(text),
    [toast]
  );
  const tr = (k: string, vars?: Record<string, string | number>) =>
    t(`settings.auth.${k}`, vars);

  const [api] = useState(() => new API());

  // --- Identity providers ---------------------------------------------------
  const [idps, setIdps] = useState<IdpRep[] | null>(null);
  const [idpError, setIdpError] = useState<string>("");
  const [editor, setEditor] = useState<IdpEditorState | null>(null);
  const [savingIdp, setSavingIdp] = useState(false);

  // Claim mappers for the IdP currently being edited (existing IdPs only).
  const [mappers, setMappers] = useState<any[] | null>(null);
  const [newClaim, setNewClaim] = useState("");
  const [newAttr, setNewAttr] = useState("");
  const [mapperBusy, setMapperBusy] = useState(false);

  const loadIdps = useCallback(async () => {
    setIdpError("");
    try {
      const res = await api.listIdps();
      setIdps(Array.isArray(res.data?.idps) ? res.data.idps : []);
    } catch (e: any) {
      setIdps([]);
      setIdpError(e?.response?.data?.error || tr("idp.loadError"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  useEffect(() => {
    loadIdps();
  }, [loadIdps]);

  const startNewIdp = () =>
    setEditor({
      isNew: true,
      originalAlias: "",
      alias: "",
      displayName: "",
      providerId: "oidc",
      enabled: true,
      trustEmail: true,
      config: [
        { key: "clientId", value: "", secret: false, wasSet: false },
        { key: "clientSecret", value: "", secret: true, wasSet: false },
      ],
    });

  const startEditIdp = (idp: IdpRep) => {
    const cfg = (idp.config && typeof idp.config === "object" ? idp.config : {}) as Record<string, any>;
    const secretFields: string[] = Array.isArray(idp.secretFields) ? idp.secretFields : [];
    const rows: ConfigRow[] = Object.keys(cfg).map((k) => ({
      key: k,
      value: str(cfg[k]),
      secret: isSecretKey(k) || secretFields.includes(k),
      wasSet: secretFields.includes(k),
    }));
    setEditor({
      isNew: false,
      originalAlias: str(idp.alias),
      alias: str(idp.alias),
      displayName: str(idp.displayName),
      providerId: str(idp.providerId) || "oidc",
      enabled: idp.enabled !== false,
      trustEmail: idp.trustEmail === true,
      config: rows,
    });
  };

  const updateConfigRow = (i: number, patch: Partial<ConfigRow>) =>
    setEditor((prev) =>
      prev
        ? { ...prev, config: prev.config.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }
        : prev
    );
  const addConfigRow = () =>
    setEditor((prev) =>
      prev ? { ...prev, config: [...prev.config, { key: "", value: "", secret: false, wasSet: false }] } : prev
    );
  const removeConfigRow = (i: number) =>
    setEditor((prev) => (prev ? { ...prev, config: prev.config.filter((_, idx) => idx !== i) } : prev));

  const saveIdp = async () => {
    if (!editor) return;
    const alias = editor.alias.trim();
    if (!alias || !editor.providerId.trim()) {
      flash("error", tr("idp.aliasProviderRequired"));
      return;
    }
    // Build the config map from non-empty keys. Secret rows left blank are sent as
    // "" so the backend keeps the stored value.
    const config: Record<string, string> = {};
    for (const row of editor.config) {
      const key = row.key.trim();
      if (!key) continue;
      config[key] = row.value;
    }
    const body: Record<string, any> = {
      alias,
      displayName: editor.displayName.trim() || alias,
      providerId: editor.providerId.trim(),
      enabled: editor.enabled,
      trustEmail: editor.trustEmail,
      config,
    };
    setSavingIdp(true);
    try {
      if (editor.isNew) await api.createIdp(body);
      else await api.updateIdp(editor.originalAlias, body);
      flash("success", editor.isNew ? tr("idp.created") : tr("idp.updated"));
      setEditor(null);
      await loadIdps();
    } catch (e: any) {
      flash("error", e?.response?.data?.error || tr("idp.saveFailed"));
    } finally {
      setSavingIdp(false);
    }
  };

  const deleteIdp = async (idp: IdpRep) => {
    const alias = str(idp.alias);
    const ok = await confirm({
      title: tr("idp.deleteTitle"),
      message: tr("idp.deleteConfirm", { alias }),
      confirmLabel: tr("idp.deleteConfirmLabel"),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteIdp(alias);
      flash("success", tr("idp.deleted"));
      if (editor?.originalAlias === alias) setEditor(null);
      await loadIdps();
    } catch (e: any) {
      flash("error", e?.response?.data?.error || tr("idp.deleteFailed"));
    }
  };

  // --- Claim mappers (for the IdP being edited) -----------------------------
  const loadMappers = useCallback(
    async (alias: string) => {
      setMappers(null);
      try {
        const res = await api.listIdpMappers(alias);
        setMappers(Array.isArray(res.data?.mappers) ? res.data.mappers : []);
      } catch {
        setMappers([]);
      }
    },
    [api]
  );

  useEffect(() => {
    if (editor && !editor.isNew) loadMappers(editor.originalAlias);
    else setMappers(null);
    setNewClaim("");
    setNewAttr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor?.originalAlias, editor?.isNew]);

  const addMapper = async () => {
    if (!editor || editor.isNew) return;
    const claim = newClaim.trim();
    const userAttribute = newAttr.trim();
    if (!claim || !userAttribute) {
      flash("error", tr("idp.mappers.required"));
      return;
    }
    setMapperBusy(true);
    try {
      await api.createIdpMapper(editor.originalAlias, { claim, userAttribute });
      setNewClaim("");
      setNewAttr("");
      await loadMappers(editor.originalAlias);
    } catch (e: any) {
      flash("error", e?.response?.data?.error || tr("idp.mappers.addFailed"));
    } finally {
      setMapperBusy(false);
    }
  };

  const removeMapper = async (id: string) => {
    if (!editor || editor.isNew) return;
    setMapperBusy(true);
    try {
      await api.deleteIdpMapper(editor.originalAlias, id);
      await loadMappers(editor.originalAlias);
    } catch (e: any) {
      flash("error", e?.response?.data?.error || tr("idp.mappers.removeFailed"));
    } finally {
      setMapperBusy(false);
    }
  };

  // Maps the claims this portal's backend consumes (legalSubjectId, kvkNumber,
  // companyName, email) to like-named user attributes, skipping any already set.
  const applyPreset = async () => {
    if (!editor || editor.isNew) return;
    const existing = new Set((mappers || []).map((m) => str(m.userAttribute)));
    const preset = [
      { claim: "legalSubjectId", userAttribute: "legalSubjectId" },
      { claim: "kvkNumber", userAttribute: "kvkNumber" },
      { claim: "companyName", userAttribute: "companyName" },
      { claim: "email", userAttribute: "email" },
    ].filter((p) => !existing.has(p.userAttribute));
    if (preset.length === 0) {
      flash("success", tr("idp.mappers.presetNone"));
      return;
    }
    setMapperBusy(true);
    try {
      for (const p of preset) {
        await api.createIdpMapper(editor.originalAlias, p);
      }
      flash("success", tr("idp.mappers.presetDone"));
      await loadMappers(editor.originalAlias);
    } catch (e: any) {
      flash("error", e?.response?.data?.error || tr("idp.mappers.addFailed"));
    } finally {
      setMapperBusy(false);
    }
  };

  // --- SMTP -----------------------------------------------------------------
  const SMTP_TEXT_FIELDS = ["host", "port", "from", "fromDisplayName", "replyTo", "user"] as const;
  type SmtpField = (typeof SMTP_TEXT_FIELDS)[number];
  const [smtp, setSmtp] = useState<Record<string, string>>({});
  const [smtpFlags, setSmtpFlags] = useState({ auth: false, ssl: false, starttls: false });
  const [smtpPassword, setSmtpPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [smtpLoading, setSmtpLoading] = useState(true);
  const [smtpBusy, setSmtpBusy] = useState<"" | "save" | "test">("");
  const [testRecipient, setTestRecipient] = useState("");

  // --- Verifiable credential issuer -----------------------------------------
  // The issuer URL is a general (non-secret) Settings field, not a Keycloak
  // resource — so it loads via GET /settings and saves via the merge-safe POST.
  // The issuer API key (if any) stays env-only and is never edited here.
  const [vcIssuer, setVcIssuer] = useState("");
  const [vcIssuerBusy, setVcIssuerBusy] = useState(false);

  const loadVcIssuer = useCallback(async () => {
    try {
      const res = await api.fetchSettings();
      setVcIssuer(str(res.data?.vcIssuerBaseUrl));
    } catch {
      /* leave blank; the field is still editable */
    }
  }, [api]);

  useEffect(() => {
    loadVcIssuer();
  }, [loadVcIssuer]);

  const saveVcIssuer = async () => {
    setVcIssuerBusy(true);
    try {
      await api.patchSettings({ vcIssuerBaseUrl: vcIssuer.trim() });
      flash("success", tr("vcIssuer.saved"));
    } catch (e: any) {
      flash("error", e?.response?.data?.error || tr("vcIssuer.saveFailed"));
    } finally {
      setVcIssuerBusy(false);
    }
  };

  const loadSmtp = useCallback(async () => {
    setSmtpLoading(true);
    try {
      const res = await api.getSmtp();
      const s = (res.data?.smtp || {}) as Record<string, any>;
      setSmtp({
        host: str(s.host),
        port: str(s.port),
        from: str(s.from),
        fromDisplayName: str(s.fromDisplayName),
        replyTo: str(s.replyTo),
        user: str(s.user),
      });
      setSmtpFlags({
        auth: str(s.auth) === "true",
        ssl: str(s.ssl) === "true",
        starttls: str(s.starttls) === "true",
      });
      setPasswordSet(Boolean(res.data?.passwordSet));
      setSmtpPassword("");
    } catch {
      /* leave blank; the form is still editable */
    } finally {
      setSmtpLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadSmtp();
  }, [loadSmtp]);

  // Assemble the smtpServer map Keycloak expects (string values). A blank password
  // is sent as "" so the backend keeps the stored one.
  const smtpPayload = (): Record<string, string> => {
    const body: Record<string, string> = {
      host: smtp.host?.trim() || "",
      port: smtp.port?.trim() || "",
      from: smtp.from?.trim() || "",
      fromDisplayName: smtp.fromDisplayName?.trim() || "",
      replyTo: smtp.replyTo?.trim() || "",
      ssl: smtpFlags.ssl ? "true" : "false",
      starttls: smtpFlags.starttls ? "true" : "false",
      auth: smtpFlags.auth ? "true" : "false",
    };
    if (smtpFlags.auth) {
      body.user = smtp.user?.trim() || "";
      body.password = smtpPassword; // blank => kept by the backend
    }
    return body;
  };

  const saveSmtp = async () => {
    setSmtpBusy("save");
    try {
      await api.updateSmtp(smtpPayload());
      flash("success", tr("smtp.saved"));
      // Keep the typed password in state so a follow-up "Send test" can reuse it
      // — Keycloak masks the saved password on read, so it can't be fetched back.
      if (smtpFlags.auth && smtpPassword.trim()) setPasswordSet(true);
    } catch (e: any) {
      flash("error", e?.response?.data?.error || tr("smtp.saveFailed"));
    } finally {
      setSmtpBusy("");
    }
  };

  const testSmtp = async () => {
    const to = testRecipient.trim();
    if (!to) {
      flash("error", tr("smtp.recipientRequired"));
      return;
    }
    setSmtpBusy("test");
    try {
      await api.testSmtp({ ...smtpPayload(), to });
      flash("success", tr("smtp.testOk", { to }));
    } catch (e: any) {
      flash("error", e?.response?.data?.error || tr("smtp.testFailed"));
    } finally {
      setSmtpBusy("");
    }
  };

  const providerOptions = editor
    ? PROVIDER_OPTIONS.includes(editor.providerId)
      ? PROVIDER_OPTIONS
      : [editor.providerId, ...PROVIDER_OPTIONS]
    : PROVIDER_OPTIONS;

  return (
    <>
      {/* ---- Connected identity providers ---- */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{tr("idp.title")}</h3>
        </div>
        <p className={styles.cardHint}>{tr("idp.hint")}</p>

        {idpError && <p className={styles.helperText}>{idpError}</p>}

        {idps === null ? (
          <p className={styles.helperText}>{tr("loading")}</p>
        ) : idps.length === 0 ? (
          <p className={styles.helperText}>{tr("idp.empty")}</p>
        ) : (
          <div className={styles.list}>
            {idps.map((idp) => (
              <div className={styles.idpRow} key={str(idp.alias)}>
                <div className={styles.idpMain}>
                  <span className={styles.idpName}>
                    {str(idp.displayName) || str(idp.alias)}
                  </span>
                  <span className={styles.idpMeta}>
                    <span className={styles.idpType}>{str(idp.providerId)}</span>
                    <code className={styles.idpAlias}>{str(idp.alias)}</code>
                    <span
                      className={
                        idp.enabled === false ? styles.idpStatusOff : styles.idpStatusOn
                      }
                    >
                      {idp.enabled === false ? tr("idp.disabled") : tr("idp.enabled")}
                    </span>
                  </span>
                </div>
                <div className={styles.idpActions}>
                  <button
                    type="button"
                    className={styles.idpActionBtn}
                    onClick={() => startEditIdp(idp)}
                  >
                    {tr("idp.edit")}
                  </button>
                  <button
                    type="button"
                    className={`${styles.idpActionBtn} ${styles.idpActionDanger}`}
                    onClick={() => deleteIdp(idp)}
                  >
                    {tr("idp.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!editor && (
          <button type="button" className={styles.addButton} onClick={startNewIdp}>
            + {tr("idp.add")}
          </button>
        )}

        {editor && (
          <div className={styles.idpEditor}>
            <h4 className={styles.cardTitle}>
              {editor.isNew ? tr("idp.addTitle") : tr("idp.editTitle", { alias: editor.originalAlias })}
            </h4>
            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>{tr("idp.alias")}</label>
                <input
                  className={styles.input}
                  value={editor.alias}
                  disabled={!editor.isNew}
                  onChange={(e) => setEditor({ ...editor, alias: e.target.value })}
                  placeholder="e.g. eherkenning"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>{tr("idp.displayName")}</label>
                <input
                  className={styles.input}
                  value={editor.displayName}
                  onChange={(e) => setEditor({ ...editor, displayName: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>{tr("idp.providerId")}</label>
                <select
                  className={styles.input}
                  value={editor.providerId}
                  disabled={!editor.isNew}
                  onChange={(e) => setEditor({ ...editor, providerId: e.target.value })}
                >
                  {providerOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editor.enabled}
                    onChange={(e) => setEditor({ ...editor, enabled: e.target.checked })}
                  />
                  {tr("idp.enabledLabel")}
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={editor.trustEmail}
                    onChange={(e) => setEditor({ ...editor, trustEmail: e.target.checked })}
                  />
                  {tr("idp.trustEmail")}
                </label>
              </div>
            </div>

            <label className={styles.label}>{tr("idp.config")}</label>
            <p className={styles.helperText}>{tr("idp.configHint")}</p>
            {editor.config.map((row, i) => (
              <div className={styles.configRow} key={i}>
                <input
                  className={styles.input}
                  value={row.key}
                  placeholder={tr("idp.configKey")}
                  onChange={(e) => updateConfigRow(i, { key: e.target.value, secret: isSecretKey(e.target.value) || row.secret })}
                />
                <input
                  className={styles.input}
                  type={row.secret ? "password" : "text"}
                  value={row.value}
                  placeholder={row.secret && row.wasSet ? tr("secretKept") : tr("idp.configValue")}
                  onChange={(e) => updateConfigRow(i, { value: e.target.value })}
                />
                <button type="button" className={styles.removeButton} onClick={() => removeConfigRow(i)}>
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className={styles.ghostButton} onClick={addConfigRow}>
              + {tr("idp.addField")}
            </button>

            {/* Claim mappers (external claim -> Keycloak user attribute) */}
            {editor.isNew ? (
              <p className={styles.helperText} style={{ marginTop: "1rem" }}>
                {tr("idp.mappers.saveFirst")}
              </p>
            ) : (
              <div className={styles.mapperSection}>
                <label className={styles.label}>{tr("idp.mappers.title")}</label>
                <p className={styles.cardHint}>{tr("idp.mappers.hint")}</p>
                {mappers === null ? (
                  <p className={styles.helperText}>{tr("loading")}</p>
                ) : mappers.length === 0 ? (
                  <p className={styles.helperText}>{tr("idp.mappers.empty")}</p>
                ) : (
                  <div className={styles.list}>
                    {mappers.map((m) => (
                      <div className={styles.mapperRow} key={str(m.id)}>
                        <code className={styles.idpAlias}>{str(m.claim) || "—"}</code>
                        <span className={styles.mapperArrow}>→</span>
                        <code className={styles.idpAlias}>{str(m.userAttribute) || "—"}</code>
                        <button
                          type="button"
                          className={`${styles.idpActionBtn} ${styles.idpActionDanger}`}
                          onClick={() => removeMapper(str(m.id))}
                          disabled={mapperBusy}
                        >
                          {tr("idp.mappers.remove")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.configRow}>
                  <input
                    className={styles.input}
                    value={newClaim}
                    placeholder={tr("idp.mappers.claimPlaceholder")}
                    onChange={(e) => setNewClaim(e.target.value)}
                  />
                  <input
                    className={styles.input}
                    value={newAttr}
                    placeholder={tr("idp.mappers.attrPlaceholder")}
                    onChange={(e) => setNewAttr(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.ghostButton}
                    onClick={addMapper}
                    disabled={mapperBusy}
                  >
                    + {tr("idp.mappers.add")}
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={applyPreset}
                  disabled={mapperBusy}
                >
                  {tr("idp.mappers.preset")}
                </button>
              </div>
            )}

            <div className={styles.editorActions}>
              <button type="button" className={styles.saveButton} onClick={saveIdp} disabled={savingIdp}>
                {savingIdp ? tr("saving") : tr("save")}
              </button>
              <button type="button" className={styles.ghostButton} onClick={() => setEditor(null)}>
                {tr("cancel")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---- SMTP ---- */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{tr("smtp.title")}</h3>
        </div>
        <p className={styles.cardHint}>{tr("smtp.hint")}</p>

        {smtpLoading ? (
          <p className={styles.helperText}>{tr("loading")}</p>
        ) : (
          <>
            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>{tr("smtp.host")}</label>
                <input
                  className={styles.input}
                  value={smtp.host || ""}
                  onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>{tr("smtp.port")}</label>
                <input
                  className={styles.input}
                  value={smtp.port || ""}
                  onChange={(e) => setSmtp({ ...smtp, port: e.target.value })}
                  placeholder="587"
                />
              </div>
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>{tr("smtp.from")}</label>
                <input
                  className={styles.input}
                  value={smtp.from || ""}
                  onChange={(e) => setSmtp({ ...smtp, from: e.target.value })}
                  placeholder="no-reply@example.com"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>{tr("smtp.fromDisplayName")}</label>
                <input
                  className={styles.input}
                  value={smtp.fromDisplayName || ""}
                  onChange={(e) => setSmtp({ ...smtp, fromDisplayName: e.target.value })}
                />
              </div>
            </div>
            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>{tr("smtp.replyTo")}</label>
                <input
                  className={styles.input}
                  value={smtp.replyTo || ""}
                  onChange={(e) => setSmtp({ ...smtp, replyTo: e.target.value })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={smtpFlags.ssl}
                    onChange={(e) => setSmtpFlags({ ...smtpFlags, ssl: e.target.checked })}
                  />
                  {tr("smtp.ssl")}
                </label>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={smtpFlags.starttls}
                    onChange={(e) => setSmtpFlags({ ...smtpFlags, starttls: e.target.checked })}
                  />
                  {tr("smtp.starttls")}
                </label>
              </div>
            </div>

            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={smtpFlags.auth}
                onChange={(e) => setSmtpFlags({ ...smtpFlags, auth: e.target.checked })}
              />
              {tr("smtp.auth")}
            </label>

            {smtpFlags.auth && (
              <div className={styles.fieldRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{tr("smtp.user")}</label>
                  <input
                    className={styles.input}
                    value={smtp.user || ""}
                    onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                    autoComplete="off"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>{tr("smtp.password")}</label>
                  <input
                    className={styles.input}
                    type="password"
                    value={smtpPassword}
                    placeholder={passwordSet ? tr("secretKept") : ""}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.label}>{tr("smtp.testTo")}</label>
              <input
                className={styles.input}
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder={tr("smtp.testToPlaceholder")}
              />
              <p className={styles.helperText}>{tr("smtp.testToHint")}</p>
            </div>

            <div className={styles.editorActions}>
              <button type="button" className={styles.saveButton} onClick={saveSmtp} disabled={smtpBusy !== ""}>
                {smtpBusy === "save" ? tr("saving") : tr("save")}
              </button>
              <button type="button" className={styles.ghostButton} onClick={testSmtp} disabled={smtpBusy !== ""}>
                {smtpBusy === "test" ? tr("smtp.testing") : tr("smtp.test")}
              </button>
            </div>
          </>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>{tr("vcIssuer.title")}</h3>
        </div>
        <p className={styles.cardHint}>{tr("vcIssuer.hint")}</p>
        <div className={styles.formGroup}>
          <label className={styles.label}>{tr("vcIssuer.urlLabel")}</label>
          <input
            className={styles.input}
            type="url"
            value={vcIssuer}
            onChange={(e) => setVcIssuer(e.target.value)}
            placeholder={tr("vcIssuer.urlPlaceholder")}
            autoComplete="off"
          />
          <p className={styles.helperText}>{tr("vcIssuer.urlHint")}</p>
        </div>
        <div className={styles.editorActions}>
          <button type="button" className={styles.saveButton} onClick={saveVcIssuer} disabled={vcIssuerBusy}>
            {vcIssuerBusy ? tr("saving") : tr("save")}
          </button>
        </div>
      </div>
    </>
  );
};

export default AuthenticationSettings;
