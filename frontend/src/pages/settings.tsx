import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NextPage } from "next";
import styles from "../styles/Settings.module.css";
import AdminRoute from "components/AdminRoute";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import API from "api/client";
import dynamic from "next/dynamic";
import { sanitizeRichText } from "util/sanitizeHtml";

// The WYSIWYG editor relies on contentEditable, so load it client-side only.
const RichTextEditor = dynamic(() => import("components/RichTextEditor"), {
  ssr: false,
  loading: () => <div className={styles.editorLoading} />,
});

type ConnStatus = "checking" | "connected" | "disconnected";
type Notice = { kind: "success" | "error"; text: string } | null;

const Settings: NextPage = () => {
  const { t } = useLanguage();
  const { updateLogo } = useSettings();
  const api = useMemo(() => new API(), []);

  // Branding
  const [description, setDescription] = useState("");
  const [imagePreview, setImagePreview] = useState("");
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
      if (data.logoPath) {
        const logoRes = await api.fetchLogo();
        setImagePreview(URL.createObjectURL(logoRes.data));
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
      const res = await api.fetchSatelliteVersion();
      setVersion((res.data?.version ?? "").toString());
      setClaimModel(Boolean(res.data?.claimModel));
    } catch (e) {
      setVersion("");
    }
    try {
      await api.fetchRegistry();
      setConnStatus("connected");
    } catch (e) {
      setConnStatus("disconnected");
    }
  }, [api]);

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
      });
      flash("success", t("settings.messages.saveSuccess"));
    } catch (err) {
      flash("error", t("settings.messages.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminRoute fetchData={onAuthorized}>
      <div className={styles.container}>
        <div className={styles.headerSection}>
          <div>
            <h1 className={styles.title}>{t("settings.title")}</h1>
            <p className={styles.subtitle}>{t("settings.subtitle")}</p>
          </div>
          <button
            className={styles.saveButton}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? t("settings.actions.saving") : t("settings.actions.save")}
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

          {/* iSHARE connection */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{t("settings.sections.system")}</h2>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={checkStatus}
                disabled={connStatus === "checking"}
              >
                {t("settings.actions.recheck")}
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
            </div>
          </section>

          {/* Branding */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("settings.sections.branding")}</h2>
            <div className={styles.formGroup}>
              <label htmlFor="image" className={styles.label}>
                {t("settings.labels.headerImage")}
              </label>
              <div className={styles.logoRow}>
                {imagePreview && (
                  <div className={styles.imagePreview}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt={t("settings.sections.branding")}
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
              <label htmlFor="description" className={styles.label}>
                {t("settings.labels.introText")}
              </label>
              <RichTextEditor value={description} onChange={setDescription} />
            </div>
          </section>

          {/* Registry */}
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>{t("settings.sections.registry")}</h2>
            <div className={styles.fieldRow}>
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
                <label htmlFor="dataspaceId" className={styles.label}>
                  {t("settings.labels.dataspaceId")}
                </label>
                <input
                  type="text"
                  id="dataspaceId"
                  value={dataspaceId}
                  onChange={(e) => setDataspaceId(e.target.value)}
                  className={styles.input}
                />
              </div>
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
        </div>
      </div>
    </AdminRoute>
  );
};

export default Settings;
