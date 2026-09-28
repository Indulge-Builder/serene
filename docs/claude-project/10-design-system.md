# Serene: Design System Reference, buildable detail (Claude Project digest)

> **Purpose:** the values and anatomy needed to build pixel-accurate Serene UI without the repo: the token sheets and how they layer, the material values in light and dark, the base scales, the shell classes, the component families and inventory, and the form, data-display, toast, chart and touch patterns.
> **Audience:** a Claude Project chat building or reviewing UI, and the engineers who use it.
> **Source-of-truth scope:** a digest. The law is `docs/design/DESIGN-DNA.md`; the implementation reference is `docs/design/design-system.md`; shared controls are `docs/design/control-system.md`; prop contracts are `src/components/CLAUDE.md`. `4-design-essentials.md` carries the laws and decisions; this file carries values and anatomy. **When a value here disagrees with the live CSS, the CSS wins.**
> **Last verified:** 2026-09-26. Structure digested from design-system.md, control-system.md and DESIGN-DNA as refreshed that day; the token values below were read directly from `src/styles/serene-neumorphic-tokens.css`, `serene-families.css` and `design-tokens.css`.

**What moved since the August pack:** the 2026-09-22 material revision replaced the July values
wholesale (lighter porcelain surfaces, warm contact shadows instead of paired white blooms, a dark
hairline instead of a white one, shallow inset fields, flat badges, deeper text inks and deep
pastels), and the 2026-09-25/26 passes added the focus colour, the section surface, the gradient
card header, the `Field` / `SelectionButton` / `Checkbox` / `FormSelect` families and the touch
rules. Do not reuse July or August shadow or text values.

## 1. The token sheets and how they layer

`src/app/globals.css` imports, in order:

| # | Sheet | Holds |
| --- | --- | --- |
| 1 | `src/styles/design-tokens.css` | the stock layer: type scale, spacing, z-scale, durations, easings, keyframes, utility classes (`.type-eyebrow`, `.type-page-title`, `.label-micro`, `.status-pill`, `.skeleton` base), the `--domain-*` palette, the per-theme blocks (stock accents, plus the final rose, moss, lilac) |
| 2 | `src/styles/serene-neumorphic-tokens.css` | the material: `--neu-*` surfaces, shadows, radii, inks, pastels, chips; the softened accents for earth, air, water, fire, candy; header, focus, tooltip, palette and chat roles; the `[data-neu="dark"]` block; **the legacy bridge**; recipe classes (`.neu-card`, `.neu-input`, `.neu-well`); the global focus outline, scrollbar and touch rules; the motion loops |
| 3 | `src/styles/serene-mobile.css` | the `/m` layer: `--neu-m-*` scrim, drawer, sheet, indicator tokens (with dark values), mobile idle loops, `.neu-m-touch*` press recipes |
| 4 | `src/styles/serene-families.css` | component families: `--neu-section-bg`, table header and row tokens, `.serene-field*`, `.serene-badge`, `.serene-alert`, `.serene-loading-state`, `.serene-table-row`, `.serene-stat-strip` |
| 5 | Tailwind | utilities, with Tailwind's default theme variables isolated so they cannot collide |

The neu sheet imports after the stock one, so its equal-specificity declarations win; removing its
`@import` line restores the stock look (the revert path). A colour read out of
`design-tokens.css` is probably overridden: read the neu sheet. `pnpm check:tokens` (run before
every build) rejects any token reference that no sheet defines.

## 2. The material (light / dark)

| Role | Token | Light | Dark |
| --- | --- | --- | --- |
| Canvas (the ground) | `--neu-canvas` | `#ECE8E1` | `#28241C` |
| Sidebar rail | `--neu-sidebar` + `--neu-sidebar-gradient` | `#EFEEED` + washes of 18% / 9% accent | `#2A2721` + 12% / 6% |
| Workspace sheet | `--neu-workspace` | `#F6F3ED` (ivory) | `#2D2920` |
| Card | `--neu-surface` | `#FAF8F3` (porcelain) | `#332E25` |
| Raised panel, menu, tooltip body | `--neu-surface-high` | `#FCFAF6` | `#3B3529` |
| Sunken well (insets only) | `--neu-well` | `#EBE9E3` | `#221E17` |
| Section surface (dialog, table header, read-only field) | `--neu-section-bg` | 60% surface-high into workspace | same formula |
| Shadow colour | `--neu-dark` (rgb triplet) | `117 111 99` (warm putty) | `0 0 0` |
| Highlight | `--neu-light` | `255 250 240` | `255 240 214` (candle) |
| Hairline | `--neu-edge` / `-strong` | `rgba(117,111,99,0.14)` / `0.24` (a dark hairline) | `rgba(255,240,214,0.06)` / `0.09` |
| Dialog scrim | `--neu-scrim` | `rgba(56,51,43,0.35)` | `rgba(12,10,7,0.5)` |

