import { NextPage } from "next";
import { useMemo, useState } from "react";
import styles from "styles/Verify.module.css";
import { useRouter } from "next/router";
import { useEffect } from "react";
import AdminRoute from "components/AdminRoute";
import { useLanguage } from "../../../context/LanguageContext";
import { useKeycloak } from "@react-keycloak/web"
import EmailNotification from "util/notify"
import API from "api/client"
import { getPublicEnv } from "config/publicEnv"

type VerificationStep = "verify-info" | "verify-agreement";

interface BackendData {
  id: number;
  companyName: string;
  kvkNumber: string;
  dataOwner: boolean;
  dataConsumer: boolean;
  dataProvider: boolean;
  useM2M: string;
  address: string;
  zipCode: string;
  city: string;
  country: string;
  website: string;
  authRegistry: string;
  capabilitiesUrl: string;
  cttProofPath: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
  createdAt: string;
  signedAgreementPaths?: string[];
  signedVia?: string;
  keycloakUsername: string;
}

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getHeaderValue = (headers: any, name: string) => {
  if (!headers) return undefined;
  if (typeof headers.get === "function") {
    return headers.get(name) as string | undefined;
  }
  return headers[name.toLowerCase()] as string | undefined;
};

const getFilenameFromContentDisposition = (contentDisposition?: string | null) => {
  if (!contentDisposition) return undefined;

  const filenameStarMatch = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(contentDisposition);
  if (filenameStarMatch?.[1]) {
    return safeDecodeURIComponent(filenameStarMatch[1].replace(/^"|"$/g, ""));
  }

  const filenameMatch = /filename=([^;]+)/i.exec(contentDisposition);
  if (filenameMatch?.[1]) {
    return filenameMatch[1].replace(/^"|"$/g, "");
  }

  return undefined;
};

const getErrorMessageFromPayload = (payload: any) => {
  if (!payload) return undefined;
  if (typeof payload === "string") return payload;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.detail === "string") return payload.detail;
  return undefined;
};

const VerifyApplication: NextPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [currentStep, setCurrentStep] =
    useState<VerificationStep>("verify-info");
  const [proposalData, setProposalData] = useState<BackendData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useLanguage();
  const api = useMemo(() => new API(), [])

  useEffect(() => {
    const fetchProposal = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
        if (!baseUrl) {
          throw new Error("Backend URL not configured");
        }

        const response = await api.fetchProposal(String(id))
        
        const data: BackendData = await response.data
        setProposalData(data)

        // Redirect to admin page if status is already approved
        if (data.status === "approved") {
          router.replace("/admin")
          return
        }

        // Set step to verify-agreement if status is signed
        if (data.status === "signed") {
          setCurrentStep("verify-agreement");
        } else {
          setCurrentStep("verify-info");
        }
      } catch (error) {
        console.error("Error fetching proposal:", error)
      } finally {
        setIsLoading(false);
      }
    };

    fetchProposal();
  }, [api, id, router]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!proposalData) {
    return <div>Proposal not found</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.stepsContainer}>
        <div className={styles.stepWrapper}>
          <div className={`${styles.content} ${styles.completed}`}>
            {t("verify.steps.verifyInfo")}
          </div>
          <div
            className={`${styles.step} ${
              currentStep === "verify-info" ? styles.active : styles.completed
            }`}
          ></div>
        </div>
        <div className={styles.stepWrapper}>
          <div
            className={`${styles.content} ${
              currentStep === "verify-agreement"
                ? styles.completed
                : currentStep === "verify-info"
                ? styles.incomplete
                : styles.completed
            }`}
          >
            {t("verify.steps.verifyAgreement")}
          </div>
          <div
            className={`${styles.step} ${
              currentStep === "verify-agreement"
                ? styles.active
                : currentStep === "verify-info"
                ? styles.incomplete
                : styles.completed
            }`}
          ></div>
        </div>
      </div>

      <div className={styles.content}>
        {currentStep === "verify-info" && (
          <VerifyInfoStep
            api={api}
            onApprove={() => setCurrentStep("verify-agreement")}
            proposalData={proposalData}
          />
        )}
        {currentStep === "verify-agreement" && (
          <VerifyAgreementStep api={api} proposalData={proposalData} />
        )}
      </div>
    </div>
  );
};

