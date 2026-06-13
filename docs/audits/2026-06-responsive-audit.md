# Responsive Audit — 2026-06-12

> **Goal:** Serene flawless at four widths — mobile (~375), tablet (~768), laptop (~1280),
> large (1536+) — and under browser zoom. Zoom shrinks the effective viewport width, so
> correct breakpoints + zero fixed-width assumptions = smooth zoom for free.
>
> **Method:** full read of the shell/layout code, every primary surface walked against
> DESIGN-DNA §2.7 / §9 / §12, plus greps for fixed pixel widths, hardcoded media
> queries, `window.innerWidth` reads, fixed grid templates, and charts without
> responsive containers.
>
> **Status legend:** ✅ fixed in this phase · 🔜 follow-up phase (planned below) · ✓ already correct

---

## 0. The headline finding

**The responsive law already exists; the implementation doesn't.** DESIGN-DNA has a
complete responsive spec — §2.7 breakpoints, §9.2 per-element behaviour table,
§9.3 mobile rules R-01–R-06, §12 touch standards. The code, however, is desktop-only:
**only 10 of ~200 component files use a responsive Tailwind prefix at all**, the
Sidebar is an unconditional 240px flex child, and the sanctioned "mobile sidebar
overlay" (one of the three V-06 blur surfaces) does not exist anywhere in the code.

So this audit is a **law-vs-code gap analysis**, not a proposal for new law. The only
new decisions needed are implementation-level (recorded in §2 below and in
`docs/design/decision-log.md`).

*(Naming note: DESIGN-DNA §9.3 uses "RULE R-01…R-06" internally. These are unrelated
to The_Rules.md §0 R-rules (Reuse First). Citations below say "DNA R-0x" vs "Rules R-0x".)*

---

## 1. Foundation findings

| # | Finding | Where | Severity | Status |
| --- | --- | --- | --- | --- |
| F-1 | **Tailwind v4 default breakpoints are active and exactly match DNA §2.7** (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536). The `@theme` isolation block wipes `--text-*`/`--radius-*` etc. but deliberately leaves `--breakpoint-*` alone. | `globals.css` `@theme` | — | ✓ (decision D-1: defaults are the scale) |
| F-2 | `body { min-height: 100vh }` — violates DNA R-01 (`dvh`, address-bar jump on mobile). The dashboard shell itself already uses `100dvh` correctly. | `globals.css:78` | M | ✅ |
| F-3 | **No media-query/breakpoint hook exists** (Rules R-01 search done: `src/hooks/` has none). `toast-provider.tsx` hand-rolls `matchMedia("(max-width: 767px)")` with a raw pixel value in a component. | `toast-provider.tsx:22` | M | ✅ `useMediaQuery` hook created, toast-provider migrated |
| F-4 | **Arbitrary breakpoint 820px** in the bento grid CSS and in `dashboard/loading.tsx` — DNA §9.1: "Use only these. No arbitrary breakpoints in components." | `DashboardCanvas.tsx` GRID_CSS, `dashboard/loading.tsx:44` | M | ✅ normalised to 768 (md) |
| F-5 | `--bp-*` tokens exist in `design-tokens.css` §2.7 but are **documentation-only** — CSS custom properties cannot be used inside `@media (…)`. Risk: someone writes `@media (min-width: var(--bp-md))` and it silently never matches. | `design-tokens.css:661` | L | ✅ comment added at the token block |
| F-6 | Page titles are fixed 30px (`--text-2xl`); DNA §9.2 wants 24px mobile → 30px tablet+. | `.type-page-title` | L | ✅ fluid `clamp()` (decision D-4) |
| F-7 | Charts: all 6 wrappers use `ResponsiveContainer` (Cartesian via `ChartFrame`, Pie/Donut/Butterfly individually). No fixed-width chart found. | `components/ui/charts/` | — | ✓ |
| F-8 | Portal anchors (`usePortalAnchor`, `DatePicker`, `TimePicker`, `FilterDropdown`) already re-measure against `window.innerWidth`/`visualViewport` **on open, scroll, and resize** — not mount-only. Zoom-safe (M-06 compliant). | `usePortalAnchor.ts` etc. | — | ✓ |
| F-9 | Very few fixed Tailwind pixel widths exist (`max-w-[480px]` CreatePersonalTaskModal, `min-w-[160px]` AdCreativesManager — both harmless `max`/`min` constraints). The real fixed widths are **inline styles**: 320px/340px side columns, 320px WhatsApp rail, `38% 62%` SubTaskModal zones, `repeat(5, 1fr)` board. Catalogued per surface in §3. | — | — | see §3 |

