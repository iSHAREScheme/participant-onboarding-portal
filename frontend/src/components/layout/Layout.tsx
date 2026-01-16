import React from "react";
import MyHeader from "./Header";
import Footer from "./Footer";

type LayoutProps = {
  children: React.ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <>
      <MyHeader />
      <main style={{ paddingTop: "120px", paddingBottom: "80px" }}>
        {children}
      </main>
      <Footer />
    </>
  );
};

export default Layout;
