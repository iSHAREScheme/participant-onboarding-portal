import React from "react";
import styles from "styles/components/Footer.module.css";

const Footer: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div
          className={styles.iSHARELogo}
          onClick={() => window.open("https://ishare.eu", "_blank")}
        ></div>
      </div>
    </footer>
  );
};

export default Footer;
