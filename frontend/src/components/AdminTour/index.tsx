import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { useKeycloak } from "@react-keycloak/web";
import { useLanguage } from "../../context/LanguageContext";
import styles from "styles/components/AdminTour.module.css";

// Bump when the tour content changes so returning admins see the new version once.
const TOUR_VERSION = "v1";
const seenKey = (sub?: string) => `ishare.adminTour.${TOUR_VERSION}.${sub || "anon"}`;

// Event name the account menu dispatches to (re)start the tour on demand.
export const ADMIN_TOUR_START_EVENT = "admin-tour:start";

interface Step {
  // i18n key under `tour.steps.<key>` providing { title, body }.
  key: string;
  // Page this step lives on. The tour navigates here (client-side) before
  // locating the target, so it can walk the admin through every section.
  route?: string;
  // CSS selector of the element to spotlight. Omit for a centred card. When the
  // target is absent/hidden, the step degrades to a centred card so the
  // explanation still shows.
  target?: string;
}

// The guided path: a welcome, then two highlights per admin page (the tour
// navigates between pages itself), then a wrap-up.
const STEPS: Step[] = [
  { key: "welcome" },
  { key: "proposalsList", route: "/admin", target: '[data-tour="proposals-table"]' },
  { key: "proposalsCreate", route: "/admin", target: '[data-tour="proposals-create"]' },
  { key: "participantsList", route: "/participants", target: '[data-tour="participants-table"]' },
  { key: "participantsSearch", route: "/participants", target: '[data-tour="participants-search"]' },
  { key: "usersList", route: "/users", target: '[data-tour="users-table"]' },
  { key: "usersCreate", route: "/users", target: '[data-tour="users-create"]' },
  { key: "settingsTabs", route: "/settings", target: '[data-tour="settings-tabs"]' },
  { key: "finish" },
];

const PAD = 6; // spotlight padding around the target
const POP_W = 340; // popover width used for viewport clamping

