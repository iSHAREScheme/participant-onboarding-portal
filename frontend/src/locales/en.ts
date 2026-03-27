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
    profile: "Profile"
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
      idcheckRequired: "Please provide the required Identification",
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
      minimumFiles: "Please upload at least 2 signed agreements",
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
        nextStepBy: "Next step by"
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
      add: "Add"
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
    sections: {
      general: "General Settings",
      headerImage: "Header Image",
      introText: "Introduction Text"
    },
    actions: {
      save: "Save Settings",
      upload: "Upload Image",
      add: "Add"
    },
    messages: {
      saveSuccess: "Settings saved successfully",
      saveFailed: "Failed to save settings",
      loadFailed: "Failed to load settings",
      uploadFailed: "Failed to upload logo image",
      backendNotConfigured: "Backend URL not configured"
    },
    labels: {
      headerImage: "Header Image:",
      introText: "Introduction Text:",
      agreement: "Agreement:",
      registrarId: "Registrar ID:",
      dataspaceId: "Dataspace ID:",
      agreements: "Agreements",
      hideCapabilitiesUrl: "Hide capabilities URL field",
      hideCapabilitiesUrlHint: "If enabled, applicants will not see or need to fill the capabilities URL during onboarding."
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
    errors: {
      loadFailed: "Failed to load profile",
      updateFailed: "Failed to update profile",
      passwordMismatch: "Passwords do not match",
      passwordUpdateFailed: "Failed to update password"
    }
  }
};
