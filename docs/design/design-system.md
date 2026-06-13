# Serene Design System — Component Implementation Reference

> **Purpose:** how the design law is implemented — shell classes, component library behaviour, layout patterns, form system.
> **Audience:** engineers (designers read `DESIGN-DNA.md` first). · **Source-of-truth scope:** implementation reference only — where this file and `DESIGN-DNA.md` disagree, DNA is law and this file is a bug.
> **Last verified:** 2026-06-11 (DOC-01/DOC-04 corrections applied).

---

## 1. Philosophy

Serene is a luxury internal operating system for Indulge team members. People spend eight to twelve hours a day inside it. The interface must be calm enough never to tire them, precise enough to earn trust, and refined enough to reflect the brand they represent.

### Two-layer world: canvas + paper

- **Canvas** (`--theme-canvas`): the dark shell — sky, ocean, void, or night depending on theme. It is atmospheric, textured, and mostly static.
- **Paper** (`--theme-paper`): the floating work surface where lists, forms, charts, and dossiers live. It has weight, border, and `--shadow-paper`.

Nothing else competes with this hierarchy. Cards and section surfaces sit *on* paper; they do not replace it.

### Why this shell model exists

Hierarchy without noise: the user always knows where the “world” ends and where work begins. The sidebar lives on the canvas; content lives on paper. Navigation is stable; only the paper content changes when moving between modules.

### Three type voices — strict roles

| Voice | Token / family | Role |
| ----- | -------------- | ---- |
| **Editorial** | `--font-serif` (Playfair) | Page titles, empty states, Elaya’s welcome — once per view at display scale |
| **UI** | `--font-sans` (Geist Sans) | Everything operational: nav, tables, forms, buttons |
| **Technical** | `--font-mono` (Geist Mono) | IDs, phones, timestamps, metrics — exact values only |

Never mix Playfair and Geist on the same line. Never use italic in Geist UI copy (italic is Playfair’s mood).

### Motion as information, not decoration

Motion answers spatial questions (where did this come from?), announces state change, and acknowledges hover/focus/press. It never exists only because it looks cool. **M-06:** only `transform` and `opacity` animate; never width, height, padding, or margin.

### The premium test

Before shipping any surface, ask: *Does this belong in a product serving the world’s wealthiest clients?* Restraint, token discipline, and editorial calm beat novelty. Border-first elevation, whisper borders, and Playfair empty states are load-bearing — not optional polish.

---

## 2. The Shell

### 2a. `.layout-shell` (mounted) and `.layout-canvas` (defined, unmounted)

**Where:** `src/app/(dashboard)/layout.tsx` — outer wrapper `className="layout-shell flex"` (`globals.css:28` — flat `var(--theme-canvas)` background, no grain/gradient layers).

**`.layout-canvas`** (`globals.css:33`) carries the full atmosphere stack below but is currently **mounted nowhere** — the dashboard uses the flat `.layout-shell`, and the auth layout composes its atmosphere inline. Treat `.layout-canvas` as the spec-complete atmosphere class awaiting adoption, not as the live shell. *(Corrected 2026-06-11 — design-audit DOC-01: earlier versions of this doc, DNA §3.5, and root CLAUDE.md described `.layout-canvas` as the mounted dashboard shell.)*

**CSS for `.layout-canvas`** (`src/app/globals.css`):

| Property | Value |
| -------- | ----- |
| `background-color` | `var(--theme-canvas)` |
| `background-image` | SVG grain data URI + `var(--theme-canvas-gradient-1)` + `var(--theme-canvas-gradient-2)` + `var(--theme-canvas-gradient-3)` |

#### SVG grain

- `feTurbulence` `baseFrequency='0.68'`, `numOctaves='4'`, desaturated
- Opacity **`0.055` hardcoded** in the data URI — cannot reference `--theme-canvas-grain-opacity` (CSS variables do not resolve inside SVG data URIs)
- `--theme-canvas-grain-opacity` (Earth: `0.055`) **documents intent**; what actually renders is the URI opacity

**Earth gradient tokens** (corner/edge washes — never centred spotlight):

| Token | Placement | Character |
| ----- | --------- | --------- |
| `--theme-canvas-gradient-1` | ellipse ~70%×55% at 8% 8% | Espresso warmth, top-left |
| `--theme-canvas-gradient-2` | ellipse ~55%×70% at 92% 92% | Olive wash, bottom-right |
| `--theme-canvas-gradient-3` | ellipse ~18%×100% at 0% 50% | Umber left rail |

**Other themes:** omit gradient tokens → grain-only flat canvas until each theme defines its own washes.

**Load flash prevention:** `html` and `body` in `globals.css` use a fixed Earth canvas base colour before `layout-canvas` mounts so the first paint is never white.

---

### 2b. Paper surface (`.serene-paper` / dashboard shell)

**Canonical class** (design spec — `src/app/globals.css` also ships `.serene-paper-surface` with the same texture stack for auth cards):

| Property | Token / value |
| -------- | ------------- |
| Background | `var(--theme-paper)` + optional top-edge highlight + fine grain (`baseFrequency` 0.75, opacity 0.025 in URI) |
| Border radius | `var(--radius-xl)` on dashboard floating panel |
| Box shadow | `var(--shadow-paper)` |
| Overflow | `overflow-y: auto`, `overflow-x: hidden` on dashboard implementation |
| Min height | `calc(100dvh - 24px)` — **`dvh` not `vh`** (mobile browser chrome makes `100vh` jump when the address bar hides) |
| Margin | `12px` top/right/bottom on paper (`margin: 12px 12px 12px 0`) |
| Gap from sidebar | `gap: var(--space-3)` (12px) on `.layout-canvas` flex row |

The dashboard paper div does not always use the `.serene-paper` class name; it applies the same tokens inline. Prefer the class when adding new full-bleed paper regions.

---

### 2c. Sidebar

**Implementation:** `src/components/layout/Sidebar.tsx`

| Attribute | Value |
| --------- | ----- |
| Width | `240px` (desktop implementation) |
| Position | `sticky`, `top: 0`, `minHeight: 100dvh` |
| z-index | `var(--z-sidebar)` (40) |
| Background | `var(--theme-sidebar-bg)` |
| Shadow | `var(--shadow-sidebar)` |

**Design target (tablet/mobile — not all breakpoints wired in current Sidebar):** 64px icon rail at `md`; off-canvas + bottom bar below `md`.

#### Tokens used

| Purpose | Token |
| ------- | ----- |
| Background | `--theme-sidebar-bg` |
| Borders / dividers | `--theme-sidebar-border` |
| Inactive nav text | `--theme-sidebar-text` |
| Active nav text | `--theme-sidebar-active` |
| Hover fill | `--theme-sidebar-hover-bg` |
| Active row fill | `--theme-sidebar-active-bg` |
| Active left pill | `--theme-sidebar-active-pill` |

