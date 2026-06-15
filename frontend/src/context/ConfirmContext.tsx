import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "../styles/ConfirmDialog.module.css";

export interface ConfirmOptions {
  /** Optional heading. */
  title?: string;
  /** The question / body text. */
  message: string;
  /** Confirm button label (defaults to "Confirm"). */
  confirmLabel?: string;
  /** Cancel button label (defaults to "Cancel"). */
  cancelLabel?: string;
  /** Render the confirm button in a destructive (red) style. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

// Promise-based confirmation dialog: `await confirm({...})` resolves true when
// the user confirms, false when they cancel / dismiss. A single dialog shows at
// a time (modal). Replaces window.confirm with a themed, accessible popup.
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions(opts);
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    setOptions(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  }, []);

  // While open: focus the confirm button and wire Escape (cancel) / Enter (confirm).
  useEffect(() => {
    if (!options) return;
    confirmButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <div className={styles.overlay} onMouseDown={() => settle(false)}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label={options.title || options.message}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {options.title && <h3 className={styles.title}>{options.title}</h3>}
            <p className={styles.message}>{options.message}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancel}
                onClick={() => settle(false)}
              >
                {options.cancelLabel || "Cancel"}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className={`${styles.confirm} ${options.danger ? styles.danger : ""}`}
                onClick={() => settle(true)}
              >
                {options.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

// Access the confirm() function. Must be used within <ConfirmProvider>.
export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
};
