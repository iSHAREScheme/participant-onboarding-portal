import Axios from "axios"
import type { AxiosInstance } from "axios"
import { getStoredAccessToken } from "util/keycloakTokens"

export interface ProposalData {
  roles: {
    dataOwner: boolean
    dataConsumer: boolean
    dataProvider: boolean
  }
  m2m: {
    useM2M: "yes" | "no" | ""
  }
  idCheck: {
    idCheckMethod?: string // e.g., "eherkenning" or "eidas"
    companyName: string
    kvkNumber: string
    partyId: string
    partyName: string
  }
  eidasCert?: File
  location: {
    address: string
    zipCode: string
    city: string
    country: string
    website: string
  }
  association: {
    authRegistry: string
    capabilitiesUrl: string
    cttProof: File | null
    authRegistryName: string
    authRegistryUrl: string
  }
  account: {
    name: string
    email: string
    phone: string
  }
  keycloakUsername: string
  status: string
  agreements: {
    eherkenningConsent: boolean
    termsConsent: boolean
    files: File[]
  }
  signingMethod: {
    method: "eherkenning" | "manual" | ""
  }
}

// ---------------------------------------------------------------------------
// Onboarding agreements
// ---------------------------------------------------------------------------

export type AgreementAuthMethod = "none" | "basic" | "bearer" | "oauth2" | "custom"

export interface AgreementHeaderInput {
  name: string
  value?: string
  secret?: boolean
}

// Sent to the backend when adding/updating a URL agreement. Secret fields
// (password, token, clientSecret, secret header values) may be left blank on
// update to keep the value already stored.
export interface AgreementAuthInput {
  method: AgreementAuthMethod
  username?: string
  password?: string
  headerName?: string
  scheme?: string
  token?: string
  tokenUrl?: string
  clientId?: string
  clientSecret?: string
  scope?: string
  headers?: AgreementHeaderInput[]
}

// The claim/agreement a document backs. v3: framework/dataspace agreement claims;
// v2: Terms of Use / Accession agreement.
export type AgreementClaimType =
  | "frameworkAgreement"
  | "dataspaceAgreement"
  | "TermsOfUse"
  | "AccessionAgreement"

export interface AgreementUrlInput {
  title: string
  version?: string
  type?: AgreementClaimType
  url: string
  auth?: AgreementAuthInput
}

// Redacted views returned by the backend — secrets are replaced by "*Set" flags.
export interface AgreementHeaderView {
  name: string
  value?: string
  secret: boolean
  valueSet: boolean
}

export interface AgreementAuthView {
  method: AgreementAuthMethod
  username?: string
  passwordSet: boolean
  headerName?: string
  scheme?: string
  tokenSet: boolean
  tokenUrl?: string
  clientId?: string
  clientSecretSet: boolean
  scope?: string
  headers?: AgreementHeaderView[]
}

export interface AgreementView {
  id: string
  title: string
  version: string
  source: "builtin" | "file" | "url" | "label"
  type: AgreementClaimType
  removable: boolean
  hasDocument: boolean
  url?: string
  auth?: AgreementAuthView
}

// ---------------------------------------------------------------------------
// iSHARE v3 claim-based participant model
// Mirrors the schemas in the v3 OpenAPI spec:
// https://raw.githubusercontent.com/iSHAREScheme/openapi/v3.0/ishare_openapi_spec.yaml
// A party is reduced to identity + a list of polymorphic claims, each
// discriminated by `type` and extending the shared claim skeleton.
// ---------------------------------------------------------------------------

export type ClaimStatus = "active" | "inactive" | "revoked" | "suspended"

export type ClaimType =
  | "frameworkCompliance"
  | "authRegistry"
  | "frameworkAgreement"
  | "dataspaceAgreement"
  | "frameworkRole"
  | "x509Certificate"
  | "dataspaceMembership"
  | "idpAssertion"

export type Loa = "low" | "substantial" | "high" | "not-applicable"
export type YesNoNa = "yes" | "no" | "not-applicable"

/** Fields shared by every claim (claimSkeleton in the spec). */
export interface ClaimBase {
  id?: string
  type: ClaimType
  registrarId: string
  status: ClaimStatus
  startDate?: string
  endDate?: string
}

export interface AdditionalInfo {
  description?: string
  logo?: string
  website?: string
  companyEmail?: string
  companyPhone?: string
  publiclyPublishable: boolean
  tags?: string
}

export interface FrameworkComplianceClaim extends ClaimBase {
  type: "frameworkCompliance"
  frameworkId: string
  capabilityUrl?: string
  additionalInfo?: AdditionalInfo
}

export interface AuthRegistryClaim extends ClaimBase {
  type: "authRegistry"
  name: string
  authRegistryId: string
  authUrl: string
  dataspaceId?: string
  serviceProviderPartyId?: string
}