`NEU_CANVAS_LIGHT` / `NEU_CANVAS_DARK` in `src/lib/constants/appearance.ts` mirror the canvas for
`<meta theme-color>` and the manifest; the decorative icon plate is the same cream.

**Shadow recipes (light; warm contact shadows with an inner top light):**

| Token | Value |
| --- | --- |
| `--neu-shadow-raised-sm` | `0 1px 2px dark/.16, 0 3px 5px -3px dark/.18, inset 0 1px 0 light/.45` |
| `--neu-shadow-raised` | `0 2px 3px -1px dark/.12, 0 6px 12px -7px dark/.18, inset 0 1px 0 light/.45` |
| `--neu-shadow-raised-lg` | `0 3px 6px -2px dark/.16, 0 12px 24px -12px dark/.24, inset 0 1px 0 light/.45` |
| `--neu-shadow-hover` | `0 2px 3px dark/.16, 0 5px 8px -4px dark/.22, inset 0 1px 0 light/.45` (pair with `translateY(-1px)`) |
| `--neu-shadow-inset` | `inset 0 1px 3px dark/.13` |
| `--neu-shadow-pressed` | `inset 0 2px 3px dark/.22` |
| `--neu-shadow-input` | `inset 0 1px 2px dark/.10`, on `--neu-input-bg` (`linear-gradient(180deg, #EDEBE5, #F5F3EE)`) with `--neu-input-edge` `rgba(117,111,99,0.20)` |
| `--neu-shadow-track` | `inset 0 1px 3px dark/.14`, on `--neu-track-bg` |
| `--neu-shadow-tab-active` / `-knob` | `= raised-sm` |
| `--neu-shadow-tile` | the clay data tile: two inner lights plus two contact shadows |
| `--neu-shadow-chip` | none (a transparent zero shadow): badges are flat |
| `--neu-shadow-modal` | `0 8px 16px -6px dark/.22, 0 24px 48px -16px dark/.30` |
| `--neu-shadow-floating` | `0 12px 32px -8px dark/.28` (command palette, floating panels) |
| `--neu-shadow-shell` | `inset 0 1px 0 light/.45` (the quiet edge of the rail and workspace) |

Dark mode redefines every recipe on the black shadow colour (for example raised-sm
`0 1px 3px black/.30` with a 4% candle highlight; modal `0 16px 40px -10px black/.55`).

**Radii (Marshmallow, the only scale):** card 32 · panel 28 · field 22 · control 14 · tile 18 ·
chip 14 · pill 999. Bridged legacy names: `--radius-sm` 10px, `--radius-md` 14px, `--radius-lg`
22px, `--radius-xl` 32px.

**Text inks:** light `--neu-text-primary #38332B` · `-secondary #6C6359` · `-tertiary #70665C` ·
`-disabled #C4BCAE`; dark `#E8E0D4` · `#B9AF9F` · `#ABA18F` · `#55503F`. The warm white on a
deep fill is `--neu-on-accent-soft #FDF9F0`. Every measured text pair passes 4.5:1.

**Accent roles (theme-derived, never hardcoded):** `--neu-accent` = `--theme-accent`;
`--neu-accent-deep` = `--theme-accent-muted` (text-safe on cream); `--neu-accent-fg` =
`--theme-accent-fg` (dark ink on fills); `--neu-accent-gradient` = 145deg from the accent 88% into
white to 90% into black; `--neu-accent-wash` 16% (14% in dark); `--neu-accent-btn-edge` a white
25% hairline on primary buttons. In dark the accent lifts (82% into white; deep 66%). The eight
accent values are in `4-design-essentials.md`.

**Card header tokens:** `--neu-header-top` (9% accent into the section surface), `--neu-header-wash`
(14%), `--neu-header-surface` (160deg gradient top → wash), `--neu-header-highlight` (1px inner top
light), `--neu-header-edge` (12% accent into the hairline), `--neu-header-ink` (the accent-fg 82%
into the wash; dark: the deep accent), `--neu-header-icon` (the accent-muted; dark: the accent),
`--neu-header-description`.

