// Admin editor for public onboarding: the master switch plus the list of
// onboarding flows (route -> theme + per-flow overrides). Rendered on the
// Settings -> Onboarding tab; state is owned by the settings page and saved
// through the normal settings save.
import { useState } from "react";
import styles from "../../styles/Settings.module.css";
import { useLanguage } from "../../context/LanguageContext";
import {
  FLOW_ROUTE_PATTERN,
  RESERVED_FLOW_ROUTES,
  type PublicOnboardingFlow,
} from "config/onboardingFlows";

export type EditableFlow = Omit<PublicOnboardingFlow, "theme">;

interface Props {
  enabled: boolean;
  flows: EditableFlow[];
  themeNames: string[];
  roleOptions: string[];
  onEnabledChange: (enabled: boolean) => void;
  onFlowsChange: (flows: EditableFlow[]) => void;
}

export function flowRouteError(route: string, index: number, flows: EditableFlow[]): string | null {
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
  onEnabledChange,
  onFlowsChange,
}) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState<number | null>(null);

  const update = (index: number, patch: Partial<EditableFlow>) => {
    onFlowsChange(flows.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const addFlow = () => {
    onFlowsChange([
      ...flows,
      { route: "", title: "", themeName: "", enabled: true },
    ]);
    setExpanded(flows.length);
  };

  const removeFlow = (index: number) => {
    onFlowsChange(flows.filter((_, i) => i !== index));
    setExpanded(null);
  };

  return (
    <section className={styles.card} data-tour="public-onboarding">
      <h2 className={styles.cardTitle}>{t("settings.publicOnboarding.title")}</h2>
      <p className={styles.cardHint}>{t("settings.publicOnboarding.hint")}</p>

      <div className={styles.formGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
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

          {flows.map((flow, i) => {
            const routeError = flowRouteError(flow.route ?? "", i, flows);
            return (
              <div key={i} className={styles.card} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <label className={styles.colorLabel}>
                      {t("settings.publicOnboarding.route")}
                    </label>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
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
                      <p className={styles.helperText} style={{ color: "var(--color-error, #b3261e)" }}>
                        {t(`settings.publicOnboarding.routeError.${routeError}`)}
                      </p>
                    )}
                  </div>
                  <div>
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
                  <div>
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

                {expanded === i && (
                  <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                    <div>
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
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <label className={styles.colorLabel}>
                          {t("settings.publicOnboarding.dataspaceId")}
                        </label>
                        <input
                          type="text"
                          className={styles.input}
                          value={flow.dataspaceId ?? ""}
                          placeholder={t("settings.publicOnboarding.inherit")}
                          onChange={(e) => update(i, { dataspaceId: e.target.value })}
                        />
                      </div>
                      <div>
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
                      <div>
                        <label className={styles.colorLabel}>
                          {t("settings.onboarding.defaultRole")}
                        </label>
                        <select
                          className={styles.fontSelect}
                          value={flow.defaultRole ?? ""}
                          onChange={(e) => update(i, { defaultRole: e.target.value })}
                        >
                          <option value="">{t("settings.publicOnboarding.inherit")}</option>
                          {roleOptions.map((r) => (
                            <option key={r} value={r}>
                              {t(`settings.onboarding.roles.${r}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={styles.colorLabel}>
                          {t("settings.onboarding.skipRoles")}
                        </label>
                        <select
                          className={styles.fontSelect}
                          value={flow.skipRoles ?? ""}
                          onChange={(e) => update(i, { skipRoles: e.target.value })}
                        >
                          <option value="">{t("settings.publicOnboarding.inherit")}</option>
                          <option value="true">{t("settings.publicOnboarding.on")}</option>
                          <option value="false">{t("settings.publicOnboarding.off")}</option>
                        </select>
                      </div>
                      <div>
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
                          <option value="">{t("settings.publicOnboarding.inherit")}</option>
                          <option value="true">{t("settings.publicOnboarding.on")}</option>
                          <option value="false">{t("settings.publicOnboarding.off")}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <button type="button" className={styles.ghostButton} onClick={addFlow}>
            {t("settings.publicOnboarding.addFlow")}
          </button>
        </div>
      )}
    </section>
  );
};

export default OnboardingFlowsSettings;
