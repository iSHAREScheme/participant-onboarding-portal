import OnboardingStatus from "components/OnboardingStatus";

const en = {
  common: {
    login: "Login",
    logout: "Logout",
    home: "Home",
    proposals: "Proposals",
    users: "Users",
    settings: "Settings",
    save: "Save",
    continue: "Continue",
    back: "Back",
    submit: "Submit",
    error: "Error",
    success: "Success",
    loading: "Loading...",
    required: "Required",
    edit: "Edit",
    delete: "Delete",
    restore: "Restore",
    cancel: "Cancel",
    confirm: "Confirm",
    next: "Next",
    previous: "Previous",
    profile: "Profile",
    participants: "Participants",
    organizationAccess: "Organization access",
    myParty: "My party",
    networkHealth: "Network health",
    revoke: "Revoke",
    transfer: "Transfer",
    lifecycle: "Lifecycle",
    dataspaces: "Dataspaces",
    frameworks: "Frameworks",
    trustedList: "Trusted list",
    issuerWebhooks: "Issuer webhooks",
    yes: "Yes",
    no: "No",
    menu: "Menu",
    clear: "Clear",
    searching: "Searching…",
    noMatches: "No matching participants"
  },
  organizationAccess: {
    title: "Organization access",
    refresh: "Refresh",
    organization: {
      title: "Verified organization",
      kvk: "KvK number",
      company: "Company"
    },
    noOrganization: {
      title: "No eHerkenning organization found",
      description: "Log in or link eHerkenning first. Once the session contains an organization identifier, you can configure IdPs and delegate access for that organization."
    },
    idp: {
      title: "Organization IdP connections",
      providerType: "Provider type",
      alias: "Keycloak alias",
      displayName: "Display name",
      issuerUrl: "Issuer / metadata URL",
      clientId: "Client ID",
      clientSecret: "Client secret",
      status: "Status",
      create: "Provision IdP connection",
      empty: "No organization IdP connections yet."
    },
    members: {
      title: "Delegated people",
      email: "Email",
      providerAlias: "Provider alias",
      role: "Role",
      status: "Status",
      create: "Delegate access",
      empty: "No delegated people yet."
    },
    messages: {
      idpCreated: "IdP connection provisioned.",
      memberCreated: "Delegated access recorded."
    },
    errors: {
      load: "Could not load organization access.",
      idpCreate: "Could not provision IdP connection.",
      memberCreate: "Could not delegate access."
    }
  },
  participants: {
    title: "Participants",
    refresh: "Refresh",
    loading: "Loading participants...",
    error: "Failed to load participants.",
    empty: "No participants found.",
    search: "Search by name or party ID…",
    roleFilterAria: "Filter by role",
    roleAll: "All roles",
    filters: {
      all: "All participants",
      mine: "My participants",
      active: "Active only",
      certified: "Certified only"
    },
    noResults: "No participants match your search.",
    table: {
      partyId: "Party ID",
      name: "Name",
      roles: "Roles",
      status: "Status",
      startDate: "Start date",
      endDate: "End date",
      access: "Access"
    },
    access: {
      owned: "Registered by this registry — editable",
      viewOnly: "Registered by another registry — view only"
    },
    pagination: {
      previous: "Previous",
      next: "Next",
      last: "Last",
      page: "Page {{current}} of {{total}}"
    },
    detail: {
      back: "Back to participants",
      loading: "Loading participant…",
      error: "Failed to load participant.",
      notFound: "Participant not found.",
      schemaLabel: "Schema",
      projectionLabel: "Projected as",
      projectionHint:
        "This party's record is stored under an older schema and is shown here in the newer claim model. For parties that have not been migrated, the claims are derived from the stored data for display only.",
      viewMore: "View more",
      close: "Close",
      sections: {
        identity: "Identity",
        adherence: "Adherence",
        roles: "Roles",
        agreements: "Agreements",
        authRegistries: "Authorisation registries",
        certificates: "Certificates",
        additionalInfo: "Additional information",
        claims: "Claims",
        history: "History"
      },
      fields: {
        partyId: "Party ID",
        name: "Name",
        alsoKnownAs: "Also known as",
        registrarId: "Registrar ID",
        capabilityUrl: "Capability URL",
        schemaVersion: "Schema version",
        status: "Status",
        startDate: "Start date",
        endDate: "End date",
        role: "Role",
        loa: "Level of assurance",
        legalAdherence: "Legal adherence",
        compliancyVerified: "Compliancy verified",
        framework: "Framework",
        agreementType: "Type",
        title: "Title",
        signDate: "Sign date",
        expiryDate: "Expiry date",
        hash: "Hash",
        authRegistryName: "Name",
        authRegistryId: "Registry ID",
        authRegistryUrl: "URL",
        dataspaceId: "Dataspace ID",
        description: "Description",
        website: "Website",
        companyEmail: "Company email",
        companyPhone: "Company phone",
        publiclyPublishable: "Publicly publishable",
        tags: "Tags"
      },
      empty: {
        roles: "No roles.",
        agreements: "No agreements.",
        authRegistries: "No authorisation registries.",
        certificates: "No certificates."
      },
      history: {
        loading: "Loading history…",
        error: "History is currently unavailable.",
        empty: "No history found.",
        emptyEdited: "No field changes recorded yet.",
        object: "Object",
        actor: "Actor",
        noFieldChanges: "No field-level changes available.",
        more: "{{count}} more changes",
        show: "Show changes ({{count}})",
        hide: "Hide changes",
        changesLabel: "{{count}} field changes",
        by: "by {{party}}"
      },
      edit: {
        button: "Edit",
        title: "Edit participant",
        partyInfoTitle: "Party information",
        partyInfoHint: "Only party-level fields are edited here. Each claim is edited individually from its card.",
        editClaim: "Edit claim",
        editClaimTitle: "Edit claim",
        noEditableClaimFields: "This claim type has no editable fields — its values are set at issuance.",
        akaAppendOnly: "Existing aliases cannot be changed or removed — the registry only accepts additions.",
        addClaimButton: "Add claim",
        addClaimTitle: "Add claim",
        addClaimType: "Claim type",
        addClaimSubmit: "Add claim",
        addClaimMissing: "Missing required fields",
        addClaimCertUpload: "Certificate file",
        addClaimCertRequired: "Certificate file",
        addClaimCertHint: "The new certificate is registered as an additional active certificate. The previous certificate keeps its own status until it expires or is revoked from its claim card.",
        save: "Save",
        saving: "Saving…",
        saveClaim: "Save claim",
        cancel: "Cancel",
        saved: "Saved.",
        saveError: "Failed to save changes.",
        noComplianceClaim: "This participant has no editable compliance claim.",
        claimsTitle: "Claims"
      },
      projectionWarn: {
        incompleteTitle: "Incomplete v3 participant",
        incompleteBody:
          "This participant does not yet meet the v3 onboarding requirements, so the registry still treats it as a legacy (v2) record and the claims shown may be projected from its legacy data. Add the missing claim(s) to complete its migration to v3.",
        missingLabel: "Missing required claims:",
        unmigratedTitle: "Not yet migrated to v3",
        unmigratedBody:
          "This participant's data looks complete but isn't stored as native v3 claims yet — the claims shown are projected from its legacy record for display only. Run the v3 claim migration to persist them.",
        req: {
          certOrIdp: "X.509 certificate or IdP assertion",
          x509ForRole: "X.509 certificate (required for its framework role)"
        }
      }
    }
  },
  party: {
    back: "Back to home",
    admitted: "Admitted",
    refresh: "Refresh",
    start: "Start onboarding",
    loadError: "Failed to load your party details.",
    none: {
      title: "No onboarding yet",
      message: "You have not started onboarding. Once you submit a registration and it is approved, your party details will appear here."
    },
    processing: {
      title: "Onboarding in progress",
      message: "Your registration is being processed. Your party details will appear here once your organisation has been admitted to the participant registry."
    },
    rejected: {
      title: "Registration not approved",
      message: "Your registration was not approved. Please contact the association for more information or start a new registration."
    },
    welcome: {
      title: "Onboarding complete, {{name}}!",
      message: "Your organisation has been admitted to the participant registry. Below is your party information and the credentials you can request."
    },
    credentials: {
      title: "Credentials",
      description: "Add your organisation's verifiable credentials to a wallet. Scan a QR code with your wallet app, or open it on this device.",
      vcLabel: "Verifiable credential",
      notConfigured: "Credential issuance is not configured yet. Please contact your association.",
      empty: "No credentials are available for your party yet.",
      unavailable: "The credential issuer is temporarily unavailable. Please try again in a moment.",
      addToWallet: "Add to wallet",
      scanHint: "Scan with your wallet app",
      copyOffer: "Copy offer link",
      copied: "Copied",
      refresh: "Refresh offers",
      refreshing: "Refreshing…",
      retry: "Retry",
      retrying: "Retrying…",
      checkAgain: "Check again",
      checking: "Checking…",
      expires: "Offer expires {{when}}",
      expired: "This offer has expired — refresh to get a new one.",
      preparing: {
        title: "Preparing your credentials…",
        message: "Your verifiable credentials are being issued. This can take a moment after admission."
      },
      failed: {
        title: "Credential issuance didn't complete",
        message: "Something went wrong while issuing your credentials. You can retry."
      },
      request: "Request",
      requesting: "Requesting…",
      requestSectionTitle: "Available credentials",
      requestSectionHint: "Request the verifiable credentials your organisation is entitled to. Once issued, add them to a wallet.",
      notAvailable: "Not available for your party.",
      issued: "This credential has been issued.",
      getWalletLink: "Get wallet link",
      gettingLink: "Getting link…",
      noWalletLink: "Couldn't generate a wallet link right now — please try again later.",
      types: {
        PartyCredential: "Party credential",
        iSHAREParticipantCredential: "iSHARE participant credential",
        DataspaceParticipantCredential: "Dataspace participant credential"
      },
      typeDescriptions: {
        PartyCredential: "Proves your organisation's identity (its party id and name).",
        iSHAREParticipantCredential: "Proves your active iSHARE framework participation.",
        DataspaceParticipantCredential: "Proves your membership of a data space."
      }
    }
  },
  tour: {
    aria: "Admin portal tour",
    skip: "Skip",
    back: "Back",
    next: "Next",
    done: "Finish",
    step: "Step {{current}} of {{total}}",
    replay: "Take a tour",
    steps: {
      welcome: {
        title: "Welcome to your admin portal",
        body: "Let's walk through the main areas. We'll move between pages for you — skip anytime, and replay later from your account menu."
      },
      proposalsList: {
        title: "Proposals",
        body: "Every onboarding request and its status. Open one to review it, approve or reject, and download the signed agreements."
      },
      proposalsCreate: {
        title: "Register a party",
        body: "Need to add a participant manually? Start a new registration from here."
      },
      participantsList: {
        title: "Participants",
        body: "Organisations admitted to the registry. Open one to see its party details, roles and claims."
      },
      participantsSearch: {
        title: "Find participants",
        body: "Search and filter the list to quickly locate an organisation."
      },
      usersList: {
        title: "Users",
        body: "The portal's user accounts and the roles that control what they can access."
      },
      usersCreate: {
        title: "Add a user",
        body: "Invite a new portal user and assign their role here."
      },
      settingsTabs: {
        title: "Settings",
        body: "Branding and content, the onboarding flow, the theme, and authentication — identity providers, email (SMTP) and the verifiable-credential issuer."
      },
      finish: {
        title: "You're all set",
        body: "That's the tour. Replay it anytime via “Take a tour” in your account menu."
      }
    }
  },
  revoke: {
    title: "Revoke",
    titleCombined: "Lifecycle",
    description: "Revoke a party from the registry, or transfer it to another participant registry.",
    form: {
      heading: "Lifecycle action",
      revokingOrg: "Revoking organisation",
      fromRegistry: "From registry",
      orgPlaceholder: "Organisation id",
      partyId: "Party ID",
      participant: "Participant",
      noParties: "You have no participants to manage.",
      noSatellites: "No other satellites are available in the network yet.",
      type: "Action",
      transferTo: "Transfer to party ID",
      hint: "Choose the participant to revoke from the registry.",
      submit: "Initiate revoke",
      submitting: "Submitting…",
      required: "Enter a party or organisation to revoke.",
      success: "Revoke request submitted.",
      error: "Failed to submit the revoke request."
    },
    types: {
      revoke: "Revoke",
      transfer: "Transfer"
    },
    confirm: {
      title: "Revoke party",
      message: "Revoke “{{target}}” from the registry? This cannot be undone.",
      button: "Revoke"
    },
    list: {
      heading: "Revoke requests",
      refresh: "Refresh",
      org: "Organisation",
      party: "Party",
      type: "Action",
      status: "Status",
      date: "Created",
      empty: "No revoke requests.",
      unavailable: "The participant registry is currently unavailable.",
      error: "Failed to load revoke requests."
    }
  },
  transfer: {
    title: "Transfer",
    description: "Transfer a party's ownership to another participant registry.",
    form: {
      heading: "Request transfer",
      partyId: "Party ID",
      participant: "Participant",
      fromRegistry: "From registry",
      noParties: "You have no participants to transfer.",
      noSatellites: "No other participant registries are available in the network yet.",
      transferTo: "Transfer to registry",
      transferToPlaceholder: "Destination registry id",
      hint: "Provide the party to move and the participant registry it should be transferred to.",
      submit: "Request transfer",
      submitting: "Submitting…",
      required: "Enter both the party and the destination registry.",
      success: "Transfer request submitted.",
      error: "Failed to submit the transfer request."
    },
    confirm: {
      title: "Transfer party",
      message: "Transfer “{{party}}” to “{{target}}”? The destination registry must approve the request.",
      button: "Request transfer"
    },
    list: {
      heading: "Transfer requests",
      refresh: "Refresh",
      party: "Party",
      from: "From",
      to: "To",
      status: "Status",
      date: "Requested",
      empty: "No transfer requests.",
      unavailable: "The participant registry is currently unavailable.",
      error: "Failed to load transfer requests."
    }
  },
  dataspaces: {
    title: "Dataspaces",
    description: "Manage the dataspaces registered in the participant registry.",
    form: {
      createHeading: "Create dataspace",
      editHeading: "Edit dataspace ({{id}})",
      subject: "Name",
      subjectPlaceholder: "Dataspace name",
      dataspaceId: "Dataspace ID",
      status: "Status",
      country: "Country of registration",
      countryPlaceholder: "e.g. Netherlands",
      definitionUrl: "Definition URL",
      website: "Website",
      countriesOfOperation: "Countries of operation",
      sectorIndustry: "Sector / industry",
      tags: "Tags",
      tagsPlaceholder: "Comma-separated tags",
      specificAgreements: "Specific agreements",
      listPlaceholder: "Comma-separated values",
      listHint: "Countries of operation, sector/industry and specific agreements accept multiple comma-separated values.",
      create: "Create dataspace",
      update: "Save changes",
      cancel: "Cancel",
      submitting: "Saving…",
      required: "A name and dataspace ID are required.",
      created: "Dataspace created.",
      updated: "Dataspace updated.",
      loadError: "Failed to load the dataspace.",
      error: "Failed to save the dataspace."
    },
    status: {
      new: "New",
      inProgress: "In progress",
      active: "Active",
      notActive: "Not active"
    },
    list: {
      heading: "Dataspaces",
      refresh: "Refresh",
      subject: "Name",
      id: "Dataspace ID",
      status: "Status",
      country: "Country",
      actions: "Actions",
      edit: "Edit",
      empty: "No dataspaces.",
      unavailable: "The participant registry is currently unavailable.",
      error: "Failed to load dataspaces."
    }
  },
  frameworks: {
    title: "Frameworks",
    description: "Browse the frameworks exposed by the participant registry v3 endpoint.",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    pageSize: "Page size",
    empty: "No frameworks found.",
    unavailable: "The participant registry is currently unavailable.",
    error: "Failed to load frameworks.",
    notConfigured: "The participant registry is not configured for this deployment.",
    untitled: "Untitled framework",
    showRaw: "Show details",
    hideRaw: "Hide details",
    issuer: "Issuer: {{issuer}}",
    fields: {
      version: "Version",
      validFrom: "Valid from",
      validUntil: "Valid until",
      updated: "Updated"
    },
    pagination: {
      summary: "Showing {{first}}–{{last}} of {{total}} frameworks"
    }
  },
  subscribers: {
    title: "Issuer webhooks",
    description: "Register the issuer/adapter endpoints that receive party lifecycle events, manage their signing secrets, and inspect or redeliver the webhook outbox.",
    tabs: {
      subscribers: "Subscribers",
      deliveries: "Deliveries"
    },
    form: {
      createHeading: "Register subscriber",
      editHeading: "Edit subscriber ({{name}})",
      name: "Name",
      namePlaceholder: "e.g. iSHARE VC issuer",
      url: "Webhook URL",
      eventFilter: "Event filter",
      eventFilterHint: "Leave empty for the default stream (party.created, party.updated). To also receive fine-grained events, list them comma-separated: claim.created, claim.updated, claim.revoked, party.revoked.",
      secret: "Signing secret (optional)",
      secretPlaceholder: "Leave blank to auto-generate",
      secretHint: "Only set this when connecting an already-deployed issuer that has a fixed HMAC secret — paste that secret here. Leave blank and the registry generates one (shown once). Use “Rotate secret” to change it later.",
      replayProtection: "Replay protection (sign timestamp + body)",
      enabled: "Enabled",
      create: "Register subscriber",
      update: "Save changes",
      cancel: "Cancel",
      submitting: "Saving…",
      nameRequired: "A name is required.",
      urlRequired: "A webhook URL is required.",
      urlHttps: "The webhook URL must use https.",
      created: "Subscriber registered.",
      updated: "Subscriber updated.",
      error: "Failed to save the subscriber."
    },
    secret: {
      heading: "Signing secret for {{name}} — shown once, copy it now",
      dismiss: "Dismiss"
    },
    status: {
      notConfigured: "The participant registry admin API is not configured for this portal (PR_API_BASE_URL is unset). Ask an administrator to configure it.",
      unauthorized: "The participant registry rejected your session — you're not authorized for its admin API. Try signing out and back in; if it persists, your account may lack the required role.",
      unavailable: "The participant registry is temporarily unavailable — it may be starting up or restarting.",
      error: "Something went wrong loading this data.",
      retry: "Retry"
    },
    list: {
      heading: "Subscribers",
      refresh: "Refresh",
      name: "Name",
      url: "Webhook URL",
      events: "Events",
      eventsDefault: "default stream",
      enabled: "Enabled",
      lastStatus: "Last delivery",
      actions: "Actions",
      edit: "Edit",
      rotate: "Rotate secret",
      delete: "Delete",
      empty: "No subscribers registered.",
      unavailable: "The participant registry is currently unavailable.",
      error: "Failed to load subscribers.",
      rotateConfirm: "Rotate this subscriber's signing secret? The new secret is shown once.",
      rotated: "Secret rotated.",
      rotateError: "Failed to rotate the secret.",
      deleteConfirm: "Delete this subscriber? It will stop receiving events.",
      deleted: "Subscriber deleted.",
      deleteError: "Failed to delete the subscriber."
    },
    deliveries: {
      heading: "Deliveries",
      reemitHeading: "Re-emit events for a party",
      reemitHint: "Enqueue a party.updated event so subscribers re-fetch and reconcile this party — a manual recovery trigger.",
      reemit: "Re-emit",
      reemitRequired: "A party id is required.",
      reemitted: "Re-emitted to {{count}} subscriber(s).",
      reemitError: "Failed to re-emit events.",
      created: "Created",
      event: "Event",
      party: "Party ID",
      partyFilter: "Party ID",
      subscriber: "Subscriber",
      status: "Status",
      attempts: "Attempts",
      actions: "Actions",
      redeliver: "Redeliver",
      redelivered: "Delivery requeued.",
      redeliverError: "Failed to requeue the delivery.",
      empty: "No deliveries.",
      error: "Failed to load deliveries.",
      applyFilters: "Apply",
      allSubscribers: "All subscribers",
      statuses: {
        all: "All statuses",
        pending: "Pending",
        failed: "Failed",
        delivered: "Delivered",
        dead: "Dead-lettered"
      }
    }
  },
  trusted: {
    title: "Trusted list",
    description: "Manage the certificate authorities trusted by the participant registry.",
    form: {
      addHeading: "Add certificate authority",
      editHeading: "Edit ({{subject}})",
      certificate: "Certificate",
      validating: "Validating certificate…",
      valid: "Valid",
      invalid: "Invalid",
      subject: "Subject",
      subjectPlaceholder: "Upload a certificate to populate",
      fingerprint: "Fingerprint",
      type: "Type",
      status: "Status",
      hint: "Upload a certificate (.cer, .crt, .der, .pem, .pfx, .key) to validate it, then choose a type before adding it.",
      create: "Add to trusted list",
      update: "Save changes",
      cancel: "Cancel",
      submitting: "Saving…",
      badFile: "Invalid file type. Upload a certificate file.",
      validateError: "Failed to validate the certificate.",
      typeRequired: "Select a certificate type.",
      certRequired: "Upload and validate a certificate first.",
      created: "Certificate authority added.",
      updated: "Certificate authority updated.",
      deleted: "Certificate authority removed.",
      error: "Failed to save the certificate authority.",
      deleteError: "Failed to remove the certificate authority."
    },
    types: {
      pkio: "PKIo",
      ishareTest: "iSHARE Test",
      eidas: "eIDAS"
    },
    statuses: {
      granted: "Granted",
      withdrawn: "Withdrawn",
      supervisionCeased: "Supervision ceased",
      underSupervision: "Under supervision"
    },
    confirm: {
      title: "Remove certificate authority",
      message: "Remove “{{target}}” from the trusted list? This cannot be undone.",
      button: "Remove"
    },
    list: {
      heading: "Trusted certificate authorities",
      refresh: "Refresh",
      subject: "Subject",
      type: "Type",
      validity: "Validity",
      status: "Status",
      actions: "Actions",
      edit: "Edit",
      delete: "Remove",
      empty: "No trusted certificate authorities.",
      unavailable: "The participant registry is currently unavailable.",
      error: "Failed to load the trusted list."
    }
  },
  scheduler: {
    title: "Scheduler",
    description: "Schedule recurring participant-registry jobs, such as network health checks.",
    form: {
      createHeading: "Schedule a job",
      editHeading: "Edit job ({{name}})",
      type: "Job type",
      typePlaceholder: "Select a job type",
      process: "Process name",
      processPlaceholder: "A name to identify this job",
      frequency: "Frequency",
      frequencyPlaceholder: "Select a frequency",
      every: "Run every",
      startDate: "Start date",
      startTime: "Start time",
      emails: "Notification emails",
      emailsPlaceholder: "Comma-separated email addresses",
      enable: "Enable this schedule",
      hint: "Second/minute/hour frequencies run on the chosen interval; daily and weekly run once per period. Notifications are sent to the listed addresses.",
      create: "Schedule job",
      update: "Save changes",
      cancel: "Cancel",
      submitting: "Saving…",
      required: "Job type, process name, frequency and at least one email are required.",
      created: "Job scheduled.",
      updated: "Schedule updated.",
      error: "Failed to save the schedule."
    },
    types: {
      networkHealth: "Network Health Check"
    },
    units: {
      sec: "Second",
      min: "Minute",
      hr: "Hour"
    },
    frequency: {
      every: "Every {{value}} {{unit}}",
      daily: "Daily once",
      weekly: "Weekly once"
    },
    list: {
      heading: "Scheduled jobs",
      refresh: "Refresh",
      process: "Process",
      type: "Type",
      frequency: "Frequency",
      enabled: "Enabled",
      actions: "Actions",
      edit: "Edit",
      yes: "Yes",
      no: "No",
      empty: "No scheduled jobs.",
      unavailable: "The participant registry is currently unavailable.",
      error: "Failed to load scheduled jobs."
    }
  },
  networkHealth: {
    title: "Network health",
    description: "Live status of the participant registry's ledger network. Available when the portal is co-deployed with the registry.",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    overall: "Overall status",
    lastExecution: "Last execution",
    notificationStatus: "Email notification status",
    org: "Organisation",
    health: "Health",
    peers: "Peers",
    peerName: "Peer",
    blockNo: "Block no.",
    status: "Status",
    explorer: "Explorer",
    notConfigured: "Network health is only available when the portal is co-deployed with the participant registry.",
    unavailable: "The participant registry is currently unavailable. Please try again in a moment.",
    loadError: "Failed to load network health.",
    empty: "No organisation details were reported."
  },
  home: {
    title: "Onboarding",
    beforeCommencing: "Before commencing",
    readyText: "Have you got everything you need?",
    proceedButton: "Proceed to onboarding",
    agreementText: "When you onboard to this association, you will be asked to sign the following agreements:",
    agreement1: "Agreement 1",
    agreement2: "Agreement 2",
    agreement3: "Agreement 3",
    noAgreements: "No agreements available",
    beforeDescription: "To complete the onboarding, please make sure you have the following information by hand:",
    requirements: {
      idEherkenning: "eHerkenning login for your organisation",
      location: "or eIDAS eSeal certificate of your organisation"
    },
    approved: {
      title: "Welcome, {{name}}",
      message: "Welcome to the onboarding portal of our Association. This portal allows you to check your status and complete all tasks to onboard your organization into our Association.",
    }
  },
  onboarding: {
    status: {
      title: "Onboarding status",
      formCompleted: "Form completed",
      verifiedInformation: "Association verified information",
      uploadSignedAgreements: "Upload signed agreements",
      signAgreements: "Sign agreements",
      verifySignedAgreements: "Association verifies signed agreements",
      onboardingComplete: "Onboarding complete"
    }
  },
  register: {
    title: "Registration",
    stepCounter: "Step {{current}} of {{total}}",
    steps: {
      role: "Role",
      m2m: "M2M",
      idCheck: "IDCheck",
      location: "Location",
      association: "Association",
      account: "Account",
      confirm: "Confirm",
      signingMethod: "Signing Method",
      agreement: "Sign agreements",
      agreements: "Sign agreements",
      success: "Congratulations!",
      completed: "Completed",
      rejected: "Rejected"
    },
    idCheck: {
      title: "Identity check",
      subtitle: "For more certainty about your online identity, please identify yourself using one of the following methods.",
      eHerkenning: "eHerkenning",
      eHerkenningInfo: "We use eHerkenning to have more certainty about your online organisation identity. With eHerkenning you identify your organisation safely and easily online. The great convenience is that you can log in to multiple organisations with eHerkenning, so you have to remember fewer passwords. Safe, easy and reliable. For more information, go to www.eherkenning.nl.",
      eidas: "eIDAS Advance eSeal-certificate",
      login: "Login",
      useCurrentSession: "Use current eHerkenning session",
      linkAccount: "Link eHerkenning",
      continueWithEherkenning: "Continue with eHerkenning",
      useLinkedIdentity: "Continue with linked eHerkenning",
      currentSessionDescription: "Your current eHerkenning identity is ready to use for this identity check.",
      linkedReadyDescription: "Your eHerkenning login was linked successfully. Continue with this identity check.",
      checkingLinkDescription: "Checking whether this portal account is already linked to eHerkenning.",
      linkedAccountDescription: "This portal account is already linked to eHerkenning. Log in with eHerkenning to continue with this identity check.",
      linkDescription: "You are signed in with a portal account. Link your eHerkenning login to continue with this identity check.",
      loginDescription: "Login with eHerkenning to use it for this identity check.",
      currentIdentity: "Available identity: {{identity}}",
      currentAccount: "Current portal account: {{account}}",
      linkCancelled: "The eHerkenning linking flow was cancelled.",
      linkError: "The eHerkenning linking flow failed. Please try again.",
      info: "More security about your online identity, that's why we use eHerkenning. With eHerkenning you can identify yourself safely and easily online. The great convenience is that you can log in to multiple organizations with eHerkenning. So you need to remember fewer passwords. Safe, easy and reliable.",
      forMoreInfo: "for more information",
      partyId: "Party ID",
      partyName: "Party Name",
      eidasCertificate: "An eSeal (electronic seal) is a digital certificate that guarantees the origin and integrity of data on behalf of an organization. Issued by a trusted service provider, it confirms that the sender is a verified organization, ensuring the information is authentic and unchanged.",
      eidasProvide: "Provide your certificate here:",
      eidasInfo: "For more information about procuring such certificates, please refer to the eSEAL procurement guide.",
      certPreview: {
        title: "Certificate preview",
        identity: "Derived identity",
        subject: "Subject",
        issuer: "Issuer",
        validity: "Validity",
        fingerprints: "Fingerprints",
        organizationName: "Organization",
        organizationIdentifier: "Organization ID",
        kvkNumber: "KVK number",
        partyId: "Party ID",
        distinguishedName: "Distinguished name",
        serialNumber: "Serial number",
        validFrom: "Valid from",
        validTo: "Valid until",
        empty: "Not present"
      }
    },
    form: {
      companyName: "Company Name",
      kvkNumber: "KVK Number",
      partyId: "Party ID",
      partyName: "Party Name",
      address: "Address",
      city: "City",
      country: "Country",
      website: "Website",
      contactName: "Contact Name",
      contactEmail: "Contact Email",
      contactPhone: "Contact Phone"
    },
    m2m: {
      title: "Machine to machine services",
      subtitle: "Please fill out the following questions so we can prepare your onboarding.",
      description: "Are you going to consume machine to machine services (M2M) (i.e. API connections)?",
      yes: {
        title: "Yes",
        description: "Select this for example if you want to create API-connections"
      },
      no: {
        title: "No",
        description: "Select this if you expect to use services as a human user"
      },
      question: "Do you want to use M2M services?"
    },
    location: {
      title: "Location details",
      subtitle: "Please provide the following details of your organisation's location",
      placeholders: {
        address: "Address",
        zipCode: "Zip code",
        city: "City",
        country: "Country",
        website: "Website"
      }
    },
    association: {
      title: "Association settings",
      subtitle: "Select the following association settings",
      selectRegistry: "Select Authorisation Registry",
      authRegistryName: "Authorization Registry Name",
      authRegistryUrl: "Authorization Registry URL",
      capabilitiesUrl: "Capabilities URL",
      uploadSection: {
        title: "Upload CTT Proof",
        dragDrop: "Drag & Drop file here",
        or: "or",
        browse: "Browse files",
        maxSize: "Maximum file size: 5MB",
        invalidType: "Invalid file type. Only PDF files are allowed.",
        uploadSuccess: "File uploaded successfully",
        uploadError: "Error uploading file"
      },
      singleSubtitle: "You have been pre-configured to onboard to this association. The details have been filled in for you. Please continue to the next step.",
    },
    account: {
      title: "Administrative contact person",
      subtitle: "Would you like to specify a different administrative contact person who we can contact if we have any questions about the information you provided? Please provide the information on this screen.",
      placeholders: {
        name: "Name",
        email: "Email address",
        phone: "Phone number"
      }
    },
    confirm: {
      title: "Confirmation",
      subtitle: "Please confirm that you have provided all information required. The information will be shared with {{registry}} for verification. Once verified, you will receive an email that contains a link to a page where you can sign the necessary agreements.",
      labels: {
        role: "Role",
        m2m: "M2M services",
        identity: "Identity",
        location: "Location",
        authRegistry: "Authorisation Registry",
        capabilities: "Capabilities URL",
        cttProof: "CTT Proof upload",
        account: "Account Details",
        companyName: "Company Name",
        kvkNumber: "KVK Number",
        name: "Name",
        email: "Email",
        phone: "Phone",
        noFile: "No file uploaded",
        partyId: "Party ID",
        partyName: "Party Name",
        terms: "To confirm you must agree to the following terms:"
      },
      buttons: {
        back: "Back",
        continue: "Continue",
        submit: "I confirm the information is accurate",
        submitted: "Registration submitted"
      }
    },
    validation: {
      roleRequired: "Please select at least one role",
      m2mRequired: "Please select whether you want to use M2M services",
      identityRequired: "Continue with eHerkenning or upload a valid eIDAS certificate",
      selectOption: "Please select an option",
      locationRequired: "Please fill in all required details",
      associationRequired: "Please fill in all required fields",
      cttProofRequired: "Please upload CTT proof",
      accountRequired: "Please fill in all account details",
      invalidEmail: "Please enter a valid email address",
      invalidWebsite: "Please enter a valid website url",
      invalidCapabilitiesUrl: "Please enter a valid capabilities url",
      invalidRegistryUrl: "Please enter a valid auth registry url",
      invalidPhone: "Please enter a valid phone number"
    },
    role: {
      title: "Role",
      subtitle: "Please fill out the following questions so we can prepare your onboarding.",
      options: {
        dataOwner: {
          title: "Data Owner",
          description: "I want to manage permissions of other parties to access my data."
        },
        dataConsumer: {
          title: "Data Consumer",
          description: "I want to access and use data of other parties."
        },
        dataProvider: {
          title: "Data Provider",
          description: "I want toprovide data of Data Owners to Data Consumers."
        }
      }
    },
    summary: {
      labels: {
        partyId: "Party ID",
        partyName: "Party Name",
        role: "Role",
        m2m: "M2M Services",
        identity: "Identity",
        location: "Location",
        authRegistry: "Authorisation Registry",
        capabilities: "Capabilities URL",
        cttProof: "CTT Proof",
        account: "Account Details"
      }
    },
    submission:{
      title: "We have received your information!",
      message: "Please wait while we submit your registration. This may take a few seconds.",
      successMessage: "Thank you, we will manually verify your information. Next, you will receive an email that contains a link to a page where you can sign the necessary agreements.\n\nYou can now close this page.",
      successMessageAutoComplete: "Thank you, we have automatically completed your registration. You will receive a confirmation email shortly.\n\nYou can now close this page.",
      errorMessage: "An error occurred while submitting your registration. Please try again later."
    },
    agreements: {
      title: "Sign agreements",
      confirmText: "I agree that this action qualifies as a signature and hereby confirm that I have read the agreements and wish to sign them.",
      signButton: "Sign and commit",
      signing: "Signing...",
      manualTitle: "Sign the agreements manually",
      manualDescription: "Download the documents, sign them, scan them and upload. Your signature will be reviewed manually by the Association Admin.",
      download: "Agreements",
      uploadTitle: "Upload the signed agreements",
      dragDrop: "Drag & Drop signed agreements here",
      or: "or",
      browse: "Browse files",
      back: "Back",
      commit: "Commit signed agreements",
      committing: "Committing...",
      maxSize: "Maximum file size: 5MB",
      uploadSuccess: "File uploaded successfully",
      uploadError: "Error uploading file",
      receiveTitle: "We have received your agreement!",
      receiveMessage: "Thank you for signing the agreement. We will review the agreement and when correct, sign it ourselves. You will receive an email with the signed agreement once this step is finished.",
      closeMessage: "You can now close this screen.",
      minimumFiles: "Please upload a signed copy of each agreement",
      uploadLimits: "Max. 20 MB per file (45 MB total) • PDF",
      fileTooLarge: "Each signed agreement must be 20 MB or smaller.",
      totalTooLarge: "The signed agreements are too large to upload together (max 45 MB).",
      consentRequired: "Please confirm the statement above to sign with eHerkenning.",
      signError: "We couldn't submit your signature. Please try again.",
      invalidType: "Only PDF files are accepted for agreements",
      signingMethod: "Choose signing method",
      signingMethodSubtitle: "Your onboarding application has been verified by the Association Admin. \nYou may now sign the agreements and request membership of the Association.",
      eherkenningSigningDescription: "Use eHerkenning to log in and sign the agreements",
      manualSigning: "Manual signing",
      manualSigningDescription: "Manually download, sign and upload the agreements",

    },
    success: {
      title: "Congratulations, the onboarding was successful!",
      message: "You have successfully completed the onboarding process. You can now start using the platform."
    },
    completed: {
      title: "Congratulations!",
      message: "Onboarding was successfully done!"
    },
    rejected: {
      title: "Proposal Rejected",
      message: "Your proposal was rejected!",
      editButton: "Edit proposal"
    }
  },
  admin: {
    title: "Application overview",
    table: {
      headers: {
        applicant: "Applicant",
        company: "Company",
        role: "Role",
        status: "Status",
        nextStepBy: "Next step by",
        actions: "Actions"
      }
    },
    status: {
      initiated: "Initiated",
      verify_information: "Verify information",
      sign_agreements: "Sign agreements",
      verify_signed_agreements: "Verify signed agreements",
      completed: "Completed",
      rejected: "Rejected"
    },
    actions: {
      verify: "Verify",
      view: "View",
      add: "Add",
      createParty: "Create party"
    },
    common: {
      na: "N/A"
    },
    messages: {
      loadFailed: "Failed to fetch proposals"
    },
    view: {
      title: "View Application",
      subtitle: "Application details",
      labels: {
        status: "Status",
        role: "Role",
        m2mServices: "M2M services",
        location: "Location",
        authRegistry: "Authorisation Registry",
        capabilitiesUrl: "Capabilities URL",
        cttProof: "CTT Proof",
        accountName: "Account name",
        accountEmail: "Account email",
        accountPhone: "Account phone",
        createdAt: "Created At"
      }
    }
  },
  users: {
    title: "User Management",
    loading: "Loading users...",
    table: {
      headers: {
        username: "Username",
        email: "Email",
        name: "Name",
        status: "Status",
        created: "Created Date",
        actions: "Actions",
        role: "Role"
      }
    },
    status: {
      active: "Active",
      inactive: "Inactive"
    },
    actions: {
      create: "Create new user",
      delete: "Delete"
    },
    messages: {
      error: {
        fetch: "Error fetching users",
        delete: "Error deleting user",
        create: "Error creating user",
        invite: "Error sending invite email",
        roleAssignment: "Error assigning role to user",
        roleNotFound: "Role not found in the system"
      },
      success: {
        delete: "User deleted successfully"
      }
    },
    dialog: {
      title: "Create New User",
      email: "Email",
      firstName: "First Name",
      lastName: "Last Name",
      cancel: "Cancel",
      create: "Create",
      role: "Role"
    },
    roles: {
      user: "User",
      admin: "Administrator",
      satelliteAdmin: "Satellite admin",
      partyAdmin: "Party admin"
    },
    validation: {
      emailRequired: "Email is required",
      emailInvalid: "Please enter a valid email address",
      firstNameRequired: "First name is required",
      lastNameRequired: "Last name is required"
    }
  },
  settings: {
    title: "Settings",
    subtitle: "Manage your portal branding, registry details and onboarding agreements.",
    sections: {
      general: "General Settings",
      system: "Participant Registry",
      branding: "Branding",
      registry: "Registry",
      headerImage: "Header Image",
      introText: "Introduction Text"
    },
    actions: {
      save: "Save settings",
      saving: "Saving…",
      upload: "Upload image",
      uploadIcon: "Upload icon",
      modifyImage: "Modify image",
      modifyIcon: "Modify icon",
      add: "Add",
      recheck: "Re-check"
    },
    messages: {
      saveSuccess: "Settings saved successfully",
      saveFailed: "Failed to save settings",
      loadFailed: "Failed to load settings",
      uploadFailed: "Failed to upload logo image",
      backendNotConfigured: "Backend URL not configured"
    },
    system: {
      description: "The iSHARE framework version this portal operates against, and its live connection to the Satellite registry.",
      version: "Framework version",
      connection: "Connection",
      connected: "Connected",
      disconnected: "Disconnected",
      checking: "Checking…",
      claimModel: "Claim model (v3)",
      partyModel: "Party model (v2)",
      unknown: "Unknown"
    },
    connection: {
      test: "Test connection",
      testing: "Testing…",
      testOk: "Connected successfully (version {{version}}).",
      testFailed: "Connection failed: {{error}}",
      certificate: "Client certificate",
      certConfigured: "Configured",
      certMissing: "Not configured",
      baseUrl: "Satellite base URL",
      iss: "Client ID (iss)",
      aud: "Audience (aud)",
      version: "Framework version override",
      versionPlaceholder: "auto-detected",
      tokenEndpoint: "Token endpoint",
      tokenScope: "Token scope",
      epCreationEndpoint: "ep_creation endpoint (v2)",
      partiesEndpoint: "Parties endpoint (v3)",
      dataspaceSelect: "Dataspace",
      dataspacePlaceholder: "Select a dataspace…",
      dataspacesEmpty: "No dataspaces found in the registry.",
      prefillAuthRegistry: "Prefill authorisation registry",
      prefillAuthRegistryHint: "Makes the selected authorisation registry static during onboarding so applicants do not need to pick one.",
      authRegistrySelect: "Authorisation registry",
      authRegistryPlaceholder: "Select an authorisation registry…",
      authRegistriesEmpty: "No authorisation registries found in the registry.",
      authRegistryUrl: "Authorisation registry URL",
      credentialsNote: "The client certificate and private key are configured via deployment environment variables and are never editable here."
    },
    labels: {
      headerImage: "Header image",
      introText: "Introduction text",
      agreement: "Agreement",
      registrarId: "Registrar ID",
      dataspaceId: "Dataspace ID",
      dataspaceTitle: "Dataspace title",
      agreements: "Agreements",
      hideCapabilitiesUrl: "Hide capabilities URL field",
      hideCapabilitiesUrlHint: "If enabled, applicants will not see or need to fill the capabilities URL during onboarding."
    },
    agreements: {
      title: "Onboarding agreements",
      description: "Documents applicants must read and sign during onboarding. The iSHARE Terms of Use and Accession Agreement are included by default; add your own by uploading a PDF or linking a URL.",
      empty: "No agreements configured.",
      version: "Version",
      versionPlaceholder: "e.g. 05-03-2025",
      sourceBuiltin: "Built-in",
      sourceFile: "Uploaded",
      sourceUrl: "URL",
      sourceLabel: "Label",
      protected: "Protected · {{method}}",
      open: "Open",
      remove: "Remove",
      removeTitle: "Delete agreement",
      removeConfirm: "Are you sure you want to delete this agreement?",
      minimumWarning: "Users are unable to finish onboarding with less than 2 agreements configured.",
      typeLabel: "Type",
      types: {
        frameworkAgreement: "Framework Agreement",
        dataspaceAgreement: "Dataspace Agreement",
        termsOfUse: "Terms of Use",
        accessionAgreement: "Accession Agreement"
      },
      addTitle: "Add an agreement",
      modeFile: "Upload PDF",
      modeUrl: "From URL",
      titleLabel: "Title",
      titlePlaceholder: "e.g. Data Processing Agreement",
      fileLabel: "PDF file",
      choosePdf: "Choose PDF file",
      urlLabel: "Document URL",
      urlPlaceholder: "https://example.org/agreement.pdf",
      add: "Add agreement",
      adding: "Adding…",
      auth: {
        label: "URL authentication",
        method: "Auth method",
        none: "None (public)",
        basic: "Basic auth",
        bearer: "Bearer / API key",
        oauth2: "OAuth2 client credentials",
        custom: "Custom header(s)",
        username: "Username",
        password: "Password",
        headerName: "Header name",
        headerNamePlaceholder: "Authorization",
        scheme: "Scheme",
        schemePlaceholder: "Bearer",
        token: "Token / API key",
        tokenUrl: "Token URL",
        clientId: "Client ID",
        clientSecret: "Client secret",
        scope: "Scope",
        scopePlaceholder: "optional",
        headerValue: "Value",
        secret: "Secret",
        addHeader: "Add header",
        keptHint: "Leave a secret blank to keep the stored value.",
        keyMissing: "Set AGREEMENT_AUTH_MASTER_KEY on the backend to store protected-URL credentials."
      },
      messages: {
        added: "Agreement added.",
        removed: "Agreement removed.",
        addFailed: "Failed to add the agreement.",
        removeFailed: "Failed to remove the agreement.",
        fileRequired: "Choose a PDF file.",
        titleRequired: "Enter a title.",
        urlRequired: "Enter a document URL."
      }
    },
    tabs: {
      general: "General",
      onboarding: "Onboarding",
      authentication: "Authentication",
      theme: "Theme"
    },
    auth: {
      loading: "Loading…",
      save: "Save",
      saving: "Saving…",
      cancel: "Cancel",
      secretKept: "•••••••• (leave blank to keep)",
      vcIssuer: {
        title: "Verifiable credential issuer",
        hint: "The external iSHARE VC issuer the participant dashboard polls for credential offers. Leave blank to disable the credentials section.",
        urlLabel: "Issuer base URL",
        urlPlaceholder: "https://issuer.example.com",
        urlHint: "Server-to-server base URL of the issuer's polling API. Overrides the VC_ISSUER_BASE_URL environment default. Any issuer API key is configured via environment only, never here.",
        saved: "Credential issuer saved",
        saveFailed: "Failed to save the credential issuer"
      },
      idp: {
        title: "Connected identity providers",
        hint: "Identity providers configured in this realm. Add, edit or remove the brokers users can sign in through.",
        add: "Add identity provider",
        addTitle: "New identity provider",
        editTitle: "Edit “{{alias}}”",
        empty: "No identity providers configured yet.",
        loadError: "Could not load identity providers.",
        enabled: "Enabled",
        disabled: "Disabled",
        edit: "Edit",
        delete: "Remove",
        deleteTitle: "Remove identity provider",
        deleteConfirm: "Remove the identity provider “{{alias}}”? Users will no longer be able to sign in through it.",
        deleteConfirmLabel: "Remove",
        deleted: "Identity provider removed",
        deleteFailed: "Failed to remove identity provider",
        created: "Identity provider created",
        updated: "Identity provider updated",
        saveFailed: "Failed to save identity provider",
        aliasProviderRequired: "Alias and provider type are required",
        alias: "Alias",
        displayName: "Display name",
        providerId: "Provider type",
        enabledLabel: "Enabled",
        trustEmail: "Trust email",
        config: "Configuration",
        configHint: "Provider settings (e.g. clientId, clientSecret, authorizationUrl). Secret values are hidden — leave them blank to keep the stored value.",
        configKey: "Key",
        configValue: "Value",
        addField: "Add field",
        mappers: {
          title: "Claim mappings",
          hint: "Map this provider's claims to Keycloak user attributes. This portal reads legalSubjectId, kvkNumber, companyName and email from the token.",
          empty: "No claim mappings yet.",
          saveFirst: "Save the identity provider first, then reopen it to add claim mappings.",
          claimPlaceholder: "Source claim (e.g. kvkNumber)",
          attrPlaceholder: "User attribute (e.g. kvkNumber)",
          add: "Add mapping",
          remove: "Remove",
          preset: "Map common iSHARE claims",
          required: "Enter both the source claim and the target attribute",
          addFailed: "Failed to add claim mapping",
          removeFailed: "Failed to remove claim mapping",
          presetDone: "Mapped the common iSHARE claims",
          presetNone: "The common iSHARE claims are already mapped"
        }
      },
      smtp: {
        title: "Email (SMTP)",
        hint: "The mail server Keycloak uses to send account emails (verification, password reset, invitations).",
        host: "Host",
        port: "Port",
        from: "From address",
        fromDisplayName: "From display name",
        replyTo: "Reply-to",
        ssl: "Use SSL",
        starttls: "Use StartTLS",
        auth: "Server requires authentication",
        user: "Username",
        password: "Password",
        saved: "SMTP settings saved",
        saveFailed: "Failed to save SMTP settings",
        test: "Send test email",
        testing: "Sending…",
        testTo: "Send test to",
        testToPlaceholder: "you@example.com",
        testToHint: "We'll send a test message to this address using the settings above.",
        recipientRequired: "Enter a recipient email address for the test",
        testOk: "Test email sent to {{to}}",
        testFailed: "SMTP test failed"
      }
    },
    onboarding: {
      flowTitle: "Onboarding flow",
      flowHint: "Control how applicants move through the onboarding wizard.",
      associationName: "Association name",
      associationNamePlaceholder: "e.g. iSHARE Demo Association",
      associationNameHint: "Shown in the portal header. Leave empty to use the deployment default.",
      activeRoles: "Selectable roles",
      activeRolesHint: "Which roles applicants can choose during onboarding.",
      roles: {
        dataconsumer: "Data consumer",
        dataowner: "Data owner",
        dataprovider: "Data provider"
      },
      defaultRole: "Default role",
      defaultRoleNone: "No default (let the applicant choose)",
      defaultRoleHint: "Pre-selects this role on the role step.",
      skipRoles: "Skip the role-selection step",
      skipRolesHint: "Hide the role step entirely (use with a default role).",
      autoAccept: "Auto-accept proposals",
      autoAcceptHint: "Complete proposals automatically on submit, without manual admin approval.",
      requireQualifiedEidasCertificate: "Require a qualified eIDAS certificate",
      requireQualifiedEidasCertificateHint: "Require QCCompliance together with a QCP policy or qualified certificate type during eIDAS upload. Certificate parsing, expiry and registry trust checks always remain enabled.",
      dataspaceAuthTitle: "Dataspace & authorization",
      dataspaceAuthHint: "The dataspace applicants join and the authorization registry pre-filled for them."
    },
    theme: {
      title: "Colours & fonts",
      description: "Customise the portal's colours and fonts to match your organisation's brand. Defaults follow the iSHARE brand guidelines. Changes preview live here — Save stores a theme, and Apply publishes it to every visitor.",
      library: {
        selectLabel: "Theme",
        brandDefault: "iSHARE brand default",
        nameLabel: "Theme name",
        namePlaceholder: "e.g. Acme Corp",
        save: "Save theme",
        apply: "Publish theme",
        delete: "Delete",
        currentlyLive: "Live now: {{name}}",
        hint: "Save stores a theme as a draft without changing the live portal. Apply publishes the selected theme to every visitor.",
        savedToast: "Theme saved.",
        appliedToast: "Theme applied — every visitor now sees it.",
        deletedToast: "Theme deleted.",
        nameRequired: "Enter a theme name first.",
        deleteActiveBlocked: "Apply a different theme before deleting the one that's live.",
        import: "Import",
        export: "Export",
        importedToast: "Theme imported — review it, then Save to keep it.",
        exportedToast: "Theme exported.",
        importError: "That file isn't a valid theme."
      },
      logo: "Logo & favicon",
      logoHint: "Upload your organisation's logo (PNG, JPG or SVG). It appears in the portal header; if none is set, the default iSHARE logo is used.",
      favicon: "Browser tab icon",
      faviconHint: "Shown in the browser tab. A square PNG, SVG or ICO works best; uses the iSHARE icon if not set.",
      logoConstraints: "PNG, JPG or SVG · up to 5 MB",
      faviconConstraints: "ICO, PNG or SVG · square works best · up to 1 MB",
      fileTooLarge: "That file is too large — maximum {{max}}.",
      badDimensions: "Image dimensions must be between {{min}} and {{max}} pixels.",
      fonts: {
        heading: "Heading font",
        body: "Body font"
      },
      groups: {
        brand: "Brand",
        buttons: "Buttons",
        text: "Text",
        surface: "Surfaces",
        typography: "Typography"
      },
      tokens: {
        primary: "Primary",
        secondary: "Secondary",
        accent: "Accent",
        buttonPrimary: "Primary button",
        buttonPrimaryHover: "Primary button (hover)",
        buttonSecondary: "Secondary button",
        textPrimary: "Body text",
        textSecondary: "Headings",
        background: "Background",
        borderColor: "Borders",
        errorColor: "Error"
      },
      actions: {
        reset: "Reset to brand defaults"
      },
      preview: "Preview",
      previewHeading: "The quick brown fox",
      previewBody: "This is how headings, body text and buttons look with the selected colours.",
      previewPrimaryBtn: "Primary action",
      previewSecondaryBtn: "Secondary",
      messages: {
        resetDone: "Editor reset to the iSHARE brand defaults."
      }
    }
  },
  verify: {
    steps: {
      verifyInfo: "Verify information",
      verifyAgreement: "Verify signed agreement",
      signAgreement: "Sign agreement",
      downloadAgreement: "Download Signed Agreement",
      downloadError: "Error downloading agreement",
      noAgreementFound: "No signed agreement found"
    },
    info: {
      title: "Verify Information",
      subtitle: "Please verify the details provided by the applicant with number {{kvkNumber}} to proceed with onboarding.",
      labels: {
        role: "Role",
        m2mServices: "M2M services",
        location: "Location",
        authRegistry: "Authorisation Registry",
        capabilitiesUrl: "Capabilities URL",
        cttProof: "CTT Proof upload",
        accountName: "Account name",
        accountEmail: "Account email",
        accountPhone: "Account phone"
      },
      buttons: {
        approve: "Approve",
        insufficient: "Details insufficient",
        approving: "Approving..."
      }
    },
    agreement: {
      title: "Verify manually signed agreement",
      subtitle: "Download the agreement to verify if it is sufficient.",
      downloadText: "Download agreements",
      eherkenningTitle: "Confirm eHerkenning signature",
      eherkenningSubtitle: "This applicant signed the agreements electronically via eHerkenning. There are no uploaded documents to review — approving will counter-sign and complete their onboarding.",
      buttons: {
        approve: "Approve & sign",
        reject: "Reject agreement",
        approving: "Approving & signing...",
        rejecting: "Rejecting agreement..."
      },
      errors: {
        approveFailed: "Failed to approve and sign the agreement"
      }
    }
  },
  profile: {
    title: "Profile Settings",
    labels: {
      email: "Email Address",
      firstName: "First Name",
      lastName: "Last Name",
      newPassword: "New Password (optional)",
      confirmPassword: "Confirm Password",
      language: "Language"
    },
    linkedAccounts: {
      title: "Login methods",
      description: "Link standard login providers to this portal account. The provider alias must exist as an Identity Provider in Keycloak.",
      alias: "Keycloak alias",
      refresh: "Refresh",
      status: {
        linked: "Linked",
        notLinked: "Not linked"
      },
      actions: {
        link: "Link",
        relink: "Relink"
      },
      messages: {
        linked: "The login method was linked successfully.",
        cancelled: "The linking flow was cancelled.",
        error: "The linking flow failed. Please try again."
      },
      errors: {
        loadFailed: "Could not load linked login methods"
      }
    },
    errors: {
      loadFailed: "Failed to load profile",
      updateFailed: "Failed to update profile",
      passwordMismatch: "Passwords do not match",
      passwordUpdateFailed: "Failed to update password"
    }
  },
  submit: {
    title: "Submit Party Information",
    identity: {
      heading: "Participant Identity",
      partyId: "Party ID",
      partyIdPlaceholder: "EU.EORI.NL000000000",
      partyName: "Party Name",
      partyNamePlaceholder: "Legal entity name",
      alsoKnownAs: "Also Known As",
      alsoKnownAsPlaceholder: "Trade name, brand, …",
      schemaVersion: "Schema Version"
    },
    claim: {
      heading: "Claim {{index}} — {{type}}",
      type: "Claim Type",
      status: "Status",
      registrarId: "Registrar ID",
      startDate: "Start Date",
      endDate: "End Date",
      frameworkId: "Framework ID",
      capabilityUrl: "Capability URL",
      description: "Description",
      website: "Website",
      companyEmail: "Company Email",
      publiclyPublishable: "Publicly Publishable",
      authRegistryName: "Authorisation Registry Name",
      authRegistryId: "Authorisation Registry ID",
      authRegistryUrl: "Authorisation Registry URL",
      dataspaceId: "Dataspace ID",
      serviceProviderPartyId: "Service Provider Party ID",
      agreementType: "Agreement Type",
      agreementId: "Agreement ID",
      title: "Title",
      verificationHash: "Verification Hash",
      roleId: "Role ID",
      loa: "Level of Assurance",
      compliancyVerified: "Compliancy Verified",
      legalAdherence: "Legal Adherence",
      subjectName: "Subject Name",
      certificateType: "Certificate Type",
      x5c: "Certificate (x5c, base64 DER)",
      x5t: "Thumbprint (x5t#S256)",
      assertion: "Assertion",
      minimum: "Required for v3 party"
    },
    claimTypes: {
      frameworkCompliance: "Framework Compliance",
      authRegistry: "Authorisation Registry",
      frameworkAgreement: "Framework Agreement",
      frameworkRole: "Framework Role",
      x509Certificate: "X.509 Certificate",
      dataspaceMembership: "Dataspace Membership",
      dataspaceAgreement: "Dataspace Agreement",
      idpAssertion: "IdP Assertion"
    },
    status: {
      active: "Active",
      inactive: "Inactive",
      revoked: "Revoked",
      suspended: "Suspended"
    },
    loa: {
      low: "Low",
      substantial: "Substantial",
      high: "High",
      notApplicable: "Not applicable"
    },
    yesNoNa: {
      yes: "Yes",
      no: "No",
      notApplicable: "Not applicable"
    },
    booleanOptions: {
      yes: "Yes",
      no: "No"
    },
    placeholders: {
      framework: "e.g. iSHARE",
      url: "https://…",
      date: "YYYY-MM-DD",
      agreementType: "e.g. AccessionAgreement",
      roleId: "e.g. dataConsumer",
      certificateType: "e.g. signing"
    },
    actions: {
      addClaim: "Add Claim",
      addAlsoKnownAs: "Add Also Known As",
      remove: "Remove",
      create: "Create",
      submitting: "Submitting…"
    },
    messages: {
      submitError: "Failed to submit party. {{message}}",
      submitSuccess: "Party submitted successfully."
    },
    upload: {
      or: "or",
      browse: "Browse files",
      certText: "Drag and drop your certificate here",
      agreementText: "Drag and drop the signed agreement (PDF) here",
      certInvalidType: "Invalid file type. Allowed: .pem, .crt, .cer, .der",
      agreementInvalidType: "Invalid file type. Please upload a PDF.",
      certTooLarge: "Certificate exceeds the 1 MB limit.",
      agreementTooLarge: "PDF exceeds the 10 MB limit.",
      certParseError: "Could not read the certificate. Ensure it is a valid X.509 (PEM/DER) file.",
      agreementReadError: "Could not read the PDF file."
    },
    v2: {
      sections: {
        participant: "Participant details",
        certificate: "Certificate",
        authRegistries: "Authorisation registries",
        additionalInfo: "Participant additional details",
        agreements: "Agreements (minimum 2)",
        roles: "Roles (minimum 1)",
        spor: "SPOR"
      },
      fields: {
        dataspaceTitle: "Dataspace title",
        logo: "Logo URL",
        companyPhone: "Company phone",
        tags: "Tags",
        signDate: "Date of signing",
        expiryDate: "Date of expiry",
        framework: "Framework",
        contractFile: "Contract file",
        role: "Role",
        signedRequest: "Signed request"
      },
      actions: {
        addAuthRegistry: "Add authorisation registry",
        addAgreement: "Add agreement",
        addRole: "Add role",
        cancel: "Cancel",
        save: "Save",
        back: "Back"
      },
      placeholders: {
        partyId: "EU.EORI.NL000000000",
        registrarId: "EU.EORI.NL000000000"
      }
    }
  }
}

export default en
