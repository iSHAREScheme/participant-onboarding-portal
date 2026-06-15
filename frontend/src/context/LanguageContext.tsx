import React, { createContext, useContext, useSyncExternalStore } from "react";
import en from "../locales/en";
import nl from "../locales/nl";

type Language = "en" | "nl";
type Translations = typeof en;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, variables?: Record<string, string | number>) => string;
}

const translations = {
  en,
  nl,
};

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined
);

const LANGUAGE_STORAGE_KEY = "language";

// The selected language is persisted in localStorage so it survives reloads. It is
// read through useSyncExternalStore (rather than useState + a mount effect) so the
// server snapshot ("en") and the client snapshot stay consistent: this avoids a
// hydration mismatch and keeps setState out of an effect (react-hooks/set-state-in-effect).
const languageListeners = new Set<() => void>();

function subscribeLanguage(callback: () => void): () => void {
  languageListeners.add(callback);
  // Reflect changes made in other tabs as well.
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    languageListeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getLanguageSnapshot(): Language {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return saved === "nl" || saved === "en" ? saved : "en";
}

function getServerLanguageSnapshot(): Language {
  return "en";
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const language = useSyncExternalStore(
    subscribeLanguage,
    getLanguageSnapshot,
    getServerLanguageSnapshot
  );

  const setLanguage = (lang: Language) => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    // The native "storage" event only fires in other tabs, so notify this tab too.
    languageListeners.forEach((listener) => listener());
  };

  const t = (
    key: string,
    variables?: Record<string, string | number>
  ): string => {
    try {
      const keys = key.split(".");
      let value: any = translations[language];

      for (const k of keys) {
        value = value?.[k];
      }

      if (value === undefined) {
        console.warn(`Translation key not found: ${key}`);
        return key;
      }

      if (variables) {
        const interpolated = value.replace(
          /\{\{(\w+)\}\}/g,
          (match: string, varKey: string) => {
            const replacement = variables[varKey]?.toString();
            return replacement || match;
          }
        );

        return interpolated;
      }

      return value;
    } catch (error) {
      console.error(`Error getting translation for key: ${key}`, error);
      return key;
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
