import { isSatelliteOperator } from "utils/roles";
import { useEffect } from "react";
import styles from "../../styles/components/AdminRoute.module.css";
import { Loading } from "components";
import { useKeycloak } from "@react-keycloak/web";
import { getPublicEnv } from "config/publicEnv";
import { useRouter } from "next/router";

const AdminRoute = ({
  children,
  fetchData,
}: {
  children: React.ReactNode;
  fetchData: () => void;
}) => {
  const [keycloak, initialized] = useKeycloak();
  const router = useRouter();
  const env = getPublicEnv();
  const adminRoutesDisabled = env.NEXT_PUBLIC_DISABLE_ADMIN_ROUTES === "true";

  const isAuthenticated = keycloak.authenticated;
  const hasAdminRole = isSatelliteOperator(keycloak);

  useEffect(() => {
    if (adminRoutesDisabled) {
      router.replace("/404");
      return;
    }

    if (!initialized) return;

    if (isAuthenticated && hasAdminRole) {
      fetchData();
    } else if (!isAuthenticated) {
      const env = getPublicEnv();
      const idpOnly = env.NEXT_PUBLIC_IDP_ONLY === "true";
      const keycloakIdp = env.NEXT_PUBLIC_KEYCLOAK_IDP;
      const idpHint =
        idpOnly && keycloakIdp && keycloakIdp !== "undefined" && keycloakIdp !== ""
          ? keycloakIdp
          : undefined;
      keycloak.login({
        idpHint,
      });
    }
  }, [adminRoutesDisabled, fetchData, hasAdminRole, initialized, isAuthenticated, keycloak, router]);

  if (adminRoutesDisabled) {
    return (
      <div className={styles.container}>
        <Loading />
      </div>
    );
  }

  return keycloak.authenticated ? (
    isSatelliteOperator(keycloak) ? (
      <>{children}</>
    ) : (
      <h1 className={styles.container}>You don&apos;t have access to this page.</h1>
    )
  ) : (
    <div className={styles.container}>
      <Loading />
    </div>
  );
};

export default AdminRoute;
