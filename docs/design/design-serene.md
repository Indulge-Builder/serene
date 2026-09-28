# Serene design handoff (snapshot of 2026-07-03)

> **Purpose:** a dated snapshot of the design-department handoff map, written on 2026-07-03 as `docs/design/design.md` (the changelog entry of that day uses that name; the file was later renamed `design-serene.md`). Kept for its history and its enhancement workflow (sections 20 to 22).
> **Audience:** the design team, for history only. Do not build from it.
> **Source-of-truth scope:** none. [DESIGN-DNA.md](./DESIGN-DNA.md) is the law, [design-system.md](./design-system.md) the implementation reference, [control-system.md](./control-system.md) the control contract, [decision-log.md](./decision-log.md) the dated decisions. Where this file disagrees with them, they win.
> **Last verified:** not re-verified. Checked on 2026-09-26 only enough to list what is out of date below; the body is left as written on 2026-07-03.

## Read this first: what this snapshot gets wrong today

This file was written the same day the neumorphic restyle landed and describes the UI just before it. Most of its visual detail is out of date. The main differences, as of 2026-09-26:

| This snapshot says | Today | Where to read the current rule |
| --- | --- | --- |
| A dark textured canvas with grain behind floating cream paper (§1, §6.1, §8.10) | One warm cream material: canvas `#ECE8E1`, an ivory workspace sheet, porcelain cards; the grain is gone | DNA §0 note, §3.1; decision log 2026-07-03, 2026-09-22 |
| Six themes including Martini (§3) | Eight themes: earth, air, water, fire, candy, rose, moss, lilac; Martini retired (migration 0157); dark mode via `data-neu="dark"` and a Light / Dark / Auto preference | DNA §1.0 |
| Buttons use `--radius-sm` 8px; the radius scale is 4 to 32px (§4.3) | Marshmallow radii (control 14, field 22, card 32); the legacy scale is bridged (`--radius-md` 14, `--radius-lg` 22, `--radius-xl` 32) | DNA §2 runtime note; control-system.md |
| The focus ring is a white gap plus accent (§4.4, §8.6, §14) | One focus colour, `--neu-focus-edge`: a hugging frame on text fields, a 2px outline on actions, no rings on applied or open states | control-system.md "Focus and state without rings" |
| Sidebar active state is three layers with a travelling pill (§6.2, §8.1) | Only the active icon gets an accent-gradient tile; rows stay transparent | DNA §3.2 note |
| `EmptyState` has a hero and a bare italic inline line (§7.3) | One anatomy: tile, Playfair italic title, description, one action; `hero`, `inline`, `framed` | DNA §5.99 detail 04 note; design-system.md |
| Card headers on `--theme-paper-subtle` (§7.3) | The themed header surface (`--neu-header-surface`) with `--neu-header-ink` text | decision log 2026-08-10, 2026-09-26 |
| Pills carry a lifted shadow (§8.7) | Status badges are flat | decision log 2026-09-22 |
| Canvas noise 0.68 (§8.10), true dark mode "not planned" (§16) | No noise; dark mode shipped 2026-07-03 | decision log 2026-07-03 |
| `/dev/components` renders every primitive (§7, §18) | Never built; the specimen scripts in control-system.md are the visual check | decision log Open table |
| `WhatsAppShell` two panels with `ConversationRow` (§9.4) | The Sia layout: `SplitWorkspace` and `ConversationRailRow`; `ConversationRow` is deleted | design-system.md |
| The feature inventory (§9) | Missing everything built since July: Members, Tickets, Sia, Freshdesk, Books, Vendors, Subscriptions, the `/m` layer, Teach Elaya, and more | the page and module docs under `docs/pages/` and `docs/modules/` |

If you use the enhancement template in section 20, check all eight themes in light and dark mode, not the six it lists.

---

> **What this file is (as written on 2026-07-03).** The complete map of Serene's UI for the design team: the vision, the
> token system, every primitive, every modal, every card, every feature surface, and the rules
> that keep it production-safe. Use it to understand what exists today and to propose
> enhancements against it (Section 20).
>
> **What this file is not.** It is not the law. The law is `docs/design/DESIGN-DNA.md`
> (the full spec, ~7,000 lines) and `src/styles/design-tokens.css` (the exact values).
> If this file and those two ever disagree, they win. This file is the guided tour and the
> working surface for enhancement proposals.

---

## 1. The Vision

Serene is a luxury internal operating system for the Indulge team. The people using it live
inside it 8 to 12 hours a day. Every design decision serves three demands:

- **Calm enough to never tire them.** No noise, no decoration, no motion without meaning.
- **Precise enough to earn their trust.** One elevation system, one radius scale, zero
  hardcoded colours, numbers that transition instead of flashing.
- **Refined enough to reflect the brand.** Playfair Display as the editorial soul, paper
  floating on a dark textured canvas, grain on both surfaces.

The core identity, never up for redesign:

1. **The two-layer shell.** A dark textured canvas behind everything, and a floating cream
   paper content area on top. The paper is not a card. It is a world floating inside another.
2. **Playfair Display for display moments.** Page titles, empty states, Elaya's voice, hero
   text. Every appearance is an event. Used sparingly.
3. **Sidebar left, content right.**
4. **The paper shadow.** Four layers (inner highlight, edge ring, near lift, far halo) that
   make the content float with real depth.
5. **Elaya is a presence, not a chatbot.** Her glyph breathes whenever she is present. A
   static glyph means she is not there.

Everything else, the components, the micro-details, the motion vocabulary, exists to serve
these five things and can be enhanced as long as it keeps serving them.

---

## 2. The Surface Contract

Every text colour decision flows from this table. It is the single most-cited rule in the
codebase.

