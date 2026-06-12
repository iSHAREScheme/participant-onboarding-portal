import React, { useState, useCallback } from "react";
import { useKeycloak } from "@react-keycloak/web";
import { useLanguage } from "../context/LanguageContext";
import styles from "../styles/Profile.module.css";
import ProtectedRoute from "components/ProtectedRoute";

interface UserProfile {
  email: string;
  firstName: string;
  lastName: string;
}

const Profile: React.FC = () => {
  const { keycloak: keycloakFromContext } = useKeycloak();
  const keycloak = keycloakFromContext!;
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>({
    email: "",
    firstName: "",
    lastName: "",
  });

  const loadUserProfile = useCallback(async () => {
    try {
      const userProfile = await keycloak.loadUserProfile();
      setProfile({
        email: userProfile.email || "",
        firstName: userProfile.firstName || "",
        lastName: userProfile.lastName || "",
      });
    } catch (err) {
      setError(t("profile.errors.loadFailed"));
    }
  }, [keycloak, t]);

  // Data is loaded by ProtectedRoute, which calls fetchData={loadUserProfile} once
  // the user is authenticated — so no separate mount effect is needed here.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await keycloak.updateToken(30);
      const response = await fetch(
        `${keycloak.authServerUrl}/realms/${keycloak.realm}/account`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keycloak.token}`,
          },
          body: JSON.stringify({
            firstName: profile.firstName,
            lastName: profile.lastName,
            email: profile.email,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(t("profile.errors.updateFailed"));
      }

      setIsEditing(false);
      await loadUserProfile();
    } catch (err) {
      console.error("Error:", err);
      setError(
        err instanceof Error ? err.message : t("profile.errors.updateFailed")
      );
    }
  };

  return (
    <ProtectedRoute fetchData={loadUserProfile}>
      <div className={styles.profileContainer}>
        <h1>{t("profile.title")}</h1>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label>{t("profile.labels.email")}</label>
            <div className={styles.value}>{profile.email}</div>
          </div>

          <div className={styles.formGroup}>
            <label>{t("profile.labels.firstName")}</label>
            {isEditing ? (
              <input
                type="text"
                value={profile.firstName}
                onChange={(e) =>
                  setProfile({ ...profile, firstName: e.target.value })
                }
                required
              />
            ) : (
              <div className={styles.value}>{profile.firstName}</div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label>{t("profile.labels.lastName")}</label>
            {isEditing ? (
              <input
                type="text"
                value={profile.lastName}
                onChange={(e) =>
                  setProfile({ ...profile, lastName: e.target.value })
                }
                required
              />
            ) : (
              <div className={styles.value}>{profile.lastName}</div>
            )}
          </div>

          <div className={styles.actions}>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className={styles.editButton}
              >
                {t("common.edit")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    loadUserProfile();
                  }}
                  className={styles.cancelButton}
                >
                  {t("common.cancel")}
                </button>
                <button type="submit" className={styles.saveButton}>
                  {t("common.save")}
                </button>
              </>
            )}
          </div>
        </form>

      </div>
    </ProtectedRoute>
  );
};

export default Profile;