**Focus:** `--neu-focus-edge` = 35% `--theme-accent` into `--theme-accent-muted`; `--neu-focus-ring`
= a 1px focus-edge ring on raised-sm (no outer bloom).

**Pastel support family (theme-invariant), each with a text-safe deep:** sage `#A9C4A0` / `#4C6345`
· powder `#A3BFD6` / `#465E73` · butter `#E3CB96` / `#6A5C36` · lilac `#B3A9D4` / `#5D547A` · peach
`#E5B896` / `#795237` · teal `#8FBFB5` / `#42635D` · danger `#D98E85` / `#85483F`. Aliases:
success → sage, info → powder, warning → butter. In dark the fills darken and the deeps lighten.

**Chip pairs (fill / ink):** sage `#DCE8D6` / `#4C6345` · powder `#D9E4EE` / `#465E73` · butter
`#F0E4C8` / `#6A5C36` · rose `#F0D9D4` / `#85483F` · lilac `#E2DDEE` / `#5D547A` · teal `#D6E8E4` /
`#42635D` · neutral `#E9E4DB` / `#625C52`.

**Charcoal family (the one dark-first vocabulary):** `--neu-charcoal #2D2920`,
`--neu-charcoal-text #F1EDE6`, two charcoal shadows, `--neu-palette-scrim rgba(56,51,43,0.28)`.
Used by the tooltip (inverts to cream on charcoal in dark), the undo toast (a raised panel in dark),
the command palette, and Elaya's glyph disc (`--neu-glyph-disc`).

**Brand-fixed values (never theme-tinted):** `--neu-success-gradient` `#B8CFAF → #98B58E` with ink
`#26301F` (the save morph); `--neu-petal-gradient` `#E8CFA0 → #C08A4E` (the Won petals); the mandala
stops `--neu-mandala-from #2B1D10` / `-to #C08A4E` and the disc pair `#E8CFA0 → #C08A4E`.

**Chat and tables:** `--neu-chat-user-bg` (12% accent into the card; Elaya and WhatsApp share it);
`--neu-table-header-bg` (the section surface), `--neu-table-row-hover` (5% accent; 2% in dark),
`--neu-table-row-selected` (12%; 3% in dark). Chart grid `--neu-chart-grid rgba(166,156,140,0.22)`.

### The legacy bridge (what old tokens resolve to at runtime)

| Stock token | Resolves to |
| --- | --- |
| `--theme-canvas`, `--theme-canvas-text` | the cream canvas and the dark ink (canvas gradients `none`) |
| `--theme-paper`, `-paper-subtle`, `-paper-border` | `--neu-surface`, `--neu-well` (sunken!), `--neu-edge` |
| `--theme-text-*` | the `--neu-text-*` inks; `-inverse` → `--neu-on-accent-soft` |
| `--theme-sidebar-*` | the sidebar material and ink |
| `--color-success/warning/danger/info/neutral` (+ `-light`, `-text`) | the pastel family and chip pairs (theme-invariant) |
| `--color-*-fg` | `--neu-on-accent-soft` in light, the charcoal in dark |
| `--status-*` (text, light, border, solid) | the pastel chips and bases (theme-invariant) |
| `--shadow-1/2/3/4` | raised-sm / raised / raised-lg / modal |
| `--shadow-paper`, `--shadow-gold-shimmer` | `none` |
| `--shadow-focus` | `--neu-focus-ring` |
| `--overlay-*` | warm taupe scrims |
| `--transition-interactive` | the neumorphic spring (220ms transform, 300ms shadow) |

## 3. The base scales (unchanged by the restyle)

- **Type (`--text-*`):** 2xs 10px · xs 12 · sm 14 · base 16 · md 18 · lg 20 · xl 24 · 2xl 30 ·
  3xl 36 · display 48 · giant 64. A 1.250 scale.
- **Spacing (`--space-*`):** px 1 · 0 · 1 = 4px · 2 = 8 · 3 = 12 · 4 = 16 · 5 = 20 · 6 = 24 · 7 = 28 ·
  8 = 32 · 10 = 40 · 12 = 48 · 14 = 56 · 16 = 64 · 20 = 80 · 24 = 96. **There is no 9**; the token
  guard catches `var(--space-9)`.
- **Durations:** instant 100 · fast 150 · base 200 · slow 350 · enter 400 · exit 250 · page 500 ms.
  Framer twins in `motion.ts` (`ENTER_DURATION` 0.4, `EXIT_DURATION` 0.25, `PAGE_DURATION` 0.5 and
  the rest).
