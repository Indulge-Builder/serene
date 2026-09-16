# Serene — Design System reference (buildable detail) (Claude Project digest)

> Concrete, buildable digest of `docs/design/DESIGN-DNA.md` (the design law) +
> `docs/design/design-system.md` + `docs/design/design.md`, with exact values read from
> `src/styles/serene-neumorphic-tokens.css` and `src/styles/design-tokens.css` (verified
> 2026-08-24). `4-design-essentials.md` carries the design *laws/decisions*; this file carries the
> *values, component anatomy, and patterns* needed to build pixel-accurate UI. **When a value here
> conflicts with the live CSS, the CSS wins.**
>
> **Load order matters:** `globals.css` imports `design-tokens.css` first, then
> `serene-neumorphic-tokens.css`, then `serene-mobile.css`. The neumorphic file re-points most of
> the legacy vocabulary (the "bridge"), so the *stock* values in `design-tokens.css` are the revert
> path, not what renders. Anything you read out of `design-tokens.css` for a colour is probably
> overridden; read the neu file.

## 1. The neumorphic material (what actually renders)

**Surfaces (theme-invariant):** `--neu-canvas #ECE8E1` (the ground) · `--neu-surface #F1EDE6`
(cards) · `--neu-surface-high #F3EFE8` (lifted: dialogs, panels, menus, the leads table card) ·
`--neu-well #E9E4DB` (**state only**: tracks, skeletons, input wells).

**Light/dark shadow sources:** `--neu-dark: 166 156 140` (warm putty) · `--neu-light: 255 255 255` ·
`--neu-edge: rgba(255,255,255,0.55)` (the 1px hairline on raised surfaces) · `--neu-edge-strong: 0.7`.

**Shadow recipes (Whisper depth — the only depth scale):**

| Token | Value |
| ----- | ----- |
| `--neu-shadow-raised-sm` | `2px 2px 6px dark/.24, -2px -2px 6px light/.65` |
| `--neu-shadow-raised` | `3px 3px 8px dark/.26, -3px -3px 8px light/.70` |
| `--neu-shadow-raised-lg` | `6px 6px 16px dark/.28, -6px -6px 16px light/.75` |
| `--neu-shadow-hover` | `5px 5px 12px dark/.30, -5px -5px 12px light/.80` (pair with `translateY(-1px)`) |
| `--neu-shadow-inset` | `inset 2px 2px 5px dark/.32, inset -2px -2px 5px light/.75` |
| `--neu-shadow-pressed` | `inset 2px 2px 4px dark/.35, inset -2px -2px 4px light/.60` |
| `--neu-shadow-input` | `3px 3px 8px dark/.22, -3px -3px 8px light/.70, inset 0 1px 0 light/.85` (+ `--neu-input-bg` gradient sheen) |
| `--neu-shadow-track` | `inset 2px 2px 5px dark/.20, inset -1px -1px 3px light/.55, 0 1px 0 light/.65` (+ `--neu-track-bg`) |
| `--neu-shadow-tab-active` | `2px 2px 6px dark/.28, -2px -2px 6px light/.70, inset 0 1px 0 light/.85` (+ `--neu-tab-active-bg`) |
| `--neu-shadow-chip` | `2px 2px 5px dark/.22, -2px -2px 5px light/.60` |
| `--neu-shadow-knob` | `2px 2px 5px dark/.45, -1px -1px 3px light/.55` |
| `--neu-shadow-modal` | `14px 14px 40px rgba(120,110,92,.35), -8px -8px 24px light/.50` |
| `--neu-shadow-floating` | the command-palette / floating-panel depth |
| `--neu-scrim` | `rgba(56,51,43,0.35)` |

**Radii — the Marshmallow scale (the ONLY radius scale):** card **32** · panel **28** · field **22** ·
tile **18** · chip **14** · pill **999**. The legacy scale is bridged (`--radius-md`→14,
`--radius-lg`→22, `--radius-xl`→32); prefer the explicit `--neu-radius-*` roles on new work.

