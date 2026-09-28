# Serene Design System: Implementation Reference

> **Purpose:** how the design law is built today: the four token sheets and how they layer, the shell and layout classes, themes and dark mode, the `src/components/ui/` inventory, and the shared patterns for forms, states, charts and touch.
> **Audience:** engineers building or changing UI. Designers read [DESIGN-DNA.md](./DESIGN-DNA.md) first.
> **Source-of-truth scope:** implementation reference only. The law is [DESIGN-DNA.md](./DESIGN-DNA.md); where this file and the DNA disagree, the DNA is law and this file is a bug. Shared controls: [control-system.md](./control-system.md). Dated decisions: [decision-log.md](./decision-log.md). Prop contracts for each component: `src/components/CLAUDE.md` (this file does not repeat them). Exact values: the token sheets in `src/styles/`.
> **Last verified:** 2026-09-26 against `src/styles/*.css`, `src/app/globals.css`, `src/components/ui/` (63 `.tsx` files, `material-styles.ts`, `charts/`), `src/components/layout/`, `src/lib/constants/{themes,appearance,app-icons,motion,domain-icons}.ts` and `package.json` scripts.

This file replaces the 2026-07-02 version, which described the dark-canvas UI (six themes, grain, white-gap focus rings, `--radius-sm` buttons). That UI was replaced by the neumorphic material on 2026-07-03.

---

## 1. The idea in one paragraph

Serene is an internal operating system people use eight to twelve hours a day, so it has to be calm, exact and quietly luxurious. Since July 2026 it is built from one warm, soft material (neumorphic, "soft UI"): a cream canvas, an ivory workspace sheet on it, porcelain cards on that, shallow inset fields, and raised actions with warm contact shadows. The theme changes only the accent colour. Playfair Display is the editorial voice (page titles, empty states); Geist Sans does the work; Geist Mono carries numbers and ids. Motion explains; it never decorates.

---

## 2. The token sheets and how they layer

`src/app/globals.css` imports, in this order:

| Order | Sheet | What it holds |
| --- | --- | --- |
| 1 | `src/styles/design-tokens.css` | The stock layer: type scale, spacing, the z-scale, durations and easings, keyframes, the utility classes (`.type-eyebrow`, `.type-page-title`, `.label-micro`, `.status-pill`, `.serene-btn-*` base, `.skeleton` base), the `--domain-*` palette, and the per-theme blocks (the stock accents, plus the final rose, moss and lilac accents) |
| 2 | `src/styles/serene-neumorphic-tokens.css` | The material: `--neu-*` surfaces, shadows, radii, text inks, pastels and chips; the softened accents for earth, air, water, fire and candy; the header, focus, tooltip, palette and chat roles; the `[data-neu="dark"]` block; the **legacy bridge** that re-points `--theme-*`, `--shadow-*`, `--radius-*`, `--overlay-*`, `--color-*` and `--status-*` at the neu roles; the recipe classes (`.neu-card`, `.neu-input`, `.neu-well`, ...); the global focus outline, scrollbar and touch rules; the motion loops |
| 3 | `src/styles/serene-mobile.css` | The `/m` layer: `--neu-m-*` scrim, drawer, sheet and indicator tokens (with dark values), the mobile idle loops and the `.neu-m-touch*` press recipes |
| 4 | `src/styles/serene-families.css` | The component families: `--neu-section-bg`, table header and row tokens, `.serene-field*`, `.serene-badge`, `.serene-alert`, `.serene-loading-state`, `.serene-table-row`, `.serene-stat-strip` |
| 5 | `tailwindcss` | Utilities, with Tailwind's default theme variables isolated so they cannot collide with ours |

Because the neumorphic sheet imports after the stock one, its equal-specificity declarations win. Removing its `@import` line restores the stock values (the revert path). Components read tokens only: a literal colour in a component is a Rule 01 violation, and `pnpm check:tokens` (`scripts/check-tokens.mjs`, run before every build) rejects any token reference that no sheet defines.

---

## 3. Material roles (what to reach for)