- **Easings:** out-expo `cubic-bezier(0.16,1,0.3,1)` (entrances) · in-expo `(0.7,0,0.84,0)` (exits)
  · spring `(0.22,1,0.36,1)` (hover, tap) · in-out `(0.4,0,0.2,1)` · out-soft
  `(0.25,0.46,0.45,0.94)`.
- **Type classes:** `.type-page-title` (Playfair light, fluid 24 to 30px, `--tracking-tighter`) ·
  `.type-eyebrow` and `.label-micro` (tracked caps, painted `--neu-accent-deep`) ·
  `.page-title-dot` (accent, `serene-page-dot-blink` 2.4s).
- **Z-index:** base 0 · raised 10 · dropdown 20 · sticky 30 · sidebar 40 · overlay 50 · modal 60 ·
  modal-overlay 61 · modal-nested 62 · toast 70 · tooltip 75 · cursor 80 · veil 90 (orphaned) ·
  boot 95.
- **Breakpoints:** Tailwind v4 defaults (sm 640, md 768, lg 1024, xl 1280, 2xl 1536); the `--bp-*`
  tokens are documentation only.

## 4. The shell and layout classes (`src/app/globals.css`)

| Class | What it does |
| --- | --- |
| `.layout-shell`, `.serene-shell` | the cream ground, a flex row at 100dvh with a 12px gap; a column below md |
| `.serene-sidebar` | 240px at lg; a 64px icon rail at md (labels hidden, `Tooltip` carries them); an off-canvas drawer below md (transform and visibility only); a floating rounded card from md |
| `.serene-sidebar-backdrop` | the drawer backdrop below md, 8px blur (sanctioned) |
| `.serene-shell-gutter` / `.serene-shell-paper` | padding `12px 12px 12px 0` around the ivory workspace (`--neu-workspace`, radius 32, hairline, `--neu-shadow-shell`, scrolls, overscroll contained; full-bleed below md) |
| `.serene-mobile-topbar`, `.serene-mobile-trigger` | below md: a floating 40px round trigger on the page title's line at `--z-sidebar` |
| `.serene-page-controls` | the domain selector and bell on each page's title row (`layout/PageControls`) |
| `.serene-condense-header` | the sticky title row of `CondensingPageHeader` (10px blur and hairline past about 24px, paint only) |
| `.serene-elaya-fab` | the floating Elaya button (56px, 48px below md, `--z-sticky`); mains reserve `--elaya-fab-clearance`; `.serene-above-elaya-fab` stacks a page's own floating action above it |
| `.serene-dossier-grid` | detail pages: one column below lg, `minmax(0,1fr) 320px` at lg; `--340` for identity sidebars; `--aside-left` (aside after the main content on a phone) and `--side-first` (aside before); `.serene-dossier-aside--sticky` |
| `.serene-board`, `.serene-board--wide` | the task board (snap rail below lg, five columns at lg) and the eight-column ticket board (always a rail) |
| `.serene-dashboard-grid` | the react-grid-layout canvas: a read-only single column below 768px, capped at 1760px |
| `.serene-form-row` | two or three fields side by side, stacking on a phone (`repeat(auto-fit, minmax(min(11rem,100%),1fr))`) |
| `.serene-touch`, `.serene-touch-hit` | a 40px floor for compact controls; an invisible 44px hit area around a tiny drawn control |
| `.layout-canvas`, `.serene-auth-*` | the auth shell only: cream canvas, soft accent glows, the engraved mandala, a raised cream card with the logo medallion (no longer dark) |

**Page patterns.** A list page is `<main className="flex-1 p-4 sm:p-6 lg:p-8">`, then the title row
(`.type-page-title` h1 with the dot, the primary action right, `PageControls`), then the paper
filter strip composing `FilterBar`, then the content in `Suspense` with a skeleton. Dense tables
(the `LeadsTable` pattern, column preferences, a card stack below md) for high volume; card lists
for low volume. A detail page is `BackButton` plus the title (no dot), then `.serene-dossier-grid`
of `SectionCard` / `CardHeader` cards. A conversation page (`/sia`, `/whatsapp`) is
`SplitWorkspace` (a 340px rail card beside a pane card from md, one card at a time below md) with
`ConversationRailRow` rows. Error and 404 pages render inside the shell with a framed `EmptyState`.

## 5. The core components as built