interface VerifyAgreementStepProps {
  api: API
  proposalData: BackendData;
}

const VerifyAgreementStep = ({ api, proposalData }: VerifyAgreementStepProps) => {
  const { t } = useLanguage();
  const router = useRouter();
  const { keycloak } = useKeycloak();
  
  const { id } = router.query;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const approveFailedMessage = t("verify.agreement.errors.approveFailed");

  const handleApprove = async () => {
    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
      if (!baseUrl) {
        throw new Error("Backend URL not configured");
      }

      const response = await api.completeProposal(String(id))
      const payloadError = getErrorMessageFromPayload(response.data);
      const payloadCode = typeof response.data?.code === "number" ? response.data.code : undefined;
      if (response.status < 200 || response.status >= 300 || (payloadCode && payloadCode >= 400)) {
        setSubmitError(payloadError || approveFailedMessage)
        return
      }

      if (keycloak) {
        void EmailNotification.agreementAccepted(keycloak, String(id), {
          username: proposalData.keycloakUsername,
          email: proposalData.contactEmail,
        })
      }

      // Redirect to admin page
      router.push("/admin");
    } catch (error) {
      console.error("Error completing proposal:", error);
      const payloadError = getErrorMessageFromPayload((error as any)?.response?.data);
      setSubmitError(payloadError || approveFailedMessage)
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsSubmitting(true);
      const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
      if (!baseUrl) {
        throw new Error("Backend URL not configured");
      }

      const response = await api.rejectProposal(String(id))

      if (keycloak) {
        void EmailNotification.agreementRejected(keycloak, String(id), {
          username: proposalData.keycloakUsername,
          email: proposalData.contactEmail,
        })
      }

      // Redirect to admin page
      router.push("/admin");
    } catch (error) {
      console.error("Error rejecting proposal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownload = async (index: number) => {
    try {
      const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
      if (!baseUrl) {
        throw new Error("Backend URL not configured");
      }

      const response = await api.downloadProposalAgreement(String(id), index)

      const contentDisposition = getHeaderValue(response.headers, "content-disposition");
      const contentType = getHeaderValue(response.headers, "content-type");
      const filename =
        getFilenameFromContentDisposition(contentDisposition) ||
        `signed-agreement-${index + 1}.pdf`

      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: contentType || "application/pdf" })

      // Create download link and trigger download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading agreement:", error);
      alert(t("verify.steps.downloadError"));
    }
  };

  const isEherkenningSigned = proposalData.signedVia === "eherkenning";

  return (
    <div className={styles.content}>
      <h1 className={styles.title}>
        {isEherkenningSigned
          ? t("verify.agreement.eherkenningTitle")
          : t("verify.agreement.title")}
      </h1>
      <p className={styles.subtitle}>
        {isEherkenningSigned
          ? t("verify.agreement.eherkenningSubtitle")
          : t("verify.agreement.subtitle")}
      </p>
      {submitError && (
        <div className={styles.errorMessage} role="alert">
          <div>{approveFailedMessage}</div>
          {submitError !== approveFailedMessage && <div>{submitError}</div>}
        </div>
      )}

      <div className={styles.downloadSection}>
        {proposalData.signedAgreementPaths?.map((_, index) => (
          <button
            key={index}
            className={styles.downloadLink}
            onClick={() => handleDownload(index)}
          >
            {t("verify.agreement.downloadText", { number: index + 1 })}
            <svg
              className={styles.downloadIcon}
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
            >
              <path
                d="M10 13L10 3M10 13L7 10M10 13L13 10M3 17H17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          className={styles.approveButton}
          onClick={handleApprove}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? t("verify.agreement.buttons.approving")
            : t("verify.agreement.buttons.approve")}
        </button>
        <button
          className={styles.insufficientButton}
          onClick={handleReject}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? t("verify.agreement.buttons.rejecting")
            : t("verify.agreement.buttons.reject")}
        </button>
      </div>
    </div>
  );
};

