// Admin editor for public onboarding. The flows list IS the complete
// definition of what is published: enabling the master switch seeds one
// editable flow (at the base URL by default), the base URL is only public
// when a flow explicitly claims it, and every row shows the exact URL it
// publishes - so there is never an implicitly published surface.
import { useState } from "react";
import styles from "../../styles/Settings.module.css";
import { useLanguage } from "../../context/LanguageContext";
import {
  FLOW_ROUTE_PATTERN,
  RESERVED_FLOW_ROUTES,
  type PublicOnboardingFlow,
} from "config/onboardingFlows";

// What the admin edits: the stored flow minus the backend-resolved fields, plus
// a client-only key so React can track rows through add/remove without falling
// back to array indexes (routes are editable and may be blank while typing).
export type EditableFlow = Omit<PublicOnboardingFlow, "theme" | "agreements"> & {
  clientKey?: string;
};

let flowKeySeq = 0;

// Client-only identity for a flow row (never persisted). Prefers the platform
// UUID generator; falls back to a monotonic counter where it is unavailable.
export function newFlowKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `flow-${uuid}`;
  flowKeySeq += 1;
  return `flow-${Date.now().toString(36)}-${flowKeySeq}`;
}

/** Give every loaded flow a client key (idempotent). */
export function withFlowKeys(flows: EditableFlow[]): EditableFlow[] {
  return flows.map((f) => (f.clientKey ? f : { ...f, clientKey: newFlowKey() }));
}

/** Drop the client-only key before the flow is sent to the backend. */
export function stripFlowKey(flow: EditableFlow): Omit<EditableFlow, "clientKey"> {
  const rest: EditableFlow = { ...flow };
  delete rest.clientKey;
  return rest;
}

export interface FlowDataspaceOption {
  id: string;
  title?: string;
}

export interface FlowAuthRegistryOption {
  id: string;
  name?: string;
  url?: string;
}

export interface FlowAgreementOption {
  id: string;
  title: string;
  version?: string;
}

interface Props {
  enabled: boolean;
  flows: EditableFlow[];
  themeNames: string[];
  roleOptions: readonly string[];
  // Pick-lists sourced from the registry / settings so a flow can only refer
  // to things that exist (a free-text dataspace id would never match).
  dataspaces: FlowDataspaceOption[];
  authRegistries: FlowAuthRegistryOption[];
  agreements: FlowAgreementOption[];
  onEnabledChange: (enabled: boolean) => void;
  onFlowsChange: (flows: EditableFlow[]) => void;
}

export function flowRouteError(
  route: string,
  index: number,
  flows: EditableFlow[]
): string | null {
  const value = route.trim();
  if (value === "") {
    return flows.some((f, i) => i !== index && (f.route ?? "") === "")
      ? "duplicate-base"
      : null;
  }
  if (!FLOW_ROUTE_PATTERN.test(value)) return "pattern";
  if (RESERVED_FLOW_ROUTES.includes(value)) return "reserved";
  if (flows.some((f, i) => i !== index && f.route === value)) return "duplicate";
  return null;
}