- **Button** (`ui/Button`): eight variants (primary = `--neu-accent-gradient` with
  `--theme-accent-fg` ink and the white 25% edge; secondary = raised neutral; control = the toolbar and filter material with
  `active` for applied; ghost; danger; success; warning; ghost-danger). Sizes xs / sm / md / lg =
  28 / 32 / 36 / 44px, 44px minimum on coarse pointers, radius 14px. Hover = stronger contact shadow
  and a 1px lift (fine pointers); press = inset and scale 0.98, in CSS. `loading` or `status="pending"`
  swaps the left icon for an 18px turning `currentColor` mandala with `aria-busy`, and the width
  never changes; `status="success"` is the sage save morph with a 400ms check draw
  (`useButtonStatus`). `iconOnly` (with `aria-label`), `iconMotion` (the closed set rotate, lift,
  drop, ring, travel-back). `MotionButton` only for repeated standalone CTAs, never a form submit.
- **SelectionButton** / `MotionSelectionButton`: appearance `choice` (raised, selected wash),
  `option` (flat, selected wash, inside a menu), `row` (rich records); the caller owns the ARIA
  state.
- **Field family** (`ui/Field`): `Field` wires label, hint and error ids; `Input`, `Textarea`,
  native `Select` (no consumers) on `.serene-field-control`: the shallow inset (`--neu-input-bg`,
  edge, input shadow), radius 14px, 36px (44px on touch), text 16px on touch. Hover strengthens the
  edge; focus = the hugging `--neu-focus-edge` frame; invalid = a `--color-danger-text` edge and ring;
  read-only on the section surface; disabled 60%. A required field shows a small danger asterisk.
  Older forms use `.serene-input` with the same material.
- **Badge / status pill** (`ui/Badge`, `.status-pill`): flat pastel fill, deep ink, a hairline, no
  shadow, pill radius, `--text-xs` medium. Tones neutral, info, success, warning, danger.
- **Card** (`SectionCard`, `.neu-card`): porcelain `--neu-surface`, `--neu-edge`, radius 32, raised
  shadow; the header strip is `CardHeader` on `--neu-header-surface` (never the well tone).
- **Avatar** / `AvatarStack`: rounded squares, initials via `getInitials` + `hashString` into six
  semantic pairs; a stack shows at most four, then `+N`.
- **Dialog / Modal / ConfirmDialog:** warm `--neu-scrim` with **no blur**; raised modal panel
  (radius 28, `--neu-shadow-modal`); header on the section surface; portaled to `document.body`;
  focus contained (`useModalFocus`: initial focus, Tab trap, Escape, focus return); a re-entrant
  position-fixed body scroll lock; heights capped at 85dvh (90dvh below md); **a bottom sheet
  below md** with `--space-4` gutters and safe-area padding; `pending` blocks the close button, the
  backdrop and Escape; `error` renders above the footer with `role="alert"`. `Modal type="elaya"`
  enforces exactly Approve and Dismiss.
- **Table** (`ui/Table<T>`): header on `--neu-table-header-bg`, row hover and selected tokens, rows
  open with Enter or Space without hijacking nested controls, `stickyHeader`, `previewRows={N}` (the
  first N plus a one-way "Show all N"), a busy state that keeps rows during refresh. Bespoke
  `LeadsTable` keeps its own registry; dense lists become card stacks below md.
- **Toggle** (inset track, accent-gradient knob, optimistic with rollback), **Checkbox** (a real
  `button role="checkbox"`, sizes 16 / 18, indeterminate), **CheckTile** (well → accent gradient, a
  check draw and one ring pulse on user toggles only).
- **FilterDropdown / FormSelect / FloatingPanel:** filter triggers share `filterTriggerStyle`;
  applied = pastel wash and accent ink, open = pressed, no ring; `menuPortal` inside scroll rows;
  arrow keys, Home / End, Escape, focus restore. `FormSelect` is the listbox in a field look (`name`
  for plain posts, `<optgroup>`); never a native select.
- **SearchBar** (sizes sm / md / lg; md is the filter-bar default) and **CommandPalette** (⌘K, cmdk
  engine, 640px panel on the floating shadow over a 3px-blur charcoal scrim; its chunk loads on
  first open).
- **MessageBar:** auto-growing composer; `leadingSlot` hosts `DictationButton`; `sendOnEnter` (a
  bare Enter is a newline on touch); the mandala while sending; the field focus frame on the shell.
- **Skeleton** (`.skeleton`, `ui/PageSkeletons`): the well / surface-high / well sheen over a 200%
  background, 1.8s linear; flat under reduced motion; at least 150ms on screen; non-uniform widths;
  `skeletonStagger` steps 150ms, capped at 600ms. No watermark.

