import type { AppProps } from "next/app"
import "styles/globals.css"
import Layout from "components/layout/Layout"
import { LanguageProvider } from "../context/LanguageContext"
import { SettingsProvider } from "../context/SettingsContext"
import { ToastProvider } from "../context/ToastContext"
import { ConfirmProvider } from "../context/ConfirmContext"
import { KeycloakProvider } from "@react-keycloak/web"
import Keycloak from "keycloak-js"
import useKeycloakInitConfig from "../hooks/useKeycloakInitConfig"
import { useTheme } from "../hooks/useTheme"
import { Poppins } from 'next/font/google'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { getPublicEnv } from 'config/publicEnv'
import { storeKeycloakTokens } from 'util/keycloakTokens'
import { clearStoredIdpActionState, setCompletedIdpAction } from 'util/idpActionState'
import { setKeycloakUserInfo } from 'util/keycloakUserInfo'

const poppins = Poppins({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
});

const keycloakStub = {
  authenticated: false,
  tokenParsed: undefined,
  realm: '',
  authServerUrl: '',
  hasRealmRole: () => false,
} as unknown as Keycloak;

// Theme wrapper component to initialize theming
function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const { theme, tenantId } = useTheme()
  
  return <>{children}</>
}

function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const env = getPublicEnv()
  const isBrowser = typeof window !== 'undefined'
  const keycloakUrl = env.NEXT_PUBLIC_KEYCLOAK_BASE_URL
  const keycloakRealm = env.NEXT_PUBLIC_KEYCLOAK_REALM
  const keycloakClientId = env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID

  if (isBrowser) {
    if (!keycloakUrl) 
      throw Error('Missing keycloak URL')
    if (!keycloakRealm) 
      throw Error('Missing keycloak realm')
    if (!keycloakClientId) 
      throw Error('Missing keycloak client-ID')
  }

  const keycloak = useMemo(() => {
    if (!isBrowser) {
      return keycloakStub
    }

    const instance = new Keycloak({
      url: keycloakUrl as string,
      realm: keycloakRealm as string,
      clientId: keycloakClientId as string,
    })
    instance.onActionUpdate = async (status, action) => {
      if (action?.startsWith("idp_link:")) {
        setCompletedIdpAction(status, action)
        if (status === 'success') {
          try {
            await instance.updateToken(0)
            const info = await instance.loadUserInfo()
            setKeycloakUserInfo(instance, info)
          } catch (error) {
            console.error('Failed to refresh user info after idp link', error)
          }
        }
      }
    }
    return instance
  }, [isBrowser, keycloakUrl, keycloakRealm, keycloakClientId])
  
  // Freeze the init config at first render (changing it would re-initialise Keycloak).
  // useState captures the first value and ignores it thereafter — without reading a
  // ref during render (react-hooks/refs).
  const [keycloakProviderInitConfig] = useState(useKeycloakInitConfig())

  
  return (
    <div>
      <KeycloakProvider
        keycloak={keycloak}
        initConfig={keycloakProviderInitConfig}
        onEvent={async (event) => {
          if (event === 'onAuthLogout') {
            clearStoredIdpActionState()
          }
          if (event === 'onAuthSuccess') {
            const info = await keycloak.loadUserInfo()
            setKeycloakUserInfo(keycloak, info)

            const roles: string[] = (keycloak.tokenParsed?.realm_access?.roles as string[]) || []
            const isAdmin = roles.includes('onboarding-admin')
            const target = isAdmin ? '/admin' : '/register'

            // Only redirect if current path is not already appropriate for the role
            const path = router.pathname
            const isOnAdminArea = /^\/(admin|users|settings|participants)(\/|$)/.test(path)
            const isOnUserArea = /^\/(?:register|profile|organization-access)(?:\/|$)/.test(path)

            const shouldRedirect = isAdmin ? !isOnAdminArea : !isOnUserArea
            if (shouldRedirect && path !== target) router.replace(target)
          }}}
        onTokens={(tokens) => {
          storeKeycloakTokens(tokens as Record<string, unknown>)
        }}
      >
        <LanguageProvider>
          <SettingsProvider>
            <ThemeWrapper>
              <ToastProvider>
                <ConfirmProvider>
                  <Layout>
                    <Component {...pageProps} />
                  </Layout>
                </ConfirmProvider>
              </ToastProvider>
            </ThemeWrapper>
          </SettingsProvider>
        </LanguageProvider>
      </KeycloakProvider>
    </div>
  );
}

export default MyApp
