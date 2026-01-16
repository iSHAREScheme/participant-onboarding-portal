// Theme configuration for multi-tenant styling
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
    name: 'Default Theme (Current Colors)',
    colors: {
      primary: '#61365E',
      secondary: '#003145',
      accent: '#004C6C',
      background: '#F8F7F4',
      buttonPrimary: '#0088cc',
      buttonPrimaryHover: '#006699'
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
