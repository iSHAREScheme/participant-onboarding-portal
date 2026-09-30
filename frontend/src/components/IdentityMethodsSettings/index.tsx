import styles from "../../styles/Settings.module.css";
import { useLanguage } from "../../context/LanguageContext";
import { getPublicEnv } from "config/publicEnv";
import { IDENTITY_METHODS, type IdentityMethod } from "config/identityMethods";

// Deployment-wide choice of how applicants may prove who they are. Each
// onboarding flow can override it, so every dataspace's onboarding UI offers
// exactly the identity options that dataspace accepts. Saved with the rest of
// the Onboarding tab.

interface Props {
  value: IdentityMethod[];
  onChange: (methods: IdentityMethod[]) => void;
}

const IdentityMethodsSettings: React.FC<Props> = ({ value, onChange }) => {
  const { t } = useLanguage();
  const idp = getPublicEnv().NEXT_PUBLIC_KEYCLOAK_IDP;
  const eherkenningBrokerConfigured = Boolean(idp && idp !== "undefined");

  const toggle = (method: IdentityMethod, checked: boolean) => {
    const next = checked ? [...value, method] : value.filter((m) => m !== method);
    // Applicants must always have at least one way to prove their identity.
    if (next.length === 0) return;
    onChange(IDENTITY_METHODS.filter((m) => next.includes(m)));
  };

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t("settings.identityMethods.title")}</h2>
      <p className={styles.cardHint}>{t("settings.identityMethods.hint")}</p>

      {IDENTITY_METHODS.map((method) => (
        <div className={styles.formGroup} key={method}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={value.includes(method)}
              onChange={(e) => toggle(method, e.target.checked)}
            />
            {t(`settings.identityMethods.${method}`)}
          </label>
          {method === "vc" && (
            <p className={styles.helperText}>{t("settings.identityMethods.vcHint")}</p>
          )}
          {method === "eherkenning" && !eherkenningBrokerConfigured && (
            <p className={styles.helperText}>{t("settings.identityMethods.eherkenningHint")}</p>
          )}
        </div>
      ))}
    </section>
  );
};

export default IdentityMethodsSettings;
