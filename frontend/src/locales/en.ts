import OnboardingStatus from "components/OnboardingStatus";

export default {
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
    cancel: "Cancel",
    confirm: "Confirm",
    next: "Next",
    previous: "Previous",
    profile: "Profile",
    participants: "Participants",
    organizationAccess: "Organization access",
    menu: "Menu"
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
    search: "Search by name…",
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
      endDate: "End date"
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
        claims: "Claims"
      },
      fields: {
        partyId: "Party ID",
        name: "Name",
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
      edit: {
        button: "Edit",
        title: "Edit participant",
        save: "Save",
        saving: "Saving…",
        saveClaim: "Save claim",
        cancel: "Cancel",
        saved: "Saved.",
        saveError: "Failed to save changes.",
        claimsTitle: "Claims"
      }
    }
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
      admin: "Administrator"
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
      removeConfirm: "Remove this agreement?",
      removeBuiltinWarning: "This is a default onboarding agreement. Removing it means applicants will no longer be asked to sign it — and if you remove the agreements required to register a party, onboarding cannot be completed. Remove it anyway?",
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
      theme: "Theme"
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
      confirmPassword: "Confirm Password"
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
      partyIdPlaceholder: "did:ishare:EU.EORI.NL000000000",
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
      assertion: "Assertion"
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
    }
  }
};