export interface FrameworkAgreementClaim extends ClaimBase {
  type: "frameworkAgreement"
  frameworkId: string
  agreementType: string
  agreementId: string
  title: string
  verificationHash?: string
}

export interface FrameworkRoleClaim extends ClaimBase {
  type: "frameworkRole"
  frameworkId: string
  roleId: string
  title?: string
  loa: Loa
  compliancyVerified: YesNoNa
  legalAdherence: YesNoNa
}

export interface X509CertificateClaim extends ClaimBase {
  type: "x509Certificate"
  subjectName: string
  certificateType: string
  x5c: string
  "x5t#s256": string
}

export interface DataspaceMembershipClaim extends ClaimBase {
  type: "dataspaceMembership"
  dataspaceId: string
  capabilityUrl?: string
  legalAdherence: YesNoNa
  additionalInfo?: AdditionalInfo
}

export interface IdpAssertionClaim extends ClaimBase {
  type: "idpAssertion"
  assertion: string
}

export type Claim =
  | FrameworkComplianceClaim
  | AuthRegistryClaim
  | FrameworkAgreementClaim
  | FrameworkRoleClaim
  | X509CertificateClaim
  | DataspaceMembershipClaim
  | IdpAssertionClaim

/** v3 participant identity wrapper (party in the spec). */
export interface Party {
  id: string
  name: string
  alsoKnownAs?: string[]
  schemaVersion: "v3.0"
  claims: Claim[]
}

export interface DelegationOrganization {
  id: number
  kvkNumber: string
  companyName?: string
}

export interface DelegationMember {
  id: number
  organizationId: number
  organization?: DelegationOrganization
  email: string
  keycloakSubject?: string
  username?: string
  providerAlias?: string
  role: string
  status: string
  createdAt: string
}

export interface DelegationIdpConnection {
  id: number
  organizationId: number
  providerType: string
  alias: string
  displayName?: string
  issuerUrl?: string
  clientId?: string
  status: string
  createdAt: string
}

export interface DelegationOverview {
  verifiedOrganization?: DelegationOrganization
  memberships: DelegationMember[]
  idpConnections: DelegationIdpConnection[]
  members: DelegationMember[]
}

export class API {
  public client: AxiosInstance
  constructor () {
    // proxy @pages/api/backend
    this.client = Axios.create({ baseURL: '/api/backend' })

    // Attach current Keycloak token to every request (browser only)
    this.client.interceptors.request.use((config) => {
      if (typeof window !== 'undefined') {
        const token = getStoredAccessToken()
        if (token) {
          config.headers = config.headers || {}
          // Forward user session token
          ;(config.headers as any)['Authorization'] = `Bearer ${token}`
        }
      }
      return config
    })
  }

  submitInfo (data: any) {
    return this.client.post('/party', data)
  }

  // iSHARE v3 — create a claim-based participant.
  // Backend: POST /parties forwards this payload to the satellite's v3
  //   `register-new-party` endpoint (gated by SATELLITE_VERSION starting "3").
  submitParty (party: Party) {
    return this.client.post('/parties', party)
  }

  fetchProposalData (userId: string) {
    return this.client.get(`/party/proposals/users/${userId}`)
  }

  fetchProposal (proposalId: string) {
    return this.client.get(`/party/proposals/${proposalId}`)
  }

  listProposals () {
    return this.client.get(`/party/proposals`)
  }

  // Full settings (satellite config, registrar/dataspace IDs, theme library).
  // Requires authentication — use from admin/onboarding contexts only.
  fetchSettings () {
    return this.client.get(`/settings`)
  }

  // Public branding + content subset (description, theme, logo/favicon paths,
  // agreements). Safe to call unauthenticated (landing page, app-wide theming).
  fetchPublicSettings () {
    return this.client.get(`/settings/public`)
  }

  patchSettings (settings: Record<string, any>) {
    return this.client.post(`/settings`, settings)
  }

  // --- Onboarding agreements -------------------------------------------------
  // Redacted list of configured agreements (credentials never leave the backend).
  listAgreements () {
    return this.client.get(`/settings/agreements`)
  }
  // Admin: upload a PDF agreement. FormData fields: file, title, version.
  uploadAgreementFile (form: FormData) {
    return this.client.post(`/settings/agreements/file`, form)
  }
  // Admin: add a URL-backed agreement with optional fetch authentication.
  addAgreementUrl (body: AgreementUrlInput) {
    return this.client.post(`/settings/agreements/url`, body)
  }
  // Admin: edit an agreement's metadata / URL / auth. Blank secret fields keep
  // the value already stored.
  updateAgreement (id: string, body: AgreementUrlInput) {
    return this.client.put(`/settings/agreements/${encodeURIComponent(id)}`, body)
  }
  // Admin: remove an agreement (and its uploaded file, if any).
  deleteAgreement (id: string) {
    return this.client.delete(`/settings/agreements/${encodeURIComponent(id)}`)
  }
  // Href-safe public URL to view/download an agreement document via the proxy.
  agreementDocumentUrl (id: string) {
    return `/api/backend/settings/agreements/${encodeURIComponent(id)}/document`
  }

