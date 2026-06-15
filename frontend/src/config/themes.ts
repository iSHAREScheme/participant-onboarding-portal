// Theme configuration for multi-tenant styling
import { BRAND_THEME_COLORS } from "./themeTokens";

export interface ThemeConfig {
  id: string;
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    buttonPrimary: string;
    buttonPrimaryHover: string;
    buttonSecondary: string;
    // Text colors
    textPrimary: string;
    textSecondary: string;
    // Additional UI colors
    borderColor: string;
    errorColor: string;
  };
  fonts?: {
    primary?: string;      // Main font family for body text
    heading?: string;      // Font family for headings
    button?: string;       // Font family for buttons
    fontFaceCSS?: string;  // @font-face CSS definitions
  };
  button?: {
    borderRadius?: string;
    fontSize?: string;
    fontWeight?: string;
    padding?: string;
  };
  // Additional theme properties can be added here
  customCSS?: string;
}

export const themes: Record<string, ThemeConfig> = {
  default: {
    id: 'default',
    name: 'iSHARE Brand (default)',
    // Brand palette, single-sourced from config/themeTokens.ts. Deployment
    // overrides are applied on top at runtime by SettingsContext.
    colors: { ...BRAND_THEME_COLORS },
    // Brand fonts (Montserrat headings/buttons, Lato body). The --font-* vars are
    // defined on :root by _document.tsx; keep stacks in sync with config/fonts.ts.
    fonts: {
      heading: "var(--font-montserrat), 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      primary: "var(--font-lato), 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      button: "var(--font-montserrat), 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    },
    button: {
      borderRadius: '4px',
      fontSize: '15px',
      fontWeight: '550',
      padding: '0.8rem 1.5rem'
    }
  }
};

export const getTheme = (tenantId: string): ThemeConfig => {
  return themes[tenantId] || themes.default;
};

// TODO: Implement subdomain detection to automatically determine tenant
// This function will be implemented later to extract tenant from subdomain
export const getTenantFromSubdomain = (): string => {
  // Placeholder implementation - returns 'default' for now
  // TODO: Extract subdomain from window.location.hostname
  // Example: client1.example.com -> 'client1'
  return 'default';
};

export const getCurrentTheme = (): ThemeConfig => {
  const tenantId = getTenantFromSubdomain();
  return getTheme(tenantId);
};