| Surface                                        | Text token               |
| ---------------------------------------------- | ------------------------ |
| `--theme-paper` (content area)                 | `--theme-text-primary`   |
| `--theme-paper-subtle` (inset areas)           | `--theme-text-primary`   |
| `--theme-canvas` (dark shell)                  | `--theme-canvas-text`    |
| `--theme-accent` fills (buttons, badges)       | `--theme-accent-fg`      |
| `--color-success/danger/warning/info` fills    | matching `*-text` token  |
| Secondary labels on paper                      | `--theme-text-secondary` |
| Placeholders, timestamps, muted                | `--theme-text-tertiary`  |
| Sidebar nav inactive                           | `--theme-sidebar-text`   |
| Sidebar nav active                             | `--theme-sidebar-active` |

Two tokens designers must never confuse:

- `--theme-accent-fg` is the only text colour on accent fills. On Earth it is warm ink
  (`#201808`) on gold. On Martini (`#191a38`) and Candy (`#2b1420`) it is dark ink, because
  pastel accents can never hold white text. Never "fix" these to white.
- `--theme-text-inverse` is for text on the darkest fills only, never on accent fills.

---

## 3. The Six Themes

One attribute on `<html>` (`data-theme`) swaps the entire world: canvas, paper, accents,
borders, badges, shadows, chart colours. Default is Earth. Users pick in `/profile`.

| Theme   | Accent                    | Canvas                          | Character |
| ------- | ------------------------- | ------------------------------- | --------- |
| Earth   | champagne gold `#c9a553`  | warm black `#0d0c0a` + grain + radial washes | the default, warm luxury |
| Air     | slate blue `#54769e`      | blue-black                      | cold altitude |
| Water   | deep teal `#1e7d72`       | teal-black                      | depth, not void |
| Fire    | ember sienna `#c25022`    | brown-black                     | basalt holding heat |
| Martini | periwinkle `#9fa1ff`      | evening indigo `#0a0a16`        | near-white paper with a periwinkle whisper; mint and sky live in the chips |
| Candy   | candy pink `#f9b2d7`      | dark plum `#130a12`             | blush-whisper paper; pastel rainbow in the chips (mint success, powder-blue info, lemon warning) |

Theme depth that designers should know about:

- **Shadows are tinted per theme.** `--shadow-color` is warm black on Earth, blue-black on
  Air, teal-black on Water, amber-black on Fire, indigo on Martini, plum on Candy. Shadows
  are physics, not decoration: a tight contact shadow plus a loose ambient shadow, always.
- **Semantic chips shift per theme.** Success/warning/info/danger light surfaces are
  re-tinted in each theme so a green chip on blue-tinted Air paper does not look warm and
  wrong. See DESIGN-DNA Section 2.1.
- Cosmos, Coffee, and Macha were retired on 2026-07-02. Never re-add a theme without a
  database CHECK migration.
- Theme persistence: `profiles.theme` in the database, mirrored to the `serene-theme` cookie
  so the server stamps `data-theme` with zero flash. The app icon (`profiles.app_icon`)
  follows the identical pattern.

---

## 4. The Token System

All values live in `src/styles/design-tokens.css`. Components never invent values. If a
value does not exist in the token system, it gets proposed and added first, never inlined.

### 4.1 Typography: three voices

- **Geist Sans** (`--font-sans`), the workhorse. UI, body, data, labels. Swiss precision,
  never decorative.
- **Playfair Display** (`--font-serif`), the soul. Page titles, module names, Elaya's voice,
  empty states, hero text. Rare on purpose.
- **Geist Mono** (`--font-mono`), the honest one. IDs, phone numbers, timestamps, technical
  values.

Type scale (1.250 Major Third): `--text-2xs` 10px, `xs` 12px, `sm` 14px (body default),
`base` 16px, `md` 18px, `lg` 20px, `xl` 24px, `2xl` 30px (desktop page titles), `3xl` 36px,
`display` 48px, `giant` 64px (reserved).

Weights: `--weight-light` 300 (Playfair display), 400, 500, 600. **700 exists as a token but
is banned in components; 600 is the maximum.** Tracking: display text is tracked tight
(`-0.03em`), ALL-CAPS micro labels tracked wide (`0.08em` to `0.14em`), body never tracked.

Pre-composed styles (use these, do not assemble tokens by hand): `type-eyebrow`,
`type-page-title` (Playfair, light, 2xl), `type-card-title`, `type-body`, `type-label`,
`type-caption`, `type-mono`, `type-elaya-display`.

### 4.2 Spacing

4px base unit. `--space-1` (4px) through `--space-24` (96px). Card padding is `--space-6`
(24px) default, `--space-5` (20px) compact. Never an arbitrary value in a component.

### 4.3 Radius

`--radius-xs` 4px (chips, kbd) · `sm` 8px (**buttons, inputs, controls**) · `md` 12px
(dropdowns, small cards) · `lg` 16px (cards, dialogs) · `xl` 24px (paper surface, sheets) ·
`2xl` 32px (Elaya surface) · `full` (pills, avatars stay square-md, status dots). Buttons
are always `--radius-sm`, never `md`.

### 4.4 Elevation

| Token            | Use |
| ---------------- | --- |
| `--shadow-0`     | flat, border does the separation |
| `--shadow-1`     | card resting on paper (contact shadow only) |
| `--shadow-2`     | dropdown, popover, tooltip, card hover |
| `--shadow-3`     | modal, drawer, command palette |
| `--shadow-4`     | toast, notification (has an inner top highlight) |
| `--shadow-paper` | the main paper surface ONLY, never on cards |
| `--shadow-focus` | focus ring: 2px paper gap + 4px accent at 55% (the white-gap ring) |
| `--shadow-accent-ring/-glow/-lift` | accent-tinted rings for primary buttons and selected states |

The card border (`1px --theme-paper-border`) is the primary elevation signal; the shadow is
the supporting layer. Hover on cards: border stays, shadow deepens 1 → 2, `translateY(-1px)`.

