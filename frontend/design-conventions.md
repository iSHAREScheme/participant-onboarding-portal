# Design Conventions

Design and content conventions for the iSHARE onboarding portal, derived from the
**2026 iSHARE Foundation Brand Book — Brand Guidelines v4.0** (`/2026 iSHARE Foundation
Brand Book.pdf` in the repo root).

The PDF is the authoritative source for anything visual that isn't captured here (logo
artwork, icon set, photography treatment). This document translates its rules into
concrete conventions for the frontend (Next.js + CSS Modules + CSS custom properties),
UI copy, and docs.

> **Status:** the current theme (`src/styles/variables.css`, `src/config/themes.ts`) is
> largely **off-brand** (blue/teal palette, Inter/system fonts). See
> [§10 Gap analysis & implementation checklist](#10-gap-analysis--implementation-checklist)
> for what to change. Until that lands, treat this document as the target, not the
> current state.

---

## 1. Brand foundation

These shape tone and emphasis; they're context for the visual rules below.

- **Personality:** vibrant, optimistic, reliable. Keep it *simple, bold, and always in
  the spirit of iSHARE*.
- **Mission:** empower people and organisations to have full control over their data and
  enable secure, trusted data sharing.
- **Vision:** establish the iSHARE Trust Framework as a global, interoperable standard for
  data sharing and data autonomy.
- **Core promise:** enabling trustworthy and standardised data sharing across sectors and
  borders.
- **Positioning:** the trusted non-profit steward of open-source solutions for data spaces.
- **Values:** Transparency · Reliability · Fairness · Autonomy · Openness · Interoperability.

---

## 2. Colour

The palette is a warm gradient running from coral through red and pink to deep purple,
plus a single yellow attention accent and a neutral grey scale.

### 2.1 Primary palette (the gradient — lightest → darkest)

| Swatch | Hex | Role | Use as text? | Usage |
|---|---|---|---|---|
| 🟧 | `#EF7B66` | Accent | **No** | Accent / highlight fills only |
| 🟥 | `#EB5E55` | **CTA background** | **No** | Primary button / call-to-action fills |
| 🟥 | `#C84152` | Secondary accent | **No** | Accent fills, highlights |
| 🟪 | `#AC3A58` | Tertiary title | Yes (titles) | Title text; inverted → background with white text |
| 🟪 | `#8E3459` | Secondary title | Yes (titles) | Title text; inverted → background with white text |
| 🟪 | `#61265E` | **Main title / brand purple** | Yes (titles **+** body) | Primary title text, body text on light; background with white text |

**The text rule (important):** only the **three darkest** (`#AC3A58`, `#8E3459`,
`#61265E`) may be used as **text**. The lighter warm tones (`#EF7B66`, `#EB5E55`,
`#C84152`) and the yellow are **fills/highlights only — never running text.**

The gradient may use all six colours or the four darkest shades. As a linear gradient,
order **lightest → darkest** (see §5 Rainbow Bar for direction).

### 2.2 Attention accent (standalone)

| Swatch | Hex | Role | Use as text? | Usage |
|---|---|---|---|---|
| 🟨 | `#FEC44B` | Attention accent | **No** | Draw the eye to one specific element. Sparingly. |

### 2.3 Neutral / text greys (on white backgrounds)

| Shade | Hex | Usage |
|---|---|---|
| 100% | `#291D28` | Primary body text (near-black, slightly purple) |
| 80% | `#544B53` | Subtext / secondary text |
| 60% | `#686169` | Subtext / secondary text |
| 40% | `#AAA5A9` | Separator lines between tables/sections |
| 20% | `#D4D2D4` | Separator lines, borders |
| 10% | `#E9E8E9` | Background fills / subtle design elements |

### 2.4 The 60-30-10 rule

Balance every composition as **60% primary / 30% secondary / 10% accent**:

- **60% primary** — dominant surface: white / very light neutral (iSHARE "uses lots of
  white").
- **30% secondary** — brand purples for structure (titles, headers, key panels).
- **10% accent** — coral / red / yellow for CTAs and emphasis only.

Accents are 10% for a reason: a portal screen should read as mostly white with purple
structure and small bursts of warm colour, not a wall of red.

### 2.5 Accessibility (WCAG) — house rule on top of the brand

The warm palette is low-contrast on white. To stay AA-compliant **and** on-brand:

- **Body & UI text:** use `#291D28` (100% grey) or brand purple `#61265E` on light
  surfaces; **white** on dark/coloured surfaces. Both clear 4.5:1.
- **Titles/headings:** prefer the darker three; if you must place a heading on a coloured
  fill, use white text.
- **CTAs:** `#EB5E55` is the brand CTA fill, but white text on it is only ~3:1 — acceptable
  for large/bold button labels, **not** for small text. Use a darker shade (`#C84152` or
  `#AC3A58`) for hover/active and for any CTA carrying small text, and verify each
  combination at <https://webaim.org/resources/contrastchecker/>.
- Never rely on colour alone to convey state — pair status colours with text/icons (the
  participants/proposals status pills already do this).

---

## 3. Typography

### 3.1 Families & roles

| Family | Role | Weights |
|---|---|---|
| **Montserrat** | Headings, titles, one-liners, **buttons** | Regular, Italic, Bold |
| **Lato** | **Body text** (default) | Regular, Italic, Bold |
| **Arial** | Letters & e-mail messages, and as the system fallback | Regular, Italic, Bold |

- Body text is **Lato Regular** by default; use **Lato Bold** to highlight a word/sentence.
- Headings/titles/buttons are **Montserrat** (weight varies bold ↔ regular by context).

### 3.2 Hierarchy

The brand book gives reference sizes per *brand canvas* (presentations, social, etc.) —
e.g. "Common Web" headings at 100 pt. Those are large-format display sizes, **not** an
application UI scale. For the portal UI, apply the brand's **font/weight/colour rules**
with a web-appropriate rem scale:

| Level | Font / weight | Size (rem / px) | Colour |
|---|---|---|---|
| Page heading (h1) | Montserrat Bold | 1.75–2rem (28–32px) | brand purple or one of the darker three |
| Section title (h2) | Montserrat Bold | 1.375–1.5rem (22–24px) | brand purple / dark three |
| Subtitle (h3) | Lato Bold (or Montserrat) | 1.125–1.25rem (18–20px) | brand purple / dark three |
| Body | Lato Regular | 1rem (16px) | `#291D28` or `#61265E` |
| Subtext / caption | Lato Regular | 0.875rem (14px) | 60–80% grey |

Keep line spacing generous enough for comfortable reading (the brand calls out line
spacing explicitly for clarity).

### 3.3 Placement & colour rules

- **Alignment:** all text — headings, titles, subtitles, body — is **left-aligned**.
- **Body colour:** black/`#291D28` or brand purple on light; **white** on dark.
- **Highlighted text:** Lato or Arial **Bold** in any of the six brand colours (mind §2.5
  contrast).
- **Headings/titles/subtitles:** may use any of the six brand colours; **white** on a
  coloured background.

---

## 4. Logo

Artwork lives with the brand assets — these are the placement rules.

- **Variants:** the **vertical** full-colour logo is the **main** version. Use the
  **horizontal** full-colour logo when vertical doesn't fit. **Black** or **white
  (diapositive)** variants only in the specific situations the brand book allows.
- **Clear space:** always leave white space all around equal to **twice the gap between
  the visual mark and the wordmark** — at all times, even when space is tight.
- **Minimum size:** never smaller than **15 mm** (≈ 57px @96dpi) so the colour transitions
  stay legible. On web, don't render the mark below ~40–48px tall.
- **Do:** place on **white / very light** backgrounds; use the **white** version on
  **dark/black** backgrounds.
- **Don't:** place the full-colour logo on a palette colour; place the logo on a
  photo/image; alter, recolour, or distort it.
- Need another format (e.g. SVG)? Request it from **info@ishare.eu** — don't recreate it.

**In this project:** logo configuration is `src/config/logos.ts` (consumed via
`useTheme()`); the header renders it. Respect clear-space with padding and keep the header
background white (`--header-background: #ffffff`, already correct).

---

## 5. Graphic elements

Two recurring devices. Both are decorative — use sparingly in an admin portal and never
let them reduce legibility.

### 5.1 The Rainbow Bar

- The six palette colours as horizontal bars/stripes.
- **Always horizontal (landscape), ordered lightest → darkest** (`#EF7B66` → `#61265E`).
  If vertical is unavoidable, stack lightest **top** → darkest **bottom**.
- Brand reference sizes: social posts 28.6px × 1200px (top); infographics 21.4px ×
  801.2px (top & bottom). In-app, treat it as a thin accent rule, not a chunky band.
- CSS starting point for a thin top accent:

  ```css
  .rainbowBar {
    height: 4px;
    background: linear-gradient(
      90deg,
      #EF7B66, #EB5E55, #C84152, #AC3A58, #8E3459, #61265E
    );
  }
  ```

> The six gradient colours are the warm-purple set above; the yellow `#FEC44B` is a
> separate accent and is **not** part of the bar. The logo itself "consists of 6 colours" —
> if the official logo's stripes differ from this list, defer to the logo asset.

### 5.2 Dumbbells / Datapoints

- Recurring "dumbbell" shapes used as subtle background accents.
- Render in **light grey (5/10/20%)** on white; when behind text keep opacity **~5%**.
- As decorative background motifs keep them at **~20% opacity on the bottom layer** so they
  never overlap or compete with content. May be flipped/resized.

---

## 6. Layout, grid & spacing

- **Grid:** brand layouts use a canvas-sized grid (e.g. Common Web 1920×1080 → 120px main
  grid, 2 subdivisions). For the app, keep a consistent spacing scale and generous
  alignment rather than a literal 120px grid.
- **Canvas border:** maintain a clear margin of negative space around the whole canvas
  (¾–1 grid column); no text/icons in it. → In-app: keep comfortable page padding
  (`--container-padding`) and don't let content touch the viewport edges.
- **Spacing between text elements:** between any heading/title/subtitle/body, leave **1–2
  grid columns** of space — i.e. clear, consistent vertical rhythm; never cramped.
- **Lots of white** is on-brand — favour whitespace over dense layouts.

**Suggested spacing scale** (4px base) for new CSS: `4, 8, 12, 16, 24, 32, 48, 64`px.
Reuse the existing `--container-padding` and `--border-radius` tokens.

---

## 7. Photography & imagery

- **Corporate & professional:** business settings, people in (semi-)formal clothing; high
  quality. Event photos of the team are fine.
- **Reliability & transparency:** use **lots of white**; subtle orange/red/purple tones are
  welcome and may be enhanced with a slight warm colour filter.
- **No black & white** — it doesn't convey "vibrant and optimistic". Avoid greyscale photos.
- Blue tones aren't in the palette; shift them toward purple if an otherwise-good image has
  them.

---

## 8. Iconography

- iSHARE has a **branded icon set** for framework roles/terms (Entitled Party, Adhering
  Party, Authorisation Registry, Participant Registry, Identity Provider, Data Space
  Connector, Verifiable Credentials, etc.).
- Because the terms are domain-specific, **icons must always be accompanied by their label**
  — in a legend, in explanatory text, or directly beneath the icon. Never use a branded role
  icon alone.
- Prefer the official set for these concepts over generic icons.

---

## 9. Tone of voice & content

Applies to all UI copy (incl. i18n strings in `src/i18n/en.ts` / `nl.ts`), docs, and
notifications.

### 9.1 Voice

Communicate with all stakeholders (government, industry, academia, citizens) in a way that
is **inclusive, transparent, professional, clear, approachable, non-commercial, and
unbiased.**

### 9.2 Content principles

- **Keep it simple** — avoid jargon; explain concepts clearly.
- **Neutral but confident** — you're the *facilitator*, not a vendor. (Do: "We work together
  with organisations to create a fair and trusted data economy." Don't: "We own the
  data-sharing market.")
- **Consistent references** — always call it a **"framework"** or **"trust framework"**.

### 9.3 Style guide

- **UK English spelling** throughout (organis**e**, recognis**e**, colour, …). *(This
  document uses UK spelling deliberately; note CSS keywords like `color` stay American — that's
  syntax, not copy.)*
- **Consistent terminology** — e.g. "**data space**" (not "ecosystem"); pick one term per
  concept and stick to it.

### 9.4 Messaging assets

- **Elevator pitch:** "We build trust in the digital economy by governing an open framework
  that makes secure and standardised data sharing possible for everyone."
- **Taglines:** "Your Data. Your Choice." · "Trust. Share. Grow." · "Open standards for
  trusted data sharing."
- **By audience:** Government → compliance, interoperability, sovereignty · Industry →
  innovation & efficiency · Academia → a standard for experimentation · Public → fairness,
  transparency, trust.

---

## 10. Co-branding (partners/members)

- Use the **gradient** iSHARE logo by default; a secondary colour variation is allowed for
  harmony with the partner logo/background.
- Both logos carry **equal visual weight**; clear space between them ≥ **2× the height of
  the iSHARE visual mark**.
- iSHARE logo appears **first** unless otherwise agreed.
- Neither logo may be altered against its own brand guidelines.

---

## 11. Gap analysis & implementation checklist

Concrete changes to bring the portal on-brand. Tokens live in
`src/styles/variables.css` (`:root`) and `src/config/themes.ts` (`default` theme); they're
applied as CSS custom properties by `src/hooks/useTheme.ts`.

### 11.1 Colour tokens

| Variable | Current (off-brand) | On-brand target | Notes |
|---|---|---|---|
| `--primary-color` | `#61365E` | `#61265E` | Brand purple (current value is a near-miss) |
| `--secondary-color` | `#003145` (teal) | `#8E3459` / `#AC3A58` | Use a brand purple |
| `--accent-color` | `#004C6C` (teal) | `#FEC44B` or `#EF7B66` | Brand accent |
| `--button-primary` | `#0088cc` (blue) | `#EB5E55` | Brand CTA fill |
| `--button-primary-hover` | `#006699` (blue) | `#C84152` | Darker for contrast on hover |
| `--text-primary` | `#003145` (teal) | `#291D28` | 100% brand grey |
| `--text-secondary` | `#013A57` (teal) | `#61265E` / `#544B53` | Brand purple or 80% grey |
| `--border-color` / `--input-border` | `#C3CCCD` | `#D4D2D4` | 20% brand grey |
| `--error-color` | `#FF3B30` (iOS red) | `#C84152` | Brand red |
| `--background-color` | `#F8F7F4` | keep / `#FFFFFF` | "Lots of white" is on-brand |

### 11.2 Typography tokens

| Variable | Current | On-brand target |
|---|---|---|
| `--font-heading` | Inter/system | `Montserrat, …` |
| `--font-button` | Inter/system | `Montserrat, …` |
| `--font-primary` (body) | Inter/system | `Lato, Arial, …` |

Load the families with `next/font/google` (Montserrat + Lato) in `src/pages/_app.tsx` and
point the `--font-*` variables at the generated CSS variables, or add `@font-face` via the
theme's `fonts.fontFaceCSS`. Keep Arial + system fonts in the fallback stack.

### 11.3 Components & content to revisit

- [ ] Primary buttons → `#EB5E55` fill, white bold Montserrat label, `#C84152` hover.
- [ ] Status pills / badges → re-map to brand colours (purples for neutral/info, brand red
      for error/rejected, keep text+colour pairing).
- [ ] Optional thin **Rainbow Bar** accent (e.g. top of the header/landing) per §5.1.
- [ ] Headings switch to Montserrat Bold; ensure all text is **left-aligned**.
- [ ] Audit UI copy & i18n strings for **UK English** and "trust framework" / "data space"
      terminology (§9).
- [ ] Verify every text/background pair against WCAG AA (§2.5).
- [ ] Logo: confirm vertical full-colour variant in the header on white, with clear space.

---

*Source: 2026 iSHARE Foundation Brand Book — Brand Guidelines v4.0 (©2026 iSHARE
Foundation). When in doubt, the brand book PDF wins.*
