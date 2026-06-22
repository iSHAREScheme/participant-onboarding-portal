import { useState, useEffect, useRef, useMemo } from "react";
import { NextPage } from "next";
import { useRouter } from "next/router";
import styles from "styles/Register.module.css";
import { useKeycloak } from "@react-keycloak/web";
import ProtectedRoute from "../components/ProtectedRoute";
import { useLanguage } from "../context/LanguageContext";
import { FormInput, Tooltip, Loading } from "../components";
import Placeholder from "../components/Placeholder";
import EmailNotification from "util/notify"
import preValidateEidasCert from "util/validateEidas"
import { extractCertificateFields, type CertificateFields } from "util/certificate"
import API, { AgreementView } from "api/client"
import { AxiosError } from "axios"
import { getPublicEnv } from "config/publicEnv"
import {
  loadStoredIdpActionState,
  setPendingIdpLinkAction,
  type StoredIdpActionState,
} from "util/idpActionState"
import {
  fetchKeycloakLinkedAccounts,
  hasLinkedIdentityProvider,
} from "util/keycloakLinkedAccounts"
import { getKeycloakUserInfo, refreshKeycloakUserInfo } from "util/keycloakUserInfo"

const KVK_BASE_URL = 'https://developers.kvk.nl/api/v2'

// Step indices
const StepsV1 = {
  role: 0,
  m2m: 1,
  idCheck: 2,
  location: 3,
  association: 4,
  account: 5,
  confirm: 6,
  success: 7,

  signingMethod: 8,
  agreement: 9,
  completed: 10,
  rejected: 11
}

const StepsV2 = {
  role: 0,
  // m2m,
  idCheck: 1,
  location: 2,
  association: 3,
  account: 4,
  confirm: 5,
  success: 6,

  signingMethod: 7,
  agreement: 8,
  completed: 9,
  rejected: 10
}
const StepsV3 = {
  role: 0,
  idCheck: 1,
  location: 2,
  account: 3,
  confirm: 4,
  success: 5,

  signingMethod: 6,
  agreement: 7,
  completed: 8,
  rejected: 9
}

const parseBoolEnv = (value?: string) =>
  typeof value === "string" && ["1", "true", "yes", "on"].includes(value?.toLowerCase())

const toTrimmedStringValue = (value: unknown): string => {
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0].trim()
  }
  return ""
}

const toNormalizedKvkValue = (value: unknown): string => {
  const raw = toTrimmedStringValue(value)
  if (!raw) return ""
  return raw.replace(/\D+/g, "")
}

const REGISTER_STATE_DB_NAME = "register:form-state"
const REGISTER_STATE_STORE = "state"
const REGISTER_STATE_KEY_PREFIX = "user:"

type PersistedRegisterState = {
  currentStep: number
  formData: FormData
}

let registerStateDbPromise: Promise<IDBDatabase> | null = null

const openRegisterStateDb = () => {
  if (registerStateDbPromise) return registerStateDbPromise

  registerStateDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB unavailable"))
      return
    }

    const request = window.indexedDB.open(REGISTER_STATE_DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(REGISTER_STATE_STORE)) {
        db.createObjectStore(REGISTER_STATE_STORE, { keyPath: "key" })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"))
  })

  return registerStateDbPromise
}

const buildRegisterStateKey = (realm: string | undefined, userId: string | undefined) => {
  if (!userId) return null
  const cleanRealm = realm || "default"
  return `${REGISTER_STATE_KEY_PREFIX}${cleanRealm}:${userId}`
}

const loadPersistedRegisterState = async (stateKey: string) => {
  try {
    const db = await openRegisterStateDb()
    return await new Promise<PersistedRegisterState | null>((resolve, reject) => {
      const transaction = db.transaction(REGISTER_STATE_STORE, "readonly")
      const store = transaction.objectStore(REGISTER_STATE_STORE)
      const request = store.get(stateKey)

      request.onsuccess = () => {
        const record = request.result as { key: string; value: PersistedRegisterState } | undefined
        resolve(record ? record.value : null)
      }

      request.onerror = () => reject(request.error ?? new Error("Failed to read register state"))
    })
  } catch (error) {
    console.warn("Failed to access register IndexedDB", error)
    return null
  }
}

const persistRegisterState = async (stateKey: string, value: PersistedRegisterState) => {
  try {
    const db = await openRegisterStateDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(REGISTER_STATE_STORE, "readwrite")
      const store = transaction.objectStore(REGISTER_STATE_STORE)
      const request = store.put({ key: stateKey, value })

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to persist register state"))
      request.onerror = () => reject(request.error ?? new Error("Failed to write register state"))
    })
  } catch (error) {
    console.warn("Failed to persist register form state", error)
  }
}

const clearPersistedRegisterState = async (stateKey: string) => {
  try {
    const db = await openRegisterStateDb()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(REGISTER_STATE_STORE, "readwrite")
      const store = transaction.objectStore(REGISTER_STATE_STORE)
      const request = store.delete(stateKey)

      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to clear register state"))
      request.onerror = () => reject(request.error ?? new Error("Failed to clear register state"))
    })
  } catch (error) {
    console.warn("Failed to clear register form state", error)
  }
}