**Text:** `--neu-text-primary #38332B` · `secondary #8A8274` · `tertiary #ABA396` ·
`disabled #C4BCAE` · `--neu-on-accent-soft #FDF9F0` (warm white on a *deep* pastel fill).

**Accent (theme-derived, never hardcoded):** `--neu-accent` = `--theme-accent`; `--neu-accent-deep` =
`--theme-accent-muted` (the text-safe tone on cream); `--neu-accent-fg` = `--theme-accent-fg` (the
dark ink on accent fills); `--neu-accent-gradient`; `--neu-accent-wash` = 16% accent.
Header-specific: `--neu-header-wash` (22%), `--neu-header-edge` (32% hairline), `--neu-header-ink`,
`--neu-header-icon`.

**Pastel support family (theme-invariant), each with a text-safe `-deep`:**
sage `#A9C4A0`/`#7E9B76` · powder `#A3BFD6`/`#7797B3` · butter `#E3CB96`/`#B39C63` ·
lilac `#B3A9D4`/`#8A7FB0` · peach `#E5B896`/`#BC8E67` · teal `#8FBFB5`/`#5F8F86` ·
danger `#D98E85`/`#B06A61`. Semantic aliases: success→sage, info→powder, warning→butter.

**Chip pairs (exact specimen values):** sage `#DCE8D6`/`#5F7D57` · powder `#D9E4EE`/`#5E7F9B` ·
butter `#F0E4C8`/`#96814C` · rose `#F0D9D4`/`#A85B50` · lilac `#E2DDEE`/`#7A6FA0` ·
teal `#D6E8E4`/`#5F8F86` · neutral `#E9E4DB`/`#8A8274`.

**Charcoal family (the one dark-first vocabulary):** `--neu-charcoal #2D2920` ·
`--neu-charcoal-text #F1EDE6` · two charcoal shadows · `--neu-palette-scrim`. Used by the tooltip,
the action/undo toast, the command palette, and Elaya's glyph disc (`--neu-glyph-disc`).

**Brand-fixed / semantic-fixed values that never theme-tint:** `--neu-success-gradient` +
`--neu-success-ink` (the save morph) · `--neu-petal-gradient` (the Won celebration) ·
`--neu-mandala-from/to` + `-disc-` pair (the SeedMandala stops) · `--neu-boot-glow` ·
`--neu-watermark-opacity`.

**Dark mode** redefines the same roles under `[data-neu="dark"]` (canvas `#28241C`); components never
branch on `isDark`. See `4-design-essentials.md` for what changes and why the overlay/scrim block has
to sit *after* the bridge.

## 2. The base scales (unchanged by the restyle)

**Type (`--text-*`):** 2xs 0.625rem/10px · xs 0.75/12 · sm 0.875/14 · base 1/16 · md 1.125/18 ·
lg 1.25/20 · xl 1.5/24 · 2xl 1.875/30 · 3xl 2.25/36 · display 3/48 · giant 4/64.

**Spacing (`--space-*`):** px=1 · 0=0 · 1=4 · 2=8 · 3=12 · 4=16 · 5=20 · 6=24 · 7=28 · 8=32 · 10=40 ·
12=48 · 14=56 · 16=64 · 20=80 · 24=96 (px). **The scale skips 9** — `var(--space-9)` is undefined and
the browser silently drops the declaration. (This bit a real input in 2026-08; `check:tokens` catches
it now.)

**Durations (`--duration-*`):** instant 100 · fast 150 · base 200 · slow 350 · enter 400 · exit 250 ·
page 500 (ms).

**Easings (`--ease-*`):** out-expo `cubic-bezier(0.16,1,0.3,1)` (entrances) · in-expo
`cubic-bezier(0.7,0,0.84,0)` (exits) · spring `cubic-bezier(0.22,1,0.36,1)` (hover/tap) · in-out
`cubic-bezier(0.4,0,0.2,1)` (overlays/theme switch) · out-soft `cubic-bezier(0.25,0.46,0.45,0.94)`.

