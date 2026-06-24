import React from "react"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/router"
import styles from "styles/components/Header.module.css"
import { useKeycloak } from "@react-keycloak/web"
import { useLanguage } from "../../context/LanguageContext"
import { useSettings } from "../../context/SettingsContext"
import { useTheme } from "../../hooks/useTheme"
import LanguageSwitcher from "../LanguageSwitcher"
import AdminTour, { ADMIN_TOUR_START_EVENT } from "../AdminTour"
import { getPublicEnv } from "config/publicEnv"
import { clearStoredKeycloakTokens } from "util/keycloakTokens"

const Header: React.FC = () => {
  const [showDropdown, setShowDropdown] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const { t } = useLanguage()
  const { logoUrl, associationName: configuredAssociationName, prConfigured } = useSettings()
  const { keycloak } = useKeycloak()
  const { logo, tenantId } = useTheme()

  const env = getPublicEnv()
  const idpOnly = env.NEXT_PUBLIC_IDP_ONLY === "true"
  const keycloakIdp = env.NEXT_PUBLIC_KEYCLOAK_IDP
  const adminRoutesDisabled = env.NEXT_PUBLIC_DISABLE_ADMIN_ROUTES === "true"
  const showAdminNav =
    !!keycloak?.authenticated &&
    keycloak.hasRealmRole("onboarding-admin") &&
    !adminRoutesDisabled
  // Every logged-in user gets the same header shell — hamburger + drawer (with
  // language + account) and the logo on the right on mobile. The admin nav links
  // inside the drawer are gated separately on showAdminNav.
  const showDrawer = !!keycloak?.authenticated
  const idpHint =
    idpOnly && keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
      ? keycloakIdp
      : undefined

  // Prefer the admin-configured association name (Settings → Onboarding); fall
  // back to the theme tenant id when one is set.
  const associationName =
    configuredAssociationName ||
    (tenantId && tenantId !== 'default' ? tenantId : '')

  // A never-blank label for the account menu: prefer the username, then any name
  // or email claim, falling back to a generic label so the top bar never renders
  // empty (some brokered/admin tokens omit preferred_username).
  const claims = (keycloak?.tokenParsed ?? {}) as Record<string, any>
  const displayName =
    claims.preferred_username ||
    claims.name ||
    [claims.given_name, claims.family_name].filter(Boolean).join(" ") ||
    claims.email ||
    "Account"

  // Highlight the nav item for the current route (and its sub-routes, e.g.
  // /participants/[id]); router.pathname updates on client-side navigation.
  const isActive = (base: string) =>
    router.pathname === base || router.pathname.startsWith(`${base}/`)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close the mobile nav drop-down after navigating to a route. Listening to router
  // events keeps the setState in a callback (not the effect body), and is equivalent
  // to resetting on router.pathname change.
  useEffect(() => {
    const closeNav = () => setMobileNavOpen(false)
    router.events.on("routeChangeComplete", closeNav)
    return () => router.events.off("routeChangeComplete", closeNav)
  }, [router.events]);

  const handleLogin = () => {
    keycloak?.login(
      {
        redirectUri: window.location.origin,
        idpHint,
        prompt: 'login',
        scope: 'openid profile email',

      }
    );
  };

  const handleLogout = () => {
    clearStoredKeycloakTokens()
    keycloak?.logout({
      redirectUri: window.location.origin
    });
  };

  // Replay the admin onboarding tour from the account menu.
  const startTour = () => {
    setShowDropdown(false)
    setMobileNavOpen(false)
    window.dispatchEvent(new Event(ADMIN_TOUR_START_EVENT))
  };

  return (
    <header className={styles.header}>
      <div
        className={`${styles.container} ${
          showDrawer ? styles.withDrawer : ""
        }`}
      >
        {showDrawer && (
          <button
            type="button"
            className={`${styles.hamburger} ${
              mobileNavOpen ? styles.hamburgerOpen : ""
            }`}
            aria-label={t("common.menu")}
            aria-expanded={mobileNavOpen}
            aria-controls="primary-nav"
            onClick={() => setMobileNavOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        )}
        <div
          className={styles.associationName}
          onClick={() => {
            // Don't navigate away if user is in registration process
            if (router.pathname === "/register") {
              return;
            }
            router.push("/");
          }}
        >
          <div className={styles.logoGroup}>
            {logoUrl && (
              <img
                src={logoUrl}
                alt={associationName}
                height={50}
                width={180}
                className={styles.secondaryLogo}
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        </div>
        {showDrawer && (
          <div
            className={`${styles.backdrop} ${
              mobileNavOpen ? styles.backdropOpen : ""
            }`}
            aria-hidden="true"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        {showDrawer && (
          <nav
            id="primary-nav"
            className={`${styles.navbar} ${mobileNavOpen ? styles.navbarOpen : ""}`}
          >
            {showAdminNav && (
            <ul>
              <li>
                <Link
                  href="/admin"
                  data-tour="proposals"
                  className={isActive("/admin") ? styles.active : ""}
                >
                  {t("common.proposals")}
                </Link>
              </li>
              <li>
                <Link
                  href="/participants"
                  data-tour="participants"
                  className={isActive("/participants") ? styles.active : ""}
                >
                  {t("common.participants")}
                </Link>
              </li>
              <li>
                <Link
                  href="/users"
                  data-tour="users"
                  className={isActive("/users") ? styles.active : ""}
                >
                  {t("common.users")}
                </Link>
              </li>
              <li>
                <Link
                  href="/settings"
                  data-tour="settings"
                  className={isActive("/settings") ? styles.active : ""}
                >
                  {t("common.settings")}
                </Link>
              </li>
              {prConfigured && (
                <>
                  <li>
                    <Link
                      href="/network-health"
                      className={isActive("/network-health") ? styles.active : ""}
                    >
                      {t("common.networkHealth")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/revoke"
                      className={
                        isActive("/revoke") || isActive("/transfer") ? styles.active : ""
                      }
                    >
                      {t("common.revokeTransfer")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/dataspaces"
                      className={isActive("/dataspaces") ? styles.active : ""}
                    >
                      {t("common.dataspaces")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/trusted"
                      className={isActive("/trusted") ? styles.active : ""}
                    >
                      {t("common.trustedList")}
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/subscribers"
                      className={isActive("/subscribers") ? styles.active : ""}
                    >
                      {t("common.issuerWebhooks")}
                    </Link>
                  </li>
                </>
              )}
            </ul>
            )}
            {/* On mobile these live in the drawer; on desktop they're hidden here
                and shown in the top-bar right section instead. */}
            <div className={styles.drawerExtras}>
              <div className={styles.drawerLang}>
                <LanguageSwitcher />
              </div>
              {keycloak?.authenticated && (
                <div className={styles.drawerUser}>
                  <div className={styles.drawerUsername}>
                    {displayName}
                  </div>
                  <button type="button" onClick={() => router.push("/profile")}>
                    {t("common.profile")}
                  </button>
                  <button type="button" onClick={() => router.push("/party")}>
                    {t("common.myParty")}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/organization-access")}
                  >
                    {t("common.organizationAccess")}
                  </button>
                  {showAdminNav && (
                    <button type="button" onClick={startTour}>
                      {t("tour.replay")}
                    </button>
                  )}
                  <button type="button" onClick={handleLogout}>
                    {t("common.logout")}
                  </button>
                </div>
              )}
            </div>
          </nav>
        )}
        <div className={styles.rightSection}>
          <LanguageSwitcher />
          <div className={styles.authButton}>
            {keycloak && !keycloak.authenticated && (
              <button onClick={handleLogin}>
                <span>{t("common.login")}</span>
                <img src="/resources/img/login.png" alt="" />
              </button>
            )}
            {keycloak && keycloak.authenticated && (
              <div className={styles.userDropdown} ref={dropdownRef}>
                <div
                  className={styles.username}
                  onClick={() => setShowDropdown(!showDropdown)}
                >
                  {displayName}
                </div>
                {showDropdown && (
                  <div className={styles.dropdownContent}>
                    <button
                      onClick={() => {
                        setShowDropdown(false)
                        router.push('/profile')
                      }}
                    >
                      <span>{t("common.profile")}</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowDropdown(false)
                        router.push('/party')
                      }}
                    >
                      <span>{t("common.myParty")}</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowDropdown(false)
                        router.push('/organization-access')
                      }}
                    >
                      <span>{t("common.organizationAccess")}</span>
                    </button>
                    {showAdminNav && (
                      <button onClick={startTour}>
                        <span>{t("tour.replay")}</span>
                      </button>
                    )}
                    <button onClick={handleLogout}>
                      <span>{t("common.logout")}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {showAdminNav && <AdminTour />}
    </header>
  );
};

export default Header
