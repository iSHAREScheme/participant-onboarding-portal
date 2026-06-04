import React, { createContext, useState, useContext, useEffect } from "react";
import { applyThemeColors } from "config/themeTokens";
import { applyThemeFonts } from "config/fonts";

// The iSHARE default browser-tab icon, used when a deployment hasn't uploaded one.
const DEFAULT_FAVICON = "/resources/img/logo-mark.png";

/** Point the <link rel="icon"> at the given href, creating the link if needed. */
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

interface SettingsContextType {
  logoUrl: string | null;
  updateLogo: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const updateLogo = async () => {
    try {
      const response = await fetch("/api/backend/settings");
      const data = await response.json();
      // Apply the deployment's saved colour + font overrides for every visitor.
      // Until this resolves, the brand defaults from variables.css :root are shown.
      applyThemeColors(data?.theme);
      applyThemeFonts(data?.theme);
      // Swap the browser-tab icon to the deployment's favicon, or the iSHARE default.
      setFaviconLink(
        data?.faviconPath
          ? `/api/backend/settings/favicon?t=${Date.now()}`
          : DEFAULT_FAVICON
      );
      if (data.logoPath) {
        // Add timestamp to bust cache and force image reload
        setLogoUrl(`/api/backend/settings/logo?t=${Date.now()}`);
      } else {
        setLogoUrl(null);
      }
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      setLogoUrl(null);
    }
  };

  useEffect(() => {
    updateLogo();
  }, []);

  return (
    <SettingsContext.Provider value={{ logoUrl, updateLogo }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};