**Named type classes:** `.type-eyebrow` (sans, xs, semibold, widest tracking, uppercase) ·
`.type-page-title` (serif, 2xl, light, tight tracking/leading) · `.label-micro` (sans, 2xs, semibold,
widest tracking, uppercase) · `.page-title-dot` (accent; `serene-page-dot-blink 2.4s`). Under the
bridge the eyebrow/micro labels take `--neu-accent-deep`.

**Z-index:** base 0 · raised 10 · dropdown 20 · sticky 30 · sidebar 40 · overlay 50 · modal 60 ·
modal-overlay 61 + modal-nested 62 · toast 70 · **tooltip 75** · cursor 80 · veil 90 (orphaned) ·
**boot 95**.

## 3. The 12 core components — anatomy

- **Button** (`Button.tsx`) — primary = `--neu-accent-gradient` + `--neu-accent-fg` + the
  `--neu-accent-btn-edge` hairline; secondary = raised cream; danger/success = soft pastel fills.
  Press is `--neu-shadow-pressed` + `scale(0.98)`; hover is `--neu-shadow-hover` + `translateY(-1px)`,
  gated to fine pointers. **Loading** swaps the left icon for an 18px spinning `currentColor`
  SeedMandala with `cursor: wait` and an optional `loadingLabel` ("Saving…") — the width never
  changes. **`status: 'idle' | 'pending' | 'success'`** adds the save morph (sage gradient + a 400ms
  check draw + `successLabel`), driven by `useButtonStatus()`. `MotionButton`
  (= `motion(Button)` + `MOTION_BUTTON_DEFAULTS`) is only for repeatedly-pressed standalone CTAs —
  never on a form submit.
- **Input** — the canonical input is the **`.serene-input` class** (no standalone tsx). It **floats**
  (Rule 3): `--neu-input-bg` gradient + `--neu-shadow-input` + `--neu-input-edge`, radius
  `--neu-radius-field`. Focus adds the accent ring **over** the input shadow — focus must never sink
  the field. Error = `--color-danger` border + a light wash; disabled = opacity 0.5; read-only stays
  selectable.
- **Badge/Pill** — `.status-pill`: pastel fill + deep label + `--neu-shadow-chip` + hairline,
  `--neu-radius-pill`, `--text-xs`, `--weight-medium`.
- **Card** — compose **`SectionCard.tsx`**: `--neu-surface` + `--neu-shadow-raised` + `--neu-edge` +
  `--neu-radius-card` (32). Its header strip is the themed `<CardHeader>` treatment. Never
  `--theme-paper-subtle` as a header fill — that resolves to the well tone.
- **Avatar** — sizes xs–xl, initials via six hashed semantic pairs (`getInitials` + `hashString`),
  selected = accent ring. `AvatarStack` max 4, 8px overlap.
- **Modal** — `modal.tsx` wraps `Dialog.tsx`: raised `--neu-surface` panel + `--neu-shadow-modal` +
  `--neu-radius-panel` over the `--neu-scrim`. **The overlay has no backdrop blur** (removed
  2026-07-10 — it caused the open-animation shimmer and violated V-06). `Dialog` **portals to
  `document.body`**, takes programmatic focus on the panel itself with `{ preventScroll: true }`
  (never letting the browser drift into the first input mid-animation), and applies a re-entrant
  `lockBodyScroll()`. Caps height `md:max-h-[85dvh]` / 90dvh below md; becomes a **bottom sheet**
  below md with `--space-4` gutters. `type="elaya"` enforces Dismiss + Approve + a breathing glyph.
- **Table** — generic `<Table<T>>`; header and data rows never share a tone. **`previewRows={N}`** is
  the built-in P-03 answer (first N rows + a one-way "Show all N" expander; setting it suppresses the
  dev warning). Bespoke grids (LeadsTable) don't use it.
- **Toggle** — inset satin track (`--neu-track-bg` + `--neu-shadow-track`) with an accent-gradient
  knob (`--neu-shadow-knob`); optimistic, rolls back on error.
