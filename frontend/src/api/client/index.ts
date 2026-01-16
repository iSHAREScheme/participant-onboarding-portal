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

  fetchProposalData (userId: string) {
    return this.client.get(`/party/proposals/users/${userId}`)
  }

  fetchProposal (proposalId: string) {
    return this.client.get(`/party/proposals/${proposalId}`)
  }

  listProposals () {
    return this.client.get(`/party/proposals`)
  }

  fetchSettings () {
    return this.client.get(`/settings`)
  }

  patchSettings (settings: Record<string, any>) {
    return this.client.post(`/settings`, settings)
  }

  fetchRegistry () {
    return this.client.get(`/registry`)
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

  fetchLogo () {
    return this.client.get('/settings/logo', {
      responseType: 'blob'
    })
  }

}

export default API
