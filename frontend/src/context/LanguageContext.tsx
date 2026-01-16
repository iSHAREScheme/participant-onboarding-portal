import React, { createContext, useState, useContext, useEffect } from "react";
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

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const savedLanguage = localStorage.getItem("language") as Language;
    if (savedLanguage) {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);
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
