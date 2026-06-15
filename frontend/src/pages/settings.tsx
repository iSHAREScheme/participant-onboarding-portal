import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NextPage } from "next";
import styles from "../styles/Settings.module.css";
import AdminRoute from "components/AdminRoute";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import { useToast } from "../context/ToastContext";
import API, {
  AgreementView,
  AgreementAuthMethod,
  AgreementUrlInput,
  AgreementClaimType,
} from "api/client";
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
type TabKey = "general" | "theme";

// Draft state for the "add URL agreement" auth form. Secret fields are plain
// strings here; they are sent to the backend (which encrypts them) and never
// read back — the redacted view only reports whether a secret is set.
type AgreementAuthDraft = {
  method: AgreementAuthMethod;
  username?: string;
  password?: string;
  headerName?: string;
  scheme?: string;
  token?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  headers: { name: string; value: string; secret: boolean }[];
};

// Upload glyph (lucide "upload"), inherits the button's text colour.
const UploadIcon = () => (
  <svg
    className={styles.uploadIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

// A styled file picker: a pill button (matching the portal's buttons) with an
// upload icon, wrapping a visually-hidden native input so the picker looks
// consistent everywhere instead of the browser's default file control.
function UploadField({
  id,
  accept,
  label,
  onChange,
  inputRef,
}: {
  id?: string;
  accept: string;
  label: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className={styles.uploadButton}>
      <UploadIcon />
      <span>{label}</span>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={onChange}
        className={styles.uploadInput}
      />
    </label>
  );
}

// Faint media placeholder shown in an empty logo/favicon preview slot.
const ImagePlaceholderIcon = () => (
  <svg
    className={styles.mediaPlaceholderIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="1.6" />
    <path d="m21 15-4.5-4.5L7 20" />
  </svg>
);

// Upload constraints, enforced client-side (and matched by the backend's caps).
// Dimension bounds apply to raster images only; SVGs are vector and skipped.
const LOGO_LIMITS = { maxBytes: 5 * 1024 * 1024, maxLabel: "5 MB", minDim: 48, maxDim: 4096 };
const FAVICON_LIMITS = { maxBytes: 1 * 1024 * 1024, maxLabel: "1 MB", minDim: 16, maxDim: 1024 };

// Reads an image file's pixel dimensions, or null when they can't be determined.
function readImageDimensions(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      const dims = { w: img.naturalWidth, h: img.naturalHeight };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// Download glyph (lucide "download") for the theme export button.
const DownloadIcon = () => (
  <svg
    className={styles.uploadIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// Counter-clockwise rotate glyph (lucide "rotate-ccw") for the reset button.
const RotateIcon = () => (
  <svg
    className={styles.uploadIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);

// Slugify a theme name into a safe download filename stem.
const slugifyName = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "theme";

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
  // Agreements (structured: built-in / uploaded PDF / URL with optional fetch auth)
  const [agreements, setAgreements] = useState<AgreementView[]>([]);
  const [agMode, setAgMode] = useState<"file" | "url">("file");
  const [agTitle, setAgTitle] = useState("");
  const [agVersion, setAgVersion] = useState("");
  const [agUrl, setAgUrl] = useState("");
  const [agFile, setAgFile] = useState<File | null>(null);
  const [agAuth, setAgAuth] = useState<AgreementAuthDraft>({
    method: "none",
    headers: [],
  });
  const [agBusy, setAgBusy] = useState(false);
  const [agType, setAgType] = useState<AgreementClaimType>("frameworkAgreement");
  const agFileRef = useRef<HTMLInputElement | null>(null);
  // iSHARE connection
  const [version, setVersion] = useState("");
  const [claimModel, setClaimModel] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("checking");

  // Agreement type options track the connected framework version: v3 uses the
  // framework/dataspace agreement claims, v2 uses Terms of Use / Accession.
  const agreementTypeOptions = useMemo<AgreementClaimType[]>(
    () =>
      claimModel
        ? ["frameworkAgreement", "dataspaceAgreement"]
        : ["TermsOfUse", "AccessionAgreement"],
    [claimModel]
  );
  const agreementTypeLabel = (ty: string): string => {
    switch (ty) {
      case "dataspaceAgreement":
        return t("settings.agreements.types.dataspaceAgreement");
      case "TermsOfUse":
        return t("settings.agreements.types.termsOfUse");
      case "AccessionAgreement":
        return t("settings.agreements.types.accessionAgreement");
      default:
        return t("settings.agreements.types.frameworkAgreement");
    }
  };
  // Keep the add-form's selected type valid for the current version's options.
  // Clamped during render (not in an effect) to avoid react-hooks/set-state-in-effect;
  // setting state during render triggers an immediate re-render and the guard then holds.
  if (!agreementTypeOptions.includes(agType)) {
    setAgType(agreementTypeOptions[0]);
  }
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
  // Dataspaces fetched from the Participant Registry (for the selector).
  const [dataspaces, setDataspaces] = useState<
    Array<{ id: string; title?: string }>
  >([]);
  // Save / upload feedback
  const [isSaving, setIsSaving] = useState(false);
  const toast = useToast();

  // Thin wrapper so existing call sites stay unchanged; action feedback now
  // shows as a transient toast instead of an inline banner that shifts the page.
  const flash = useCallback(
    (kind: "success" | "error", text: string) => {
      if (kind === "success") toast.success(text);
      else toast.error(text);
    },
    [toast]
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
  // The result is surfaced as a toast (consistent with all other feedback).
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await api.testConnection();
      const d = res.data || {};
      if (d.ok) {
        setConnStatus("connected");
        if (d.version) {
          setVersion(String(d.version));
          setClaimModel(Boolean(d.claimModel));
        }
        flash(
          "success",
          t("settings.connection.testOk", { version: d.version || version || "" })
        );
      } else {
        setConnStatus("disconnected");
        flash("error", t("settings.connection.testFailed", { error: d.error || "" }));
      }
    } catch (e: any) {
      setConnStatus("disconnected");
      flash("error", t("settings.connection.testFailed", {
        error: e?.response?.data?.error || e?.message || "",
      }));
    } finally {
      setTesting(false);
    }
  };

  // AdminRoute calls this once the admin is authorized (token is ready).
  const onAuthorized = useCallback(() => {
    loadSettings();
    checkStatus();
  }, [loadSettings, checkStatus]);

  // Validate an image upload against its size/dimension limits, surfacing a clear
  // toast on rejection. Returns true when the file is acceptable.
  const validateImageUpload = useCallback(
    async (
      file: File,
      limits: { maxBytes: number; maxLabel: string; minDim: number; maxDim: number }
    ): Promise<boolean> => {
      if (file.size > limits.maxBytes) {
        flash("error", t("settings.theme.fileTooLarge", { max: limits.maxLabel }));
        return false;
      }
      const isSvg =
        file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
      if (!isSvg) {
        const dims = await readImageDimensions(file);
        if (dims) {
          const minSide = Math.min(dims.w, dims.h);
          const maxSide = Math.max(dims.w, dims.h);
          if (minSide < limits.minDim || maxSide > limits.maxDim) {
            flash("error", t("settings.theme.badDimensions", {
              min: String(limits.minDim),
              max: String(limits.maxDim),
            }));
            return false;
          }
        }
      }
      return true;
    },
    [flash, t]
  );

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!(await validateImageUpload(file, LOGO_LIMITS))) {
      input.value = ""; // let the user re-pick after a rejection
      return;
    }
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
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (!(await validateImageUpload(file, FAVICON_LIMITS))) {
      input.value = "";
      return;
    }
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

  // Refetch the redacted agreement list after any mutation.
  const reloadAgreements = useCallback(async () => {
    try {
      const res = await api.listAgreements();
      const list = res.data?.agreements;
      if (Array.isArray(list)) setAgreements(list);
    } catch {
      /* non-fatal: keep the current list */
    }
  }, [api]);

  const resetAgreementForm = () => {
    setAgTitle("");
    setAgVersion("");
    setAgUrl("");
    setAgFile(null);
    setAgAuth({ method: "none", headers: [] });
    setAgType(agreementTypeOptions[0]);
    if (agFileRef.current) agFileRef.current.value = "";
  };

  const handleAddAgreementFile = async () => {
    if (!agFile) {
      flash("error", t("settings.agreements.messages.fileRequired"));
      return;
    }
    if (!agTitle.trim()) {
      flash("error", t("settings.agreements.messages.titleRequired"));
      return;
    }
    setAgBusy(true);
    try {
      const form = new FormData();
      form.append("file", agFile);
      form.append("title", agTitle.trim());
      form.append("version", agVersion.trim());
      form.append("type", agType);
      await api.uploadAgreementFile(form);
      flash("success", t("settings.agreements.messages.added"));
      resetAgreementForm();
      await reloadAgreements();
    } catch {
      flash("error", t("settings.agreements.messages.addFailed"));
    } finally {
      setAgBusy(false);
    }
  };

  // Map the auth draft to the API payload, dropping fields irrelevant to the
  // chosen method and empty custom headers.
  const buildAgreementAuth = (): AgreementUrlInput["auth"] => {
    const a = agAuth;
    switch (a.method) {
      case "basic":
        return { method: "basic", username: a.username, password: a.password };
      case "bearer":
        return {
          method: "bearer",
          token: a.token,
          headerName: a.headerName,
          scheme: a.scheme,
        };
      case "oauth2":
        return {
          method: "oauth2",
          tokenUrl: a.tokenUrl,
          clientId: a.clientId,
          clientSecret: a.clientSecret,
          scope: a.scope,
        };
      case "custom":
        return {
          method: "custom",
          headers: a.headers
            .filter((h) => h.name.trim())
            .map((h) => ({ name: h.name.trim(), value: h.value, secret: h.secret })),
        };
      default:
        return { method: "none" };
    }
  };

  const handleAddAgreementUrl = async () => {
    if (!agTitle.trim()) {
      flash("error", t("settings.agreements.messages.titleRequired"));
      return;
    }
    if (!agUrl.trim()) {
      flash("error", t("settings.agreements.messages.urlRequired"));
      return;
    }
    setAgBusy(true);
    try {
      await api.addAgreementUrl({
        title: agTitle.trim(),
        version: agVersion.trim(),
        type: agType,
        url: agUrl.trim(),
        auth: buildAgreementAuth(),
      });
      flash("success", t("settings.agreements.messages.added"));
      resetAgreementForm();
      await reloadAgreements();
    } catch (err: any) {
      // Surface the backend message (e.g. the missing-master-key hint).
      const msg = err?.response?.data?.error || err?.response?.data?.message;
      flash("error", msg || t("settings.agreements.messages.addFailed"));
    } finally {
      setAgBusy(false);
    }
  };

  const handleRemoveAgreement = async (id: string) => {
    // Built-in agreements are required for onboarding completion — warn loudly
    // that removing one will block applicants from finishing.
    const target = agreements.find((a) => a.id === id);
    const message =
      target?.source === "builtin"
        ? t("settings.agreements.removeBuiltinWarning")
        : t("settings.agreements.removeConfirm");
    if (!window.confirm(message)) return;
    try {
      await api.deleteAgreement(id);
      flash("success", t("settings.agreements.messages.removed"));
      await reloadAgreements();
    } catch {
      flash("error", t("settings.agreements.messages.removeFailed"));
    }
  };

  // Custom-header row helpers (auth method "custom").
  const addAuthHeader = () =>
    setAgAuth((a) => ({
      ...a,
      headers: [...a.headers, { name: "", value: "", secret: true }],
    }));
  const updateAuthHeader = (
    index: number,
    patch: Partial<{ name: string; value: string; secret: boolean }>
  ) =>
    setAgAuth((a) => ({
      ...a,
      headers: a.headers.map((h, i) => (i === index ? { ...h, ...patch } : h)),
    }));
  const removeAuthHeader = (index: number) =>
    setAgAuth((a) => ({
      ...a,
      headers: a.headers.filter((_, i) => i !== index),
    }));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.patchSettings({
        description: sanitizeRichText(description),
        registrarId,
        dataspaceId,
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

  // Download the current editor theme as a portable JSON file.
  const handleExportTheme = () => {
    const name = themeName.trim() || activeThemeName || "theme";
    const payload = {
      _type: "ishare-onboarding-theme",
      _version: 1,
      name,
      colors: { ...themeColors },
      fontHeading: themeFonts.fontHeading,
      fontBody: themeFonts.fontBody,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugifyName(name)}-theme.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash("success", t("settings.theme.library.exportedToast"));
  };

  // Load a theme JSON file into the editor (preview + prefilled name). The user
  // then Saves it to the library / Applies it. Validated + tolerant of both the
  // {colors:{…}} envelope and a bare colour map; invalid files are rejected.
  const handleImportTheme = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed: any = JSON.parse(await file.text());
      const src =
        parsed && typeof parsed === "object" && parsed.colors && typeof parsed.colors === "object"
          ? parsed.colors
          : parsed;
      const looksLikeTheme =
        src &&
        typeof src === "object" &&
        THEME_COLOR_TOKENS.some((tk) => isValidHex((src as Record<string, unknown>)[tk.key]));
      if (!looksLikeTheme) {
        flash("error", t("settings.theme.library.importError"));
        return;
      }
      const colors = normalizeThemeColors(src);
      const fonts = {
        fontHeading: isFontKey(parsed?.fontHeading)
          ? parsed.fontHeading
          : brandFonts().fontHeading,
        fontBody: isFontKey(parsed?.fontBody) ? parsed.fontBody : brandFonts().fontBody,
      };
      const name =
        typeof parsed?.name === "string" ? parsed.name.trim().slice(0, 60) : "";
      setThemeColors(colors);
      setThemeFonts(fonts);
      applyThemeColors(colors);
      applyThemeFonts(fonts);
      setThemeName(name);
      setSelectedThemeName(""); // an imported draft, not yet a saved selection
      flash("success", t("settings.theme.library.importedToast"));
    } catch {
      flash("error", t("settings.theme.library.importError"));
    } finally {
      input.value = ""; // allow re-importing the same file
    }
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
            <h2 className={styles.cardTitle}>{t("settings.agreements.title")}</h2>
            <p className={styles.helperText}>
              {t("settings.agreements.description")}
            </p>

            {agreements.length > 0 ? (
              <ul className={styles.agreementList}>
                {agreements.map((a) => (
                  <li key={a.id} className={styles.agreementItem}>
                    <div className={styles.agreementMain}>
                      <span className={styles.agreementName}>{a.title}</span>
                      <div className={styles.agreementMeta}>
                        <span className={styles.sourceBadge}>
                          {a.source === "builtin"
                            ? t("settings.agreements.sourceBuiltin")
                            : a.source === "file"
                            ? t("settings.agreements.sourceFile")
                            : a.source === "url"
                            ? t("settings.agreements.sourceUrl")
                            : t("settings.agreements.sourceLabel")}
                        </span>
                        <span className={styles.typeBadge}>
                          {agreementTypeLabel(a.type)}
                        </span>
                        {a.version && (
                          <span className={styles.versionBadge}>
                            {t("settings.agreements.version")} {a.version}
                          </span>
                        )}
                        {a.source === "url" &&
                          a.auth &&
                          a.auth.method !== "none" && (
                            <span className={styles.protectedBadge}>
                              {t("settings.agreements.protected", {
                                method: t(
                                  `settings.agreements.auth.${a.auth.method}`
                                ),
                              })}
                            </span>
                          )}
                      </div>
                    </div>
                    <div className={styles.agreementActions}>
                      {a.hasDocument && (
                        <a
                          className={styles.agreementOpen}
                          href={api.agreementDocumentUrl(a.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("settings.agreements.open")} ↗
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveAgreement(a.id)}
                        className={styles.removeButton}
                        aria-label={t("settings.agreements.remove")}
                      >
                        &times;
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.helperText}>
                {t("settings.agreements.empty")}
              </p>
            )}

            {/* Add panel: upload a PDF or link a (optionally protected) URL. */}
            <div className={styles.agreementAdd}>
              <h3 className={styles.agreementAddTitle}>
                {t("settings.agreements.addTitle")}
              </h3>
              <div className={styles.modeToggle}>
                <button
                  type="button"
                  className={`${styles.modeButton} ${
                    agMode === "file" ? styles.modeButtonActive : ""
                  }`}
                  onClick={() => setAgMode("file")}
                >
                  {t("settings.agreements.modeFile")}
                </button>
                <button
                  type="button"
                  className={`${styles.modeButton} ${
                    agMode === "url" ? styles.modeButtonActive : ""
                  }`}
                  onClick={() => setAgMode("url")}
                >
                  {t("settings.agreements.modeUrl")}
                </button>
              </div>

              <div className={styles.fieldRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    {t("settings.agreements.titleLabel")}
                  </label>
                  <input
                    className={styles.input}
                    value={agTitle}
                    onChange={(e) => setAgTitle(e.target.value)}
                    placeholder={t("settings.agreements.titlePlaceholder")}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    {t("settings.agreements.version")}
                  </label>
                  <input
                    className={styles.input}
                    value={agVersion}
                    onChange={(e) => setAgVersion(e.target.value)}
                    placeholder={t("settings.agreements.versionPlaceholder")}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    {t("settings.agreements.typeLabel")}
                  </label>
                  <select
                    className={styles.input}
                    value={agType}
                    onChange={(e) =>
                      setAgType(e.target.value as AgreementClaimType)
                    }
                  >
                    {agreementTypeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {agreementTypeLabel(opt)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {agMode === "file" ? (
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    {t("settings.agreements.fileLabel")}
                  </label>
                  <div className={styles.uploadRow}>
                    <UploadField
                      accept="application/pdf,.pdf"
                      label={t("settings.agreements.choosePdf")}
                      onChange={(e) => setAgFile(e.target.files?.[0] ?? null)}
                      inputRef={agFileRef}
                    />
                    {agFile && (
                      <span className={styles.uploadedName}>{agFile.name}</span>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>
                      {t("settings.agreements.urlLabel")}
                    </label>
                    <input
                      className={styles.input}
                      value={agUrl}
                      onChange={(e) => setAgUrl(e.target.value)}
                      placeholder={t("settings.agreements.urlPlaceholder")}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>
                      {t("settings.agreements.auth.method")}
                    </label>
                    <select
                      className={styles.input}
                      value={agAuth.method}
                      onChange={(e) =>
                        setAgAuth({
                          method: e.target.value as AgreementAuthMethod,
                          headers: [],
                        })
                      }
                    >
                      <option value="none">
                        {t("settings.agreements.auth.none")}
                      </option>
                      <option value="basic">
                        {t("settings.agreements.auth.basic")}
                      </option>
                      <option value="bearer">
                        {t("settings.agreements.auth.bearer")}
                      </option>
                      <option value="oauth2">
                        {t("settings.agreements.auth.oauth2")}
                      </option>
                      <option value="custom">
                        {t("settings.agreements.auth.custom")}
                      </option>
                    </select>
                  </div>

                  {agAuth.method === "basic" && (
                    <div className={styles.fieldRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          {t("settings.agreements.auth.username")}
                        </label>
                        <input
                          className={styles.input}
                          value={agAuth.username || ""}
                          onChange={(e) =>
                            setAgAuth((a) => ({ ...a, username: e.target.value }))
                          }
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          {t("settings.agreements.auth.password")}
                        </label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          className={styles.input}
                          value={agAuth.password || ""}
                          onChange={(e) =>
                            setAgAuth((a) => ({ ...a, password: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  )}

                  {agAuth.method === "bearer" && (
                    <>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          {t("settings.agreements.auth.token")}
                        </label>
                        <input
                          type="password"
                          autoComplete="new-password"
                          className={styles.input}
                          value={agAuth.token || ""}
                          onChange={(e) =>
                            setAgAuth((a) => ({ ...a, token: e.target.value }))
                          }
                        />
                      </div>
                      <div className={styles.fieldRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            {t("settings.agreements.auth.headerName")}
                          </label>
                          <input
                            className={styles.input}
                            value={agAuth.headerName || ""}
                            onChange={(e) =>
                              setAgAuth((a) => ({
                                ...a,
                                headerName: e.target.value,
                              }))
                            }
                            placeholder={t(
                              "settings.agreements.auth.headerNamePlaceholder"
                            )}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            {t("settings.agreements.auth.scheme")}
                          </label>
                          <input
                            className={styles.input}
                            value={agAuth.scheme || ""}
                            onChange={(e) =>
                              setAgAuth((a) => ({ ...a, scheme: e.target.value }))
                            }
                            placeholder={t(
                              "settings.agreements.auth.schemePlaceholder"
                            )}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {agAuth.method === "oauth2" && (
                    <>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          {t("settings.agreements.auth.tokenUrl")}
                        </label>
                        <input
                          className={styles.input}
                          value={agAuth.tokenUrl || ""}
                          onChange={(e) =>
                            setAgAuth((a) => ({ ...a, tokenUrl: e.target.value }))
                          }
                        />
                      </div>
                      <div className={styles.fieldRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            {t("settings.agreements.auth.clientId")}
                          </label>
                          <input
                            className={styles.input}
                            value={agAuth.clientId || ""}
                            onChange={(e) =>
                              setAgAuth((a) => ({
                                ...a,
                                clientId: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            {t("settings.agreements.auth.clientSecret")}
                          </label>
                          <input
                            type="password"
                            autoComplete="new-password"
                            className={styles.input}
                            value={agAuth.clientSecret || ""}
                            onChange={(e) =>
                              setAgAuth((a) => ({
                                ...a,
                                clientSecret: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          {t("settings.agreements.auth.scope")}
                        </label>
                        <input
                          className={styles.input}
                          value={agAuth.scope || ""}
                          onChange={(e) =>
                            setAgAuth((a) => ({ ...a, scope: e.target.value }))
                          }
                          placeholder={t("settings.agreements.auth.scopePlaceholder")}
                        />
                      </div>
                    </>
                  )}

                  {agAuth.method === "custom" && (
                    <div className={styles.formGroup}>
                      {agAuth.headers.map((h, i) => (
                        <div key={i} className={styles.headerRow}>
                          <input
                            className={styles.input}
                            value={h.name}
                            placeholder={t("settings.agreements.auth.headerName")}
                            onChange={(e) =>
                              updateAuthHeader(i, { name: e.target.value })
                            }
                          />
                          <input
                            className={styles.input}
                            type={h.secret ? "password" : "text"}
                            autoComplete="new-password"
                            value={h.value}
                            placeholder={t("settings.agreements.auth.headerValue")}
                            onChange={(e) =>
                              updateAuthHeader(i, { value: e.target.value })
                            }
                          />
                          <label className={styles.headerSecret}>
                            <input
                              type="checkbox"
                              checked={h.secret}
                              onChange={(e) =>
                                updateAuthHeader(i, { secret: e.target.checked })
                              }
                            />
                            {t("settings.agreements.auth.secret")}
                          </label>
                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={() => removeAuthHeader(i)}
                            aria-label={t("settings.agreements.remove")}
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={addAuthHeader}
                      >
                        + {t("settings.agreements.auth.addHeader")}
                      </button>
                    </div>
                  )}

                  {agAuth.method !== "none" && (
                    <p className={styles.helperText}>
                      {t("settings.agreements.auth.keptHint")}
                    </p>
                  )}
                </>
              )}

              <button
                type="button"
                className={styles.addButton}
                disabled={agBusy}
                onClick={
                  agMode === "file"
                    ? handleAddAgreementFile
                    : handleAddAgreementUrl
                }
              >
                {agBusy
                  ? t("settings.agreements.adding")
                  : t("settings.agreements.add")}
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
              <div className={styles.mediaField}>
                <label htmlFor="image" className={styles.label}>
                  {t("settings.labels.headerImage")}
                </label>
                <p className={styles.helperText}>{t("settings.theme.logoHint")}</p>
                <div className={styles.mediaRow}>
                  <div
                    className={`${styles.mediaPreview} ${
                      imagePreview ? "" : styles.mediaPreviewEmpty
                    }`}
                  >
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imagePreview} alt={t("settings.labels.headerImage")} />
                    ) : (
                      <ImagePlaceholderIcon />
                    )}
                  </div>
                  <div className={styles.mediaControls}>
                    <UploadField
                      id="image"
                      accept="image/png,image/jpeg,image/svg+xml"
                      label={
                        imagePreview
                          ? t("settings.actions.modifyImage")
                          : t("settings.actions.upload")
                      }
                      onChange={handleImageChange}
                    />
                    <p className={styles.mediaHint}>
                      {t("settings.theme.logoConstraints")}
                    </p>
                  </div>
                </div>
              </div>
              <div className={styles.mediaField}>
                <label htmlFor="favicon" className={styles.label}>
                  {t("settings.theme.favicon")}
                </label>
                <p className={styles.helperText}>{t("settings.theme.faviconHint")}</p>
                <div className={styles.mediaRow}>
                  <div
                    className={`${styles.mediaPreview} ${
                      faviconPreview ? "" : styles.mediaPreviewEmpty
                    }`}
                  >
                    {faviconPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={faviconPreview} alt={t("settings.theme.favicon")} />
                    ) : (
                      <ImagePlaceholderIcon />
                    )}
                  </div>
                  <div className={styles.mediaControls}>
                    <UploadField
                      id="favicon"
                      accept=".ico,.png,.svg,image/png,image/svg+xml,image/x-icon"
                      label={
                        faviconPreview
                          ? t("settings.actions.modifyIcon")
                          : t("settings.actions.uploadIcon")
                      }
                      onChange={handleFaviconChange}
                    />
                    <p className={styles.mediaHint}>
                      {t("settings.theme.faviconConstraints")}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Colours & fonts */}
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>{t("settings.theme.title")}</h2>
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
                    <label className={`${styles.ghostButton} ${styles.iconButton}`}>
                      <UploadIcon />
                      {t("settings.theme.library.import")}
                      <input
                        type="file"
                        accept="application/json,.json"
                        className={styles.uploadInput}
                        onChange={handleImportTheme}
                      />
                    </label>
                    <button
                      type="button"
                      className={`${styles.ghostButton} ${styles.iconButton}`}
                      onClick={handleExportTheme}
                    >
                      <DownloadIcon />
                      {t("settings.theme.library.export")}
                    </button>
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

              {/* Typography — with the editor-wide "reset to brand defaults". */}
              <div className={styles.colorGroup}>
                <div className={styles.colorGroupHeader}>
                  <h3 className={styles.colorGroupTitle}>
                    {t("settings.theme.groups.typography")}
                  </h3>
                  <button
                    type="button"
                    className={`${styles.ghostButton} ${styles.iconButton}`}
                    onClick={handleResetTheme}
                  >
                    <RotateIcon />
                    {t("settings.theme.actions.reset")}
                  </button>
                </div>
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
