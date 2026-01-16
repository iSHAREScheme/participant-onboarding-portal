import React from "react";

const Loading: React.FC = ({}) => {
  return (
    <img
      src="/resources/img/spinner.gif"
      style={{ width: "100px", margin: "auto", display: "block" }}
      alt="Loading..."
    />
  );
};

export default Loading;
