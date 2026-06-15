import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "../styles/Toast.module.css";

export type ToastKind = "success" | "error" | "info";

interface ToastData {
  id: number;
  kind: ToastKind;
  text: string;
  duration: number;
}

interface ToastApi {
  show: (kind: ToastKind, text: string, durationMs?: number) => void;
  success: (text: string, durationMs?: number) => void;
  error: (text: string, durationMs?: number) => void;
  info: (text: string, durationMs?: number) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

// Errors linger a little longer than success/info so users can read them.
const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6000;
const EXIT_MS = 200; // must match the toastOut animation in Toast.module.css

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="100%" height="100%">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="100%" height="100%">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16h.01" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="100%" height="100%">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  ),
};

// A single toast: animates in, auto-dismisses after its duration, and animates
// out on expiry or click. Removal is timer-driven (not animationend) so it also
// works under prefers-reduced-motion.
function ToastItem({
  toast,
  onRemove,
}: {
  toast: ToastData;
  onRemove: (id: number) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  // Keep a ref to the latest onRemove so the dismiss timer always calls the current
  // handler. Updating ref.current in an effect (not during render) satisfies
  // react-hooks/refs; the timer fires after commit, so the ref is current by then.
  const onRemoveRef = useRef(onRemove);
  useEffect(() => {
    onRemoveRef.current = onRemove;
  });

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => onRemoveRef.current(toast.id), EXIT_MS);
  }, [toast.id]);

  useEffect(() => {
    const timer = window.setTimeout(close, toast.duration);
    return () => window.clearTimeout(timer);
  }, [close, toast.duration]);

  return (
    <div
      className={`${styles.toast} ${styles[toast.kind]} ${leaving ? styles.leaving : ""}`}
      role={toast.kind === "error" ? "alert" : "status"}
      onClick={close}
    >
      <span className={styles.icon}>{ICONS[toast.kind]}</span>
      <span className={styles.text}>{toast.text}</span>
      <button
        type="button"
        className={styles.close}
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
      >
        ×
      </button>
    </div>
  );
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (kind: ToastKind, text: string, durationMs?: number) => {
      const trimmed = (text ?? "").toString().trim();
      if (!trimmed) return;
      const id = ++idRef.current;
      const duration =
        durationMs ?? (kind === "error" ? ERROR_DURATION : DEFAULT_DURATION);
      setToasts((prev) => [...prev, { id, kind, text: trimmed, duration }]);
    },
    []
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (text, d) => show("success", text, d),
      error: (text, d) => show("error", text, d),
      info: (text, d) => show("info", text, d),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.container} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// Access the toast API. Must be used within <ToastProvider>.
export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
};