interface FormData {
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
    // eIDAS certificate fields parsed at upload, sent with the proposal so the
    // backend can build the v3 x509Certificate identity claim at party creation.
    certSubjectName?: string
    certX5c?: string
    certX5tS256?: string
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



// Brand-aligned success badge (check mark) reused on every celebratory step.
const SuccessCheckIcon = () => (
  <div className={styles.successIcon} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

const SuccessScreen = () => {
  const { t } = useLanguage()

  return (
    <div className={styles.successContainer}>
      <SuccessCheckIcon />
      <h1 className={styles.successTitle}>
        {t("register.agreements.receiveTitle")}
      </h1>
      <p className={styles.successMessage}>
        {t("register.agreements.receiveMessage", {
          associationName: "the association name",
        })}
      </p>
    </div>
  );
};

// Add this type to help with registry data
type RegistryParty = {
  party_id: string;
  name: string;
  url?: string;
  capabilities_url?: string;
};



const Register: NextPage = () => {
  const Api = new API()
  const { keycloak } = useKeycloak();
  const router = useRouter();
  // Admins don't onboard — send them straight to the proposal overview so the
  // register flow never renders/flashes for them (the render is short-circuited
  // to a loader below while this redirect runs).
  const isAdmin = Boolean(
    keycloak?.authenticated &&
    typeof keycloak.hasRealmRole === "function" &&
    keycloak.hasRealmRole("onboarding-admin")
  );
  useEffect(() => {
    if (isAdmin) router.replace("/admin");
  }, [isAdmin, router]);
  const rawGivenNameFromToken = keycloak?.tokenParsed?.given_name;
  const givenNameFromToken =
    typeof rawGivenNameFromToken === "string" ? rawGivenNameFromToken.trim() : "";
  const rawGivenNameFromIdToken = keycloak?.idTokenParsed?.given_name;
  const givenNameFromIdToken =
    typeof rawGivenNameFromIdToken === "string"
      ? rawGivenNameFromIdToken.trim()
      : "";
  const keycloakUserInfo = keycloak
    ? (getKeycloakUserInfo(keycloak) as Record<string, unknown> | undefined)
    : undefined;
  const givenNameFromUserInfo =
    typeof keycloakUserInfo?.given_name === "string"
      ? keycloakUserInfo.given_name.trim()
      : "";
  const firstNameFromUserInfo =
    typeof keycloakUserInfo?.firstName === "string"
      ? keycloakUserInfo.firstName.trim()
      : "";
  const fullNameFromUserInfo =
    typeof keycloakUserInfo?.name === "string"
      ? keycloakUserInfo.name.trim()
      : "";
  const familyNameFromUserInfo =
    typeof keycloakUserInfo?.family_name === "string"
      ? keycloakUserInfo.family_name.trim()
      : "";
  const derivedFirstNameFromFullName =
    fullNameFromUserInfo !== ""
      ? fullNameFromUserInfo.split(" ")[0]?.trim() || ""
      : "";
  const kvkFromUserInfo = toNormalizedKvkValue(
    keycloakUserInfo?.["legalSubjectId"] ??
    keycloakUserInfo?.["kvkNumber"] ??
    keycloakUserInfo?.["kvk"]
  );
  const companyNameFromUserInfo = toTrimmedStringValue(
    keycloakUserInfo?.["companyName"] ?? keycloakUserInfo?.["companyname"]
  );
  const prefilledPartyId = kvkFromUserInfo
    ? `EU.EORI.NL.KVK${kvkFromUserInfo.replace(/\s+/g, "")}`
    : "";
  const prefilledPartyName = companyNameFromUserInfo;
  const contactFirstName =
    givenNameFromToken ||
    givenNameFromIdToken ||
    givenNameFromUserInfo ||
    firstNameFromUserInfo ||
    derivedFirstNameFromFullName ||
    "";

  // Full name for account field (first + last name)
  const prefilledFullName =
    fullNameFromUserInfo ||
    (contactFirstName && familyNameFromUserInfo
      ? `${contactFirstName} ${familyNameFromUserInfo}`
      : contactFirstName);

  const emailFromUserInfo =
    typeof keycloakUserInfo?.email === "string"
      ? keycloakUserInfo.email.trim()
      : "";
  const emailFromToken =
    typeof keycloak?.tokenParsed?.email === "string"
      ? keycloak.tokenParsed.email.trim()
      : "";
  const prefilledEmail = emailFromUserInfo || emailFromToken;
  // Memoized so env-derived values keep a stable identity for the memos/effects
  // below; the public env is fixed after startup, so resolving it once is correct.
  const env = useMemo(() => getPublicEnv(), [])
  // Onboarding-flow config from admin settings (fetched in fetchSettings below);
  // "" means "use the NEXT_PUBLIC_* env default", so the initial render matches
  // the env-only behaviour until settings load.
  const [obSettings, setObSettings] = useState({
    skipRoles: "",
    activeRoles: "",
    defaultRole: "",
    autoAccept: "",
  })
  const baseUrl = env.NEXT_PUBLIC_BASE_SERVER_URL
  const alwaysM2M = parseBoolEnv(env.NEXT_PUBLIC_ALWAYS_M2M)
  const alwaysEherkenning = parseBoolEnv(env.NEXT_PUBLIC_ALWAYS_EHERKENNING)
  // Onboarding-flow flags come from DB settings (Settings → Onboarding); an unset
  // value defaults to false. They are no longer mirrored into window.__ENV.
  const autoAcceptProposal = obSettings.autoAccept === "true"
  const skipRoleStep = obSettings.skipRoles === "true"
  const idpOnly = parseBoolEnv(env.NEXT_PUBLIC_IDP_ONLY)
  const keycloakIdp = env.NEXT_PUBLIC_KEYCLOAK_IDP
  const eherkenningAlias =
    keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
      ? keycloakIdp
      : "eHerkenning"
  // Whether an eHerkenning IdP is configured for this deployment. The eHerkenning
  // identity option is only offered when a broker alias is set; with no IdP we
  // hide it and route users down the eIDAS-certificate path instead.
  const eherkenningConfigured = Boolean(
    keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
  )

  const steps = alwaysM2M ? StepsV2 : StepsV1
  const activeRoles = (
    obSettings.activeRoles ||
    "dataowner,dataconsumer,dataprovider"
  )
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
  const defaultRoleValue = obSettings.defaultRole
  const defaultRoles = useMemo(
    () => ({
      dataOwner: defaultRoleValue === "dataowner",
      dataConsumer: defaultRoleValue === "dataconsumer",
      dataProvider: defaultRoleValue === "dataprovider",
    }),
    [defaultRoleValue]
  )

  const firstInteractiveStep = skipRoleStep ? (steps.role ?? 0) + 1 : (steps.role ?? 0)
  const useAutoAcceptProposal = autoAcceptProposal
  const registerStateKey = useMemo(() => {
    const rawSub = keycloak?.tokenParsed?.sub
    const rawUsername = keycloak?.tokenParsed?.preferred_username
    const userId =
      typeof rawSub === "string" && rawSub
        ? rawSub
        : typeof rawUsername === "string" && rawUsername
        ? rawUsername
        : undefined
    return buildRegisterStateKey(keycloak?.realm, userId)
  }, [keycloak?.realm, keycloak?.tokenParsed?.sub, keycloak?.tokenParsed?.preferred_username])

  const initialFormData = useMemo<FormData>(
    () => ({
      roles: defaultRoles,
      m2m: {
        useM2M: "yes",
      },
      idCheck: {
        idCheckMethod: alwaysM2M ? "eidas" : undefined,
        companyName: "",
        kvkNumber: kvkFromUserInfo,
        partyId: prefilledPartyId,
        partyName: prefilledPartyName,
      },
      location: {
        address: "",
        zipCode: "",
        city: "",
        country: "",
        website: "",
      },
      association: {
        authRegistry: "",
        capabilitiesUrl: "",
        cttProof: null,
        authRegistryName: "",
        authRegistryUrl: "",
      },
      account: {
        name: prefilledFullName,
        email: prefilledEmail,
        phone: "",
      },
      keycloakUsername: "",
      status: "",
      agreements: {
        termsConsent: false,
        eherkenningConsent: false,
        files: [],
      },
      signingMethod: {
        method: "",
      },
    }),
    [
      alwaysM2M,
      defaultRoles,
      kvkFromUserInfo,
      prefilledEmail,
      prefilledFullName,
      prefilledPartyId,
      prefilledPartyName,
    ]
  )

  const [currentStep, setCurrentStep] = useState(firstInteractiveStep)
  const [formData, setFormData] = useState<FormData>(initialFormData)
  const hasHydratedRef = useRef(false)
  const [idpActionState, setIdpActionState] = useState<StoredIdpActionState | undefined>(() =>
    loadStoredIdpActionState()
  )
  const [, setUserInfoVersion] = useState(0)
  const [hasEherkenningLink, setHasEherkenningLink] = useState<boolean | undefined>(undefined)

  // load saved state
  useEffect(() => {
    if (!registerStateKey) return
    let cancelled = false
    hasHydratedRef.current = false
    // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect);
    // runs before the async hydrate below resolves, so the reset still lands first.
    queueMicrotask(() => {
      setFormData(initialFormData)
      setCurrentStep(firstInteractiveStep)
    })

    const hydrate = async () => {
      try {
        const stored = await loadPersistedRegisterState(registerStateKey)
        if (!stored || cancelled) return

        const storedFormData = stored.formData

        setFormData((prev) => {
          const next: FormData = { ...prev }

          if (storedFormData.roles) {
            next.roles = { ...prev.roles, ...storedFormData.roles }
          }

          if (storedFormData.m2m) {
            next.m2m = { ...prev.m2m, ...storedFormData.m2m }
          }

          if (storedFormData.idCheck) {
            next.idCheck = { ...prev.idCheck, ...storedFormData.idCheck }
          }

          if (storedFormData.location) {
            next.location = { ...prev.location, ...storedFormData.location }
          }

          if (storedFormData.association) {
            next.association = {
              ...prev.association,
              ...storedFormData.association,
              cttProof:
                typeof storedFormData.association.cttProof !== "undefined"
                  ? storedFormData.association.cttProof
                  : prev.association.cttProof,
            }
          }

          if (storedFormData.account) {
            next.account = { ...prev.account, ...storedFormData.account }
          }

          if (storedFormData.agreements) {
            next.agreements = {
              ...prev.agreements,
              ...storedFormData.agreements,
              files: Array.isArray(storedFormData.agreements.files)
                ? storedFormData.agreements.files
                : prev.agreements.files,
            }
          }

          if (storedFormData.signingMethod) {
            next.signingMethod = {
              ...prev.signingMethod,
              ...storedFormData.signingMethod,
            }
          }

          if ("eidasCert" in storedFormData) {
            next.eidasCert = storedFormData.eidasCert
          }

          if (typeof storedFormData.keycloakUsername === "string") {
            next.keycloakUsername = storedFormData.keycloakUsername
          }

          if (typeof storedFormData.status === "string") {
            next.status = storedFormData.status
          }

          return next
        })

        if (typeof stored.currentStep === "number") {
          setCurrentStep(stored.currentStep)
        }
      } finally {
        if (!cancelled) hasHydratedRef.current = true
      }
    }

    void hydrate()

    return () => {
      cancelled = true
    }
  }, [registerStateKey, initialFormData, firstInteractiveStep])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [validationError, setValidationError] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)
  type AgreementTerm = { id: string; label: string; url?: string };
  const [agreementTerms, setAgreementTerms] = useState<AgreementTerm[]>([]);
  const [acceptedTerms, setAcceptedTerms] = useState<Record<string, boolean>>({});
  const shouldShowAgreementTerms = useAutoAcceptProposal;
  const requiresTermsConsent = shouldShowAgreementTerms;
  const [hideCapabilitiesUrlField, setHideCapabilitiesUrlField] = useState(false);
  const actingSubjectId = toTrimmedStringValue(
    keycloak?.tokenParsed?.["actingSubjectId"] ??
      keycloakUserInfo?.["actingSubjectId"]
  )
  const isAuthenticated = Boolean(keycloak?.authenticated)
  const currentIdp = String(keycloak?.tokenParsed?.idp ?? "").toLowerCase()
  const hasEherkenningSession = currentIdp === eherkenningAlias.toLowerCase()
  const hasSuccessfulEherkenningLink =
    idpActionState?.status === "success" &&
    idpActionState.alias?.toLowerCase() === eherkenningAlias.toLowerCase()
  const canUseFreshEherkenningLink =
    isAuthenticated && !hasEherkenningSession && hasSuccessfulEherkenningLink
  const hasKnownEherkenningLink =
    hasEherkenningSession ||
    hasSuccessfulEherkenningLink ||
    hasEherkenningLink === true
  const isCheckingEherkenningLink =
    isAuthenticated &&
    !hasEherkenningSession &&
    !hasSuccessfulEherkenningLink &&
    hasEherkenningLink === undefined
  const canUseCurrentEherkenning = isAuthenticated && hasEherkenningSession
  const shouldUseLinkedEherkenning =
    isAuthenticated &&
    !hasEherkenningSession &&
    !hasSuccessfulEherkenningLink &&
    hasKnownEherkenningLink
  const shouldLinkEherkenning =
    isAuthenticated &&
    !hasEherkenningSession &&
    !isCheckingEherkenningLink &&
    !hasKnownEherkenningLink
  const currentAccountLabel =
    toTrimmedStringValue(
      keycloak?.tokenParsed?.preferred_username ?? keycloak?.tokenParsed?.email
    ) || prefilledEmail
  const eherkenningIdentityLabel =
    companyNameFromUserInfo ||
    kvkFromUserInfo ||
    actingSubjectId

  // eHerkenning signing only works inside a verified eHerkenning session — the
  // backend rejects it otherwise. When it isn't available we hide the option and
  // route the user down the manual upload path, avoiding a dead-end 403. It also
  // requires an eHerkenning IdP to be configured at all.
  const eherkenningSigningAvailable = eherkenningConfigured && canUseCurrentEherkenning

  // Keep the chosen signing method valid for the current session: once the
  // session is known, default to eHerkenning when available, otherwise force
  // manual. Leaves an explicit user choice untouched.
  useEffect(() => {
    if (!isAuthenticated) return // wait until the session (and its idp) is known
    // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect);
    // the guarded updater no-ops when unchanged, so this cannot loop.
    queueMicrotask(() => setFormData((prev) => {
      const current = prev.signingMethod.method
      const next = eherkenningSigningAvailable
        ? current === ""
          ? "eherkenning"
          : current
        : "manual"
      if (next === current) return prev
      return {
        ...prev,
        signingMethod: { ...prev.signingMethod, method: next },
      }
    }))
  }, [isAuthenticated, eherkenningSigningAvailable])

  // With no eHerkenning IdP configured, the eHerkenning identity option is hidden;
  // force the eIDAS-certificate method so the sole remaining option is selected.
  // Guarded + deferred so it no-ops when already correct and never loops.
  useEffect(() => {
    if (eherkenningConfigured) return
    queueMicrotask(() => setFormData((prev) =>
      prev.idCheck.idCheckMethod === "eidas"
        ? prev
        : { ...prev, idCheck: { ...prev.idCheck, idCheckMethod: "eidas" } }
    ))
  }, [eherkenningConfigured])

  useEffect(() => {
    if (!prefilledPartyId && !prefilledPartyName && !prefilledEmail && !prefilledFullName && !kvkFromUserInfo) return;

    // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect);
    // the guarded updater no-ops when unchanged, so this cannot loop.
    queueMicrotask(() => setFormData((prev) => {
      const nextPartyId = prefilledPartyId || prev.idCheck.partyId;
      const nextPartyName = prefilledPartyName || prev.idCheck.partyName;
      const nextCompanyName = prefilledPartyName || prev.idCheck.companyName;
      const nextKvkNumber = kvkFromUserInfo || prev.idCheck.kvkNumber;
      const nextAccountName = prev.account.name || prefilledFullName;
      const nextAccountEmail = prev.account.email || prefilledEmail;

      if (
        nextPartyId === prev.idCheck.partyId &&
        nextPartyName === prev.idCheck.partyName &&
        nextCompanyName === prev.idCheck.companyName &&
        nextKvkNumber === prev.idCheck.kvkNumber &&
        nextAccountName === prev.account.name &&
        nextAccountEmail === prev.account.email
      ) {
        return prev;
      }

      return {
        ...prev,
        idCheck: {
          ...prev.idCheck,
          companyName: nextCompanyName,
          kvkNumber: nextKvkNumber,
          partyId: nextPartyId,
          partyName: nextPartyName,
        },
        account: {
          ...prev.account,
          name: nextAccountName,
          email: nextAccountEmail,
        },
      };
    }));
  }, [kvkFromUserInfo, prefilledPartyId, prefilledPartyName, prefilledEmail, prefilledFullName]);

  useEffect(() => {
    if (currentStep !== steps.confirm) return;

    if (!useAutoAcceptProposal) {
      // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect).
      queueMicrotask(() => {
        setAcceptedTerms((prev) => (Object.keys(prev).length > 0 ? {} : prev));
        setFormData((prev) => {
          if (prev.agreements.termsConsent) return prev;
          return {
            ...prev,
            agreements: {
              ...prev.agreements,
              termsConsent: true,
            },
          };
        });
      });
      return;
    }

    // NOTE: these terms should be specific to the current tenant
    const mockTerms: AgreementTerm[] = [
      { id: "term1", label: "iSHARE Terms of Use", url: "https://399850463-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FVbeX1IpIWRqMpyA3SdQH%2Fuploads%2Fgit-blob-2efd0536987df9b8eee0129750290b11114ee249%2FTerms%20of%20Use.pdf?alt=media" },
      // { id: "term2", label: "Agreement-link-2.pdf", url: "" }
    ];

    // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect).
    queueMicrotask(() => setAgreementTerms((prev) => {
      const isSameLength = prev.length === mockTerms.length;
      const isSameContent = isSameLength && prev.every((term, index) => {
        const candidate = mockTerms[index];
        return (
          term.id === candidate.id &&
          term.label === candidate.label &&
          term.url === candidate.url
        );
      });

      return isSameContent ? prev : mockTerms;
    }));

    queueMicrotask(() => setAcceptedTerms((prev) => (Object.keys(prev).length > 0 ? {} : prev)));

    // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect).
    queueMicrotask(() => setFormData((prev) => {
      if (!prev.agreements.termsConsent) return prev;
      return {
        ...prev,
        agreements: {
          ...prev.agreements,
          termsConsent: false,
        },
      };
    }));
  }, [currentStep, useAutoAcceptProposal, steps.confirm]);


  // useEffect(() => {
  //   if (skipRoleStep && currentStep === steps.role) {
  //     setCurrentStep(firstInteractiveStep);
  //   }
  // }, [currentStep, firstInteractiveStep, skipRoleStep]);

  // save current state
  useEffect(() => {
    if (!registerStateKey || !hasHydratedRef.current) return
    let cancelled = false

    const persist = async () => {
      if (cancelled) return

      await persistRegisterState(registerStateKey, {
        currentStep,
        formData,
      })
    }

    void persist()

    return () => {
      cancelled = true
    }
  }, [formData, currentStep, registerStateKey])

  useEffect(() => {
    if (hideCapabilitiesUrlField) {
      // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect).
      queueMicrotask(() => setFormData((prev) => ({
        ...prev,
        association: {
          ...prev.association,
          capabilitiesUrl: "",
        },
      })));
    }
  }, [hideCapabilitiesUrlField]);

  const { t } = useLanguage()

  // Order the wizard's step keys for the progress bar. Cheap to derive each render
  // (small fixed-size object) and only read in JSX, so it isn't memoized.
  const progressStepKeys = Object.entries(steps)
    .filter(([, index]) => index < steps.success)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key as keyof typeof steps)
    .filter((key) => !(skipRoleStep && key === "role"))

