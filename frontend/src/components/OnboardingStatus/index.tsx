import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
import styles from 'styles/components/OnboardingStatus.module.css';

interface OnboardingStatusProps {
  onSignAgreements: () => void;
}

const OnboardingStatus: React.FC<OnboardingStatusProps> = ({ onSignAgreements }) => {
  const { t } = useLanguage();

  return (
    <div className={styles.statusContainer}>
      <h2 className={styles.title}>{t("onboarding.status.title", "Onboarding status")}</h2>

      <div className={styles.stepsList}>
        <div className={`${styles.step} ${styles.completed}`}>
          <div className={styles.stepIcon}>
            <img src="/icons/done.svg" alt="Done" className={styles.iconImage} />
          </div>
          <span className={styles.stepText}>
            {t("onboarding.status.formCompleted", "Form completed")}
          </span>
        </div>

        <div className={`${styles.step} ${styles.completed}`}>
          <div className={styles.stepIcon}>
            <img src="/icons/done.svg" alt="Done" className={styles.iconImage} />
          </div>
          <span className={styles.stepText}>
            {t("onboarding.status.verifiedInformation", "Association verified information")}
          </span>
        </div>

        <div className={`${styles.step} ${styles.current}`}>
          <div className={styles.stepIcon}>
            <img src="/icons/document_signing.svg" alt="Document Signing" className={styles.iconImage} />
          </div>
          <div className={styles.stepContent}>
            <div className={styles.stepTitle}>
              {t("onboarding.status.uploadSignedAgreements", "Upload signed agreements")}
            </div>
            <div className={styles.buttonContainer}>
              <button className={styles.signButton} onClick={onSignAgreements}>
                {t("onboarding.status.signAgreements", "Sign agreements")}
                <img src="/icons/arrow-next.svg" alt="Next" className={styles.arrowIcon} />
              </button>
            </div>
          </div>
        </div>

        <div className={`${styles.step} ${styles.pending}`}>
          <div className={styles.stepIcon}>
            <img src="/icons/done.svg" alt="Done" className={styles.iconImage} />
          </div>
          <span className={styles.stepText}>
            {t("onboarding.status.verifySignedAgreements", "Association verifies signed agreements")}
          </span>
        </div>

        <div className={`${styles.step} ${styles.pending}`}>
          <div className={styles.stepIcon}>
            <img src="/icons/confetti 1.svg" alt="Confetti" className={styles.iconImage} />
          </div>
          <span className={styles.stepText}>
            {t("onboarding.status.onboardingComplete", "Onboarding complete")}
          </span>
        </div>
      </div>
    </div>
  );
};

export default OnboardingStatus;