#### Nav item spec

| State | Layout | Colour / border |
| ----- | ------ | ---------------- |
| Rest | `padding: 10px var(--space-3)`, `border-radius: var(--radius-md)`, `font-size: var(--text-sm)`, `letter-spacing: var(--tracking-wide)` | `color: var(--theme-sidebar-text)`, transparent border |
| Hover | background transition `--duration-fast` `--ease-in-out` | `background: var(--theme-sidebar-hover-bg)`, `color: var(--theme-canvas-text)` |
| Active | `font-weight: var(--weight-medium)` | `color: var(--theme-sidebar-active)`, `background: var(--theme-sidebar-active-bg)`, `border: 1px solid color-mix(in srgb, var(--theme-accent) 18%, transparent)` |

**Active pill (current implementation):** static `3px × 16px` bar, `position: absolute; left: 0`, `border-radius: 0 var(--radius-full) var(--radius-full) 0`, `background: var(--theme-sidebar-active-pill)`.

**Canonical motion spec (design target for shared-layout pill):** Framer `layoutId="active-pill"`, `transition: { type: "spring", stiffness: 380, damping: 30 }` — pill *travels* between items; TabSelector chips use `SPRING_CONFIG` (`stiffness: 400`, `damping: 30`) from `motion.ts`.

**Nav hover (design target):** `whileHover: { x: 2 }`, `transition: { duration: 0.25, ease: var(--ease-spring) }`.

**Logo divider:** `height: 1px`, `linear-gradient(to right, transparent → color-mix(var(--theme-accent) 22%) → transparent)` — not a flat `border-bottom`.

**Logo glow:** `drop-shadow` with `color-mix(in srgb, var(--theme-accent) 30%, transparent)` at 8px and 12% at 20px.

**Icon size:** `15px × 15px`, `strokeWidth: 1.5` — intentional exception to default `w-4 h-4` (16px).

**Nav label typography:** `var(--text-sm)`, `var(--weight-medium)` when active — not Tailwind `text-sm` alone; section labels use `.label-micro` with muted `color-mix(var(--theme-sidebar-text) 40%)`.

**Footer:** notification bell + avatar/name/role link to `/profile` + sign-out control.

---

### 2d. TopBar

**Implementation:** `src/components/layout/TopBar.tsx` (used where embedded; primary nav pages often use in-page `h1` instead).

| Attribute | Value |
| --------- | ----- |
| Height | `56px` (`h-14`) |
| Position | `sticky`, `top: 0` |
| z-index | `var(--z-sticky)` (30) |
| Background | `var(--theme-paper)` |
| Border | `1px solid var(--theme-paper-border)` |
| Backdrop | `backdrop-filter: blur(12px)` + WebKit prefix — **sanctioned surface** |

**Design note:** TopBar should read as paper, not a separate chrome colour; on scroll, blur sells depth. Border at **50% perceived whisper** is achieved in spec via `color-mix` on border — full-opacity border is a wall, not a hairline.

**Zones:** left = page title (`--font-serif`, `--text-xl`, `--weight-semibold` in current TopBar); centre reserved; right = avatar + actions.

**Page title period:** primary nav `<h1 class="type-page-title">` ends with `<span class="page-title-dot">.</span>` — accent blink via `serene-page-dot-blink` 2.4s. Detail pages with `BackButton` use the dot on the title but skip eyebrow above.

---

### 2e. Z-Index Scale

Never use raw numbers in components — named tokens only.

| Token | Value | Use |
| ----- | ----- | --- |
| `--z-base` | 0 | Document flow |
| `--z-raised` | 10 | Card hover, sticky table headers |
| `--z-dropdown` | 20 | Dropdowns, popovers, tooltips |
| `--z-sticky` | 30 | TopBar, sticky section headers |
| `--z-sidebar` | 40 | Sidebar |
| `--z-overlay` | 50 | Modal backdrops, drawer backdrops |
| `--z-modal` | 60 | Modal panels, command palette |
| `--z-modal-overlay` | 61 | Nested modal backdrop |
| `--z-modal-nested` | 62 | Nested modal panel |
| `--z-toast` | 70 | Toast stack |
| `--z-cursor` | 80 | Elaya floating cursor, drag handles |

---

## 3. Five Themes

Theme attribute: `data-theme` on `<html>`. Default with no attribute = Earth (`:root` mirrors Earth).

### Switching

1. `ThemeInitializer` (`useLayoutEffect`) sets `data-theme` from profile before paint — zero flash.
2. `ThemeSelector` previews by setting `data-theme` on `<html>` without hardcoded colour literals in components.
3. `--transition-theme` animates `background-color`, `color`, `border-color`, `box-shadow` over `--duration-slow` with `--ease-in-out`.

---

### Earth (default)

| Role | Token |
| ---- | ----- |
| Canvas | `--theme-canvas` |
| Paper | `--theme-paper` / `--theme-paper-subtle` / `--theme-paper-border` |
| Accent | `--theme-accent` |
| Accent foreground | `--theme-accent-fg` (dark on gold — buttons use this, never `--theme-text-inverse`) |
| Shadow primitive | `--shadow-color` → warm black channel |
| Sidebar active | `--theme-sidebar-active` |

**Design intent:** Warm, grounded, heritage. Canvas washes sit at **corners and edges**, not centre — centred glow reads as a stage spotlight. Paper is clean white with warm tertiary taupe. Psychological relief: soft, magnetic, easy on the eyes for long shifts.

**Critical rules:** `--theme-accent-fg` on all accent fills; sidebar uses `--theme-sidebar-bg`, not assumed equal to canvas in future themes; grain + three gradients via `.layout-canvas`.

---

### Air

| Role | Token |
| ---- | ----- |
| Canvas | `--theme-canvas` (deep blue-black) |
| Paper | `--theme-paper` (haze white — **never pure `--theme-paper` overridden to untinted white**) |
| Accent | `--theme-accent` (cirrus steel blue) |
| Accent foreground | `--theme-accent-fg` → light text |
| Sidebar active | `--theme-sidebar-active` (lighter cirrus — never Earth gold) |

**Design intent:** Still, luminous, pre-dawn sky. Clarity over warmth. Restraint on canvas glow opacity.

**Critical rules:** Cool blue-grey active nav only; paper keeps blue undertone; inactive sidebar text is cool white at ~48% opacity — not neutral grey wash.

---

### Water

| Role | Token |
| ---- | ----- |
| Canvas | `--theme-canvas` |
| Paper | `--theme-paper` (foam white — **not clinical pure white**) |
| Accent | `--theme-accent` (volcanic teal) |
| Accent foreground | `--theme-accent-fg` |
| Sidebar active | `--theme-sidebar-active` (shallow teal) |