interface VerifyInfoStepProps {
  api: API
  onApprove: () => void;
  proposalData: BackendData;
}

const VerifyInfoStep = ({ api, onApprove, proposalData }: VerifyInfoStepProps) => {
  const { t } = useLanguage();
  const router = useRouter();
  const { keycloak } = useKeycloak();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleApprove = async () => {
    try {
      setIsSubmitting(true);
      const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
      if (!baseUrl) {
        throw new Error("Backend URL not configured");
      }

      const response = await api.approveProposal(proposalData.id) 

      if (keycloak) {
        void EmailNotification.proposalAccepted(keycloak, String(proposalData.id), {
          username: proposalData.keycloakUsername,
          email: proposalData.contactEmail,
        })
      }

      // Redirect to admin page
      router.push("/admin")
    } catch (error) {
      console.error("Error approving proposal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    try {
      setIsSubmitting(true);
      const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
      if (!baseUrl) {
        throw new Error("Backend URL not configured");
      }

      const response = await api.rejectProposal(proposalData.id)

      if (keycloak) {
        void EmailNotification.proposalRejected(keycloak, String(proposalData.id), {
          username: proposalData.keycloakUsername,
          email: proposalData.contactEmail,
        })
      }

      // Redirect to admin page
      router.push("/admin");
    } catch (error) {
      console.error("Error rejecting proposal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminRoute fetchData={() => {}}>
      <div className={styles.content}>
        <h1 className={styles.title}>{proposalData.companyName}</h1>
        <p className={styles.subtitle}>
          {t("verify.info.subtitle", {
            kvkNumber: proposalData.kvkNumber.toString() || "kvk",
          })}
        </p>

        <div className={styles.details}>
          <div className={styles.row}>
            <div className={styles.label}>{t("verify.info.labels.role")}</div>
            <div className={styles.value}>
              {[
                proposalData.dataOwner && "Data Owner",
                proposalData.dataConsumer && "Data Consumer",
                proposalData.dataProvider && "Data Provider",
              ]
                .filter(Boolean)
                .join(", ")}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("verify.info.labels.m2mServices")}
            </div>
            <div className={styles.value}>{proposalData.useM2M}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("verify.info.labels.location")}
            </div>
            <div className={styles.valueGroup}>
              <div>{proposalData.address}</div>
              <div>{proposalData.zipCode}</div>
              <div>{proposalData.city}</div>
              <div>{proposalData.country}</div>
              <div>{proposalData.website}</div>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("verify.info.labels.authRegistry")}
            </div>
            <div className={styles.value}>{proposalData.authRegistry}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("verify.info.labels.capabilitiesUrl")}
            </div>
            <div className={styles.value}>{proposalData.capabilitiesUrl}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("verify.info.labels.cttProof")}
            </div>
            <div className={styles.value}>{proposalData.cttProofPath}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("verify.info.labels.accountName")}
            </div>
            <div className={styles.value}>{proposalData.contactName}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("verify.info.labels.accountEmail")}
            </div>
            <div className={styles.value}>{proposalData.contactEmail}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("verify.info.labels.accountPhone")}
            </div>
            <div className={styles.value}>{proposalData.contactPhone}</div>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.approveButton}
            onClick={handleApprove}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? t("verify.info.buttons.approving")
              : t("verify.info.buttons.approve")}
          </button>
          <button
            className={styles.insufficientButton}
            onClick={handleReject}
            disabled={isSubmitting}
          >
            {t("verify.info.buttons.insufficient")}
          </button>
        </div>
      </div>
    </AdminRoute>
  );
};

export default VerifyApplication;
