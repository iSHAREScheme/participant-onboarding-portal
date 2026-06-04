// Single source of truth for the editable theme colours.
//
// Defaults are the iSHARE brand palette (see /design-conventions.md §11). A
// deployment can override any of these from Settings → Theme; the overrides are
// persisted server-side (models.Settings.theme) and applied for every visitor by
// SettingsContext. `variables.css :root` carries the same defaults for first
// paint (before JS runs), and `themes.ts` builds its default theme from
// BRAND_THEME_COLORS — so all three stay in sync from this one list.

export type ThemeColorKey =
  | "primary"
  | "secondary"
  | "accent"
  | "buttonPrimary"
  | "buttonPrimaryHover"
  | "buttonSecondary"
  | "textPrimary"
  | "textSecondary"
  | "background"
  | "borderColor"
  | "errorColor";

export type ThemeColors = Partial<Record<ThemeColorKey, string>>;

export type ThemeColorGroup = "brand" | "buttons" | "text" | "surface";

export interface ThemeColorToken {
  key: ThemeColorKey;
  /** CSS custom property this token drives (must match useTheme/variables.css). */
  cssVar: string;
  group: ThemeColorGroup;
  /** Brand-aligned default value. */
  brandDefault: string;
}

// Order here is the order shown in the editor. `key` doubles as the i18n suffix
// (settings.theme.tokens.<key>) and the persisted JSON key.
export const THEME_COLOR_TOKENS: ThemeColorToken[] = [
  { key: "primary", cssVar: "--primary-color", group: "brand", brandDefault: "#61265E" },
  { key: "secondary", cssVar: "--secondary-color", group: "brand", brandDefault: "#8E3459" },
  { key: "accent", cssVar: "--accent-color", group: "brand", brandDefault: "#EF7B66" },
  { key: "buttonPrimary", cssVar: "--button-primary", group: "buttons", brandDefault: "#EB5E55" },
  { key: "buttonPrimaryHover", cssVar: "--button-primary-hover", group: "buttons", brandDefault: "#C84152" },
  { key: "buttonSecondary", cssVar: "--button-secondary", group: "buttons", brandDefault: "#8E3459" },
  { key: "textPrimary", cssVar: "--text-primary", group: "text", brandDefault: "#291D28" },
  { key: "textSecondary", cssVar: "--text-secondary", group: "text", brandDefault: "#61265E" },
  { key: "background", cssVar: "--background-color", group: "surface", brandDefault: "#F8F7F4" },
  { key: "borderColor", cssVar: "--border-color", group: "surface", brandDefault: "#D4D2D4" },
  { key: "errorColor", cssVar: "--error-color", group: "surface", brandDefault: "#C84152" },
];

/** Groups in display order. */
export const THEME_COLOR_GROUPS: ThemeColorGroup[] = ["brand", "buttons", "text", "surface"];

/** Full brand colour map; keys match config/themes.ts ThemeConfig.colors. */
export const BRAND_THEME_COLORS: Record<ThemeColorKey, string> = THEME_COLOR_TOKENS.reduce(
  (acc, token) => {
    acc[token.key] = token.brandDefault;
    return acc;
  },
  {} as Record<ThemeColorKey, string>
);

/** A fresh, mutable copy of the brand defaults (for editor state / reset). */
export function brandThemeColors(): Record<ThemeColorKey, string> {
  return { ...BRAND_THEME_COLORS };
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidHex(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value.trim());
}

/**
 * Apply colour overrides to the document root as CSS custom properties. Only
 * valid hex values are applied — anything else is left to fall back to the
 * `:root` brand defaults. No-ops during SSR or with a null/empty map.
 */
export function applyThemeColors(colors: ThemeColors | null | undefined): void {
  if (typeof document === "undefined" || !colors) return;
  const root = document.documentElement;
  for (const token of THEME_COLOR_TOKENS) {
    const value = colors[token.key];
    if (isValidHex(value)) {
      root.style.setProperty(token.cssVar, value.trim());
    }
  }
}