**Design intent:** Deep Atlantic calm; bioluminescent canvas glow; chromatic secondary text (`--theme-text-secondary` carries teal-grey, not neutral grey).

**Critical rules:** Preserve cyan-green paper undertone; sidebar border is thermocline-subtle — do not crank contrast; secondary text colour is intentional chroma.

---

### Fire

| Role | Token |
| ---- | ----- |
| Canvas | `--theme-canvas` (cooled basalt) |
| Paper | `--theme-paper` (ash-warm white) |
| Accent | `--theme-accent` (lava orange) |
| Accent foreground | `--theme-accent-fg` |
| Sidebar active | `--theme-sidebar-active` |

**Design intent:** Stromboli at 2am — awake, high energy, volcanic warmth without chaos.

**Critical rules:** Paper warm undertone mandatory; `--theme-sidebar-text` is **amber-tinted** white, not neutral `rgba(255,255,255,…)`; secondary text is burnt-sienna chromatic; canvas glow may be slightly stronger than Air/Water but capped (~0.10–0.14).

---

### Cosmos

| Role | Token |
| ---- | ----- |
| Canvas | `--theme-canvas` (violet-black) |
| Paper | `--theme-paper` (**violet undertone must be preserved**) |
| Accent | `--theme-accent` (nebula violet) |
| Accent foreground | `--theme-accent-fg` |
| Sidebar active | `--theme-sidebar-active` |

**Design intent:** Atacama night — vast, intelligent, pre-light darkness; active nav is the strongest nebula pool of all five themes (`--theme-sidebar-active-bg` ~0.14).

**Critical rules:** Never strip violet from paper or the theme disconnects from canvas; sidebar text is cool violet-white; secondary text is violet-grey, not neutral grey.

---

## 4. The Surface Contract

| Surface | Text token |
| ------------------------------------------- | ------------------------ |
| `--theme-paper` (content area) | `--theme-text-primary` |
| `--theme-paper-subtle` (inset areas) | `--theme-text-primary` |
| `--theme-canvas` (dark shell) | `--theme-canvas-text` |
| `--theme-accent` fills (buttons, badges) | `--theme-accent-fg` |
| `--color-success/danger/warning/info` fills | matching `*-text` token |
| Secondary labels on paper | `--theme-text-secondary` |
| Placeholders, timestamps, muted | `--theme-text-tertiary` |
| Sidebar nav inactive | `--theme-sidebar-text` |
| Sidebar nav active | `--theme-sidebar-active` |

**Never use `--theme-text-inverse` on accent fills. Use `--theme-accent-fg`.**

- `--theme-accent-fg` is theme-aware (Earth: dark on gold; Air/Water/Fire/Cosmos: light on saturated accent).
- `--theme-text-inverse` is the paper-colour inverse for dark fills — not the accent button label token.

---

## 5. Design Tokens

### 5a. Theme-scoped tokens (`--theme-*`)

| Token | Represents | Typical consumers |
| ----- | ------------ | ----------------- |
| `--theme-canvas` | Shell background | `.layout-canvas`, overlays |
| `--theme-canvas-glow` | Ambient glow (sparse use) | Atmospheric accents |
| `--theme-canvas-text` | Text/icons on canvas | Sidebar hover, shell chrome |
| `--theme-canvas-grain-opacity` | Documented grain strength | Comments / future per-theme URIs |
| `--theme-canvas-gradient-1/2/3` | Earth washes | `.layout-canvas` only |
| `--theme-paper` | Primary work surface | Paper panel, cards, inputs |
| `--theme-paper-subtle` | Inset strips | SectionCard headers, secondary inputs |
| `--theme-paper-border` | Structural borders | Cards, tables, dividers |
| `--theme-tab-pill-active-bg/border/text` | Soft tab chip on paper | TabSelector pill variant |
| `--theme-accent` | Brand emphasis | Primary buttons, focus, charts |
| `--theme-accent-hover` | Pressed/hover accent | Button hover |
| `--theme-accent-muted` | Quiet accent | Hovers, secondary series |
| `--theme-accent-surface` | Tinted fills | Active filters, chips |
| `--theme-accent-fg` | Text on accent | Button labels, accent tabs |
| `--theme-text-primary/secondary/tertiary` | Paper typography | Body, labels, placeholders |
| `--theme-text-inverse` | High-contrast on dark | Danger hover text, rare |
| `--theme-sidebar-*` | Sidebar palette | Sidebar, nav |

### 5b. Semantic colours

Each semantic intent has **base**, **-light** (fills), **-text** (labels on fills).

| Intent | Base | Light | Text |
| ------ | ---- | ----- | ---- |
| Success | `--color-success` | `--color-success-light` | `--color-success-text` |
| Warning | `--color-warning` | `--color-warning-light` | `--color-warning-text` |
| Danger | `--color-danger` | `--color-danger-light` | `--color-danger-text` |
| Info | `--color-info` | `--color-info-light` | `--color-info-text` |
| Neutral | `--color-neutral` | `--color-neutral-light` | `--color-neutral-text` |

**Dark-surface variants:** `--color-*-dark-text`, `-dark-fill`, `-dark-border` for canvas/sidebar/toast contexts.

**Lead status colours** (`--status-new-text`, etc.): **theme-invariant** — psychological meaning must not drift with theme.

#### Per-theme semantic overrides (non-Earth)

| Theme | Overrides (why) |
| ----- | ---------------- |
| **Air** | Cooler success/warning/info/neutral **light** fills; neutral base/text slate-aligned |
| **Water** | Teal-shifted success; cooler info/neutral lights; neutral base/text chromatic |
| **Fire** | Amber warning; warm neutral lights; info desaturated for ash paper |
| **Cosmos** | Violet-grounded info/neutral; danger light rosier; success slightly muted |

#### Focus & selection

| Token | Use |
| ----- | --- |
| `--color-focus-ring` | `color-mix(var(--theme-accent) 40%, transparent)` |
| `--color-selection-bg` | Text selection wash |
| `--color-selection-text` | Selection foreground |

### 5c. Typography tokens

**Families:** `--font-sans`, `--font-serif`, `--font-mono` (mapped from Geist Sans, Playfair Display, Geist Mono via `next/font` on `<html>`).

#### Scale

| Token | rem | px |
| ----- | --- | -- |
| `--text-2xs` | 0.625 | 10 |
| `--text-xs` | 0.75 | 12 |
| `--text-sm` | 0.875 | 14 |
| `--text-base` | 1 | 16 |
| `--text-md` | 1.125 | 18 |
| `--text-lg` | 1.25 | 20 |
| `--text-xl` | 1.5 | 24 |
| `--text-2xl` | 1.875 | 30 |
| `--text-3xl` | 2.25 | 36 |
| `--text-display` | 3 | 48 |
| `--text-giant` | 4 | 64 |

