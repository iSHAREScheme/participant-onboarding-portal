import { NextPage } from "next";
import { useCallback, useEffect, useState } from "react";
import ProtectedRoute from "components/ProtectedRoute";
import API, { DelegationOverview } from "api/client";
import styles from "styles/OrganizationAccess.module.css";
import { useLanguage } from "../context/LanguageContext";

const Api = new API();

const OrganizationAccess: NextPage = () => {
  const { t } = useLanguage();
  const [overview, setOverview] = useState<DelegationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [idpForm, setIdpForm] = useState({
    providerType: "google",
    alias: "google",
    displayName: "Google Workspace",
    issuerUrl: "",
    clientId: "",
    clientSecret: "",
  });
  const [memberForm, setMemberForm] = useState({
    email: "",
    providerAlias: "google",
    role: "contributor",
  });

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await Api.fetchDelegationOverview();
      setOverview(response.data);
    } catch (err) {
      setError(t("organizationAccess.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Initial load on mount. Inlined (rather than calling loadOverview) so that no
  // setState runs synchronously inside the effect; `loading` already starts true.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await Api.fetchDelegationOverview();
        if (active) setOverview(response.data);
      } catch {
        if (active) setError(t("organizationAccess.errors.load"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [t]);

  const organization = overview?.verifiedOrganization;
  const kvkNumber = organization?.kvkNumber || "";

  const createIdpConnection = async () => {
    if (!kvkNumber) return;
    setError("");
    setMessage("");
    try {
      await Api.createDelegationIdpConnection({
        kvkNumber,
        providerType: idpForm.providerType,
        alias: idpForm.alias,
        displayName: idpForm.displayName,
        issuerUrl: idpForm.issuerUrl,
        clientId: idpForm.clientId,
        clientSecret: idpForm.clientSecret,
      });
      setMessage(t("organizationAccess.messages.idpCreated"));
      await loadOverview();
    } catch (err) {
      setError(t("organizationAccess.errors.idpCreate"));
    }
  };

  const createMember = async () => {
    if (!kvkNumber) return;
    setError("");
    setMessage("");
    try {
      await Api.createDelegationMember({
        kvkNumber,
        email: memberForm.email,
        providerAlias: memberForm.providerAlias,
        role: memberForm.role,
      });
      setMemberForm((prev) => ({ ...prev, email: "" }));
      setMessage(t("organizationAccess.messages.memberCreated"));
      await loadOverview();
    } catch (err) {
      setError(t("organizationAccess.errors.memberCreate"));
    }
  };

  const connectionOptions = overview?.idpConnections?.length
    ? overview.idpConnections
    : [{ alias: "google" }, { alias: "microsoft" }, { alias: "okta" }];

  return (
    <ProtectedRoute fetchData={loadOverview}>
      <div className={styles.container}>
        <div className={styles.headerSection}>
          <h1 className={styles.title}>{t("organizationAccess.title")}</h1>
          <button className={styles.secondaryButton} onClick={loadOverview}>
            {t("organizationAccess.refresh")}
          </button>
        </div>

        {loading && <div className={styles.loading}>{t("common.loading")}</div>}
        {error && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.success}>{message}</div>}

        {!loading && !organization && (
          <div className={styles.emptyState}>
            <h2>{t("organizationAccess.noOrganization.title")}</h2>
            <p>{t("organizationAccess.noOrganization.description")}</p>
          </div>
        )}

        {organization && (
          <>
            <section className={styles.panel}>
              <h2>{t("organizationAccess.organization.title")}</h2>
              <div className={styles.metaGrid}>
                <div>
                  <span>{t("organizationAccess.organization.kvk")}</span>
                  <strong>{organization.kvkNumber}</strong>
                </div>
                <div>
                  <span>{t("organizationAccess.organization.company")}</span>
                  <strong>{organization.companyName || "-"}</strong>
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <h2>{t("organizationAccess.idp.title")}</h2>
              <div className={styles.formGrid}>
                <label>
                  {t("organizationAccess.idp.providerType")}
                  <select
                    value={idpForm.providerType}
                    onChange={(event) =>
                      setIdpForm((prev) => ({
                        ...prev,
                        providerType: event.target.value,
                        alias: event.target.value === "generic-oidc" ? prev.alias : event.target.value,
                      }))
                    }
                  >
                    <option value="google">Google Workspace</option>
                    <option value="microsoft">Microsoft Entra ID</option>
                    <option value="okta">Okta</option>
                    <option value="generic-oidc">Generic OIDC</option>
                    <option value="generic-saml">Generic SAML</option>
                  </select>
                </label>
                <label>
                  {t("organizationAccess.idp.alias")}
                  <input
                    value={idpForm.alias}
                    onChange={(event) =>
                      setIdpForm((prev) => ({ ...prev, alias: event.target.value }))
                    }
                  />
                </label>
                <label>
                  {t("organizationAccess.idp.displayName")}
                  <input
                    value={idpForm.displayName}
                    onChange={(event) =>
                      setIdpForm((prev) => ({ ...prev, displayName: event.target.value }))
                    }
                  />
                </label>
                <label>
                  {t("organizationAccess.idp.issuerUrl")}
                  <input
                    value={idpForm.issuerUrl}
                    onChange={(event) =>
                      setIdpForm((prev) => ({ ...prev, issuerUrl: event.target.value }))
                    }
                  />
                </label>
                <label>
                  {t("organizationAccess.idp.clientId")}
                  <input
                    value={idpForm.clientId}
                    onChange={(event) =>
                      setIdpForm((prev) => ({ ...prev, clientId: event.target.value }))
                    }
                  />
                </label>
                <label>
                  {t("organizationAccess.idp.clientSecret")}
                  <input
                    type="password"
                    value={idpForm.clientSecret}
                    onChange={(event) =>
                      setIdpForm((prev) => ({ ...prev, clientSecret: event.target.value }))
                    }
                  />
                </label>
              </div>
              <button className={styles.primaryButton} onClick={createIdpConnection}>
                {t("organizationAccess.idp.create")}
              </button>

              <DataTable
                emptyText={t("organizationAccess.idp.empty")}
                headers={[
                  t("organizationAccess.idp.providerType"),
                  t("organizationAccess.idp.alias"),
                  t("organizationAccess.idp.status"),
                ]}
                rows={(overview.idpConnections || []).map((connection) => [
                  connection.providerType,
                  connection.alias,
                  connection.status,
                ])}
              />
            </section>

            <section className={styles.panel}>
              <h2>{t("organizationAccess.members.title")}</h2>
              <div className={styles.formGrid}>
                <label>
                  {t("organizationAccess.members.email")}
                  <input
                    type="email"
                    value={memberForm.email}
                    onChange={(event) =>
                      setMemberForm((prev) => ({ ...prev, email: event.target.value }))
                    }
                  />
                </label>
                <label>
                  {t("organizationAccess.members.providerAlias")}
                  <select
                    value={memberForm.providerAlias}
                    onChange={(event) =>
                      setMemberForm((prev) => ({ ...prev, providerAlias: event.target.value }))
                    }
                  >
                    {connectionOptions.map((connection) => (
                      <option key={connection.alias} value={connection.alias}>
                        {connection.alias}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("organizationAccess.members.role")}
                  <select
                    value={memberForm.role}
                    onChange={(event) =>
                      setMemberForm((prev) => ({ ...prev, role: event.target.value }))
                    }
                  >
                    <option value="contributor">Contributor</option>
                    <option value="viewer">Viewer</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
              </div>
              <button className={styles.primaryButton} onClick={createMember}>
                {t("organizationAccess.members.create")}
              </button>

              <DataTable
                emptyText={t("organizationAccess.members.empty")}
                headers={[
                  t("organizationAccess.members.email"),
                  t("organizationAccess.members.providerAlias"),
                  t("organizationAccess.members.role"),
                  t("organizationAccess.members.status"),
                ]}
                rows={(overview.members || []).map((member) => [
                  member.email || member.username || member.keycloakSubject || "-",
                  member.providerAlias || "-",
                  member.role,
                  member.status,
                ])}
              />
            </section>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
};

const DataTable = ({
  headers,
  rows,
  emptyText,
}: {
  headers: string[];
  rows: string[][];
  emptyText: string;
}) => {
  if (!rows.length) return <p className={styles.emptyText}>{emptyText}</p>;

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={`${index}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default OrganizationAccess;
