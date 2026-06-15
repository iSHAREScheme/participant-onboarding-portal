// Curated web fonts a deployment can pick from in Settings → Theme.
//
// Fonts are self-hosted via next/font (no external requests). Each exposes a CSS
// variable; `fontVariablesClassName` is applied to <html> in _document.tsx so the
// variables live on :root. The brand defaults are Montserrat (headings/buttons) +
// Lato (body) per design-conventions.md §3. A deployment's choice is persisted in
// the same settings `theme` JSON (fontHeading / fontBody) and applied for every
// visitor by SettingsContext.
//
// Note: next/font requires literal weights. Lato only ships 100/300/400/700/900
// (no 500/600) — keep weight lists valid per family.
import {
  Montserrat,
  Lato,
  Inter,
  Poppins,
  Roboto,
  Open_Sans,
} from "next/font/google";

export const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});
export const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});
export const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});
export const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});
export const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-open-sans",
  display: "swap",
});

/** Apply to <html> in _document.tsx to expose every --font-* variable on :root. */
export const fontVariablesClassName = [
  montserrat,
  lato,
  inter,
  poppins,
  roboto,
  openSans,
].map((f) => f.variable).join(" ");

const SANS_FALLBACK = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SYSTEM_STACK =
  "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface FontOption {
  key: string;
  label: string;
  /** Full font-family stack, referencing the loaded font's CSS variable. */
  stack: string;
}

// Order shown in the dropdowns. `key` is the persisted value.
export const FONT_OPTIONS: FontOption[] = [
  { key: "montserrat", label: "Montserrat", stack: `var(--font-montserrat), ${SANS_FALLBACK}` },
  { key: "lato", label: "Lato", stack: `var(--font-lato), ${SANS_FALLBACK}` },
  { key: "inter", label: "Inter", stack: `var(--font-inter), ${SANS_FALLBACK}` },
  { key: "poppins", label: "Poppins", stack: `var(--font-poppins), ${SANS_FALLBACK}` },
  { key: "roboto", label: "Roboto", stack: `var(--font-roboto), ${SANS_FALLBACK}` },
  { key: "openSans", label: "Open Sans", stack: `var(--font-open-sans), ${SANS_FALLBACK}` },
  { key: "system", label: "System default", stack: SYSTEM_STACK },
];

export type ThemeFontField = "fontHeading" | "fontBody";
export interface ThemeFonts {
  fontHeading?: string;
  fontBody?: string;
}

export const DEFAULT_FONT_HEADING = "montserrat";
export const DEFAULT_FONT_BODY = "lato";

const OPTION_BY_KEY = new Map(FONT_OPTIONS.map((o) => [o.key, o]));

/** Brand font stacks (keep in sync with variables.css + themes.ts default.fonts). */
export const BRAND_FONT_HEADING_STACK = OPTION_BY_KEY.get(DEFAULT_FONT_HEADING)!.stack;
export const BRAND_FONT_BODY_STACK = OPTION_BY_KEY.get(DEFAULT_FONT_BODY)!.stack;

export function fontStackByKey(key: string | undefined): string | undefined {
  return key ? OPTION_BY_KEY.get(key)?.stack : undefined;
}

export function isFontKey(key: unknown): key is string {
  return typeof key === "string" && OPTION_BY_KEY.has(key);
}

/** Fresh copy of the brand font selection (for editor state / reset). */
export function brandFonts(): { fontHeading: string; fontBody: string } {
  return { fontHeading: DEFAULT_FONT_HEADING, fontBody: DEFAULT_FONT_BODY };
}

/**
 * Apply font choices to document root. Headings + buttons follow the heading
 * font, body text follows the body font. Unknown keys are ignored (falling back
 * to the :root brand defaults). No-ops during SSR / with a null map.
 */
export function applyThemeFonts(fonts: ThemeFonts | null | undefined): void {
  if (typeof document === "undefined" || !fonts) return;
  const root = document.documentElement;
  const heading = fontStackByKey(fonts.fontHeading);
  const body = fontStackByKey(fonts.fontBody);
  if (heading) {
    root.style.setProperty("--font-heading", heading);
    root.style.setProperty("--font-button", heading);
  }
  if (body) {
    root.style.setProperty("--font-primary", body);
  }
}