**Line height:** `--leading-none` (1) through `--leading-loose` (1.8).

**Tracking:** `--tracking-tighter` (-0.03em) through `--tracking-widest` (0.14em).

**Weight:** `--weight-light` (300) through `--weight-bold` (700) — **`--weight-semibold` (600) is the maximum in UI. `font-bold` / 700 is forbidden.**

### 5d. Named type classes

Implemented in `src/styles/design-tokens.css`. **Exactly three named type classes exist:**

| Class | Composition |
| ----- | ----------- |
| `.type-eyebrow` | sans, `--text-xs`, semibold, widest tracking, uppercase, tertiary |
| `.type-page-title` | serif, `--text-2xl`, **light**, tighter tracking, tight leading, primary |
| `.label-micro` | sans, `--text-2xs`, semibold, widest, uppercase, tertiary — form labels, table headers |

*(Corrected 2026-06-11 — design-audit DOC-04: this section previously listed `.type-card-title`, `.type-body`, `.type-label`, `.type-caption`, `.type-mono` as implemented. They are defined nowhere and used nowhere — card titles, body copy, labels, captions, and mono values are composed from raw tokens (`--text-*`, `--weight-*`, `--font-*`) inline. If a recurring composition earns a class, add it to `design-tokens.css` first, then document it here.)*

**`.page-title-dot`:** `color: var(--theme-accent)`; `animation: serene-page-dot-blink 2.4s ease-in-out infinite`.

**Dot usage:** primary sidebar destinations only (`/dashboard`, `/leads`, `/tasks`, etc.). **Exempt:** detail routes with `BackButton` (`/leads/[id]`, `/campaigns/[id]`, `/admin/users/[id]`, …) — back affordance replaces eyebrow.

### 5e. Spacing

| Token | rem | px |
| ----- | --- | -- |
| `--space-px` | — | 1 |
| `--space-0` | 0 | 0 |
| `--space-1` | 0.25 | 4 |
| `--space-2` | 0.5 | 8 |
| `--space-3` | 0.75 | 12 |
| `--space-4` | 1 | 16 |
| `--space-5` | 1.25 | 20 |
| `--space-6` | 1.5 | 24 |
| `--space-7` | 1.75 | 28 |
| `--space-8` | 2 | 32 |
| `--space-10` | 2.5 | 40 |
| `--space-12` | 3 | 48 |
| `--space-14` | 3.5 | 56 |
| `--space-16` | 4 | 64 |
| `--space-20` | 5 | 80 |
| `--space-24` | 6 | 96 |

### 5f. Border radius

| Token | rem | px |
| ----- | --- | -- |
| `--radius-none` | 0 | 0 |
| `--radius-xs` | 0.25 | 4 |
| `--radius-sm` | 0.5 | 8 |
| `--radius-md` | 0.75 | 12 |
| `--radius-lg` | 1 | 16 |
| `--radius-xl` | 1.5 | 24 |
| `--radius-2xl` | 2 | 32 |
| `--radius-full` | 9999px | pill |

**Button rule:** `--radius-sm` on buttons — not `--radius-md`.

### 5g. Shadows

| Token | Purpose |
| ----- | ------- |
| `--shadow-0` | None |
| `--shadow-1` | Resting cards, secondary buttons |
| `--shadow-2` | Hover lift, chart tooltips |
| `--shadow-3` | Dropdowns, elevated panels |
| `--shadow-4` | Modals |
| `--shadow-paper` | Floating dashboard paper |
| `--shadow-sidebar` | Sidebar edge |
| `--shadow-inset` | Pressed/inset fields |
| `--shadow-focus` | Focus ring (white gap + accent) |
| `--shadow-accent-ring` | Subtle accent halo |
| `--shadow-accent-glow` | Primary button rest |
| `--shadow-accent-lift` | Primary button hover |
| `--shadow-gold-shimmer` | Earth-only inset highlight on luxury surfaces |

`--shadow-color` RGB triplet tints all elevation per theme (warm Earth, cool Air, teal Water, etc.).

### 5h. Motion tokens

#### Easing

| Token | Curve | When to use | When not to |
| ----- | ----- | ------------- | ----------- |
| `--ease-out-expo` | cubic-bezier(0.16, 1, 0.3, 1) | Entrances, arrivals | Exits (too slow to leave) |
| `--ease-in-expo` | cubic-bezier(0.7, 0, 0.84, 0) | Exits | Entrances |
| `--ease-spring` | cubic-bezier(0.22, 1, 0.36, 1) | Hovers, taps, chips | Long ambient loops |
| `--ease-in-out` | cubic-bezier(0.4, 0, 0.2, 1) | Overlays, subtle fades | Dramatic entrances |
| `--ease-out-soft` | cubic-bezier(0.25, 0.46, 0.45, 0.94) | Layout-adjacent CSS | Framer springs |

#### Duration

| Token | ms | Purpose |
| ----- | -- | ------- |
| `--duration-instant` | 100 | Tap feedback |
| `--duration-fast` | 150 | Hovers, exits |
| `--duration-base` | 200 | Dropdowns |
| `--duration-slow` | 350 | Modals, theme |
| `--duration-enter` | 400 | Standard enter |
| `--duration-exit` | 250 | Standard exit |
| `--duration-page` | 500 | Page content (rare) |

#### Compositions

| Token | Composes |
| ----- | -------- |
| `--transition-hover` | bg, color, border @ fast in-out |
| `--transition-focus` | box-shadow, outline @ fast |
| `--transition-interactive` | bg, color, shadow, transform @ spring/instant |
| `--transition-enter` | transform + opacity @ enter expo |
| `--transition-exit` | transform + opacity @ exit expo |
| `--transition-layout` | width, height, padding, margin @ slow (**CSS layout only — not Framer GPU paths**) |
| `--transition-theme` | bg, color, border, shadow @ slow |
| `--transition-fade` | opacity @ base |

---

## 6. Motion Rules and Vocabulary

### 6a. Motion rules M-01 – M-06

| Code | Rule | Explanation |
| ---- | ---- | ----------- |
| **M-01** | Entrances: one axis | Typically `y: 6px → 0` + opacity; no scale on enter |
| **M-02** | Exits faster than entrances | `--duration-exit` (250ms) or faster vs 350–400ms enter |
| **M-03** | One motion per interaction | Dropdown animates; trigger does not also bounce |
| **M-04** | Data transitions, not flashes | Stagger/fade; numbers count; no teleport |
| **M-05** | Respect `prefers-reduced-motion` | Instant state; opacity-only fallback |
| **M-06** | 60fps ceiling | **Only `transform` and `opacity`** — never width/height/padding/margin |