- **Dropdown/Select** — `FilterDropdown` (`multi` opt-in, plus `fullWidth` and `menuPortal`): applied
  trigger = accent wash + float; selected options = wash + chip shadow; check tiles are
  accent-gradient. This is also THE multi-select for **forms**, not just filters (the subscriptions
  Departments field adopted it instead of a bespoke chip row).
- **Search Bar** — `SearchBar.tsx`, a floating pill with the input sheen; sizes sm/md/lg (**md is the
  house default in filter bars** — `sm` reads misaligned beside 2.25rem chips).
- **Message Bar** — auto-growing textarea composer; 32px square send button; `leadingSlot` hosts
  `<DictationButton variant="composer">`.
- **Skeleton** — `.skeleton`: a left→right sheen (`--neu-well` 25% / `--neu-surface-high` 50% /
  `--neu-well` 75%, 200% background sweep, 1.8s linear `serene-shimmer-sweep`), flat well tone under
  reduced motion. **Min 150ms display** (V-08); widths non-uniform; `skeletonStagger` steps 150ms
  capped at 600ms. No watermark — that was removed 2026-07-06.

## 4. Form system

- **Labels** are `.label-micro` — never body text.
- **Inputs** are `.serene-input`; **errors** come from `lib/validations/form-errors.ts` only, shown
  inline below the field (`--text-xs`, `--color-danger`).
- **Three error moments:** on-blur validation (phone `normalizeToE164` on blur, not keystroke) →
  inline display → submit (the Server Action returns `{data,error}`, never throws to UI).
- **Never clear a field on validation error.** Submit is width-preserving.
- **Password:** `PasswordStrengthBar` — 4 segments (2px height, 2px gap), danger → warning → info →
  success. A *stored third-party* password field is tri-state (`undefined` = keep, `null` = clear,
  string = replace) and is never pre-filled from the server.
- **Checkbox/completion:** `<CheckTile>` — inset well ↔ accent-gradient flip + check draw + ONE ring
  pulse (user toggles only, never on load).
- **Layouts:** single-column default; two-column grid; inline; section groups; multi-step.

## 5. Data display

- **Counts/numbers:** integers, no decimals; cast RPC `bigint` via `Number()` in the service; format
  via `formatCount`/`formatCompact` in components — never `.toString()`. Hero values animate through
  `<AnimatedNumber>` (which takes the already-formatted string).
- **The number font:** hero stat values in `--font-serif`, secondary/technical numbers in
  `--font-mono`, both `tabular-nums`. `StatTile` values are **mono** (both variants). A number
  mid-sentence is wrapped in **`<Num>`**.
- **Currency:** INR by default — `₹` + Indian grouping (`₹1,00,000`, lakhs) via `formatCurrency`,
  which also supports USD and EUR. **Never convert currency; never hardcode a rate** — where a
  foreign-currency bill exists, the INR figure is entered manually and is the only figure analytics
  use.
- **Dates/time:** `formatDate` (`lib/utils/dates.ts`); timestamps in mono, xs/2xs, tertiary; IST math
  via `lib/utils/ist.ts`. Elapsed business time via `business_minutes_between()` in SQL.
- **Phone:** two-part input (country + number); `normalizeToE164` on blur; the receiver-ring animation
  on the dossier call CTA.
- **Status/enum:** the status-config pattern via the `--status-*` token families; never hardcode
  status colour logic. Under the bridge these render as pastel fills with deep labels.
- **Null/zero/empty:** null → "—"; zero count → "None"/empty state; empty list → `<EmptyState>`.
  A zero denominator renders "—", never "₹0" or "0%".
- **Truncation:** CSS `text-ellipsis` / `-webkit-line-clamp`; never truncate page titles, critical
  IDs, or identity names. A truncated cell that carries meaning gets a `<Tooltip>` with the full
  value (the leads Campaign cell is the reference).

## 6. Toast system

