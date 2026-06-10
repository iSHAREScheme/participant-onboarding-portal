import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NextPage } from "next";
import styles from "../styles/Settings.module.css";
import AdminRoute from "components/AdminRoute";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import API from "api/client";
import dynamic from "next/dynamic";
import { sanitizeRichText } from "util/sanitizeHtml";
import {
  THEME_COLOR_TOKENS,
  THEME_COLOR_GROUPS,
  brandThemeColors,
  applyThemeColors,
  isValidHex,
  normalizeThemeColors,
  parseSavedThemes,
  ThemeColorKey,
  ThemeColors,
  SavedTheme,
} from "config/themeTokens";
import {
  FONT_OPTIONS,
  applyThemeFonts,
  brandFonts,
  isFontKey,
  ThemeFontField,
} from "config/fonts";

// The WYSIWYG editor relies on contentEditable, so load it client-side only.
const RichTextEditor = dynamic(() => import("components/RichTextEditor"), {
  ssr: false,
  loading: () => <div className={styles.editorLoading} />,
});

type ConnStatus = "checking" | "connected" | "disconnected";
type Notice = { kind: "success" | "error"; text: string } | null;
type TabKey = "general" | "theme";

const Settings: NextPage = () => {
  const { t } = useLanguage();
  const { updateLogo } = useSettings();
  const api = useMemo(() => new API(), []);

  // Tabs + theme editor
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [themeColors, setThemeColors] = useState<Record<ThemeColorKey, string>>(
    () => brandThemeColors()
  );
  const [themeFonts, setThemeFonts] = useState<{
    fontHeading: string;
    fontBody: string;
  }>(() => brandFonts());
  // Named-theme library: saved themes, which one is published (active), and the
  // theme currently loaded in the editor plus its (editable) name.
  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]);
  const [activeThemeName, setActiveThemeName] = useState<string>("");
  const [selectedThemeName, setSelectedThemeName] = useState<string>("");
  const [themeName, setThemeName] = useState<string>("");

  // Branding
  const [description, setDescription] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [faviconPreview, setFaviconPreview] = useState("");
  // Registry
  const [registrarId, setRegistrarId] = useState("");
  const [dataspaceId, setDataspaceId] = useState("");
  const [hideCapabilitiesUrl, setHideCapabilitiesUrl] = useState(false);
  // Agreements
  const [agreements, setAgreements] = useState<string[]>([]);
  const [newAgreement, setNewAgreement] = useState("");
  // iSHARE connection
  const [version, setVersion] = useState("");
  const [claimModel, setClaimModel] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("checking");
  // Resolved connection details (for display) + editable non-secret overrides.
  const [conn, setConn] = useState<Record<string, any>>({});
  const [sat, setSat] = useState({
    satelliteBaseUrl: "",
    satelliteIss: "",
    satelliteAud: "",
    satelliteVersion: "",
    satelliteEpCreationEndpoint: "",
    satellitePartiesEndpoint: "",
    satelliteTokenEndpoint: "",
    satelliteTokenScope: "",
    dataspaceTitle: "",
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; error?: string; version?: string } | null
  >(null);
  // Dataspaces fetched from the Participant Registry (for the selector).
  const [dataspaces, setDataspaces] = useState<
    Array<{ id: string; title?: string }>
  >([]);
  // Save / upload feedback
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((kind: "success" | "error", text: string) => {
    setNotice({ kind, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (kind === "success") {
      noticeTimer.current = setTimeout(() => setNotice(null), 3500);
    }
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.fetchSettings();
      const data = res.data || {};
      setDescription(data.description || "");
      setRegistrarId(data.registrarId || "");
      setDataspaceId(data.dataspaceId || "");
      setAgreements(Array.isArray(data.agreements) ? data.agreements : []);
      setHideCapabilitiesUrl(Boolean(data.hideCapabilitiesUrl));
      // Seed the theme editor from saved overrides, falling back to brand.
      const savedTheme: Record<string, any> =
        data && typeof data.theme === "object" && data.theme ? data.theme : {};
      const merged = brandThemeColors();
      (Object.keys(merged) as ThemeColorKey[]).forEach((k) => {
        if (isValidHex(savedTheme[k])) merged[k] = savedTheme[k] as string;
      });
      setThemeColors(merged);
      const fallbackFonts = brandFonts();
      setThemeFonts({
        fontHeading: isFontKey(savedTheme.fontHeading)
          ? savedTheme.fontHeading
          : fallbackFonts.fontHeading,
        fontBody: isFontKey(savedTheme.fontBody)
          ? savedTheme.fontBody
          : fallbackFonts.fontBody,
      });
      // Load the saved theme library + which theme is currently published live.
      const library = parseSavedThemes(data.themes);
      const active = typeof data.activeTheme === "string" ? data.activeTheme : "";
      setSavedThemes(library);
      setActiveThemeName(active);
      setSelectedThemeName(active);
      setThemeName(active);
      if (data.logoPath) {
        const logoRes = await api.fetchLogo();
        setImagePreview(URL.createObjectURL(logoRes.data));
      }
      if (data.faviconPath) {
        setFaviconPreview(`/api/backend/settings/favicon?t=${Date.now()}`);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  }, [api]);

  // Version is the configured/auto-detected framework; the /registry call is a
  // real request to the satellite, so its success is an honest "connected" signal.
  const checkStatus = useCallback(async () => {
    setConnStatus("checking");
    try {
      const res = await api.fetchConnection();
      const d = res.data || {};
      setConn(d);
      setVersion((d.version ?? "").toString());
      setClaimModel(Boolean(d.claimModel));
      setSat({
        satelliteBaseUrl: d.baseUrl || "",
        satelliteIss: d.iss || "",
        satelliteAud: d.aud || "",
        satelliteVersion: d.version || "",
        satelliteEpCreationEndpoint: d.epCreationEndpoint || "",
        satellitePartiesEndpoint: d.partiesEndpoint || "",
        satelliteTokenEndpoint: d.tokenEndpoint || "",
        satelliteTokenScope: d.tokenScope || "",
        dataspaceTitle: d.dataspaceTitle || "",
      });
    } catch (e) {
      setVersion("");
    }
    try {
      await api.fetchRegistry();
      setConnStatus("connected");
    } catch (e) {
      setConnStatus("disconnected");
    }
    // Load the registry's dataspaces for the selector (tolerant of failure).
    try {
      const dsRes = await api.fetchDataspaces();
      setDataspaces(
        Array.isArray(dsRes.data?.dataspaces) ? dsRes.data.dataspaces : []
      );
    } catch (e) {
      setDataspaces([]);
    }
  }, [api]);

  // Real connectivity test: owner-token exchange + version probe on the satellite.
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection();
      const d = res.data || {};
      setTestResult({ ok: Boolean(d.ok), error: d.error, version: d.version });
      if (d.ok) {
        setConnStatus("connected");
        if (d.version) {
          setVersion(String(d.version));
          setClaimModel(Boolean(d.claimModel));
        }
      } else {
        setConnStatus("disconnected");
      }
    } catch (e: any) {
      setTestResult({
        ok: false,
        error: e?.response?.data?.error || e?.message,
      });
      setConnStatus("disconnected");
    } finally {
      setTesting(false);
    }
  };

  // AdminRoute calls this once the admin is authorized (token is ready).
  const onAuthorized = useCallback(() => {
    loadSettings();
    checkStatus();
  }, [loadSettings, checkStatus]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("logo", file);
    try {
      await api.uploadLogo(formData);
      setImagePreview(URL.createObjectURL(file));
      await updateLogo(); // refresh the header logo
      flash("success", t("settings.messages.saveSuccess"));
    } catch (err) {
      flash("error", t("settings.messages.uploadFailed"));
    }
  };

  const handleFaviconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("favicon", file);
    try {
      await api.uploadFavicon(formData);
      setFaviconPreview(URL.createObjectURL(file));
      await updateLogo(); // re-fetches settings → swaps the browser-tab icon
      flash("success", t("settings.messages.saveSuccess"));
    } catch (err) {
      flash("error", t("settings.messages.uploadFailed"));
    }
  };

  const handleAddAgreement = () => {
    const value = newAgreement.trim();
    if (!value) return;
    setAgreements((prev) => [...prev, value]);
    setNewAgreement("");
  };

  const handleRemoveAgreement = (index: number) => {
    setAgreements((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.patchSettings({
        description: sanitizeRichText(description),
        registrarId,
        dataspaceId,
        agreements,
        hideCapabilitiesUrl,
        ...sat,
      });
      flash("success", t("settings.messages.saveSuccess"));
      // Reflect the now-applied satellite overrides (resolved values + status).
      void checkStatus();
    } catch (err) {
      flash("error", t("settings.messages.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  // --- Theme tab ---------------------------------------------------------
  const handleColorChange = (key: ThemeColorKey, value: string) => {
    setThemeColors((prev) => ({ ...prev, [key]: value }));
    if (isValidHex(value)) applyThemeColors({ [key]: value } as ThemeColors);
  };

  const handleFontChange = (field: ThemeFontField, key: string) => {
    setThemeFonts((prev) => {
      const next = { ...prev, [field]: key };
      applyThemeFonts(next);
      return next;
    });
  };

  const handleResetTheme = () => {
    const defaultColors = brandThemeColors();
    const defaultFonts = brandFonts();
    setThemeColors(defaultColors);
    setThemeFonts(defaultFonts);
    applyThemeColors(defaultColors);
    applyThemeFonts(defaultFonts);
    flash("success", t("settings.theme.messages.resetDone"));
  };

  // --- Named themes (library) -------------------------------------------
  // Insert or overwrite a theme in the library, matched by name.
  const upsertTheme = (list: SavedTheme[], theme: SavedTheme): SavedTheme[] => {
    const idx = list.findIndex((x) => x.name === theme.name);
    if (idx === -1) return [...list, theme];
    const next = list.slice();
    next[idx] = theme;
    return next;
  };

  // The editor's current values as a SavedTheme (without a name).
  const editorTheme = (name: string): SavedTheme => ({
    name,
    colors: { ...themeColors },
    fontHeading: themeFonts.fontHeading,
    fontBody: themeFonts.fontBody,
  });

  // True when the editor currently holds the untouched brand defaults.
  const editorIsBrandDefault = (): boolean => {
    const c = brandThemeColors();
    const f = brandFonts();
    const sameColors = (Object.keys(c) as ThemeColorKey[]).every(
      (k) => (themeColors[k] || "").toLowerCase() === c[k].toLowerCase()
    );
    return (
      sameColors &&
      themeFonts.fontHeading === f.fontHeading &&
      themeFonts.fontBody === f.fontBody
    );
  };

  // Load a theme ("" = brand default, else a saved name) into the editor + preview.
  const handleSelectTheme = (name: string) => {
    setSelectedThemeName(name);
    setThemeName(name);
    let colors = brandThemeColors();
    let fonts = brandFonts();
    if (name) {
      const found = savedThemes.find((x) => x.name === name);
      if (found) {
        colors = normalizeThemeColors(found.colors);
        fonts = {
          fontHeading: isFontKey(found.fontHeading)
            ? found.fontHeading
            : fonts.fontHeading,
          fontBody: isFontKey(found.fontBody) ? found.fontBody : fonts.fontBody,
        };
      }
    }
    setThemeColors(colors);
    setThemeFonts(fonts);
    applyThemeColors(colors);
    applyThemeFonts(fonts);
  };

  // Save the current editor values into the library (a draft) — does NOT go live.
  const handleSaveTheme = async () => {
    const name = themeName.trim();
    if (!name) {
      flash("error", t("settings.theme.library.nameRequired"));
      return;
    }
    setIsSaving(true);
    try {
      const next = upsertTheme(savedThemes, editorTheme(name));
      await api.patchSettings({ themes: next });
      setSavedThemes(next);
      setSelectedThemeName(name);
      flash("success", t("settings.theme.library.savedToast"));
    } catch (err) {
      flash("error", t("settings.messages.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  // Publish the current editor theme to all visitors (and save it, if named).
  const handleApplyTheme = async () => {
    const name = themeName.trim();
    if (!name && !editorIsBrandDefault()) {
      // A customised theme must be named before it can be published.
      flash("error", t("settings.theme.library.nameRequired"));
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        theme: { ...themeColors, ...themeFonts },
        activeTheme: name,
      };
      let nextLibrary = savedThemes;
      if (name) {
        nextLibrary = upsertTheme(savedThemes, editorTheme(name));
        payload.themes = nextLibrary;
      }
      await api.patchSettings(payload);
      setSavedThemes(nextLibrary);
      setActiveThemeName(name);
      setSelectedThemeName(name);
      applyThemeColors(themeColors);
      applyThemeFonts(themeFonts);
      flash("success", t("settings.theme.library.appliedToast"));
    } catch (err) {
      flash("error", t("settings.messages.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  // Remove a saved theme from the library (the live one cannot be deleted).
  const handleDeleteTheme = async () => {
    const name = selectedThemeName;
    if (!name) return;
    if (name === activeThemeName) {
      flash("error", t("settings.theme.library.deleteActiveBlocked"));
      return;
    }
    setIsSaving(true);
    try {
      const next = savedThemes.filter((x) => x.name !== name);
      await api.patchSettings({ themes: next });
      setSavedThemes(next);
      handleSelectTheme(activeThemeName);
      flash("success", t("settings.theme.library.deletedToast"));
    } catch (err) {
      flash("error", t("settings.messages.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  // The native colour input requires a 6-digit hex; expand/normalise for it and
  // fall back to the token's brand default while the text field is mid-edit.
  const toSwatch = (value: string | undefined, fallback: string): string => {
    if (!isValidHex(value)) return fallback;
    const hex = value.trim();
    if (hex.length === 4) {
      return (
        "#" +
        hex
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      );
    }
    return hex;
  };

  return (
    <AdminRoute fetchData={onAuthorized}>
      <div className={styles.container}>
        <div className={styles.headerSection}>
          <div>
            <h1 className={styles.title}>{t("settings.title")}</h1>
            <p className={styles.subtitle}>{t("settings.subtitle")}</p>
          </div>
          {activeTab !== "theme" && (
            <button
              className={styles.saveButton}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving
                ? t("settings.actions.saving")
                : t("settings.actions.save")}
            </button>
          )}
        </div>

        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "general"}
            className={`${styles.tab} ${
              activeTab === "general" ? styles.tabActive : ""
            }`}
            onClick={() => setActiveTab("general")}
          >
            {t("settings.tabs.general")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "theme"}
            className={`${styles.tab} ${
              activeTab === "theme" ? styles.tabActive : ""
            }`}
            onClick={() => setActiveTab("theme")}
          >
            {t("settings.tabs.theme")}
          </button>
        </div>

        <div className={styles.content}>
          {notice && (
            <div
              className={`${styles.notice} ${
                notice.kind === "success" ? styles.noticeSuccess : styles.noticeError
              }`}
              role="status"
            >
              {notice.text}
            </div>
          )}

          {activeTab === "general" && (
          <>
          {/* iSHARE connection */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{t("settings.sections.system")}</h2>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={handleTest}
                disabled={testing}
              >
                {testing
                  ? t("settings.connection.testing")
                  : t("settings.connection.test")}
              </button>
            </div>
            <p className={styles.cardHint}>{t("settings.system.description")}</p>
            <div className={styles.statusGrid}>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>
                  {t("settings.system.version")}
                </span>
                <span className={styles.statusValue}>
                  {version || t("settings.system.unknown")}
                  {version && (
                    <span className={styles.badge}>
                      {claimModel
                        ? t("settings.system.claimModel")
                        : t("settings.system.partyModel")}
                    </span>
                  )}
                </span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>
                  {t("settings.system.connection")}
                </span>
                <span className={`${styles.statusPill} ${styles[connStatus]}`}>
                  <span className={styles.dot} aria-hidden="true" />
                  {t(`settings.system.${connStatus}`)}
                </span>
              </div>
              <div className={styles.statusItem}>
                <span className={styles.statusLabel}>
                  {t("settings.connection.certificate")}
                </span>
                <span className={styles.statusValue}>
                  {conn.certificateConfigured
                    ? t("settings.connection.certConfigured")
                    : t("settings.connection.certMissing")}
                </span>
              </div>
            </div>

            {testResult && (
              <div
                className={`${styles.notice} ${
                  testResult.ok ? styles.noticeSuccess : styles.noticeError
                }`}
                role="status"
              >
                {testResult.ok
                  ? t("settings.connection.testOk", {
                      version: testResult.version || version || "",
                    })
                  : t("settings.connection.testFailed", {
                      error: testResult.error || "",
                    })}
              </div>
            )}

            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label htmlFor="satBaseUrl" className={styles.label}>
                  {t("settings.connection.baseUrl")}
                </label>
                <input
                  type="text"
                  id="satBaseUrl"
                  className={styles.input}
                  value={sat.satelliteBaseUrl}
                  placeholder="https://satellite.example.com"
                  onChange={(e) =>
                    setSat({ ...sat, satelliteBaseUrl: e.target.value })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="satIss" className={styles.label}>
                  {t("settings.connection.iss")}
                </label>
                <input
                  type="text"
                  id="satIss"
                  className={styles.input}
                  value={sat.satelliteIss}
                  onChange={(e) =>
                    setSat({ ...sat, satelliteIss: e.target.value })
                  }
                />
              </div>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label htmlFor="satAud" className={styles.label}>
                  {t("settings.connection.aud")}
                </label>
                <input
                  type="text"
                  id="satAud"
                  className={styles.input}
                  value={sat.satelliteAud}
                  onChange={(e) =>
                    setSat({ ...sat, satelliteAud: e.target.value })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="satVersion" className={styles.label}>
                  {t("settings.connection.version")}
                </label>
                <input
                  type="text"
                  id="satVersion"
                  className={styles.input}
                  value={sat.satelliteVersion}
                  placeholder={t("settings.connection.versionPlaceholder")}
                  onChange={(e) =>
                    setSat({ ...sat, satelliteVersion: e.target.value })
                  }
                />
              </div>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label htmlFor="satTokenEp" className={styles.label}>
                  {t("settings.connection.tokenEndpoint")}
                </label>
                <input
                  type="text"
                  id="satTokenEp"
                  className={styles.input}
                  value={sat.satelliteTokenEndpoint}
                  placeholder="/connect/token"
                  onChange={(e) =>
                    setSat({ ...sat, satelliteTokenEndpoint: e.target.value })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="satScope" className={styles.label}>
                  {t("settings.connection.tokenScope")}
                </label>
                <input
                  type="text"
                  id="satScope"
                  className={styles.input}
                  value={sat.satelliteTokenScope}
                  placeholder="iSHARE"
                  onChange={(e) =>
                    setSat({ ...sat, satelliteTokenScope: e.target.value })
                  }
                />
              </div>
            </div>

            <div className={styles.fieldRow}>
              <div className={styles.formGroup}>
                <label htmlFor="satEpCreate" className={styles.label}>
                  {t("settings.connection.epCreationEndpoint")}
                </label>
                <input
                  type="text"
                  id="satEpCreate"
                  className={styles.input}
                  value={sat.satelliteEpCreationEndpoint}
                  placeholder="/ep_creation"
                  onChange={(e) =>
                    setSat({
                      ...sat,
                      satelliteEpCreationEndpoint: e.target.value,
                    })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="satParties" className={styles.label}>
                  {t("settings.connection.partiesEndpoint")}
                </label>
                <input
                  type="text"
                  id="satParties"
                  className={styles.input}
                  value={sat.satellitePartiesEndpoint}
                  placeholder="/parties"
                  onChange={(e) =>
                    setSat({ ...sat, satellitePartiesEndpoint: e.target.value })
                  }
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="registrarId" className={styles.label}>
                {t("settings.labels.registrarId")}
              </label>
              <input
                type="text"
                id="registrarId"
                value={registrarId}
                onChange={(e) => setRegistrarId(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="dataspaceSelect" className={styles.label}>
                {t("settings.connection.dataspaceSelect")}
              </label>
              <select
                id="dataspaceSelect"
                className={styles.fontSelect}
                value={dataspaceId}
                onChange={(e) => {
                  const id = e.target.value;
                  const ds = dataspaces.find((d) => d.id === id);
                  setDataspaceId(id);
                  setSat((s) => ({ ...s, dataspaceTitle: ds?.title || "" }));
                }}
              >
                <option value="">
                  {dataspaces.length
                    ? t("settings.connection.dataspacePlaceholder")
                    : t("settings.connection.dataspacesEmpty")}
                </option>
                {dataspaces.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title ? `${d.title} (${d.id})` : d.id}
                  </option>
                ))}
              </select>
            </div>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={hideCapabilitiesUrl}
                onChange={(e) => setHideCapabilitiesUrl(e.target.checked)}
              />
              {t("settings.labels.hideCapabilitiesUrl")}
            </label>
            <p className={styles.helperText}>
              {t("settings.labels.hideCapabilitiesUrlHint")}
            </p>

            <p className={styles.helperText}>
              {t("settings.connection.credentialsNote")}
            </p>
          </section>

          {/* Introduction text */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("settings.sections.introText")}</h2>
            <div className={styles.formGroup}>
              <label htmlFor="description" className={styles.label}>
                {t("settings.labels.introText")}
              </label>
              <RichTextEditor value={description} onChange={setDescription} />
            </div>
          </section>

          {/* Agreements */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("settings.labels.agreements")}</h2>
            {agreements.length > 0 && (
              <ul className={styles.list}>
                {agreements.map((item, idx) => (
                  <li key={idx} className={styles.listItem}>
                    <span className={styles.listItemText} title={item}>
                      {item}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveAgreement(idx)}
                      className={styles.removeButton}
                      aria-label={t("common.delete")}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.agreementInputWrapper}>
              <input
                type="text"
                id="agreements"
                value={newAgreement}
                onChange={(e) => setNewAgreement(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddAgreement();
                  }
                }}
                className={styles.input}
              />
              <button
                type="button"
                onClick={handleAddAgreement}
                className={styles.addButton}
              >
                {t("settings.actions.add")}
              </button>
            </div>
          </section>
          </>
          )}

          {activeTab === "theme" && (
            <>
            {/* Logo & favicon */}
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>{t("settings.theme.logo")}</h2>
              <div className={styles.formGroup}>
                <label htmlFor="image" className={styles.label}>
                  {t("settings.labels.headerImage")}
                </label>
                <p className={styles.helperText}>{t("settings.theme.logoHint")}</p>
                <div className={styles.logoRow}>
                  {imagePreview && (
                    <div className={styles.imagePreview}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imagePreview}
                        alt={t("settings.labels.headerImage")}
                        className={styles.previewImg}
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    id="image"
                    accept="image/*"
                    onChange={handleImageChange}
                    className={styles.fileInput}
                  />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="favicon" className={styles.label}>
                  {t("settings.theme.favicon")}
                </label>
                <p className={styles.helperText}>{t("settings.theme.faviconHint")}</p>
                <div className={styles.logoRow}>
                  {faviconPreview && (
                    <div className={styles.faviconPreview}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={faviconPreview}
                        alt={t("settings.theme.favicon")}
                        className={styles.previewImg}
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    id="favicon"
                    accept=".ico,.png,.svg,image/png,image/svg+xml,image/x-icon"
                    onChange={handleFaviconChange}
                    className={styles.fileInput}
                  />
                </div>
              </div>
            </section>

            {/* Colours & fonts */}
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t("settings.theme.title")}</h2>
                <button
                  type="button"
                  className={styles.ghostButton}
                  onClick={handleResetTheme}
                >
                  {t("settings.theme.actions.reset")}
                </button>
              </div>
              <p className={styles.cardHint}>{t("settings.theme.description")}</p>

              {/* Theme library: select / name / save (draft) / apply (publish) / delete */}
              <div className={styles.themeLibrary}>
                <div className={styles.themeLibraryRow}>
                  <div className={styles.colorField}>
                    <label htmlFor="theme-select" className={styles.colorLabel}>
                      {t("settings.theme.library.selectLabel")}
                    </label>
                    <select
                      id="theme-select"
                      className={styles.fontSelect}
                      value={selectedThemeName}
                      onChange={(e) => handleSelectTheme(e.target.value)}
                    >
                      <option value="">
                        {t("settings.theme.library.brandDefault")}
                      </option>
                      {savedThemes.map((th) => (
                        <option key={th.name} value={th.name}>
                          {th.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.colorField}>
                    <label htmlFor="theme-name" className={styles.colorLabel}>
                      {t("settings.theme.library.nameLabel")}
                    </label>
                    <input
                      id="theme-name"
                      type="text"
                      className={styles.themeNameInput}
                      value={themeName}
                      placeholder={t("settings.theme.library.namePlaceholder")}
                      spellCheck={false}
                      onChange={(e) => setThemeName(e.target.value)}
                    />
                  </div>
                </div>
                <p className={styles.libraryHint}>
                  {t("settings.theme.library.hint")}
                </p>
                <div className={styles.themeLibraryActions}>
                  <span className={styles.activeThemeBadge}>
                    {t("settings.theme.library.currentlyLive", {
                      name:
                        activeThemeName ||
                        t("settings.theme.library.brandDefault"),
                    })}
                  </span>
                  <div className={styles.themeLibraryButtons}>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={handleDeleteTheme}
                      disabled={
                        isSaving ||
                        !selectedThemeName ||
                        selectedThemeName === activeThemeName
                      }
                    >
                      {t("settings.theme.library.delete")}
                    </button>
                    <button
                      type="button"
                      className={styles.ghostButton}
                      onClick={handleSaveTheme}
                      disabled={isSaving}
                    >
                      {t("settings.theme.library.save")}
                    </button>
                    <button
                      type="button"
                      className={styles.applyButton}
                      onClick={handleApplyTheme}
                      disabled={isSaving}
                    >
                      {t("settings.theme.library.apply")}
                    </button>
                  </div>
                </div>
              </div>

              {/* Typography */}
              <div className={styles.colorGroup}>
                <h3 className={styles.colorGroupTitle}>
                  {t("settings.theme.groups.typography")}
                </h3>
                <div className={styles.colorGrid}>
                  <div className={styles.colorField}>
                    <label htmlFor="font-heading" className={styles.colorLabel}>
                      {t("settings.theme.fonts.heading")}
                    </label>
                    <select
                      id="font-heading"
                      className={styles.fontSelect}
                      value={themeFonts.fontHeading}
                      onChange={(e) =>
                        handleFontChange("fontHeading", e.target.value)
                      }
                    >
                      {FONT_OPTIONS.map((o) => (
                        <option
                          key={o.key}
                          value={o.key}
                          style={{ fontFamily: o.stack }}
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.colorField}>
                    <label htmlFor="font-body" className={styles.colorLabel}>
                      {t("settings.theme.fonts.body")}
                    </label>
                    <select
                      id="font-body"
                      className={styles.fontSelect}
                      value={themeFonts.fontBody}
                      onChange={(e) => handleFontChange("fontBody", e.target.value)}
                    >
                      {FONT_OPTIONS.map((o) => (
                        <option
                          key={o.key}
                          value={o.key}
                          style={{ fontFamily: o.stack }}
                        >
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {THEME_COLOR_GROUPS.map((group) => (
                <div key={group} className={styles.colorGroup}>
                  <h3 className={styles.colorGroupTitle}>
                    {t(`settings.theme.groups.${group}`)}
                  </h3>
                  <div className={styles.colorGrid}>
                    {THEME_COLOR_TOKENS.filter((tok) => tok.group === group).map(
                      (tok) => (
                        <div key={tok.key} className={styles.colorField}>
                          <label
                            htmlFor={`color-${tok.key}`}
                            className={styles.colorLabel}
                          >
                            {t(`settings.theme.tokens.${tok.key}`)}
                          </label>
                          <div className={styles.colorInputRow}>
                            <input
                              type="color"
                              id={`color-${tok.key}`}
                              className={styles.colorSwatch}
                              value={toSwatch(themeColors[tok.key], tok.brandDefault)}
                              onChange={(e) =>
                                handleColorChange(tok.key, e.target.value)
                              }
                            />
                            <input
                              type="text"
                              className={styles.colorHex}
                              value={themeColors[tok.key] ?? ""}
                              spellCheck={false}
                              aria-label={t(`settings.theme.tokens.${tok.key}`)}
                              onChange={(e) =>
                                handleColorChange(tok.key, e.target.value)
                              }
                            />
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              ))}

              <div className={styles.themePreview}>
                <h3 className={styles.colorGroupTitle}>
                  {t("settings.theme.preview")}
                </h3>
                <div className={styles.previewCard}>
                  <h4 className={styles.previewHeading}>
                    {t("settings.theme.previewHeading")}
                  </h4>
                  <p className={styles.previewBody}>
                    {t("settings.theme.previewBody")}
                  </p>
                  <div className={styles.previewButtons}>
                    <button type="button" className={styles.previewPrimary}>
                      {t("settings.theme.previewPrimaryBtn")}
                    </button>
                    <button type="button" className={styles.previewSecondary}>
                      {t("settings.theme.previewSecondaryBtn")}
                    </button>
                  </div>
                </div>
              </div>
            </section>
            </>
          )}
        </div>
      </div>
    </AdminRoute>
  );
};

export default Settings;
