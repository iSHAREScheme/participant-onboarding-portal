import { useEffect } from "react";
import styles from "../../styles/components/PrivateRoute.module.css";
import { useKeycloak } from "@react-keycloak/web";
import { Loading } from "components";
import { getPublicEnv } from "config/publicEnv";

const ProtectedRoute = ({
  children,
  fetchData,
}: {
  children: React.ReactNode;
  fetchData: () => void;
}) => {

  const [keycloak, initialized] = useKeycloak()

  useEffect(() => {
    if (!initialized) return
    if (!keycloak.authenticated) {
      const env = getPublicEnv();
      const idpOnly = env.NEXT_PUBLIC_IDP_ONLY === "true";
      const keycloakIdp = env.NEXT_PUBLIC_KEYCLOAK_IDP;
      const idpHint =
        idpOnly && keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
          ? keycloakIdp
          : undefined;
      // console.log('Not authenticated', keycloakIdp)
      keycloak.login(
        {
          redirectUri: window.location.href,
          idpHint,
          // prompt: 'login',
          scope: 'openid profile email'
        }
      )
    } else {
      // console.log('Fetching data')
      fetchData()
    }
    // `fetchData` is a caller-supplied callback (usually defined inline), so it
    // must NOT be a dependency — it would make this auth-gate effect re-run on
    // every parent render. The effect intentionally re-runs only when the
    // resolved authentication state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keycloak.authenticated])

  return keycloak.authenticated ? (
    <>{children}</>
  ) : (
    <div className={styles.container}>
      <Loading />
    </div>
  );
};

export default ProtectedRoute;
