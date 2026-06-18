import React, { useState, useCallback } from "react";
import { useKeycloak } from "@react-keycloak/web";
import { useLanguage } from "../context/LanguageContext";
import styles from "../styles/Profile.module.css";
import ProtectedRoute from "components/ProtectedRoute";
import API from "api/client";

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
    // Populate from the token claims first — this never fails and doesn't depend
    // on the cross-origin Keycloak Account API (which can be CORS-blocked; that's
    // the usual cause of "failed to load profile").
    const claims = (keycloak.tokenParsed ||
      keycloak.idTokenParsed ||
      {}) as Record<string, any>;
    setProfile({
      email: claims.email || "",
      firstName: claims.given_name || "",
      lastName: claims.family_name || "",
    });
    // Best-effort enrichment from the Account API; keep the token values on failure
    // instead of erroring the whole page.
    try {
      const p = await keycloak.loadUserProfile();
      setProfile({
        email: p.email || claims.email || "",
        firstName: p.firstName || claims.given_name || "",
        lastName: p.lastName || claims.family_name || "",
      });
    } catch (err) {
      console.warn("Account API profile load failed; using token claims", err);
    }
  }, [keycloak]);

  // Data is loaded by ProtectedRoute, which calls fetchData={loadUserProfile} once
  // the user is authenticated — so no separate mount effect is needed here.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Routed through the backend admin API (the browser-side Keycloak Account
      // API rejects the frontend client's token with 401). The backend updates
      // the caller's own user, identified by the token subject.
      const api = new API();
      await api.updateMyProfile({
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
      });
      setIsEditing(false);
    } catch (err: any) {
      console.error("Profile update failed:", err);
      setError(err?.response?.data?.error || t("profile.errors.updateFailed"));
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
            {isEditing ? (
              <input
                type="email"
                value={profile.email}
                onChange={(e) =>
                  setProfile({ ...profile, email: e.target.value })
                }
                required
              />
            ) : (
              <div className={styles.value}>{profile.email}</div>
            )}
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