## 6. Forms

- Compose the `Field` family (or `.serene-input` in older forms). Labels are always visible; errors
  come from `lib/validations/form-errors.ts` only (never raw Zod text, never "Invalid input");
  never clear a field on error.
- Choices: `FormSelect`, `DatePicker` (`mode="month"` for months; text ↔ Date helpers in
  `lib/utils/dates.ts`), `TimePicker` (a typed input that accepts `9`, `930`, `9:30`, `9.30`,
  `21:30`, `9:30 pm`, above the wheels), `Checkbox`, `CheckTile`, `Toggle`, radio rows with a hidden
  native input behind a drawn dot. Never a native checkbox, date, datetime-local, month or select.
- Two or three fields side by side compose `.serene-form-row`.
- In a modal: `pending` while saving; the whole-form error in `error`; the footer wraps on a phone.
  Elsewhere an `Alert`. Toasts are for events, never form errors.
- A rejected save keeps the draft; an uncertain transport failure asks the user to check the list
  before retrying (no automatic retries). Recording forms submit with Enter through a native form.
- Phones: `normalizeToE164()` on blur; phone and email fields raise the matching keyboard; no
  `autoFocus` on touch.
- A stored third-party password field is tri-state (`undefined` keep, `null` clear, string
  replace) and never pre-filled. `PasswordStrengthBar`: four segments, danger → warning → info →
  success.
- Not built: an unsaved-changes guard and a multi-step progress bar.

## 7. Data display

- **Counts:** integers; RPC bigints cast with `Number()` in the service; `formatCount` /
  `formatCompact` in components.
- **Numbers:** `StatTile` values are plain mono tabular text; a number inside a sentence in `<Num>`;
  `AnimatedNumber` (NumberFlow, 1.4s) only on the dashboard widgets that keep it.
- **Currency:** INR with Indian grouping (`₹1,00,000`) via `formatCurrency` (also USD, EUR); tiles
  use `formatCurrencyCompact` (₹28.1L, ₹1.2Cr); tables keep the long form. Never convert currency,
  never hardcode a rate; a foreign bill's INR figure is entered by hand.
- **Dates:** `formatDate` (`lib/utils/dates.ts`), IST math via `lib/utils/ist.ts`, timestamps in
  mono, xs, tertiary. Business-hours elapsed time comes from SQL (`business_minutes_between()`).
- **Status:** the status-config pattern over `--status-*`. Lead status colours are theme-invariant
  psychological anchors, drawn from the chip pairs: new = butter, touched = powder, in discussion =
  teal, won = sage, nurturing = lilac, lost and junk = rose.
- **Null, zero, empty:** a null value and a zero denominator both render the em-dash glyph,
  never "₹0" or "0%" (the one place that glyph belongs); an empty list → `EmptyState`.
- **Truncation:** CSS ellipsis or line clamp; never truncate page titles, critical ids or names; a
  truncated cell that carries meaning gets a `Tooltip` with the full value. A foreign id (Freshdesk,
  Zoho, app member) shows as `RevealId` (an icon; hover tooltip, click to reveal and copy).
- **Tiles and strips:** `StatTile` (`card` or `cell`, `size="sm"` for breakdown cells),
  `StatStrip` (a card of cells with optional footer), `MetaLine` (a health dot plus provenance items
  joined by a middle dot), `clayTileStyle` for data tiles.

## 8. Toasts

`src/lib/toast.ts` is the singleton; `toast-provider` (mounted in the layout, so a deferred commit
survives navigation) renders at most **3** at once and queues the rest. Types: success, warning,
info (auto-dismiss), **danger and loading (never auto-dismiss)**, elaya (breathing glyph), and
**undo**: `toast.undo(title, { action, onTimeout })`, a charcoal pill in light (a raised panel in
dark) with an accent Undo pill and a 2.5px accent depletion bar that is the 5-second countdown (no
hover pause, no close; the commit runs on timeout). The standard toast sits on
`--neu-surface-high` with radius 28 and raised-lg. On a phone the stack sits above the composer.
The old left-edge "living bar" on every toast was removed in June.

## 9. Transitions and loading

- Navigation feedback is each route's own `loading.tsx` skeleton. **No route veil, no route
  progress bar, no direction-aware page transitions** (DNA §14 is an unbuilt design target).
- Modal enter: opacity, `y 10`, scale 0.98 → 1 (350ms); exit faster.
- A tap that must fetch before a modal opens shows `LoadingVeil` (open question: replace it with
  an immediate modal plus a skeleton).
