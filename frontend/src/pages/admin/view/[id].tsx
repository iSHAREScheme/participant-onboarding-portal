import { NextPage } from "next";
import { useState, useEffect } from "react";
import styles from "styles/Verify.module.css";
import { useRouter } from "next/router";
import AdminRoute from "components/AdminRoute";
import { useLanguage } from "../../../context/LanguageContext";
import API from "api/client"
import { getPublicEnv } from "config/publicEnv"

interface BackendData {
  id: string;
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
}

const ViewApplication: NextPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [proposalData, setProposalData] = useState<BackendData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useLanguage();

  const [Api] = useState(() => new API())

  useEffect(() => {
    const fetchProposal = async () => {
      if (!id) return;

      try {
        setIsLoading(true);
        const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
        if (!baseUrl) {
          throw new Error("Backend URL not configured");
        }

        const response = await Api.fetchProposal(String(id)) 
        const data: BackendData = await response.data
        setProposalData(data)
      } catch (error) {
        console.error("Error fetching proposal:", error)
      } finally {
        setIsLoading(false)
      }
    };

    fetchProposal();
  }, [id, Api]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!proposalData) {
    return <div>Proposal not found</div>;
  }

  return (
    <AdminRoute fetchData={() => {}}>
      <div className={styles.content}>
        <h1 className={styles.title}>{proposalData.companyName}</h1>
        <p className={styles.subtitle}>
          {t("admin.view.subtitle", {
            kvkNumber: proposalData.kvkNumber.toString() || "kvk",
          })}
        </p>

        <div className={styles.details}>
          <div className={styles.row}>
            <div className={styles.label}>{t("admin.view.labels.status")}</div>
            <div className={styles.value}>{proposalData.status}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>{t("admin.view.labels.role")}</div>
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
              {t("admin.view.labels.m2mServices")}
            </div>
            <div className={styles.value}>{proposalData.useM2M}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("admin.view.labels.location")}
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
              {t("admin.view.labels.authRegistry")}
            </div>
            <div className={styles.value}>{proposalData.authRegistry}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("admin.view.labels.capabilitiesUrl")}
            </div>
            <div className={styles.value}>
              <a
                href={proposalData.capabilitiesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                {proposalData.capabilitiesUrl}
              </a>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("admin.view.labels.cttProof")}
            </div>
            <div className={styles.value}>{proposalData.cttProofPath}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("admin.view.labels.accountName")}
            </div>
            <div className={styles.value}>{proposalData.contactName}</div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("admin.view.labels.accountEmail")}
            </div>
            <div className={styles.value}>
              <a
                href={`mailto:${proposalData.contactEmail}`}
                className={styles.link}
              >
                {proposalData.contactEmail}
              </a>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("admin.view.labels.accountPhone")}
            </div>
            <div className={styles.value}>
              <a
                href={`tel:${proposalData.contactPhone}`}
                className={styles.link}
              >
                {proposalData.contactPhone}
              </a>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.label}>
              {t("admin.view.labels.createdAt")}
            </div>
            <div className={styles.value}>
              {new Date(proposalData.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.backButton}
            onClick={() => router.push("/admin")}
          >
            {t("common.back")}
          </button>
        </div>
      </div>
    </AdminRoute>
  );
};

export default ViewApplication;