  const canGoBack = currentStep > firstInteractiveStep

  const [isChecked, setIsChecked] = useState(false)
  const [isSingleAssociation, setIsSingleAssociation] = useState(false)
  const [isStaticAuthRegistry, setIsStaticAuthRegistry] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [certificatePreview, setCertificatePreview] = useState<CertificateFields | null>(null)
  const [uploadError, setUploadError] = useState<string>("")
  const [isDragging, setIsDragging] = useState(false)
  const [registryParties, setRegistryParties] = useState<RegistryParty[]>([])
  const [registrarId, setRegistrarId] = useState("")
  // Onboarding agreement documents (configured in Settings), shown for download
  // on the signing steps. Secrets are redacted server-side.
  const [agreements, setAgreements] = useState<AgreementView[]>([])
  // Manual signing requires one signed upload per configured agreement (derived,
  // not hardcoded) so the step can never dead-end when the agreement set changes.
  const requiredAgreementCount = agreements.length

  const urlRegex =
    /^(https?:\/\/)([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\+?[\d\s-()]{8,}$/; // Allows international format, min 8 digits


  useEffect(() => {
    // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect).
    queueMicrotask(() => setIdpActionState(loadStoredIdpActionState()))
  }, [keycloak?.authenticated, keycloak?.token, keycloak?.tokenParsed?.sub])

  useEffect(() => {
    let cancelled = false

    if (!keycloak?.authenticated) {
      queueMicrotask(() => setHasEherkenningLink(undefined))
      return () => {
        cancelled = true
      }
    }

    if (hasEherkenningSession || hasSuccessfulEherkenningLink) {
      queueMicrotask(() => setHasEherkenningLink(true))
      return () => {
        cancelled = true
      }
    }

    queueMicrotask(() => setHasEherkenningLink(undefined))

    const loadLinkedAccounts = async () => {
      try {
        const linkedAccounts = await fetchKeycloakLinkedAccounts(keycloak)
        if (cancelled) return
        setHasEherkenningLink(
          hasLinkedIdentityProvider(linkedAccounts, eherkenningAlias)
        )
      } catch (error) {
        if (cancelled) return
        console.error("Failed to load linked eHerkenning accounts", error)
        setHasEherkenningLink(false)
      }
    }

    void loadLinkedAccounts()

    return () => {
      cancelled = true
    }
  }, [
    keycloak,
    keycloak?.authenticated,
    keycloak?.tokenParsed?.sub,
    eherkenningAlias,
    hasEherkenningSession,
    hasSuccessfulEherkenningLink,
  ])

  useEffect(() => {
    if (!canUseCurrentEherkenning && !canUseFreshEherkenningLink) return

    // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect).
    queueMicrotask(() => setFormData((prev) => {
      if (prev.idCheck.idCheckMethod === "eherkenning") return prev
      return {
        ...prev,
        idCheck: {
          ...prev.idCheck,
          idCheckMethod: "eherkenning",
        },
      }
    }))
  }, [canUseCurrentEherkenning, canUseFreshEherkenningLink])

  useEffect(() => {
    const isHumanFlow = formData.m2m.useM2M === "no" && !alwaysM2M
    if (!isHumanFlow) return

    // Deferred off the effect's synchronous path (react-hooks/set-state-in-effect).
    queueMicrotask(() => setFormData((prev) => {
      if (prev.idCheck.idCheckMethod === "eherkenning") return prev
      return {
        ...prev,
        idCheck: {
          ...prev.idCheck,
          idCheckMethod: "eherkenning",
        },
      }
    }))
  }, [formData.m2m.useM2M, alwaysM2M])

  useEffect(() => {
    let cancelled = false

    if (!keycloak?.authenticated) {
      return () => {
        cancelled = true
      }
    }

    if (!hasEherkenningSession && !hasSuccessfulEherkenningLink) {
      return () => {
        cancelled = true
      }
    }

    const refreshUserInfo = async () => {
      try {
        await refreshKeycloakUserInfo(keycloak)
        if (cancelled) return
        setUserInfoVersion((version) => version + 1)
      } catch (error) {
        if (cancelled) return
        console.error("Failed to refresh Keycloak user info for eHerkenning", error)
      }
    }

    void refreshUserInfo()

    return () => {
      cancelled = true
    }
  }, [
    keycloak,
    keycloak?.authenticated,
    keycloak?.token,
    keycloak?.tokenParsed?.sub,
    hasEherkenningSession,
    hasSuccessfulEherkenningLink,
  ])

  const validateStep = async (step: number, data: FormData): Promise<boolean> => {

    switch (step) {
      case steps.role: // Role
        if (skipRoleStep)
          return true;
        if (Object.values(data.roles).some((value) => value === true))
          return true;
        else {
          setValidationError("register.validation.roleRequired");
          return false;
        }

      case (steps as typeof StepsV1).m2m: // M2M
        if (data.m2m.useM2M !== "") return true;
        else {
          setValidationError("register.validation.m2mRequired");
          return false;
        }

      case steps.idCheck: // ID Check
        // Selection is optional: user can continue with either a ready eHerkenning identity
        // or a valid uploaded eIDAS certificate.
        if (canUseCurrentEherkenning || canUseFreshEherkenningLink) {
          return true
        }

        const eidasFile = data.eidasCert ?? uploadedFile
        if (eidasFile) {
          if (!(await preValidateEidasCert(eidasFile))) {
            setValidationError("register.validation.identityRequired")
            return false
          }
          return true
        }

        setValidationError("register.validation.identityRequired")
        return false

      case steps.location: // Location
        if (
          !data.idCheck.partyId ||
          !data.idCheck.partyName ||
          !data.location.address ||
          !data.location.zipCode ||
          !data.location.city ||
          !data.location.country
          // || !data.location.website // website is non-mandatory...
        ) {
          setValidationError("register.validation.locationRequired")
          return false
        } else return true
      // else if (!urlRegex.test(data.location.website)) {
      //   setValidationError("register.validation.invalidWebsite");
      //   return false;
      // }

      case steps.association: // Association
        if (
          !hideCapabilitiesUrlField &&
          data.association.capabilitiesUrl &&
          !urlRegex.test(data.association.capabilitiesUrl)
        ) {
          setValidationError("register.validation.invalidCapabilitiesUrl");
          return false;
        } else if (data.association.authRegistryUrl && !urlRegex.test(data.association.authRegistryUrl)) {
          setValidationError("register.validation.invalidRegistryUrl");
          return false;
        } else if (
          data.status !== "rejected" &&
          data.roles.dataProvider &&
          !data.association.cttProof
        ) {
          setValidationError("register.validation.cttProofRequired");
          return false;
        } else {
          return true;
        }

      case steps.account: // Account
        if (!data.account.name || !data.account.email) {
          setValidationError("register.validation.accountRequired");
          return false;
        } else if (data.account.phone && !phoneRegex.test(data.account.phone)) {
          setValidationError("register.validation.invalidPhone");
          return false;
        } else if (!emailRegex.test(data.account.email)) {
          setValidationError("register.validation.invalidEmail");
          return false;
        } else return true;

      case steps.confirm: // Confirm
        return true;

      case steps.signingMethod: // Signing method
        if (formData.signingMethod.method === "") {
          setValidationError("register.validation.signingMethodRequired");
          return false;
        }
        return true;

      default:
        console.warn('Unknown step', step, steps)
        return false;
    }
  };

  const fetchSettings = async () => {
    try {
      if (!baseUrl)
        throw new Error("Backend URL not configured")

      // Fetch settings data for registrarId
      const settingsResponse = await Api.fetchSettings()

      const settingsData = await settingsResponse.data
      // Store registrarId in form data
      setRegistrarId(settingsData.registrarId || "")
      setHideCapabilitiesUrlField(Boolean(settingsData.hideCapabilitiesUrl))
      setObSettings({
        skipRoles: settingsData.skipRoles || "",
        activeRoles: settingsData.activeRoles || "",
        defaultRole: settingsData.defaultRole || "",
        autoAccept: settingsData.autoAcceptProposal || "",
      })
      setAgreements(
        Array.isArray(settingsData.agreements) ? settingsData.agreements : []
      )
      const hasStaticAuthRegistry =
        Boolean(settingsData.prefillAuthRegistry) && Boolean(settingsData.authRegistryId)
      setIsStaticAuthRegistry(hasStaticAuthRegistry)
      setIsSingleAssociation(hasStaticAuthRegistry)
      if (hasStaticAuthRegistry) {
        setFormData((prev) => ({
          ...prev,
          association: {
            ...prev.association,
            authRegistry: settingsData.authRegistryId || "",
            authRegistryName: settingsData.authRegistryName || "",
            authRegistryUrl: settingsData.authRegistryUrl || "",
          },
        }))
      }

    } catch (e) {
      console.error("Error fetching settings data:", e)
      throw e
    }
  }

  const fetchRegistry = async () => {
    try {
      if (!baseUrl)
        throw new Error("Backend URL not configured")

      // Fetch registry data
      const response = await Api.fetchRegistry()

      const data = response.data
      const parties = data.parties_info?.data || []

      const partiesInfo: RegistryParty[] = parties?.map((party) => ({
        party_id: party.party_id,
        name: party.party_name,
        url: party.url,
        capabilities_url: party.capabilities_url,
      }))

      setRegistryParties(partiesInfo)
      setIsSingleAssociation((prev) => (isStaticAuthRegistry ? true : prev));

      return partiesInfo
    } catch (e) {
      setRegistryParties([])

      if (e instanceof AxiosError && e.status === 404) {
        return
      } else {
        console.error("Error fetching registry data:", e);
        throw new Error("Failed to fetch registry data")
      }
    }
  }

  const fetchProposalData = async () => {
    try {
      await fetchSettings()
      await fetchRegistry()

    } catch (error) {
      console.error("Error fetching registry/settings data:", error)
    }

    if (keycloak?.tokenParsed?.preferred_username) {
      try {
        const response = await Api.fetchProposalData(keycloak.tokenParsed.preferred_username)

        const proposalData = response.data

        // to be able to repeat the proposal process without affecting requests etc.
        // we'll return without setting the fetched data
        if (process.env.IS_PENTEST) return

        const proposalKvkNumber = toNormalizedKvkValue(proposalData.kvkNumber) || kvkFromUserInfo
        const proposalPartyId = toTrimmedStringValue(proposalData.partyId)
        const proposalPartyName = toTrimmedStringValue(proposalData.partyName)
        const proposalCompanyName = toTrimmedStringValue(proposalData.companyName)
        const proposalPartyIdFromKvk = proposalKvkNumber
          ? `EU.EORI.NL.KVK${proposalKvkNumber}`
          : ""
        const resolvedPartyId = proposalPartyIdFromKvk || proposalPartyId
        const resolvedPartyName = prefilledPartyName || proposalPartyName

        // Update form data with existing proposal regardless of status
        setFormData({
          roles: {
            ...defaultRoles,
            dataOwner: proposalData.dataOwner,
            dataConsumer: proposalData.dataConsumer,
            dataProvider: proposalData.dataProvider,
          },
          m2m: {
            useM2M: proposalData.useM2M,
          },
          idCheck: {
            companyName: proposalCompanyName || resolvedPartyName,
            kvkNumber: proposalKvkNumber,
            partyId: resolvedPartyId,
            partyName: resolvedPartyName,
          },
          location: {
            address: proposalData.address,
            zipCode: proposalData.zipCode,
            city: proposalData.city,
            country: proposalData.country,
            website: proposalData.website,
          },
          association: {
            authRegistry: proposalData.authRegistry,
            capabilitiesUrl: proposalData.capabilitiesUrl,
            cttProof: null, // File can't be retrieved, but path is stored
            authRegistryName: proposalData.authRegistryName,
            authRegistryUrl: proposalData.authRegistryUrl,
          },
          account: {
            name: proposalData.contactName,
            email: proposalData.contactEmail,
            phone: proposalData.contactPhone,
          },
          keycloakUsername: proposalData.keycloakUsername,
          status: proposalData.status,
          agreements: {
            files: [],
          },
          signingMethod: {
            method: "",
          },
        });

        // Set the appropriate step based on status
        if (proposalData.status === "rejected") {
          setCurrentStep(steps.rejected); // Index of rejected step
          return;
        }

        // If admitted (completed), the post-admission home is the dashboard at
        // /party (party overview + credentials) — send them there instead of the
        // static success step.
        if (proposalData.status === "completed") {
          router.replace("/party");
          return;
        }

        // If status is signed, show the success step
        if (proposalData.status === "signed") {
          setCurrentStep(steps.success); // Index of success step
          return;
        }

        // If status is approved, show the signing method step
        if (proposalData.status === "approved") {
          setCurrentStep(steps.signingMethod); // Index of signing method step
          return;
        }

        // If there's existing data and not in any of the above states, show confirmation step
        setCurrentStep(steps.success);
        setSubmitSuccess(true);
        if (registerStateKey) {
          void clearPersistedRegisterState(registerStateKey)
        }

      } catch (error) {
        if (error instanceof AxiosError && error.status === 404) {
          return
        }

        console.error("Error fetching proposal data:", error);
        // throw error
      }
    }
  };

  const handleInputChange = (
    step: keyof FormData,
    field: string,
    value: any
  ) => {
    setFormData((prev) => {
      // if (shouldPreselectDataConsumer && step === "roles") {
      //   return {
      //     ...prev,
      //     roles: { ...defaultRoles },
      //   };
      // }

      return {
        ...prev,
        [step]: {
          ...prev[step],
          [field]: value,
        },
      }
    })
  }

  const handleContinue = async () => {
    const isValid = await validateStep(currentStep, formData);

    if (!isValid) {
      // TODO: missing user error feedback handling?
      return;
    }

    // If we just finished the ID Check step, clear the local preview of the eIDAS cert
    // so it won't appear on the later CTT proof upload step.
    if (currentStep === steps.idCheck) {
      setUploadedFile(null)
      setCertificatePreview(null)
    }

    // TODO: better check on required data for e-herkenning id-check step
    // const hasEherkenningAuth = keycloak?.tokenParsed?.idp === 'openid' || keycloak?.tokenParsed?.scope === 'openid email profile'

    setValidationError(""); // Clear any existing error
    if (currentStep < (steps.confirm)) { // before success
      // if (currentStep === 1) {
      //   setCurrentStep((prev) => prev + 2) // skip ID-check step if user is already authenticated with e-herkenning
      // }
      // else
      setCurrentStep((prev) => prev + 1);
    } else if (currentStep === steps.signingMethod) {
      // Navigate from signing method to agreements
      setCurrentStep(steps.agreement);
    } else if (currentStep + 1 === steps.association) {
      // fetch registry data. if there is only one registry, set isSingleAssociation to true and prefill
      const registries = await fetchRegistry()

      if (!isStaticAuthRegistry && registries?.length === 1) {
        setIsSingleAssociation(true)

        const [registry] = registries

        // Prefill the association fields immutably. Mutating the formData object in
        // place is flagged by react-hooks/immutability (and wouldn't trigger a
        // re-render on its own). The registry list carries only id + name, so only
        // adopt a URL when one is actually present; otherwise keep the existing value
        // (an env default or empty) so the fields below stay user-editable.
        setFormData((prev) => ({
          ...prev,
          association: {
            ...prev.association,
            authRegistry: registry.party_id,
            authRegistryName: registry.name,
            authRegistryUrl:
              (registry as any).url ?? prev.association.authRegistryUrl ?? "",
            ...(hideCapabilitiesUrlField
              ? {}
              : {
                  capabilitiesUrl:
                    (registry as any).capabilities_url ??
                    prev.association.capabilitiesUrl ??
                    "",
                }),
          },
        }))
      }
    } else {
      try {
        setIsSubmitting(true);
        if (!baseUrl)
          throw new Error("Backend URL not configured")

        // Create FormData object for multipart/form-data
        const formDataToSend = new FormData()

        // Add all form data fields including keycloakUsername
        const formDataWithoutFile = {
          ...formData,
          association: {
            ...formData.association,
            cttProof: null,
          },
          keycloakUsername: keycloak?.tokenParsed?.preferred_username || "",
        }

        if (useAutoAcceptProposal) formDataWithoutFile.status = "signed"

        formDataToSend.append("data", JSON.stringify(formDataWithoutFile));

        // Add the file separately if it exists
        if (formData.association.cttProof) {
          formDataToSend.append("cttProof", formData.association.cttProof);
        }

        if (formData.eidasCert) {
          formDataToSend.append("eidasCert", formData.eidasCert);
        }

        // If status is "rejected", use the modify endpoint
        const submitted = await (
          formData.status === "rejected"
            ? Api.updateProposal(keycloak?.tokenParsed?.preferred_username, formDataToSend)
            : await Api.createProposal(formDataToSend)
        )

        const createdProposal = submitted.data

        // When auto-accept is enabled (Settings → Onboarding), immediately
        // complete the proposal via /party/proposals/${id}/complete.
        if (useAutoAcceptProposal) {
          const proposalId = String(createdProposal?.id || '')

          const completed = await Api.completeProposal(proposalId)
            .then(t => {
              // if (keycloak) void EmailNotification.agreementAccepted(keycloak, proposalId)
            })
            .catch(console.error)
        }

        // Trigger e‑mail to onboarding‑admin users
        setSubmitSuccess(true)
        setCurrentStep(steps.success) // Navigate to submission success step
        if (registerStateKey) {
          void clearPersistedRegisterState(registerStateKey)
        }

        if (keycloak) {
          void EmailNotification.newProposal(keycloak, String(createdProposal?.id || ""))
        }

      } catch (error) {
        console.error("Error submitting registration:", error);
        setValidationError(
          error.message || "Failed to submit registration. Please try again."
        )
      } finally {
        setIsSubmitting(false);
      }
    }


    // kvk data prefetch
    if ((currentStep + 1) === steps.location) {
        // see if we can prefill details from the linked eHerkenning identity claims
        const kvkNumber = toNormalizedKvkValue(formData.idCheck.kvkNumber) || kvkFromUserInfo
        const partyIdFromKvk = kvkNumber ? `EU.EORI.NL.KVK${kvkNumber}` : ""
        const partyNameFromCompany = prefilledPartyName

        setFormData((prev) => {
          const nextPartyId = partyIdFromKvk || prev.idCheck.partyId
          const nextPartyName = partyNameFromCompany || prev.idCheck.partyName

          if (
            nextPartyId === prev.idCheck.partyId &&
            nextPartyName === prev.idCheck.partyName &&
            kvkNumber === prev.idCheck.kvkNumber &&
            (partyNameFromCompany || prev.idCheck.companyName) === prev.idCheck.companyName
          ) {
            return prev
          }

          return {
            ...prev,
            idCheck: {
              ...prev.idCheck,
              companyName: partyNameFromCompany || prev.idCheck.companyName,
              kvkNumber,
              partyId: nextPartyId,
              partyName: nextPartyName,
            },
          }
        })

        // NOTE: disabling due to current CSP
        // if (kvkNumber) {
        //   // prefetch organisation address data
        //   const res = await (await fetch(`${KVK_BASE_URL}/zoeken?kvkNummer=${kvkNumber}&pagina=1&resultatenPerPagina=10`)).json()

        //   if (res.resultaten?.length) {
        //     const [org] = res.resultaten
        //     const orgAddress = org?.adres?.binnenlandsAdres || {}

        //     // prefill data into FormData
        //     formData.location.zipCode  = orgAddress.postcode || ''
        //     formData.location.address  = `${orgAddress.straatnaam || ''} ${orgAddress.huisnummer || ''}${orgAddress.huisletter || ''}`
        //     formData.location.city  = orgAddress.plaats || ''
        //     formData.location.country  = org?.adres?.binnenlandsAdres ? 'NL' : ''
        //   }
        // }
      }
  }

  const handleBack = () => {
    setValidationError(""); // Clear any existing error
    if (currentStep === steps.signingMethod) {
      // go to index page if on agreements step
      window.location.href = "/";
      return;
    }
    if (!canGoBack)
      return
    setCurrentStep((prev) => Math.max(prev - 1, firstInteractiveStep))
  };

  const handleSignAndCommit = async () => {
    setUploadError("");
    const isEherkenning = formData.signingMethod.method === "eherkenning";

    if (isEherkenning) {
      // eHerkenning signing is consent-based: the authenticated eHerkenning
      // identity plus explicit consent is the signature — no files are uploaded.
      if (!formData.agreements.eherkenningConsent) {
        setUploadError(t("register.agreements.consentRequired"));
        return;
      }
    } else {
      // Manual signing requires at least two uploaded, signed documents.
      if (formData.agreements.files.length < requiredAgreementCount) {
        setUploadError(t("register.agreements.minimumFiles"));
        return;
      }
      // Guard the combined upload size against the backend body limit (50MB).
      const totalBytes = formData.agreements.files.reduce(
        (sum, f) => sum + f.size,
        0
      );
      if (totalBytes > 45 * 1024 * 1024) {
        setUploadError(t("register.agreements.totalTooLarge"));
        return;
      }
    }

    try {
      setIsSubmitting(true);
      if (!baseUrl) {
        throw new Error("Backend URL not configured");
      }

      // Create FormData object for multipart/form-data. The signing method tells
      // the backend whether to expect uploaded documents (manual) or to record a
      // consent-based eHerkenning signature.
      const formDataToSend = new FormData();
      if (isEherkenning) {
        formDataToSend.append("signingMethod", "eherkenning");
        formDataToSend.append("eherkenningConsent", "true");
        // The current (eHerkenning-brokered) session token serves as the identity
        // assertion for the v3 idpAssertion claim at party creation.
        if (keycloak?.token) {
          formDataToSend.append("idpAssertion", keycloak.token);
        }
      } else {
        formDataToSend.append("signingMethod", "manual");
        formData.agreements.files.forEach((file, index) => {
          formDataToSend.append(`signedAgreement${index + 1}`, file);
        });
      }
      formDataToSend.append(
        "keycloakUsername",
        keycloak?.tokenParsed?.preferred_username || ""
      );

      const response = await Api.signProposal(keycloak?.tokenParsed?.preferred_username, formDataToSend)

      setFormData((prev) => ({
        ...prev,
        status: "signed",
      }))

      if (keycloak) {
        void EmailNotification.agreementCreated(keycloak)
      }

      setValidationError("");
      setCurrentStep(steps.completed);
    } catch (error) {
      console.error("Error signing agreements:", error);
      // Prefer the backend's specific message (e.g. the eHerkenning session
      // check) over the generic axios error, falling back to a friendly default.
      const detail =
        (error as any)?.response?.data?.error || (error as any)?.message;
      setUploadError(detail || t("register.agreements.signError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadError("")
    if (currentStep === steps.idCheck) {
      try {
        await preValidateEidasCert(file)

        // check against trusted list in backend
        const isTrusted = await Api.validateCertificate(file)

        // TODO: make sure certificate file is posted to party certificates array

      } catch (e) {
        console.error('[preValidateEidasCert Error]', e)
        setUploadError(e instanceof AxiosError ? 'Certificate is not trusted by the Participant Registry' : String(e))
        return
      }

      // Validate file size - max 1MB
      if (file.size > 1 * 1024 * 1024) {
        setUploadError("File size exceeds 1MB limit")
        return
      }

      // Parse the certificate into the fields the v3 x509Certificate identity
      // claim needs (x5c, x5t#s256 thumbprint, subject DN). Best-effort: a parse
      // failure must not block onboarding (irrelevant on a v2 satellite).
      let certFields: CertificateFields | null = null
      try {
        certFields = await extractCertificateFields(file)
      } catch (e) {
        console.error("[extractCertificateFields Error]", e)
      }

      setFormData((prev) => ({ ...prev, eidasCert: file }))
      setFormData((prev) => ({
        ...prev,
        idCheck: {
          ...prev.idCheck,
          idCheckMethod: "eidas",
          companyName:
            prev.idCheck.companyName || certFields?.organizationName || "",
          kvkNumber:
            prev.idCheck.kvkNumber || certFields?.kvkNumber || "",
          partyId:
            prev.idCheck.partyId || certFields?.partyId || "",
          partyName:
            prev.idCheck.partyName || certFields?.organizationName || "",
          certSubjectName: certFields?.subjectName,
          certX5c: certFields?.x5c,
          certX5tS256: certFields?.thumbprint,
        },
      }))
      setUploadError("")
      setUploadedFile(file)
      setCertificatePreview(certFields)

      return
    }

    if (currentStep === steps.agreement) {
      // Validate file type - only PDF files allowed for agreements
      if (!file.name.toLowerCase().endsWith(".pdf")) {
        setUploadError(t("register.agreements.invalidType"))
        return
      }

      // Validate file size — keep each file well under the backend's 50MB total
      // upload limit so two signed agreements always fit.
      if (file.size > 20 * 1024 * 1024) {
        setUploadError(t("register.agreements.fileTooLarge"))
        return
      }

      // Add new file to existing files
      const updatedFiles = [...formData.agreements.files, file];
      setFormData((prev) => ({
        ...prev,
        agreements: {
          ...prev.agreements,
          files: updatedFiles,
        },
      }));
      setUploadError("");
      return;
    }

    // Original handling for non-agreement files
    if (file.size > 5 * 1024 * 1024) {
      setUploadError(t("register.association.uploadSection.maxSize"));
      return;
    }

    setUploadedFile(file);
    handleInputChange("association", "cttProof", file);
    setUploadError("");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (currentStep === steps.agreement) {
      // Handle multiple files for agreements
      files.forEach(file => handleFileUpload(file));
    } else {
      // Handle single file for other steps
      const file = files[0];
      if (file) handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (currentStep === steps.agreement) {
      // Handle multiple files for agreements
      const files = Array.from(e.target.files || []);
      files.forEach(file => handleFileUpload(file));
    } else {
      // Handle single file for other steps
      const file = e.target.files?.[0];
      if (file) handleFileUpload(file);
    }
    // Reset the input value so the same file can be selected again
    e.target.value = '';
  };

  const handleUseCurrentEherkenning = () => {
    setFormData((prev) => ({
      ...prev,
      idCheck: {
        ...prev.idCheck,
        idCheckMethod: "eherkenning",
      },
    }))
    setValidationError("")
    setCurrentStep((prev) => prev + 1)
  }

  const initiateIDPCheck = () => {
    if (!keycloak) return

    const redirectUri =
      typeof window !== "undefined" ? `${window.location.origin}/register` : undefined

    if (keycloak.authenticated && !hasEherkenningSession) {
      if (hasKnownEherkenningLink) {
        void keycloak.login({
          redirectUri,
          idpHint: eherkenningAlias,
          scope: "openid profile email",
          prompt: "login",
        })
        return
      }

      if (isCheckingEherkenningLink) return

      setPendingIdpLinkAction(eherkenningAlias)
      setIdpActionState(loadStoredIdpActionState())
      void keycloak.login({
        redirectUri,
        idpHint: eherkenningAlias,
        action: `idp_link:${eherkenningAlias}`,
        scope: "openid profile email",
      })
      return
    }

    const idpHint =
      idpOnly && keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
        ? keycloakIdp
        : eherkenningAlias

    void keycloak.login({
      redirectUri,
      idpHint,
      scope: "openid profile email",
      prompt: "login"
    })
  }

  const formatCertificateDate = (value?: string) => {
    if (!value) return t("register.idCheck.certPreview.empty")
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)
  }

  const renderCertificateRows = (
    rows: Array<{ label: string; value?: string }>
  ) => (
    <dl className={styles.certPreviewRows}>
      {rows.map(({ label, value }) => (
        <div className={styles.certPreviewRow} key={label}>
          <dt>{label}</dt>
          <dd>{value || t("register.idCheck.certPreview.empty")}</dd>
        </div>
      ))}
    </dl>
  )

  const renderAttributeRows = (attributes: CertificateFields["subjectAttributes"]) =>
    attributes.length > 0
      ? renderCertificateRows(
          attributes.map((attribute) => ({
            label: attribute.shortName,
            value: attribute.value,
          }))
        )
      : (
        <p className={styles.certPreviewEmpty}>
          {t("register.idCheck.certPreview.empty")}
        </p>
      )

  const renderCertificatePreview = () => {
    if (!certificatePreview) return null

    return (
      <div className={styles.certPreview}>
        <h3>{t("register.idCheck.certPreview.title")}</h3>
        <section className={styles.certPreviewSection}>
          <h4>{t("register.idCheck.certPreview.identity")}</h4>
          {renderCertificateRows([
            {
              label: t("register.idCheck.certPreview.organizationName"),
              value: certificatePreview.organizationName,
            },
            {
              label: t("register.idCheck.certPreview.organizationIdentifier"),
              value: certificatePreview.organizationIdentifier,
            },
            {
              label: t("register.idCheck.certPreview.kvkNumber"),
              value: certificatePreview.kvkNumber,
            },
            {
              label: t("register.idCheck.certPreview.partyId"),
              value: certificatePreview.partyId,
            },
          ])}
        </section>
        <section className={styles.certPreviewSection}>
          <h4>{t("register.idCheck.certPreview.subject")}</h4>
          {renderCertificateRows([
            {
              label: t("register.idCheck.certPreview.distinguishedName"),
              value: certificatePreview.subjectName,
            },
          ])}
          {renderAttributeRows(certificatePreview.subjectAttributes)}
        </section>
        <section className={styles.certPreviewSection}>
          <h4>{t("register.idCheck.certPreview.issuer")}</h4>
          {renderCertificateRows([
            {
              label: t("register.idCheck.certPreview.distinguishedName"),
              value: certificatePreview.issuerName,
            },
          ])}
          {renderAttributeRows(certificatePreview.issuerAttributes)}
        </section>
        <section className={styles.certPreviewSection}>
          <h4>{t("register.idCheck.certPreview.validity")}</h4>
          {renderCertificateRows([
            {
              label: t("register.idCheck.certPreview.serialNumber"),
              value: certificatePreview.serialNumber,
            },
            {
              label: t("register.idCheck.certPreview.validFrom"),
              value: formatCertificateDate(certificatePreview.validFrom),
            },
            {
              label: t("register.idCheck.certPreview.validTo"),
              value: formatCertificateDate(certificatePreview.validTo),
            },
          ])}
        </section>
        <section className={styles.certPreviewSection}>
          <h4>{t("register.idCheck.certPreview.fingerprints")}</h4>
          {renderCertificateRows([
            {
              label: "x5t#S256",
              value: certificatePreview.thumbprint,
            },
          ])}
        </section>
      </div>
    )
  }

  // Renders the configured onboarding agreements with per-document download
  // links (built-ins, uploads and protected URLs all stream through the proxy).
  const renderAgreementDownloads = () => {
    if (!agreements || agreements.length === 0) {
      return (
        <div className={styles.agreementFile}>
          {t("home.noAgreements")}
        </div>
      )
    }
    return agreements.map((a) => (
      <div key={a.id} className={styles.agreementRow}>
        <span className={styles.agreementFile}>
          {a.title}
          {a.version ? ` (${a.version})` : ""}
        </span>
        {a.hasDocument && (
          <a
            className={styles.downloadLink}
            href={Api.agreementDocumentUrl(a.id)}
            target="_blank"
            rel="noreferrer"
          >
            {t("register.agreements.download")} ↓
          </a>
        )}
      </div>
    ))
  }

  const renderEherkenningAction = () => {
    const linkWasAttempted =
      idpActionState?.alias?.toLowerCase() === eherkenningAlias.toLowerCase()
    const showPortalAccount =
      isAuthenticated &&
      !hasEherkenningSession &&
      !canUseFreshEherkenningLink &&
      !isCheckingEherkenningLink
    const helperText = canUseCurrentEherkenning
      ? t("register.idCheck.currentSessionDescription")
      : canUseFreshEherkenningLink
      ? t("register.idCheck.linkedReadyDescription")
      : isCheckingEherkenningLink
      ? t("register.idCheck.checkingLinkDescription")
      : shouldUseLinkedEherkenning
      ? t("register.idCheck.linkedAccountDescription")
      : shouldLinkEherkenning
      ? t("register.idCheck.linkDescription")
      : t("register.idCheck.loginDescription")
    const buttonLabel = canUseCurrentEherkenning
      ? t("register.idCheck.useCurrentSession")
      : canUseFreshEherkenningLink
      ? t("register.idCheck.useLinkedIdentity")
      : shouldUseLinkedEherkenning
      ? t("register.idCheck.continueWithEherkenning")
      : shouldLinkEherkenning
      ? t("register.idCheck.linkAccount")
      : t("common.login")

    return (
      <div className={styles.idCheckContainer}>
        <button
          type="button"
          className={styles.eHerkenningButton}
          disabled={isCheckingEherkenningLink}
          onClick={
            canUseCurrentEherkenning || canUseFreshEherkenningLink
              ? handleUseCurrentEherkenning
              : initiateIDPCheck
          }
        >
          <img
            src="/resources/img/eherkenning-logo.png"
            alt="eHerkenning"
            className={styles.eHerkenningImage}
          />
          <span className={styles.eHerkenningRight}>{buttonLabel}</span>
        </button>
        <div className={styles.idCheckStatusCard}>
          <p className={styles.idCheckStatusText}>{helperText}</p>
          {hasKnownEherkenningLink && eherkenningIdentityLabel && (
            <p className={styles.idCheckStatusMeta}>
              {t("register.idCheck.currentIdentity", {
                identity: eherkenningIdentityLabel,
              })}
            </p>
          )}
          {showPortalAccount && currentAccountLabel && (
            <p className={styles.idCheckStatusMeta}>
              {t("register.idCheck.currentAccount", {
                account: currentAccountLabel,
              })}
            </p>
          )}
          {linkWasAttempted && idpActionState?.status === "cancelled" && (
            <p className={styles.idCheckStatusWarning}>
              {t("register.idCheck.linkCancelled")}
            </p>
          )}
          {linkWasAttempted && idpActionState?.status === "error" && (
            <p className={styles.errorMessage}>
              {t("register.idCheck.linkError")}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Add handler for registry selection
  const handleRegistrySelection = (registryId: string) => {
    if (isStaticAuthRegistry) return;

    if (!registryId) {
      handleInputChange("association", "authRegistry", "");
      handleInputChange("association", "authRegistryName", "");
      handleInputChange("association", "authRegistryUrl", "");
      return;
    }

    const selectedRegistry = registryParties.find(
      (party) => party.party_id === registryId
    );

    if (selectedRegistry) {
      handleInputChange("association", "authRegistry", registryId);
      handleInputChange(
        "association",
        "authRegistryName",
        selectedRegistry.name
      );
    }
  };

  const SubmissionSuccessScreen = () => {
    const { t } = useLanguage();
    const successMessageKey = useAutoAcceptProposal
      ? "register.submission.successMessageAutoComplete"
      : "register.submission.successMessage";

    return (
      <Placeholder
        title={t("register.submission.title")}
        message={t(successMessageKey, {
          association: formData.association.authRegistryName || "the association"
        })}
        imageSrc="/icons/success.svg"
        imageAlt="Success"
      />
    );
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case steps.role: // Role
        if (skipRoleStep)
          return null;
        return (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>{t("register.role.title")}</h1>
              <p className={styles.subtitle}>{t("register.role.subtitle")}</p>
            </div>

            <div className={styles.questionContainer}>
              <div className={styles.roleOptions}>
                {activeRoles.includes('dataowner') &&
                  <>
                    <div>
                      <input
                        type="checkbox"
                        id="dataOwner"
                        name="dataOwner"
                        checked={formData.roles.dataOwner}
                        onChange={() =>
                          handleInputChange(
                            "roles",
                            "dataOwner",
                            !formData.roles.dataOwner
                          )
                        }
                        className={styles.pointerDiv}
                      />
                      <label htmlFor="dataOwner" className={styles.pointerDiv}>
                        {t("register.role.options.dataOwner.title")}
                      </label>
                    </div>
                    <label htmlFor="dataOwner" className={styles.roleDescription}>
                      {t("register.role.options.dataOwner.description")}
                    </label>
                  </>
                }
                {activeRoles.includes('dataconsumer') &&
                  <>
                    <div>
                      <input
                        type="checkbox"
                        id="dataConsumer"
                        name="dataConsumer"
                        checked={formData.roles.dataConsumer}
                        onChange={() =>
                          handleInputChange(
                            "roles",
                            "dataConsumer",
                            !formData.roles.dataConsumer
                          )
                        }
                        className={styles.pointerDiv}
                      />
                      <label htmlFor="dataConsumer" className={styles.pointerDiv}>
                        {t("register.role.options.dataConsumer.title")}
                      </label>
                    </div>
                    <label htmlFor="dataConsumer" className={styles.roleDescription}>
                      {t("register.role.options.dataConsumer.description")}
                    </label>
                  </>
                }
                {activeRoles.includes('dataprovider') &&
                  <>
                    <div>
                      <input
                        type="checkbox"
                        id="dataProvider"
                        name="dataProvider"
                        checked={formData.roles.dataProvider}
                        onChange={() =>
                          handleInputChange(
                            "roles",
                            "dataProvider",
                            !formData.roles.dataProvider
                          )
                        }
                        className={styles.pointerDiv}
                      />
                      <label htmlFor="dataProvider" className={styles.pointerDiv}>
                        {t("register.role.options.dataProvider.title")}
                      </label>
                    </div>
                    <label
                      htmlFor="dataProvider"
                      className={styles.roleDescription}
                    >
                      {t("register.role.options.dataProvider.description")}
                    </label>
                  </>
                }
              </div>
            </div>
          </>
        );

      case steps.m2m: // M2M
        return (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>{t("register.m2m.title")}</h1>
              <p className={styles.subtitle}>{t("register.m2m.subtitle")}</p>
              <p className={styles.description}>{t("register.m2m.description")}</p>
            </div>

            <div className={styles.questionContainer}>
              <div className={styles.radioGroup}>
                <div className={styles.radioOption}>
                  <input
                    type="radio"
                    id="m2m-yes"
                    name="m2m"
                    value="yes"
                    checked={formData.m2m.useM2M === "yes"}
                    onChange={() => handleInputChange("m2m", "useM2M", "yes")}
                    className={styles.pointerDiv}
                  />
                  <label htmlFor="m2m-yes" className={styles.pointerDiv}>
                    {t("register.m2m.yes.title")}
                  </label>
                  <div className={styles.roleDescription}>
                    {t("register.m2m.yes.description")}
                  </div>
                </div>

                <div className={styles.radioOption}>
                  <input
                    type="radio"
                    id="m2m-no"
                    name="m2m"
                    value="no"
                    checked={formData.m2m.useM2M === "no"}
                    onChange={() => handleInputChange("m2m", "useM2M", "no")}
                    className={styles.pointerDiv}
                  />
                  <label htmlFor="m2m-no" className={styles.pointerDiv}>
                    {t("register.m2m.no.title")}
                  </label>
                  <div className={styles.roleDescription}>
                    {t("register.m2m.no.description")}
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case steps.idCheck: // ID Check
        return (
          <div>
            <div className={styles.header}>
              <h1 className={styles.title}>{t("register.idCheck.title")}</h1>
              <p className={styles.subtitle}>
                {(formData.m2m.useM2M === "yes" || alwaysM2M || !eherkenningConfigured) ? (
                  <div>
                    {/* <p>{t("register.idCheck.eidasCertificate")}</p> */}
                    <p>{t("register.idCheck.subtitle")}</p>
                    <div className={styles.radioGroup}>
                      {eherkenningConfigured && !alwaysEherkenning && <div className={styles.radioOption}>
                        <input
                          type="radio"
                          id="eherkenning"
                          name="identityMethod"
                          value="eherkenning"
                          checked={formData.idCheck.idCheckMethod === "eherkenning"}
                          onChange={() => setFormData({ ...formData, idCheck: { ...formData.idCheck, idCheckMethod: "eherkenning" } })}
                        />
                        <label htmlFor="eherkenning">
                          <strong>with {t("register.idCheck.eHerkenning")}</strong>
                        </label>
                        <Tooltip content={t("register.idCheck.eHerkenningInfo")}>
                          <span className={styles.infoIcon}>ⓘ</span>
                        </Tooltip>
                        <div className={styles.roleDescription}>{renderEherkenningAction()}</div>
                      </div>}

                      <div className={styles.radioOption}>
                        <input
                          type="radio"
                          id="eidas"
                          name="identityMethod"
                          value="eidas"
                          checked={formData.idCheck.idCheckMethod === "eidas"}
                          onChange={() => setFormData({ ...formData, idCheck: { ...formData.idCheck, idCheckMethod: "eidas" } })}
                        />
                        <label htmlFor="eidas">
                          <strong>{alwaysEherkenning ? t("register.idCheck.eidas") : `with a ${t("register.idCheck.eidas")}`}</strong>
                        </label>
                        <Tooltip content={t("register.idCheck.eidasInfo")}>
                          <span className={styles.infoIcon}>ⓘ</span>
                        </Tooltip>

                        <div className={styles.uploadSection}>
                          {uploadError && (
                            <div className={styles.errorMessage}>{uploadError}</div>
                          )}
                          <div className={styles.provideCertificate}>{t("register.idCheck.eidasProvide")}</div>
                          {uploadedFile ? (
                            <div className={styles.fileInfo}>
                              <div className={styles.fileInfoHeader}>
                                <span className={styles.fileName}>{uploadedFile.name}</span>
                                <button
                                  className={styles.removeButton}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setUploadedFile(null);
                                    setCertificatePreview(null);
                                    setFormData((prev) => ({
                                      ...prev,
                                      eidasCert: undefined,
                                      idCheck: {
                                        ...prev.idCheck,
                                        idCheckMethod:
                                          prev.idCheck.idCheckMethod === "eidas"
                                            ? undefined
                                            : prev.idCheck.idCheckMethod,
                                      },
                                    }));
                                  }}
                                >
                                  x
                                </button>
                              </div>
                              {renderCertificatePreview()}
                            </div>
                          ) : (
                            <div
                              className={styles.uploadContainer}
                              onDrop={handleDrop}
                              onDragOver={handleDragOver}
                              onDragEnter={handleDragEnter}
                              onDragLeave={handleDragLeave}
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <p>{t("register.association.uploadSection.dragDrop")}</p>
                              <p>or</p>
                              <button
                                className={styles.browseButton}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                {t("register.association.uploadSection.browse")}
                              </button>
                              <input
                                type="file"
                                accept=".pem,.crt,.cer,.der"
                                className={styles.hiddenInput}
                                ref={fileInputRef}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) handleFileUpload(file)
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>
                      {t("register.idCheck.subtitle", { id: "eHerkenning" })}
                    </p>
                    {renderEherkenningAction()}
                    <p className={styles.infoText}>
                      {t("register.idCheck.info", { id: "eHerkenning" })}
                      <a
                        href="https://www.eherkenning.nl"
                        className={styles.link}
                      >
                        {t("register.idCheck.forMoreInfo")}
                      </a>
                    </p>
                  </>
                )}
              </p >
            </div >
          </div>
        );

      case steps.location: // Location
        return (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>{t("register.location.title")}</h1>
              <p className={styles.subtitle}>
                {t("register.location.subtitle")}
              </p>
            </div>
            <div>
              <div className={styles.formAndInfo}>
                <div className={styles.formSection}>
                  <div className={styles.inputGroup}>
                    <FormInput
                      label={t("register.idCheck.partyId")}
                      id="partyId"
                      name="partyId"
                      type="text"
                      placeholder={t("register.idCheck.partyId")}
                      value={formData.idCheck.partyId}
                      onChange={(e) =>
                        handleInputChange("idCheck", "partyId", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <FormInput
                      label={t("register.idCheck.partyName")}
                      id="partyName"
                      name="partyName"
                      type="text"
                      placeholder={t("register.idCheck.partyName")}
                      value={formData.idCheck.partyName}
                      onChange={(e) =>
                        handleInputChange(
                          "idCheck",
                          "partyName",
                          e.target.value
                        )
                      }
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <FormInput
                      label={t("register.location.placeholders.address")}
                      id="address"
                      name="address"
                      type="text"
                      placeholder={t("register.location.placeholders.address")}
                      value={formData.location.address}
                      onChange={(e) =>
                        handleInputChange("location", "address", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <FormInput
                      label={t("register.location.placeholders.zipCode")}
                      id="zipCode"
                      name="zipCode"
                      type="text"
                      placeholder={t("register.location.placeholders.zipCode")}
                      value={formData.location.zipCode}
                      onChange={(e) =>
                        handleInputChange("location", "zipCode", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <FormInput
                      label={t("register.location.placeholders.city")}
                      id="city"
                      name="city"
                      type="text"
                      placeholder={t("register.location.placeholders.city")}
                      value={formData.location.city}
                      onChange={(e) =>
                        handleInputChange("location", "city", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <FormInput
                      label={t("register.location.placeholders.country")}
                      id="country"
                      name="country"
                      type="text"
                      placeholder={t("register.location.placeholders.country")}
                      value={formData.location.country}
                      onChange={(e) =>
                        handleInputChange("location", "country", e.target.value)
                      }
                      required
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <FormInput
                      label={t("register.location.placeholders.website")}
                      id="website"
                      name="website"
                      type="text"
                      placeholder={t("register.location.placeholders.website")}
                      value={formData.location.website}
                      onChange={(e) =>
                        handleInputChange("location", "website", e.target.value)
                      }
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        );

      case steps.association: // Association
        return (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>
                {t("register.association.title")}
              </h1>
              <p className={styles.subtitle}>
                {isSingleAssociation ? t("register.association.singleSubtitle") : t("register.association.subtitle")}
              </p>
            </div>

            <div className={styles.associationContainer}>
              <div className={styles.inputGroup}>
                <select
                  value={formData.association.authRegistry}
                  onChange={(e) => handleRegistrySelection(e.target.value)}
                  placeholder={t("register.association.selectRegistry")}
                  className={styles.select}
                  disabled={isSingleAssociation}
                >
                  <option value="">
                    {t("register.association.selectRegistry")}
                  </option>
                  {isStaticAuthRegistry &&
                    formData.association.authRegistry &&
                    !registryParties.some(
                      (party) => party.party_id === formData.association.authRegistry
                    ) && (
                      <option value={formData.association.authRegistry}>
                        {formData.association.authRegistry}
                      </option>
                    )}
                  {registryParties.map((party) => (
                    <option key={party.party_id} value={party.party_id}>
                      {party.party_id}
                    </option>
                  ))}
                </select>
                <span className={styles.infoIcon} title="Information">
                  ⓘ
                </span>
              </div>

              {/* Auth Registry Name field - disabled */}
              <div className={styles.inputGroup}>
                <FormInput
                  label={t("register.association.authRegistryName")}
                  id="authRegistryName"
                  name="authRegistryName"
                  type="text"
                  placeholder={t("register.association.authRegistryName")}
                  value={formData.association.authRegistryName}
                  onChange={(e) => { }} // disabled field
                />
                <span className={styles.infoIcon} title="Information">
                  ⓘ
                </span>
              </div>

              <div className={styles.inputGroup}>
                <FormInput
                  label={t("register.association.authRegistryUrl")}
                  id="authRegistryUrl"
                  name="authRegistryUrl"
                  type="text"
                  placeholder={t("register.association.authRegistryUrl")}
                  value={formData.association.authRegistryUrl}
                  onChange={(e) =>
                    handleInputChange(
                      "association",
                      "authRegistryUrl",
                      e.target.value
                    )
                  }
                />
                <span className={styles.infoIcon} title="Information">
                  ⓘ
                </span>
              </div>

              {!hideCapabilitiesUrlField && (
                <div className={styles.inputGroup}>
                  <FormInput
                    label={t("register.association.capabilitiesUrl")}
                    id="capabilitiesUrl"
                    name="capabilitiesUrl"
                    type="text"
                    placeholder={t("register.association.capabilitiesUrl")}
                    value={formData.association.capabilitiesUrl}
                    onChange={(e) =>
                      handleInputChange(
                        "association",
                        "capabilitiesUrl",
                        e.target.value
                      )
                    }
                  />
                  <span className={styles.infoIcon} title="Information">
                    ⓘ
                  </span>
                </div>
              )}

              {formData.roles.dataProvider && (
                <div className={styles.uploadSection}>
                  <h3>{t("register.association.uploadSection.title")}</h3>
                  <div
                    className={`${styles.uploadContainer} ${isDragging ? styles.dragActive : ""
                      }`}
                    onDrop={handleDrop}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileInput}
                      /* accept=".pdf" */
                      style={{ display: "none" }}
                    />
                    <div className={styles.uploadIcon}>📄</div>
                    <div className={styles.uploadText}>
                      {t("register.association.uploadSection.dragDrop")}
                    </div>
                    <div className={styles.orText}>
                      {t("register.association.uploadSection.or")}
                    </div>
                    <div className={styles.browseButton}>
                      {t("register.association.uploadSection.browse")}
                    </div>
                  </div>

                  {uploadError && (
                    <div className={styles.errorMessage}>{uploadError}</div>
                  )}

                  {uploadedFile && (
                    <div className={styles.fileInfo}>
                      <span className={styles.fileName}>{uploadedFile.name}</span>
                      <button
                        className={styles.removeButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadedFile(null);
                          handleInputChange("association", "cttProof", null);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        );

      case steps.account: // Account
        return (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>{t("register.account.title")}</h1>
              <p className={styles.subtitle}>
                {t("register.account.subtitle")}
              </p>
            </div>

            <div className={styles.formSection}>
              <div className={styles.inputGroup}>
                <FormInput
                  label={t("register.account.placeholders.name")}
                  id="name"
                  name="name"
                  type="text"
                  placeholder={t("register.account.placeholders.name")}
                  value={formData.account.name}
                  onChange={(e) =>
                    handleInputChange("account", "name", e.target.value)
                  }
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <FormInput
                  label={t("register.account.placeholders.email")}
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t("register.account.placeholders.email")}
                  value={formData.account.email}
                  onChange={(e) =>
                    handleInputChange("account", "email", e.target.value)
                  }
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <FormInput
                  label={t("register.account.placeholders.phone")}
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder={t("register.account.placeholders.phone")}
                  value={formData.account.phone}
                  onChange={(e) =>
                    handleInputChange("account", "phone", e.target.value)
                  }
                />
              </div>
            </div>
          </>
        );

      case steps.confirm: // Confirm
        return (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>{t("register.confirm.title")}</h1>
              <p className={styles.subtitle}>
                {t("register.confirm.subtitle", {
                  registry: registrarId,
                })}
              </p>
            </div>

            <div className={styles.confirmationSummary}>
              <div className={styles.summaryRow}>
                <div className={styles.summaryLabel}>
                  {t("register.confirm.labels.role")}
                </div>
                <div className={styles.summaryValue}>
                  {Object.entries(formData.roles)
                    .filter(([_, value]) => value)
                    .map(([key]) => key)
                    .join(", ")}
                </div>
              </div>

              <div className={styles.summaryRow}>
                <div className={styles.summaryLabel}>
                  {t("register.confirm.labels.m2m")}
                </div>
                <div className={styles.summaryValue}>
                  {formData.m2m.useM2M === "yes" ? "Yes" : "No"}
                </div>
              </div>

              <div className={styles.summaryRow}>
                <div className={styles.summaryLabel}>
                  {t("register.confirm.labels.identity")}
                </div>
                <div className={styles.summaryValue}>
                  <div>
                    {t("register.confirm.labels.partyId")}:{" "}
                    {formData.idCheck.partyId}
                  </div>
                  <div>
                    {t("register.confirm.labels.partyName")}:{" "}
                    {formData.idCheck.partyName}
                  </div>
                </div>
              </div>

              <div className={styles.summaryRow}>
                <div className={styles.summaryLabel}>
                  {t("register.confirm.labels.location")}
                </div>
                <div className={styles.summaryValue}>
                  <div>{formData.location.address}</div>
                  <div>{formData.location.zipCode}</div>
                  <div>{formData.location.city}</div>
                  <div>{formData.location.country}</div>
                  <div>{formData.location.website}</div>
                </div>
              </div>

              <div className={styles.summaryRow}>
                <div className={styles.summaryLabel}>
                  {t("register.confirm.labels.authRegistry")}
                </div>
                <div className={styles.summaryValue}>
                  {formData.association.authRegistry}
                </div>
              </div>

              {!hideCapabilitiesUrlField && (
                <div className={styles.summaryRow}>
                  <div className={styles.summaryLabel}>
                    {t("register.confirm.labels.capabilities")}
                  </div>
                  <div className={styles.summaryValue}>
                    {formData.association.capabilitiesUrl}
                  </div>
                </div>
              )}

              {formData.roles.dataProvider && (
                <div className={styles.summaryRow}>
                  <div className={styles.summaryLabel}>
                    {t("register.confirm.labels.cttProof")}
                  </div>
                  <div className={styles.summaryValue}>
                    {(formData.association.cttProof?.name ||
                      t("register.confirm.labels.noFile"))}
                  </div>
                </div>
              )}

              <div className={styles.summaryRow}>
                <div className={styles.summaryLabel}>
                  {t("register.confirm.labels.account")}
                </div>
                <div className={styles.summaryValue}>
                  <div>
                    {t("register.confirm.labels.name")}: {formData.account.name}
                  </div>
                  <div>
                    {t("register.confirm.labels.email")}:{" "}
                    {formData.account.email}
                  </div>
                  <div>
                    {t("register.confirm.labels.phone")}:{" "}
                    {formData.account.phone}
                  </div>
                </div>
              </div>
            </div>

            {shouldShowAgreementTerms && agreementTerms.length > 0 && (
              <div className={styles.termsSection}>
                <p className={styles.termsTitle}>
                  <strong>{t("register.confirm.labels.terms")}</strong>
                </p>
                {agreementTerms.map((term) => {
                  const checked = !!acceptedTerms[term.id];
                  return (
                    <div key={term.id} className={styles.inputGroup}>
                      <input
                        type="checkbox"
                        id={term.id}
                        checked={checked}
                        className={styles.pointerDiv}
                        onChange={(e) => {
                          const next = { ...acceptedTerms, [term.id]: e.target.checked };
                          setAcceptedTerms(next);
                          const allChecked = agreementTerms.length > 0 && agreementTerms.every(t => next[t.id]);
                          handleInputChange("agreements", "termsConsent", allChecked);
                        }}
                      />
                      <label htmlFor={term.id} className={styles.pointerDiv}>
                        {term.url ? (
                          <a href={term.url} target="_blank" rel="noreferrer noopener">
                            {term.label}
                          </a>
                        ) : (
                          term.label
                        )}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        );

      case steps.success: // Submission Success step
        return <SubmissionSuccessScreen />;

      case steps.signingMethod: // Choose signing method step
        return (
          <>
            <div className={styles.header}>
              <h1 className={styles.title}>{t("register.agreements.signingMethod")}</h1>
              <p className={styles.subtitle}>
                {t("register.agreements.signingMethodSubtitle")}
              </p>
            </div>

            <div className={styles.questionContainer}>
              <div className={styles.radioGroup}>
                {eherkenningSigningAvailable && (
                <div className={styles.radioOption}>
                  <input
                    type="radio"
                    id="eherkenning"
                    name="signingMethod"
                    value="eherkenning"
                    checked={formData.signingMethod.method === "eherkenning"}
                    onChange={() => handleInputChange("signingMethod", "method", "eherkenning")}
                    className={styles.pointerDiv}
                  />
                  <label htmlFor="eherkenning" className={styles.pointerDiv}>
                    {t("register.idCheck.eHerkenning")}
                  </label>
                  <div className={styles.roleDescription}>
                    {t("register.agreements.eherkenningSigningDescription")}
                  </div>
                </div>
                )}

                <div className={styles.radioOption}>
                  <input
                    type="radio"
                    id="manual"
                    name="signingMethod"
                    value="manual"
                    checked={formData.signingMethod.method === "manual"}
                    onChange={() => handleInputChange("signingMethod", "method", "manual")}
                    className={styles.pointerDiv}
                  />
                  <label htmlFor="manual" className={styles.pointerDiv}>
                    {t("register.agreements.manualSigning")}
                  </label>
                  <div className={styles.roleDescription}>
                    {t("register.agreements.manualSigningDescription")}
                  </div>
                </div>
              </div>

              <div className={styles.agreementsList}>
                {renderAgreementDownloads()}
              </div>
            </div>
          </>
        );

      case steps.agreement: // Agreements step
        return (
          <>
            {formData.signingMethod.method !== "eherkenning" ? (
              // Manual signing - updated file upload interface (also the safe
              // default when no method is selected / eHerkenning is unavailable)
              <div className={styles.signAgreementsContainer}>
                <h3>{t("register.agreements.manualTitle")}</h3>
                <p className={styles.description}>{t("register.agreements.manualDescription")}</p>

                {/* Agreements configured in Settings (built-ins + custom). */}
                <div className={styles.agreementsList}>
                  {renderAgreementDownloads()}
                </div>

                <div className={styles.uploadSection}>

                  <p className={styles.uploadLabel}>Upload 2 signed agreements:</p>

                  <div
                    className={`${styles.uploadContainer} ${isDragging ? styles.dragActive : ""
                      }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileInput}
                      accept=".pdf,.png"
                      multiple
                      style={{ display: "none" }}
                    />
                    <div className={styles.uploadContent}>
                      <div className={styles.uploadText}>
                        {t("register.agreements.dragDrop")}
                      </div>
                      <div className={styles.orText}>
                        {t("register.agreements.or")}
                      </div>
                      <button className={styles.browseButton} type="button">
                        {t("register.agreements.browse")}
                      </button>
                      <div className={styles.maxSizeText}>
                        {t("register.agreements.uploadLimits")}
                      </div>
                    </div>
                  </div>

                  {uploadError && (
                    <div className={styles.errorMessage}>{uploadError}</div>
                  )}

                  <div className={styles.uploadStatus}>
                    {formData.agreements.files.length}/{requiredAgreementCount} agreements uploaded
                  </div>

                  {formData.agreements.files.length > 0 && (
                    <div className={styles.filesContainer}>
                      {formData.agreements.files.map((file, index) => (
                        <div key={index} className={styles.fileInfo}>
                          <div className={styles.fileName}>{file.name}</div>
                          <div id="actions">
                            <button
                              className={styles.removeButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                const updatedFiles = formData.agreements.files.filter(
                                  (_, i) => i !== index
                                );
                                setFormData((prev) => ({
                                  ...prev,
                                  agreements: {
                                    ...prev.agreements,
                                    files: updatedFiles.splice(index, 1),
                                  },
                                }));
                              }}
                            >
                              <img src="/icons/revert.svg" alt={t("common.restore")} />

                            </button>
                            <button
                              className={styles.removeButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                const updatedFiles = formData.agreements.files.filter(
                                  (_, i) => i !== index
                                );
                                setFormData((prev) => ({
                                  ...prev,
                                  agreements: {
                                    ...prev.agreements,
                                    files: updatedFiles,
                                  },
                                }));
                              }}
                            >
                              <img src="/icons/delete.svg" alt={t("common.delete")} />

                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.buttonContainer}>
                  <button className={styles.backButton} onClick={handleBack}>
                    {t("register.agreements.back")}
                  </button>
                  <button
                    className={`${styles.commitButton} ${formData.agreements.files.length < requiredAgreementCount && styles.disabled
                      }`}
                    onClick={handleSignAndCommit}
                    disabled={formData.agreements.files.length < requiredAgreementCount || isSubmitting}
                  >
                    {isSubmitting
                      ? t("register.agreements.committing")
                      : t("register.agreements.commit")}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.signAgreementsContainer}>
                <div className={styles.header}>
                  <h1 className={styles.title}>{t("register.agreements.title")}</h1>
                </div>
                <div className={styles.eherkenningContainer}>
                  <input
                    type="checkbox"
                    id="eherkenningConsent"
                    name="eherkenningConsent"
                    checked={formData.agreements.eherkenningConsent || false}
                    onChange={() =>
                      handleInputChange(
                        "agreements",
                        "eherkenningConsent",
                        !formData.agreements.eherkenningConsent
                      )
                    }
                    className={styles.pointerDiv}
                  />
                  <label htmlFor="eherkenningConsent" className={styles.pointerDiv}>
                    {t("register.agreements.confirmText")}
                  </label>
                </div>
                {uploadError && (
                  <div className={styles.errorMessage}>{uploadError}</div>
                )}
                <div className={styles.buttonContainer}>
                  <button className={styles.backButton} onClick={handleBack}>
                    {t("register.agreements.back")}
                  </button>
                  <button
                    className={`${styles.commitButton} ${formData.agreements.eherkenningConsent !== true && styles.disabled
                      }`}
                    onClick={handleSignAndCommit}
                    disabled={formData.agreements.eherkenningConsent !== true}
                  >
                    {isSubmitting
                      ? t("register.agreements.committing")
                      : t("register.agreements.signButton")}
                  </button>
                </div>
              </div>
            )}
          </>
        );

      case steps.success: // Success step
        return <SuccessScreen />;

      case steps.completed: // Completed step
        return (
          <div className={styles.completedContainer}>
            <SuccessCheckIcon />
            <h1 className={styles.completedTitle}>
              {t("register.completed.title")}
            </h1>
            <p className={styles.completedMessage}>
              {t("register.completed.message")}
            </p>
          </div>
        );

      case steps.rejected: // Rejected step
        return (
          <div className={styles.rejectedContainer}>
            <h1 className={styles.rejectedTitle}>
              {t("register.rejected.title")}
            </h1>
            <p className={styles.rejectedMessage}>
              {t("register.rejected.message")}
            </p>
            <button
              className={styles.editButton}
              onClick={() => setCurrentStep(firstInteractiveStep)}
            >
              {t("register.rejected.editButton")}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const isSubmitDisabled =
    isSubmitting ||
    submitSuccess ||
    (requiresTermsConsent && !formData.agreements.termsConsent);

  // Admin landed on /register: show only a loader while redirecting to /admin —
  // the onboarding flow is never rendered for them.
  if (isAdmin) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "70vh",
        }}
      >
        <Loading />
      </div>
    );
  }

  return (
    <ProtectedRoute fetchData={fetchProposalData}>
      <div className={styles.container}>
        {currentStep <= steps.confirm && ( // Only show steps container for steps 0-6
          <div className={styles.stepsContainer}>
            <div className={styles.mobileSteps}>
              <span className={styles.mobileStepCount}>
                {t("register.stepCounter", {
                  current:
                    progressStepKeys.findIndex((k) => steps[k] === currentStep) + 1,
                  total: progressStepKeys.length,
                })}
              </span>
              <span className={styles.mobileStepName}>
                {t(
                  `register.steps.${
                    progressStepKeys.find((k) => steps[k] === currentStep) ?? "role"
                  }`
                )}
              </span>
            </div>
            {progressStepKeys.map((stepKey) => {
              const stepNumber = steps[stepKey]
              const isActive = stepNumber === currentStep
              const isCompleted = stepNumber < currentStep
              const isUpcoming = stepNumber > currentStep

              return (
                <div key={stepKey} className={styles.stepWrapper}>
                  <div
                    className={`${styles.content} ${(isCompleted || isActive) ? styles.completed : ""}
                      ${isUpcoming ? styles.incomplete : ""}`}
                  >
                    {t(`register.steps.${stepKey}`)}
                  </div>
                  <div
                    className={`${styles.step} ${isActive ? styles.active : ""} ${isCompleted ? styles.completed : ""}
                      ${isUpcoming ? styles.incomplete : ""}`}
                  />
                </div>
              )
            })}
          </div>
        )}

        <div className={styles.content}>
          <div className={styles.section}>
            {renderStepContent()}
            {validationError && (
              <div className={styles.errorMessage}>{t(validationError)}</div>
            )}
          </div>
        </div>

        {/* Pinned footer: kept OUTSIDE the scrolling content so it stays at the
            bottom of the wizard column on every step (short or tall). */}
        {(currentStep <= steps.confirm || currentStep === steps.signingMethod) && ( // Show navigation buttons for steps 0-6 and 8
          <div className={styles.buttonContainer}>
            {canGoBack && (
              <button
                className={`${styles.backButton} ${isSubmitting || submitSuccess ? styles.disabled : ""
                  }`}
                onClick={handleBack}
                disabled={isSubmitting || submitSuccess}
              >
                {t("register.confirm.buttons.back")}
              </button>
            )}
            {(currentStep < steps.confirm || currentStep === steps.signingMethod) && (
              <button
                className={styles.continueButton}
                onClick={handleContinue}
              >
                {currentStep === steps.signingMethod ? t("register.agreements.title") : t("register.confirm.buttons.continue")}
              </button>
            )}
            {currentStep === steps.confirm && (
              <button
                className={`${styles.submitButton} ${isSubmitDisabled ? styles.disabled : ""}`}
                onClick={handleContinue}
                disabled={isSubmitDisabled}
              >
                {submitSuccess
                  ? t("register.confirm.buttons.submitted")
                  : t("register.confirm.buttons.submit")}
              </button>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
};

export default Register;
