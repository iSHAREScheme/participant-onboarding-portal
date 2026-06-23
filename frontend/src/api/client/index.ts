import Axios from "axios"
import type { AxiosInstance } from "axios"
import { getAccessToken } from "util/authToken"

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

    // Attach the current in-memory Keycloak token to every request (browser
    // only). The provider refreshes the token if it is near expiry; tokens are
    // never read from web storage.
    this.client.interceptors.request.use(async (config) => {
      if (typeof window !== 'undefined') {
        const token = await getAccessToken()
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

  // --- Authentication: Keycloak identity providers + SMTP (admin only) -------
  // The realm's configured IdPs (client secrets redacted): { idps: [...] }.
  listIdps () {
    return this.client.get(`/settings/idps`)
  }
  // A single IdP representation (secrets redacted): { idp: {...} }.
  getIdp (alias: string) {
    return this.client.get(`/settings/idps/${encodeURIComponent(alias)}`)
  }
  createIdp (body: Record<string, any>) {
    return this.client.post(`/settings/idps`, body)
  }
  // Update an IdP. Blank secret fields keep the value already stored.
  updateIdp (alias: string, body: Record<string, any>) {
    return this.client.put(`/settings/idps/${encodeURIComponent(alias)}`, body)
  }
  deleteIdp (alias: string) {
    return this.client.delete(`/settings/idps/${encodeURIComponent(alias)}`)
  }
  // Per-IdP claim mappers (external claim -> Keycloak user attribute).
  listIdpMappers (alias: string) {
    return this.client.get(`/settings/idps/${encodeURIComponent(alias)}/mappers`)
  }
  createIdpMapper (alias: string, body: { name?: string; claim: string; userAttribute: string }) {
    return this.client.post(`/settings/idps/${encodeURIComponent(alias)}/mappers`, body)
  }
  deleteIdpMapper (alias: string, id: string) {
    return this.client.delete(`/settings/idps/${encodeURIComponent(alias)}/mappers/${encodeURIComponent(id)}`)
  }
  // Realm SMTP settings (password redacted): { smtp: {...}, passwordSet }.
  getSmtp () {
    return this.client.get(`/settings/smtp`)
  }
  // Save SMTP settings. A blank password keeps the one already stored.
  updateSmtp (body: Record<string, any>) {
    return this.client.put(`/settings/smtp`, body)
  }
  // Send a real test email to the recipient in `body.to` using the saved settings.
  testSmtp (body: Record<string, any>) {
    return this.client.post(`/settings/smtp/test`, body)
  }

  // Update the current user's OWN Keycloak profile (email / name) via the backend
  // admin API. The user is identified server-side from the token subject, so it
  // can only ever change the caller's own account.
  updateMyProfile (body: { email?: string; firstName?: string; lastName?: string }) {
    return this.client.put(`/me/profile`, body)
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

  // The applicant's OWN registered party (scoped server-side to their proposal):
  // { status, partyId, partyName, data }. `data` is null until admitted to the PR.
  getMyParty () {
    return this.client.get(`/registry/me/party`)
  }

  // Verifiable-credential offers for the caller's own party, polled from the
  // external iSHARE VC issuer (the portal relays; it never signs). Returns
  // { issuerConfigured, status: pending|processing|ready|failed|unavailable|none,
  //   results: [{ credential_type, action, credential_offer_uri?, offer_expires_at? }],
  //   generated_at?, error? }. Scoped server-side to the caller's proposal.
  getMyCredentialOffers () {
    return this.client.get(`/registry/me/credentials`)
  }

  // Ask the issuer to mint fresh offer URIs for already-issued credentials
  // (used when offers have expired) without revoking or rebuilding them.
  refreshMyCredentialOffers () {
    return this.client.post(`/registry/me/credentials/refresh`)
  }

  // Re-trigger the issuer's reconcile for the caller's party (recovery when a
  // previous poll ended in "failed").
  reprocessMyCredentials () {
    return this.client.post(`/registry/me/credentials/reprocess`)
  }

  // Participant Registry admin (co-deployed only): latest network/ledger health.
  // The backend forwards the operator's token to the PR /api/* surface and relays
  // the result; returns 501 when PR_API_BASE_URL is unset (standalone deployment).
  getNetworkHealth () {
    return this.client.get(`/pr/network-health`)
  }

  // PR admin: list revoke/transfer requests.
  getRevokeRequests () {
    return this.client.get(`/pr/revoke/requests`)
  }

  // PR admin: initiate a revoke (RevokeModel body). Returns the registry's
  // FinalResponse ({ status, message }). Gated behind a confirmation in the UI.
  initiateRevoke (body: Record<string, any>) {
    return this.client.post(`/pr/revoke`, body)
  }

  // PR admin: list party-transfer requests.
  getTransferRequests () {
    return this.client.get(`/pr/transfer/requests`)
  }

  // PR admin: request transfer of a party to another registry (TransferModel
  // body: { partyId, transferTo, … }). Returns the registry's FinalResponse.
  createTransfer (body: Record<string, any>) {
    return this.client.post(`/pr/transfer`, body)
  }

  // PR admin: list managed dataspaces with full records ({ count, data:[…] }).
  // Distinct from the thin id+title list at /registry/dataspaces used for
  // dropdowns — this is the management surface on the co-deployed /api/* layer.
  getManagedDataspaces () {
    return this.client.get(`/pr/dataspaces`)
  }

  // PR admin: fetch one dataspace's full record to populate the edit form.
  getDataspaceDetail (id: string) {
    return this.client.get(`/pr/dataspaces/detail`, { params: { id } })
  }

  // PR admin: create a dataspace (dataspace model body). Returns FinalResponse.
  createDataspace (body: Record<string, any>) {
    return this.client.post(`/pr/dataspaces`, body)
  }

  // PR admin: update an existing dataspace (identified by its dataspaceID).
  updateDataspace (body: Record<string, any>) {
    return this.client.put(`/pr/dataspaces`, body)
  }

  // PR admin: list trusted certificate authorities ({ count, data:[…] }).
  getTrustedList () {
    return this.client.get(`/pr/trusted`)
  }

  // PR admin: validate a certificate before adding it to the trusted list.
  // `certificate` is the base64 of the certificate file; the registry returns
  // { validity, errors, model:{ subject, certificateFingerprint, certificate, … } }
  // used to populate the create form.
  validateTrustedCert (certificate: string) {
    return this.client.post(`/pr/trusted/validate`, { certificate })
  }

  // PR admin: add a trusted CA (validated certificate model). Returns FinalResponse.
  createTrustedCA (body: Record<string, any>) {
    return this.client.post(`/pr/trusted`, body)
  }

  // PR admin: update a trusted CA (status/type). Returns FinalResponse.
  updateTrustedCA (body: Record<string, any>) {
    return this.client.put(`/pr/trusted`, body)
  }

  // PR admin: remove a trusted CA (certificate model body). Returns FinalResponse.
  deleteTrustedCA (body: Record<string, any>) {
    return this.client.post(`/pr/trusted/delete`, body)
  }

  // PR admin: list scheduled jobs ({ count, data:[…] }).
  getSchedulers () {
    return this.client.get(`/pr/scheduler`)
  }

  // PR admin: create a scheduled job (scheduler config body). Returns FinalResponse.
  createScheduler (body: Record<string, any>) {
    return this.client.post(`/pr/scheduler`, body)
  }

  // PR admin: update a scheduled job (scheduler config body). Returns FinalResponse.
  updateScheduler (body: Record<string, any>) {
    return this.client.put(`/pr/scheduler`, body)
  }

  // --- Issuer-integration webhooks ------------------------------------------
  // The PR's issuer-webhook subscriber registry + delivery outbox
  // (ISSUER_INTEGRATION_CONTRACT.md). Subscriber signing secrets are
  // write/rotate-only — returned once on create/rotate, never read back.

  // PR admin: list issuer-webhook subscribers → { subscribers:[…] }.
  listIssuerSubscribers () {
    return this.client.get(`/pr/issuer/subscribers`)
  }
  // PR admin: one subscriber → { subscriber:{…} }.
  getIssuerSubscriber (id: string) {
    return this.client.get(`/pr/issuer/subscribers/${encodeURIComponent(id)}`)
  }
  // PR admin: register a subscriber. Response carries the generated { secret } once.
  createIssuerSubscriber (body: Record<string, any>) {
    return this.client.post(`/pr/issuer/subscribers`, body)
  }
  // PR admin: edit a subscriber (url / eventFilter / replayProtection / enabled).
  updateIssuerSubscriber (id: string, body: Record<string, any>) {
    return this.client.patch(`/pr/issuer/subscribers/${encodeURIComponent(id)}`, body)
  }
  // PR admin: delete a subscriber.
  deleteIssuerSubscriber (id: string) {
    return this.client.delete(`/pr/issuer/subscribers/${encodeURIComponent(id)}`)
  }
  // PR admin: rotate a subscriber's signing secret; returns the new { secret } once.
  // Optional overlapSeconds keeps the prior secret valid for a window.
  rotateIssuerSubscriberSecret (id: string, overlapSeconds?: number) {
    const body = overlapSeconds === undefined ? undefined : { overlapSeconds }
    return this.client.post(`/pr/issuer/subscribers/${encodeURIComponent(id)}/rotate-secret`, body)
  }
  // PR admin: list webhook deliveries (outbox / dead-letter) → { deliveries:[…] }.
  listIssuerDeliveries (params?: { status?: string; partyId?: string; subscriberId?: string; limit?: number }) {
    return this.client.get(`/pr/issuer/deliveries`, { params })
  }
  // PR admin: requeue a failed/dead delivery for immediate retry.
  redeliverIssuerDelivery (id: string) {
    return this.client.post(`/pr/issuer/deliveries/${encodeURIComponent(id)}/redeliver`)
  }
  // PR admin: re-emit a party.updated event for a party (manual reconcile trigger).
  reemitPartyEvents (partyId: string) {
    return this.client.post(`/pr/issuer/parties/${encodeURIComponent(partyId)}/reemit`)
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