  fetchRegistry () {
    return this.client.get(`/registry`)
  }

  fetchAuthRegistries () {
    return this.fetchRegistry()
  }

  // Effective iSHARE framework version the backend operates against (auto-detected
  // at startup or the SATELLITE_VERSION fallback): { version, claimModel }.
  fetchSatelliteVersion () {
    return this.client.get(`/registry/version`)
  }

  // Resolved (env + Settings overrides) non-secret satellite connection details.
  fetchConnection () {
    return this.client.get(`/registry/connection`)
  }

  // Real connectivity test: owner-token exchange + version probe on the satellite.
  testConnection () {
    return this.client.post(`/registry/test`)
  }

  // Dataspaces registered in the Participant Registry: { dataspaces: [{id, title}] }.
  fetchDataspaces () {
    return this.client.get(`/registry/dataspaces`)
  }

  // Admin-only: list one page of participants from the satellite registry.
  // Pagination, name search and the active/certified filters are evaluated by
  // the satellite; the backend returns { data, page, pageSize, total, totalPages }.
  fetchParticipants (params?: {
    page?: number
    pageSize?: number
    name?: string
    activeOnly?: boolean
    certifiedOnly?: boolean
    mineOnly?: boolean
  }) {
    return this.client.get(`/registry/participants`, { params })
  }

  // Admin-only: fetch a single participant by its id/EORI (exact match) for the
  // detail view. Backend returns { data: <party object> }.
  fetchParticipantDetail (id: string) {
    return this.client.get(`/registry/participants/detail`, {
      params: { eori: id },
    })
  }

  // Admin-only party updates (proxied to the satellite).
  // v2.2: full replace via PUT /parties/{id}.
  updateParty (id: string, body: any) {
    return this.client.put(`/parties/${encodeURIComponent(id)}`, body)
  }
  // v3.0: partial update via PATCH /parties/{id} (update-party-information).
  patchParty (id: string, body: any) {
    return this.client.patch(`/parties/${encodeURIComponent(id)}`, body)
  }
  // v3.0: partial claim update via PATCH /parties/{id}/claims/{claimId}.
  patchClaim (id: string, claimId: string, body: any) {
    return this.client.patch(
      `/parties/${encodeURIComponent(id)}/claims/${encodeURIComponent(claimId)}`,
      body
    )
  }

  // create/update
  updateProposal (userId: string, data: ProposalData) {
    return this.client.put(`/party/proposals/users/${userId}/modify`, data)
  }

  signProposal (userId: string, data: ProposalData) {
    return this.client.put(`/party/proposals/users/${userId}/sign`, data)
    
  } 

  createProposal (data: ProposalData) {
    return this.client.post('/party/propose', data)
  }

  completeProposal (proposalId: string) {
    return this.client.put(`/party/proposals/${proposalId}/complete`)
  }

  approveProposal (proposalId: string) {
    return this.client.put(`/party/proposals/${proposalId}/approve`)
  }

  rejectProposal (proposalId: string) {
    return this.client.put(`/party/proposals/${proposalId}/reject`)
  }

  downloadProposalAgreement (proposalId: string, agreementIndex: number) {
    return this.client.get(`/party/proposals/${proposalId}/agreement?index=${agreementIndex}`, {
      headers: {
        Accept: "application/pdf",
      },
      responseType: 'blob'
    })
  }

  // certs

  validateCertificate (cert: File) {
    return this.client.post('/registry/certificate/validate', cert)
  }

  // image upload
  uploadLogo (image: FormData) {
    return this.client.post('/settings/logo', image)
  }

  uploadFavicon (image: FormData) {
    return this.client.post('/settings/favicon', image)
  }

  fetchLogo () {
    return this.client.get('/settings/logo', {
      responseType: 'blob'
    })
  }

  fetchDelegationOverview () {
    return this.client.get<DelegationOverview>('/delegations/me')
  }

  createDelegationIdpConnection (data: {
    kvkNumber: string
    providerType: string
    alias: string
    displayName?: string
    issuerUrl?: string
    clientId?: string
    clientSecret?: string
  }) {
    return this.client.post<DelegationIdpConnection>('/delegations/idp-connections', data)
  }

  createDelegationMember (data: {
    kvkNumber: string
    email: string
    providerAlias?: string
    role?: string
  }) {
    return this.client.post<DelegationMember>('/delegations/members', data)
  }

}

export default API