| Role | Token | Notes |
| --- | --- | --- |
| Canvas (the ground) | `--neu-canvas` (`#ECE8E1`; dark `#28241C`) | `--theme-canvas` points here. Mirrored as `NEU_CANVAS_LIGHT` / `NEU_CANVAS_DARK` in `src/lib/constants/appearance.ts` for the browser bar and manifest |
| Sidebar rail | `--neu-sidebar` + `--neu-sidebar-gradient` | Two theme washes (18% and 9% accent; 12% and 6% in dark) |
| Workspace sheet | `--neu-workspace` (ivory) | `.serene-shell-paper` |
| Card | `--neu-surface` (porcelain) | `--theme-paper` points here |
| Raised panel, menu, tooltip body | `--neu-surface-high` | A real step above the card in dark (`#3B3529`) |
| Sunken well | `--neu-well` | `--theme-paper-subtle` points here. Insets only (tracks, skeleton ground), never a header or row |
| Section surface | `--neu-section-bg` | Dialog headers, table headers, read-only fields |
| Card header strip | `--neu-header-surface`, `--neu-header-edge`, `--neu-header-ink`, `--neu-header-icon` | The theme-coloured zone of a card; tune only in the neu sheet |
| Field | `--neu-input-bg`, `--neu-input-edge`, `--neu-shadow-input` | Shallow matte inset |
| Hairline | `--neu-edge`, `--neu-edge-strong` | `--theme-paper-border` points to `--neu-edge` |
| Shadows | `--neu-shadow-raised-sm`, `-raised`, `-raised-lg`, `-hover`, `-pressed`, `-inset`, `-modal`, `-tile`, `-shell` | `--shadow-1..4` point to raised-sm, raised, raised-lg, modal |
| Text | `--neu-text-primary`, `-secondary`, `-tertiary`, `-disabled` | Warm inks; every measured text pair passes 4.5:1 |
| Theme text on a neutral surface | `--neu-accent-deep` (= `--theme-accent-muted`) | `--theme-accent` is a fill, not small text |
| Accent fill | `--neu-accent-gradient` with `--theme-accent-fg` ink | Pastel accents always take dark ink |
| Selected / applied wash | `--neu-accent-wash` (16%), `.neu-selected` | Never inset |
| Focus | `--neu-focus-edge` | See [control-system.md](./control-system.md#focus-and-state-without-rings--2026-09-25) |
| Semantic chips | `--color-*-light` / `-text` (the pastel chip pairs) | Theme-invariant |
| Chat sender bubble | `--neu-chat-user-bg` | Elaya and WhatsApp share it |
| Scrims | `--neu-scrim` (dialogs), `--overlay-bg-light`, `--overlay-scrim` | Warm taupe; deeper in dark |

**Radii (Marshmallow, the only scale):** card 32, panel 28, field 22, tile 18, control 14, chip 14, pill. The legacy names are bridged: `--radius-sm` 10px, `--radius-md` 14px, `--radius-lg` 22px, `--radius-xl` 32px.

**The surface contract** (which text token goes on which surface) is in the root `CLAUDE.md` and DNA "The Surface Contract", with the as-built notes there.

---

## 4. Themes and appearance

- **Eight themes:** earth (default), air, water, fire, candy, rose, moss, lilac. `THEME_KEYS` in `src/lib/constants/themes.ts` is the vocabulary and the SQL CHECK mirror. The accent values are in DNA §1.0. Retired: cosmos, coffee, macha (0156), martini (0157, moved to lilac).
- **Theme scope:** a theme changes only the accent family. Surfaces, shadows, text, semantic chips, lead status colours and the `--domain-*` palette never re-tint.
- **Where accents live:** `serene-neumorphic-tokens.css` section 2 overrides earth, air, water, fire and candy (scoped `:root:not([data-theme])` so it cannot out-cascade the other blocks); rose, moss and lilac carry their final values in `design-tokens.css`.
- **Theme switching:** `profiles.theme` is the truth, mirrored to the `serene-theme` cookie; the root layout stamps `data-theme` on `<html>` server-side (no flash). `ThemeInitializer` (`components/layout/`) corrects drift; `ThemeSelector` (`components/profile/`) previews and persists, cross-dissolving colours for about 400ms.
- **Dark mode:** `data-neu="dark"` on `<html>`. The preference is `light`, `dark` or `system` ("Auto") in `profiles.appearance` (migration 0158), mirrored to the `serene-appearance` cookie. The root layout stamps it server-side; `system` renders a tiny pre-paint script. `applyAppearanceToDom()` in `appearance.ts` is the only place the attribute flips (it also rewrites `<meta name="theme-color">`). `AppearanceSelector` on `/profile` writes it; `ThemeInitializer` owns the live OS listener for `system`. Components read role tokens and never branch on dark mode.
- **App icon:** `profiles.app_icon` (four picks, `ICON_KEYS` in `src/lib/constants/app-icons.ts`) mirrored to `serene-app-icon`, served through `/api/manifest?icon=`. The default pick is the mark on a white plate; the others sit on cream. The tab favicon is the bare mark. `scripts/pad-app-icons.mjs` renders every raster.
- **Charts** re-resolve on both `data-theme` and `data-neu` (section 11).

---

## 5. The shell and layout classes

All in `src/app/globals.css` unless noted.

| Class | What it does |
| --- | --- |
| `.layout-shell`, `.serene-shell` | The cream ground; a flex row at 100dvh with a 12px gap. Below md it stacks as a column |
| `.serene-sidebar` | 240px at lg; a 64px icon rail at md (labels hidden, `Tooltip` carries them); an off-canvas drawer below md (`transform` and `visibility` only). At md and up it floats as a rounded card on the canvas |
| `.serene-sidebar-backdrop` | The drawer backdrop below md: `--overlay-bg-light` with an 8px blur (a sanctioned blur surface) |
| `.serene-shell-gutter` | Padding `12px 12px 12px 0` around the workspace |
| `.serene-shell-paper` | The ivory workspace sheet: `--neu-workspace`, `--neu-radius-card`, `--neu-edge`, `--neu-shadow-shell`; it scrolls and contains overscroll. Full-bleed below md |
| `.serene-mobile-topbar`, `.serene-mobile-trigger` | Below md only, on primary pages: a floating 40px round trigger on the title line that opens the drawer, at `--z-sidebar` |
| `.serene-page-controls` | The inline domain selector and bell on the page's title row (`layout/PageControls.tsx`) |
| `.serene-condense-header` | The sticky page header of `layout/CondensingPageHeader.tsx`; past about 24px of scroll it paints a 10px blur and a hairline (paint only). Used on Leads, Deals, Tasks, Notes, Budget |
| `.serene-elaya-fab` | The floating Elaya button (56px, 48px below md), bottom right, `--z-sticky`. Scrolling mains reserve `--elaya-fab-clearance` at their foot; `.serene-above-elaya-fab` stacks a page's own floating action above it |
| `.serene-dossier-grid` | Detail pages: one column below lg; at lg `minmax(0,1fr) 320px`. Modifiers: `--340` (340px identity sidebars), `--aside-left` (aside on the left; after the main content below lg), `--side-first` (aside before the main content below lg). `.serene-dossier-aside--sticky` sticks the aside at lg |
| `.serene-board`, `.serene-board--wide` | The task board (snap rail below lg, five columns at lg) and the eight-column ticket board (always a rail) |
| `.serene-dashboard-grid` | The react-grid-layout canvas; single read-only column below 768px; capped at 1760px wide |
| `.serene-form-row` | Two or three fields side by side, stacking on a phone |
| `.serene-touch`, `.serene-touch-hit` | Touch helpers (section 12) |
| `.layout-canvas` | The cream canvas for the auth shell only |
| `.serene-auth-*` | The auth screens: the raised cream card, the logo medallion, the engraved mandala, the orbs |

**Layout components** (`src/components/layout/`): `Sidebar`, `PageControls`, `CondensingPageHeader`, `DomainSelector`, `AppBootScreen` (the boot, once per browser session), `CommandPaletteProvider` (⌘K), `NotificationsProvider`, `ThemeInitializer`, `IconInitializer`, `MotionProvider` (LazyMotion strict + `MotionConfig reducedMotion="user"`, mounted once in the root layout), `ServiceWorkerRegistration`, `UsagePresence`.

### Page patterns

- **List page:** `<main className="flex-1 p-4 sm:p-6 lg:p-8">`, then the title row (`.type-page-title` h1 with `.page-title-dot`, primary action right, `PageControls`), then the paper filter strip composing `FilterBar`, then the content in `Suspense` with a skeleton. The full contract is the root `CLAUDE.md` "Standard Page Layout Contract". Dense tables for high volume (the `LeadsTable` pattern with column preferences and a card stack below md); card lists for low volume.
- **Detail page:** `BackButton` plus the title (no blinking dot), then `.serene-dossier-grid` with `SectionCard`s or `CardHeader` cards.
- **Conversation page** (`/sia`, `/whatsapp`): `SplitWorkspace` (a 340px rail card beside a pane card from md; one card at a time below md) with `ConversationRailRow` rows. Their `loading.tsx` files compose the same pieces.
- **Auth pages:** the cream `.layout-canvas` with the raised `.serene-auth-card`; see DNA §3.7 note and [../pages/auth.md](../pages/auth.md).
- **Error and 404:** `(dashboard)/not-found.tsx` and `error.tsx` render inside the shell with a `BackButton` and a framed `EmptyState`; `app/not-found.tsx` and `app/global-error.tsx` cover the rest.
- **Loading:** every route has its own `loading.tsx` in its own shape, composed from `ui/PageSkeletons`.

---

## 6. Component inventory: `src/components/ui/`

Display-only primitives with no feature imports (Rule 04). One line each; props, variants and edge cases are in `src/components/CLAUDE.md`. "Since" marks components added after the July audit.

### Actions and selection

| Component | What it is |
| --- | --- |
| `Button` | THE button. Variants primary, secondary, control, ghost, danger, success, warning, ghost-danger; sizes xs/sm/md/lg (28/32/36/44px); `--neu-radius-control`; `iconLeft`/`iconRight`, `iconOnly`, `iconMotion`; `loading` / `status` (`idle`, `pending`, `success`) with `useButtonStatus()` for the save morph; CSS-only press. Contract: [control-system.md](./control-system.md) |
| `MotionButton`, `MotionSelectionButton`, `MOTION_BUTTON_DEFAULTS` | Framer wrappers for repeated standalone CTAs and animated rows. Never on a form submit |
| `SelectionButton` (since 2026-09-24) | Choices, menu options and rich rows (`appearance` choice / option / row); the caller owns the semantics |
| `UploadButton` (since 2026-09-24) | The dashed inset file-chooser surface; the caller owns the input and the upload |
| `RowActions` → `EditDeleteActions` (since 2026-09-25) | The labelled Edit (control) and Delete (ghost-danger) pair at the end of a record row |
| `BackButton` | The 36px round back link on detail pages; its label shows as a `Tooltip` |
| `Toggle` | On/off switch: inset well track, accent-gradient knob |
| `Checkbox` (since 2026-09-25) | THE tick box, a real `button role="checkbox"`, sizes 16 and 18, `indeterminate` |
| `CheckTile` | A done-state tile: well to accent gradient, a drawn check and one ring pulse |
| `TabSelector` (+ `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`) | Tabs, variants pill / connected / accent; `SPRING_TAB` indicator; arrow and Home/End keys; panels stay mounted |
| `Carousel` | THE swipeable deck: follows the finger 1:1 with velocity hand-off; `hideControls` for the mobile `DomainSwiper` |
| `DictationButton` | THE voice-dictation cluster (record, transcribe, editable draft); variants composer and inline |

### Fields, pickers and filters

| Component | What it is |
| --- | --- |
| `Field`, `Input`, `Textarea`, `Select` (since 2026-09-25, `Field.tsx`) | The field family: label, hint and error wired by id; native props and refs pass through; `.serene-field-control` material. The native `Select` export is for constraint validation, refs and multi-selects (no consumers today) |
| `FormSelect` | THE form select: the `FilterDropdown` listbox in its field look, `name` for plain form posts, `<optgroup>` support |
| `SearchBar` | Controlled search field, sizes sm/md/lg, clear button, the field focus frame |
| `MessageBar` | THE chat composer: auto-growing textarea, `leadingSlot` for `DictationButton`, `sendOnEnter`, variants default and nested |
| `DatePicker` | Trigger plus popover over `Calendar`; `showTime`, `mode="month"`, `id` for a label |
| `TimePicker` (+ `TimePickerWheelPanel`) | Hour and minute wheels with a typed time input above them |
| `Calendar` | Month grid with task dots and range selection |
| `DateRangeFields`, `DateRangePresetList` | The FilterBar "Dates" and "Range" panel bodies (IST presets) |
| `FilterDropdown` | Filter trigger plus panel; multi or single; applied = pastel wash, open = pressed; `menuPortal` for scroll rows |
| `FilterBar` | THE list-page filter strip: search, dropdown children, Range and Dates, Clear, `leading` and `trailing` slots; immediate commit; a CSS scroll row below md |
| `Pagination` (since 2026-09-11) | THE URL-param pager; rewrites only `page` |
| `TaskFormFields` | `FieldLabel`, `FieldError`, `FormChip`, `PriorityChipRow`, `DueDateField`, `TaskTypeField` for every create-task modal |
| `InlineEdit` (since 2026-09-25) | `EditableValueText`, `FieldSaveFeedback`, `INLINE_EDIT_INPUT_STYLE`: the edit-in-place look for a dossier value |
| `PasswordStrengthBar` | The four-segment strength bar |
| `material-styles.ts` | Style recipes: `filterTriggerStyle(active)`, `clayTileStyle(fill)`, `choiceStyle(selected, tone)`, `optionStyle(selected)` |

### Display

| Component | What it is |
| --- | --- |
| `Avatar`, `AvatarStack` | Rounded-square avatars with hashed initials; overlapping stack with `+N` |
| `Badge` (since 2026-09-25) | Status pill: tone neutral / info / success / warning / danger; flat |
| `Alert` (since 2026-09-25) | Persistent feedback with `role="alert"` for failures, `status` otherwise; optional action |
| `LoadingState` (since 2026-09-25) | A named, quiet wait: one accent dot and a label, `role="status"` |
| `EmptyState` (+ private `EmptyStateEntrance`) | THE empty state: tile, Playfair italic title, description, one action; `hero`, `inline`, `framed`. Server-safe (no `'use client'`) |
| `InfoRow` | The labelled read-only datum row with optional copy |
| `RevealId` (since 2026-09-15) | A foreign id as a small icon: tooltip on hover, mono plus copy on click |
| `StatTile` | The labelled stat: `card` or `cell`, `size="sm"` for breakdown cells; plain mono value (no count-up since 2026-09-15) |
| `StatStrip` (since 2026-09-25) | A card of `StatTile` cells, optional title, aside, footer and dividers |
| `MetaLine` (since 2026-09-25) | The quiet provenance line: a health dot plus items joined by a middle dot |
| `Num` | Wraps a number inside a sentence in the mono number font |
| `AnimatedNumber` | Rolling digits (NumberFlow) for the dashboard widgets that keep them |
| `Table` | Generic admin table: `stickyHeader`, `onRowClick` (Enter and Space too), `previewRows`, a dev warning above 100 rows unless `virtualized` |
| `SectionCard` | The detail-page card shell with the themed header strip |
| `ChatMarkdown` | Model-authored markdown as React nodes (bold, italic, lists, links, code) |
| `WaText` | People-typed WhatsApp text (`*bold*`, `_italic_`, `~strike~`, code, links); never merged with `ChatMarkdown` |
| `ConversationRailRow` (since 2026-09-25) | A conversation rail row: avatar, title and time, one preview line; selected = the avatar ring only |
| `SplitWorkspace` (+ `SplitRail`, `SplitRailHeader`, `SplitRailList`, `SplitPane`, since 2026-09-25) | The two-card conversation layout |
| `SeedMandala` | THE brand mark: eight rings plus the centre ring; variants gradient, currentColor, darkDisc; `draw` and `spin` |
| `LogoSpinner` (+ `LoadingVeil`) | THE loading indicator (the mark at 3.5s per turn, sizes lg/md/sm); `LoadingVeil` is a scrim with a centred spinner |
| `elaya-glyph` → `ElayaGlyphDisc`, `ElayaGlyph` | Elaya's face (the logo on a charcoal disc, `thinking` spins the dark mandala) and her small line mark below 24px |
| `PetalFall` | The deal-won celebration, reserved for Won |
| `Tooltip` | THE hover pill: charcoal in light, cream in dark, 500ms intent, never on touch, `--z-tooltip` |

### Overlays, motion and structure

| Component | What it is |
| --- | --- |
| `Dialog` | The base overlay: `--neu-scrim`, no blur, portaled, sizes sm to full, bottom sheet below md, `pending` blocks dismissal, `error` above the footer, focus contained (`useModalFocus`) |
| `modal` → `Modal` | THE modal wrapper over `Dialog`; `type="elaya"` enforces exactly Approve and Dismiss |
| `ConfirmDialog` | THE standalone confirm; owns the `--z-overlay` / `--z-modal` pair and its portal. Never `window.confirm` |
| `FloatingPanel` | The anchored panel portal, driven by `hooks/usePortalAnchor` |
| `CommandPalette` | ⌘K palette (cmdk engine): actions, live leads, deals and tasks, Go to; a 3px blur scrim (sanctioned) |
| `toast-provider`, `toast-item` | The toast stack (`src/lib/toast.ts` is the singleton): success, warning, danger, info, loading, elaya, undo |
| `RowMotion` → `MotionRow` | THE list-row choreography (enter and exit); the caller owns `AnimatePresence` |
| `CollapseReveal` | THE expand and collapse (`grid-template-rows 0fr to 1fr` plus a fade) |
| `Await` (since 2026-09-16) | Resolves an un-awaited promise from an RSC inside `Suspense` (React 19 `use()`) |
| `PageSkeletons` | `Shimmer`, `skeletonStagger`, `PageHeaderSkeleton`, `FilterBarSkeleton` (`leading`), `SkeletonCard`, `RailRowsSkeleton`, `EmptyStateSkeleton` |

### Charts: `src/components/ui/charts/`

| File | What it is |
| --- | --- |
| `useChartTokens.ts` | `useChartTokens()` (six series: the theme accent, then powder, sage, butter, danger, lilac; grid, axis, tooltip) and `resolveColorMap()`. Re-resolves on `data-theme` and `data-neu` |
| `CartesianChartFrame.tsx` | `ChartFrame` (the inset field material), `cartesianDefaults(tokens)`, `CARTESIAN_MARGIN` |
| `BarChart.tsx` | The one high-level wrapper: top-rounded 6px bars, `colorMap` |
| `ChartSkeleton.tsx` | The chart loading shape |

### Shared pieces that live outside `ui/`

`leads/CardHeader.tsx` (THE card header strip), `admin/Roster.tsx` (roster tiles and person chips), `performance/AgentIdentity.tsx`, `sia/SiaMessagesPeek.tsx` (the mini WhatsApp view), `dashboard/DashboardGridSkeleton.tsx`, and the `/m` kit in `src/components/mobile/` (`IndulgeMark`, `MobileTabBar`, `MobileDrawer`, `DomainSwiper`, `MobileBottomSheet`, `MobileActionSheet`, the rooms). The registry rows are in the root `CLAUDE.md`.

### Deleted: never rebuild without a real second call site

| Removed | When | Use instead |
| --- | --- | --- |
| `ComboboxDropdown` | 2026-06-01 | `FilterDropdown` (`multi={false}`), `FormSelect` |
| `ListRow`, `Accordion`, `EditButton` | 2026-06-10 | extract only when a second call site exists |
| `RadioGroup`, `Checklist`, `ChecklistItem`, `ProgressBar` | 2026-07-02 | `TaskTypeField` radio rows, `CheckTile` |
| `LineChart`, `PieChart`, `DonutChart`, `AreaChart`, `ButterflyChart` | 2026-07-02 | raw Recharts through `ChartFrame` + `cartesianDefaults` |
| `Spinner` (the arc) | 2026-07-03 | `LogoSpinner`, `SeedMandala` |
| `RouteVeil` (layout) | 2026-07-03 | the route's `loading.tsx`; never a route-change overlay |
| `TopBar` (layout) | before 2026-07-02 | `PageControls` on the title row, `CondensingPageHeader` |
| `SkeletonWatermark` | 2026-07-06 | nothing; the mark rests only on empty states |
| `whatsapp/ConversationRow` | 2026-09-25 | `ConversationRailRow` |
| `EmptyState` `brand`, `ambient`, `size` props; `Button` `suppressFocusRing` | 2026-09-25 | the one anatomy; the shared focus outline |

---

## 7. Typography in practice

- **Families:** `--font-sans` (Geist Sans), `--font-serif` (Playfair Display), `--font-mono` (Geist Mono), loaded once in the root layout.
- **Classes that exist:** `.type-eyebrow`, `.type-page-title` (Playfair light, fluid 24px to 30px, `--tracking-tighter`), `.label-micro` (10px semibold tracked caps). The neu layer paints `.type-eyebrow` and `.label-micro` in `--neu-accent-deep`. Any other composition is assembled from `--text-*`, `--weight-*` and `--font-*` tokens.
- **Page title dot:** primary nav `<h1>`s end with `<span className="page-title-dot">.</span>` (a slow 2.4s accent blink). Detail pages use a `BackButton` and no dot.
- **Weights:** `--weight-semibold` (600) is the ceiling; 700 is banned.
- **Numbers:** stat values in mono (`StatTile`); a number inside a sentence in `Num`; money on tiles through `formatCurrencyCompact` (₹28.1L), the long form in tables.
- **Scale and spacing:** unchanged from DNA §2 (1.250 type scale, 4px spacing base). `--space-9` does not exist.

---

## 8. Motion in practice

- Import Framer as `import { m as motion } from 'framer-motion'` (never the bare `motion`); `MotionProvider` throws on the full namespace.
- Every duration, easing and spring comes from `src/lib/constants/motion.ts`: `ENTER_DURATION` 0.4, `EXIT_DURATION` 0.25, `BASE_DURATION` 0.2, `FAST_DURATION` 0.15, `SLOW_DURATION` 0.35, `INSTANT_DURATION` 0.1, `PAGE_DURATION` 0.5; `EASE_OUT_EXPO`, `EASE_IN_EXPO`, `EASE_SPRING`, `EASE_IN_OUT`, `EASE_OUT_SOFT`; `SPRING_CONFIG` (400/30), `SPRING_TAB` (260/32), `SPRING_BOUNCE`; `MODAL_VARIANTS`, `DROPDOWN_VARIANTS`, `DROPDOWN_VARIANTS_UP`, `ROW_VARIANTS`, `FADE_VARIANTS`; `PALETTE_DURATION`, `ROW_DURATION`, `ROW_FADE_DURATION`, `TOOLTIP_DURATION`, `TOOLTIP_INTENT_MS`, `CONDENSE_DURATION`, `COUNT_UP_MS`, `UNDO_WINDOW_MS`. `MOTION_BUTTON_DEFAULTS` lives in `ui/MotionButton.tsx`.
- Only `transform` and `opacity` animate. Expand and collapse use `CollapseReveal`; row arrival uses `MotionRow`.
- Hover effects are CSS and gated to `(hover: hover) and (pointer: fine)`.
- Everything honours reduced motion: `MotionConfig reducedMotion="user"` app-wide plus a `prefers-reduced-motion` gate on every CSS loop.
- The seed mandala never turns faster than 3.5s per revolution (boot 24s, Elaya thinking 8s).
- Icon micro-interactions are a closed set (`rotate`, `lift`, `drop`, `ring`, `travel-back`) opted into with `Button iconMotion`.

---

## 9. Forms

- Compose the `Field` family (or `.serene-input` in older forms). Labels always visible; errors from `lib/validations/form-errors.ts`, never raw Zod text; never clear a field on error.
- Choices: `FormSelect`, `DatePicker` (`mode="month"` for months), `TimePicker`, `Checkbox`, `CheckTile`, `Toggle`, and radio rows with a hidden native input behind a drawn dot. Never a native checkbox, date, month or select input.
- Side-by-side fields compose `.serene-form-row`.
- In a modal: `Dialog` / `Modal` `pending` while saving; the whole-form error in `error` above the footer; the footer wraps on a phone. Elsewhere: `Alert`.
- A rejected save keeps the draft; recording forms submit with Enter through a native form.
- Phones: `normalizeToE164()` on blur; phone and email fields bring up the matching keyboard; forms skip `autoFocus` on touch.
- Workflow rules and the verification scripts: [control-system.md](./control-system.md).

---

## 10. Empty, loading and error states

- **Empty:** `EmptyState` only. A page with nothing in it: `framed` plus the page's sidebar icon. An all-clear: the Serene mark. Inside a card: `inline`. Menus keep a short text line. Copy is calm and specific; never "No data available".
- **Loading:** a route skeleton in the destination's shape (`PageSkeletons`); `LogoSpinner` for a region; the seed mandala inside a pending control; `LoadingState` for a named quiet wait. Skeletons use the sheen (`.skeleton`, 1.8s) and `skeletonStagger` (150ms steps, 600ms cap). No brand mark on skeletons.
- **Errors:** field errors under the field; form errors in `Dialog error` or `Alert`; page errors on the in-shell error page. Toasts are for events, never for form errors.
- **Toasts:** `toast.success/warning/danger/info/loading/elaya/undo` from `src/lib/toast.ts`. Danger and loading never auto-dismiss; `undo` is a 5s countdown.

---

## 11. Charts

- Recharts only, never in a route's initial chunk (lazy per widget or per call site).
- Colours come from `useChartTokens()` / `resolveColorMap()`; never pass `var(--…)` straight to an SVG attribute. Watch `data-theme` and `data-neu` in any new observer.
- At most three colours in one chart. Semantic data uses semantic tokens; categorical series (agents, domains) use the `--domain-*` palette (`DOMAIN_LINE_COLORS`), never semantic colours.
- The frame is `ChartFrame` (inset field material); tooltips are `--neu-surface-high` with a hairline; gridlines are warm dashed putty; bars round their tops at 6px.
- An empty chart shows `EmptyState`, not empty axes.

---

## 12. Responsive and touch

- Breakpoints are Tailwind v4 defaults (sm 640, md 768, lg 1024, xl 1280, 2xl 1536). The `--bp-*` tokens are documentation only; component-free CSS writes the pixel value with a `/* --bp-* */` comment; client code uses `useMediaQuery(MQ.…)`.
- Page padding `p-4 sm:p-6 lg:p-8`. Sidebar: drawer below md, rail at md, full at lg. Dialogs are bottom sheets below md. Filter bars become one scroll row below md. Dense tables become card stacks below md.
- **Touch rules** (mobile audit 2026-09-26): text fields at least 16px on a coarse pointer (enforced globally); buttons, filter triggers and compact fields 44px minimum; `.serene-selection` rows 44px; `.serene-touch` lifts compact controls to 40px; `.serene-touch-hit` gives a tiny drawn control an invisible 44px target; a bare Enter in a composer is a newline on touch; the Android keyboard resizes the shell (`interactiveWidget: resizes-content`); drag surfaces have a touch path (a hold to drag, or a "Move to" menu).
- The `/m` layer is its own phone shell with its own touch scale (primary 56, field 52, knob 44, row 64); see [../modules/mobile-ops.md](../modules/mobile-ops.md).

---

## 13. Checks and tooling

| Command | What it checks |
| --- | --- |
| `pnpm check:tokens` | Every `var(--…)` reference resolves to a defined token (the `build` script runs it before `next build`) |
| `pnpm audit:ui` (`-- --check`, `-- --json`) | The inventory of native controls with local appearance against `scripts/ui-control-baseline.json` |
| `pnpm check:ui` | `check:tokens`, the control baseline and the component contract tests together |
| `node scripts/check-theme-contrast.mjs` | Browser-computed contrast of theme and material pairs across all eight themes in both modes (about 1,568 pairs, 0 below target on 2026-09-25) |
| `node scripts/check-control-keyboard.mjs`, `check-form-workflows.mjs` | Real-component keyboard and mocked form-workflow checks |
| `node --import tsx scripts/preview-ui-controls.mjs` | Regenerates the control specimen (all themes, both modes) |

How to run the browser checks (an isolated Chromium session, `SERENE_BROWSER_PORT`) is in [control-system.md](./control-system.md). There is no `/dev/components` route; whether to build it is an open item in the decision log.

---

## 14. The never-do list

The authoritative list is the root `CLAUDE.md` "Never-Do List" and DNA §10. The ones this file's reader trips over most:

- No literal colour, no `text-gray-*` / `bg-white`, no z-index outside the `--z-*` scale, no font weight 700.
- No backdrop blur outside the sanctioned surfaces (the mobile drawer backdrop, the command palette, the condensing page header).
- No width, height, padding or margin animation.
- No coloured single-edge border as a status or category signal.
- No native checkbox, date, month or select input; no `window.confirm`; no hand-rolled empty state, confirm, filter bar or skeleton block.
- No ring on an applied or open state; one focus colour.
- No component that fetches and renders; no service value imported into a client component.
