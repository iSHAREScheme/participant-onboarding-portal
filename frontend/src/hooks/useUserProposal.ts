import { useState, useEffect } from 'react';
import { useKeycloak } from '@react-keycloak/web';
import API from 'api/client'
import { getPublicEnv } from 'config/publicEnv'

export interface UserProposalData {
  status: string;
  dataOwner: boolean;
  dataConsumer: boolean;
  dataProvider: boolean;
  useM2M: string;
  companyName: string;
  kvkNumber: string;
  partyId: string;
  partyName: string;
  address: string;
  zipCode: string;
  city: string;
  country: string;
  website: string;
  authRegistry: string;
  capabilitiesUrl: string;
  authRegistryName: string;
  authRegistryUrl: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  keycloakUsername: string;
}

export const useUserProposal = () => {
  const Api = new API()
  const { keycloak } = useKeycloak();
  const [proposalData, setProposalData] = useState<UserProposalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProposalData = async () => {
      if (!keycloak?.tokenParsed?.preferred_username) {
        setLoading(false);
        return;
      }

      try {
        const { NEXT_PUBLIC_BASE_SERVER_URL: baseUrl } = getPublicEnv();
        if (!baseUrl) {
          throw new Error("Backend URL not configured");
        }

        const response = await Api.fetchProposalData(keycloak.tokenParsed.preferred_username)
        setProposalData(response.data)

      } catch (err) {
        setProposalData(null)
        console.error("Error fetching proposal data:", err)
        setError(err instanceof Error ? err.message : "Failed to fetch proposal data");
      } finally {
        setLoading(false)
      }
    }

    fetchProposalData()
  }, [keycloak?.tokenParsed?.preferred_username])

  return { proposalData, loading, error }
};
