import { useEffect, useState } from "react";
import styles from "../styles/Settings.module.css";
import { NextPage } from "next";
import AdminRoute from "components/AdminRoute";
import Image from "next/image";
import { useLanguage } from "../context/LanguageContext";
import { useSettings } from "../context/SettingsContext";
import API from "api/client"
import { getPublicEnv } from "config/publicEnv"

const Settings: NextPage = () => {
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [logoPath, setLogoPath] = useState<string>("");
  const [registrarId, setRegistrarId] = useState("");
  const [dataspaceId, setDataspaceId] = useState("");
  const [agreements, setAgreements] = useState<string[]>([]);
  const [newAgreement, setNewAgreement] = useState("");
  const [hideCapabilitiesUrl, setHideCapabilitiesUrl] = useState(false);
  const { t } = useLanguage();
  const { updateLogo } = useSettings();

  const Api = new API()

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
        if (!baseUrl) {
          throw new Error(t("settings.messages.backendNotConfigured"));
        }

        const response = await Api.fetchSettings()

        const data = response.data
        setDescription(data.description || "");
        setLogoPath(data.logoPath || "");
        setRegistrarId(data.registrarId || "");
        setDataspaceId(data.dataspaceId || "");
        setAgreements(data.agreements || []);
        setHideCapabilitiesUrl(Boolean(data.hideCapabilitiesUrl));

        if (data.logoPath) {
          const logoResponse = await Api.fetchLogo();
          const logoBlob = logoResponse.data;
          const logoUrl = URL.createObjectURL(logoBlob);
          setImagePreview(logoUrl);
        }
      } catch (error) {
        console.error("Failed to load settings:", t("settings.messages.loadFailed"))
      }
    };

    loadSettings();
  }, [t])

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const formData = new FormData();
      formData.append("logo", file);

      try {
        await Api.uploadLogo(formData);
        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);

        // Update logo in context to refresh header
        await updateLogo();
      } catch (error) {
        console.error("Error uploading image:", error);
        alert(t("settings.messages.uploadFailed"));
      }
    }
  };

  const handleAddAgreement = () => {
    if (newAgreement.trim() !== "") {
      setAgreements([...agreements, newAgreement.trim()]);
      setNewAgreement("");
    }
  };

  const handleRemoveAgreement = (index: number) => {
    setAgreements(agreements.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    try {
      const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
      if (!baseUrl) {
        throw new Error(t("settings.messages.backendNotConfigured"));
      }

      const response = await Api.patchSettings({
        description,
        registrarId,
        dataspaceId,
        agreements,
        hideCapabilitiesUrl,
      })

      alert(t("settings.messages.saveSuccess"));
    } catch (error) {
      console.error("Error saving settings:", error);
      alert(t("settings.messages.saveFailed"));
    }
  };

  return (
    <AdminRoute fetchData={() => { }}>
      <div className={styles.container}>
        <h1>{t("settings.title")}</h1>

        <div className={styles.formGroup}>
          <label htmlFor="image">{t("settings.labels.headerImage")}</label>
          <input
            type="file"
            id="image"
            accept="image/*"
            onChange={handleImageChange}
            className={styles.fileInput}
          />
          {imagePreview && (
            <div className={styles.imagePreview}>
              <Image
                src={imagePreview}
                alt={t("settings.sections.headerImage")}
                height={80}
                width={80}
                objectFit="cover"
              />
            </div>
          )}
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="description">{t("settings.labels.introText")}</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className={styles.textarea}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="registrarId">{t("settings.labels.registrarId")}</label>
          <input
            type="text"
            id="registrarId"
            value={registrarId}
            onChange={(e) => setRegistrarId(e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="dataspaceId">{t("settings.labels.dataspaceId")}</label>
          <input
            type="text"
            id="dataspaceId"
            value={dataspaceId}
            onChange={(e) => setDataspaceId(e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={hideCapabilitiesUrl}
              onChange={(e) => setHideCapabilitiesUrl(e.target.checked)}
            />
            {t("settings.labels.hideCapabilitiesUrl")}
          </label>
          <p className={styles.helperText}>{t("settings.labels.hideCapabilitiesUrlHint")}</p>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="agreements">{t("settings.labels.agreements")}</label>

          <ul className={styles.list}>
            {agreements.map((item, idx) => (
              <li key={idx} className={styles.listItem}>
                {item}
                <button
                  type="button"
                  onClick={() => handleRemoveAgreement(idx)}
                  className={styles.removeButton}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.agreementInputWrapper}>
            <input
              type="text"
              id="agreements"
              value={newAgreement}
              onChange={(e) => setNewAgreement(e.target.value)}
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
        </div>

        <button onClick={handleSave} className={styles.saveButton}>
          {t("settings.actions.save")}
        </button>
      </div>
    </AdminRoute>
  );
};

export default Settings;
