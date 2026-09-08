// The public onboarding landing, shared by the base URL (pages/index.tsx) and
// every configured flow route (pages/[flow].tsx).
//
// Gate: public onboarding is OFF by default. While off, anonymous visitors of
// any onboarding surface are sent to the login screen; authenticated visitors
// go to their normal home (/register). Turning it on (Settings → Onboarding)
// exposes the configured flows, each branded by a theme from the theme
// library (colors, fonts, header image, browser icon).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import ErrorPage from "next/error";
import { useKeycloak } from "@react-keycloak/web";

import styles from "../../styles/Home.module.css";
import { useLanguage } from "../../context/LanguageContext";
import { useUserProposal } from "../../hooks/useUserProposal";
import OnboardingStatus from "../OnboardingStatus";
import { useHydrated } from "../../hooks/useHydrated";
import API, { AgreementView } from "api/client";
import { getPublicEnv } from "config/publicEnv";
import { sanitizeRichText } from "util/sanitizeHtml";
import {
  applyFlowBranding,
  findFlow,
  type PublicFlowAgreement,
  type PublicOnboardingFlow,
} from "config/onboardingFlows";

interface PublicSettingsResponse {
  description?: string;
  agreements?: AgreementView[];
  publicOnboardingEnabled?: boolean;
  onboardingFlows?: PublicOnboardingFlow[];
}

interface Props {
  // null = the base URL (uses the flow configured with route "", if any);
  // otherwise the /:flowRoute path segment to resolve.
  flowRoute: string | null;
}

const OnboardingLanding: React.FC<Props> = ({ flowRoute }) => {
  const { t } = useLanguage();
  const { proposalData, loading: proposalLoading } = useUserProposal();
  const [keycloak] = useKeycloak();
  const router = useRouter();
  const mounted = useHydrated();
  const [Api] = useState(() => new API());

  const [publicSettings, setPublicSettings] =
    useState<PublicSettingsResponse | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
        if (!baseUrl) throw new Error("backend not configured");
        const response = await Api.fetchPublicSettings();
        if (active) setPublicSettings(await response.data);
      } catch (error) {
        console.error("Error fetching public settings:", error);
        if (active) setLoadFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [Api]);

  const onboardingEnabled = publicSettings?.publicOnboardingEnabled === true;
  const flow = useMemo(() => {
    if (!publicSettings) return undefined;
    return findFlow(publicSettings.onboardingFlows, flowRoute ?? "");
  }, [publicSettings, flowRoute]);

  // With onboarding ON, a named route that matches no configured flow is
  // simply not a page. With it OFF the flows list is empty by design, so every
  // onboarding surface - base URL and named routes alike - goes through the
  // login gate instead (an anonymous visitor cannot distinguish
  // configured-but-disabled from nonexistent, and should not).
  const unknownRoute =
    publicSettings !== null && flowRoute !== null && onboardingEnabled && !flow;

  // The gate: with public onboarding off, no onboarding surface is public.
  // And the flows list IS the complete definition of what is published: the
  // base URL is only public when a flow explicitly claims it (route ""), so
  // adding only /custom-route flows never implicitly publishes the base URL.
  const gateClosed =
    publicSettings !== null &&
    (!onboardingEnabled || (flowRoute === null && !flow));
  useEffect(() => {
    if (!gateClosed) return;
    if (keycloak?.authenticated) {
      router.replace("/register");
      return;
    }
    const redirectUri =
      typeof window !== "undefined"
        ? `${window.location.origin}/register`
        : undefined;
    keycloak?.login({ redirectUri });
  }, [gateClosed, keycloak, router]);

  // Apply the flow's branding (theme colors/fonts, favicon, tab title) once
  // both the flow and the DOM are available.
  useEffect(() => {
    if (flow) applyFlowBranding(flow);
  }, [flow]);

  // Once admitted, the post-admission home is the dashboard at /party.
  useEffect(() => {
    if (!proposalLoading && proposalData?.status === "completed") {
      router.replace("/party");
    }
  }, [proposalLoading, proposalData?.status, router]);

  const handleProceed = () => {
    const env = getPublicEnv();
    const idpOnly = env.NEXT_PUBLIC_IDP_ONLY === "true";
    const keycloakIdp = env.NEXT_PUBLIC_KEYCLOAK_IDP;
    const idpHint =
      idpOnly && keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
        ? keycloakIdp
        : undefined;
    // Carry the flow into /register so its overrides (roles, dataspace, theme)
    // keep applying through the actual onboarding form.
    const flowSuffix = flow?.route ? `?flow=${encodeURIComponent(flow.route)}` : "";
    const redirectUri =
      typeof window !== "undefined"
        ? `${window.location.origin}/register${flowSuffix}`
        : undefined;
    if (keycloak && !keycloak.authenticated) {
      keycloak.login({ redirectUri, idpHint });
    } else {
      window.location.href = `/register${flowSuffix}`;
    }
  };

  if (unknownRoute) {
    return <ErrorPage statusCode={404} />;
  }

  // Loading / gate-redirect states render a quiet placeholder.
  if (publicSettings === null || gateClosed || proposalLoading) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <div className={styles.leftSection}>
            <h1 className={styles.title}>
              {loadFailed ? t("settings.messages.loadFailed") : "Loading..."}
            </h1>
          </div>
        </main>
      </div>
    );
  }

  if (proposalData?.status === "approved") {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <div className={styles.leftSection}>
            <h1 className={styles.title}>
              {t("home.approved.title", {
                name: proposalData?.contactName.toUpperCase() || "User",
              })}
            </h1>
            <p className={styles.description}>{t("home.approved.message")}</p>
          </div>
          <OnboardingStatus onSignAgreements={handleProceed} />
        </main>
      </div>
    );
  }

  if (proposalData?.status === "completed") {
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

  const description = flow?.description || publicSettings.description || "";
  // A flow lists only its own agreement selection (resolved server-side).
  const agreements: PublicFlowAgreement[] =
    flow?.agreements ?? publicSettings.agreements ?? [];
  const headerImageUrl = flow?.theme?.headerImageUrl;

  return (
    <div className={styles.container}>
      {headerImageUrl && (
        <div className={styles.flowHeader}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.flowHeaderImage}
            src={headerImageUrl}
            alt={flow?.title || ""}
          />
        </div>
      )}
      <main className={styles.main}>
        <div className={styles.leftSection}>
          <h1 className={styles.title}>{flow?.title || t("home.title")}</h1>

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
                {agreements.map((a) => (
                  <li key={a.id}>
                    {a.hasDocument ? (
                      <a
                        href={Api.agreementDocumentUrl(a.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {a.title}
                        {a.version ? ` (${a.version})` : ""}
                      </a>
                    ) : (
                      <span>
                        {a.title}
                        {a.version ? ` (${a.version})` : ""}
                      </span>
                    )}
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
};

export default OnboardingLanding;
