import type { AppProps } from "next/app"
import "styles/globals.css"
import Layout from "components/layout/Layout"
import { LanguageProvider } from "../context/LanguageContext"
import { SettingsProvider } from "../context/SettingsContext"
import { KeycloakProvider } from "@react-keycloak/web"
import Keycloak from "keycloak-js"
import useKeycloakInitConfig from "../hooks/useKeycloakInitConfig"
import { useTheme } from "../hooks/useTheme"
import { Poppins } from 'next/font/google'
import { useMemo, useRef } from 'react'
import { useRouter } from 'next/router'
import { getPublicEnv } from 'config/publicEnv'
import { storeKeycloakTokens } from 'util/keycloakTokens'

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

    return new Keycloak({
      url: keycloakUrl as string,
      realm: keycloakRealm as string,
      clientId: keycloakClientId as string,
    })
  }, [isBrowser, keycloakUrl, keycloakRealm, keycloakClientId])
  
  const keycloakProviderInitConfig = useRef(useKeycloakInitConfig())

  
  return (
    <div>
      <KeycloakProvider
        keycloak={keycloak}
        initConfig={keycloakProviderInitConfig.current}
        onEvent={async (event) => {
          if (event === 'onAuthSuccess') {
            const info = await keycloak.loadUserInfo()
            ;(keycloak as any).userInfo = info

            const roles: string[] = (keycloak.tokenParsed?.realm_access?.roles as string[]) || []
            const isAdmin = roles.includes('onboarding-admin')
            const target = isAdmin ? '/admin' : '/register'

            // Only redirect if current path is not already appropriate for the role
            const path = router.pathname
            const isOnAdminArea = /^\/(admin|users|settings)(\/|$)/.test(path)
            const isOnUserArea = /^\/(?:register|profile)(?:\/|$)/.test(path)

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
              <Layout>
                <Component {...pageProps} />
              </Layout>
            </ThemeWrapper>
          </SettingsProvider>
        </LanguageProvider>
      </KeycloakProvider>
    </div>
  );
}

export default MyApp