### 4.5 Z-index scale (never invent a value)

`--z-base` 0 · `raised` 10 · `dropdown` 20 · `sticky` 30 · `sidebar` 40 · `overlay` 50 ·
`modal` 60 · `modal-overlay` 61 (backdrop of a nested modal only) · `modal-nested` 62 ·
`toast` 70 · `cursor` 80.

### 4.6 Motion tokens

Durations: `instant` 100ms, `fast` 150ms, `base` 200ms, `slow` 350ms, `enter` 400ms,
`exit` 250ms, `page` 500ms.
Easings: `--ease-out-expo` (entrances), `--ease-in-expo` (exits), `--ease-spring`,
`--ease-in-out`, `--ease-out-soft`.
Named compositions: `--transition-hover`, `--transition-focus`, `--transition-interactive`,
`--transition-enter`, `--transition-exit`, `--transition-theme`, `--transition-fade`.
Shared Framer constants live in `src/lib/constants/motion.ts` (`ENTER_DURATION`,
`EASE_OUT_EXPO`, `SPRING_CONFIG`, `PAGE_DURATION`). Never re-declare a duration inline.

### 4.7 Overlays

One darkening strategy per job, never hardcoded rgba in a component:
full modal backdrop = `color-mix(in srgb, var(--theme-canvas) 72%, transparent)`;
lighter panel = `--overlay-bg-light`; image scrim = `--overlay-scrim` (theme-invariant).
**No backdrop-filter/blur anywhere except three sanctioned surfaces:** TopBar area, mobile
sidebar overlay, command palette. Cards, dropdowns, and modals never blur.

---

## 5. Motion System

Philosophy: Serene moves the way a well-made door moves. Weight, intent, no slam, no drift.
Motion exists for spatial honesty, state communication, and presence feedback. Never because
it looks cool.

The six rules:

- **M-01** Entrances move on one axis only: `y 6 → 0` + fade. Nothing scales on enter
  (modals are the one codified exception, `scale 0.98 → 1`).
- **M-02** Exits are always faster than entrances (250ms vs 400ms).
- **M-03** One element moves per interaction. The trigger does not animate when the panel does.
- **M-04** Data never flashes; it transitions (counts count up, rows fade in).
- **M-05** Reduced motion is always respected (app-wide via `MotionConfig reducedMotion="user"`).
- **M-06** Only `transform` and `opacity` animate. Never width, height, padding, margin.
  Expand/collapse uses `<CollapseReveal>` (grid-template-rows 0fr ↔ 1fr), never height auto.

The vocabulary (complete; nothing outside this list ships without a documented reason):
standard entrance (y 6, 400ms, out-expo), standard exit (y -4, 250ms, in-expo), modal
enter/exit (scale 0.98/0.97), dropdown enter (y -4, 200ms), card hover lift (CSS only,
translateY -1px), sidebar nav hover (x 2), sidebar active pill (layoutId spring, stiffness
400 damping 30, "it does not toggle, it travels"), button press (whileTap scale 0.97, 80ms),
page entrance (y 8, 500ms, 60ms child stagger), staggered lists (40ms stagger, max 8
animated, rest instant).

Elaya's motion is special and slower (Section 15 below).

Engineering constraints the design team must respect in proposals:

- Framer Motion ships as the slim `m` core via `<MotionProvider>` (LazyMotion strict +
  domMax). Every animated component imports `{ m as motion }`.
- A Framer `transform` on an ancestor breaks `position: fixed` children. That is why every
  floating panel portals to `document.body` (`FloatingPanel`, `Dialog`, `ConfirmDialog`).
  Any new overlay proposal must portal.
- Icon micro-interactions are a closed vocabulary of five: `rotate` (Plus, modal close ×),
  `lift` (send), `drop` (download), `ring` (call), `travel-back` (BackButton). Buttons opt
  in via the `iconMotion` prop. A new variant needs a live consumer.

---

## 6. Layout

### 6.1 The shell

Dark canvas behind everything, `.layout-shell` mounts the flat dashboard shell, the paper
content area floats on `--shadow-paper` with `--radius-xl`. Canvas texture: SVG noise at
frequency 0.68 plus radial accent washes (Earth). The auth screens use `.layout-canvas`
(canvas-dark atmosphere); the dashboard shell never does.

### 6.2 Sidebar

The primary navigation (`src/components/layout/Sidebar.tsx`). The active state is three
layers (surface pill + text colour + the travelling `layoutId` indicator). Nav icons are
15px (an intentional exception to the 16px default). Hosts the NotificationBell and the
"Send feedback" entry. Collapses to a hamburger + overlay below md (one of the three
sanctioned blur surfaces).

### 6.3 Page anatomy (the canonical list-page template)

Every primary list page (`/leads`, `/deals`, `/campaigns`, `/tasks`, ...) is exactly:

1. **Row 1, header:** Playfair `type-page-title` h1 ending in `<span class="page-title-dot">.</span>`
   (the accent dot blinks slowly, 2.4s). Primary CTA top right. `PageControls` cluster sits
   on this row; there is no TopBar anymore.
2. **Row 2, filter bar:** a rounded, bordered `--theme-paper` strip with `--shadow-1`,
   always composed from `<FilterBar>`.
3. **Row 3, content:** table or card list inside `<Suspense>` with a skeleton fallback.

Detail pages (`/leads/[id]`, `/campaigns/[id]`, `/admin/users/[id]`) drop the dot and show
a `<BackButton>` instead. Two content modes: **dense table** (100+ rows, LeadsTable pattern
with column preferences) and **card list** (low volume, staggered motion cards, hover lift).

### 6.4 Responsive

