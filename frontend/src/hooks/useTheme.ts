import { useEffect, useState } from 'react';
import { ThemeConfig, getCurrentTheme } from '../config/themes';
import { LogoConfig, getCurrentLogo } from '../config/logos';

interface UseThemeReturn {
  theme: ThemeConfig;
  logo: LogoConfig;
  tenantId: string;
  applyTheme: (themeId: string) => void;
}

/**
 * Custom hook for managing multi-tenant theming
 * Provides current theme, logo configuration, and theme switching functionality
 */
export const useTheme = (): UseThemeReturn => {
  const [tenantId] = useState<string>('demo');
  const [theme, setTheme] = useState<ThemeConfig>(getCurrentTheme());
  const [logo] = useState<LogoConfig>(getCurrentLogo());

  // Apply CSS custom properties to document root
  const applyCSSVariables = (themeConfig: ThemeConfig) => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      
      // Apply theme colors as CSS custom properties
      root.style.setProperty('--primary-color', themeConfig.colors.primary);
      root.style.setProperty('--secondary-color', themeConfig.colors.secondary);
      root.style.setProperty('--accent-color', themeConfig.colors.accent);
      root.style.setProperty('--background-color', themeConfig.colors.background);
      root.style.setProperty('--button-primary', themeConfig.colors.buttonPrimary);
      root.style.setProperty('--button-primary-hover', themeConfig.colors.buttonPrimaryHover);
      root.style.setProperty('--button-secondary', themeConfig.colors.buttonSecondary);
      
      // Apply text colors from theme
      root.style.setProperty('--text-primary', themeConfig.colors.textPrimary);
      root.style.setProperty('--text-secondary', themeConfig.colors.textSecondary);
      
      // Apply additional UI colors
      root.style.setProperty('--border-color', themeConfig.colors.borderColor);
      root.style.setProperty('--error-color', themeConfig.colors.errorColor);
      
      // Apply button styling properties if defined
      if (themeConfig.button) {
        if (themeConfig.button.borderRadius) root.style.setProperty('--button-border-radius', themeConfig.button.borderRadius);
        if (themeConfig.button.fontSize) root.style.setProperty('--button-font-size', themeConfig.button.fontSize);
        if (themeConfig.button.fontWeight) root.style.setProperty('--button-font-weight', themeConfig.button.fontWeight);
        if (themeConfig.button.padding) root.style.setProperty('--button-padding', themeConfig.button.padding);
      }
      
      // Apply font properties with fallback to defaults
      if (themeConfig.fonts) {
        // Set primary font with fallback
        const primaryFont = themeConfig.fonts.primary || 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        root.style.setProperty('--font-primary', primaryFont);
        
        // Set heading font with fallback to primary font
        const headingFont = themeConfig.fonts.heading || themeConfig.fonts.primary || 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        root.style.setProperty('--font-heading', headingFont);
        
        // Set button font with fallback to primary font
        const buttonFont = themeConfig.fonts.button || themeConfig.fonts.primary || 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        root.style.setProperty('--font-button', buttonFont);
        
        // Inject custom font-face CSS if provided
        if (themeConfig.fonts.fontFaceCSS) {
          let fontStyleElement = document.getElementById('theme-font-faces');
          if (!fontStyleElement) {
            fontStyleElement = document.createElement('style');
            fontStyleElement.id = 'theme-font-faces';
            document.head.appendChild(fontStyleElement);
          }
          fontStyleElement.textContent = themeConfig.fonts.fontFaceCSS;
        }
      } else {
        // Set default fonts when no font configuration is provided
        root.style.setProperty('--font-primary', 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        root.style.setProperty('--font-heading', 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
        root.style.setProperty('--font-button', 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
      }
      
      root.setAttribute('data-theme', themeConfig.id);
    }
  };

  // Apply the resolved theme's CSS custom properties to <html> on mount. The
  // tenant/theme/logo resolvers are deterministic and SSR-safe, so those values are
  // derived once in the initial state above rather than re-synced here via setState.
  useEffect(() => {
    applyCSSVariables(getCurrentTheme());
  }, []);

  // Function to manually apply a different theme (useful for testing)
  const applyTheme = (_themeId: string) => {
    const newTheme = getCurrentTheme();
    setTheme(newTheme);
    applyCSSVariables(newTheme);
  };

  return {
    theme,
    logo,
    tenantId,
    applyTheme
  };
};