- The sidebar, the page controls, badges and the canvas never transition.

## 10. Charts

- Recharts only, never in a route's first chunk; no charts in the `/m` chunk (the rooms use a neu
  `ProgressCard`).
- `useChartTokens()` resolves six series: the theme accent, then powder, sage, butter, danger,
  lilac; plus grid, axis and tooltip colours. `resolveColorMap()` resolves any `var(--…)` map. Both
  re-resolve on `data-theme` **and** `data-neu` (a MutationObserver). Never pass a CSS var to a
  Recharts `fill` / `stroke`. The pre-paint `FALLBACK` palette is a sanctioned hex exception.
- At most three colours per chart. Categorical series use `DOMAIN_LINE_COLORS`, the theme-invariant
  `--domain-*` palette: concierge `#4a8fc9` · onboarding `#d4a017` · finance `#3dab7a` · marketing
  `#c45cb4` · tech `#e07840` · shop `#5cb8c4` · business `#8868c8` · house `#c48840` · legacy
  `#6a8c6a`.
- `ChartFrame` (`ui/charts/CartesianChartFrame.tsx`) draws the plot area as a quiet inset on the
  field material; `cartesianDefaults(tokens)` supplies grid, axis, tooltip and legend props; bars
  round their top corners at 6px; gridlines are warm dashed putty; chart tooltips are light
  (`--neu-surface-high` with a hairline). An empty chart shows `EmptyState`, not empty axes.

## 11. Scroll, sheets, blur, keyframes

- One global scrollbar rule (thin, a warm putty thumb at 30%, 48% on hover, transparent track).
  The workspace contains overscroll. `lockBodyScroll()` is re-entrant and uses a position-fixed lock
  (iOS rubber-banded behind sheets otherwise). Chats follow new messages only while the reader is at
  the bottom and show a "new" pill otherwise. A horizontal scroll rail (the phone filter bar) needs
  vertical padding with compensating negative margins or it clips every child's shadow.
- There is no general drawer primitive: `Dialog` is the bottom sheet below md, the sidebar is the
  phone drawer, `SubTaskModal` is a bottom sheet below md, and `/m` has `MobileBottomSheet` and
  `MobileActionSheet`.
- Blur: only the drawer backdrop (8px), the palette scrim (3px), the condensing header (10px).
- Keyframes in use: `serene-shimmer-sweep` (skeleton), `serene-elaya-breathe`, `serene-neu-dot`
  (typing dots, 1.2s), `serene-neu-halo`, `serene-neu-listening`, `neu-twinkle`,
  `serene-page-dot-blink`, `serene-logo-trace` (the mandala draw), `serene-spin`,
  `serene-boot-fade`, `serene-boot-track` (the boot lockup), `serene-check-draw`,
  `serene-ring-pulse`, `serene-petal-fall`, `toast-deplete`, `serene-row-enter`, the auth
  `serene-auth-*` and orb floats, `neu-m-halo` (mobile). Every loop is reduced-motion gated.

## 12. Touch and responsive

Page padding `p-4 sm:p-6 lg:p-8`. Sidebar: drawer below md, rail at md, full at lg. Dialogs become
bottom sheets below md; filter bars become one scroll row (every `FilterDropdown` child passes
`menuPortal`); dense tables become card stacks. Touch rules from the 2026-09-26 mobile audit: text
fields at least 16px on a coarse pointer (global), buttons, filter triggers and compact fields 44px,
`.serene-selection` rows 44px, `.serene-touch` 40px for compact controls, `.serene-touch-hit` for
tiny drawn controls, a bare Enter is a newline in a composer on touch, `interactiveWidget:
resizes-content`, and drag surfaces offer a touch path (a hold to drag, a "Move to" menu, Move up /
down). The `/m` layer has its own touch scale (see `11-mobile-and-pwa.md`).

## 13. The `src/components/ui/` inventory (63 files)

- **Actions and selection:** `Button`, `MotionButton`, `SelectionButton`, `MotionSelectionButton`,
  `UploadButton`, `RowActions` (`EditDeleteActions`: a labelled control Edit and a ghost-danger
  Delete), `BackButton`, `Toggle`, `Checkbox`, `CheckTile`, `TabSelector` (+ `Tabs*`; arrow and
  Home / End keys), `Carousel` (finger-following, `hideControls`), `DictationButton`.
