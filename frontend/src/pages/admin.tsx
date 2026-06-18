import { useState, useMemo, useCallback, MouseEvent } from "react"
import { NextPage } from "next"
import styles from "styles/Admin.module.css"
import { useRouter } from "next/router"
import AdminRoute from "components/AdminRoute"
import Pagination from "components/Pagination"
import { useFitRows } from "hooks"
import { useLanguage } from "../context/LanguageContext"
import { getPublicEnv } from "config/publicEnv"
import { PATH } from "const"

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
  const [page, setPage] = useState<number>(1)
  const { t } = useLanguage()

  const api = useMemo(() => new API(), [])

  // Fill the viewport: how many rows fit decides the client-side page size.
  // Rows here carry action buttons (~0.5rem padding) on top of the 0.6rem cell
  // padding, so each is ~53px tall; round up slightly to avoid an internal scroll.
  const { rows: pageSize, ref: fitRef } = useFitRows({
    rowHeight: 54,
    recomputeKey: applications.length,
  })

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
      setPage(1)
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

  // Client-side pagination over the loaded proposals, sized to fill the screen.
  const size = pageSize ?? 10
  const totalPages = Math.max(1, Math.ceil(applications.length / size))
  // Keep the current page in range as the data or page size changes. Clamping during
  // render (instead of in an effect) avoids react-hooks/set-state-in-effect and the
  // extra commit an effect adds: React re-renders synchronously after this setState
  // and the condition is already satisfied on the next pass.
  if (page > totalPages) {
    setPage(totalPages)
  }
  const pageItems = applications.slice((page - 1) * size, page * size)
  const blankRows =
    applications.length > 0 ? Math.max(0, size - pageItems.length) : 0

  return (
    <AdminRoute fetchData={loadApplications}>
      <div className={styles.container}>
        <div className={styles.headerSection}>
          <button
            className={styles.createButton}
            data-tour="proposals-create"
            onClick={() => router.push(PATH.SUBMIT)}
          >
            {t('admin.actions.createParty')}
          </button>
        </div>

        {/* The scroll container always renders so useFitRows can measure the real
            available height (its clientHeight) even before the first row loads. */}
        <div ref={fitRef} className={styles.tableWrap} data-tour="proposals-table">
          {isLoading && (
            <div className={styles.loading}>{t('common.loading')}</div>
          )}
          {error && <div className={styles.error}>{error}</div>}

          {!isLoading && !error && (
            <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('admin.table.headers.applicant')}</th>
                <th>{t('admin.table.headers.company')}</th>
                <th>{t('admin.table.headers.role')}</th>
                <th>{t('admin.table.headers.status')}</th>
                <th>{t('admin.table.headers.nextStepBy')}</th>
                <th>{t('admin.table.headers.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((app) => (
                <tr key={app.id}>
                  <td data-label={t('admin.table.headers.applicant')}>{app.applicant || t('admin.common.na')}</td>
                  <td data-label={t('admin.table.headers.company')}>{app.company || t('admin.common.na')}</td>
                  <td data-label={t('admin.table.headers.role')}>{app.role || t('admin.common.na')}</td>
                  <td data-label={t('admin.table.headers.status')}>
                    <span
                      className={`${styles.status} ${getStatusStyle(app.status)}`}
                    >
                      {t(`admin.status.${app.status.toLowerCase().replace(/\s+/g, '_')}`)}
                    </span>
                  </td>
                  <td data-label={t('admin.table.headers.nextStepBy')}>{app.nextStepBy || t('admin.common.na')}</td>
                  <td className={styles.actions} data-label={t('admin.table.headers.actions')}>
                    {!["Completed", "Rejected", "Sign agreements"].includes(app.status) && (
                      <button
                        className={styles.verifyButton}
                        onClick={(e) => handleVerifyClick(e, app.id)}
                      >
                        {t('admin.actions.verify')}
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
                    </button>
                  </td>
                </tr>
              ))}
              {/* Pad short pages with blank rows so the table height stays
                  constant across pages (desktop only; cards on mobile hide them). */}
              {totalPages > 1 &&
                Array.from({ length: blankRows }).map((_, i) => (
                  <tr key={`empty-${i}`} aria-hidden="true">
                    <td colSpan={6}>&nbsp;</td>
                  </tr>
                ))}
            </tbody>
            </table>
          )}
        </div>

        <div className={styles.pagerSlot}>
          {!isLoading && !error && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
    </AdminRoute>
  )
}

export default Admin
