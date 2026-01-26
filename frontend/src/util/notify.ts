import Keycloak from "keycloak-js";
import { getPublicEnv } from "config/publicEnv";

const notificationsDisabled = () => Boolean(getPublicEnv().NEXT_PUBLIC_NO_NOTIFY)

const getFrontendDomain = () => getPublicEnv().NEXT_PUBLIC_FRONTEND_DOMAIN || ""

const getAdminProposalLink = () => {
  const domain = getFrontendDomain()
  return domain ? `${domain}/admin/proposals` : ""
}

const getUserRegisterLink = () => {
  const domain = getFrontendDomain()
  return domain ? `${domain}/register` : ""
}

const buildRecipient = (recipient?: { username?: string; email?: string }) => ({
  username: recipient?.username || "",
  email: recipient?.email || "",
})

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

  static async newProposal (keycloak: Keycloak, proposalId?: string) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready - skip admin notification")
      return
    }

    try {
      const adminLink = getAdminProposalLink()
      const userLink = getUserRegisterLink()
      const recipientUsername = keycloak.tokenParsed?.preferred_username || ""
      const recipientEmail = keycloak.tokenParsed?.email || ""
      const basePayload = {
        keycloakUsername: recipientUsername,
        proposalId,
      }

      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'proposal_created',
        ...basePayload,
        ...(adminLink ? { proposalLink: adminLink } : {})
      })
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'proposal_received',
        ...basePayload,
        recipientUsername: recipientUsername,
        recipientEmail: recipientEmail,
        ...(userLink ? { proposalLink: userLink } : {})
      })

    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }

  static async proposalAccepted (keycloak: Keycloak, proposalId: string, recipient?: { username?: string; email?: string }) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready - skip admin notification")
      return
    }

    try {
      const { username, email } = buildRecipient(recipient)
      if (!username && !email) {
        console.warn("Missing recipient for proposal_accepted notification")
        return
      }

      const userLink = getUserRegisterLink()
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'proposal_accepted',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId,
        recipientUsername: username,
        recipientEmail: email,
        ...(userLink ? { proposalLink: userLink } : {})
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
  static async proposalRejected (keycloak: Keycloak, proposalId: string, recipient?: { username?: string; email?: string }) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready – skip admin notification")
      return
    }

    try {
      const { username, email } = buildRecipient(recipient)
      if (!username && !email) {
        console.warn("Missing recipient for proposal_rejected notification")
        return
      }

      const userLink = getUserRegisterLink()
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'proposal_rejected',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId,
        recipientUsername: username,
        recipientEmail: email,
        ...(userLink ? { proposalLink: userLink } : {})
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
  static async agreementCreated (keycloak: Keycloak, proposalId?: string) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready – skip admin notification")
      return
    }

    try {
      const adminLink = getAdminProposalLink()
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'agreement_created',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId,
        ...(adminLink ? { proposalLink: adminLink } : {})
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
  static async agreementAccepted (keycloak: Keycloak, proposalId: string, recipient?: { username?: string; email?: string }) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready – skip admin notification")
      return
    }

    try {
      const { username, email } = buildRecipient(recipient)
      if (!username && !email) {
        console.warn("Missing recipient for agreement_accepted notification")
        return
      }

      const userLink = getUserRegisterLink()
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'agreement_accepted',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId,
        recipientUsername: username,
        recipientEmail: email,
        ...(userLink ? { proposalLink: userLink } : {})
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
  static async agreementRejected (keycloak: Keycloak, proposalId: string, recipient?: { username?: string; email?: string }) {
    if (notificationsDisabled()) return
    if (!keycloak.token || !keycloak.authServerUrl || !keycloak.realm) {
      console.warn("Keycloak not ready – skip admin notification")
      return
    }

    try {
      const { username, email } = buildRecipient(recipient)
      if (!username && !email) {
        console.warn("Missing recipient for agreement_rejected notification")
        return
      }

      const userLink = getUserRegisterLink()
      await EmailNotification.request(
        EmailNotification.getUrl(keycloak), 
        keycloak.token, {
        notifyType: 'agreement_rejected',
        keycloakUsername: keycloak.tokenParsed?.preferred_username || "",
        proposalId,
        recipientUsername: username,
        recipientEmail: email,
        ...(userLink ? { proposalLink: userLink } : {})
      })
    } catch (err) {
      console.error("Failed to call onboarding-notifications:", err);
    }
  }
}
