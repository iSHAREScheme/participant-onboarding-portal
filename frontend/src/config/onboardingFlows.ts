// Public onboarding flows: one deployment can expose several onboarding entry
// points (base URL and/or named routes like /exampledataspace1), each branded
// by a theme from the theme library. The theme carries the branding assets
// (colors, fonts, header image, favicon), so a theme can serve many flows.
import { applyThemeColors, type ThemeColors } from "config/themeTokens";
import { applyThemeFonts } from "config/fonts";

export interface PublicFlowTheme {
  name?: string;
  colors?: ThemeColors;
  fontHeading?: string;
  fontBody?: string;
  // Asset URLs resolved by the backend (never filesystem paths).
  headerImageUrl?: string;
  faviconUrl?: string;
  [key: string]: unknown;
}

// Public (redacted) view of a configured agreement, as resolved per flow by the
// backend. Structurally a subset of api/client's AgreementView.
export interface PublicFlowAgreement {
  id: string;
  title: string;
  version: string;
  type: string;
  hasDocument: boolean;
}

export interface PublicOnboardingFlow {
  route: string; // "" = the base URL
  title?: string;
  themeName?: string;
  description?: string;
  // Dataspace picked from the registry's dataspaces ("" = inherit).
  dataspaceId?: string;
  dataspaceTitle?: string;
  // Subset of configured agreements to sign; empty = all configured agreements.
  agreementIds?: string[];
  // Resolved by the backend for the public view (never sent by the admin UI).
  agreements?: PublicFlowAgreement[];
  // Authorization registry pinned for this flow ("" = inherit the global prefill).
  authRegistryId?: string;
  authRegistryName?: string;
  authRegistryUrl?: string;
  defaultRole?: string;
  skipRoles?: string;
  activeRoles?: string;
  autoAcceptProposal?: string;
  theme?: PublicFlowTheme;
}

// Mirrors models.ReservedFlowRoutes on the backend (which enforces it); kept
// here so the admin UI can reject reserved routes before a round-trip.
export const RESERVED_FLOW_ROUTES = [
  "admin", "api", "frameworks", "network-health", "organization-access",
  "participants", "party", "profile", "register", "settings", "submit",
  "subscribers", "transfer", "users", "_next", "uploads", "resources",
  "env.js", "favicon.ico", "index", "login", "logout", "onboard",
];

export const FLOW_ROUTE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function findFlow(
  flows: PublicOnboardingFlow[] | undefined,
  route: string
): PublicOnboardingFlow | undefined {
  return (flows ?? []).find((f) => (f.route ?? "") === route);
}

/** Point the tab icon at the given href (shared shape with SettingsContext). */
function setFaviconLink(href: string): void {
  if (typeof document === "undefined") return;
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

// Apply a flow's branding on top of the deployment defaults: theme colors,
// fonts, browser-tab icon and document title. Safe to call with a flow that
// has no theme (no-ops field by field, leaving the global branding in place).
export function applyFlowBranding(flow: PublicOnboardingFlow | undefined): void {
  if (!flow) return;
  if (flow.theme) {
    // Theme-library entry shape: { name, colors: {…}, fontHeading, fontBody }.
    applyThemeColors(flow.theme.colors);
    applyThemeFonts({
      fontHeading: flow.theme.fontHeading,
      fontBody: flow.theme.fontBody,
    });
    if (flow.theme.faviconUrl) {
      setFaviconLink(`${flow.theme.faviconUrl}?t=${Date.now()}`);
    }
  }
  if (flow.title && typeof document !== "undefined") {
    document.title = flow.title;
  }
}