Tailwind v4 default breakpoints. Responsive shell classes live in `globals.css`
("RESPONSIVE SHELL"): `.serene-shell*`, `.serene-sidebar*`, `.serene-dossier-grid` (+ the
340px identity-sidebar variant), `.serene-board` (task board: snap-scroll rail below lg,
5 columns at lg+), `.serene-touch`. Behavioural branches use `useMediaQuery` + `MQ`
(`mobile`, `tabletDown`, `touch`); purely visual differences use CSS `md:` classes.
Dialogs become bottom sheets below md. Filter bars collapse to a single scrolling row.
A bottom navigation bar is a **deferred design target** (DNA Section 12.1), not built.

---

## 7. The 12 Core Components

The composition base. Before any new component is proposed, the question is always: can it
be composed from these?

Button · Input · Badge/Pill · Card · Avatar · Modal · Table · Toggle · Dropdown/Select ·
Search Bar · Message Bar · Skeleton.

All primitives live in `src/components/ui/` and are **display-only**: zero business logic,
zero database calls, every colour a CSS variable. There is no Storybook; the visual test
surface is the role-gated `/dev/components` route which renders every primitive in every
variant. Any enhancement to a primitive must be verified there.

### 7.1 Buttons and interaction

| Component | File | What it is |
| --- | --- | --- |
| `Button` | `ui/Button.tsx` | The canonical button. Variants `primary / secondary / ghost / danger / success`, sizes `xs / sm / md / lg`, `iconLeft/iconRight`, typed `iconMotion` prop, loading state that swaps the icon for a spinner **without changing width**. Primary carries `--shadow-accent-glow` at rest and `--shadow-accent-lift` + translateY(-1px) on hover. Press feedback is pure CSS (`:active scale 0.97`), zero Framer cost. Hover states gated to real pointers. |
| `MotionButton` | `ui/MotionButton.tsx` | `motion(Button)` for standalone primary CTAs pressed repeatedly (AddLeadButton, Tasks header). Pairs with `MOTION_BUTTON_DEFAULTS` (whileTap spring). **Never used on form submits**; `Button` and `MotionButton` are never merged. |
| `BackButton` | `ui/BackButton.tsx` | 36px circular paper icon button on every detail page. Sole consumer of the `travel-back` micro-interaction (arrow exits left, a twin arrives from the right). |
| `Toggle` | `ui/Toggle.tsx` | Switch, sizes sm/md, spring thumb, label + description slots. |
| `DictationButton` | `ui/DictationButton.tsx` | The voice-dictation cluster (mic → record with m:ss counter → transcribe → editable draft, never auto-send). Two variants: `composer` (32px pill inside a MessageBar) and `inline` (28px bordered, form footers). Mounted on all four voice surfaces (Elaya chat, WhatsApp composer, lead notes, CalledModal). Renders nothing when the browser lacks MediaRecorder. |

### 7.2 Identity and display

| Component | What it is |
| --- | --- |
| `Avatar` (`ui/Avatar.tsx`) | Square (`--radius-md`, deliberately not round), 5 sizes, initials fallback with 6 semantic colour pairs picked by name hash (`getInitials` + `hashString`, the only allowed derivation). `selected` adds an accent ring via box-shadow, no layout shift. |
| `AvatarStack` (`ui/AvatarStack.tsx`) | Overlapping group, 2px paper separator rings, `+N` overflow pill, hover spreads via x transform only. |
| `LiaGlyph` (`ui/elaya-glyph.tsx`) | Elaya's custom SVG mark. Breathing (3s opacity 0.35 ↔ 0.85) whenever she is present. |
| `StatTile` (`ui/StatTile.tsx`) | The labelled stat tile. `card` variant (paper chrome, micro-label, 2xl value, coloured sub-line) and `cell` variant (bare centred, mono accent value). Used by campaign metrics, deals summary, oversight tiles. Performance's `MetricCard` deliberately stays bespoke (delta + sparkline + motion). |
| `InfoRow` (`ui/InfoRow.tsx`) | The labelled datum row: optional icon, uppercase micro-label, value, optional copy-to-clipboard, divider, horizontal or stacked. The anatomy for every read-only detail field. Mono for technical values, tertiary `—` when empty. |
| `Spinner`, `PasswordStrengthBar` | Loading spinner (3 sizes) and the 4-segment password strength bar (danger → warning → info → success). |

### 7.3 Containers and cards

| Component | What it is |
| --- | --- |
| `SectionCard` (`ui/SectionCard.tsx`) | The card shell for every section on a single-record detail page: `title`, `description`, `headerRight`, flat chrome (1px border + `--shadow-1` + `--radius-lg`). Never `--shadow-paper`. |
| `CardHeader` (`leads/CardHeader.tsx`) | The dossier card-header strip: icon + uppercase micro-label + right slot on `--theme-paper-subtle`. All 7 lead-dossier cards compose it. |
| `EmptyState` (`ui/EmptyState.tsx`) | The canonical empty state. `hero` variant (64px icon tile, Playfair italic xl title, entrance motion) and `inline` variant (serif-italic tertiary sentence). Optional action. The copy rule: **never "No data available"**; the heading is always Playfair italic with real voice. |
| `CollapseReveal` (`ui/CollapseReveal.tsx`) | The only sanctioned expand/collapse (grid-rows trick). |
| `FloatingPanel` (`ui/FloatingPanel.tsx`) + `usePortalAnchor` | The anchored dropdown mechanism: body portal, flip-up/flip-left, outside close, visualViewport correction, `--z-dropdown`, `--shadow-3`. Every anchored panel in the app rides this pair. |
| `PageSkeletons` (`ui/PageSkeletons.tsx`) | `Shimmer`, `skeletonStagger`, `PageHeaderSkeleton`, `FilterBarSkeleton`, `SkeletonCard`: the shared `loading.tsx` scaffold. Skeleton widths are intentionally non-uniform (a designed detail); skeletons never show under 150ms. |

### 7.4 Navigation and selection

