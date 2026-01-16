import React, { createContext, useState, useContext, useEffect } from "react";

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
      if (data.logoPath) {
        // Add timestamp to bust cache and force image reload
        setLogoUrl(`/api/backend/settings/logo?t=${Date.now()}`);
      } else {
        setLogoUrl(null);
      }
    } catch (error) {
      console.error("Failed to fetch logo:", error);
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