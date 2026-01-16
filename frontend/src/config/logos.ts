// Logo configuration for multi-tenant branding
export interface LogoConfig {
  main: string;          // Primary logo (used in header)
  icon?: string;         // Icon/favicon version
  alt: string;           // Alt text for accessibility
  height?: number;       // Default height in pixels
  width?: number;        // Default width in pixels
}


// Default fallback logo configuration
const defaultLogo: LogoConfig = {
  main: '/resources/img/logo-mark.png',
  alt: 'Default Logo',
  height: 80
};


//Get logo configuration for a specific tenant
export const getLogoConfig = (tenantId: string): LogoConfig => {
  return defaultLogo;
};


//Get the main logo path for a tenant
export const getLogoPath = (tenantId: string): string => {
  const config = getLogoConfig(tenantId);
  return config.main;
};


export const getIconPath = (tenantId: string): string => {
  const config = getLogoConfig(tenantId);
  return config.icon || config.main;
};


export const getLogoAlt = (tenantId: string): string => {
  const config = getLogoConfig(tenantId);
  return config.alt;
};

// TODO: Implement subdomain detection to automatically determine tenant
// This function will be implemented later to extract tenant from subdomain
const getTenantFromSubdomain = (): string => {
  // Placeholder implementation - returns 'default' for now
  // TODO: Extract subdomain from window.location.hostname
  // Example: client1.example.com -> 'client1'
  return 'default';
};

/**
 * Get current tenant's logo configuration based on subdomain
 * @returns LogoConfig object for the current tenant
 */
export const getCurrentLogo = (): LogoConfig => {
  const tenantId = getTenantFromSubdomain();
  return getLogoConfig(tenantId);
};

/**
 * Get current tenant's main logo path
 * @returns String path to current tenant's main logo
 */
export const getCurrentLogoPath = (): string => {
  const tenantId = getTenantFromSubdomain();
  return getLogoPath(tenantId);
};
