import { NextPage } from "next";
import { useState, useEffect, useCallback } from "react";
import { useKeycloak } from "@react-keycloak/web";
import AdminRoute from "components/AdminRoute";
import styles from "styles/Users.module.css";
import { useLanguage } from "../context/LanguageContext";
import { getPublicEnv } from "config/publicEnv";

interface KeycloakUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  createdTimestamp: number;
  roles?: string[];
}

const Users: NextPage = () => {
  const [keycloak] = useKeycloak();
  const [users, setUsers] = useState<KeycloakUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "user",
  });
  const { t } = useLanguage();
  const [validationErrors, setValidationErrors] = useState({
    email: "",
    firstName: "",
    lastName: "",
  });
  const env = getPublicEnv();

  const fetchData = useCallback(() => {
    fetch(`${keycloak.authServerUrl}/admin/realms/${keycloak.realm}/users`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${keycloak.token}`,
        "Content-Type": "application/json",
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t("users.messages.error.fetch"));
        }
        const users = await response.json();

        const usersWithRoles = await Promise.all(
          users.map(async (user: KeycloakUser) => {
            const rolesResponse = await fetch(
              `${keycloak.authServerUrl}/admin/realms/${keycloak.realm}/users/${user.id}/role-mappings/realm`,
              {
                headers: {
                  Authorization: `Bearer ${keycloak.token}`,
                  "Content-Type": "application/json",
                },
              }
            );

            if (rolesResponse.ok) {
              const roles = await rolesResponse.json();
              return {
                ...user,
                roles: roles.map((role: { name: string }) => role.name),
              };
            }
            return user;
          })
        );

        setError("");
        setUsers(usersWithRoles);
      })
      .catch((error) => {
        setError(error.message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [keycloak.authServerUrl, keycloak.realm, keycloak.token, t]);

  const deleteUser = async (userId: string) => {
    const response = await fetch(
      `${keycloak.authServerUrl}/admin/realms/${keycloak.realm}/users/${userId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (response.ok) {
      fetchData();
    } else {
      const errorData = await response.json();
      console.error(
        t("users.messages.error.delete"),
        response.status,
        errorData
      );
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const validateForm = () => {
    const errors = {
      email: "",
      firstName: "",
      lastName: "",
    };

    // Email validation
    if (!newUserData.email) {
      errors.email = t("users.validation.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUserData.email)) {
      errors.email = t("users.validation.emailInvalid");
    }

    // First name validation
    if (!newUserData.firstName.trim()) {
      errors.firstName = t("users.validation.firstNameRequired");
    }

    // Last name validation
    if (!newUserData.lastName.trim()) {
      errors.lastName = t("users.validation.lastNameRequired");
    }

    setValidationErrors(errors);
    return !Object.values(errors).some((error) => error !== "");
  };

  const createUser = async () => {
    if (!validateForm()) {
      return;
    }

    const trimmedEmail = newUserData.email.trim();
    const trimmedFirstName = newUserData.firstName.trim();
    const trimmedLastName = newUserData.lastName.trim();
    const requiredActions = ["VERIFY_EMAIL", "UPDATE_PASSWORD"];
    const newUser = {
      username: trimmedEmail,
      enabled: true,
      emailVerified: false,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      email: trimmedEmail,
      requiredActions,
    };

    try {
      // Create user
      const response = await fetch(
        `${keycloak.authServerUrl}/admin/realms/${keycloak.realm}/users`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${keycloak.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(newUser),
        }
      );

      if (!response.ok) {
        throw new Error(t("users.messages.error.create"));
      }

      // Get the user ID from the Location header
      const locationHeader = response.headers.get("Location");
      const userId = locationHeader?.split("/").pop();
      if (!userId) {
        throw new Error(t("users.messages.error.create"));
      }

      const assignRealmRole = async (roleName: string) => {
        const rolesResponse = await fetch(
          `${keycloak.authServerUrl}/admin/realms/${keycloak.realm}/roles/${roleName}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!rolesResponse.ok) {
          throw new Error(t("users.messages.error.roleNotFound"));
        }

        const roleDetails = await rolesResponse.json();

        const roleResponse = await fetch(
          `${keycloak.authServerUrl}/admin/realms/${keycloak.realm}/users/${userId}/role-mappings/realm`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${keycloak.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([
              {
                id: roleDetails.id,
                name: roleName,
              },
            ]),
          }
        );

        if (!roleResponse.ok) {
          throw new Error(t("users.messages.error.roleAssignment"));
        }
      };

      if (newUserData.role === "admin") {
        await assignRealmRole("onboarding-admin");
      }

      const redirectBase = env.NEXT_PUBLIC_FRONTEND_DOMAIN;
      const redirectUri = redirectBase ? `${redirectBase}/register` : "";
      const clientId = env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;
      const params = new URLSearchParams();
      if (clientId) params.set("client_id", clientId);
      if (redirectUri) params.set("redirect_uri", redirectUri);
      const inviteUrl =
        `${keycloak.authServerUrl}/admin/realms/${keycloak.realm}/users/${userId}/execute-actions-email` +
        (params.toString() ? `?${params.toString()}` : "");

      const inviteResponse = await fetch(inviteUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requiredActions),
      });

      if (!inviteResponse.ok) {
        throw new Error(t("users.messages.error.invite"));
      }

      fetchData();
      setIsDialogOpen(false);
      setNewUserData({ email: "", firstName: "", lastName: "", role: "user" });
    } catch (error) {
      setError(error.message);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setNewUserData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <AdminRoute fetchData={fetchData}>
      <div className={styles.container}>
        <div className={styles.headerSection}>
          <h1 className={styles.title}>{t("users.title")}</h1>
          <button
            className={styles.createButton}
            onClick={() => setIsDialogOpen(true)}
          >
            {t("users.actions.create")}
          </button>
        </div>

        {isDialogOpen && (
          <div className={styles.dialogOverlay}>
            <div className={styles.dialog}>
              <h2>{t("users.dialog.title")}</h2>
              <div className={styles.dialogContent}>
                <div className={styles.formGroup}>
                  <label htmlFor="email">{t("users.dialog.email")}</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={newUserData.email}
                    onChange={handleInputChange}
                    className={validationErrors.email ? styles.inputError : ""}
                  />
                  {validationErrors.email && (
                    <span className={styles.errorMessage}>
                      {validationErrors.email}
                    </span>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="firstName">
                    {t("users.dialog.firstName")}
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={newUserData.firstName}
                    onChange={handleInputChange}
                    className={
                      validationErrors.firstName ? styles.inputError : ""
                    }
                  />
                  {validationErrors.firstName && (
                    <span className={styles.errorMessage}>
                      {validationErrors.firstName}
                    </span>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="lastName">{t("users.dialog.lastName")}</label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={newUserData.lastName}
                    onChange={handleInputChange}
                    className={
                      validationErrors.lastName ? styles.inputError : ""
                    }
                  />
                  {validationErrors.lastName && (
                    <span className={styles.errorMessage}>
                      {validationErrors.lastName}
                    </span>
                  )}
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="role">{t("users.dialog.role")}</label>
                  <select
                    id="role"
                    name="role"
                    value={newUserData.role}
                    onChange={(e) => handleInputChange(e)}
                  >
                    <option value="user">{t("users.roles.user")}</option>
                    <option value="admin">{t("users.roles.admin")}</option>
                  </select>
                </div>
              </div>
              <div className={styles.dialogActions}>
                <button
                  className={styles.cancelButton}
                  onClick={() => setIsDialogOpen(false)}
                >
                  {t("users.dialog.cancel")}
                </button>
                <button className={styles.submitButton} onClick={createUser}>
                  {t("users.dialog.create")}
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading && (
          <div className={styles.loading}>{t("users.loading")}</div>
        )}
        {error && <div className={styles.error}>{error}</div>}

        {!isLoading && !error && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
            <thead>
              <tr>
                <th>{t("users.table.headers.username")}</th>
                <th>{t("users.table.headers.email")}</th>
                <th>{t("users.table.headers.name")}</th>
                <th>{t("users.table.headers.role")}</th>
                <th>{t("users.table.headers.status")}</th>
                <th>{t("users.table.headers.created")}</th>
                <th>{t("users.table.headers.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td data-label={t("users.table.headers.username")}>
                    {user.username}
                  </td>
                  <td data-label={t("users.table.headers.email")}>
                    {user.email}
                  </td>
                  <td data-label={t("users.table.headers.name")}>
                    {`${user.firstName} ${user.lastName}`}
                  </td>
                  <td data-label={t("users.table.headers.role")}>
                    <span
                      className={`${styles.role} ${
                        styles[
                          user.roles?.includes("onboarding-admin")
                            ? "adminRole"
                            : "userRole"
                        ]
                      }`}
                    >
                      {user.roles?.includes("onboarding-admin")
                        ? t("users.roles.admin")
                        : t("users.roles.user")}
                    </span>
                  </td>
                  <td data-label={t("users.table.headers.status")}>
                    <span
                      className={`${styles.status} ${
                        user.enabled ? styles.active : styles.inactive
                      }`}
                    >
                      {user.enabled
                        ? t("users.status.active")
                        : t("users.status.inactive")}
                    </span>
                  </td>
                  <td data-label={t("users.table.headers.created")}>
                    {formatDate(user.createdTimestamp)}
                  </td>
                  <td data-label={t("users.table.headers.actions")}>
                    <button
                      className={styles.deleteButton}
                      onClick={() => deleteUser(user.id)}
                    >
                      {t("users.actions.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminRoute>
  );
};

export default Users;