| Component | What it is |
| --- | --- |
| `TabSelector` / `Tabs` compound (`ui/TabSelector.tsx`) | Tab bar with `pill / connected / accent` variants, spring `layoutId` indicator, count badges. Content panes stay in the DOM (display:none) to preserve scroll. |
| `FilterDropdown` (`ui/FilterDropdown.tsx`) | Filter trigger + panel, multi or single select, count badge, `iconOnly` square variant with accent dot, portal option for scroll-row layouts. |
| `SearchBar` (`ui/SearchBar.tsx`) | Controlled search input, 3 sizes, clear button, accent caret, `--shadow-focus` ring. |
| `FilterBar` (`ui/FilterBar.tsx`) | THE list-page filter shell: sliders icon + active count badge, SearchBar, FilterDropdown children, Range (IST presets) + Dates (From → To) floating panels, Clear, trailing slot. Immediate commit only; the Apply/draft model was removed 2026-06-12 and never comes back. Auto-collapses to a single scroll row below md. Composed by all seven filter bars in the app. |
| `Carousel` (`ui/Carousel.tsx`) | The generic swipeable deck (spring track, axis-locked touch, dots + n/total + arrows, keyboard). Distinct from the campaigns ad-video carousel. |
| `MessageBar` (`ui/MessageBar.tsx`) | The chat composer input (Elaya + WhatsApp), `leadingSlot` for the DictationButton, send icon uses the `lift` micro-interaction. |

### 7.5 Data, dates, forms

| Component | What it is |
| --- | --- |
| `Table<T>` (`ui/Table.tsx`) | Generic table for secondary/admin read-only grids (audit logs, users, budget, escalations). Sticky header option; warns in dev above 100 rows without virtualization. Bespoke feature tables (LeadsTable) never adopt it. |
| `ChatMarkdown` (`ui/ChatMarkdown.tsx`) | Markdown-lite renderer for model-authored chat (bold/italic/lists/links/code as React elements, no innerHTML, SSE-safe). |
| `Calendar` (`ui/Calendar.tsx`) | Month grid, Framer slide between months, today dot, range selection, optional 4px task dots (accent/danger by count). |
| `DatePicker` / `TimePicker` | Trigger + popover pickers; DatePicker embeds the time wheel when `showTime`; mobile stacks vertically; both own viewport clamping. |
| `DateRangeFields` / `DateRangePresetList` | The From → To panel body and the IST-anchored quick presets (Today ... Last 3 Months) used inside FilterBar. |
| `TaskFormFields` (`ui/TaskFormFields.tsx`) | `FieldLabel`, `FieldError`, `FormChip`, `PriorityChipRow`, `DueDateField` + IST due presets, `TaskTypeField`. All four create-task modals compose these; a priority chip is never re-drawn inline. |

Form system rules (DNA Section 7): single column default, labels above fields, errors from
`lib/validations/form-errors.ts` in a human voice (never raw Zod, never "Invalid input"),
fields are never cleared on a validation error, submit buttons keep their width while
loading, dirty state guards unsaved changes.

### 7.6 Overlays (the modal system)

| Component | What it is |
| --- | --- |
| `Dialog` (`ui/Dialog.tsx`) | The base overlay + surface. Sizes sm → full. Backdrop is canvas at 72%. `--shadow-4`, `--radius-xl`. Portals to `document.body`. **Bottom sheet below md** (rounded top, max 90dvh, safe-area padding), centered above. Close × rotates. |
| `Modal` (`ui/modal.tsx`) | THE wrapper every modal composes. Standard props: `open, onClose, title, children, footer, maxWidth`. `type="elaya"` enforces the proposal contract: exactly two actions, Dismiss (ghost) + Approve (primary), plus the breathing glyph. |
| `ConfirmDialog` (`ui/ConfirmDialog.tsx`) | The standalone confirm. Owns the z contract (backdrop 50, panel 60) and the body portal. Exactly two actions, `danger` variant, `pending` state. `window.confirm` is banned. |

Z-stacking contract: a nested modal above a modal uses backdrop 61 / panel 62
(AssigneePickerModal above SubTaskModal). Using 61 for a standalone backdrop is the classic
click-blocking bug; ConfirmDialog exists so nobody hand-rolls it.

