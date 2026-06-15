import React from "react";
import styles from "./Loading.module.css";

interface LoadingProps {
  /** Optional caption shown beneath the spinner. */
  label?: string;
  /** Spinner diameter in px (default 44). */
  size?: number;
}

// App-wide loading indicator: a smooth, theme-aware ring spinner. Centres itself
// within its container, so callers can drop <Loading /> in directly.
const Loading: React.FC<LoadingProps> = ({ label, size }) => (
  <div className={styles.wrap} role="status" aria-live="polite">
    <span
      className={styles.spinner}
      style={
        size ? ({ "--spinner-size": `${size}px` } as React.CSSProperties) : undefined
      }
      aria-hidden="true"
    />
    {label ? <span className={styles.label}>{label}</span> : null}
    <span className={styles.srOnly}>{label || "Loading…"}</span>
  </div>
);

export default Loading;
