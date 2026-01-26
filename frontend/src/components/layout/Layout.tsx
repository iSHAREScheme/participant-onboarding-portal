import React from "react";
import MyHeader from "./Header";
import Footer from "./Footer";
import styles from "styles/components/Layout.module.css";

type LayoutProps = {
  children: React.ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <>
      <MyHeader />
      <div className={styles.page}>
        <main className={styles.main}>{children}</main>
        <Footer />
      </div>
    </>
  );
};

export default Layout;