### 6b. Motion vocabulary

| Pattern | Initial | Animate | Exit | Duration | Easing |
| ------- | ------- | ------- | ---- | -------- | ------ |
| Standard entrance | `opacity: 0, y: 6` | `opacity: 1, y: 0` | `opacity: 0, y: -4` | enter 400ms / exit 250ms | out-expo / in-expo |
| Modal enter | `opacity: 0, y: 10, scale: 0.98` | `opacity: 1, y: 0, scale: 1` | `opacity: 0, scale: 0.97` | 350ms / 150ms | out-expo / in-expo |
| Dropdown | `opacity: 0, y: -4` | `opacity: 1, y: 0` | `opacity: 0, y: -4` | 200ms / 150ms | out-expo / in-expo |
| Card hover lift | — | `translateY(-1px)` | — | `--transition-hover` | CSS only |
| Sidebar nav hover (target) | — | `x: 2` | — | 250ms | `--ease-spring` |
| Sidebar active pill (target) | layoutId spring | stiffness **380**, damping **30** | — | spring | — |
| Button press (`MotionButton`) | — | `scale: 0.97` | — | 100ms + spring | `MOTION_BUTTON_DEFAULTS` |
| Skeleton | — | `serene-skeleton-pulse` 1.6s | — | loop | ease-in-out |
| Page title dot | opacity 1 ↔ 0.2 | — | — | 2.4s | ease-in-out |
| List stagger | `opacity: 0, y: 4` | `opacity: 1, y: 0` | — | 200ms, stagger 40ms, max 8 | out-expo |
| Page content | `opacity: 0, y: 8` | `opacity: 1, y: 0` | — | 500ms | out-expo |

### 6c. `src/lib/constants/motion.ts`

| Export | Value | Used by |
| ------ | ----- | ------- |
| `ENTER_DURATION` | `0.4` (400ms) | Dialog overlay, modals |
| `EXIT_DURATION` | `0.25` (250ms) | Dialog exit |
| `BASE_DURATION` | `0.2` | Dropdown variants |
| `FAST_DURATION` | `0.15` | Dropdown exit, micro interactions |
| `SLOW_DURATION` | `0.35` | — |
| `INSTANT_DURATION` | `0.1` | MotionButton spring duration slot |
| `EASE_OUT_EXPO` | `[0.16, 1, 0.3, 1]` | Enters |
| `EASE_IN_EXPO` | `[0.7, 0, 0.84, 0]` | Exits |
| `EASE_SPRING` | `[0.22, 1, 0.36, 1]` | MotionButton, hovers |
| `EASE_IN_OUT` | `[0.4, 0, 0.2, 1]` | Fades, overlay |
| `SPRING_CONFIG` | stiffness **400**, damping **30** | TabSelector `layoutId` chips |
| `MODAL_VARIANTS` | y 10, scale 0.98 → 1; exit scale 0.97 | Reference for modal motion |
| `DROPDOWN_VARIANTS` | y -4 fade | FilterDropdown, panels |
| `FADE_VARIANTS` | opacity only | Lightweight toggles |

Import from `@/lib/constants/motion` — **never redeclare inline.**

> **`MOTION_BUTTON_DEFAULTS` is NOT in `motion.ts`.** It is exported from
> `src/components/ui/MotionButton.tsx` alongside `MotionButton` itself: `{ whileTap: { scale: 0.97 },
> transition: { type: 'spring', stiffness: 400, damping: 30, duration: INSTANT_DURATION, ease: EASE_SPRING } }`.
> It pulls `INSTANT_DURATION` + `EASE_SPRING` *from* `motion.ts`. Spread it onto `MotionButton` for the
> standard press feel. Consumers: `AddLeadButton`, `AddTaskButton`, `AdCreativesManager`, etc.

### 6d. Sanctioned `backdrop-filter` surfaces

**Only three:**

1. TopBar (`blur(12px)`)
2. Mobile sidebar overlay (when implemented)
3. Command palette

**Never** on cards, dropdown panels, or modal surfaces — use solid `--theme-paper` + `--shadow-3` instead.

---

## 7. Component Library

All paths under `src/components/ui/`. Display-only — no DB calls. Every colour is a CSS variable.

### Core Primitives

#### `Spinner` — `Spinner.tsx` — `SpinnerProps`

| Size | Dimensions |
| ---- | ---------- |
| sm/md/lg | mapped in component |

- Animation: `serene-spin` keyframe (1s linear)
- `canvas` variant uses `--theme-canvas-text` on dark surfaces

#### `Button` — `Button.tsx` — `ButtonProps`

| Variant | Rest | Hover |
| ------- | ---- | ----- |
| primary | `--theme-accent` bg, `--theme-accent-fg`, `--shadow-accent-glow` | `--theme-accent-hover`, `--shadow-accent-lift`, `translateY(-1px)` |
| secondary | `--theme-paper-subtle`, `--theme-paper-border`, `--shadow-1` | border `--theme-accent-muted` |
| ghost | transparent, `--theme-text-primary` | bg `--theme-paper-subtle` |
| danger | `--color-danger-light` / `--color-danger-text` | saturated `--color-danger`, `--theme-text-inverse` |
| success | `--color-success-light` / `--color-success-text` | saturated `--color-success`, `--theme-text-inverse` |

Sizes: xs/sm/md/lg. Radius **`--radius-sm`**. Loading: swaps `iconLeft` for `Spinner` — width preserved. **No `whileTap`** (use `MotionButton`).

#### `MotionButton` — `MotionButton.tsx`

`motion(Button)` + `MOTION_BUTTON_DEFAULTS` (`scale: 0.97` tap). For standalone primary CTAs only — not form submits.

#### `Avatar` — `Avatar.tsx` — `AvatarProps`

Sizes xs–xl. `--radius-md`. Initials: six hashed semantic pairs. `selected`: accent ring via `box-shadow` + CSS transition.

#### `AvatarStack` — `AvatarStack.tsx` — `AvatarStackProps`

`max` default 4, `overlap` 8px. Separator ring `0 0 0 2px var(--theme-paper)`. Hover spread: Framer `x` only.

#### `BackButton` — `BackButton.tsx` — `BackButtonProps`

36×36 circle, `--theme-paper`, `--theme-paper-border`, `--shadow-1`, `--radius-full`. Framer mount/hover/tap on link. Inline left of `h1`, `gap: var(--space-4)`.

---

### Input + Selection

#### `SearchBar` — `SearchBar.tsx` — `SearchBarProps`

