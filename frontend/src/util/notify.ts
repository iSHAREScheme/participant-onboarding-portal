import Keycloak from "keycloak-js";
import { getPublicEnv } from "config/publicEnv";

const notificationsDisabled = () => Boolean(getPublicEnv().NEXT_PUBLIC_NO_NOTIFY)

export default class EmailNotification {

  static getUrl(keycloak: Keycloak) {
    return `${keycloak.authServerUrl}/realms/${keycloak.realm}/onboarding/onboarding-notifications`
  }

  static async  request (url: string, token: string, body: Record<string, any>) { 
    try {
      // console.log('email notify request', url, token, body)
      const result = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` // NOTE: bearer-only client
        },
        credentials: 'omit',
        body: JSON.stringify(body)
      })
      // console.log('result', result)
      return result
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }

  static async newProposal (keycloak: Keycloak, proposalId: string) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready - skip admin notification")
      return
    }

    try {
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'proposal_created',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId
      })
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'proposal_review',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId
      })

    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }

  static async proposalAccepted (keycloak: Keycloak, proposalId: string) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready - skip admin notification")
      return
    }

    try {
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'proposal_accepted',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
  static async proposalRejected (keycloak: Keycloak, proposalId: string) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready – skip admin notification")
      return
    }

    try {
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'proposal_rejected',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
  static async agreementCreated (keycloak: Keycloak, proposalId: string) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready – skip admin notification")
      return
    }

    try {
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'agreement_created',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId
      })
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'agreement_review',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
  static async agreementAccepted (keycloak: Keycloak, proposalId: string) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready – skip admin notification")
      return
    }

    try {
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'agreement_accepted',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
  static async agreementRejected (keycloak: Keycloak, proposalId: string) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready – skip admin notification")
      return
    }

    try {
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'agreement_rejected',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
}
