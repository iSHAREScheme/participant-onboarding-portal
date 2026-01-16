import { useState, useMemo, useCallback, MouseEvent } from "react"
import { NextPage } from "next"
import styles from "styles/Admin.module.css"
import { useRouter } from "next/router"
import AdminRoute from "components/AdminRoute"
import { useLanguage } from "../context/LanguageContext"
import { getPublicEnv } from "config/publicEnv"

import API from 'api/client'

interface Application {
  id: number
  applicant: string
  company: string
  role: string
  status:
    | "Initiated"
    | "Verify information"
    | "Sign agreements"
    | "Verify signed agreements"
    | "Completed"
    | "Rejected"
  nextStepBy: string
}

interface BackendData {
  id: number
  companyName: string
  kvkNumber: string
  dataOwner: boolean
  dataConsumer: boolean
  dataProvider: boolean
  useM2M: string
  address: string
  zipCode: string
  city: string
  country: string
  website: string
  authRegistry: string
  capabilitiesUrl: string
  cttProofPath: string
  contactName: string
  contactEmail: string
  contactPhone: string
  status: string
  createdAt: string
}

const transformBackendData = (data: BackendData): Application => {
  const roles = [
    data.dataOwner && "Data Owner",
    data.dataConsumer && "Data Consumer",
    data.dataProvider && "Data Provider",
  ]
    .filter(Boolean)
    .join(", ")

  return {
    id: data.id,
    applicant: data.contactName,
    company: data.companyName,
    role: roles || "No role specified",
    status: mapStatus(data.status),
    nextStepBy: mapStatusToNextStep(data.status),
  }
}

const mapStatus = (backendStatus: string): Application["status"] => {
  switch (backendStatus.toLowerCase()) {
    case "pending":
      return "Verify information"
    case "approved":
      return "Sign agreements"
    case "signed":
      return "Verify signed agreements"
    case "completed":
      return "Completed"
    case "rejected":
      return "Rejected"
    default:
      return "Initiated"
  }
}

const mapStatusToNextStep = (
  backendStatus: string
): Application["nextStepBy"] => {
  switch (backendStatus.toLowerCase()) {
    case "pending":
      return "Admin"
    case "approved":
      return "User"
    case "signed":
      return "Admin"
    case "completed":
      return "-"
    case "rejected":
      return "-"
    default:
      return "User"
  }
}

const Admin: NextPage = () => {
  const router = useRouter()
  const [applications, setApplications] = useState<Application[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const { t } = useLanguage()

  const api = useMemo(() => new API(), [])

  const loadApplications = useCallback(async () => {
    const { NEXT_PUBLIC_BASE_SERVER_URL } = getPublicEnv()
    if (!NEXT_PUBLIC_BASE_SERVER_URL) {
      setError(t('settings.messages.backendNotConfigured'))
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const response = await api.listProposals()
      const data: BackendData[] = await response.data
      const transformedData = data.map(transformBackendData)
      setApplications(transformedData)
    } catch (err) {
      console.error("Error fetching applications:", err)
      setError(t('admin.messages.loadFailed'))
    } finally {
      setIsLoading(false)
    }
  }, [api, t])

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "Initiated":
        return styles.initiated
      case "Verify information":
        return styles.verifyInfo
      case "Sign agreements":
        return styles.signAgreements
      case "Verify signed agreements":
        return styles.verifyAgreements
      case "Completed":
        return styles.completed
      case "Rejected":
        return styles.rejected
      default:
        return ""
    }
  }

  const handleVerifyClick = (e: MouseEvent<HTMLButtonElement>, applicationId: number) => {
    e.preventDefault()
    router.replace(`/admin/verify/${applicationId}`)
  }

  return (
    <AdminRoute fetchData={loadApplications}>
      <div className={styles.container}>
        <h1 className={styles.title}>{t('admin.title')}</h1>
        {error && <p className={styles.errorMessage}>{error}</p>}
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('admin.table.headers.applicant')}</th>
              <th>{t('admin.table.headers.company')}</th>
              <th>{t('admin.table.headers.role')}</th>
              <th>
                {t('admin.table.headers.status')}
                <svg
                  className={styles.sortIcon}
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path d="M8 10L4 6H12L8 10Z" fill="currentColor" />
                </svg>
              </th>
              <th>
                {t('admin.table.headers.nextStepBy')}
                <svg
                  className={styles.sortIcon}
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path d="M8 10L4 6H12L8 10Z" fill="currentColor" />
                </svg>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !applications.length ? (
              <tr>
                <td colSpan={6}>{t('common.loading')}</td>
              </tr>
            ) : (
              applications.map((app, index) => (
                <tr key={index}>
                  <td>{app.applicant || t('admin.common.na')}</td>
                  <td>{app.company || t('admin.common.na')}</td>
                  <td>{app.role || t('admin.common.na')}</td>
                  <td>
                    <span
                      className={`${styles.status} ${getStatusStyle(app.status)}`}
                    >
                      {t(`admin.status.${app.status.toLowerCase().replace(/\s+/g, '_')}`)}
                    </span>
                  </td>
                  <td>{app.nextStepBy || t('admin.common.na')}</td>
                  <td className={styles.actions}>
                    {!["Completed", "Rejected", "Sign agreements"].includes(app.status) && (
                      <button
                        className={styles.verifyButton}
                        onClick={(e) => handleVerifyClick(e, app.id)}
                      >
                        {t('admin.actions.verify')}
                        <svg
                          className={styles.arrowIcon}
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M6 12L10 8L6 4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                    <button
                      className={styles.viewButton}
                      onClick={(e) => {
                        e.preventDefault()
                        router.replace(`/admin/view/${app.id}`)
                      }}
                    >
                      {t('admin.actions.view')}
                      <svg
                        className={styles.arrowIcon}
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                      >
                        <path
                          d="M6 12L10 8L6 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminRoute>
  )
}

export default Admin