Controlled. Focus: `--shadow-focus`, border `--theme-accent`, `caret-color: var(--theme-accent)`. Placeholder via `.serene-input`. Clear button: `AnimatePresence` scale 0.7→1. Sizes sm/md/lg; variant `soft`.

#### Text inputs (pattern)

No standalone `Input.tsx` — use **`.serene-input`** (`globals.css`): `--theme-paper-subtle` bg, `--theme-paper-border`, `--radius-sm`, `--text-sm`, focus `--shadow-focus`.

#### `MessageBar` — `MessageBar.tsx` — `MessageBarProps`

Auto-growing textarea composer (`forwardRef<HTMLTextAreaElement>`). Send button is a `32px` square; icon `Send` at `16px`; `Spinner` swaps in while `loading`. Props: `value`/`onChange`/`onSend`, `placeholder` (default "Type a message…"), `disabled`, `loading`, `maxLength`, `maxHeight`, `onKeyDown`, and `variant: "default" | "nested"` (`default` = standalone composer on the WhatsApp page; `nested` = inset inside a card). **This component exists** — it is the canonical message-bar primitive (the old "Spec §5.11 — not in repo" note is obsolete).

#### `PasswordStrengthBar` — `PasswordStrengthBar.tsx`

Props: `password: string`. Renders a 4-segment bar (height 2px, gap 2px) that fills danger→warning→info→success as the score rises (0 = transparent). Returns `null` when `password` is empty. Shared by `PasswordChangeForm` (`/profile`) and `UpdatePasswordForm` (`/update-password`) — the one canonical strength meter.

#### `Toggle` — `Toggle.tsx` — `ToggleProps`

sm/md. Spring thumb. Label + description slots.

#### `RadioGroup` — `RadioGroup.tsx` — `RadioGroupProps`

Variants `default` | `card`. Card selected: `--theme-accent-surface`.

#### `ChecklistItem` / `Checklist` — `ChecklistItem.tsx`, `Checklist.tsx`

Checked: strikethrough + `--color-success` icon. `AnimatePresence` icon crossfade. Checklist composes `ProgressBar`.

#### `Calendar` — `Calendar.tsx` — `CalendarProps`

Month slide (Framer). `taskDots`: local YYYY-MM-DD keys; dots `--theme-accent` or `--color-danger`; cell height 44px when dots enabled.

#### `DatePicker` — `DatePicker.tsx` — `DatePickerProps`

Popover + `Calendar`. `showTime`: scroll columns + `TabSelector` `indicatorLayoutId="datepicker-ampm"`. Commits via `toUTC()`.

#### `TimePicker` — `TimePicker.tsx` — `TimePickerProps` / `TimePickerWheelPanelProps`

Wheel columns for hour/minute/AM-PM; accent surface on selection.

---

### Navigation + Structure

#### `TabSelector` — `TabSelector.tsx`

**Flat API:** `TabSelectorProps` — `tabs`, `activeTab`, `onChange`, `variant`, `indicatorLayoutId`.

**Compound API:** `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.

| Variant | Active chip | Text |
| ------- | ----------- | ---- |
| pill | `--theme-tab-pill-active-*` + `--shadow-1` | `--theme-tab-pill-active-text` |
| connected | `--theme-paper` + `--shadow-1` | `--theme-text-primary` |
| accent | `--theme-accent` + `--shadow-accent-glow` | `--theme-accent-fg` |

`SPRING_CONFIG` on `layoutId` indicator. **Collision rule:** unique `indicatorLayoutId` when two groups share a viewport.

`TabsContent`: always mounted (`display: none`); internal `AnimatePresence mode="wait"`.

#### `FilterDropdown` — `FilterDropdown.tsx` — `FilterDropdownProps`

`multi` default false. Trigger open/active → border `--theme-accent`, bg `--theme-accent-surface`. Panel: `DROPDOWN_VARIANTS`. Checkbox selected: `--theme-accent` + `--theme-accent-fg` check.

#### `SectionCard` — `SectionCard.tsx` — `SectionCardProps`

Flat chrome: `--theme-paper-border`, `--shadow-1`, `--radius-lg` — **never `--shadow-paper`**. Header: `--theme-paper-subtle`, `.label-micro` title.

#### `Dialog` — `Dialog.tsx` — `DialogProps`

Overlay `color-mix(var(--theme-canvas) 72%, transparent)`. Surface `--theme-paper`, `--shadow-4`, `--radius-xl`. Sizes sm/md/lg/xl/full. Motion: `ENTER_DURATION` / `EXIT_DURATION`.

#### `Modal` — `modal.tsx` — `ModalProps` / `ModalType`

**One file, lowercase `modal.tsx`** — there is no `Modal.tsx` on disk. It exports `Modal`, `ModalProps`, and `ModalType` (`'standard' | 'elaya'`). `Modal` wraps `Dialog` and resolves the footer slot by type:

- `type="standard"` (default): `title` / `description` / `footer` slots passed through to `Dialog`.
- `type="elaya"`: enforces **exactly two actions** — `Dismiss` (ghost) + `Approve` (primary) — with a breathing `LiaGlyph size={20}`. `onApprove` / `onDismiss` / `approveLabel` / `dismissLabel` props; both handlers call `onClose()` after firing.
- `maxWidth` (Tailwind class string) is a **backward-compat prop on this same component** — it overrides `size` for existing callers. It is **not** a separate "legacy" file.

**Rule:** every modal in Serene composes `modal.tsx` (or `Dialog` directly) — never reimplements chrome.

#### `InfoRow` — `InfoRow.tsx` — `InfoRowProps`

Micro-label + value; optional copy; `divider` border `--theme-paper-border`. Copy/check icons: 150ms crossfade, tap scale.

#### `ProgressBar` — `ProgressBar.tsx` — `ProgressBarProps`

Auto intent from value unless `intent` override. Fill is a full-width element animated via `scaleX` + `transformOrigin: left center` (Framer) — width animation retired 2026-06-11 (design-audit M-03; layout properties are never animated).

> **Deleted primitives (2026-06-10 DRY audit, PR 1):** `ListRow`, `Accordion`, and
> `EditButton` were built but never imported anywhere in `src/` and have been removed.
> Do not rebuild them speculatively — extract a primitive only when a second call site
> exists.

---

### Data Display

#### `Table` — `Table.tsx` — `TableProps<T>`

Generic admin grids. Dev warn if `rowCount > 100 && !virtualized`. **Not** for LeadsTable-style bespoke grids.

#### Status / badges

No `Badge.tsx` — use `.status-pill` utilities (`--status-*` lead pills, `.status-pill--accent`, etc.) in `design-tokens.css`.

#### Skeleton

`.skeleton` class — `serene-skeleton-pulse` 1.6s on `--theme-paper-subtle`. `ChartSkeleton` for charts. **Minimum display 150ms (V-08)** before swap to content.

---

### Charts — `src/components/ui/charts/`

| File | Props | Notes |
| ---- | ----- | ----- |
| `useChartTokens.ts` | `ChartTokens`, optional `themeKey` | MutationObserver on `data-theme`; `resolveColorMap()` for SVG |
| `LineChart.tsx` | `LineChartProps` | `loading` → skeleton |
| `BarChart.tsx` | `BarChartProps` | Top-radius bars only; optional `colorMap` |
| `PieChart.tsx` | `PieChartProps` | |
| `DonutChart.tsx` | `DonutChartProps` | `centerLabel` slot |
| `AreaChart.tsx` | `AreaChartProps` | Gradient fill from token |
| `ButterflyChart.tsx` | `ButterflyChartProps` | Negative left series |
| `ChartSkeleton.tsx` | `ChartSkeletonProps` | `.skeleton` |

---

### Elaya & toast

#### `elaya-glyph.tsx` — `LiaGlyph`

Custom SVG; `elaya-breathe` 3s when `breathing` true. Static glyph = Elaya absent.

#### `toast-provider.tsx` / `toast-item.tsx`

Stack max 3; stagger scale/translateY. Types: success/warning/danger/loading/elaya. Danger never auto-dismiss. `serene-toast-bar-breathe` on left bar.

---

### Removed components

**`ComboboxDropdown`** — deleted 2026-06-01. Use **`FilterDropdown`** (`multi={false}`) or dossier inline selects.

---

### Patterns not yet extracted to `ui/`

| Pattern | Canonical implementation |
| ------- | ------------------------ |
| Card | `SectionCard` |
| Form fields | `.serene-input` + `label-micro` |

(`MessageBar` is now a real `ui/` primitive — see Input + Selection above.)

---

## 8. Layout Patterns

### 8a. Standard list page

```text
<main className="flex-1 p-8">
  Row 1: flex justify-between — .type-page-title + .page-title-dot | primary CTA (MotionButton)
  Row 2: filter bar — px-5 py-4 mb-4, border --theme-paper-border, bg --theme-paper, shadow --shadow-1
  Row 3: <Suspense fallback={Skeleton}><AsyncContent /></Suspense>
