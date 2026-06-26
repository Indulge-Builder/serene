# Serene — Design System reference (buildable detail) (Claude Project digest)

> Concrete, buildable digest of `docs/design/DESIGN-DNA.md` (~7.1k lines, the design law) +
> `docs/design/design-system.md` (the implementation reference), with exact values from
> `src/styles/design-tokens.css` (verified 2026-06-26). `4-design-essentials.md` carries the design
> *laws/decisions*; this file carries the *values, component anatomy, and patterns* needed to build
> pixel-accurate UI. When a value here conflicts with the live `design-tokens.css`, the CSS wins.

## 1. Token scales (exact values)

**Type (`--text-*`):** 2xs 0.625rem/10px · xs 0.75/12 · sm 0.875/14 · base 1/16 · md 1.125/18 ·
lg 1.25/20 · xl 1.5/24 · 2xl 1.875/30 · 3xl 2.25/36 · display 3/48 · giant 4/64.

**Spacing (`--space-*`):** px=1 · 0=0 · 1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 7=28 · 8=32 · 10=40 ·
12=48 · 14=56 · 16=64 · 20=80 · 24=96 (px).

**Radius (`--radius-*`):** none 0 · xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · full 9999 (px).

**Shadows (`--shadow-*`):** 0 none · 1 resting cards/secondary buttons · 2 hover lift/tooltips · 3
dropdowns/panels · 4 modals/toasts · `-paper` dashboard paper float · `-sidebar` sidebar edge ·
`-inset` pressed fields · `-focus` = `0 0 0 2px paper, 0 0 0 4px accent@55%` (the white-gap ring) ·
`-accent-ring`/`-accent-glow` (primary button rest) / `-accent-lift` (primary hover) ·
`-gold-shimmer` (Earth-only). `--shadow-color` is a theme-aware RGB triplet (Earth `10 8 2`, Air
`8 12 20`, Water `4 18 18`, Fire `18 8 2`, Cosmos `8 6 18`).

**Durations (`--duration-*`):** instant 100 · fast 150 · base 200 · slow 350 · enter 400 · exit 250 ·
page 500 (ms).

**Easings (`--ease-*`):** out-expo `cubic-bezier(0.16,1,0.3,1)` (entrances) · in-expo
`cubic-bezier(0.7,0,0.84,0)` (exits) · spring `cubic-bezier(0.22,1,0.36,1)` (hover/tap) · in-out
`cubic-bezier(0.4,0,0.2,1)` (overlays/theme switch) · out-soft `cubic-bezier(0.25,0.46,0.45,0.94)`.

**Named type classes:** `.type-eyebrow` (sans, xs, semibold, widest tracking, uppercase, tertiary) ·
`.type-page-title` (serif, 2xl, light, tight tracking/leading, primary) · `.label-micro` (sans, 2xs,
semibold, widest tracking, uppercase, tertiary) · `.page-title-dot` (accent;
`serene-page-dot-blink 2.4s ease-in-out infinite`).

**Z-index (named only):** base 0 · raised 10 · dropdown 20 · sticky 30 (TopBar) · sidebar 40 ·
overlay 50 · modal 60 · modal-overlay 61 + modal-nested 62 (the nested-modal pair only) · toast 70 ·
cursor 80.

## 2. The 12 core components — anatomy

- **Button** (`Button.tsx`) — radius **sm (8px)**; variants primary (`--theme-accent` bg +
  `--theme-accent-fg` + `--shadow-accent-glow`), secondary (`--theme-paper-subtle` + border +
  `--shadow-1`), ghost, danger, success; loading swaps the left icon for a `Spinner` **without
  changing width**; focus `--shadow-focus`. Press `scale 0.97` is CSS-only (`.serene-pressable`);
  `MotionButton` (= `motion(Button)` + `MOTION_BUTTON_DEFAULTS`) is for repeatedly-pressed standalone
  CTAs only — never on a form submit.
- **Input** — the canonical input is the **`.serene-input` class** (no standalone tsx):
  `--theme-paper-subtle` bg, `--theme-paper-border` 1px, `--radius-sm`, `--text-sm`, `--space-3/4`
  padding. States: focus `--shadow-focus` + accent border + `caret-color: var(--theme-accent)`; error
  `--color-danger` + light ring; disabled opacity 0.5; read-only paper-subtle + selectable.
- **Badge/Pill** — `.status-pill` utilities: `padding 0.125rem 0.625rem`, `--text-xs`,
  `--weight-medium`, `--radius-full`, 1px border, `box-shadow: 0 1px 3px 0 rgb(0 0 0 / 6%)` (hardcoded).
  Variants neutral/accent/success/danger + the lead-status set (theme-invariant — see §9).