`useToast()` (singleton) → `toast-provider.tsx` renders the stack (mounted in the **layout**, so a
deferred commit survives navigation); `toast-item.tsx` runs the lifecycle. **Max 3 in DOM** (the 4th
queues); arrival stagger, exit fade 250ms. A left-edge **living bar** counts down
(`toast-deplete`, scaleX 1→0, linear, = lifetime). Types: success/warning/info (auto-dismiss ~4s),
**danger (never auto-dismisses)**, loading, elaya (breathing glyph, accent tint), and **undo** —
`toast.undo(title, { action, onTimeout })`: a charcoal toast with an accent Undo pill and a 2.5px
accent depletion bar over `UNDO_WINDOW_MS` (5s). **The bar is the countdown**, so there is no
hover-pause and no X, and the timeout runs the deferred commit.

## 7. Page transitions

- **List → list:** paper content opacity + y (8→0, up to 500ms).
- **Drill-down (list → detail):** list recedes `x 0→-16`, detail arrives `x 24→0`; return reverses.
- **Modal/sheet:** enter `opacity0 y10 scale0.98 → 1/0/1` (350ms); exit `opacity0 scale0.97` (150ms).
- **There is no route veil and no route progress bar.** Navigation feedback is each route's
  `loading.tsx` skeleton. A tap that gates on a fetch before opening a modal shows `LoadingVeil`.
- **What does NOT transition:** the sidebar, the TopBar shell, notification badges, the sidebar
  avatar — and the canvas itself.

## 8. Data-visualisation colour rules

- **≤3 colours per chart.** Palette: primary `--theme-accent` · secondary `--theme-accent-muted` ·
  tertiary a 35% accent mix. Comparison/benchmark series = tertiary text only. 4+ series → the
  pastel/`--status-*` families, never palette rotation.
- **Per type:** bar — corner radius 6, top corners only; line — 2px stroke (area uses a token
  gradient); donut — optional `centerLabel`; progress/ring — a single accent on a transparent track.
- **Surface/tooltip:** `ChartFrame` is a **raised gradient panel, never a well**; the tooltip sits on
  `--neu-surface-high` + a hairline; grid lines are warm putty dashes (`--neu-chart-grid`,
  `rgba(166,156,140,0.22)`).
- **Recharts bridge (V-12):** `useChartTokens()` resolves CSS vars → hex on mount and re-resolves on
  **`data-theme` *and* `data-neu`** change (MutationObserver); returns `series[6]` + grid/axisLabel/
  tooltipBg/Border. `resolveColorMap(map)` resolves a `Record<string,'var(--…)'>` for `BarChart`'s
  `colorMap`. **Never pass a CSS var straight to a Recharts `fill`/`stroke`.** Seed
  `initialDimension` to avoid the `width(-1)` warning. The pre-paint `FALLBACK` constants are a
  sanctioned V-01 exception.
- **Domain line colours** (`--domain-*`, viz-only, theme-invariant): concierge `#4a8fc9` ·
  onboarding `#d4a017` · finance `#3dab7a` · marketing `#c45cb4` · tech `#e07840` · shop `#5cb8c4` ·
  business `#8868c8` · house `#c48840` · legacy `#6a8c6a`. Canonical record `DOMAIN_LINE_COLORS`.
- **Charts are code-split.** There is no chart in the mobile chunk by decision — the `/m` rooms use
  the neu `ProgressCard` instead of a Recharts meter.

## 9. Addenda

**Lead-status colours are theme-invariant** — the psychological meaning must not drift with the
accent. The family is `{text, light, border, solid}` per status (new / touched / in_discussion / won
/ nurturing / lost / junk); under the bridge the fills render as the pastel family and the labels as
the deep tone, but the *mapping* is fixed. `--status-*-solid` fills are a sanctioned V-01 exception
for charts.

**Drawer/sheet:** off-canvas; width 100% mobile / 360–480px desktop; the scrim is `--neu-scrim` at
z-overlay; the panel is a raised surface with `--neu-radius-panel` (top corners on mobile);
swipe-to-dismiss on the bottom sheet.

**Scroll:** `.scrollable` / `.sidebar-scrollable` — `overflow-y:auto`, `overscroll-behavior:contain`,
momentum touch; custom 4px scrollbar with warm putty thumbs. A horizontal scroll rail (the mobile
filter bar) needs vertical padding + compensating negative margins, or `overflow-x: auto` clips every
child's raised shadow top and bottom.