---

## 2. Decisions (logged in `docs/design/decision-log.md`)

**D-1 — Breakpoint scale: Tailwind v4 defaults, no custom tokens.** The defaults are
byte-identical to DNA §2.7 (`sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`). Custom
`--breakpoint-*` theme keys would add a second source of truth for zero gain. `--bp-xs`
(480) and `--bp-3xl` (1920) have no Tailwind utility and stay reserved — a component
that "needs" them is mis-designed. In CSS files (not components), media queries write
the raw pixel value with a `/* --bp-md */` comment, because custom properties cannot
appear in `@media` preludes. In client JS, viewport queries go through
`useMediaQuery(MQ.mobile | MQ.tabletDown)` from `src/hooks/useMediaQuery.ts` — **never
a raw `matchMedia` string or `window.innerWidth` snapshot in a component.**

**D-2 — Dense-table mobile strategy: card stack below `md`, owned by the table
component.** DNA R-05 is explicit: no horizontal body scroll for data tables on
mobile; each row becomes a card (first column = card header, label:value rows).
Implementation: the table component renders **both** a `hidden md:block` table and a
`md:hidden` card stack — a CSS toggle, not a JS branch, so SSR never mismatches and
zoom transitions are pure CSS layout (M-06). The card stack renders a fixed,
mobile-appropriate field set and **deliberately ignores `useLeadColumnPreferences`** —
stored column prefs describe a desktop table shape and must never drive the narrow
rendering (failure mode #2 in the phase brief). At `md`–`lg` the full table keeps its
existing `overflow-x: auto` container scroll (DNA §9.2 "tablet: horizontally
scrollable table"). Reference implementation: `LeadsTable.tsx`.

**D-3 — Sidebar behaviour: three modes, CSS-driven, drawer state in the Sidebar.**
Per DNA §3.2/§9.2: `lg+` full 240px · `md`–`lg` 64px icon rail (labels hidden,
`title` tooltips) · `<md` off-canvas drawer (full 240px panel, translateX transform,
backdrop with the **sanctioned** V-06 blur) opened from a mobile top strip (hamburger
+ wordmark) that exists only `<md`. The bottom nav bar from DNA §12 is explicitly
*optional* in the DNA and is **deferred** — the drawer alone satisfies "fully usable".
The shell column-stacks under `md` (`max-md:flex-col`), and the paper goes full-bleed
(no gutter, no radius) below `md` — a 12px gutter at 375px is dead weight.

**D-4 — Fluid type for display/H1 only.** `.type-page-title` becomes
`clamp(var(--text-xl), 1.05rem + 1.6vw, var(--text-2xl))` (24px at ~375, 30px from
~810px up). Body, label, and data text stay on the fixed modular scale — fluid body
text breaks the data-dense table rhythm and DNA §9.2 only scales the title tier.

**D-5 — Responsiveness lives in shared primitives, never per-page sprinkle.**
`FilterBar` already owns wrap/scroll behaviour for all four filter bars; the table
mobile strategy lives in the table component; page chrome adapts inside the canonical
layout contract (`p-4 sm:p-6 lg:p-8`); the dossier two-column grid is a shared CSS
class (`.serene-dossier-grid`). A page-level `sm:`/`md:` class is allowed only for page
chrome (padding/heading rows), never for behaviour a primitive should own.

---

## 3. Per-surface findings

Widths tested mentally against code: **375 / 768 / 1280 / 1536+** and 200% zoom
(≈ halved effective width — i.e. a 1280 laptop at 200% behaves like 640).

### 3.1 Shell — layout + Sidebar + TopBar  ✅ (this phase)

- **375:** broken. Sidebar is an unconditional 240px flex child → content gets ~123px.
  No hamburger, no drawer, no bottom nav. The V-06-sanctioned "mobile sidebar overlay"
  does not exist in code.
- **768:** cramped. 240px sidebar + 12px gutters leaves ~504px of paper. DNA wants a
  64px icon rail here.
- **1280/1536+:** correct.
- **Zoom:** a 1280 window at 200% = 640 effective → same breakage as mobile.
- `TopBar.tsx` exists but is **mounted nowhere** — pages render their own `<h1>` rows.
  The hamburger therefore cannot live in a TopBar; the mobile top strip is part of the
  Sidebar component (D-3). `TopBar.tsx` stays as-is (unused, out of scope).
- Fix shipped: three-mode sidebar (D-3), mobile top strip, drawer + blur backdrop,
  body-scroll lock while open (`lockBodyScroll`), close on route change and Escape,
  shell column-stacks `<md`, paper full-bleed `<md`.

### 3.2 Canonical list layout + /leads  ✅ (this phase — reference implementation)

- **Page chrome:** `p-8` fixed (DNA §9.2: px-4 → px-6 → px-8). Title row fine (flex,
  wraps). Fixed → `p-4 sm:p-6 lg:p-8`.
- **Filter bar (`LeadsFilters` → `FilterBar layout="scroll"`):** already sound — single
  nowrap row, horizontal container scroll, hidden scrollbar, search `flex: 1 1 180px,
  max 280px`, every chip `flexShrink: 0`, all menus portaled. Container scroll ≠ body
  scroll, so the sign-off criterion holds. DNA R-05's "filters move to a sheet" is
  deferred (follow-up F5) — the scroll row is usable, not ideal.
- **Table toolbar:** `flexWrap: nowrap` with 4 controls + spacer → overflows the card
  at <~520px, causing **card-internal clipping** (Going Cold + sort + Columns + Export
  ≈ 420px + padding). Status pills already `hidden md:flex`. Fixed → toolbar wraps
  (`flexWrap: wrap` + row gap).
- **Table:** `overflow-x: auto` container scroll — acceptable at `md`+, violates DNA
  R-05 below `md`. Fixed → D-2 card stack `<md` inside `LeadsTable.tsx`: status pill +
  name header, phone / assignee / received rows, tap navigates with the same
  `?from=` href, ≥44px rows. Checkbox selection + column picker + export stay
  desktop/tablet-only (monitoring surface on mobile, DNA §9 philosophy).
- **Pagination/skeleton:** numeric pager and `LeadsTableSkeleton` fit at 375 (pager is
  compact flex; skeleton is % based). No change.
- **Dossier `/leads/[id]`:** `gridTemplateColumns: 'minmax(0, 1fr) 320px'` fixed at all
  widths → at 375 the right column alone exceeds the viewport → body horizontal
  scroll. Fixed → shared `.serene-dossier-grid` class: single column below `lg`, `1fr
  320px` at `lg+`; page padding → `var(--space-4)` → `--space-8` ladder via class.
  (Same pattern applies to `/admin/users/[id]` + `/profile` `1fr 340px` grids —
  follow-up F2 adopts the class there.)

### 3.3 Dashboard bento  ✅ F1 closed 2026-06-12

- Grid is already responsive (12-col, span 6/12, stacks below a breakpoint) — but the
  breakpoint was the arbitrary 820px (F-4) → normalised to 768 in phase 1.
- ✅ F1 (2026-06-12): page + loading on the padding ladder; canvas header wraps
  (greeting vs `shrink-0` control cluster); **`TabsList` scrolls on overflow at the
  primitive level** (hidden scrollbar; nowrap triggers; squeeze-style consumers
  unaffected) — fixes the 5-chip Gia domain pickers at ~340px for every `Tabs`
  consumer; Lead Pipeline stat chips `repeat(5, 1fr)` → `auto-fit minmax(88px, 1fr)`
  with wrapping labels. Widget list rows already carried `minWidth: 0` + ellipsis
  guards — verified, untouched.
- Persisted layout (`serene:dashboard:layout:*`) stores **order + size**, and rendering
  degrades by breakpoint via the span classes — stored config already cannot force a
  desktop shape on mobile. ✓ on the failure-mode check; keep it that way.

### 3.4 WhatsApp split-pane  ✅ F3 closed 2026-06-12

- ✅ Single-pane mode `<md` via `useMediaQuery(MQ.mobile)` in `WhatsAppShell`:
  list OR conversation; back navigation via new `onBack` prop on
  `ConversationPanel` (40×40 ArrowLeft, clears `activeConversationId`).
- ✅ `LEFT_RAIL_WIDTH` constant deleted — rail is `w-full md:w-80`; rail +
  panel-header padding on the responsive ladder; `loading.tsx` mirrors
  (right-pane skeleton `hidden md:flex`).
- ✅ Composer wrappers get `env(safe-area-inset-bottom)` padding (DNA R-02) —
  at the viewport-bottom wrapper in `ConversationPanel`, not inside the
  `MessageBar` primitive (it also lives mid-page in the lead dossier).
- ✓ Conversation rows ≥44px; `dvh` already correct.

### 3.5 Tasks (calendar + group board)  ✅ F4 closed 2026-06-12

- ✅ Board: `.serene-board` (globals.css) — horizontal snap-scroll rail `<lg`
  (`grid-auto-columns: min(78vw, 260px)`, snap mandatory), `repeat(5,
  minmax(180px, 1fr))` + container scroll at lg+. Add-subtask panel
  `w-full md:w-80`, FAB stack full-width + safe-area inset `<md`.
- ✅ `MyTasksCalendarView`: 280px sticky calendar column + list now stack `<md`
  (`flex-col md:flex-row`, calendar `w-full md:w-70`); day cells are 44px when
  `taskDots` render — tap targets pass.
- ✓ `TasksFilters` composes `FilterBar layout="wrap"`.
- ✅ `SubTaskModal`: zones stack into one scrolling column `<md` (placements
  moved to `md:col-start-*` classes; icons order-first; Zone B `60dvh`);
  `90vh → 90dvh`; fixed `left: 240px` wrapper offset → `left-0 lg:left-60`.
- ✅ `CreateGroupTaskModal` internal rows `grid-cols-1 sm:grid-cols-2/3`.
- ✅ `/tasks` + `/tasks/[id]` + loading on the padding ladder.

### 3.6 Modals + floating panels  ✅ F5 closed 2026-06-12

- ✅ `Dialog` bottom sheet `<md` (DNA R-06): overlay `items-end` + no gutter below
  md, panel `rounded-t-xl` only + `max-h-[90dvh]` + safe-area padding; centered
  dialog with the space-4 gutter from md up; exit-animation contract untouched;
  `size="full"` unchanged. One change serves every `modal.tsx`/`Dialog` consumer.
- ✓ `ConfirmDialog`, `FloatingPanel`, `DatePicker`, `TimePicker`, `FilterDropdown`:
  portal + flip + `visualViewport` listeners verified, untouched.
- ✅ `CreateGroupTaskModal` internal grids stacked `<sm` (shipped in F4).

### 3.7 Performance / Campaigns / Settings / Admin  ✅ F2 closed 2026-06-12

- ✅ `FounderPerformanceShell` Domains-tab skeleton + `DomainOverviewPanel` domain
  cards: `repeat(2, 1fr)` → `grid-cols-1 md:grid-cols-2`.
- ✅ `CoreFourGrid` KPI row → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (was a
  non-wrapping flex row); `EffortGrid` → `grid-cols-2 lg:grid-cols-4`; skeleton
  fallbacks mirror; Today-tab hero pair stacks `<sm`, pipeline counts wrap.
- ✅ `/admin/users/[id]`, `/profile`, `NewUserClient`: inline `1fr 340px` grids →
  `.serene-dossier-grid serene-dossier-grid--340` (new modifier in globals.css — one
  class, one variant, no fork).
- ✅ `CampaignMetricsStrip` (+ skeleton): inline `repeat(2, 1fr)` was overriding the
  `md:`/`lg:` classes (2-wide at every width, desktop included) — column count now
  classes-only. `DealsSummaryStrip` 2×2 grid `<sm`; `DealCard` zones wrap.
- ✅ `AgentSettingsTable`: already a wrapping card list, not a `<table>` (stale
  finding) — D-2 satisfied structurally; real bug was the shift-controls group's
  `flex: 0 0 auto` (couldn't shrink below ~500px) → `1 1 auto` + `minWidth: 0`.
- ✅ All §3.7 pages + loading files on the `p-4 sm:p-6 lg:p-8` ladder.
- ✅ **Audit miss, fixed same day:** `ManagerPerformancePanel` (manager/founder
  Agents view) was a fixed `268px` roster + `flex: 1` detail row at all widths —
  not in the original §3.7 list. Now stacks `<md` (`flex-col md:flex-row`,
  roster `w-full md:w-67`); `AgentDetailPanel` stat row wraps (`StatAtom`
  `flex: 1 1 140px`).
- ✅ **Audit miss #2, fixed same day:** `UsersTable` `UserCard` was a
  non-wrapping flex row with ~340px of unshrinkable fixed-basis zones — the
  "card-list pages mostly degrade fine" finding was stale for it. Now
  `flexWrap: wrap`, domain zone `0 0 auto`, Edit link `.serene-touch`.

### 3.8 Auth  ✅ F5 closed 2026-06-12

- `min-h-dvh` + centered card + `overflow-hidden` decorative layers (orbs/mandala are
  absolute and clipped — fixed 680/1200px sizes are fine). Card is width-constrained
  and the auth layout already passes at 375. No body horizontal scroll. Forms stack
  vertically ✓.
- ✅ 320px pass: all four `.serene-auth-card` surfaces ease horizontal padding to
  `px-6 sm:px-8` (was fixed `--space-8`); 26rem card + `mx-4` fits 320.

---

## 4. Sign-off state for this phase

| Criterion | State |
| --- | --- |
| `pnpm tsc --noEmit` clean | ✅ |
| No body horizontal scroll at 375/768/1280/1920 + 200% zoom — shell + /leads | ✅ (shell stacks; dossier grid collapses; table card-stack `<md`, container-scroll `md`) |
| Shell + /leads fully usable at all four widths | ✅ |
| Modals + floating panels reachable within visualViewport | ✅ (pre-existing `usePortalAnchor`/`Dialog` behaviour, verified) |
| Tap targets ≥40px on mobile (shell + /leads) | ✅ drawer nav 40px rows, mobile header 40px hamburger, card rows ≥44px, toolbar buttons 36→40px under coarse pointer (`.serene-touch` rule) |
| No hardcoded breakpoint pixel values in components | ✅ — no JS logic branches on a raw pixel anymore (`toast-provider` → `useMediaQuery`). Raw px appears only inside stylesheet rules — `.css` files and the bento's injected `GRID_CSS` string — always at a canonical `--bp-*` value with the comment (CSS cannot read custom properties in `@media` preludes) |

---

## 5. Follow-up phases (per-surface plan)

| Phase | Surface | Work | Size |
| --- | --- | --- | --- |
| **F1** ✅ 2026-06-12 | Dashboard widget interiors | Padding ladder, canvas header wrap, `TabsList` overflow-scroll (primitive), pipeline chip grid auto-fit. Legends already wrapped; list rows already guarded | S |
| **F2** ✅ 2026-06-12 | Detail grids + analytics | `.serene-dossier-grid`(+`--340`) on `/admin/users/[id]` + `/profile` + `NewUserClient`; founder/agent perf grids responsive; campaign strip inline-style-vs-class bug fixed; deals strip/card wrap; AgentSettingsTable shrink fix; §3.7 padding ladder | M |
| **F3** ✅ 2026-06-12 | WhatsApp | Single-pane mode `<md` with back nav (`useMediaQuery(MQ.mobile)` + `onBack` on ConversationPanel); composer safe-area inset; rail `w-full md:w-80`; loading mirrors | M |
| **F4** ✅ 2026-06-12 | Tasks | `.serene-board` snap-scroll rail `<lg`; SubTaskModal zone stacking `<md` + `90dvh` + sidebar-offset fix; CreateGroupTaskModal grid stacking; calendar column stacks `<md`, 44px cells | M |
| **F5** ✅ 2026-06-12 | Overlays + polish | `Dialog` bottom-sheet `<md` (DNA R-06, one component serves all modals); auth 320px pass; DNA §12 sweep via `.serene-touch` (Dialog ×, SubTaskModal icons, Calendar nav, WorkDayPicker, clear-shift). Filter-sheet exploration (DNA R-05 second half) deliberately deferred — the FilterBar scroll row stays until a real usability signal | M |

Each follow-up phase must: reuse `useMediaQuery`/`MQ`, keep behaviour in primitives
(D-5), keep responsive change as CSS layout (M-06 — transitions stay
transform/opacity), and add a changelog entry.