Loading contract: heavy, rarely-opened modals load on intent via `next/dynamic` (never in
the route's initial chunk); call sites that keep a modal permanently mounted gate render
with `useMountOnFirstOpen` so the exit animation survives.

### 7.7 Toasts

`ToastProvider` + `ToastItem` (`ui/toast-provider.tsx`, `ui/toast-item.tsx`). Bottom-right
desktop, bottom on mobile. Maximum 3 in the DOM, the rest queue. The stack compresses
(scale 1 / 0.95 / 0.90, y 0 / -8 / -14). No left accent bars (banned pattern). Warning
toasts show a depleting timer bar. `loading` type crossfades to its resolved state.
`danger` never auto-dismisses. Hover or focus freezes the timer. `elaya` type carries the
breathing glyph. API is the `toast` singleton via `useToast`.

### 7.8 Charts and data visualisation

- **Token bridge:** `useChartTokens()` resolves CSS variables to hex for Recharts and
  re-resolves automatically on theme change (MutationObserver on `data-theme`).
  `resolveColorMap()` does the same for any variable map. Zero hex ever reaches a chart.
- **Frame:** `CartesianChartFrame` exports the shared paper container, `cartesianDefaults`
  (grid/axis/tooltip/legend props), and margins. `BarChart.tsx` is the only surviving
  high-level wrapper (Area/Line/Pie/Donut/Butterfly wrappers were deleted 2026-07-02;
  live charts import raw Recharts through the frame).
- **Rules:** never more than 3 colours in one chart; series colours come from the
  visualisation palette; domain lines come from `DOMAIN_LINE_COLORS` (`--domain-*` tokens);
  semantic colours (success/danger) only when the data is semantic; chart surface is paper,
  grid is paper-border, axis labels tertiary, tooltip `--shadow-2`.
- **Performance:** Recharts (~90 to 100kb) never sits in a route's initial chunk. Dashboard
  widgets lazy-load per widget; `/performance` charts load per call site with skeleton
  placeholders.
- Chart inventory today: `BarChart` wrapper, `UsageHistoryChart` (stacked daily minutes),
  `CallOutcomeBar`, `AgentActivityTrendChart` (3 series max), `PipelineBar` (segmented
  status bar), `DomainTargetMeter` (radial, 2 colours), `AgentDistributionBar` (categorical
  segments), plus the dashboard widget charts.

---

## 8. The Micro-Details (the things that make it feel expensive)

These ten are documented as permanent (DNA 5.99). Enhancements may refine values, never
remove the idea:

1. The sidebar active state is three layers (pill surface, text shift, travelling indicator).
2. The sidebar logo divider.
3. The page title ends with a blinking accent period (primary nav pages only).
4. Empty states are Playfair italic with a real voice.
5. The card border is the primary elevation signal; shadow is secondary.
6. The focus ring has a paper-coloured gap (2px paper, then 4px accent at 55%).
7. Pill shadows are what make pills feel lifted.
8. Skeleton widths are not uniform.
9. Buttons never change width while loading.
10. The canvas noise frequency is 0.68.

---

## 9. Feature Surfaces (what exists, screen by screen)

Every feature component below is built from the primitives in Section 7. File paths are
under `src/components/`.

### 9.1 Leads (`leads/`, the flagship)

- **List:** `LeadsTable` (the bespoke dense table: column visibility + drag reorder via
  `useLeadColumnPreferences`, persisted per user), `LeadsFilters` (FilterBar, URL-driven),
  `LeadsPagination`, `LeadsSelectionToolbar` + `BulkEditLeadsModal`, `ExportButton` +
  `ExportModal`, `AddLeadButton` + `AddLeadModal` (manual create with duplicate-phone
  banner), `LeadColumnPicker` (dnd-kit sortable, locked columns show a lock).
- **Dossier (detail page):** seven cards all composing `CardHeader`: `LeadInfoCard`
  (InfoRow grid + inline selects), `PersonalDetailsCard`, `LeadNotesSection` +
  `LeadNotesInput` (dictation inline), `LeadTasksCard`, `LeadWhatsAppCard` (conversation
  preview), `LeadDealCard` (whole card links to /deals), `ServiceInterestCard` (the Call
  Intelligence surface: cases + conversation hooks). Plus `LeadJourneyTimeline` (stage
  progression), `LeadActivityLog` (append-only timeline), `StatusActionPanel` (status
  cluster; Called button rings), `CalledModal` (log call + note), `WonDealModal` (won →
  create deal), `CreateLeadTaskModal`, `CampaignVideoModal`, `DynamicFormResponses`.
- **Revival layer:** `RevivalReviewBanner` above the reused table, `ReviveLeadButton`
  (one component, two mounts), `RevivalDossierAction`.

### 9.2 Dashboard (`dashboard/`)

`DashboardCanvas` (react-grid-layout, 12 columns, edit mode with drag/resize, layout in
localStorage per user), `DashboardWidgetSlot` (one code-split chunk per widget, role-gated),
`AddWidgetMenu`, `DashboardDateFilter`, `WidgetSkeleton`. Widgets: `SnapshotCountWidget`
(one big live count, whole card is a link), agent widgets (activity, new leads, pending
calls, tasks), manager widgets (budget fuel gauge, campaigns, cold leads, lead status,
lead volume with period tabs), and `ElayaPresenceCard` (the /elaya chat shrunk into a
widget; it IS the conversation). Domain scoping is global (one selector, no per-widget
domain tabs).

### 9.3 Tasks (`tasks/`)

`MyTasksCalendarView` (the canonical My Tasks: Calendar with task dots + date-grouped
list), `TasksFilters` (client-state FilterBar), `GroupTasksTab` (memoised rows,
CollapseReveal subtasks), `GroupTaskWorkspace` (list/board views, 5-column board at lg,
Realtime, FAB), `SubTaskModal` (THE task detail: brief zone + remarks timeline zone,
checklist, edit mode), `TaskRemarksPanel` (Realtime, optimistic), `AssigneePickerModal`
(nested modal, z 61/62), `CreateGroupTaskModal` (two-column live preview),
`CreatePersonalTaskModal`, `CompletedTasksModal`, `TaskCompletionCircle` (animated toggle),
`TaskStatusIcon` (the one status icon source).

### 9.4 WhatsApp (`whatsapp/`)

`WhatsAppShell` (two panels, Realtime, unread badge), `ConversationList` (debounced search,
infinite scroll), `ConversationRow` (unread dot, resolved badge, active accent),
`ConversationPanel` (header + messages + composer with paperclip and dictation, optimistic
send), `MessageBubble` (inbound/outbound, delivery icons, media), `EmptyConversationState`,
period filter.

### 9.5 Elaya (`elaya/`)

`ElayaChatShell` (THE chat surface: SSE streaming, MessageBar + dictation, daily-cap
banner, presence glyph), `ElayaMessageBubble` (user right on accent, Elaya left on
paper-subtle, assistant text through ChatMarkdown), `ElayaIdentityCard` (glyph tile,
starter prompts, capabilities), `ElayaWidget` (the floating circular presence button on
every page, prefetches on hover), `EmbeddedElayaChat` (the shared embedded body),
`ElayaFeedbackCard`.

### 9.6 The rest, briefly

- **Campaigns:** `CampaignCard`, `CampaignFilters`, `CampaignMetricsStrip` (6 StatTiles +
  distribution bar), `AdCreativeCarousel` + `AdCreativePlayer`, `CampaignAdPanel`.
- **Deals:** `DealCard`, `DealsFilters`, `DealsSummaryStrip` (StatTile cells), `NewDealModal`.
- **Performance:** `AgentPerformanceShell`, `MetricCard` (bespoke: delta + sparkline),
  `CoreFourGrid`, `CallOutcomeBar`, `PipelineBar`, `AgentActivityTrendChart`,
  `FirstTouchScorecard`, `DomainTargetMeter`, `DomainOverviewPanel`, `AgentDetailPanel`,
  `StatAtom` and the full drill-down family (`DrillModalShell`, `LeadDrillModal`,
  `FounderDrillDownDeck` riding the generic Carousel, 7 specific drill modals, drill rows).
- **Admin:** `UsersTable` (FilterBar + Table), user forms, `AdCreativesManager` +
  `AdCreativeFormModal`, `ElayaTrainingManager` + `TrainingAssetFormModal`, usage dashboard
  (`UsageDashboard`, `UsageHistoryChart`, `UsageTodayTable`).
- **Settings:** `SettingsLinkCard`, `AgentSettingsTable`, `SlaPoliciesPanel` (situation
  cards), `RevivalPoliciesPanel`.
- **Profile:** `ProfileAvatarSection` (hover camera overlay on scrim), `ThemeSelector`,
  `IconSelector` (PWA icon), `InstallPrompt`, `NotificationPreferences` (per-category
  toggle matrix), `PushNotificationSettings`, `ElayaPersonaSettings`, `PasswordChangeForm`,
  `FormNotice`.
- **Budget:** `BudgetWorkspace`, `AccountReportSection`, `BudgetTable`,
  `RechargeHistoryTable`, `BudgetSectionHeader`, recharge + ad-spend upload modals.
- **Oversight:** `TeamOverviewGrid` (tier 1), `AgentBreakdownGrid` (tier 2, live online
  dot), `AgentOversightMetricsRow` (tier 3, StatTiles), `AgentTaskList`, `OversightRail`
  (live Realtime activity rail), `OversightStatRow`.
- **Helpdesk / Call Intelligence:** `HelpdeskSearch` (client-side filtering over the full
  library), `CaseListRow` → `CaseDetailModal`, `CaseCard` (dossier), `CategoryTag` (static
  pill) vs `CategoryPill` (filter button), `HookList`, suggestion composer.
- **Notifications:** `NotificationBell` (single dot, **never a number badge**),
  `NotificationPanel` (380px, Playfair "You're all caught up."), `NotificationItem`.
- **Suggestions:** `SuggestionComposerModal` (feedback + up to 4 screenshots),
  `SuggestionInboxClient` (card-list triage).
- **Escalations / Error log:** paper cards wrapping `Table<T>`.

---

## 10. Elaya Design Language (Section 15 of the DNA)

Elaya is the one place the UI is allowed to feel alive rather than calm.

- **Identity:** her colour is always `--theme-accent`; she belongs to the theme. She never
  gets her own colour.
- **The glyph breathes** (3s opacity cycle) whenever she is present. Static glyph = absent.
  This is a hard contract; every surface that shows her mark keeps it breathing.
- **Four surfaces:** the Panel, the full Conversation, the Inline Suggestion (always a
  400ms delay, never instant, so she reads as thoughtful, not eager), and the Action
  Proposal (a card with exactly two actions, Approve and Dismiss, enforced by
  `Modal type="elaya"`).
- **Motion vocabulary:** `liaBreathe` (ships as `serene-elaya-breathe`), `liaDotPulse`
  (three thinking dots that breathe, staggered 0/160/320ms, never bounce),
  `liaMessageArrive` (y 6, 300ms), `liaTypingCursor` (2×16px accent rect, hard
  steps(1) blink, cursors do not fade).
- **Presence indicators:** one dot or nothing. Elaya never shows a number badge.
- **Voice:** long-form uses `--leading-relaxed`; display moments use `type-elaya-display`
  (Playfair light at 48px).
- **Boundaries:** cross-domain insights are always labelled with their source domain. She
  never silently crosses a domain boundary.

---

## 11. Data Display Rules (Section 8 of the DNA)

- Numbers: `formatCount()` and `formatCurrency()` from `lib/utils/numbers.ts` are the only
  formatters. Metric values may use mono.
- Dates: `formatDate()` from `lib/utils/dates.ts`; IST boundary math only from
  `lib/utils/ist.ts`. Relative time in notifications.
- Phones: displayed via the normalized E.164 pipeline, rendered mono.
- Status enums render through config maps (label + colours per status), never ad-hoc
  ternaries. Lead status colours are theme-invariant tokens (DNA Addendum A.4).
- Null/zero/empty: `—` in tertiary for missing values; empty collections get an EmptyState,
  never a blank region.
- Category/status is shown with pills, dots, icons, or semantic badges. **A coloured strip
  on one edge of a card or row is banned.**

---

## 12. Loading, Skeletons, Transitions

- Pulse animation is the shared `.skeleton` class (`serene-skeleton-pulse`).
- Compose `PageSkeletons` blocks in every `loading.tsx`; only bespoke interiors are inline.
- Skeleton stagger, non-uniform widths, minimum 150ms display, crossfade to content.
- Page transitions: standard entrance for same-level navigation, drill-down and return
  transitions for list ↔ detail, overlay transitions for modals. The route progress bar
  (DNA 14.3) is an **unbuilt design target**.
- Theme switching transitions colours over `--duration-slow` via `--transition-theme`.

---

## 13. Iconography

`lucide-react` exclusively. Default 16px (`w-4 h-4`), stroke 1.5. Sidebar 15px (intentional).
Icons are always theme-aware (currentColor from the surface contract). Semantic assignments
are documented in DNA 6.5 so the same concept never gets two icons. The five icon
micro-interactions are listed in Section 5 above.

---

## 14. Accessibility Baseline

- Focus is always visible: the white-gap focus ring (`--shadow-focus`) on every
  interactive element.
- Reduced motion is honoured globally (MotionConfig) plus per-animation gates.
- Hover-only affordances are gated to `(hover:hover) and (pointer:fine)`; touch gets
  visible affordances.
- Touch targets follow DNA Section 12.2 standards on mobile surfaces.
- Data tables carry proper semantics (DNA 8.10); charts never encode meaning in colour
  alone (labels and tooltips carry the value).

---

## 15. The Production Guardrails (the Never-Do list, design edition)

Enhancement proposals that break any of these will not ship:

1. No hardcoded colour anywhere. No `text-gray-*`, `bg-white`, hex, or rgb in a component.
2. No z-index outside the `--z-*` scale.
3. Never animate width, height, padding, or margin. Transform and opacity only.
4. No backdrop blur outside the three sanctioned surfaces.
5. No font weight 700. 600 is the ceiling.
6. No component that both fetches data and renders UI.
7. Never duplicate an existing component, hook, or util; extend it. (The Rules, Section 0.)
8. No raw Zod error text, no cleared fields on validation error.
9. No "No data available" copy, ever.
10. No more than 3 colours in a chart.
11. No skeleton flashed under 150ms.
12. No single-edge coloured border as a category or status indicator.
13. No number badge on Elaya. One dot or nothing.
14. No `window.confirm`, no hand-rolled modal chrome, no non-portaled overlay.
15. Every meaningful change gets a `docs/changelog.md` entry.

Component-architecture rules that protect production performance:

- Heavy modals load on intent (`next/dynamic`), Recharts never in an initial chunk,
  Framer ships as the `m` core only.
- Only list rows are memoised; no blanket memo.
- `Button` for form submits (CSS press, zero Framer); `MotionButton` only for repeated
  standalone CTAs.

---

## 16. Deferred and Unbuilt Design Targets

Known intentional gaps, good first candidates for design work:

| Target | Status | Where specified |
| --- | --- | --- |
| Mobile bottom navigation bar | designed direction, deferred | DNA 12.1 |
| Route progress bar | unbuilt design target | DNA 14.3 |
| Elaya inline suggestions (Surface C) at full breadth | partial (surfaces exist, coverage grows with Elaya Phase 2) | DNA 15.3 |
| True dark mode | not planned, but the semantic-token architecture was built so it would cost 10 values, not 400 files | DNA 0 |
| Customer-facing Elaya persona surfaces | stubbed, upcoming with Elaya Phase 2 | modules/elaya.md |

---

## 17. How the Theme/Perception Layer Hangs Together (for new designers)

- Fonts load once in the root layout (Geist Sans, Geist Mono, Playfair via `next/font`).
- The theme cookie (`serene-theme`) lets the server stamp `data-theme` before paint: zero
  flash. `ThemeInitializer` corrects drift against the database. `ThemeSelector` in
  `/profile` writes both.
- Every chart re-resolves its colours on theme change automatically (`useChartTokens`).
- Shadows, semantic chips, selection colour, and focus ring all derive from the active
  theme, so a theme is one coherent world, not an accent swap.

---

## 18. Where To Verify a Change

- `/dev/components` (role-gated): every ui/ primitive in every variant. Check all six
  themes there.
- The reference implementations named in `CLAUDE.md` (LeadsTable for dense tables,
  CampaignCard/UsersTable for card lists, FilterBar consumers for filter chrome).
- Mobile: Dialog bottom-sheet behaviour, FilterBar scroll row, the dossier grid collapse,
  the task board snap rail.

---

## 19. Authority Map (where the deeper spec lives)

| Topic | Authority |
| --- | --- |
| Full design law, every section cited above | `docs/design/DESIGN-DNA.md` |
| Exact token values, all six themes | `src/styles/design-tokens.css` |
| Component-layer contracts and per-feature rules | `src/components/CLAUDE.md` |
| Engineering constitution (Reuse First, A/S/D/P/V/Q rules) | `docs/rules/The_Rules.md` |
| Design decision history | `docs/design/decision-log.md` |
| System overview for designers | `docs/design/design-system.md` |
| Change history | `docs/changelog.md` |

---

## 20. Enhancement Workflow (how the design department proposes changes)

The goal: we keep shipping polish without ever destabilising production.

**Process:**

1. **Locate the thing.** Find the component in Sections 7 to 9 and read its authority file
   from Section 19. Check `/dev/components` to see it live in all six themes.
2. **Check the guardrails.** If the idea violates Section 15, reshape it until it does not.
   Permanent decisions (DNA Section 10) are not reopened; values inside them can be tuned.
3. **Write the proposal** in Section 21 below using the template. One entry per enhancement,
   smallest useful scope.
4. **Review.** An enhancement is approved when it names its tokens, respects the motion
   rules, works in all six themes, and has a mobile answer.
5. **Ship.** Implementation goes through the normal engineering flow (reuse first, tokens
   only, changelog entry). After shipping, move the entry to "Shipped" with the date.

**Proposal template:**

```markdown
### ENH-NNN — <short title>
- **Surface:** <component / page, file path>
- **Today:** <what it currently does, one or two lines>
- **Proposed:** <the enhancement, precise: tokens, sizes, motion values>
- **Why:** <the user-facing win>
- **Themes checked:** earth / air / water / fire / martini / candy
- **Mobile behaviour:** <what happens below md>
- **Guardrail check:** <any rule this touches and why it still complies>
- **Status:** proposed | approved | in progress | shipped (date)
```

---

## 21. Enhancement Backlog

> Add proposals below using the template. Keep newest on top. Move shipped items to
> Section 22 with their changelog date.

_(empty, ready for the first proposal)_

---

## 22. Shipped Enhancements

_(none yet; entries move here from Section 21 with their `docs/changelog.md` date)_
