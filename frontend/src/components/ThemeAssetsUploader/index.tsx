// Branding assets of a SAVED theme: header image + browser icon. They are
// part of the theme (one theme brands any number of onboarding flows), stored
// through dedicated endpoints so the theme editor's save never clobbers them.
import { useState } from "react";
import styles from "../../styles/Settings.module.css";
import { useLanguage } from "../../context/LanguageContext";

interface Props {
  themeName: string; // a SAVED library theme ("" = none selected)
  hasHeaderImage: boolean;
  hasFavicon: boolean;
  onUploaded: () => void; // parent refetches settings for fresh presence flags
  flash: (kind: "success" | "error", message: string) => void;
}

const KINDS = [
  { kind: "header-image", field: "image", accept: ".png,.jpg,.jpeg,.webp,.svg" },
  { kind: "favicon", field: "favicon", accept: ".ico,.png,.svg" },
] as const;

const ThemeAssetsUploader: React.FC<Props> = ({
  themeName,
  hasHeaderImage,
  hasFavicon,
  onUploaded,
  flash,
}) => {
  const { t } = useLanguage();
  const [busy, setBusy] = useState<string | null>(null);
  const [bust, setBust] = useState(0);

  if (!themeName) {
    return (
      <p className={styles.helperText}>
        {t("settings.theme.assets.selectSaved")}
      </p>
    );
  }

  const assetUrl = (kind: string) =>
    `/api/backend/settings/themes/${encodeURIComponent(themeName)}/asset/${kind}?t=${bust}`;

  const upload = async (kind: (typeof KINDS)[number], file: File) => {
    setBusy(kind.kind);
    try {
      const body = new FormData();
      body.append(kind.field, file);
      const res = await fetch(
        `/api/backend/settings/themes/${encodeURIComponent(themeName)}/asset/${kind.kind}`,
        { method: "POST", body, credentials: "include" }
      );
      if (!res.ok) throw new Error(String(res.status));
      flash("success", t("settings.theme.assets.uploaded"));
      setBust((n) => n + 1);
      onUploaded();
    } catch {
      flash("error", t("settings.theme.assets.uploadFailed"));
    } finally {
      setBusy(null);
    }
  };

  const present = { "header-image": hasHeaderImage, favicon: hasFavicon };

  return (
    <div className={styles.formGroup}>
      <span className={styles.label}>{t("settings.theme.assets.title")}</span>
      <p className={styles.helperText}>{t("settings.theme.assets.hint")}</p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {KINDS.map((k) => (
          <div key={k.kind}>
            <label className={styles.colorLabel}>
              {t(`settings.theme.assets.${k.kind}`)}
            </label>
            {present[k.kind] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetUrl(k.kind)}
                alt={k.kind}
                style={{
                  display: "block",
                  maxWidth: k.kind === "header-image" ? 240 : 32,
                  maxHeight: k.kind === "header-image" ? 80 : 32,
                  marginBottom: 8,
                  objectFit: "cover",
                }}
              />
            )}
            <label className={styles.ghostButton}>
              {busy === k.kind
                ? t("settings.theme.assets.uploading")
                : present[k.kind]
                  ? t("settings.theme.assets.replace")
                  : t("settings.theme.assets.upload")}
              <input
                type="file"
                accept={k.accept}
                className={styles.uploadInput}
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(k, file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThemeAssetsUploader;