const OnboardingFlowsSettings: React.FC<Props> = ({
  enabled,
  flows,
  themeNames,
  roleOptions,
  dataspaces,
  authRegistries,
  agreements,
  onEnabledChange,
  onFlowsChange,
}) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState<number | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const update = (index: number, patch: Partial<EditableFlow>) => {
    onFlowsChange(flows.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const addFlow = (route = "") => {
    onFlowsChange([
      ...flows,
      { route, title: "", themeName: "", enabled: true, clientKey: newFlowKey() },
    ]);
    setExpanded(flows.length);
  };

  const removeFlow = (index: number) => {
    onFlowsChange(flows.filter((_, i) => i !== index));
    setExpanded(null);
  };

  // Enabling with an empty list seeds one flow at the base URL, so the admin
  // is immediately editing what will actually be published.
  const handleEnable = (next: boolean) => {
    onEnabledChange(next);
    if (next && flows.length === 0) addFlow("");
  };

  const toggleAgreement = (index: number, id: string, checked: boolean) => {
    const current = flows[index].agreementIds ?? [];
    const next = checked
      ? Array.from(new Set([...current, id]))
      : current.filter((x) => x !== id);
    update(index, { agreementIds: next });
  };

  // A stored id that is no longer in the pick-list still needs to be visible,
  // otherwise the admin cannot see (or clear) a stale selection.
  const withStale = <T extends { id: string }>(options: T[], id: string | undefined, make: () => T) =>
    id && !options.some((o) => o.id === id) ? [...options, make()] : options;

  const publishedCount = flows.filter((f) => f.enabled !== false).length;

  return (
    <section className={styles.card} data-tour="public-onboarding">
      <h2 className={styles.cardTitle}>{t("settings.publicOnboarding.title")}</h2>
      <p className={styles.cardHint}>{t("settings.publicOnboarding.hint")}</p>

      <div className={styles.formGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleEnable(e.target.checked)}
          />
          {t("settings.publicOnboarding.enable")}
        </label>
        <p className={styles.helperText}>
          {t("settings.publicOnboarding.enableHint")}
        </p>
      </div>

      {enabled && (
        <div className={styles.formGroup}>
          <span className={styles.label}>
            {t("settings.publicOnboarding.flows")}
          </span>
          <p className={styles.helperText}>
            {t("settings.publicOnboarding.flowsHint")}
          </p>

          {publishedCount === 0 && (
            <p className={styles.flowNothingPublished}>
              {t("settings.publicOnboarding.nothingPublished")}
            </p>
          )}

          <div className={styles.flowList}>
            {flows.map((flow, i) => {
              const routeError = flowRouteError(flow.route ?? "", i, flows);
              const isLive = flow.enabled !== false && !routeError;
              const dataspaceOptions = withStale(dataspaces, flow.dataspaceId, () => ({
                id: flow.dataspaceId as string,
                title: flow.dataspaceTitle,
              }));
              const registryOptions = withStale(authRegistries, flow.authRegistryId, () => ({
                id: flow.authRegistryId as string,
                name: flow.authRegistryName,
                url: flow.authRegistryUrl,
              }));
              const selectedAgreements = flow.agreementIds ?? [];
              return (
                <div key={flow.clientKey ?? `route:${flow.route ?? ""}`} className={styles.flowCard}>
                  <p className={styles.flowPublishedAt}>
                    {isLive
                      ? t("settings.publicOnboarding.publishedAt")
                      : t("settings.publicOnboarding.notPublished")}{" "}
                    <code>
                      {origin}/{flow.route ?? ""}
                    </code>
                  </p>
                  <div className={styles.flowRow}>
                    <div className={styles.flowField}>
                      <label className={styles.colorLabel}>
                        {t("settings.publicOnboarding.route")}
                      </label>
                      <div className={styles.flowRouteInput}>
                        <span>/</span>
                        <input
                          type="text"
                          className={styles.input}
                          value={flow.route ?? ""}
                          placeholder={t("settings.publicOnboarding.routePlaceholder")}
                          spellCheck={false}
                          onChange={(e) =>
                            update(i, { route: e.target.value.trim().toLowerCase() })
                          }
                        />
                      </div>
                      {routeError && (
                        <p className={styles.flowError}>
                          {t(`settings.publicOnboarding.routeError.${routeError}`)}
                        </p>
                      )}
                    </div>
                    <div className={styles.flowField}>
                      <label className={styles.colorLabel}>
                        {t("settings.publicOnboarding.flowTitle")}
                      </label>
                      <input
                        type="text"
                        className={styles.input}
                        value={flow.title ?? ""}
                        onChange={(e) => update(i, { title: e.target.value })}
                      />
                    </div>
                    <div className={styles.flowField}>
                      <label className={styles.colorLabel}>
                        {t("settings.publicOnboarding.theme")}
                      </label>
                      <select
                        className={styles.fontSelect}
                        value={flow.themeName ?? ""}
                        onChange={(e) => update(i, { themeName: e.target.value })}
                      >
                        <option value="">
                          {t("settings.theme.library.brandDefault")}
                        </option>
                        {themeNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.flowActions}>
                      <label className={styles.checkboxLabel}>
                        <input
                          type="checkbox"
                          checked={flow.enabled !== false}
                          onChange={(e) => update(i, { enabled: e.target.checked })}
                        />
                        {t("settings.publicOnboarding.flowEnabled")}
                      </label>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => setExpanded(expanded === i ? null : i)}
                      >
                        {expanded === i
                          ? t("settings.publicOnboarding.lessOptions")
                          : t("settings.publicOnboarding.moreOptions")}
                      </button>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => removeFlow(i)}
                      >
                        {t("settings.publicOnboarding.removeFlow")}
                      </button>
                    </div>
                  </div>

                  {expanded === i && (
                    <div className={styles.flowAdvanced}>
                      <div className={styles.flowFieldWide}>
                        <label className={styles.colorLabel}>
                          {t("settings.publicOnboarding.description")}
                        </label>
                        <textarea
                          className={styles.input}
                          rows={2}
                          value={flow.description ?? ""}
                          onChange={(e) => update(i, { description: e.target.value })}
                        />
                      </div>

                      <div className={styles.flowRow}>
                        <div className={styles.flowField}>
                          <label className={styles.colorLabel}>
                            {t("settings.publicOnboarding.dataspace")}
                          </label>
                          <select
                            className={styles.fontSelect}
                            value={flow.dataspaceId ?? ""}
                            onChange={(e) => {
                              const id = e.target.value;
                              const ds = dataspaceOptions.find((d) => d.id === id);
                              update(i, { dataspaceId: id, dataspaceTitle: ds?.title || "" });
                            }}
                          >
                            <option value="">
                              {dataspaceOptions.length
                                ? t("settings.publicOnboarding.inherit")
                                : t("settings.connection.dataspacesEmpty")}
                            </option>
                            {dataspaceOptions.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.title ? `${d.title} (${d.id})` : d.id}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.flowField}>
                          <label className={styles.colorLabel}>
                            {t("settings.publicOnboarding.authRegistry")}
                          </label>
                          <select
                            className={styles.fontSelect}
                            value={flow.authRegistryId ?? ""}
                            onChange={(e) => {
                              const id = e.target.value;
                              const registry = registryOptions.find((r) => r.id === id);
                              update(i, {
                                authRegistryId: id,
                                authRegistryName: registry?.name || "",
                                authRegistryUrl: registry?.url || "",
                              });
                            }}
                          >
                            <option value="">
                              {registryOptions.length
                                ? t("settings.publicOnboarding.inherit")
                                : t("settings.connection.authRegistriesEmpty")}
                            </option>
                            {registryOptions.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name ? `${r.name} (${r.id})` : r.id}
                              </option>
                            ))}
                          </select>
                          {flow.authRegistryId && !flow.authRegistryUrl && (
                            <p className={styles.flowError}>
                              {t("settings.publicOnboarding.authRegistryNoUrl")}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className={styles.flowFieldWide}>
                        <label className={styles.colorLabel}>
                          {t("settings.publicOnboarding.agreements")}
                        </label>
                        <p className={styles.helperText}>
                          {t("settings.publicOnboarding.agreementsHint")}
                        </p>
                        {agreements.length === 0 ? (
                          <p className={styles.helperText}>
                            {t("settings.publicOnboarding.agreementsEmpty")}
                          </p>
                        ) : (
                          <div className={styles.flowCheckList}>
                            {agreements.map((a) => (
                              <label key={a.id} className={styles.checkboxLabel}>
                                <input
                                  type="checkbox"
                                  checked={selectedAgreements.includes(a.id)}
                                  onChange={(e) => toggleAgreement(i, a.id, e.target.checked)}
                                />
                                {a.title}
                                {a.version ? ` (${a.version})` : ""}
                              </label>
                            ))}
                          </div>
                        )}
                        <p className={styles.helperText}>
                          {selectedAgreements.length === 0
                            ? t("settings.publicOnboarding.agreementsAll")
                            : t("settings.publicOnboarding.agreementsSelected", {
                                count: String(selectedAgreements.length),
                              })}
                        </p>
                      </div>

                      <div className={styles.flowRow}>
                        <div className={styles.flowField}>
                          <label className={styles.colorLabel}>
                            {t("settings.onboarding.activeRoles")}
                          </label>
                          <input
                            type="text"
                            className={styles.input}
                            value={flow.activeRoles ?? ""}
                            placeholder={t("settings.publicOnboarding.inherit")}
                            spellCheck={false}
                            onChange={(e) => update(i, { activeRoles: e.target.value })}
                          />
                        </div>
                        <div className={styles.flowField}>
                          <label className={styles.colorLabel}>
                            {t("settings.onboarding.defaultRole")}
                          </label>
                          <select
                            className={styles.fontSelect}
                            value={flow.defaultRole ?? ""}
                            onChange={(e) => update(i, { defaultRole: e.target.value })}
                          >
                            <option value="">
                              {t("settings.publicOnboarding.inherit")}
                            </option>
                            {roleOptions.map((r) => (
                              <option key={r} value={r}>
                                {t(`settings.onboarding.roles.${r}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={styles.flowField}>
                          <label className={styles.colorLabel}>
                            {t("settings.onboarding.skipRoles")}
                          </label>
                          <select
                            className={styles.fontSelect}
                            value={flow.skipRoles ?? ""}
                            onChange={(e) => update(i, { skipRoles: e.target.value })}
                          >
                            <option value="">
                              {t("settings.publicOnboarding.inherit")}
                            </option>
                            <option value="true">
                              {t("settings.publicOnboarding.on")}
                            </option>
                            <option value="false">
                              {t("settings.publicOnboarding.off")}
                            </option>
                          </select>
                        </div>
                        <div className={styles.flowField}>
                          <label className={styles.colorLabel}>
                            {t("settings.onboarding.autoAccept")}
                          </label>
                          <select
                            className={styles.fontSelect}
                            value={flow.autoAcceptProposal ?? ""}
                            onChange={(e) =>
                              update(i, { autoAcceptProposal: e.target.value })
                            }
                          >
                            <option value="">
                              {t("settings.publicOnboarding.inherit")}
                            </option>
                            <option value="true">
                              {t("settings.publicOnboarding.on")}
                            </option>
                            <option value="false">
                              {t("settings.publicOnboarding.off")}
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" className={styles.ghostButton} onClick={() => addFlow()}>
              {t("settings.publicOnboarding.addFlow")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default OnboardingFlowsSettings;