- **Fields, pickers, filters:** `Field` / `Input` / `Textarea` / `Select`, `FormSelect`,
  `SearchBar`, `MessageBar`, `DatePicker`, `TimePicker`, `Calendar` (`onMonthChange`),
  `DateRangeFields`, `DateRangePresetList`, `FilterDropdown`, `FilterBar` (immediate commit, never an
  Apply button), `Pagination` (rewrites only `page`), `TaskFormFields`, `InlineEdit`,
  `PasswordStrengthBar`, `material-styles.ts` (`filterTriggerStyle`, `clayTileStyle`,
  `choiceStyle`, `optionStyle`).
- **Display:** `Avatar`, `AvatarStack`, `Badge`, `Alert`, `LoadingState`, `EmptyState`
  (server-safe), `InfoRow`, `RevealId`, `StatTile`, `StatStrip`, `MetaLine`, `Num`,
  `AnimatedNumber`, `Table`, `SectionCard`, `ChatMarkdown` (model markdown), `WaText` (people-typed
  WhatsApp text; never merged with `ChatMarkdown`), `ConversationRailRow`, `SplitWorkspace`,
  `SeedMandala`, `LogoSpinner` (+ `LoadingVeil`), `elaya-glyph` (`ElayaGlyphDisc`, `ElayaGlyph`),
  `PetalFall`, `Tooltip`.
- **Overlays, motion, structure:** `Dialog`, `modal` (`Modal`), `ConfirmDialog`, `FloatingPanel`
  (with `hooks/usePortalAnchor`), `CommandPalette`, `toast-provider` / `toast-item`, `RowMotion`
  (`MotionRow`), `CollapseReveal`, `Await` (resolves an un-awaited RSC promise inside `Suspense`),
  `PageSkeletons` (`Shimmer`, `skeletonStagger`, `PageHeaderSkeleton`, `FilterBarSkeleton`,
  `SkeletonCard`, `RailRowsSkeleton`, `EmptyStateSkeleton`).
- **Charts (`ui/charts/`):** `useChartTokens`, `CartesianChartFrame` (`ChartFrame`,
  `cartesianDefaults`, `CARTESIAN_MARGIN`), `BarChart`, `ChartSkeleton`.
- **Layout (`components/layout/`):** `Sidebar`, `PageControls`, `CondensingPageHeader`,
  `DomainSelector`, `AppBootScreen`, `CommandPaletteProvider`, `NotificationsProvider`,
  `ThemeInitializer`, `IconInitializer`, `MotionProvider`, `ServiceWorkerRegistration`,
  `UsagePresence`.
- **Shared pieces outside `ui/`:** `leads/CardHeader` (THE card header strip), `admin/Roster`
  (roster tiles and person chips), `performance/AgentIdentity`, `sia/SiaMessagesPeek` (the mini
  WhatsApp view), `dashboard/DashboardGridSkeleton`, and the `/m` kit in `components/mobile/`.
- **Deleted, never rebuild without a real second call site:** `ComboboxDropdown` (→
  `FilterDropdown` / `FormSelect`), `ListRow`, `Accordion`, `EditButton`, `RadioGroup`, `Checklist`,
  `ChecklistItem`, `ProgressBar`, the five chart wrappers (`LineChart`, `PieChart`, `DonutChart`,
  `AreaChart`, `ButterflyChart`; use raw Recharts plus `ChartFrame`), the arc `Spinner`, `RouteVeil`,
  `TopBar` (→ `PageControls` + `CondensingPageHeader`), `SkeletonWatermark`,
  `whatsapp/ConversationRow` (→ `ConversationRailRow`), `src/lib/utils/chart-tokens.ts`, and the
  `EmptyState` `brand` / `ambient` / `size` props and Button's `suppressFocusRing`.

## 14. Checks and tooling

| Command | Checks |
| --- | --- |
| `pnpm check:tokens` | every `var(--…)` resolves (runs before `next build`) |
| `pnpm audit:ui` (`-- --check`, `-- --json`) | native controls with local styling against `scripts/ui-control-baseline.json` |
| `pnpm check:ui` | tokens, the control baseline and the component contract tests |
| `node scripts/check-theme-contrast.mjs` | browser-computed contrast of theme and material pairs, all eight themes, both modes |
| `node scripts/check-control-keyboard.mjs`, `check-form-workflows.mjs` | real-component keyboard checks and mocked form workflows |
| `node --import tsx scripts/preview-ui-controls.mjs` | regenerates the control specimen |

The browser checks attach to an isolated local Chromium (`SERENE_BROWSER_PORT`, default 9223).
There is no `/dev/components` route.
