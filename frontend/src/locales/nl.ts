
export default {
  common: {
    login: "Inloggen",
    logout: "Uitloggen",
    home: "Home",
    proposals: "Voorstellen",
    users: "Gebruikers",
    settings: "Instellingen",
    save: "Opslaan",
    continue: "Doorgaan",
    back: "Terug",
    submit: "Verzenden",
    error: "Fout",
    success: "Succes",
    loading: "Laden...",
    required: "Verplicht",
    edit: "Bewerken",
    delete: "Verwijderen",
    cancel: "Annuleren",
    confirm: "Bevestigen",
    next: "Volgende",
    previous: "Vorige",
    profile: "Profiel",
    participants: "Deelnemers"
  },
  participants: {
    title: "Deelnemers",
    refresh: "Vernieuwen",
    loading: "Deelnemers laden...",
    error: "Kan deelnemers niet laden.",
    empty: "Geen deelnemers gevonden.",
    search: "Zoek op naam…",
    filters: {
      all: "Alle deelnemers",
      mine: "Mijn deelnemers",
      active: "Alleen actief",
      certified: "Alleen gecertificeerd"
    },
    noResults: "Geen deelnemers komen overeen met de zoekopdracht.",
    table: {
      partyId: "Party ID",
      name: "Naam",
      roles: "Rollen",
      status: "Status",
      startDate: "Startdatum",
      endDate: "Einddatum"
    },
    pagination: {
      previous: "Vorige",
      next: "Volgende",
      last: "Laatste",
      page: "Pagina {{current}} van {{total}}"
    },
    detail: {
      back: "Terug naar deelnemers",
      loading: "Deelnemer laden…",
      error: "Kan deelnemer niet laden.",
      notFound: "Deelnemer niet gevonden.",
      schemaLabel: "Schema",
      sections: {
        identity: "Identiteit",
        adherence: "Naleving",
        roles: "Rollen",
        agreements: "Overeenkomsten",
        authRegistries: "Autorisatieregisters",
        certificates: "Certificaten",
        additionalInfo: "Aanvullende informatie",
        claims: "Claims"
      },
      fields: {
        partyId: "Party ID",
        name: "Naam",
        registrarId: "Registrar ID",
        capabilityUrl: "Capability URL",
        schemaVersion: "Schemaversie",
        status: "Status",
        startDate: "Startdatum",
        endDate: "Einddatum",
        role: "Rol",
        loa: "Mate van zekerheid",
        legalAdherence: "Juridische naleving",
        compliancyVerified: "Compliance geverifieerd",
        framework: "Framework",
        agreementType: "Type",
        title: "Titel",
        signDate: "Ondertekeningsdatum",
        expiryDate: "Vervaldatum",
        hash: "Hash",
        authRegistryName: "Naam",
        authRegistryId: "Register ID",
        authRegistryUrl: "URL",
        dataspaceId: "Dataspace ID",
        description: "Omschrijving",
        website: "Website",
        companyEmail: "E-mail bedrijf",
        companyPhone: "Telefoon bedrijf",
        publiclyPublishable: "Openbaar publiceerbaar",
        tags: "Labels"
      },
      empty: {
        roles: "Geen rollen.",
        agreements: "Geen overeenkomsten.",
        authRegistries: "Geen autorisatieregisters.",
        certificates: "Geen certificaten."
      },
      edit: {
        button: "Bewerken",
        title: "Deelnemer bewerken",
        save: "Opslaan",
        saving: "Opslaan…",
        saveClaim: "Claim opslaan",
        cancel: "Annuleren",
        saved: "Opgeslagen.",
        saveError: "Kan wijzigingen niet opslaan.",
        claimsTitle: "Claims"
      }
    }
  },
  home: {
    title: "Titel",
    beforeCommencing: "Voordat u begint",
    readyText: "Heeft u alle benodigdheden bij de hand?",
    proceedButton: "Start de onboarding",
    agreementText: "Wanneer u zich bij deze relatie aansluit, wordt u gevraagd de volgende overeenkomsten te ondertekenen:",
    agreement1: "Overeenkomst 1",
    agreement2: "Overeenkomst 2",
    agreement3: "Overeenkomst 3",
    noAgreements: "Geen overeenkomsten beschikbaar",
    beforeDescription: "Zorg ervoor dat u de volgende informatie bij de hand heeft om de onboarding succesvol te doorlopen:",
    requirements: {
      idEherkenning: "EHerkenning login voor uw organisatie",
      location: "of eIDAS eSeal certificaat van uw organisatie"
    },
    approved: {
      title: "Welkom, {{name}}",
      message: "Welkom bij het onboarding portaal van onze vereniging. Dit portaal stelt u in staat om uw status te controleren en alle taken te voltooien om uw organisatie aan te sluiten bij onze vereniging."
    },
  },
  onboarding: {
    status: {
      title: "Onboarding status",
      formCompleted: "Formulier voltooid",
      verifiedInformation: "Informatie geverifieerd door de vereniging",
      uploadSignedAgreements: "Upload ondertekende overeenkomsten",
      signAgreements: "Onderteken overeenkomsten",
      verifySignedAgreements: "Vereniging verifieert ondertekende overeenkomsten",
      onboardingComplete: "Onboarding voltooid"
    }
  },
  register: {
    title: "Registratie",
    steps: {
      role: "Rol",
      m2m: "M2M",
      idCheck: "IDControle",
      location: "Locatie",
      association: "Associatie",
      account: "Account",
      confirm: "Bevestigen",
      signingMethod: "Teken methode",
      agreements: "Overeenkomsten tekenen",
      success: "Gefeliciteerd!",
      completed: "Voltooid",
      rejected: "Afgewezen"
    },
    idCheck: {
      title: "Identiteitscontrole",
      subtitle: "Voor meer zekerheid over uw online identiteit, identificeert u zich alstublieft met een van de volgende methoden.",
      eHerkenning: "eHerkenning",
      eHerkenningInfo: "Wij gebruiken eHerkenning voor meer zekerheid over de online identiteit van uw organisatie. Met eHerkenning identificeert u uw organisatie veilig en eenvoudig online. Het grote gemak is dat u met eHerkenning bij meerdere organisaties kunt inloggen, waardoor u minder wachtwoorden hoeft te onthouden. Veilig, makkelijk en betrouwbaar. Ga voor meer informatie naar www.eherkenning.nl.",
      eidas: "eIDAS Advance eSeal-certificaat",
      login: "Inloggen",
      useCurrentSession: "Gebruik huidige eHerkenning-sessie",
      linkAccount: "Koppel eHerkenning",
      continueWithEherkenning: "Verder met eHerkenning",
      useLinkedIdentity: "Verder met gekoppelde eHerkenning",
      currentSessionDescription: "Uw huidige eHerkenning-identiteit is klaar om voor deze identiteitscontrole te gebruiken.",
      linkedReadyDescription: "Uw eHerkenning-login is succesvol gekoppeld. Ga verder met deze identiteitscontrole.",
      checkingLinkDescription: "We controleren of dit portaalaccount al aan eHerkenning is gekoppeld.",
      linkedAccountDescription: "Dit portaalaccount is al aan eHerkenning gekoppeld. Log in met eHerkenning om met deze identiteitscontrole verder te gaan.",
      linkDescription: "U bent ingelogd met een portaalaccount. Koppel uw eHerkenning-login om met deze identiteitscontrole door te gaan.",
      loginDescription: "Log in met eHerkenning om dit voor deze identiteitscontrole te gebruiken.",
      currentIdentity: "Beschikbare identiteit: {{identity}}",
      currentAccount: "Huidig portaalaccount: {{account}}",
      linkCancelled: "De eHerkenning-koppeling is geannuleerd.",
      linkError: "De eHerkenning-koppeling is mislukt. Probeer het opnieuw.",
      info: "Meer zekerheid over uw online identiteit, daarom gebruiken wij eHerkenning. Met eHerkenning identificeert u zich veilig en eenvoudig online. Het grote gemak is dat u met eHerkenning bij meerdere organisaties kunt inloggen. U hoeft dus minder wachtwoorden te onthouden. Veilig, makkelijk en betrouwbaar.",
      forMoreInfo: "voor meer informatie",
      partyId: "Partij ID",
      partyName: "Partij Naam",
      eidasCertificate: "Een eSeal (elektronisch zegel) is een digitaal certificaat dat de herkomst en integriteit van gegevens namens een organisatie waarborgt. Het certificaat wordt uitgegeven door een erkende vertrouwensdienstverlener en bevestigt dat de verzender een geverifieerde organisatie is. Zo weet u zeker dat de informatie authentiek en ongewijzigd is.",
      eidasProvide: "Verstrek uw certificaat hier:",
      eidasInfo: "Voor meer informatie over het verkrijgen van dergelijke certificaten, raadpleeg de eSEAL-aanschafgids."
    },
    form: {
      companyName: "Bedrijfsnaam",
      kvkNumber: "KVK Nummer",
      partyId: "Partij ID",
      partyName: "Partij Naam",
      address: "Adres",
      city: "Stad",
      country: "Land",
      website: "Website",
      contactName: "Contactpersoon",
      contactEmail: "Contact E-mail",
      contactPhone: "Telefoonnummer"
    },
    m2m: {
      title: "Machine to machine services",
      subtitle: "Vul de volgende vragen in, zodat we uw onboarding kunnen voorbereiden.",
      description: "Gaat u gebruik maken van machine-to-machine-services (M2M) (d.w.z. API-verbindingen)?",
      yes: {
        title: "Ja",
        description: "Selecteer dit als u verwacht M2M-diensten te gebruiken"
      },
      no: {
        title: "Nee",
        description: "Selecteer dit als u verwacht gebruik te maken van diensten als menselijke gebruiker"
      },
      question: "Wilt u gebruik maken van M2M diensten?"
    },
    location: {
      title: "Locatie details",
      subtitle: "Geef de volgende gegevens door van de locatie van uw organisatie",
      placeholders: {
        address: "Adres",
        zipCode: "Postcode",
        city: "Stad",
        country: "Land",
        website: "Website"
      }
    },
    association: {
      title: "Associatie-instellingen",
      subtitle: "Selecteer de volgende associatie-instellingen",
      selectRegistry: "Selecteer Autorisatie Register",
      authRegistryName: "Autorisatie Register Naam",
      authRegistryUrl: "Autorisatie Register URL",
      capabilitiesUrl: "Capabilities URL",
      uploadSection: {
        title: "Upload het CTT Bewijs",
        dragDrop: "Sleep & Drop bestand hier",
        or: "of",
        browse: "Blader door bestanden",
        maxSize: "Maximale bestandsgrootte: 5MB",
        invalidType: "Ongeldig bestandstype. Alleen PDF bestanden zijn toegestaan.",
        uploadSuccess: "Bestand succesvol geüpload",
        uploadError: "Fout bij uploaden bestand"
      },
      singleSubtitle: "Uw associatieinstellingen zijn al voor u ingevuld. Ga verder naar de volgende stap."
    },
    account: {
      title: "Administratief contactpersoon",
      subtitle: "Wilt u een ander administratie contactpersoon opgeven die wij kunnen benaderen in geval van vragen over de ingevulde gegevens? Geef op dit scherm dan de gegevens door.",
      placeholders: {
        name: "Naam",
        email: "E-mailadres",
        phone: "Telefoonnummer"
      }
    },
    confirm: {
      title: "Bevestiging",
      subtitle: "Bevestig dat u alle vereiste informatie heeft verstrekt. De informatie wordt gedeeld met {{registry}} voor verificatie. Na verificatie ontvangt u een e-mail met een link naar een pagina waar u de benodigde overeenkomsten kunt ondertekenen.",
      labels: {
        role: "Rol",
        m2m: "M2M diensten",
        identity: "Identiteit",
        location: "Locatie",
        partyId: "Partij ID",
        partyName: "Partij Naam",
        authRegistry: "Autorisatie Register",
        capabilities: "Capabilities URL",
        cttProof: "CTT Bewijs upload",
        account: "Accountgegevens",
        companyName: "Bedrijfsnaam",
        kvkNumber: "KVK Nummer",
        name: "Naam",
        email: "E-mail",
        phone: "Telefoon",
        noFile: "Geen bestand geüpload",
        terms: "Om te bevestigen moet u met de volgende voorwaarden akkoord gaan:"
      },
      buttons: {
        back: "Terug",
        continue: "Doorgaan",
        submit: "Ik bevestig dat de informatie correct is",
        submitted: "Registratie verzonden"
      }
    },
    role: {
      title: "Rol",
      subtitle: "Vul de volgende vragen in, zodat we uw onboarding kunnen voorbereiden.",
      options: {
        dataOwner: {
          title: "Data Eigenaar",
          description: "Ik wil de machtigingen van andere partijen beheren om toegang te krijgen tot mijn data."
        },
        dataConsumer: {
          title: "Data Gebruiker",
          description: "Ik wil toegang krijgen tot en gebruik maken van data van andere partijen."
        },
        dataProvider: {
          title: "Data Aanbieder",
          description: "Ik wil data van Data Eigenaren aanbieden aan Data Gebruikers."
        }
      }
    },
    validation: {
      roleRequired: "Selecteer ten minste één rol",
      m2mRequired: "Geef aan of u gebruik wilt maken van M2M-diensten",
      identityRequired: "Ga verder met eHerkenning of upload een geldig eIDAS-certificaat",
      selectOption: "Kies een van de aangeboden identificatiemethoden.",
      locationRequired: "Vul alle vereiste gegevens in",
      associationRequired: "Vul alle vereiste gegevens in",
      cttProofRequired: "Upload CTT-bewijs",
      accountRequired: "Vul alle accountgegevens in",
      invalidEmail: "Voer een geldig e-mailadres in",
      invalidWebsite: "Voer een geldige website-url in",
      invalidCapabilitiesUrl: "Voer een geldige mogelijkheden-url in",
      invalidRegistryUrl: "Voer een geldige auth-register-URL in",
      invalidPhone: "Voer een geldig telefoonnummer in"
    },
    success: {
      title: "Gefeliciteerd, de onboarding is succesvol!",
      message: "U heeft het onboarding proces succesvol afgerond. U kunt nu beginnen met het gebruik van het platform."
    },
    completed: {
      title: "Gefeliciteerd!",
      message: "Onboarding is succesvol afgerond!"
    },
    rejected: {
      title: "Voorstel Afgewezen",
      message: "Uw voorstel is afgewezen!",
      editButton: "Voorstel bewerken"
    },
    submission:{
      title: "We hebben uw informatie ontvangen!",
      message: "Please wait while we submit your registration. This may take a few seconds.",
      successMessage: "Bedankt, we zullen uw gegevens handmatig verifiëren. U ontvangt vervolgens een e-mail met een link naar een pagina waar u de benodigde overeenkomsten kunt ondertekenen.\n\nU kunt deze pagina nu sluiten.",
      successMessageAutoComplete: "Bedankt, we hebben uw registratie automatisch voltooid. U ontvangt binnenkort een bevestigingsmail.\n\nU kunt deze pagina nu sluiten.",
      errorMessage: "An error occurred while submitting your registration. Please try again later."
    },
    agreements: {
      title: "Overeenkomsten tekenen",
      confirmText: "Ik ga ermee akkoord dat deze actie geldt als handtekening en bevestig hierbij dat ik de overeenkomsten heb gelezen en wil ondertekenen.",
      signButton: "Tekenen en versturen",
      signing: "Tekenen...",
      manualTitle: "Teken de overeenkomsten handmatig",
      manualDescription: "Download de documenten, onderteken ze, scan ze en upload ze. Uw handtekening wordt handmatig gecontroleerd door de verenigingsbeheerder.",
      download: "Overeenkomsten",
      uploadTitle: "Upload de getekende overeenkomsten",
      dragDrop: "Sleep & Drop getekende overeenkomsten hier",
      or: "of",
      browse: "Blader door bestanden",
      back: "Terug",
      commit: "Verstuur getekende overeenkomsten",
      committing: "Versturen...",
      maxSize: "Maximale bestandsgrootte: 5MB",
      uploadSuccess: "Bestand succesvol geüpload",
      uploadError: "Fout bij uploaden bestand",
      receiveTitle: "We hebben uw overeenkomst ontvangen!",
      receiveMessage: "Bedankt voor het ondertekenen van de overeenkomst. Wij zullen de overeenkomst beoordelen en wanneer correct, zelf ondertekenen. U ontvangt een e-mail met de ondertekende overeenkomst zodra deze stap is voltooid.",
      closeMessage: "U kunt dit scherm nu sluiten.",
      minimumFiles: "Upload minimaal 2 getekende overeenkomsten",
      invalidType: "Alleen PDF-bestanden worden geaccepteerd voor overeenkomsten",
      signingMethod: "Kies ondertekeningsmethode",
      signingMethodSubtitle: "Selecteer de methode die u wilt gebruiken om de overeenkomsten te ondertekenen.",
      eherkenningSigningDescription: "Gebruik eHerkenning om in te loggen en de overeenkomsten te ondertekenen.",
      manualSigning: "Handmatig ondertekenen",
      manualSigningDescription: "Download, teken en upload de overeenkomsten handmatig.",
    },
    summary: {
      labels: {
        partyId: "Partij ID",
        partyName: "Partij Naam",
        role: "Rol",
        m2m: "M2M Diensten",
        identity: "Identiteit",
        location: "Locatie",
        authRegistry: "Autorisatie Register",
        capabilities: "Capabilities URL",
        cttProof: "CTT Bewijs",
        account: "Accountgegevens"
      }
    }
  },
  admin: {
    title: "Aanvragen overzicht",
    table: {
      headers: {
        applicant: "Aanvrager",
        company: "Bedrijf",
        role: "Rol",
        status: "Status",
        nextStepBy: "Volgende stap door",
        actions: "Acties"
      }
    },
    status: {
      initiated: "Gestart",
      verify_information: "Informatie verifiëren",
      sign_agreements: "Overeenkomsten ondertekenen",
      verify_signed_agreements: "Getekende overeenkomsten verifiëren",
      completed: "Voltooid",
      rejected: "Afgewezen"
    },
    actions: {
      verify: "Verifiëren",
      view: "Bekijken",
      add: "Toevoegen",
      createParty: "Deelnemer aanmaken"
    },
    common: {
      na: "N/B"
    },
    messages: {
      loadFailed: "Aanvragen ophalen is mislukt"
    },
    view: {
      title: "Bekijk Aanvraag",
      subtitle: "Aanvraaggegevens",
      labels: {
        status: "Status",
        role: "Rol",
        m2mServices: "M2M diensten",
        location: "Locatie",
        authRegistry: "Autorisatie Register",
        capabilitiesUrl: "Capabilities URL",
        cttProof: "CTT Bewijs",
        accountName: "Account naam",
        accountEmail: "Account e-mail",
        accountPhone: "Account telefoon",
        createdAt: "Aangemaakt op"
      }
    }
  },
  users: {
    title: "Gebruikersbeheer",
    loading: "Gebruikers laden...",
    table: {
      headers: {
        username: "Gebruikersnaam",
        email: "E-mail",
        name: "Naam",
        status: "Status",
        created: "Aanmaakdatum",
        actions: "Acties",
        role: "Rol"
      }
    },
    status: {
      active: "Actief",
      inactive: "Inactief"
    },
    actions: {
      create: "Nieuwe gebruiker",
      delete: "Verwijderen"
    },
    dialog: {
      title: "Nieuwe Gebruiker Aanmaken",
      email: "E-mailadres",
      firstName: "Voornaam",
      lastName: "Achternaam",
      cancel: "Annuleren",
      create: "Aanmaken",
      role: "Rol"
    },
    roles: {
      user: "Gebruiker",
      admin: "Beheerder"
    },
    messages: {
      error: {
        fetch: "Fout bij ophalen gebruikers",
        delete: "Fout bij verwijderen gebruiker",
        create: "Fout bij aanmaken gebruiker",
        invite: "Fout bij verzenden uitnodiging",
        roleAssignment: "Fout bij toewijzen rol aan gebruiker",
        roleNotFound: "Rol niet gevonden in het systeem"
      },
      success: {
        delete: "Gebruiker succesvol verwijderd"
      }
    },
    validation: {
      emailRequired: "E-mailadres is verplicht",
      emailInvalid: "Voer een geldig e-mailadres in",
      firstNameRequired: "Voornaam is verplicht",
      lastNameRequired: "Achternaam is verplicht"
    }
  },
  settings: {
    title: "Instellingen",
    sections: {
      general: "Algemene Instellingen",
      headerImage: "Header Afbeelding",
      introText: "Introductietekst"
    },
    actions: {
      save: "Instellingen Opslaan",
      upload: "Afbeelding Uploaden",
      add: "Toevoegen"
    },
    messages: {
      saveSuccess: "Instellingen succesvol opgeslagen",
      saveFailed: "Kon instellingen niet opslaan",
      loadFailed: "Kon instellingen niet laden",
      uploadFailed: "Kon logo niet uploaden",
      backendNotConfigured: "Backend URL niet geconfigureerd"
    },
    labels: {
      headerImage: "Header Afbeelding:",
      introText: "Introductietekst:",
      registrarId: "Registrar ID:",
      agreement: "Overeenkomst:",
      dataspaceId: "Dataspace ID:",
      agreements: "Overeenkomsten",
      hideCapabilitiesUrl: "Verberg het capabilities-URL veld",
      hideCapabilitiesUrlHint: "Indien ingeschakeld zien aanmelders dit veld niet en hoeven zij geen capabilities-URL in te vullen."
    }
  },
  verify: {
    steps: {
      verifyInfo: "Informatie verifiëren",
      verifyAgreement: "Getekende overeenkomst verifiëren",
      signAgreement: "Overeenkomst tekenen",
      downloadAgreement: "Download Getekende Overeenkomst",
      downloadError: "Fout bij downloaden overeenkomst",
      noAgreementFound: "Geen getekende overeenkomst gevonden"
    },
    info: {
      title: "Informatie Verifiëren",
      subtitle: "Verifieer de gegevens van de aanvrager met KVK nummer {{kvkNumber}} om door te gaan met onboarding.",
      labels: {
        role: "Rol",
        m2mServices: "M2M diensten",
        location: "Locatie",
        authRegistry: "Autorisatie Register",
        capabilitiesUrl: "Capabilities URL",
        cttProof: "CTT Bewijs upload",
        accountName: "Account naam",
        accountEmail: "Account e-mail",
        accountPhone: "Account telefoon"
      },
      buttons: {
        approve: "Goedkeuren",
        approving: "Goedkeuren...",
        insufficient: "Gegevens onvoldoende"
      }
    },
    agreement: {
      title: "Verifieer handmatig getekende overeenkomst",
      subtitle: "Download de overeenkomst om te verifiëren of deze voldoende is.",
      downloadText: "Download overeenkomsten",
      buttons: {
        approve: "Goedkeuren & tekenen",
        approving: "Goedkeuren & tekenen...",
        reject: "Overeenkomst afwijzen",
        rejecting: "Overeenkomst afwijzen..."
      },
      errors: {
        approveFailed: "Goedkeuren en tekenen van de overeenkomst mislukt"
      }
    }
  },
  profile: {
    title: "Profiel Instellingen",
    labels: {
      email: "E-mailadres",
      firstName: "Voornaam",
      lastName: "Achternaam",
      newPassword: "Nieuw Wachtwoord (optioneel)",
      confirmPassword: "Bevestig Wachtwoord"
    },
    errors: {
      loadFailed: "Kon profiel niet laden",
      updateFailed: "Kon profiel niet bijwerken",
      passwordMismatch: "Wachtwoorden komen niet overeen",
      passwordUpdateFailed: "Kon wachtwoord niet bijwerken"
    }
  },
  submit: {
    title: "Partijgegevens verzenden",
    identity: {
      heading: "Identiteit deelnemer",
      partyId: "Partij-ID",
      partyIdPlaceholder: "did:ishare:EU.EORI.NL000000000",
      partyName: "Naam partij",
      partyNamePlaceholder: "Naam rechtspersoon",
      alsoKnownAs: "Ook bekend als",
      alsoKnownAsPlaceholder: "Handelsnaam, merk, …",
      schemaVersion: "Schemaversie"
    },
    claim: {
      heading: "Claim {{index}} — {{type}}",
      type: "Type claim",
      status: "Status",
      registrarId: "Registrar-ID",
      startDate: "Startdatum",
      endDate: "Einddatum",
      frameworkId: "Framework-ID",
      capabilityUrl: "Capability-URL",
      description: "Omschrijving",
      website: "Website",
      companyEmail: "Bedrijfs-e-mail",
      publiclyPublishable: "Openbaar publiceerbaar",
      authRegistryName: "Naam autorisatieregister",
      authRegistryId: "ID autorisatieregister",
      authRegistryUrl: "URL autorisatieregister",
      dataspaceId: "Dataspace-ID",
      serviceProviderPartyId: "Partij-ID dienstverlener",
      agreementType: "Type overeenkomst",
      agreementId: "Overeenkomst-ID",
      title: "Titel",
      verificationHash: "Verificatiehash",
      roleId: "Rol-ID",
      loa: "Mate van zekerheid",
      compliancyVerified: "Compliance geverifieerd",
      legalAdherence: "Juridische naleving",
      subjectName: "Naam onderwerp",
      certificateType: "Type certificaat",
      x5c: "Certificaat (x5c, base64 DER)",
      x5t: "Vingerafdruk (x5t#S256)",
      assertion: "Assertie"
    },
    claimTypes: {
      frameworkCompliance: "Framework-naleving",
      authRegistry: "Autorisatieregister",
      frameworkAgreement: "Framework-overeenkomst",
      frameworkRole: "Framework-rol",
      x509Certificate: "X.509-certificaat",
      dataspaceMembership: "Dataspace-lidmaatschap",
      idpAssertion: "IdP-assertie"
    },
    status: {
      active: "Actief",
      inactive: "Inactief",
      revoked: "Ingetrokken",
      suspended: "Opgeschort"
    },
    loa: {
      low: "Laag",
      substantial: "Substantieel",
      high: "Hoog",
      notApplicable: "Niet van toepassing"
    },
    yesNoNa: {
      yes: "Ja",
      no: "Nee",
      notApplicable: "Niet van toepassing"
    },
    booleanOptions: {
      yes: "Ja",
      no: "Nee"
    },
    placeholders: {
      framework: "bijv. iSHARE",
      url: "https://…",
      date: "JJJJ-MM-DD",
      agreementType: "bijv. AccessionAgreement",
      roleId: "bijv. dataConsumer",
      certificateType: "bijv. signing"
    },
    actions: {
      addClaim: "Claim toevoegen",
      addAlsoKnownAs: "Ook bekend als toevoegen",
      remove: "Verwijderen",
      create: "Aanmaken",
      submitting: "Bezig met verzenden…"
    },
    messages: {
      submitError: "Verzenden van partij mislukt. {{message}}",
      submitSuccess: "Partij succesvol verzonden."
    },
    upload: {
      or: "of",
      browse: "Bestanden bladeren",
      certText: "Sleep uw certificaat hierheen",
      agreementText: "Sleep de getekende overeenkomst (PDF) hierheen",
      certInvalidType: "Ongeldig bestandstype. Toegestaan: .pem, .crt, .cer, .der",
      agreementInvalidType: "Ongeldig bestandstype. Upload een PDF.",
      certTooLarge: "Certificaat overschrijdt de limiet van 1 MB.",
      agreementTooLarge: "PDF overschrijdt de limiet van 10 MB.",
      certParseError: "Kon het certificaat niet lezen. Zorg dat het een geldig X.509-bestand (PEM/DER) is.",
      agreementReadError: "Kon het PDF-bestand niet lezen."
    }
  }
};