</main>
```

**Pages:** `/leads`, `/tasks`, `/campaigns`, `/deals`, `/admin/users`, `/settings`, `/performance` (filters vary).

### 8b. Detail page

- Grid: `minmax(0, 1fr) 340px`, max-width **1280px** (`--bp-xl` zone)
- Left: stacked `SectionCard`s
- Right: sticky identity / controls
- Header: `BackButton` + `.type-page-title` + dot; `gap: var(--space-4)`
- **Pages:** `/leads/[id]`, `/campaigns/[id]`, `/admin/users/[id]`, `/profile` (narrow), `/tasks/[id]`

### 8c. Full-bleed page

No `p-8` — panel owns insets. **`/whatsapp`** split layout.

### 8c-bis. Auth pages (canvas-dark shell)

The `(auth)` route group (`/login`, `/forgot-password`, `/update-password`) is the **one surface that is dark by design** — it renders directly on `--theme-canvas` with **no sidebar, no paper**. A single centred card (`maxWidth: 26rem`, `--z-raised`) floats on the canvas above two radial glows and two accent-tinted orbs. Cards/inputs/links draw from the **canvas/sidebar palette**, never the paper palette.

- Card: `.serene-auth-card` · Inputs: `.serene-input-auth` · Links: `.serene-auth-link` (all in `globals.css`).
- Brand header: `/logo.webp` + serif `Serene` with a trailing `.page-title-dot` (the only sanctioned dot off a primary-nav `<h1>`).
- Errors use the **dark-surface** semantic tokens (`--color-danger-dark-*`), never the light variants.
- **Forbidden on auth:** `--theme-paper*`, `.serene-paper-surface`, `.serene-input`, light `--color-*-light`.

Full token-level spec: **`DESIGN-DNA.md` §3.7 "Auth Surface (canvas-dark)"**. Session/action/schema behaviour: **`docs/pages/auth.md`**.

### 8d. Content width zones

| Zone | Max width | Use |
| ---- | --------- | --- |
| Narrow | 672px (`--bp` ~2xl tailwind max-w-2xl) | Profile, settings forms |
| Standard | 1024px | Task lists, lead lists |
| Wide | 1280px | CRM, analytics, dossiers |
| Full | none | WhatsApp, Elaya full-screen |

### 8e. Filter bar pattern

- Left: `TabSelector` or label
- Right: `SearchBar` + `FilterDropdown`(s) + filter icon + active-count badge + Clear
- URL sync via `buildFilterParams()` in `src/lib/utils/filter-params.ts` — pass `resetKeys: ['page']` when filters change
- Date helpers: `dateFromUrlParam` / `dateToUrlParam` (local calendar, IST-safe)

---

## 9. Form System

### Three-voice labels

Field labels use **`.label-micro`** (`--text-2xs`, semibold, widest tracking, uppercase, `--theme-text-tertiary`) — not sentence-case body text.

### Errors

- Always from `lib/validations/form-errors.ts`
- Never raw Zod messages in UI
- Inline below field: `--text-xs`, `--color-danger`
- **Never clear fields on validation error**

### Phone

Two-part country + number; `normalizeToE164()` on **blur**, not each keystroke.

### Password

Eye / EyeOff toggle; strength bar **4 segments**, height 2px, gap 2px — fill colours `--color-danger` → `--color-warning` → `--color-info` → `--color-success` (see `PasswordChangeForm`).

### Control states

Default / hover (`--theme-accent-muted` border) / focus (`--theme-accent` + `--shadow-focus`) / error (`--color-danger` + `--color-danger-light` ring) / disabled (opacity 0.5) / read-only (`--theme-paper-subtle`, selectable text).

---

## 10. Empty States (V-09)

| Element | Spec |
| ------- | ---- |
| Icon | `w-12 h-12`, `--theme-text-tertiary`, stroke 1.5, opacity 60% |
| Heading | **Playfair italic**, `--text-lg`, `--theme-text-secondary`, one sentence ending with `.` |
| Sub | optional `--text-sm` tertiary, max-width ~20rem |
| CTA | optional primary `sm` |

**Forbidden:** "No data available", "No results found".

**Examples:** "Nothing matches these filters." · "All clear for now." · "You're all caught up."

---

## 11. Data Visualisation

### Three-colour maximum

1. Primary — `--theme-accent`
2. Secondary — `--theme-accent-muted`
3. Tertiary — `color-mix(in srgb, var(--theme-accent) 35%, var(--theme-paper))`

Comparison / benchmark: **`--theme-text-tertiary`** only.

### Semantic data

Lead status, won/lost, SLA — use **`--status-*`** and `--color-success/warning/danger` — not palette rotation.

### `useChartTokens()` / MutationObserver bridge

**Problem:** Recharts renders SVG `fill`/`stroke` attributes that **do not resolve `var(--theme-accent)`** reliably across browsers.

**Solution:** `src/components/ui/charts/useChartTokens.ts`:

1. On mount, `getComputedStyle(document.documentElement).getPropertyValue(...)` resolves tokens to computed RGB/hex.
2. `MutationObserver` watches `<html data-theme>` — on change, re-resolve (same mechanism as `ThemeSelector` writes).
3. Optional `themeKey` prop for tests/SSR only — production needs no prop.

**Returns:** `series[6]` (`accent`, `info`, `success`, `warning`, `danger`, `accent-muted`), `grid`, `axisLabel`, `tooltipBg`, `tooltipBorder`.

**`resolveColorMap(map)`:** pass `Record<string, string>` with values like `var(--status-new-text)` — returns resolved colours for `BarChart` `colorMap` prop.

**Bar rule:** top corners `--radius-xs` only — flat bottom on baseline.

**ResponsiveContainer:** width 100%; height in px from parent.

**Never** hardcode chart colours because "CSS variables don't work" — use the bridge.

---

## 12. Responsive Behaviour

| Element | Mobile `< md` | Tablet `md` | Desktop `lg+` |
| ------- | ------------- | ----------- | ------------- |
| Sidebar | Off-canvas + bottom nav (target) | 64px rail | 240px full |
| Page padding | 16–20px | 24px | 32px (`p-8`) |
| Tables | Card stack (R-05) | Horizontal scroll | Full grid |
| Modals | Bottom sheet, top radius `--radius-xl`, max-height 90dvh | Centred | Centred |
| Touch targets | min 44×44px (R-03) | — | — |

**Breakpoints:** `--bp-xs` 480 → `--bp-3xl` 1920. Tailwind mobile-first: `md:`, `lg:`.

**R-01:** shell `min-height: 100dvh`. **R-02:** safe-area on fixed bottom bars.

---

## 13. Page Transitions

### What transitions

- Paper **content** opacity + `y` (e.g. 8px → 0, up to `--duration-page` 500ms)
- Route progress bar on paper (2px, `--theme-accent`, themed glow)
- Drill-down: list recedes `x: 0 → -16px`; detail arrives `x: 24px → 0`
- Return: reverse

### What never transitions

- Sidebar (fixed)
- TopBar shell (title may crossfade 150ms)
- Notification badges (update in place)
- User avatar in sidebar footer
- **The canvas itself**

> The canvas is the world. The world does not change when you walk from room to room. Only the paper changes. The sky stays the same.

Theme switches use `--transition-theme`, not route transition wrappers.

**Tab switches inside a page are not navigation** — no page transition.

### Custom scrollbar (`.scrollable`)

| Part | Token |
| ---- | ----- |
| Width | 4px |
| Thumb | `--theme-paper-border` |
| Thumb hover | `--theme-accent-muted` |
| Track | transparent |
| Firefox | `scrollbar-width: thin` |

Sidebar uses `.sidebar-scrollable` variant (light thumb on dark).

---

## 14. The Never-Do List

| # | Rule | Rationale |
| - | ---- | --------- |
| 1 | Never hardcode a colour in a component | Themes and dark surfaces break instantly |
| 2 | Never `text-gray-*`, `bg-gray-*`, `bg-white` | Use `--theme-*` and semantic tokens |
| 3 | Never z-index outside `--z-*` | Stacking chaos and hidden modals |
| 4 | Never animate width/height/padding/margin | Jank and M-06 violations |
| 5 | Never `backdrop-filter` except TopBar, mobile sidebar overlay, command palette | Glass on cards reads as cheap |
| 6 | Never `font-bold` (700) | Max `--weight-semibold`; bold reads as shouting |
| 7 | Never combine data fetching and UI in one component | Testability and RSC boundaries |
| 8 | Never duplicate an existing `ui/` primitive | Drift guaranteed |
| 9 | Never show raw Zod errors | Trust and localisation |
| 10 | Never clear a form field on validation error | Disrespects user input |
| 11 | Never empty-state copy "No data available" | Clinical; breaks Playfair voice |
| 12 | Never more than 3 colours in one chart | Unreadable legend exercise |
| 13 | Never skeleton flash &lt; 150ms | Flicker feels broken (V-08) |
| 14 | Never `backdrop-blur` outside sanctioned surfaces | See rule 5 |
| 15 | Never coloured single-edge borders as status indicators | Use pills, dots, icons, badges |
| 16 | Never ship meaningful change without `docs/changelog.md` | Single source of truth |
| 17 | Never write to deleted `The_Changelog.md` | Removed; use `docs/changelog.md` |
| 18 | Never import `lib/services/` values in client components | Pulls `next/headers`; use Server Actions |

---

## 15. Known Invariants

- Every colour in `.tsx` files is a CSS variable — no literal colour strings
- **`--weight-semibold` (600)** is the maximum font weight
- **`backdrop-filter`** only on: TopBar, mobile sidebar overlay, command palette
- No **coloured single-edge borders** (`borderLeft` accent strips) for category/status
- **Skeleton minimum 150ms** before showing content (V-08)
- All motion constants from **`src/lib/constants/motion.ts`** — no inline cubic-bezier
- Icons: **`lucide-react` only** — default 16px (`w-4 h-4`), stroke 1.5; sidebar 15px
- **`indicatorLayoutId`** must be unique when two tab groups share a viewport
- **`--theme-accent-fg`** on accent fills; never `--theme-text-inverse` for buttons
- **`.page-title-dot`** on primary nav pages only; detail pages use `BackButton`
- **Lead status colours** are theme-invariant
- **Earth canvas gradients** at corners/edges, not centre
- **Paper undertones** per theme (Air/Water/Fire/Cosmos) must not be washed to generic white
- **Charts** use `useChartTokens()` / `resolveColorMap` — not hardcoded SVG fills
- **Modals** compose `Modal` / `modal.tsx` — no custom chrome
- **Server Actions** return `{ data, error }` — never throw to UI
- **Log tables** append-only — no UPDATE/DELETE
- **Button** for forms; **MotionButton** for standalone CTAs
- **`getLeadsByRole`** returns `{ leads, totalCount }` — never count-only second query
- **Filter URL changes** reset `page` via `buildFilterParams`
- **Canvas never route-transitions** — only paper content animates

---

*End of reference. Values live in `src/styles/design-tokens.css`; behaviour lives in `src/components/ui/` and `src/app/globals.css`.*
