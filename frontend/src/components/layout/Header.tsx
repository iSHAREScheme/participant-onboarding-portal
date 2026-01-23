import React from "react"
import { useState, useEffect, useRef } from "react"
import styles from "styles/components/Header.module.css"
import { useKeycloak } from "@react-keycloak/web"
import { useLanguage } from "../../context/LanguageContext"
import { useSettings } from "../../context/SettingsContext"
import { useTheme } from "../../hooks/useTheme"
import LanguageSwitcher from "../LanguageSwitcher"
import { getPublicEnv } from "config/publicEnv"
import { clearStoredKeycloakTokens } from "util/keycloakTokens"

const Header: React.FC = () => {
  const [currentPath, setCurrentPath] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { t } = useLanguage()
  const { logoUrl } = useSettings()
  const { keycloak } = useKeycloak()
  const { logo, tenantId } = useTheme()

  const env = getPublicEnv()
  const defaultAssociationName = env.NEXT_PUBLIC_DEFAULT_ASSOCIATION_NAME || ''
  const idpOnly = env.NEXT_PUBLIC_IDP_ONLY === "true"
  const keycloakIdp = env.NEXT_PUBLIC_KEYCLOAK_IDP
  const adminRoutesDisabled = env.NEXT_PUBLIC_DISABLE_ADMIN_ROUTES === "true"
  const idpHint =
    idpOnly && keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
      ? keycloakIdp
      : undefined

  const [associationName, setAssociationName] = useState(
    tenantId && tenantId !== 'default' ? tenantId : defaultAssociationName
  )

  useEffect(() => {
    setCurrentPath(window.location.pathname)
  }, [t])

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

  const handleLogin = () => {
    keycloak.login(
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
    keycloak.logout({
      redirectUri: window.location.origin
    });
  };

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div
          className={styles.associationName}
          onClick={() => {
            // Don't navigate away if user is in registration process
            if (window.location.pathname === "/register") {
              return;
            }
            window.location.href = "/";
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
          <span className={styles.associationText}>{associationName}</span>
        </div>
        {keycloak?.authenticated && keycloak.hasRealmRole("onboarding-admin") && !adminRoutesDisabled && (
          <nav className={styles.navbar}>
            <ul>
              <li>
                <a
                  href="/admin"
                  className={currentPath === "/admin" ? styles.active : ""}
                >
                  {t("common.proposals")}
                </a>
              </li>
              <li>
                <a
                  href="/users"
                  className={currentPath === "/users" ? styles.active : ""}
                >
                  {t("common.users")}
                </a>
              </li>
              <li>
                <a
                  href="/settings"
                  className={currentPath === "/settings" ? styles.active : ""}
                >
                  {t("common.settings")}
                </a>
              </li>
            </ul>
          </nav>
        )}
        <div className={styles.rightSection}>
          <LanguageSwitcher />
          <div className={styles.authButton}>
            {keycloak && !keycloak.authenticated && (
              <button onClick={handleLogin}>
                <span>{t("common.login")}</span>
                <img src="/resources/img/login.png" />
              </button>
            )}
            {keycloak && keycloak.authenticated && (
              <div className={styles.userDropdown} ref={dropdownRef}>
                <div
                  className={styles.username}
                  onClick={() => setShowDropdown(!showDropdown)}
                >
                  {keycloak.tokenParsed?.preferred_username}
                </div>
                {showDropdown && (
                  <div className={styles.dropdownContent}>
                    <button onClick={() => window.location.href = '/profile'}>
                      <span>{t("common.profile")}</span>
                    </button>
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
    </header>
  );
};

export default Header
