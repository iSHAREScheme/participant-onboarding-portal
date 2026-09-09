
const nl = {
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
    restore: "Herstellen",
    cancel: "Annuleren",
    confirm: "Bevestigen",
    next: "Volgende",
    previous: "Vorige",
    profile: "Profiel",
    participants: "Deelnemers",
    organizationAccess: "Organisatietoegang",
    myParty: "Mijn partij",
    networkHealth: "Netwerkstatus",
    revoke: "Intrekken",
    transfer: "Overdragen",
    lifecycle: "Levenscyclus",
    dataspaces: "Dataspaces",
    frameworks: "Frameworks",
    trustedList: "Vertrouwde lijst",
    issuerWebhooks: "Issuer-webhooks",
    yes: "Ja",
    no: "Nee",
    menu: "Menu",
    clear: "Wissen",
    searching: "Zoeken…",
    noMatches: "Geen overeenkomende deelnemers"
  },
  organizationAccess: {
    title: "Organisatietoegang",
    refresh: "Vernieuwen",
    organization: {
      title: "Geverifieerde organisatie",
      kvk: "KvK-nummer",
      company: "Organisatie"
    },
    noOrganization: {
      title: "Geen eHerkenning-organisatie gevonden",
      description: "Log eerst in of koppel eHerkenning. Zodra de sessie een organisatie-identificatie bevat, kunt u IdP's configureren en toegang delegeren voor die organisatie."
    },
    idp: {
      title: "Organisatie-IdP-koppelingen",
      providerType: "Provider-type",
      alias: "Keycloak-alias",
      displayName: "Weergavenaam",
      issuerUrl: "Issuer / metadata-URL",
      clientId: "Client-ID",
      clientSecret: "Client secret",
      status: "Status",
      create: "IdP-koppeling provisionen",
      empty: "Nog geen organisatie-IdP-koppelingen."
    },
    members: {
      title: "Gedelegeerde personen",
      email: "E-mail",
      providerAlias: "Provider-alias",
      role: "Rol",
      status: "Status",
      create: "Toegang delegeren",
      empty: "Nog geen gedelegeerde personen."
    },
    messages: {
      idpCreated: "IdP-koppeling geprovisioned.",
      memberCreated: "Gedelegeerde toegang opgeslagen."
    },
    errors: {
      load: "Kon organisatietoegang niet laden.",
      idpCreate: "Kon IdP-koppeling niet provisionen.",
      memberCreate: "Kon toegang niet delegeren."
    }
  },
  participants: {
    title: "Deelnemers",
    refresh: "Vernieuwen",
    loading: "Deelnemers laden...",
    error: "Kan deelnemers niet laden.",
    empty: "Geen deelnemers gevonden.",
    search: "Zoek op naam of party-ID…",
    roleFilterAria: "Filter op rol",
    roleAll: "Alle rollen",
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
      dataspace: "Dataspace",
      status: "Status",
      startDate: "Startdatum",
      endDate: "Einddatum",
      access: "Toegang"
    },
    access: {
      owned: "Geregistreerd door dit register — bewerkbaar",
      viewOnly: "Geregistreerd door een ander register — alleen inzien"
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
      projectionLabel: "Geprojecteerd als",
      projectionHint:
        "Het record van deze partij is opgeslagen onder een ouder schema en wordt hier getoond in het nieuwere claim-model. Voor partijen die niet zijn gemigreerd, zijn de claims afgeleid van de opgeslagen gegevens en alleen voor weergave.",
      viewMore: "Meer bekijken",
      close: "Sluiten",
      sections: {
        identity: "Identiteit",
        adherence: "Naleving",
        roles: "Rollen",
        agreements: "Overeenkomsten",
        authRegistries: "Autorisatieregisters",
        certificates: "Certificaten",
        additionalInfo: "Aanvullende informatie",
        claims: "Claims",
        history: "Geschiedenis"
      },
      fields: {
        partyId: "Party ID",
        name: "Naam",
        alsoKnownAs: "Ook bekend als",
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
      history: {
        loading: "Geschiedenis laden…",
        error: "Geschiedenis is momenteel niet beschikbaar.",
        empty: "Geen geschiedenis gevonden.",
        emptyEdited: "Nog geen veldwijzigingen vastgelegd.",
        object: "Object",
        actor: "Actor",
        noFieldChanges: "Geen veldwijzigingen beschikbaar.",
        more: "Nog {{count}} wijzigingen",
        show: "Wijzigingen tonen ({{count}})",
        hide: "Wijzigingen verbergen",
        changesLabel: "{{count}} veldwijzigingen",
        by: "door {{party}}"
      },
      edit: {
        button: "Bewerken",
        title: "Deelnemer bewerken",
        partyInfoTitle: "Partijgegevens",
        partyInfoHint: "Alleen partijgegevens worden hier bewerkt. Elke claim wordt afzonderlijk via zijn kaart bewerkt.",
        editClaim: "Claim bewerken",
        editClaimTitle: "Claim bewerken",
        noEditableClaimFields: "Dit claimtype heeft geen bewerkbare velden — de waarden worden bij uitgifte vastgelegd.",
        akaAppendOnly: "Bestaande aliassen kunnen niet worden gewijzigd of verwijderd — het register accepteert alleen toevoegingen.",
        addClaimButton: "Claim toevoegen",
        addClaimTitle: "Claim toevoegen",
        addClaimType: "Claimtype",
        addClaimSubmit: "Claim toevoegen",
        addClaimMissing: "Verplichte velden ontbreken",
        addClaimCertUpload: "Certificaatbestand",
        addClaimCertRequired: "Certificaatbestand",
        addClaimCertHint: "Het nieuwe certificaat wordt geregistreerd als extra actief certificaat. Het vorige certificaat behoudt zijn eigen status totdat het verloopt of via zijn claimkaart wordt ingetrokken.",
        save: "Opslaan",
        saving: "Opslaan…",
        saveClaim: "Claim opslaan",
        cancel: "Annuleren",
        saved: "Opgeslagen.",
        saveError: "Kan wijzigingen niet opslaan.",
        noComplianceClaim: "Deze deelnemer heeft geen bewerkbare compliance-claim.",
        claimsTitle: "Claims"
      },
      projectionWarn: {
        incompleteTitle: "Onvolledige v3-deelnemer",
        incompleteBody:
          "Deze deelnemer voldoet nog niet aan de v3-onboardingvereisten, dus het register behandelt de deelnemer nog als een verouderd (v2) record en de getoonde claims kunnen afgeleid zijn uit de verouderde gegevens. Voeg de onderstaande ontbrekende claim(s) toe om de migratie naar v3 te voltooien.",
        missingLabel: "Ontbrekende verplichte claims:",
        unmigratedTitle: "Nog niet gemigreerd naar v3",
        unmigratedBody:
          "De gegevens van deze deelnemer lijken volledig, maar zijn nog niet opgeslagen als native v3-claims — de getoonde claims zijn afgeleid uit het verouderde record en dienen alleen ter weergave. Voer de v3-claimmigratie uit om ze op te slaan.",
        req: {
          certOrIdp: "X.509-certificaat of IdP-assertie",
          x509ForRole: "X.509-certificaat (vereist voor de framework-rol)"
        }
      }
    }
  },
  party: {
    back: "Terug naar home",
    admitted: "Toegelaten",
    refresh: "Vernieuwen",
    start: "Onboarding starten",
    loadError: "Kan uw partijgegevens niet laden.",
    none: {
      title: "Nog geen onboarding",
      message: "U bent nog niet met onboarding gestart. Zodra u een registratie indient en deze is goedgekeurd, verschijnen uw partijgegevens hier."
    },
    processing: {
      title: "Onboarding in behandeling",
      message: "Uw registratie wordt verwerkt. Uw partijgegevens verschijnen hier zodra uw organisatie is toegelaten tot het deelnemersregister."
    },
    rejected: {
      title: "Registratie niet goedgekeurd",
      message: "Uw registratie is niet goedgekeurd. Neem contact op met de vereniging voor meer informatie of start een nieuwe registratie."
    },
    welcome: {
      title: "Onboarding voltooid, {{name}}!",
      message: "Uw organisatie is toegelaten tot het deelnemersregister. Hieronder vindt u uw partijgegevens en de credentials die u kunt aanvragen."
    },
    credentials: {
      title: "Credentials",
      description: "Voeg de verifieerbare credentials van uw organisatie toe aan een wallet. Scan een QR-code met uw wallet-app, of open deze op dit apparaat.",
      vcLabel: "Verifieerbare credential",
      notConfigured: "Het uitgeven van credentials is nog niet geconfigureerd. Neem contact op met uw vereniging.",
      empty: "Er zijn nog geen credentials beschikbaar voor uw partij.",
      unavailable: "De credential-uitgever is tijdelijk niet beschikbaar. Probeer het zo meteen opnieuw.",
      addToWallet: "Aan wallet toevoegen",
      scanHint: "Scan met uw wallet-app",
      copyOffer: "Offerlink kopiëren",
      copied: "Gekopieerd",
      refresh: "Offers vernieuwen",
      refreshing: "Bezig met vernieuwen…",
      retry: "Opnieuw proberen",
      retrying: "Bezig met opnieuw proberen…",
      checkAgain: "Opnieuw controleren",
      checking: "Bezig met controleren…",
      expires: "Offer verloopt {{when}}",
      expired: "Deze offer is verlopen — vernieuw om een nieuwe te krijgen.",
      preparing: {
        title: "Uw credentials worden voorbereid…",
        message: "Uw verifieerbare credentials worden uitgegeven. Dit kan na toelating even duren."
      },
      failed: {
        title: "Uitgifte van credentials niet voltooid",
        message: "Er is iets misgegaan bij het uitgeven van uw credentials. U kunt het opnieuw proberen."
      },
      request: "Aanvragen",
      requesting: "Bezig met aanvragen…",
      requestSectionTitle: "Beschikbare credentials",
      requestSectionHint: "Vraag de verifieerbare credentials aan waar uw organisatie recht op heeft. Voeg ze na uitgifte toe aan een wallet.",
      notAvailable: "Niet beschikbaar voor uw partij.",
      issued: "Deze credential is uitgegeven.",
      getWalletLink: "Wallet-link ophalen",
      gettingLink: "Bezig met ophalen…",
      noWalletLink: "Kan op dit moment geen wallet-link genereren — probeer het later opnieuw.",
      types: {
        PartyCredential: "Partij-credential",
        iSHAREParticipantCredential: "iSHARE-deelnemerscredential",
        DataspaceParticipantCredential: "Dataspace-deelnemerscredential"
      },
      typeDescriptions: {
        PartyCredential: "Bewijst de identiteit van uw organisatie (partij-id en naam).",
        iSHAREParticipantCredential: "Bewijst uw actieve deelname aan het iSHARE-framework.",
        DataspaceParticipantCredential: "Bewijst uw lidmaatschap van een dataspace."
      }
    }
  },
  tour: {
    aria: "Rondleiding beheerportaal",
    skip: "Overslaan",
    back: "Vorige",
    next: "Volgende",
    done: "Afronden",
    step: "Stap {{current}} van {{total}}",
    replay: "Rondleiding starten",
    steps: {
      welcome: {
        title: "Welkom in uw beheerportaal",
        body: "We lopen de belangrijkste onderdelen langs en navigeren voor u tussen de pagina's. Overslaan kan altijd, en u start de rondleiding later opnieuw via uw accountmenu."
      },
      proposalsList: {
        title: "Voorstellen",
        body: "Elke onboarding-aanvraag met de bijbehorende status. Open er een om te beoordelen, goed- of af te keuren en de ondertekende overeenkomsten te downloaden."
      },
      proposalsCreate: {
        title: "Partij registreren",
        body: "Handmatig een deelnemer toevoegen? Start hier een nieuwe registratie."
      },
      participantsList: {
        title: "Deelnemers",
        body: "Organisaties die zijn toegelaten tot het register. Open er een voor de partijgegevens, rollen en claims."
      },
      participantsSearch: {
        title: "Deelnemers zoeken",
        body: "Zoek en filter de lijst om snel een organisatie te vinden."
      },
      usersList: {
        title: "Gebruikers",
        body: "De gebruikersaccounts van het portaal en de rollen die bepalen waartoe zij toegang hebben."
      },
      usersCreate: {
        title: "Gebruiker toevoegen",
        body: "Nodig een nieuwe portaalgebruiker uit en wijs hier een rol toe."
      },
      settingsTabs: {
        title: "Instellingen",
        body: "Branding en content, de onboarding-flow, het thema en authenticatie — identity providers, e-mail (SMTP) en de uitgever van verifieerbare credentials."
      },
      finish: {
        title: "U bent klaar",
        body: "Dat was de rondleiding. Start hem opnieuw via “Rondleiding starten” in uw accountmenu."
      }
    }
  },
  revoke: {
    title: "Intrekken",
    titleCombined: "Levenscyclus",
    description: "Trek een partij in bij het register, of draag deze over aan een ander deelnemersregister.",
    form: {
      heading: "Levenscyclusactie",
      revokingOrg: "In te trekken organisatie",
      fromRegistry: "Vanuit register",
      orgPlaceholder: "Organisatie-id",
      partyId: "Partij-ID",
      participant: "Deelnemer",
      noParties: "U heeft geen deelnemers om te beheren.",
      noSatellites: "Er zijn nog geen andere satellieten in het netwerk beschikbaar.",
      type: "Actie",
      transferTo: "Overdragen aan partij-ID",
      hint: "Kies de deelnemer die u uit het register wilt intrekken.",
      submit: "Intrekken starten",
      submitting: "Bezig met verzenden…",
      required: "Voer een partij of organisatie in om in te trekken.",
      success: "Intrekkingsverzoek verzonden.",
      error: "Kan het intrekkingsverzoek niet verzenden."
    },
    types: {
      revoke: "Intrekken",
      transfer: "Overdragen"
    },
    confirm: {
      title: "Partij intrekken",
      message: "“{{target}}” intrekken bij het register? Dit kan niet ongedaan worden gemaakt.",
      button: "Intrekken"
    },
    list: {
      heading: "Intrekkingsverzoeken",
      refresh: "Vernieuwen",
      org: "Organisatie",
      party: "Partij",
      type: "Actie",
      status: "Status",
      date: "Aangemaakt",
      empty: "Geen intrekkingsverzoeken.",
      unavailable: "Het deelnemersregister is momenteel niet beschikbaar.",
      error: "Kan intrekkingsverzoeken niet laden."
    }
  },
  transfer: {
    title: "Overdragen",
    description: "Draag het eigendom van een partij over aan een ander deelnemersregister.",
    form: {
      heading: "Overdracht aanvragen",
      partyId: "Partij-ID",
      participant: "Deelnemer",
      fromRegistry: "Vanuit register",
      noParties: "U heeft geen deelnemers om over te dragen.",
      noSatellites: "Er zijn nog geen andere deelnemersregisters beschikbaar in het netwerk.",
      transferTo: "Overdragen aan register",
      transferToPlaceholder: "Id van doelregister",
      hint: "Geef de over te dragen partij op en het deelnemersregister waaraan deze moet worden overgedragen.",
      submit: "Overdracht aanvragen",
      submitting: "Bezig met verzenden…",
      required: "Voer zowel de partij als het doelregister in.",
      success: "Overdrachtsverzoek verzonden.",
      error: "Kan het overdrachtsverzoek niet verzenden."
    },
    confirm: {
      title: "Partij overdragen",
      message: "“{{party}}” overdragen aan “{{target}}”? Het doelregister moet het verzoek goedkeuren.",
      button: "Overdracht aanvragen"
    },
    list: {
      heading: "Overdrachtsverzoeken",
      refresh: "Vernieuwen",
      party: "Partij",
      from: "Van",
      to: "Naar",
      status: "Status",
      date: "Aangevraagd",
      empty: "Geen overdrachtsverzoeken.",
      unavailable: "Het deelnemersregister is momenteel niet beschikbaar.",
      error: "Kan overdrachtsverzoeken niet laden."
    }
  },
  dataspaces: {
    title: "Dataspaces",
    description: "Beheer de dataspaces die in het deelnemersregister zijn geregistreerd.",
    form: {
      createHeading: "Dataspace aanmaken",
      editHeading: "Dataspace bewerken ({{id}})",
      subject: "Naam",
      subjectPlaceholder: "Naam van de dataspace",
      dataspaceId: "Dataspace-ID",
      status: "Status",
      country: "Land van registratie",
      countryPlaceholder: "bijv. Nederland",
      definitionUrl: "Definitie-URL",
      website: "Website",
      countriesOfOperation: "Landen van werking",
      sectorIndustry: "Sector / branche",
      tags: "Labels",
      tagsPlaceholder: "Komma-gescheiden labels",
      specificAgreements: "Specifieke overeenkomsten",
      listPlaceholder: "Komma-gescheiden waarden",
      listHint: "Landen van werking, sector/branche en specifieke overeenkomsten accepteren meerdere komma-gescheiden waarden.",
      create: "Dataspace aanmaken",
      update: "Wijzigingen opslaan",
      cancel: "Annuleren",
      submitting: "Bezig met opslaan…",
      required: "Een naam en dataspace-ID zijn verplicht.",
      created: "Dataspace aangemaakt.",
      updated: "Dataspace bijgewerkt.",
      loadError: "Kan de dataspace niet laden.",
      error: "Kan de dataspace niet opslaan."
    },
    status: {
      new: "Nieuw",
      inProgress: "In behandeling",
      active: "Actief",
      notActive: "Niet actief"
    },
    list: {
      heading: "Dataspaces",
      refresh: "Vernieuwen",
      subject: "Naam",
      id: "Dataspace-ID",
      status: "Status",
      country: "Land",
      actions: "Acties",
      edit: "Bewerken",
      empty: "Geen dataspaces.",
      unavailable: "Het deelnemersregister is momenteel niet beschikbaar.",
      error: "Kan dataspaces niet laden."
    }
  },
  frameworks: {
    title: "Frameworks",
    description: "Bekijk de frameworks die het v3-endpoint van het deelnemersregister aanbiedt.",
    refresh: "Vernieuwen",
    refreshing: "Vernieuwen…",
    pageSize: "Paginagrootte",
    empty: "Geen frameworks gevonden.",
    unavailable: "Het deelnemersregister is momenteel niet beschikbaar.",
    error: "Kan frameworks niet laden.",
    notConfigured: "Het deelnemersregister is niet geconfigureerd voor deze deployment.",
    untitled: "Framework zonder titel",
    showRaw: "Details tonen",
    hideRaw: "Details verbergen",
    issuer: "Issuer: {{issuer}}",
    fields: {
      version: "Versie",
      validFrom: "Geldig vanaf",
      validUntil: "Geldig tot",
      updated: "Bijgewerkt"
    },
    pagination: {
      summary: "{{first}}–{{last}} van {{total}} frameworks"
    }
  },
  subscribers: {
    title: "Issuer-webhooks",
    description: "Registreer de issuer-/adapter-endpoints die party-levenscyclusgebeurtenissen ontvangen, beheer hun ondertekeningssleutels en bekijk of verstuur de webhook-outbox opnieuw.",
    tabs: {
      subscribers: "Abonnees",
      deliveries: "Verzendingen"
    },
    form: {
      createHeading: "Abonnee registreren",
      editHeading: "Abonnee bewerken ({{name}})",
      name: "Naam",
      namePlaceholder: "bijv. iSHARE VC issuer",
      url: "Webhook-URL",
      eventFilter: "Gebeurtenisfilter",
      eventFilterHint: "Laat leeg voor de standaardstroom (party.created, party.updated). Voor gedetailleerde gebeurtenissen, geef ze komma-gescheiden op: claim.created, claim.updated, claim.revoked, party.revoked.",
      secret: "Ondertekeningssleutel (optioneel)",
      secretPlaceholder: "Laat leeg om automatisch te genereren",
      secretHint: "Stel dit alleen in bij het koppelen van een reeds uitgerolde issuer met een vaste HMAC-sleutel — plak die sleutel hier. Laat leeg en het register genereert er een (eenmalig getoond). Gebruik “Sleutel roteren” om hem later te wijzigen.",
      replayProtection: "Replay-bescherming (onderteken tijdstempel + body)",
      enabled: "Ingeschakeld",
      create: "Abonnee registreren",
      update: "Wijzigingen opslaan",
      cancel: "Annuleren",
      submitting: "Opslaan…",
      nameRequired: "Een naam is verplicht.",
      urlRequired: "Een webhook-URL is verplicht.",
      urlHttps: "De webhook-URL moet https gebruiken.",
      created: "Abonnee geregistreerd.",
      updated: "Abonnee bijgewerkt.",
      error: "Kan de abonnee niet opslaan."
    },
    secret: {
      heading: "Ondertekeningssleutel voor {{name}} — eenmalig getoond, kopieer deze nu",
      dismiss: "Sluiten"
    },
    status: {
      notConfigured: "De beheer-API van het deelnemersregister is niet geconfigureerd voor dit portaal (PR_API_BASE_URL ontbreekt). Vraag een beheerder dit te configureren.",
      unauthorized: "Het deelnemersregister heeft je sessie geweigerd — je bent niet geautoriseerd voor de beheer-API. Log uit en weer in; blijft dit bestaan, dan mist je account mogelijk de vereiste rol.",
      unavailable: "Het deelnemersregister is tijdelijk niet beschikbaar — het start mogelijk (opnieuw) op.",
      error: "Er ging iets mis bij het laden van deze gegevens.",
      retry: "Opnieuw proberen"
    },
    list: {
      heading: "Abonnees",
      refresh: "Vernieuwen",
      name: "Naam",
      url: "Webhook-URL",
      events: "Gebeurtenissen",
      eventsDefault: "standaardstroom",
      enabled: "Ingeschakeld",
      lastStatus: "Laatste verzending",
      actions: "Acties",
      edit: "Bewerken",
      rotate: "Sleutel roteren",
      delete: "Verwijderen",
      empty: "Geen abonnees geregistreerd.",
      unavailable: "Het deelnemersregister is momenteel niet beschikbaar.",
      error: "Kan abonnees niet laden.",
      rotateConfirm: "De ondertekeningssleutel van deze abonnee roteren? De nieuwe sleutel wordt eenmalig getoond.",
      rotated: "Sleutel geroteerd.",
      rotateError: "Kan de sleutel niet roteren.",
      deleteConfirm: "Deze abonnee verwijderen? Hij ontvangt dan geen gebeurtenissen meer.",
      deleted: "Abonnee verwijderd.",
      deleteError: "Kan de abonnee niet verwijderen."
    },
    deliveries: {
      heading: "Verzendingen",
      reemitHeading: "Gebeurtenissen voor een party opnieuw versturen",
      reemitHint: "Plaats een party.updated-gebeurtenis in de wachtrij zodat abonnees deze party opnieuw ophalen en afstemmen — een handmatige hersteltrigger.",
      reemit: "Opnieuw versturen",
      reemitRequired: "Een party-id is verplicht.",
      reemitted: "Verstuurd naar {{count}} abonnee(s).",
      reemitError: "Kan gebeurtenissen niet opnieuw versturen.",
      created: "Aangemaakt",
      event: "Gebeurtenis",
      party: "Party-id",
      partyFilter: "Party-id",
      subscriber: "Abonnee",
      status: "Status",
      attempts: "Pogingen",
      actions: "Acties",
      redeliver: "Opnieuw verzenden",
      redelivered: "Verzending opnieuw in wachtrij geplaatst.",
      redeliverError: "Kan de verzending niet opnieuw in de wachtrij plaatsen.",
      empty: "Geen verzendingen.",
      error: "Kan verzendingen niet laden.",
      applyFilters: "Toepassen",
      allSubscribers: "Alle abonnees",
      statuses: {
        all: "Alle statussen",
        pending: "In behandeling",
        failed: "Mislukt",
        delivered: "Afgeleverd",
        dead: "Dead-letter"
      }
    }
  },
  trusted: {
    title: "Vertrouwde lijst",
    description: "Beheer de certificaatautoriteiten die door het deelnemersregister worden vertrouwd.",
    form: {
      addHeading: "Certificaatautoriteit toevoegen",
      editHeading: "Bewerken ({{subject}})",
      certificate: "Certificaat",
      validating: "Certificaat valideren…",
      valid: "Geldig",
      invalid: "Ongeldig",
      subject: "Onderwerp",
      subjectPlaceholder: "Upload een certificaat om in te vullen",
      fingerprint: "Vingerafdruk",
      type: "Type",
      status: "Status",
      hint: "Upload een certificaat (.cer, .crt, .der, .pem, .pfx, .key) om het te valideren en kies vervolgens een type voordat u het toevoegt.",
      create: "Toevoegen aan vertrouwde lijst",
      update: "Wijzigingen opslaan",
      cancel: "Annuleren",
      submitting: "Bezig met opslaan…",
      badFile: "Ongeldig bestandstype. Upload een certificaatbestand.",
      validateError: "Kan het certificaat niet valideren.",
      typeRequired: "Selecteer een certificaattype.",
      certRequired: "Upload en valideer eerst een certificaat.",
      created: "Certificaatautoriteit toegevoegd.",
      updated: "Certificaatautoriteit bijgewerkt.",
      deleted: "Certificaatautoriteit verwijderd.",
      error: "Kan de certificaatautoriteit niet opslaan.",
      deleteError: "Kan de certificaatautoriteit niet verwijderen."
    },
    types: {
      pkio: "PKIo",
      ishareTest: "iSHARE Test",
      eidas: "eIDAS"
    },
    statuses: {
      granted: "Verleend",
      withdrawn: "Ingetrokken",
      supervisionCeased: "Toezicht beëindigd",
      underSupervision: "Onder toezicht"
    },
    confirm: {
      title: "Certificaatautoriteit verwijderen",
      message: "“{{target}}” uit de vertrouwde lijst verwijderen? Dit kan niet ongedaan worden gemaakt.",
      button: "Verwijderen"
    },
    list: {
      heading: "Vertrouwde certificaatautoriteiten",
      refresh: "Vernieuwen",
      subject: "Onderwerp",
      type: "Type",
      validity: "Geldigheid",
      status: "Status",
      actions: "Acties",
      edit: "Bewerken",
      delete: "Verwijderen",
      empty: "Geen vertrouwde certificaatautoriteiten.",
      unavailable: "Het deelnemersregister is momenteel niet beschikbaar.",
      error: "Kan de vertrouwde lijst niet laden."
    }
  },
  scheduler: {
    title: "Planner",
    description: "Plan terugkerende taken voor het deelnemersregister, zoals netwerkstatuscontroles.",
    form: {
      createHeading: "Taak plannen",
      editHeading: "Taak bewerken ({{name}})",
      type: "Taaktype",
      typePlaceholder: "Selecteer een taaktype",
      process: "Procesnaam",
      processPlaceholder: "Een naam om deze taak te herkennen",
      frequency: "Frequentie",
      frequencyPlaceholder: "Selecteer een frequentie",
      every: "Elke",
      startDate: "Startdatum",
      startTime: "Starttijd",
      emails: "Notificatie-e-mails",
      emailsPlaceholder: "Komma-gescheiden e-mailadressen",
      enable: "Deze planning inschakelen",
      hint: "Frequenties in seconden/minuten/uren draaien op het gekozen interval; dagelijks en wekelijks draaien eenmaal per periode. Notificaties worden naar de vermelde adressen verzonden.",
      create: "Taak plannen",
      update: "Wijzigingen opslaan",
      cancel: "Annuleren",
      submitting: "Bezig met opslaan…",
      required: "Taaktype, procesnaam, frequentie en ten minste één e-mail zijn verplicht.",
      created: "Taak gepland.",
      updated: "Planning bijgewerkt.",
      error: "Kan de planning niet opslaan."
    },
    types: {
      networkHealth: "Netwerkstatuscontrole"
    },
    units: {
      sec: "Seconde",
      min: "Minuut",
      hr: "Uur"
    },
    frequency: {
      every: "Elke {{value}} {{unit}}",
      daily: "Dagelijks eenmaal",
      weekly: "Wekelijks eenmaal"
    },
    list: {
      heading: "Geplande taken",
      refresh: "Vernieuwen",
      process: "Proces",
      type: "Type",
      frequency: "Frequentie",
      enabled: "Ingeschakeld",
      actions: "Acties",
      edit: "Bewerken",
      yes: "Ja",
      no: "Nee",
      empty: "Geen geplande taken.",
      unavailable: "Het deelnemersregister is momenteel niet beschikbaar.",
      error: "Kan geplande taken niet laden."
    }
  },
  networkHealth: {
    title: "Netwerkstatus",
    description: "Live status van het ledger-netwerk van het deelnemersregister. Beschikbaar wanneer het portaal samen met het register is uitgerold.",
    refresh: "Vernieuwen",
    refreshing: "Bezig met vernieuwen…",
    overall: "Algemene status",
    lastExecution: "Laatste uitvoering",
    notificationStatus: "E-mailnotificatiestatus",
    org: "Organisatie",
    health: "Gezondheid",
    peers: "Peers",
    peerName: "Peer",
    blockNo: "Bloknr.",
    status: "Status",
    explorer: "Explorer",
    notConfigured: "Netwerkstatus is alleen beschikbaar wanneer het portaal samen met het deelnemersregister is uitgerold.",
    unavailable: "Het deelnemersregister is momenteel niet beschikbaar. Probeer het zo meteen opnieuw.",
    loadError: "Kan netwerkstatus niet laden.",
    empty: "Er zijn geen organisatiegegevens gerapporteerd."
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
    stepCounter: "Stap {{current}} van {{total}}",
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
      eidasInfo: "Voor meer informatie over het verkrijgen van dergelijke certificaten, raadpleeg de eSEAL-aanschafgids.",
      certPreview: {
        title: "Certificaatvoorbeeld",
        identity: "Afgeleide identiteit",
        subject: "Onderwerp",
        issuer: "Uitgever",
        validity: "Geldigheid",
        fingerprints: "Vingerafdrukken",
        organizationName: "Organisatie",
        organizationIdentifier: "Organisatie-ID",
        kvkNumber: "KVK-nummer",
        partyId: "Partij-ID",
        distinguishedName: "Distinguished name",
        serialNumber: "Serienummer",
        validFrom: "Geldig vanaf",
        validTo: "Geldig tot",
        empty: "Niet aanwezig"
      }
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
      minimumFiles: "Upload een ondertekende kopie van elke overeenkomst",
      uploadLimits: "Max. 20 MB per bestand (45 MB totaal) • PDF",
      fileTooLarge: "Elke ondertekende overeenkomst mag maximaal 20 MB zijn.",
      totalTooLarge: "De ondertekende overeenkomsten zijn samen te groot om te uploaden (max. 45 MB).",
      consentRequired: "Bevestig de verklaring hierboven om met eHerkenning te ondertekenen.",
      signError: "We konden je ondertekening niet verwerken. Probeer het opnieuw.",
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
      admin: "Beheerder",
      satelliteAdmin: "Satellietbeheerder",
      schemeOwner: "Scheme-eigenaar",
      partyAdmin: "Partijbeheerder"
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
    subtitle: "Beheer de branding, registergegevens en onboarding-overeenkomsten van uw portaal.",
    sections: {
      general: "Algemene Instellingen",
      system: "Deelnemersregister",
      branding: "Branding",
      registry: "Register",
      headerImage: "Header Afbeelding",
      introText: "Introductietekst"
    },
    actions: {
      save: "Instellingen opslaan",
      saving: "Opslaan…",
      upload: "Afbeelding uploaden",
      uploadIcon: "Pictogram uploaden",
      modifyImage: "Afbeelding wijzigen",
      modifyIcon: "Pictogram wijzigen",
      add: "Toevoegen",
      recheck: "Opnieuw controleren"
    },
    messages: {
      saveSuccess: "Instellingen succesvol opgeslagen",
      saveFailed: "Kon instellingen niet opslaan",
      loadFailed: "Kon instellingen niet laden",
      uploadFailed: "Kon logo niet uploaden",
      backendNotConfigured: "Backend URL niet geconfigureerd"
    },
    system: {
      description: "De iSHARE-frameworkversie waarmee dit portaal werkt en de live verbinding met het Satellite-register.",
      version: "Frameworkversie",
      connection: "Verbinding",
      connected: "Verbonden",
      disconnected: "Niet verbonden",
      checking: "Controleren…",
      claimModel: "Claim-model (v3)",
      partyModel: "Party-model (v2)",
      unknown: "Onbekend"
    },
    connection: {
      test: "Verbinding testen",
      testing: "Testen…",
      testOk: "Succesvol verbonden (versie {{version}}).",
      testFailed: "Verbinding mislukt: {{error}}",
      certificate: "Clientcertificaat",
      certConfigured: "Geconfigureerd",
      certMissing: "Niet geconfigureerd",
      baseUrl: "Satelliet basis-URL",
      iss: "Client-ID (iss)",
      aud: "Audience (aud)",
      version: "Framework-versie (override)",
      versionPlaceholder: "automatisch gedetecteerd",
      tokenEndpoint: "Token-endpoint",
      tokenScope: "Token-scope",
      epCreationEndpoint: "ep_creation-endpoint (v2)",
      partiesEndpoint: "Parties-endpoint (v3)",
      dataspaceSelect: "Dataspace",
      dataspacePlaceholder: "Kies een dataspace…",
      dataspacesEmpty: "Geen dataspaces gevonden in het register.",
      prefillAuthRegistry: "Autorisatieregister vooraf invullen",
      prefillAuthRegistryHint: "Maakt het gekozen autorisatieregister statisch tijdens onboarding, zodat aanvragers er geen hoeven te kiezen.",
      authRegistrySelect: "Autorisatieregister",
      authRegistryPlaceholder: "Kies een autorisatieregister…",
      authRegistriesEmpty: "Geen autorisatieregisters gevonden in het register.",
      authRegistryUrl: "URL autorisatieregister",
      credentialsNote: "Het clientcertificaat en de privésleutel worden via deploy-omgevingsvariabelen geconfigureerd en zijn hier nooit bewerkbaar."
    },
    labels: {
      headerImage: "Header-afbeelding",
      introText: "Introductietekst",
      agreement: "Overeenkomst",
      registrarId: "Registrar ID",
      dataspaceId: "Dataspace ID",
      dataspaceTitle: "Dataspace-titel",
      agreements: "Overeenkomsten",
      hideCapabilitiesUrl: "Verberg het capabilities-URL veld",
      hideCapabilitiesUrlHint: "Indien ingeschakeld zien aanmelders dit veld niet en hoeven zij geen capabilities-URL in te vullen."
    },
    agreements: {
      title: "Onboarding-overeenkomsten",
      description: "Documenten die aanmelders tijdens de onboarding moeten lezen en ondertekenen. De iSHARE Terms of Use en Accession Agreement zijn standaard opgenomen; voeg uw eigen toe via een PDF-upload of een URL.",
      empty: "Geen overeenkomsten ingesteld.",
      version: "Versie",
      versionPlaceholder: "bijv. 05-03-2025",
      sourceBuiltin: "Standaard",
      sourceFile: "Geüpload",
      sourceUrl: "URL",
      sourceLabel: "Label",
      protected: "Beveiligd · {{method}}",
      open: "Openen",
      remove: "Verwijderen",
      removeTitle: "Overeenkomst verwijderen",
      removeConfirm: "Weet u zeker dat u deze overeenkomst wilt verwijderen?",
      minimumWarning: "Gebruikers kunnen de onboarding niet voltooien met minder dan 2 overeenkomsten geconfigureerd.",
      typeLabel: "Type",
      types: {
        frameworkAgreement: "Framework Agreement",
        dataspaceAgreement: "Dataspace Agreement",
        termsOfUse: "Terms of Use",
        accessionAgreement: "Accession Agreement"
      },
      addTitle: "Overeenkomst toevoegen",
      modeFile: "PDF uploaden",
      modeUrl: "Via URL",
      titleLabel: "Titel",
      titlePlaceholder: "bijv. Verwerkersovereenkomst",
      fileLabel: "PDF-bestand",
      choosePdf: "Kies PDF-bestand",
      urlLabel: "Document-URL",
      urlPlaceholder: "https://voorbeeld.nl/overeenkomst.pdf",
      add: "Overeenkomst toevoegen",
      adding: "Bezig met toevoegen…",
      auth: {
        label: "URL-authenticatie",
        method: "Auth-methode",
        none: "Geen (openbaar)",
        basic: "Basic auth",
        bearer: "Bearer / API-sleutel",
        oauth2: "OAuth2 client credentials",
        custom: "Aangepaste header(s)",
        username: "Gebruikersnaam",
        password: "Wachtwoord",
        headerName: "Headernaam",
        headerNamePlaceholder: "Authorization",
        scheme: "Schema",
        schemePlaceholder: "Bearer",
        token: "Token / API-sleutel",
        tokenUrl: "Token-URL",
        clientId: "Client-ID",
        clientSecret: "Client secret",
        scope: "Scope",
        scopePlaceholder: "optioneel",
        headerValue: "Waarde",
        secret: "Geheim",
        addHeader: "Header toevoegen",
        keptHint: "Laat een geheim leeg om de opgeslagen waarde te behouden.",
        keyMissing: "Stel AGREEMENT_AUTH_MASTER_KEY in op de backend om inloggegevens van beveiligde URL's op te slaan."
      },
      messages: {
        added: "Overeenkomst toegevoegd.",
        removed: "Overeenkomst verwijderd.",
        addFailed: "Toevoegen van de overeenkomst is mislukt.",
        removeFailed: "Verwijderen van de overeenkomst is mislukt.",
        fileRequired: "Kies een PDF-bestand.",
        titleRequired: "Voer een titel in.",
        urlRequired: "Voer een document-URL in."
      }
    },
    tabs: {
      general: "Algemeen",
      onboarding: "Onboarding",
      authentication: "Authenticatie",
      theme: "Thema"
    },
    auth: {
      loading: "Laden…",
      save: "Opslaan",
      saving: "Opslaan…",
      cancel: "Annuleren",
      secretKept: "•••••••• (laat leeg om te behouden)",
      vcIssuer: {
        title: "Uitgever van verifieerbare credentials",
        hint: "De externe iSHARE VC-uitgever die het deelnemersdashboard pollt voor credential-offers. Laat leeg om de credentials-sectie uit te schakelen.",
        urlLabel: "Basis-URL van de uitgever",
        urlPlaceholder: "https://issuer.example.com",
        urlHint: "Server-naar-server basis-URL van de poll-API van de uitgever. Overschrijft de VC_ISSUER_BASE_URL-omgevingswaarde. Een eventuele API-sleutel van de uitgever wordt uitsluitend via de omgeving geconfigureerd, nooit hier.",
        saved: "Credential-uitgever opgeslagen",
        saveFailed: "Kan de credential-uitgever niet opslaan"
      },
      idp: {
        title: "Verbonden identity providers",
        hint: "Identity providers die in dit realm zijn geconfigureerd. Voeg de brokers toe waarmee gebruikers kunnen inloggen, of bewerk/verwijder ze.",
        add: "Identity provider toevoegen",
        addTitle: "Nieuwe identity provider",
        editTitle: "“{{alias}}” bewerken",
        empty: "Nog geen identity providers geconfigureerd.",
        loadError: "Kon identity providers niet laden.",
        enabled: "Ingeschakeld",
        disabled: "Uitgeschakeld",
        edit: "Bewerken",
        delete: "Verwijderen",
        deleteTitle: "Identity provider verwijderen",
        deleteConfirm: "De identity provider “{{alias}}” verwijderen? Gebruikers kunnen er dan niet meer mee inloggen.",
        deleteConfirmLabel: "Verwijderen",
        deleted: "Identity provider verwijderd",
        deleteFailed: "Verwijderen van identity provider mislukt",
        created: "Identity provider aangemaakt",
        updated: "Identity provider bijgewerkt",
        saveFailed: "Opslaan van identity provider mislukt",
        aliasProviderRequired: "Alias en providertype zijn verplicht",
        alias: "Alias",
        displayName: "Weergavenaam",
        providerId: "Providertype",
        enabledLabel: "Ingeschakeld",
        trustEmail: "E-mail vertrouwen",
        config: "Configuratie",
        configHint: "Providerinstellingen (bijv. clientId, clientSecret, authorizationUrl). Geheime waarden zijn verborgen — laat ze leeg om de opgeslagen waarde te behouden.",
        configKey: "Sleutel",
        configValue: "Waarde",
        addField: "Veld toevoegen",
        mappers: {
          title: "Claim-mappings",
          hint: "Koppel de claims van deze provider aan Keycloak-gebruikersattributen. Dit portaal leest legalSubjectId, kvkNumber, companyName en email uit het token.",
          empty: "Nog geen claim-mappings.",
          saveFirst: "Sla de identity provider eerst op en heropen deze om claim-mappings toe te voegen.",
          claimPlaceholder: "Bronclaim (bijv. kvkNumber)",
          attrPlaceholder: "Gebruikersattribuut (bijv. kvkNumber)",
          add: "Mapping toevoegen",
          remove: "Verwijderen",
          preset: "Veelgebruikte iSHARE-claims koppelen",
          required: "Voer zowel de bronclaim als het doelattribuut in",
          addFailed: "Toevoegen van claim-mapping mislukt",
          removeFailed: "Verwijderen van claim-mapping mislukt",
          presetDone: "Veelgebruikte iSHARE-claims gekoppeld",
          presetNone: "De veelgebruikte iSHARE-claims zijn al gekoppeld"
        }
      },
      smtp: {
        title: "E-mail (SMTP)",
        hint: "De mailserver die Keycloak gebruikt voor accountmails (verificatie, wachtwoordherstel, uitnodigingen).",
        host: "Host",
        port: "Poort",
        from: "Afzender",
        fromDisplayName: "Weergavenaam afzender",
        replyTo: "Antwoordadres",
        ssl: "SSL gebruiken",
        starttls: "StartTLS gebruiken",
        auth: "Server vereist authenticatie",
        user: "Gebruikersnaam",
        password: "Wachtwoord",
        saved: "SMTP-instellingen opgeslagen",
        saveFailed: "Opslaan van SMTP-instellingen mislukt",
        test: "Testmail versturen",
        testing: "Versturen…",
        testTo: "Test versturen naar",
        testToPlaceholder: "jij@voorbeeld.nl",
        testToHint: "We sturen een testbericht naar dit adres met de instellingen hierboven.",
        recipientRequired: "Voer een ontvanger-e-mailadres in voor de test",
        testOk: "Testmail verstuurd naar {{to}}",
        testFailed: "SMTP-test mislukt"
      }
    },
    publicOnboarding: {
      title: "Publieke onboarding",
      hint: "Alles wat gepubliceerd is, staat als flow in de lijst hieronder - niets is impliciet openbaar. Anonieme bezoekers van niet-gepubliceerde routes gaan naar het inlogscherm.",
      enable: "Publieke onboarding inschakelen",
      enableHint: "Standaard uit: bezoekers worden naar het inlogscherm gestuurd totdat dit is ingeschakeld.",
      flows: "Onboardingflows",
      flowsHint: "Elke flow publiceert de onboarding op precies één URL met een eigen thema en instellingen. De basis-URL is alleen gepubliceerd als een flow die gebruikt.",
      route: "Route",
      routePlaceholder: "(basis-URL)",
      publishedAt: "Gepubliceerd op",
      notPublished: "Niet gepubliceerd (uitgeschakeld of ongeldige route):",
      nothingPublished: "Publieke onboarding staat aan maar er is geen flow gepubliceerd - bezoekers gaan nog steeds naar het inlogscherm. Schakel een flow in of voeg er een toe.",
      routeError: {
        pattern: "Alleen kleine letters, cijfers en streepjes (moet alfanumeriek beginnen).",
        reserved: "Deze route is gereserveerd door het portaal.",
        duplicate: "Deze route wordt al door een andere flow gebruikt.",
        "duplicate-base": "Slechts één flow kan op de basis-URL staan.",
      },
      flowTitle: "Titel",
      theme: "Thema",
      flowEnabled: "Ingeschakeld",
      moreOptions: "Meer opties",
      lessOptions: "Minder opties",
      removeFlow: "Verwijderen",
      addFlow: "+ Flow toevoegen",
      description: "Landingstekst (vervangt de algemene omschrijving)",
      dataspace: "Dataspace",
      authRegistry: "Autorisatieregister",
      authRegistryNoUrl: "Dit register heeft geen URL in het Participant Registry; aanvragers worden toch op basis van het id aan dit register gekoppeld.",
      agreements: "Te ondertekenen overeenkomsten",
      agreementsHint: "Vink aan welke overeenkomsten aanvragers van deze flow moeten ondertekenen. De documenten zelf beheer je onder Overeenkomsten.",
      agreementsEmpty: "Nog geen overeenkomsten geconfigureerd - voeg ze eerst toe onder Overeenkomsten.",
      agreementsAll: "Niets aangevinkt: alle geconfigureerde overeenkomsten gelden.",
      agreementsSelected: "{{count}} overeenkomst(en) geselecteerd voor deze flow.",
      inherit: "(overnemen)",
      on: "Aan",
      off: "Uit",
    },
    onboarding: {
      flowTitle: "Onboarding-standaarden",
      flowHint: "Standaarden die elke gepubliceerde onboardingflow overneemt; een flow kan ze onder Meer opties overschrijven.",
      associationName: "Naam van de vereniging",
      associationNamePlaceholder: "bijv. iSHARE Demo Association",
      associationNameHint: "Wordt getoond in de portaalheader. Laat leeg voor de standaardwaarde.",
      activeRoles: "Selecteerbare rollen",
      activeRolesHint: "Welke rollen aanmelders tijdens de onboarding kunnen kiezen.",
      roles: {
        dataconsumer: "Dataconsument",
        dataowner: "Data-eigenaar",
        dataprovider: "Dataprovider"
      },
      defaultRole: "Standaardrol",
      defaultRoleNone: "Geen standaard (aanmelder kiest)",
      defaultRoleHint: "Selecteert deze rol vooraf in de rollenstap.",
      skipRoles: "Sla de rolkeuzestap over",
      skipRolesHint: "Verberg de rollenstap volledig (gebruik met een standaardrol).",
      autoAccept: "Voorstellen automatisch accepteren",
      autoAcceptHint: "Voltooi voorstellen automatisch bij indienen, zonder handmatige goedkeuring.",
      requireQualifiedEidasCertificate: "Gekwalificeerd eIDAS-certificaat vereisen",
      requireQualifiedEidasCertificateHint: "Vereis bij een eIDAS-upload QCCompliance in combinatie met een QCP-beleid of gekwalificeerd certificaattype. Controles op certificaatindeling, vervaldatum en registervertrouwen blijven altijd actief.",
      dataspaceAuthTitle: "Dataspace & autorisatie",
      dataspaceAuthHint: "De dataspace waaraan aanmelders deelnemen en het vooraf ingevulde autorisatieregister."
    },
    theme: {
      title: "Kleuren & lettertypen",
      description: "Pas de kleuren en lettertypen van het portaal aan op de huisstijl van uw organisatie. De standaardwaarden volgen de iSHARE-huisstijl. Wijzigingen worden hier direct getoond — met Opslaan bewaart u een thema en met Toepassen publiceert u het naar elke bezoeker.",
      assets: {
        title: "Huisstijlbestanden",
        hint: "Headerafbeelding en browsericoon horen bij het thema; elke flow met dit thema toont ze.",
        "header-image": "Headerafbeelding",
        favicon: "Browsericoon",
        selectSaved: "Selecteer een opgeslagen thema om de headerafbeelding en het browsericoon te beheren.",
        upload: "Uploaden",
        replace: "Vervangen",
        uploading: "Bezig met uploaden…",
        uploaded: "Bestand geüpload.",
        uploadFailed: "Upload mislukt.",
      },
      library: {
        selectLabel: "Thema",
        brandDefault: "iSHARE-huisstijl (standaard)",
        nameLabel: "Themanaam",
        namePlaceholder: "bijv. Acme Corp",
        save: "Thema opslaan",
        apply: "Thema publiceren",
        delete: "Verwijderen",
        currentlyLive: "Nu live: {{name}}",
        hint: "Met Opslaan bewaart u een thema als concept zonder het live portaal te wijzigen. Met Toepassen publiceert u het gekozen thema naar elke bezoeker.",
        savedToast: "Thema opgeslagen.",
        appliedToast: "Thema toegepast — elke bezoeker ziet het nu.",
        deletedToast: "Thema verwijderd.",
        nameRequired: "Voer eerst een themanaam in.",
        deleteActiveBlocked: "Pas eerst een ander thema toe voordat u het live thema verwijdert.",
        import: "Importeren",
        export: "Exporteren",
        importedToast: "Thema geïmporteerd — controleer het en sla op om te bewaren.",
        exportedToast: "Thema geëxporteerd.",
        importError: "Dat bestand is geen geldig thema."
      },
      logo: "Logo & favicon",
      logoHint: "Upload het logo van uw organisatie (PNG, JPG of SVG). Het verschijnt in de portaalheader; als er geen is ingesteld, wordt het standaard iSHARE-logo gebruikt.",
      favicon: "Browsertabicoon",
      faviconHint: "Wordt getoond in de browsertab. Een vierkante PNG, SVG of ICO werkt het best; gebruikt het iSHARE-icoon als er geen is ingesteld.",
      logoConstraints: "PNG, JPG of SVG · max. 5 MB",
      faviconConstraints: "ICO, PNG of SVG · vierkant aanbevolen · max. 1 MB",
      fileTooLarge: "Dat bestand is te groot — maximaal {{max}}.",
      badDimensions: "Afbeeldingsafmetingen moeten tussen {{min}} en {{max}} pixels zijn.",
      fonts: {
        heading: "Koplettertype",
        body: "Bodylettertype"
      },
      groups: {
        brand: "Huisstijl",
        buttons: "Knoppen",
        text: "Tekst",
        surface: "Oppervlakken",
        typography: "Typografie"
      },
      tokens: {
        primary: "Primair",
        secondary: "Secundair",
        accent: "Accent",
        buttonPrimary: "Primaire knop",
        buttonPrimaryHover: "Primaire knop (hover)",
        buttonSecondary: "Secundaire knop",
        textPrimary: "Bodytekst",
        textSecondary: "Koppen",
        background: "Achtergrond",
        borderColor: "Randen",
        errorColor: "Fout"
      },
      actions: {
        reset: "Terug naar huisstijl"
      },
      preview: "Voorbeeld",
      previewHeading: "De snelle bruine vos",
      previewBody: "Zo zien koppen, bodytekst en knoppen eruit met de gekozen kleuren.",
      previewPrimaryBtn: "Primaire actie",
      previewSecondaryBtn: "Secundair",
      messages: {
        resetDone: "Editor teruggezet naar de iSHARE-huisstijl."
      }
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
      eherkenningTitle: "Bevestig eHerkenning-ondertekening",
      eherkenningSubtitle: "Deze aanvrager heeft de overeenkomsten elektronisch ondertekend via eHerkenning. Er zijn geen geüploade documenten om te beoordelen — bij goedkeuring onderteken je mede en wordt de onboarding voltooid.",
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
      confirmPassword: "Bevestig Wachtwoord",
      language: "Taal"
    },
    linkedAccounts: {
      title: "Inlogmethoden",
      description: "Koppel standaard inlogproviders aan dit portaalaccount. De provider-alias moet als Identity Provider in Keycloak bestaan.",
      alias: "Keycloak-alias",
      refresh: "Vernieuwen",
      status: {
        linked: "Gekoppeld",
        notLinked: "Niet gekoppeld"
      },
      actions: {
        link: "Koppelen",
        relink: "Opnieuw koppelen"
      },
      messages: {
        linked: "De inlogmethode is succesvol gekoppeld.",
        cancelled: "De koppelflow is geannuleerd.",
        error: "De koppelflow is mislukt. Probeer het opnieuw."
      },
      errors: {
        loadFailed: "Kon gekoppelde inlogmethoden niet laden"
      }
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
      partyIdPlaceholder: "EU.EORI.NL000000000",
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
      assertion: "Assertie",
      minimum: "Vereist voor v3-partij"
    },
    steps: {
      certificate: "Certificaat",
      party: "Partijgegevens",
      framework: "Framework-claims",
      extras: "Extra claims",
      review: "Controleren"
    },
    wizard: {
      certHint: "Begin met het X.509-certificaat van de partij: het partij-ID, de naam, het subject en de geldigheid worden er automatisch uit afgeleid. Sla deze stap over voor partijen zonder certificaat (Service Consumer of Entitled Party).",
      extrasHint: "Voeg optioneel extra claims toe (autorisatieregister, dataspace-lidmaatschap, dataspace-overeenkomst, dataspace-rol, …) — of ga door naar controleren.",
      back: "Terug",
      next: "Volgende",
      needPartyId: "Vul het partij-ID in voordat je verdergaat.",
      needPartyName: "Vul de partijnaam in voordat je verdergaat.",
      needFramework: "De nalevingsclaim heeft een framework-ID nodig.",
      needAgreement: "De overeenkomstclaim heeft een type, ID en titel nodig.",
      needRole: "Selecteer een framework-rol voordat je verdergaat.",
      needExtraFields: "Vul de verplichte velden van de extra claims in voordat je verdergaat.",
      noCertificate: "Geen certificaat geüpload",
      certRequiredWarn: "Er is geen certificaat geüpload en de gekozen framework-rol vereist er één — het register zal deze partij weigeren. Ga terug naar de stap Certificaat om er één te uploaden, of kies de rol Service Consumer of Entitled Party."
    },
    review: {
      heading: "Controleren & aanmaken",
      permanentNote: "Het aanmaken van een partij is permanent: eenmaal toegevoegd aan het register kan deze niet worden verwijderd — alleen bewerkt, of ingetrokken via de claims.",
      confirmLabel: "Ik heb de bovenstaande gegevens gecontroleerd en begrijp dat deze partij na aanmaken niet verwijderd kan worden."
    },
    claimTypes: {
      frameworkCompliance: "Framework-naleving",
      authRegistry: "Autorisatieregister",
      frameworkAgreement: "Framework-overeenkomst",
      frameworkRole: "Framework-rol",
      x509Certificate: "X.509-certificaat",
      dataspaceMembership: "Dataspace-lidmaatschap",
      dataspaceAgreement: "Dataspace-overeenkomst",
      dataspaceRole: "Dataspace-rol",
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
      submitSuccess: "Partij succesvol verzonden.",
      redirecting: "Je gaat nu naar de deelnemerslijst…"
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
      certNoNtrWarn: "De identifier van dit certificaat ({{identifier}}) volgt het did:ishare-formaat (NTR<CC>-…) niet, dus het register kan de partij-ID er niet uit afleiden of verifiëren. De registratie gaat door met de partij-ID die je invoert — controleer die goed, want het certificaat kan hem niet bevestigen. Gebruik voor een volledig geverifieerde identiteit een certificaat met een NTR<CC>-… organizationIdentifier.",
      certParseError: "Kon het certificaat niet lezen. Zorg dat het een geldig X.509-bestand (PEM/DER) is.",
      agreementReadError: "Kon het PDF-bestand niet lezen."
    },
    v2: {
      sections: {
        participant: "Deelnemergegevens",
        certificate: "Certificaat",
        authRegistries: "Autorisatieregisters",
        additionalInfo: "Aanvullende deelnemergegevens",
        agreements: "Overeenkomsten (minimaal 2)",
        roles: "Rollen (minimaal 1)",
        spor: "SPOR"
      },
      fields: {
        dataspaceTitle: "Dataspace-titel",
        logo: "Logo-URL",
        companyPhone: "Telefoonnummer bedrijf",
        tags: "Labels",
        signDate: "Datum van ondertekening",
        expiryDate: "Vervaldatum",
        framework: "Framework",
        contractFile: "Contractbestand",
        role: "Rol",
        signedRequest: "Ondertekend verzoek"
      },
      actions: {
        addAuthRegistry: "Autorisatieregister toevoegen",
        addAgreement: "Overeenkomst toevoegen",
        addRole: "Rol toevoegen",
        cancel: "Annuleren",
        save: "Opslaan",
        back: "Terug"
      },
      placeholders: {
        partyId: "EU.EORI.NL000000000",
        registrarId: "EU.EORI.NL000000000"
      }
    }
  }
}

export default nl
