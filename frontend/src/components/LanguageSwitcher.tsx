import React from "react";
import { useLanguage } from "../context/LanguageContext";
import styles from "styles/components/LanguageSwitcher.module.css";

const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLang = e.target.value as "en" | "nl";
    setLanguage(newLang);
  };

  return (
    <select
      value={language}
      onChange={handleLanguageChange}
      className={styles.languageSelect}
    >
      <option value="en">EN</option>
      <option value="nl">NL</option>
    </select>
  );
};

export default LanguageSwitcher;