**Backdrop blur** only on the TopBar, the mobile sidebar overlay, the command palette, and
`.serene-condense-header`. Never on cards, dropdowns, or modal overlays.

**Keyframes:** `serene-shimmer-sweep` (skeleton sheen) · `serene-elaya-breathe` /
`serene-neu-*` idle loops (breathe 3s, typing dots 1.2s, halo 2.6s, ✦ twinkle 5s) ·
`serene-page-dot-blink` (2.4s) · `serene-logo-trace` (the mandala draw) · `.serene-logo-spin` ·
`serene-check-draw` (400ms) · `serene-ring-pulse` (700ms, once) · `serene-petal-fall` ·
`toast-deplete` · `serene-neu-listening`. **Every loop is `prefers-reduced-motion` gated**, and the
brand mark rests finished and still. (`serene-progress-sweep` was deleted with the boot progress bar.)

## 10. Component library index (`src/components/ui/`)

- **Core:** `Button` · `MotionButton` · `Avatar` · `AvatarStack` · `BackButton` · `SeedMandala` ·
  `LogoSpinner` (+ `LoadingVeil`).
- **Input + selection:** `SearchBar` · `.serene-input` (class) · `MessageBar` ·
  `PasswordStrengthBar` · `Toggle` · `Calendar` (with the additive `onMonthChange`) · `DatePicker` ·
  `TimePicker` (wheels **plus** a typed `TimeTypeInput` accepting `9`, `930`, `9:30`, `9.30`,
  `21:30`, `9:30 pm`) · `DictationButton` · `CheckTile`.
- **Navigation + structure:** `TabSelector` · `FilterDropdown` · `FloatingPanel` (+ `usePortalAnchor`)
  · `SectionCard` · `Dialog` · `modal.tsx` · `ConfirmDialog` · `CollapseReveal` · `InfoRow` ·
  `StatTile` · `EmptyState` · `PageSkeletons` · `FilterBar` · `DateRangeFields` /
  `DateRangePresetList` · `TaskFormFields` · `Carousel` (+ `hideControls`) · `CommandPalette` ·
  `Tooltip` · `RowMotion` (`<MotionRow>`) · `AnimatedNumber` · `Num` · `PetalFall` · `ChatMarkdown`.
- **Data display:** `Table` (generic, `previewRows`) · `.status-pill` utilities (no standalone
  Badge.tsx) · `.skeleton` class + `ChartSkeleton`.
- **Charts (`charts/`):** `useChartTokens` · `CartesianChartFrame` (`ChartFrame` +
  `cartesianDefaults` + `CARTESIAN_MARGIN`) · `BarChart` · `ChartSkeleton`. **The five wrapper
  components `AreaChart` / `LineChart` / `PieChart` / `DonutChart` / `ButterflyChart` were deleted**
  (2026-07-02) — live consumers import raw Recharts plus the frame. Never recreate them.
- **Elaya & toast:** `elaya-glyph` (`ElayaGlyph` + `ElayaGlyphDisc`, breathing, with a `thinking`
  state) · `toast-provider` / `toast-item`.
- **Layout (`components/layout/`):** `MotionProvider` · `CommandPaletteProvider` ·
  `NotificationsProvider` · `CondensingPageHeader` · `AppBootScreen` · `Sidebar` · `TopBar` /
  `PageControls` · `ThemeInitializer` / `IconInitializer`.
- **Deleted, never recreate:** `Spinner` (→ `LogoSpinner`), `RouteVeil`, `ComboboxDropdown`
  (→ `FilterDropdown multi={false}`), `Checklist`/`ChecklistItem`/`ProgressBar`/`RadioGroup`, the
  five chart wrappers, `src/lib/utils/chart-tokens.ts`, `DomainHealthGrid`,
  `LeadDossierTasksAsync`.
- **Canonical-by-composition (not separate tsx):** Card = `SectionCard`; form field =
  `.serene-input` + `.label-micro`; card header = `<CardHeader>`.
