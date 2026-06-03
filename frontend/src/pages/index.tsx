import type { NextPage } from "next";
import styles from "../styles/Home.module.css";
import { useEffect, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import { useUserProposal } from "../hooks/useUserProposal";
import OnboardingStatus from "../components/OnboardingStatus";
import { useKeycloak } from "@react-keycloak/web";

import API from 'api/client'
import { getPublicEnv } from "config/publicEnv"
import { sanitizeRichText } from "util/sanitizeHtml"

interface SettingsResponse {
  description?: string;
  registrarId?: string;
  dataspaceId?: string;
  agreements?: string[];
}


const Home: NextPage = () => {
  const [description, setDescription] = useState("Loading...");
  const { t } = useLanguage();
  const [agreements, setAgreements] = useState<string[]>([]);
  const { proposalData, loading: proposalLoading } = useUserProposal();
  const [keycloak] = useKeycloak();
  const [mounted, setMounted] = useState(false);

  const Api = new API()

  useEffect(() => {
    const fetchDescription = async () => {
      try {
        const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
        if (!baseUrl) {
          throw new Error(t("settings.messages.backendNotConfigured"));
        }

        const response = await Api.fetchSettings()

        const data: SettingsResponse = await response.data;
        setDescription(data.description ?? "");
        setAgreements(data.agreements || []);

      } catch (error) {
        console.error("Error fetching description:", error);
        setDescription(t("settings.messages.loadFailed"));
      }
    };

    fetchDescription();
  }, [t]);

  // The intro text is admin-authored HTML; sanitise + render it on the client only
  // (DOMPurify needs a DOM), deferring past mount so server/client markup matches.
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleProceed = () => {
    const env = getPublicEnv()
    const idpOnly = env.NEXT_PUBLIC_IDP_ONLY === "true"
    const keycloakIdp = env.NEXT_PUBLIC_KEYCLOAK_IDP
    const idpHint =
      idpOnly && keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
        ? keycloakIdp
        : undefined
    const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/register` : undefined;
    if (keycloak && !keycloak.authenticated) {
      keycloak.login({
        redirectUri,
        idpHint,
      });
    } else {
      window.location.href = "/register";
    }
  };

  const renderApprovedContent = () => (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.leftSection}>
          <h1 className={styles.title}>{t("home.approved.title", {
            name: proposalData?.contactName.toUpperCase() || "User"
          })}</h1>

          <p className={styles.description}>
            {t("home.approved.message")}
          </p>
        </div>
        <OnboardingStatus onSignAgreements={handleProceed} />
      </main>
    </div>
  );

  const renderDefaultContent = () => (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.leftSection}>
          <h1 className={styles.title}>{t("home.title")}</h1>

          {mounted ? (
            <div
              className={styles.richText}
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(description) }}
            />
          ) : (
            <p className={styles.description}>{description}</p>
          )}

          {agreements.length > 0 && (
            <>
              <p className={styles.agreementText}>
                {t(
                  "home.agreementText",
                  "When you onboard to this association, you will be asked to sign the following agreements:"
                )}
              </p>

              <ul className={styles.agreementList}>
                {agreements.map((url, index) => (
                  <li key={index}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      {t(`home.agreement${index + 1}`, `Agreement ${index + 1}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className={styles.rightSection}>
          <h2 className={styles.beforeTitle}>{t("home.beforeCommencing")}</h2>
          <p className={styles.beforeDescription}>
            {t(
              "home.beforeDescription",
              "To complete the onboarding, please make sure you have the following information by hand:"
            )}
          </p>
          <ul className={styles.requirementsList}>
            <li>{t("home.requirements.idEherkenning", "ID or eHerkenning")}</li>
            <li>{t("home.requirements.location", "Location of ...")}</li>
          </ul>
          <p className={styles.readyText}>{t("home.readyText")}</p>
          <div>
            <button className={styles.proceedButton} onClick={handleProceed}>
              {t("home.proceedButton")}
            </button>
          </div>
        </div>
      </main>
    </div>
  );

  // Show loading state while fetching proposal data
  if (proposalLoading) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <div className={styles.leftSection}>
            <h1 className={styles.title}>Loading...</h1>
          </div>
        </main>
      </div>
    );
  }

  // Show approved content if user's proposal status is approved
  if (proposalData?.status === "approved") {
    return renderApprovedContent();
  }

  // Show default content for all other cases
  return renderDefaultContent();
};

export default Home;