- **Card** — compose **`SectionCard.tsx`**: 1px `--theme-paper-border` + `--shadow-1` + `--radius-lg`,
  **never** `--shadow-paper` (that's the dashboard paper surface); header `--theme-paper-subtle` +
  `.label-micro` title; padding `--space-5`/`-6`.
- **Avatar** — sizes xs–xl, radius md, initials via six hashed semantic pairs (`getInitials` +
  `hashString`), selected = accent ring via box-shadow. `AvatarStack` max 4, 8px overlap.
- **Modal** — `modal.tsx` wraps `Dialog.tsx`: surface `--theme-paper` + `--shadow-4` + `--radius-xl`;
  backdrop `color-mix(--theme-canvas 72%, transparent)`; enter 400ms / exit 250ms; sizes sm/md/lg/xl/
  full; `type="standard"` (title/description/footer slots) or `type="elaya"` (enforces Dismiss +
  Approve + a 20px breathing LiaGlyph). `Dialog` caps height `md:max-h-[85dvh]` (and `<md` 90dvh),
  bottom-sheet below md.
- **Table** — generic `<Table<T>>` for admin grids; dev-warns if `rowCount > 100 && !virtualized`;
  header rows `--theme-paper-subtle`, data rows `--theme-paper` (never equal). Bespoke grids
  (LeadsTable) don't use it.
- **Toggle** — sizes sm/md, spring thumb, label + description slots; optimistic, rolls back on error.
- **Dropdown/Select** — `FilterDropdown` (`multi` default false): active trigger = accent border +
  `--theme-accent-surface`; panel `DROPDOWN_VARIANTS` (y -4, fade); checked = accent + accent-fg check.
  (`ComboboxDropdown` was deleted 2026-06-01 — use `FilterDropdown` `multi={false}`.)
- **Search Bar** — `SearchBar.tsx`, controlled, animated clear button (scale 0.7→1); sizes sm/md/lg.
- **Message Bar** — `MessageBar.tsx` auto-growing textarea composer; 32px square send button (Send
  icon 16px → Spinner on load); variants `default`/`nested`; `leadingSlot` hosts the
  `<DictationButton variant="composer">`.
- **Skeleton** — `.skeleton` class: `--theme-paper-subtle` bg, `--radius-xs`,
  `serene-skeleton-pulse 1.6s ease-in-out infinite`; **min 150ms display** before swap (V-08); widths
  non-uniform; only the first 8 rows animate (30ms stagger), the rest render instantly.

## 3. The micro-details (the touches that make it feel premium)

1. **Sidebar active = three layers** — fill (`--theme-sidebar-active-bg`) + full border + a travelling
   `3px × 16px` pill (`border-radius: 0 full full 0`, `--theme-sidebar-active-pill`) animated via
   `layoutId="active-pill"` spring (stiffness 380, damping 30). Never left-border-only.
2. **Sidebar logo divider** — a 1px `linear-gradient(to right, transparent → accent@22% → transparent)`,
   not a flat border.
3. **Page-title period** — primary nav `<h1>` ends with `<span class="page-title-dot">.</span>`
   (`serene-page-dot-blink 2.4s`). Detail/auth pages omit it (back link instead).
4. **Empty state** — Playfair italic heading (one sentence ending `.`), 12px/60%-opacity icon,
   optional tertiary sub + sm CTA. Always via `<EmptyState>`.
5. **Card border = primary elevation**, shadow secondary; rest `--shadow-1` → hover `--shadow-2` +
   translateY(-1px).
6. **Focus ring white gap** — `0 0 0 2px var(--theme-paper), 0 0 0 4px accent@55%` (the paper colour
   makes the gap, so the ring reads on any background).
7. **Pill shadows** — `0 1px 3px 0 rgb(0 0 0 / 6%)` is what makes pills feel lifted.
8. **Non-uniform skeleton widths** + first-8-rows-only stagger.
9. **Buttons don't change width on load** — spinner swaps in place.
10. **Canvas noise** — SVG `feTurbulence baseFrequency='0.68' numOctaves='4'`, rect `opacity='0.055'`
    (hardcoded in the data-URI — CSS vars can't be referenced inside it; the `--theme-canvas-grain-
    opacity: 0.055` token only documents intent). Paper grain uses `baseFrequency='0.75' opacity='0.025'`.

**Keyframes:** `serene-skeleton-pulse` (opacity 1↔0.4, 1.6s) · `serene-elaya-breathe` (0.35↔0.85, 3s) ·
`serene-elaya-cursor` (1↔0, 500ms steps) · `serene-page-dot-blink` (1↔0.2, 2.4s) · `serene-spin`
(1s linear) · `toast-deplete` (scaleX 1→0, linear, = lifetime) · `serene-row-enter` ·
`serene-check-draw` (stroke-dashoffset 9→0) · `serene-phone-ring` (decaying wiggle) ·
`serene-subtask-pulse` · `serene-oversight-pulse`.

## 4. Form system

- **Labels** are `.label-micro` (2xs, semibold, uppercase, widest tracking, tertiary) — never body text.
- **Inputs** are `.serene-input`; **errors** come from `lib/validations/form-errors.ts` only (never
  raw Zod, never "Invalid input"), shown inline below the field (`--text-xs`, `--color-danger`).
- **Three error moments:** on-blur validation (phone `normalizeToE164` on blur, not keystroke) →
  inline display → submit (Server Action returns `{data,error}`, never throws to UI).
- **Control states:** default (transparent border, paper-subtle bg, tertiary placeholder) · focus
  (`--shadow-focus` + accent border + accent caret) · error (danger text + light ring + light wash) ·
  disabled (opacity 0.5, no pointer events) · read-only (paper-subtle, selectable).
- **Never clear a field on validation error.** Submit is width-preserving (spinner in place).
- **Password:** `PasswordStrengthBar` — 4 segments (2px height, 2px gap), colours danger → warning →
  info → success. **Radio:** variants default/card (selected = `--theme-accent-surface`).
  **Checkbox:** checked = strikethrough + success icon, AnimatePresence crossfade.
- **Layouts:** single-column default; two-column grid; inline; section groups; multi-step.

## 5. Data display

- **Counts/numbers:** integers no decimals; cast RPC `bigint` via `Number()` in the service, format via
  `formatCount`/`formatCompact` (`lib/utils/numbers.ts`) in components — never `.toString()`.
- **Currency:** INR — `₹` symbol + Indian grouping (`₹1,00,000`, lakhs), mono for exact values
  (`formatCurrency`). Never convert currency; never hardcode rates.
- **Dates/time:** `formatDate` (`lib/utils/dates.ts`); timestamps in mono, xs/2xs, tertiary; IST math
  via `lib/utils/ist.ts`.
- **Phone:** two-part input (country + number); `normalizeToE164` on blur; receiver-ring animation
  on the dossier call CTA.
- **Status/enum:** the status-config pattern via the `--status-*-{text,light,border,solid}` token
  families (theme-invariant — §9); never hardcode status colour logic.
- **Null/zero/empty:** null → "—"; zero count → "None"/empty state; empty list → `<EmptyState>`.
- **Truncation:** CSS `text-ellipsis` (single line) / `-webkit-line-clamp` (multi); never truncate
  page titles, critical IDs, or identity names.

## 6. Toast system

`useToast()` (singleton) → `toast-provider.tsx` renders the stack; `toast-item.tsx` runs the lifecycle.
**Max 3 in DOM** (the 4th queues); arrival stagger (scale 0.7→1 + translateY, AnimatePresence), exit
fade 250ms. A left-edge **living bar** counts down (`toast-deplete`, scaleX 1→0, linear, =lifetime,
`transform-origin: left center`). Types: success/warning/info (auto-dismiss after ~4s), **danger
(never auto-dismisses)**, loading (spinner, no dismiss), elaya (breathing LiaGlyph, accent tint).
Position is the toast-z (70) corner; `--shadow-4`; `--radius-md`.

## 7. Page transitions

- **List → list:** paper content opacity + y (8→0, up to 500ms); the route progress bar animates on the
  paper.
- **Drill-down (list → detail):** list recedes `x 0→-16`, detail arrives `x 24→0`. **Return** reverses.
- **Modal/sheet:** enter `opacity0 y10 scale0.98 → 1/0/1` (350ms); exit `opacity0 scale0.97` (150ms).
- **Route progress bar:** on the paper (not canvas), 2px, `--theme-accent` + `--shadow-accent-glow`,
  linear 0→100% as the route loads.
- **What does NOT transition:** the sidebar, the TopBar shell (title may crossfade 150ms),
  notification badges, the sidebar avatar — and **the canvas itself** (the world is static; only paper
  changes).

## 8. Data-visualisation colour rules

- **≤3 colours per chart.** Palette: primary `--theme-accent` · secondary `--theme-accent-muted` ·
  tertiary `color-mix(--theme-accent 35%, --theme-paper)`. Comparison/benchmark series =
  `--theme-text-tertiary` only. 4+ series → `--status-*-solid` tokens, never palette rotation.
- **Per type:** bar — top corners `--radius-xs` only; line — 2px stroke (area uses a token gradient);
  donut — optional `centerLabel`; progress/ring — single accent on a transparent track.
- **Surface/tooltip:** `--theme-paper` bg + `--theme-paper-border`; tooltip `--shadow-2` + paper bg +
  primary text + `--radius-md` + `--space-3`; grid lines paper-border at ~0.5 opacity.
- **Recharts bridge (V-12):** `useChartTokens()` resolves CSS vars → hex on mount and re-resolves on
  `data-theme` change (MutationObserver); returns `series[6]` + grid/axisLabel/tooltipBg/Border.
  `resolveColorMap(map)` resolves a `Record<string, 'var(--…)'>` for `BarChart`'s `colorMap`. **Never
  pass a CSS var straight to a Recharts `fill`/`stroke`.** Seed `initialDimension` to avoid the
  `width(-1)` warning.
- **Domain line colours** (`--domain-*`, viz-only, mid-tone, readable on paper across themes):
  concierge `#4a8fc9` · onboarding `#d4a017` · finance `#3dab7a` · marketing `#c45cb4` · tech
  `#e07840` · shop `#5cb8c4` · b2b `#8868c8` · house `#c48840` · legacy `#6a8c6a`. Canonical record
  `DOMAIN_LINE_COLORS` (`lib/constants/domain-colors.ts`), resolved via `resolveColorMap()`.

## 9. Addenda

**Dark-surface semantic tokens** (canvas/sidebar/auth/toasts only — never on paper): success text
`#6ee09e` · warning `#fbbf5a` · danger `#f87272` · info `#60a5fa` · neutral `rgba(255,255,255,0.55)`;
each with an 18%-opacity fill + 30%-opacity border of its base.

**Lead-status theme-invariant colours** (identical across all 5 themes — psychological meaning must
not drift; `{text, light, border, solid}`):

| Status | text | light | border | solid |
|--------|------|-------|--------|-------|
| new | `#92620a` | `#fef5dc` | `#f0d080` | `#F5A623` |
| touched | `#1c4880` | `#e8f0fa` | `#a8c4e8` | `#4A90D9` |
| in_discussion | `#1a6058` | `#e0f4f0` | `#90d4c8` | `#27AE8F` |
| won | `#2a6040` | `#eaf5ee` | `#90cc9a` | `#27AE60` |
| nurturing | `#5038a0` | `#eeebfc` | `#c0b0e8` | `#8B6FD4` |
| lost | `#8a2c1c` | `#faecea` | `#e0a098` | `#E05C4B` |
| junk | `#8a2c1c` | `#faecea` | `#e0a098` | `#B0B0B0` |

**Drawer/sheet:** off-canvas; width 100% mobile / 360–480px desktop; backdrop
`color-mix(--theme-canvas 72%)` at z-overlay; panel `--theme-paper` + `--shadow-4` + `--radius-xl`
top corners (mobile); bottom-sheet swipe-to-dismiss.

**Scroll:** `.scrollable` (paper) / `.sidebar-scrollable` (dark) — `overflow-y:auto`,
`overscroll-behavior:contain`, momentum touch; custom 4px scrollbar (thumb `--theme-paper-border` /
`rgba(255,255,255,0.12)`; hover `--theme-accent-muted` / `rgba(255,255,255,0.22)`; track transparent).

**Backdrop blur** only on TopBar, mobile sidebar overlay, command palette — never cards/dropdowns/
modals (depth comes from elevation + borders + accent surfaces).

## 10. Component library index (`src/components/ui/`)

- **Core:** `Spinner` · `Button` · `MotionButton` · `Avatar` · `AvatarStack` · `BackButton`.
- **Input + selection:** `SearchBar` · `.serene-input` (class) · `MessageBar` · `PasswordStrengthBar` ·
  `Toggle` · `RadioGroup` · `Checklist`/`ChecklistItem` · `Calendar` · `DatePicker` · `TimePicker` ·
  `DictationButton`.
- **Navigation + structure:** `TabSelector` (flat + compound APIs) · `FilterDropdown` · `FloatingPanel`
  (+ `usePortalAnchor`) · `SectionCard` · `Dialog` · `modal.tsx` · `ConfirmDialog` · `CollapseReveal` ·
  `InfoRow` · `ProgressBar` · `StatTile` · `EmptyState` · `PageSkeletons` · `FilterBar` ·
  `DateRangeFields`/`DateRangePresetList` · `TaskFormFields`.
- **Data display:** `Table` (generic) · `.status-pill` utilities (no standalone Badge.tsx) ·
  `.skeleton` class + `ChartSkeleton`.
- **Charts (`charts/`):** `useChartTokens` · `CartesianChartFrame` (`ChartFrame` + `cartesianDefaults`) ·
  `LineChart` · `BarChart` · `PieChart` · `DonutChart` · `AreaChart` · `ButterflyChart` ·
  `ChartSkeleton`.
- **Elaya & toast:** `elaya-glyph` (`LiaGlyph`, breathing) · `toast-provider`/`toast-item`.
- **Removed:** `ComboboxDropdown` (2026-06-01 — use `FilterDropdown`). The old
  `src/lib/utils/chart-tokens.ts` stub is deleted (use `useChartTokens.ts`).
- **Canonical-by-composition (not separate tsx):** Card = `SectionCard`; form field =
  `.serene-input` + `.label-micro`.