// First-time guided tour of the admin portal. Mounted only for admins (gated by
// the Header). Spotlights each main section in the header nav and explains it;
// shows once per admin per browser and can be replayed from the account menu.
const AdminTour: React.FC = () => {
  const { t } = useLanguage();
  const { keycloak } = useKeycloak();
  const router = useRouter();
  const sub = (keycloak?.tokenParsed as Record<string, any> | undefined)?.sub as
    | string
    | undefined;

  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // True while we're navigating to / waiting for a step's target. During this
  // window an opaque cover hides the destination page assembling, so the user
  // never sees pages flash by between steps.
  const [locating, setLocating] = useState(false);

  useEffect(() => setMounted(true), []);

  const finish = useCallback(() => {
    setActive(false);
    try {
      window.localStorage.setItem(seenKey(sub), "1");
    } catch {
      /* storage blocked — the tour simply re-shows next time */
    }
  }, [sub]);

  const go = useCallback(
    (delta: number) => {
      const next = idx + delta;
      if (next < 0) return;
      if (next >= STEPS.length) {
        finish();
        return;
      }
      setIdx(next);
    },
    [idx, finish]
  );

  // Auto-start once per admin, shortly after mount so the header has laid out.
  useEffect(() => {
    if (!mounted || !keycloak?.authenticated) return;
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(seenKey(sub));
    } catch {
      /* ignore */
    }
    if (seen) return;
    const timer = setTimeout(() => {
      setIdx(0);
      setActive(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [mounted, keycloak?.authenticated, sub]);

  // Replay trigger from the account menu.
  useEffect(() => {
    const start = () => {
      setIdx(0);
      setActive(true);
    };
    window.addEventListener(ADMIN_TOUR_START_EVENT, start);
    return () => window.removeEventListener(ADMIN_TOUR_START_EVENT, start);
  }, []);

  // Warm the route bundles when the tour opens so in-tour navigation is instant
  // (prefetch is a no-op in dev; effective in the production build).
  useEffect(() => {
    if (!active) return;
    const seen = new Set<string>();
    STEPS.forEach((s) => {
      if (s.route && !seen.has(s.route)) {
        seen.add(s.route);
        router.prefetch(s.route).catch(() => {});
      }
    });
  }, [active, router]);

  const step = STEPS[idx];

  // Per step: navigate to its page (client-side) if needed, then locate the
  // target — polling, because the page swap and its data fetch are async — and
  // spotlight it. Resize/scroll keep the spotlight aligned. A step with no target,
  // or whose target never appears (e.g. the admin nav behind the closed mobile
  // drawer, which is off-canvas), degrades to a centred card.
  useEffect(() => {
    if (!active) return;

    if (step.route && router.pathname !== step.route) {
      router.push(step.route);
    }

    let cancelled = false;
    let tries = 0;
    const MAX_TRIES = 40; // ~6s at 150ms — covers client nav + data load

    // Measure the target only when it's actually on screen with a real size.
    const measure = (): DOMRect | null => {
      if (!step.target) return null;
      const el = document.querySelector(step.target) as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const onScreen =
        r.width > 0 &&
        r.height > 0 &&
        r.right > 0 &&
        r.bottom > 0 &&
        r.left < window.innerWidth &&
        r.top < window.innerHeight;
      return onScreen ? r : null;
    };

    // Reset while (re)locating. Targeted steps enter the "locating" phase so the
    // opaque cover hides the page until the spotlight is ready; for same-page
    // targets the synchronous locate() below resolves it in the same batch, so no
    // cover ever paints.
    setRect(null);
    setLocating(!!step.target);

    const locate = () => {
      if (cancelled || !step.target) return;
      const r = measure();
      if (r) {
        const el = document.querySelector(step.target) as HTMLElement | null;
        el?.scrollIntoView({ block: "nearest", inline: "nearest" });
        setRect(measure() ?? r); // re-measure after scrolling into view
        setLocating(false);
        return;
      }
      if (tries++ < MAX_TRIES) {
        setTimeout(locate, 150);
      } else {
        setLocating(false); // give up → centred card on the normal dim
      }
    };
    locate();

    const refresh = () => {
      if (cancelled) return;
      const r = measure();
      if (r) setRect(r);
    };
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [active, step, router]);

  // Lock background scroll + wire keyboard navigation while the tour is open.
  useEffect(() => {
    if (!active) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [active, finish, go]);

  // Popover placement: below the spotlighted target, clamped to the viewport.
  const popStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!rect) return undefined; // centred via CSS class
    const margin = 12;
    const left = Math.min(
      Math.max(margin, rect.left),
      window.innerWidth - POP_W - margin
    );
    const top = Math.min(rect.bottom + margin, window.innerHeight - 240);
    return { top, left, width: POP_W };
  }, [rect]);

  if (!mounted || !active) return null;

  const isLast = idx === STEPS.length - 1;
  const tk = (field: string) => t(`tour.steps.${step.key}.${field}`);

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-label={t("tour.aria")}>
      {locating ? (
        // Opaque while navigating/awaiting the target — hides the page assembling.
        <div className={styles.cover} />
      ) : rect ? (
        <div
          className={styles.spotlight}
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className={styles.dim} />
      )}

      <div
        className={`${styles.popover} ${rect ? "" : styles.popoverCentered}`}
        style={popStyle}
      >
        <div className={styles.counter}>
          {t("tour.step", { current: idx + 1, total: STEPS.length })}
        </div>
        <h3 className={styles.title}>{tk("title")}</h3>
        <p className={styles.body}>{tk("body")}</p>
        <div className={styles.footer}>
          <button type="button" className={styles.skip} onClick={finish}>
            {t("tour.skip")}
          </button>
          <div className={styles.actions}>
            {idx > 0 && (
              <button type="button" className={styles.btnGhost} onClick={() => go(-1)}>
                {t("tour.back")}
              </button>
            )}
            <button type="button" className={styles.btnPrimary} onClick={() => go(1)}>
              {isLast ? t("tour.done") : t("tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AdminTour;
