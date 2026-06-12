# Components CLAUDE.md

## UI Component Library — `src/components/ui/`

All components are display-only (A-06). Zero business logic. Zero DB calls. All colours are CSS variables.

### Core Primitives

| Component      | File               | Props Interface                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Spinner`      | `Spinner.tsx`      | `SpinnerProps`                          | Sizes: sm/md/lg. Reuses `eia-spin` keyframe. Canvas variant.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Button`       | `Button.tsx`       | `ButtonProps`                           | Variants: primary/secondary/ghost/danger/success. Sizes: xs/sm/md/lg. Border-radius `--radius-sm` (never `--radius-md`, §5.01). Loading state swaps `iconLeft` slot for Spinner — width preserved. `iconLeft`/`iconRight`. Primary: bg `--theme-accent`, fg `--theme-accent-fg`, resting `--shadow-accent-glow`, hover `--theme-accent-hover` + `--shadow-accent-lift` + `translateY(-1px)`. Secondary: paper-subtle + `--theme-paper-border` + `--shadow-1`, hover border `--theme-accent-muted`. Ghost: transparent + `--theme-text-primary`, hover bg paper-subtle. Danger/Success: soft `-light` rest → saturated base + `--theme-text-inverse` on hover (intentional drift from design-dna.md §5.01 saturated default — preserved to avoid breaking existing consumers). Disabled: `opacity 0.5`, `pointer-events: none`, `cursor: not-allowed`. Uses `React.forwardRef` — required by `MotionButton`. **No `whileTap` here** — Button stays a plain `<button>` so non-animated callers pay zero Framer Motion bundle cost; tap-scale lives in `MotionButton` + `MOTION_BUTTON_DEFAULTS`. **Variant chrome (rest + hover) lives in the `.eia-btn-*` classes in `design-tokens.css`** (design-audit 2026-06-11): `:hover` is gated to `(hover: hover) and (pointer: fine)` so a tap never leaves a sticky hover state — never reintroduce JS `onMouseEnter` hover styling. Focus ring is `:focus-visible` only (keyboard, not mouse click); `suppressFocusRing` maps to `.eia-btn-no-ring`. **Press feedback is CSS-only:** every Button carries the `.eia-pressable` class (`design-tokens.css`) — `:active → scale(0.97)`, declared after the hover rules so it wins by cascade (no `!important`), reduced-motion-gated; never add a second press mechanism to a Button consumer. |
| `Avatar`       | `Avatar.tsx`       | `AvatarProps`                           | Sizes: xs/sm/md/lg/xl. Square `--radius-md`. Initials fallback: 6 semantic colour pairs from name hash — initials + hash come from `lib/utils/strings.ts` (`getInitials`/`hashString`), never re-implemented inline. `loading="lazy"`. `selected?: boolean` — accent ring via `box-shadow`; CSS transition only, no layout shift. **Box-shadow composition:** caller `style.boxShadow` and `selected` ring are joined with a comma — both layers always coexist; neither overwrites the other.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `MotionButton` | `MotionButton.tsx` | All `ButtonProps` + Framer Motion props | `motion(Button)` factory — wraps Button without duplicating internals. Requires `Button` to use `React.forwardRef` (already done). Import `MOTION_BUTTON_DEFAULTS` for standard `whileTap: { scale: 0.97 }` + spring transition. Non-animated consumers import `Button` directly — `MotionButton` adds zero bundle cost to those.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `AvatarStack`  | `AvatarStack.tsx`  | `AvatarStackProps`                      | `users: AvatarStackUser[]`, `max?` (default 4), `size?` (default `sm`), `overlap?` (default 8px). Renders up to `max` `Avatar` components with `box-shadow: 0 0 0 2px var(--theme-paper)` separator rings. Overflow pill: `+N`, `--radius-full`, paper-subtle background. Framer Motion `whileHover` spreads stack via `x` transform only — never animates margin.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SearchBar`    | `SearchBar.tsx`    | `SearchBarProps`                        | Controlled. Sizes: sm/md/lg. Default placeholder `"Search"`. Clear button (hover → `--theme-text-primary`, `var(--transition-hover)`). Focus ring `--shadow-focus` + `--theme-accent` border. `caretColor: --theme-accent`. Placeholder colour resolved via `.eia-input` class (`::placeholder` unreachable from inline style). Fires `onChange` every keystroke — debounce by consumer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `InfoRow`      | `InfoRow.tsx`      | `InfoRowProps`                          | Label + value. `value` accepts `React.ReactNode` (strings, badges, composite nodes). Optional icon left. Optional copy-to-clipboard. Horizontal/stacked. `divider` prop adds border-bottom. `style`/`className` pass through to the **root** element — use `style={{ gridColumn: '1 / -1' }}` for full-width grid spans.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Toggle`       | `Toggle.tsx`       | `ToggleProps`                           | Sizes: sm/md. Spring thumb. Label + description slot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ProgressBar`  | `ProgressBar.tsx`  | `ProgressBarProps`                      | Auto-intent (value<33→danger, 33–66→warning, >66→success) unless `intent` override. Framer Motion fill animation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `CollapseReveal` | `CollapseReveal.tsx` | inline props (`duration?`, `style?`, `children`) | **THE expand/collapse reveal** (design-audit 2026-06-11). Animates `grid-template-rows 0fr→1fr` + opacity — never `height: 0→"auto"` (Never-Do list). Render inside `<AnimatePresence>` at the call site and pass `key` there; the internal inner div owns the clipping (`minHeight: 0` + `overflow: hidden`). Used by `GroupTasksTab` (subtasks accordion, add-subtask row), `SubTaskModal` (delete-confirm banner), `MyTasksCalendarView` (section body, quick-add row). Any new expand/collapse composes this — never re-animate `height`. |
| `SectionCard`  | `SectionCard.tsx`  | `SectionCardProps`                      | Canonical card shell for single-record detail pages. Props: `title`, `description?`, `headerRight?`, `bodyPadding?` (default `true`), `children`. Header strip `--theme-paper-subtle` + `label-micro` title + optional description (`--text-xs --theme-text-tertiary`) + optional right slot. Body padded `--space-6` by default; pass `bodyPadding={false}` when the child owns its own padding (composite cards with multiple zones). Chrome is always flat: `1px --theme-paper-border + --shadow-1 + --radius-lg`. **Never use `--shadow-paper` (levitating) for section cards** — that shadow is reserved for the dashboard paper surface itself. Used by `/profile`, `/admin/users/[id]`, `/admin/users/new`, `NewUserClient`. Server-component-safe.                                                                                                                                                                                                                                                                                                                                     |
| `BackButton`   | `BackButton.tsx`   | `BackButtonProps`                       | 36×36 circular icon-only back link. Props: `href` (Next.js `Link` route), `label` (drives both `aria-label` and `title` tooltip). Renders `ArrowLeft` (16px, strokeWidth 1.5) inside a `--theme-paper` button with `1px --theme-paper-border + --shadow-1 + --radius-full`. **Placement rule:** sits inline to the left of the page `<h1>` with `gap: var(--space-4)` — never on its own row above the title. Server-component-safe. Used on every detail page: `/leads/[id]`, `/campaigns/[id]`, `/admin/users/[id]`, `/admin/users/new`, `/tasks/[id]` (GroupTaskWorkspace). Never reimplement this chrome inline; if a new detail page needs a back affordance, import `BackButton`.                                                                                                                                                                                                                                                                                                                                                                                                        |

### Navigation & Selection

| Component        | File                 | Props Interface       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | -------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TabSelector`    | `TabSelector.tsx`    | `TabSelectorProps`    | **Backwards-compat wrapper** — accepts `tabs`, `activeTab`, `onChange` flat props and composes the compound API internally. Existing consumers do not need to change. New consumers should use the compound API (`Tabs` + `TabsList` + `TabsTrigger` + `TabsContent`) for full control. Variants: `pill`, `connected`, `accent` (no `border-bottom` variant — was never introduced; do not add without explicit spec). All variants use `SPRING_CONFIG` from `motion.ts` — no hardcoded stiffness/damping. **Pill variant**: tray bg `--theme-paper-subtle` + `--theme-paper-border` (radius `--radius-xl`). Active chip is `--theme-tab-pill-active-bg` + `--theme-tab-pill-active-border` + `--shadow-1` (soft pastel wash). Active label `--theme-tab-pill-active-text`. **Accent variant**: same tray as connected; active chip `--theme-accent` + `--shadow-accent-glow`; active label `--theme-accent-fg`. Use on filter bars sitting on `--theme-paper` (e.g. `/tasks`). **Connected variant**: tray bg `--theme-paper-subtle` + `--theme-paper-border` + `--radius-md`. Active chip `--theme-paper` + `--shadow-1`. Active label `--theme-text-primary`. **z-index contract** (pill + accent): button root `color: transparent`; label in inner `<span z-index:1>`. **Count badge**: active bg `--theme-accent-surface` + colour `--theme-accent`; inactive bg `--theme-paper-subtle` + colour `--theme-text-tertiary`. See compound API section below. |
| `RadioGroup`     | `RadioGroup.tsx`     | `RadioGroupProps`     | Variants: `default`, `card`. Card fills `--theme-accent-surface` when selected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `FilterDropdown` | `FilterDropdown.tsx` | `FilterDropdownProps` | Trigger (h-9, `--radius-md`) with optional icon + count badge. Multi-select (checkboxes) and single-select. `DROPDOWN_VARIANTS` for panel motion. **Trigger states**: open OR active (`selected.length > 0`) → border `--theme-accent`; transition `border-color var(--duration-fast) var(--ease-in-out)`. Active also tints bg `--theme-accent-surface` and label `--theme-accent`. **Count badge**: `--theme-accent` bg + `--theme-accent-fg` text + `--radius-full` + min-w/h 18px + `--text-2xs` (handles 2-digit counts without overflow). **ChevronDown**: rotates 180° on open, `transform var(--duration-fast) var(--ease-in-out)`. **Panel**: `--theme-paper` bg + `--theme-paper-border` + `--shadow-3` + `--radius-md`. **Checkbox**: unselected border `--theme-paper-border` + bg `--theme-paper`; selected border + bg `--theme-accent`, Check icon `--theme-accent-fg`. **Item hover**: bg `--theme-paper-subtle`, `var(--transition-hover)`. **Footer Clear**: visible only when `selected.length > 0`; right-aligned `--text-xs --theme-text-tertiary`, hover `--theme-accent`; fires `onChange([])` and closes when `multi=false`. Above the Clear sits a 1px `--theme-paper-border` separator (`my-1`). Consumers that early-return on empty arrays (e.g. URL-backed selectors) will see the Clear render as a no-op — this is by design.                                                                                                    |

**Single-select rule:** use `FilterDropdown` with `multi={false}` (default) for filter bars and modals (`CalledModal`, `LeadsFilters`). Dossier inline fields (`LeadInfoCard`) use `InlineSelectField` — `InfoRow` look at rest, themed menu on click. Do not use `FilterDropdown` on the dossier card.

### TabSelector — Compound API

`src/components/ui/TabSelector.tsx` exports both a flat `TabSelector` wrapper (backwards-compat) and a full compound component API.

#### Compound component exports

```typescript
<Tabs
  value?: string                    // controlled active tab
  defaultValue?: string             // uncontrolled initial tab
  onValueChange?: (id: string) => void
  indicatorLayoutId?: string        // default "eia-tab-indicator" — see collision warning below
  animatedContent?: boolean         // default true — TabsContent opacity fade (FAST_DURATION enter, instant exit — tabs are high-frequency; never re-add the slide or a slow exit)
  variant?: 'pill' | 'connected'  // default 'pill'
>
  <TabsList>
    <TabsTrigger value="tab-id" disabled?>
      Label
    </TabsTrigger>
  </TabsList>
  <TabsContent value="tab-id" animated?>
    Panel content
  </TabsContent>
</Tabs>
```

#### indicatorLayoutId — required when two tab groups share a viewport

Framer Motion shared layout (`layoutId`) treats all elements with the same id as a single shared element. If two `<Tabs>` groups are mounted simultaneously on the same page and both use the default `"eia-tab-indicator"` layoutId, the spring pill will jump between unrelated groups when either tab changes.

**Rule:** whenever two `<Tabs>` groups can be simultaneously visible, pass distinct `indicatorLayoutId` values to both:

```tsx
// Page-level tab bar
<Tabs indicatorLayoutId="tasks-page-tabs">…</Tabs>

// Widget-level period selector also on the same page
<Tabs indicatorLayoutId="lead-volume-period">…</Tabs>
```

The `TabSelector` wrapper forwards `indicatorLayoutId` as a prop for the same reason.

#### forceMount (scroll preservation)

`TabsContent` always stays in the DOM (`display: none` when inactive). This preserves scroll position when switching tabs (Design-DNA scroll-restoration rule). Consequence: **any component mounted inside `TabsContent` that creates a Supabase Realtime subscription will never unmount the subscription on tab switch.** Audit all `TabsContent` consumers and confirm subscriptions clean up on component unmount via `useEffect` return, not on tab switch.

#### TabsContent and AnimatePresence

`TabsContent` internally wraps the content `motion.div` in `AnimatePresence mode="wait"`. The outer `<div role="tabpanel">` is always mounted. The inner `motion.div` is conditionally rendered based on `isActive`. Do not wrap `TabsContent` itself in an external `AnimatePresence` — it manages its own.

#### Backwards-compat TabSelector wrapper

All existing consumers that pass `{ tabs, activeTab, onChange }` continue to work unchanged. The wrapper composes `Tabs + TabsList + TabsTrigger` internally with `animatedContent={false}` (content animation is the consumer's responsibility in flat-prop usage).

### Data Display

| Component       | File                | Props Interface      | Notes                                                                                                |
| --------------- | ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| `Table`         | `Table.tsx`         | `TableProps<T>`      | Generic. Sticky header option. Dev-only `console.warn` when `rowCount > 100 && !virtualized` (P-03). |
| `ChecklistItem` | `ChecklistItem.tsx` | `ChecklistItemProps` | Checked: strikethrough + `--color-success` icon.                                                     |
| `Checklist`     | `Checklist.tsx`     | `ChecklistProps`     | Composes `ChecklistItem` + `ProgressBar`.                                                            |
| `EmptyState`    | `EmptyState.tsx`    | `EmptyStateProps`    | **THE canonical empty state** — makes the "Playfair italic heading, never 'No data available'" rule structural. Two variants: `hero` (auto when `icon` passed — 64px icon tile, xl italic serif title, sans tertiary description, Framer entrance; `framed?` paper-subtle card surface, `ambient?` accent radial wash) and `inline` (centred serif-italic tertiary sentence; `size: 'sm' \| 'lg'`). Optional `action` slot. Never hand-roll an italic empty-state style object. Wrapped by `EmptyConversationState`, `PerformanceRosterEmptyState`; adopted inline in `TaskRemarksPanel`, `ManagerPerformancePanel`, `NotificationPanel`. |
| `StatTile`      | `StatTile.tsx`      | inline props         | **THE labelled stat tile** (dry-audit L-8). `variant: 'card'` (paper card chrome, micro label over `--text-2xl` semibold value, optional coloured `sub` line — campaign metrics strip) or `'cell'` (bare centred cell, mono accent value over micro label — composed inside the deals summary strip card). Server-component-safe. Performance `MetricCard` deliberately stays bespoke (delta/sparkline/motion decoration); any NEW plain stat tile composes this. |
| `ChatMarkdown`  | `ChatMarkdown.tsx`  | `{ content }`        | **THE markdown-lite renderer for model-authored chat text** (2026-06-12). Mirror of `lib/utils/whatsapp-format.ts` (that converts markdown OUT of WhatsApp replies; this renders it in-app). Subset: `**bold**`/`__bold__` (semibold, never 700), `*italic*`/`_italic_` (underscore form requires standalone markers — snake_case never matches), backtick inline code, `~~strike~~`, `[text](url)` (http(s) only, accent link, new tab), `-`/`*`/`1.` lists, headings→semibold lines, triple-backtick fences (mono block on `--theme-paper`). React elements only — no `dangerouslySetInnerHTML`, no dependency; out-of-subset text (incl. half-streamed unclosed markers) falls through as plain text, so it is SSE-safe. Display-only (A-06), server-component-safe. Used by `ElayaMessageBubble` (assistant bubbles only — user input stays plain). Any future model-text surface composes this — never re-parse markdown inline. |
| `PageSkeletons` | `PageSkeletons.tsx` | per-export           | **THE shared `loading.tsx` scaffold** — `Shimmer` (base `.skeleton` block with w/h/r/delay), `skeletonStagger(i)` (§11.4 0–320ms cap), `PageHeaderSkeleton` (title + optional CTA row), `FilterBarSkeleton` (the `--theme-paper` strip chrome with icon/search/chips/count or custom children), `SkeletonCard` (paper card chrome). Server-component-safe (no hooks/motion). Every list-page `loading.tsx` composes these; only bespoke interiors (dashboard bento, whatsapp split-pane) stay inline. |

### Inputs & Date

**Task-form field rule:** every task-creation form composes `TaskFormFields.tsx` — `FieldLabel` (`.label-micro` block label with `required?`/`optional?` markers), `FieldError`, `FormChip` (generic pill chip), `PriorityChipRow` (Urgent/High/Normal from `TASK_PRIORITY`; `variant: 'chip' | 'dot'`, `deselectNonNormal?`), `DueDateField` + `resolveDueAt` (label + optional Today/Tomorrow/Next-week IST preset chips via `toISTEndOfDay` + `DatePicker`), `TaskTypeField` (`TASK_TYPES` radio rows). Used by `CreatePersonalTaskModal`, `CreateGroupTaskModal`, `CreateGiaTaskModal`, `leads/CreateLeadTaskModal`. Never re-express one of these fields inline (dry-audit H-3 + L-4).

| Component    | File             | Props Interface   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Calendar`   | `Calendar.tsx`   | `CalendarProps`   | Month grid. Framer Motion slide between months. Today dot. Range selection. **`taskDots?: Record<string, { count: number; hasUrgent?: boolean }>`** — when provided, each matching day cell renders a 4px×4px `--radius-full` dot below the day number (absolute, `zIndex: 1`, never affects layout). Colour: `--theme-accent` (non-urgent) or `--color-danger` (`hasUrgent=true`). Opacity: `0.7` when count 1–2, `1.0` when count ≥ 3 or urgent. Entrance: `scale 0→1`, 150ms, `EASE_SPRING`. **Key format**: local-date YYYY-MM-DD (use `date.getFullYear()/getMonth()+1/getDate()` — NEVER `toISOString().slice(0,10)`, which timezone-shifts IST). **Cell height**: when `taskDots` is provided, cells switch from `aspectRatio: 1` squares to fixed `height: 44px` to give the dot room without clipping; when undefined, the calendar renders byte-identically to the legacy implementation. The pre-existing "today dot" is suppressed for the today cell only when a task dot also occupies that cell (prevents stacking two 4px dots in the same slot).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `TimePicker` | `TimePicker.tsx` | `TimePickerProps` | Standalone trigger + popover for HH:MM 24-hour `time` strings. Exports `TimePickerWheelPanel` (embedded variant used inside `DatePicker`). **Panel positioning:** same `visualViewport` offset correction and `useLayoutEffect` re-measure as `DatePicker`. **`WheelColumn` item height:** a `ResizeObserver` on the first rendered button measures the actual item height at runtime (stored in both a ref for scroll math and a state for render-time padding/center calculations). Falls back to the static `ITEM_HEIGHT = 40` constant until the observer fires. All three usages — padding, scroll-to-index, snap-commit — read from the measured value so zoom and OS text size changes snap to the correct index.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DatePicker` | `DatePicker.tsx` | `DatePickerProps` | Trigger + popover. Mounts `Calendar`. Focus ring `--shadow-focus`. **`showTime?: boolean` (default `false`)** — when `true`, renders a time picker section below the calendar inside the same panel, separated by a 1px `--theme-paper-border` divider. Time picker: two scroll columns (Hours 1–12, Minutes [00, 15, 30, 45]) with `:` separator (`--theme-text-tertiary --text-sm`), centred. Selected cell highlight: bg `--theme-accent-surface`, `--radius-xs`. Columns: `maxHeight: 160px`, `overflowY: auto`, scrollbar hidden via `scrollbarWidth: none` / `msOverflowStyle: none` (macOS WebKit overlay scrollbar may still appear briefly — acceptable, do not add a global `::-webkit-scrollbar` rule). AM/PM toggle is a `TabSelector` with `variant="connected"` and `indicatorLayoutId="datepicker-ampm"` — never reimplement. Trigger label uses `formatDate(value, 'dd MMM yyyy, h:mm a')` when `showTime` AND value present, else `'dd MMM yyyy'`. All times committed through `toUTC()` from `lib/utils/dates.ts`. Internal `draftDate` lets the user pick day and time independently while the panel is open; commits fire on every change so the parent stays in sync. When `showTime=false`, behaviour is byte-identical to the legacy implementation — calendar click commits and closes. Value type stays `Date \| null` regardless of `showTime`. **Panel positioning:** `updatePanelPosition` corrects `getBoundingClientRect()` coords by subtracting `window.visualViewport?.offsetLeft/Top` so the panel stays anchored at browser zoom levels, and clamps `left`/`top` to an 8px viewport gutter in both placement directions so the panel can never land off-screen. **Mobile (`useMediaQuery(MQ.mobile)`, below 768px):** with `showTime` the time wheel stacks *below* the calendar (column flex, `borderTop` divider, bottom-corner radii) instead of the 448px side-by-side row, keeping the panel at date-only width; the panel carries `maxHeight: calc(100dvh − 16px)` + `overflowY: auto` so the stacked layout scrolls on short viewports. After `AnimatePresence` commits the panel node, a `useLayoutEffect` + `requestAnimationFrame` re-measures the real panel dimensions and calls `updatePanelPosition(measuredW, measuredH)` to correct any flip-direction error. `window.visualViewport` scroll/resize listeners are added alongside window listeners and cleaned up in the effect return. |

### Overlays

| Component | File         | Props Interface            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Dialog` | `Dialog.tsx` | `DialogProps`              | Eia overlay (`--theme-canvas` 72% opacity), `--theme-paper` surface, `--shadow-4`, `--radius-xl`. Five sizes: sm/md/lg/xl/full. `ENTER_DURATION`/`EXIT_DURATION` from `motion.ts`. **Bottom sheet `<md`** (DNA R-06, responsive audit F5): overlay docks the panel to the bottom edge (no gutter), panel rounds top corners only + `max-h-[90dvh]` + safe-area-inset padding; centered dialog from `md` up; `size="full"` unaffected. Every `Dialog`/`modal.tsx` consumer inherits this — never re-implement a sheet per consumer. |
| `Modal`  | `modal.tsx`  | `ModalProps` / `ModalType` | **One file, lowercase `modal.tsx` — there is no `Modal.tsx`.** Exports `Modal`, `ModalProps`, `ModalType` (`'standard' \| 'lia'`). Wraps `Dialog`. `type="lia"` enforces exactly two actions — Dismiss (ghost) + Approve (primary) — with a breathing `LiaGlyph`; `onApprove`/`onDismiss`/`approveLabel`/`dismissLabel` props, both handlers call `onClose()`. `maxWidth` (Tailwind class string) is a back-compat prop on this same component, overriding `size`. **Every modal in Eia composes `modal.tsx` (or `Dialog` directly) — never reimplements chrome.** |
| `ConfirmDialog` | `ConfirmDialog.tsx` | `ConfirmDialogProps` | **THE standalone confirm dialog** (lightweight, not a `modal.tsx` composition by design — see root CLAUDE.md "Confirm dialog stacking"). Owns the `document.body` portal and the z-index contract: backdrop `--z-overlay` (50), panel `--z-modal` (60). Props: `open`, `title`, `body` (ReactNode), `confirmLabel?`, `pendingLabel?`, `cancelLabel?`, `danger?`, `pending?` (disables both buttons + backdrop dismiss), `onConfirm`, `onCancel`, `dialogKey?`. Exactly two actions, always. Never hand-roll a confirm; never `window.confirm`. Used by `GroupTasksTab`, `GroupTaskWorkspace`, `AdCreativesManager`. |
| `FloatingPanel` | `FloatingPanel.tsx` | `FloatingPanelProps` | Anchored dropdown-panel portal: `document.body` portal (Framer transform escape) + `DROPDOWN_VARIANTS` entrance + flip-up transform + paper chrome (`--z-dropdown`, `--shadow-3`, `--radius-md`, `--space-4` padding; `style` merges over). **Always driven by `usePortalAnchor()`** (`src/hooks/usePortalAnchor.ts`) — spread `anchor.panelProps`, put `anchor.triggerRef` on the trigger. Never re-implement the positioning plumbing inline. Used by all four filter bars' Range panels. |
| `DateRangeFields` | `DateRangeFields.tsx` | `DateRangeFieldsProps` | The canonical From → To date-range panel body (two `DatePicker`s + clear button) — the FilterBar **"Dates"** panel. Below md the row stacks vertically at `min(15rem, 100dvw − 4rem)` with full-width pickers (`useMediaQuery(MQ.mobile)`); desktop stays the side-by-side row. Props: `from`/`to` (URL-param strings via `filter-params.ts`), `onFromChange`/`onToChange`/`onClear`. Render inside a `<FloatingPanel>`. Composed by `<FilterBar>` for all four filter bars. |
| `DateRangePresetList` | `DateRangePresetList.tsx` | `DateRangePresetListProps` | THE quick-range preset panel body — the FilterBar **"Range"** panel (Today / Yesterday / This Week / Previous Week / This Month / Previous Month / Last 3 Months, from `lib/constants/date-range-presets.ts`; IST-anchored via `toIst()`). Props: `from`/`to` (URL-param strings) + `onSelect(from, to)` — one atomic commit. Active preset shows accent surface + Check; clicking it (or footer Clear) clears both dates. Rendered by `<FilterBar>` when `dateRange.onPresetSelect` is provided. |
| `FilterBar` | `FilterBar.tsx` | `FilterBarProps` | **THE shared list-page filter-bar shell** — owns the chrome all filter bars repeat: sliders icon (+ optional count badge via `showCountBadge`), `SearchBar` (controlled — debounce upstream), optional `dividerAfterSearch`, `children` slot for page `FilterDropdown`s, the **Range** preset trigger + `FloatingPanel` + `DateRangePresetList` (when `dateRange.onPresetSelect` is set; trigger label becomes the matched preset name) and the **Dates** trigger + `FloatingPanel` + `DateRangeFields` (via `dateRange` prop; `trigger: 'badge'` default or `'chevron'` for leads; both triggers share `dateTriggerStyle()`), Clear button (`activeCount > 0`), `trailing` slot. **Immediate-commit only (2026-06-12):** the `apply` prop / draft-commit model was removed — every filter commits the moment it changes; never reintroduce an Apply button. `layout: 'wrap'` (default) or `'scroll'` (leads single-row); **below md every bar auto-collapses to the scroll layout** (responsive audit 2026-06-12) — consequence: every `FilterDropdown` child must pass `menuPortal` or its menu clips against the scroll overflow. `hideSearch` omits the SearchBar (performance agent self-view). Fully controlled, display-only — state ownership belongs to the consumer: URL-driven bars pair it with `useUrlFilters` (`src/hooks/useUrlFilters.ts`; multi-selects via `useMultiSelectUrlParam` — optimistic checkbox echo + toggle bursts batched into one debounced push); client-state bars (`TasksFilters`) pass state straight through. **Never fork a new filter-bar chrome — extend this one.** Used by `LeadsFilters`, `DealsFilters`, `CampaignFilters`, `TasksFilters`, `PerformanceFilters`, admin `UsersTable`, settings `AgentSettingsTable` (the last three migrated off hand-rolled copies of this chrome, 2026-06-12 — never re-inline it). |

### Overlay/backdrop contract (2026-06-11 — Decision Log in `docs/design/decision-log.md`)

One darkening strategy per job. Never hardcode an `rgba(0,0,0,…)` scrim.

| Job | Value | Reference |
| --- | --- | --- |
| Full-screen modal backdrop | `color-mix(in srgb, var(--theme-canvas) 72%, transparent)` — theme-tinted | `Dialog.tsx`, `SubTaskModal.tsx` |
| Lighter panel/sheet backdrop | `var(--overlay-bg-light)` | `ConfirmDialog.tsx`, `AssigneePickerModal.tsx`, `NotificationPanel.tsx` (mobile) |
| Image scrim (hover/upload over a photo) | `var(--overlay-scrim)` | `ProfileAvatarSection.tsx` |

`--theme-overlay` does not exist — never reference it. No `backdrop-filter` on any of these (V-06).

### Charts — `src/components/ui/charts/`

All charts: `--theme-paper` bg, `--theme-paper-border` grid, `--theme-text-tertiary` axis labels, `--shadow-2` tooltip. All colours via `useChartTokens` — zero hardcoded hex passed to Recharts props.

**Cartesian frame rule:** `AreaChart`/`LineChart`/`BarChart` compose `CartesianChartFrame.tsx` — `<ChartFrame>` (paper container + `ResponsiveContainer`) and `cartesianDefaults(tokens)` (grid/axis/tooltip/legend prop objects, spread onto the Recharts elements) + `CARTESIAN_MARGIN`. Recharts resolves axes/tooltip by child *type*, so the elements stay in each chart's JSX — only the prop objects and the container are shared. Never re-inline those prop blocks; a new Cartesian chart spreads the defaults and adds its series renderer. Pie/Donut/Butterfly are genuinely different shapes and stay independent.

| Component        | File                 | Props Interface       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------- | -------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useChartTokens` | `useChartTokens.ts`  | `ChartTokens`         | Resolves 6 series colours + grid/axis/tooltip from `getComputedStyle`. Re-resolves on `themeKey` change. Exports `resolveColorMap(map)` — resolves CSS variable strings in a `Record<string, string>` to computed hex/rgb values at runtime (same `getComputedStyle` pattern). Use when a feature-level colour map needs to be passed to SVG fills.                                                                                                                                                                                                                                                                                                                                                                                             |
| `LineChart`      | `LineChart.tsx`      | `LineChartProps`      | Multi-series. `loading` → `ChartSkeleton`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `BarChart`       | `BarChart.tsx`       | `BarChartProps`       | Stacked option. Top-radius bars. **`colorMap?: Record<string, string>`** — per-key semantic colour override; keys match `series[].key`; values are CSS variable strings resolved via `resolveColorMap` at mount and on theme switch. Partial maps valid — unmatched keys fall back to positional tokens. When `colorMap` is provided, the built-in Recharts `<Legend>` is suppressed (caller owns the legend and reads from the same map for swatch colours). **`STATUS_COLORS` pattern:** domain colour maps stay in the feature folder; `colorMap` is the bridge prop — never import feature colour maps into the wrapper. Additional passthrough props: `margin`, `barCategoryGap`, `xAxisProps`, `yAxisProps`, `tooltipProps`, `gridProps`. |
| `PieChart`       | `PieChart.tsx`       | `PieChartProps`       | Legend optional.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `DonutChart`     | `DonutChart.tsx`     | `DonutChartProps`     | `centerLabel` slot.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `AreaChart`      | `AreaChart.tsx`      | `AreaChartProps`      | Gradient fill (token colour). Stacked option.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ButterflyChart` | `ButterflyChart.tsx` | `ButterflyChartProps` | Vertical bar layout. Negative left series.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ChartSkeleton`  | `ChartSkeleton.tsx`  | `ChartSkeletonProps`  | Reuses `.skeleton` CSS class (`eia-skeleton-pulse`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Motion Constants — `src/lib/constants/motion.ts`

All animation components import from here. Never re-declare inline.
Key exports: `ENTER_DURATION`, `EXIT_DURATION`, `BASE_DURATION`, `FAST_DURATION`, `SLOW_DURATION`, `EASE_OUT_EXPO`, `EASE_IN_EXPO`, `EASE_SPRING`, `EASE_IN_OUT`, `MODAL_VARIANTS`, `DROPDOWN_VARIANTS`, `FADE_VARIANTS`.

### Icon micro-interaction family — `.eia-icon-*-hover` (design-tokens.css §15)

**THE icon hover vocabulary — defined once, never re-implemented per component.** Put the class on the *button/link*; it targets the child `svg`. All variants share one transition (`--duration-slow` + `--ease-spring`; `travel-back` alone runs softer and longer — `--duration-page` + `--ease-out-soft`, it is a full exit-and-arrival journey) and one gate (`hover: hover` + `pointer: fine` + `prefers-reduced-motion: no-preference`). `Button` consumers opt in via the typed `iconMotion` prop (`'rotate' | 'lift' | 'drop' | 'ring'`) — never hand a class string to a `Button`.

| Variant | Gesture | Consumers |
| --- | --- | --- |
| `rotate` | quarter turn (Plus lands identical; × reads as anticipation) | `Dialog` close ×, `SubTaskModal` close, Plus CTAs (`AddLeadButton`, `AddDealButton`, `AddTaskButton`, `AdCreativesManager`, `LeadTasksCard` +, `GroupTaskWorkspace` FAB, admin-users Add Member) |
| `lift` | translate(1px, −1px) takeoff | `MessageBar` send, `TaskRemarksPanel` send, `GroupTasksTab` Open ↗ |
| `drop` | translateY(2px) settle | `ExportButton` Download |
| `ring` | `eia-phone-ring` receiver wiggle (700ms) | `StatusActionPanel` Called |
| `travel-back` | arrow exits left (clipped), twin arrives from the right | `BackButton` (sole consumer) |

**`travel-back` markup contract:** the class goes on the clipping button/link (`overflow: hidden` required); inside, a `span.eia-icon-travel-stage` wraps TWO copies of the icon — the second `position: absolute; inset: 0` inline + `aria-hidden`. All transforms live in the stylesheet, never inline (an inline transform on either icon breaks the rest/hover states).

**Rules:** never add a variant without a live consumer; never apply to a button whose icon swaps with a `Spinner` mid-flight *and* whose meaning changes (a loading swap that keeps meaning, e.g. `MessageBar`, is fine — `eia-spin` overrides the hover transform).

---

## Design decisions locked in (2026-05-29)

### 1. Visual test surface — `/dev/components` route

No Storybook. Instead: a single authenticated page at `/dev/components` (role-gated to admin/founder) that renders every UI component in all variants inline. Costs one afternoon, lives in the codebase, updates automatically as tokens change, and the whole team can open it in the browser to verify Avatar fallback colours, ProgressBar auto-intent, chart fills after a theme switch, etc.

**When to build it:** before the library reaches 40+ components, or immediately after the first token regression is found in production — whichever comes first.

### 2. `useChartTokens` — MutationObserver (not a resize listener, not a themeKey prop)

`ThemeSelector.tsx` switches themes by writing `data-theme` directly to `document.documentElement`. `useChartTokens` now observes that attribute via `MutationObserver` and re-resolves all colour tokens on every theme change. No caller needs to pass `themeKey` in production — the hook is fully self-contained.

The `themeKey` prop is kept as an escape hatch for SSR/test contexts only.

**Rule:** Every chart that lives on a page the user can reach while logged in already gets automatic theme reactivity. No additional wiring needed.

### 3. `Table<T>` vs bespoke feature tables — the boundary

`Table<T>` (`src/components/ui/Table.tsx`) is for **secondary/admin tables**:

- Audit logs
- User management grids
- Reporting / RPC result tables
- Any table that does not need a custom toolbar, column picker, or per-cell drag-to-reorder

`Table<T>` is **NOT** for bespoke feature tables. `LeadsTable` is the canonical example and will never adopt `Table<T>`. Its `LeadColumnId` switch, status pill toolbar, `useLeadColumnPreferences` drag-to-reorder, and per-cell style overrides are intentional — not technical debt.

**Rule for future feature tables:** if the table needs column visibility + drag-to-reorder, clone the `LeadsTable` + `useLeadColumnPreferences` pattern (Q-08). If it is a simple read-only grid, use `Table<T>`.

---

## List page header (reference implementation)

`src/app/(dashboard)/leads/page.tsx` establishes the canonical list-page header pattern:

- **Left:** `.type-page-title` (Playfair, light, primary). Optional `.type-eyebrow` above the title when a domain/module label is needed — not used on the leads page.
- **Right:** page actions (Add Lead, etc.).

Status summary pills were removed from the `LeadsTable.tsx` toolbar (2026-06-12). Per-row status pills remain (`.status-pill` utilities in `design-tokens.css`).

## Detail page header (reference implementation)

Every single-record detail page (`/leads/[id]`, `/campaigns/[id]`, `/admin/users/[id]`, `/admin/users/new`, `/tasks/[id]`) uses one shared header layout:

```text
[BackButton 36×36]  [.type-page-title Record Name.]
                    ↑ optional inline subtitle (phone, etc.)
```

- **Container:** `display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-6 | --space-8)`.
- **Left:** `<BackButton href="…" label="Back to …" />` from `src/components/ui/BackButton.tsx`. Never reimplement a back affordance inline.
- **Right of the back button:** the page `<h1>` using `.type-page-title` (Playfair) + the canonical `<span className="page-title-dot">.</span>` accent.
- **No eyebrow above the title** when a `BackButton` is present — the back affordance already establishes context. Eyebrows belong on top-level list pages, not on detail pages reached from them.
- **No subtitle row below the title** unless it carries factual data (phone number, campaign date range). Descriptive prose ("Create with a password or send a magic-link invite") never goes here — let the cards on the page do the explaining.

Wide-zone detail pages (`max-width: 1280px`) and narrow-zone detail pages (`max-width: 672px` — e.g. `/profile`) follow the same header rule. Only the body grid below differs.

## Labelled datum row (read-only detail fields)

Standard layout for every read-only field in detail cards (dossiers, profile sections, audit panels).

```text
[Icon w-4 h-4]  [Micro-label]     ← --text-2xs, semibold, widest tracking, uppercase, tertiary
                [Value]           ← --text-sm, normal weight, primary (tertiary when empty/—)
```

- Row: `flex items-center gap-3`. Icon is `flexShrink: 0`, colour `var(--theme-text-tertiary)`, `strokeWidth={1.5}`.
- Label + value stack: `flex-col` with `gap: 0.125rem` to the right of the icon.
- Technical values (phone, IDs, timestamps): value uses `var(--font-mono)`.
- Multi-field grids: `grid-cols-2`, `columnGap: var(--space-6)`, `rowGap: var(--space-5)`. Identity fields may `gridColumn: 1 / -1`.
- Separate visual groups with a full-width `1px` rule using `var(--theme-paper-border)` — no sub-headings.
- Reference implementation: `InfoRow` in `src/components/ui/InfoRow.tsx` — adopted in `LeadInfoCard.tsx` (contact fields grid) and `SubTaskModal.tsx` (Key Variables).
- Never hardcode icon colours. Never use `font-bold` / weight 700. Empty values show `—` in tertiary.

## SectionCard Rule

Every section on a single-record detail page (`/profile`, `/admin/users/[id]`, `/admin/users/new`, future settings/account pages, future config pages) **must compose** `src/components/ui/SectionCard.tsx`. Never reimplement the card chrome inline.

`SectionCard` chrome is the canonical "grounded" surface: `1px --theme-paper-border + --shadow-1 + --radius-lg`. **`--shadow-paper` is reserved for the dashboard paper layer itself and must not appear on a section card** — that's the "levitating" look the surface contract explicitly avoids.

If a card body contains multiple sub-zones (e.g. an identity row + a separate status-controls row), pass `bodyPadding={false}` and let each sub-zone own its own padding + separator. See `/admin/users/[id]`'s Identity card for the reference implementation.

## Side-edge accent strips — forbidden

**Never** use a coloured border on a single edge of a card, row, or column as a category or status indicator (`borderLeft`, `borderTop`, `borderRight`, or `borderBottom` accent strips — e.g. `3px solid var(--color-danger)`).

Use instead: `PriorityBadge`, status pills (`TASK_STATUS`), semantic dots (6px `border-radius: full`), icons, or count pills. Reference: `GroupTaskWorkspace` board column headers (dot + label), list rows (`PriorityBadge` for urgent/high).

Structural dividers (`1px solid var(--theme-paper-border)` on bottom or between zones) are fine — the rule applies only to **semantic colour on one edge**.

## Modal Rule

Every modal in Eia **must compose** `src/components/ui/modal.tsx`. Never reimplement modal chrome.

Modal props contract:

```text
open:      boolean          — controls visibility
onClose:   () => void       — fired on Escape, backdrop click, or explicit close
title:     string           — rendered in modal header
children:  React.ReactNode  — body slot
footer:    React.ReactNode  — footer slot (rendered right-aligned)
maxWidth?: string           — Tailwind max-width class (default: "max-w-lg")
```

## Heavy modal loading rule (perf audit G-1)

Create/detail modals and other heavy, rarely-opened overlays load **on intent** — never statically imported into a route chunk. Declare at module scope at the call site:

```tsx
const AddLeadModal = dynamic(
  () => import('@/components/leads/AddLeadModal').then((m) => m.AddLeadModal),
  { ssr: false },
);
```

Type exports stay as `import type` from the real module (zero runtime cost).

- Call sites that already conditional-render the modal (`{open && …}`, call-site `AnimatePresence` like `SubTaskModal`'s) need no other change — the conditional already defers the chunk.
- Call sites that keep the modal **permanently mounted** (because `Dialog`/the component owns its exit animation internally via `<AnimatePresence>{open && …}`) gate the render with `useMountOnFirstOpen(open)` from `src/hooks/useMountOnFirstOpen.ts` — chunk deferred to first open, exit animation preserved. Never conditional-render those on `open` alone (cuts the exit); never re-implement the latch inline.

Adopted: `AddLeadModal` (AddLeadButton), `NewDealModal` (AddDealButton), `CreateLeadTaskModal` (LeadTasksCard), `LeadColumnPicker` (LeadsTable), `SubTaskModal` (GroupTasksTab, MyTasksCalendarView, GroupTaskWorkspace), `CreateGroupTaskModal` (GroupTasksTab).

**List-row memo rule (perf audit G-4):** `LeadRow` (LeadsTable), `GroupRow` (GroupTasksTab), and `CalendarTaskRow` (MyTasksCalendarView) are `memo()`-ised — their props are primitives, stable row objects, and `useCallback`'d handlers. When touching these, keep new props primitive/stable (never pass a fresh arrow or the selection `Set`). Do **not** blanket-memo other components — only list rows where a parent-state change (selection, hover, expand) was re-rendering every sibling.

## Motion bundle rule (perf audit G-2)

`src/components/layout/MotionProvider.tsx` mounts `<LazyMotion features={async domMax} strict>` once in the **root layout** — every route, including auth, renders inside it. It also wraps children in `<MotionConfig reducedMotion="user">` (design-audit 2026-06-11): every Framer animation respects `prefers-reduced-motion` automatically; CSS keyframes still need the media-query gate.

- **THE import convention (A-17):** `import { m as motion } from 'framer-motion'`. The alias keeps all `motion.div` JSX, variants, and exit animations byte-identical while bundling only the ~6kb `m` core; the full feature set loads as its own async chunk (`src/components/layout/motion-features.ts`) on provider mount. `strict` makes this self-enforcing: a bare `import { motion }` component throws in development.
- **Features are `domMax`, not `domAnimation`** — `TabSelector`'s `layoutId` indicator pill and the toast stack's `layout` prop need the layout-animation feature set. Never downgrade to `domAnimation` without first removing every `layout`/`layoutId` usage.
- `AnimatePresence` imports stay as-is (not part of the deferred feature bundle).
- Custom-component wrappers use `motion.create(X)` (= `m.create` through the alias) — see `MotionButton`, `BackButton`.
- Until the features chunk arrives (fetched in parallel right after hydration), `m` components hold their initial styles — the same window that always existed pre-hydration. Never block render on it.

## Chart panel splitting (perf audit G-3)

Recharts (~90–100kb gz) must never sit in a route's initial chunk. Dashboard widgets are already `React.lazy` per widget; on `/performance` the three Recharts importers are `next/dynamic` at their call sites with same-shape `.skeleton` placeholders: `CoreFourGrid` + `CallOutcomeBar` (AgentPerformanceShell), `CallOutcomeBar` (AgentDetailPanel — chunk loads in parallel with the panel's own metrics fetch), `DomainOverviewPanel` (FounderPerformanceShell — fetched on first Domains-tab click). Any new Recharts consumer on a non-dashboard route follows the same pattern.

## AddLeadModal

`src/components/leads/AddLeadModal.tsx`

Props:

```text
open:          boolean
onClose:       () => void
callerProfile: { id: string; role: UserRole; domain: AppDomain; full_name: string }
initialAgents: { id: string; full_name: string }[]   — pre-fetched at page level for caller's domain
onSuccess:     (leadId: string) => void
```

**Fields (in order):** First name, Last name, Phone, Email, Source, Domain (manager+ only), Assign to, Interests (optional `FormChip` multi-select — options from `getDomainInterests(watchedDomain)`, domain switch clears out-of-vocabulary picks; server re-drops via `extractServiceInterests` → `leads.service_interests text[]`).

**Source field:** optional `<select>` — options from `LEAD_SOURCE_OPTIONS` (`lib/constants/lead-sources.ts`). Persisted on `leads.utm_source`. `lead_intent` is always `null` on manual leads.

**Agent-domain enforcement rule:**

- Agents never see the Domain field — domain is always locked to `callerProfile.domain`.
- Agents never see the Assign-to select — rendered as a read-only display chip showing their own name.
- The server action (`createManualLead`) enforces `domain = caller.domain` on the server regardless of what the form sends.
- Managers/admins/founders see both Domain and Assign-to fields. When the domain changes, `getAssignableUsersAction(domain)` (`lib/actions/profiles.ts`) is called to repopulate the agent dropdown.

**Duplicate phone handling:**

- Duplicate detection runs server-side via `get_active_lead_by_phone()`.
- When a duplicate is detected, the modal does NOT close. An inline warning banner appears with a link to the existing lead.
- The action returns `{ data: { leadId, duplicate: true }, error: null }` — never a silent insert.

## LeadColumnPicker

`src/components/leads/LeadColumnPicker.tsx`

Props:

```text
open:            boolean
onClose:         () => void
visibleColumns:  LeadColumnId[]
columnOrder:     LeadColumnId[]
toggleColumn:    (id: LeadColumnId) => void
reorderColumns:  (newOrder: LeadColumnId[]) => void
resetToDefaults: () => void
```

Display-only. Zero business logic. Calls `useLeadColumnPreferences` indirectly via its props.
Locked columns (status, name) render a `Lock` icon — not toggleable, not draggable.
Drag-to-reorder via `@dnd-kit/sortable`. Transform-only animation (no width/height/padding).
Entrance animation: `opacity 0→1, y -4→0` over 200ms with `ease-out-expo`.

## useLeadColumnPreferences hook

`src/hooks/useLeadColumnPreferences.ts`

```text
useLeadColumnPreferences(userId: string) → {
  visibleColumns:  LeadColumnId[]
  columnOrder:     LeadColumnId[]
  toggleColumn:    (id: LeadColumnId) => void
  reorderColumns:  (newOrder: LeadColumnId[]) => void
  resetToDefaults: () => void
}
```

Persists to `localStorage` under key `eia:leads:columns:${userId}:v1`.
Validates stored ids against the registry on load — unrecognised ids are silently dropped.
Locked columns are always in `visibleColumns` regardless of stored value.
Never touches Supabase. Never debounces — localStorage writes are synchronous.

## Toast System

### ToastProvider

`src/components/ui/toast-provider.tsx`

Renders the toast stack. Mount it **once** in the dashboard layout, after the Sidebar, outside any scrollable div.
Position: `fixed bottom-[--space-6] right-[--space-6]` desktop; `fixed bottom-[calc(80px+safe-area-inset-bottom)] left-[--space-4] right-[--space-4]` mobile.
Maximum 3 toasts in DOM. 4th+ are queued. Stack stagger: scale 1.0/0.95/0.90, translateY 0/-8px/-14px.
Uses `AnimatePresence` from Framer Motion. Zero Supabase dependency.

### ToastItem

`src/components/ui/toast-item.tsx`

Single toast card. Implements Section 13.2 anatomy exactly.

- Living 3px left bar uses `eia-toast-bar-breathe` CSS keyframe (fires once). `lia` type uses continuous `eia-lia-breathe`.
- Warning type renders a depletion bar (`toast-deplete` keyframe, linear timing — intentional).
- `loading` type has `Loader2` icon with `animate-spin` class.
- `lia` type renders `<LiaGlyph size={18} />` with breathing active.
- `danger` type never auto-dismisses — no timer. Verify: `duration = 0`.
- `hover / focus` over any toast freezes its dismiss timer. Leaving resumes remaining time.
- loading → resolved transition: icon crossfades via `AnimatePresence mode="wait"`, text crossfades, bar colour transitions.

### useToast hook

`src/hooks/useToast.ts` — re-exports `toast` from `src/lib/toast.ts`.

```typescript
import { useToast } from "@/hooks/useToast";
const toast = useToast; // toast is the singleton; hook re-exports it directly
toast.success("Lead saved");
toast.loading("Saving...");
toast.resolve(id, "success", "Saved!");
```

## Task Components

`src/components/tasks/` — SubTaskModal, TaskRemarksPanel, AssigneePickerModal, TaskStatusIcon.

### TaskStatusIcon

`src/components/tasks/TaskStatusIcon.tsx` — **canonical task status Lucide icon**. Never define inline `StatusIcon` switches in task components.

Props:

```text
status:    TaskStatus
className?: string
size?:     number   — edge length in px (default 13)
```

Icon colour comes from `TASK_STATUS[status].color` in `lib/constants/task-constants.ts`. Status pill backgrounds/text and remark timeline chips use `pillBg`/`pillText` and `remarkBg`/`remarkColor`/`remarkBorder` on the same constant — no local status colour maps.

### SubTaskModal

`src/components/tasks/SubTaskModal.tsx` — **replaces the deleted `TaskModal.tsx`**

Props:

```typescript
interface SubTaskModalProps {
  open: boolean;
  onClose: () => void;
  task: Task;
  group?: TaskGroup; // present for group subtasks, absent for personal
  assignee?: Profile;
  initialRemarks: TaskRemarkWithAuthor[];
  callerProfile: Pick<Profile, "id" | "role" | "domain">;
  currentUserName?: string;
  onTaskUpdated?: (update: SubTaskModalTaskUpdate) => void;
  onTaskDeleted?: (taskId: string) => void;
}
```

**Shell:** centered overlay (`position: fixed; inset: 0`). `max-width: 1100px`, `width: 95vw`, `height: 90vh`, `max-height: 820px`. Backdrop: `color-mix(in srgb, var(--theme-canvas) 72%, transparent)` (the canonical modal-backdrop formula — see "Overlay/backdrop contract" below), no blur. Scale entrance `0.96→1` at 200ms ease-out-expo. **NOT a bottom sheet.**

**Header:** breadcrumb left (`group.title › task.title` or `My Tasks › title`). Right cluster: status pill (inline dropdown, 6 options, optimistic), priority pill (inline dropdown, 3 options, optimistic), divider, edit pencil, more (⋯) menu, close ×.

**Two zones:**

- Zone A (38%, `var(--theme-paper-subtle)`): Title, Notes/Objective, Action Items checklist (personal + group subtasks), Key Variables (deadline + assignee), metadata footer. Edit mode footer (slide-up, Save Brief / Cancel).
- Zone B (62%, `var(--theme-paper-subtle)`): `TaskRemarksPanel` (`embedded` prop).

**Checklist:** always interactive (never read-only). First 5 visible, "Show N more" toggle. Edit mode: drag-to-reorder via `@dnd-kit/sortable`, delete ×, add new item input. Toggles call `updateChecklistAction` optimistically.

**Edit mode:** only Zone A. Save calls `updateTaskAction` (title/description) + `updateChecklistAction` if changed. Does NOT insert into `task_remarks`.

**AnimatePresence:** wrap the conditional at the **call site**, not inside `SubTaskModal`. Required for exit animation:

```tsx
<AnimatePresence>
  {selectedTask && open && (
    <SubTaskModal open={open} onClose={onClose} ... />
  )}
</AnimatePresence>
```

**Delete:** visible via ⋯ menu. Authorization: personal task → only if `created_by === caller.id AND assigned_to === caller.id` OR admin/founder. Group subtask → any caller with access OR admin/founder.

### TaskRemarksPanel

`src/components/tasks/TaskRemarksPanel.tsx`

Props:

```text
taskId:               string
currentUserId:        string
currentUserName:      string
initialRemarks:       TaskRemarkWithAuthor[]
Composer placeholder: “Write a progress.” (Playfair italic). No footer hint — shortcuts via `title` on focus.
```

**Data seeding:** `remarks` state is seeded directly from `initialRemarks` — no mount fetch. `seenIds` ref is seeded from `initialRemarks.map(r => r.id)` on each `taskId` change to prevent Realtime double-append. Call sites must fetch remarks via `getTaskRemarksAction(taskId)` **before** opening the modal (gate the render on `selectedTaskRemarks !== null`) and clear on close — see `MyTasksCalendarView`, `GroupTaskWorkspace`, `GroupTasksTab`, `GiaTasksTab` for the canonical pattern.

Realtime: subscribes to `task_remarks` filtered by `task_id` on mount. **Channel name: `task-remarks-${taskId}-${mountId}`** — `mountId` (from `useId()`) prevents Strict Mode double-mount channel collisions. Unique per task, prevents cross-task subscription bleed.

Timeline: oldest at top, newest at bottom. Auto-scrolls to bottom on mount and on new remarks.

**Status chip:** if `remark.status_change` is set, a compact pill is rendered above the content using `TASK_REMARK_STATUS_LABELS` with status-specific colour tokens.

**Suppressed remarks:** italic "This remark was removed." in `var(--theme-text-tertiary)`.

**Compose area:** textarea (grows to 3 lines) + 6 status-change chips (flex-wrap row, `var(--space-2)` gap) + Send icon button. `useTransition` + `isPending` guard prevents duplicate submissions. Optimistic insert at 0.6 opacity, confirmed on Realtime echo. On error: optimistic row removed, `toast.danger` fires.

**statusChange contract:** `statusChange: TaskStatus | null` state, initialised `null`. Clicking a chip toggles it — clicking the active chip deselects (→ `null`). On post: captured into `pendingStatusChange` before `setStatusChange(null)` so the clear and the action call use the same value. Passed to `addTaskRemarkAction` as `statusChange: pendingStatusChange ?? undefined` (schema uses `.optional()`, not `.nullable()`). Included in the optimistic remark's `status_change` field so the timeline reflects it immediately. Chip animation: `motion.button` `animate` on `background`/`borderColor`/`color`, `transition: { duration: FAST_DURATION, ease: EASE_OUT_EXPO }` — never inline the array.

**Empty state:** Playfair italic "No updates yet." centred in `var(--theme-text-tertiary)`.

Export: `TaskRemarkWithAuthor` (re-exported from `src/lib/services/tasks-service.ts`).

### AssigneePickerModal

`src/components/tasks/AssigneePickerModal.tsx`

Props:

```text
open:          boolean
onClose:       () => void
onConfirm:     (userId: string, user: AssignableUser) => void
users:         AssignableUser[]       — pre-fetched by parent, max 100
initialDomain: AppDomain              — domain to pre-select
```

Opens as a nested modal. Backdrop: `--z-modal-overlay` (61). Panel: `--z-modal-nested` (62). Sits above `TaskModal` (`--z-modal` = 60).

Domain tabs at top — only shows domains with at least one user. Search filters client-side (no server round-trip). Single select. Role badge per user row. Confirm disabled until selection made.

`AssignableUser` is the canonical type from `@/lib/types` (dry-audit M-4) — imported, not exported here.

## GroupTaskWorkspace

`src/components/tasks/GroupTaskWorkspace.tsx` — `'use client'`.

**Props:** `group: TaskGroup`, `initialSubtasks: SubtaskWithAssignee[]`, `currentUserId`, `currentUserName`, `callerRole`, `callerDomain`.

**View toggle:** `'list' | 'board'`. Persisted to `localStorage` at `eia:tasks:workspace-view:${groupId}`. Default `'list'` until hydration. `useState('list')` + `useEffect` reads localStorage — no hydration mismatch.

**List view:** Sorted by priority DESC + due_at ASC. Task rows with `PriorityBadge` (urgent/high), title, assignee avatar, due chip, status pill, arrow to SubTaskModal. No single-edge accent strips (Never-Do rule); no inline complete. *(Corrected 2026-06-11 — design-audit DOC-03: this row previously claimed a "priority left border" that the code never shipped.)*

**Board view:** 5 columns (`to_do`, `in_progress`, `in_review`, `completed`, `terminal`). Terminal column = Error + Cancelled; header label "Error / Cancelled"; count = sum of both; cards show actual status pill. Framer Motion layout animations on card move.

**Realtime:** `workspace-subtasks-${groupId}-${mountId}`. Merges INSERT/UPDATE into local state — no full refetch.

**Modal:** `SubTaskModal` opened on click. `handleModalClose` calls `getGroupSubtasksAction` to re-sync status changes.

**Add subtask FAB:** Floating `+ Add subtask` button (bottom-right, `var(--z-raised)`). Inline panel: title + priority select + due date + assignee picker. `createSubtaskAction` → re-fetches on success. No drag-and-drop. No inline complete for subtasks.

---

## CreateGroupTaskModal

`src/components/tasks/CreateGroupTaskModal.tsx` — `'use client'`

Props:

```text
open:      boolean
onClose:   () => void
onCreated: (group: TaskGroup) => void   — parent converts to TaskGroupRow and prepends; no refetch
```

Composes `src/components/ui/modal.tsx` with `maxWidth="max-w-3xl"`. No `<form>` tag.

**Two-column layout:** left 280px live preview card · right form fields. Preview column hidden below 640px via `@media` rule inside `<style>`.

**Fields (in order):** Title (autofocus), Description (auto-grow textarea), Domain (native `<select>` from `GIA_DOMAINS` + `DOMAIN_LABELS`), Accent Colour (10 swatches from `GROUP_TASK_ACCENT_COLORS`), Icon (25 Lucide icons from `GROUP_TASK_ICONS` in a 5×5 grid), divider, Priority (Urgent/High/Normal chips), Due Date (optional `datetime-local`), Add Members (search + avatar chips).

**Live preview card:** reads title, accentHex, iconName directly from state — updates on every keystroke, no debounce, no async.

**accent_color + icon_key:** UI-only. `task_groups` has no such columns as of migration 0017. Fields are NOT passed to `createGroupTaskAction`. TODO comments in file.

**Members:** `searchProfilesAction` does not exist yet. Search renders a stub dropdown with a "coming soon" message. Member chips are tracked locally but NOT passed to `createGroupTaskAction` — `task_group_members` table does not exist yet. TODO comments in file.

**Icons:** dynamic render via `import * as LucideIcons` namespace lookup, cast through `unknown` to bridge `IconComponentProps` → `{ style }` type gap.

**`onCreated`:** GroupTasksTab converts the returned `TaskGroup` to `TaskGroupRow` (adds `subtask_count: 0`, `completed_count: 0`, `assignee_previews: []`) and prepends to local state.

---

## CreatePersonalTaskModal

`src/components/tasks/CreatePersonalTaskModal.tsx` — `'use client'`

Props:

```text
open:      boolean
onClose:   () => void
onCreated: (task: Task) => void   — parent prepends returned task to active list; no refetch
```

Composes `src/components/ui/modal.tsx`. No `<form>` tag — onClick/onChange throughout.

**Fields (in order):** Title (autofocus, grows 1→3 lines), Due date (Today/Tomorrow/Next week preset chips + specific datetime toggle), Priority (Urgent/High/Normal chips, default Normal), Tags (free-text chip input, max 10, Enter/comma to add), Notes (collapsed "+ Add notes" toggle, expands textarea).

**Due date IST end-of-day:** the preset chips + `DatePicker` are `DueDateField` from `ui/TaskFormFields.tsx`; `resolveDueAt(preset, date)` owns the preset → `toISTEndOfDay()` math. `toUTC()` from `dates.ts` is NOT used for presets because it is a UTC passthrough, not an IST end-of-day calculator. A specific date commits `date.toISOString()`.

**Priority single-select:** clicking the active Non-normal chip deselects it → falls back to Normal. Normal cannot be deselected entirely.

**Tags:** persisted via `createPersonalTaskAction` (`tasks.tags text[]`, migration 0024). Max 10 per task.

**onCreated:** receives a synthetic `Task` object built from the known fields + server-returned `taskId`. Parent (`MyTasksCalendarView`) merges into local task list — no full-page refetch.

**Inline error:** title-required error shown under the title field. Toast `danger` for server errors — modal stays open.

---

## MyTasksCalendarView (canonical My Tasks UI)

`src/components/tasks/MyTasksCalendarView.tsx` — mounted by `TasksShell` when `tab=personal`.

Props: `initialResult`, `currentUserId`, `currentUserName`, `callerRole`, `callerDomain`, `createTrigger?`, `filters` (from `TasksShell`), `onFilteredCountChange?`, `onTagsMayHaveChanged?`.

**Layout:** calendar + date-grouped task list. Client filters via `task-client-filters.ts` (status, priority, tags, search). Completed tasks are excluded from the active list (not a lazy-loaded accordion).

**Remarks gate:** same as SubTaskModal — fetch `getTaskRemarksAction` before opening modal; clear on close.

## PersonalTasksTab — deleted (2026-06-11)

`src/components/tasks/PersonalTasksTab.tsx` no longer exists. It was the legacy My Tasks UI
(superseded by `MyTasksCalendarView` on 2026-05-31, unmounted since) and was deleted in the
design-audit Phase 3 motion pass (it carried the height-animation and side-edge-border
violations M-04/L-02). Never recreate it; `MyTasksCalendarView` is the only My Tasks UI.

---

## WhatsApp Components — `src/components/whatsapp/`

| Component                | File                         | Responsibility                                                                                                                                                                 |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WhatsAppShell`          | `WhatsAppShell.tsx`          | `'use client'` two-panel layout. Owns conversation list state, active conversation selection, Realtime on `whatsapp_conversations`, cursor pagination, unread badge.           |
| `ConversationList`       | `ConversationList.tsx`       | `'use client'` left panel body. SearchBar + 300ms debounced search action. IntersectionObserver load-more (P-05). End-state "That's everything."                               |
| `ConversationRow`        | `ConversationRow.tsx`        | Single conversation item. Unread dot, lead name, phone, timestamp, resolved badge. Active left-border accent state.                                                            |
| `ConversationPanel`      | `ConversationPanel.tsx`      | `'use client'` right panel. Three zones: header (name, phone, resolve/reopen), message list (Realtime + date groups), composer (optimistic send, char count, resolved banner). |
| `MessageBubble`          | `MessageBubble.tsx`          | Single message. Inbound (`paper-subtle`) / outbound (`accent-surface`). Delivery icons. Media placeholder. Bot label.                                                          |
| `EmptyConversationState` | `EmptyConversationState.tsx` | Right panel empty state. Framer Motion entrance. Never "No data available."                                                                                                    |

**Channel name pattern:** `wa-messages-${conversationId}-${mountId}` and `wa-conversations-${userId}-${mountId}` — `useId()` mount suffix required for StrictMode safety. Both subscriptions use `supabase.removeChannel(channel)` on unmount.

**Resolve/Reopen:** visible only to manager, admin, founder. Check against `MANAGER_ROLES = ['manager', 'admin', 'founder']`. Never hardcode role strings.

**Server action wrappers:** `searchConversationsAction`, `getConversationsAction`, `getMessagesAction` in `src/lib/actions/whatsapp.ts` — client components must use these, not `whatsapp-service.ts` directly (server Supabase client restriction).

---

## Elaya Components — `src/components/elaya/`

| Component | File | Responsibility |
| --- | --- | --- |
| `ElayaChatShell` | `ElayaChatShell.tsx` | `'use client'` chat surface. Owns the page's two-column layout via the canonical `.eia-dossier-grid eia-dossier-grid--340` (audit F2 — never fork a grid class; chat in the 1fr column, identity sidebar right, stacked below under lg) plus transcript state, the SSE consumption loop against `POST /api/elaya/chat` (`meta`/`delta`/`tool`/`done`/`error` frames), composer — the shared `MessageBar` (`variant="default"`, ref-forwarded for starter-prompt focus; Enter sends, Shift+Enter newline; input restored on rejected send — never cleared on error; never hand-roll a composer here), cap banner, and the in-transcript status row (serif italic + small glyph — covers tool calls AND the first-token "Thinking…" wait). Presence header: breathing `LiaGlyph` in a 36px `--theme-accent-surface` tile; **no message counter** (the budget chip / "N of cap" mirror was removed 2026-06-12 — never reintroduce a visible count; at cap a right-aligned `--color-warning` "Daily limit reached" note appears and the composer swaps to the cap banner). A static glyph = Elaya absent — never pass `breathing={false}` while the shell is mounted. Cap/expiry are server-enforced; everything here is cosmetic state. |
| `ElayaIdentityCard` | `ElayaIdentityCard.tsx` | Display-only (A-06) identity sidebar on `/elaya` (rendered by the shell as the second `.eia-dossier-grid--340` child — `/profile` sidebar pattern, stretches to the grid row height). 64px accent-surface glyph tile + serif name (the "Your compass" micro label, line of the day, and `StatTile` budget mirror were removed 2026-06-12 — do not reintroduce), `ELAYA_STARTER_PROMPTS` starter buttons (**prefill + focus the composer only — never auto-send**; disabled while streaming/at cap), "She can see" capability rows (keep in step with `lib/elaya/tools/registry.ts`). |
| `ElayaMessageBubble` | `ElayaMessageBubble.tsx` | Display-only bubble (A-06). User: right, `--theme-accent-surface`; Elaya: left, `--theme-paper-subtle` (mirrors the WhatsApp bubble surface contract). One radius (`--radius-lg`, V-07); entrance opacity/y only via `m as motion` + `FAST_DURATION`/`EASE_OUT_EXPO`. `showGlyph` renders her breathing mark beside assistant bubbles — bare glyph, no tile chrome (presence, not an avatar). Assistant content renders through `ui/ChatMarkdown.tsx` (markdown-lite — bold/italic/lists/links/code as React elements); user bubbles stay plain text. |

**Height:** flex-fill, not dvh math (2026-06-12). The page `<main>` is `flex-1 min-h-0 flex flex-col`; the shell's grid is `flex-1` + `minHeight: 0`, so both columns stretch to exactly the remaining paper height (single-row grid, default stretch alignment). The chat card keeps `minHeight: 420px`; the transcript scrolls internally (`flex-1 min-h-0 overflow-y-auto`). Never reintroduce a `calc(100dvh - Npx)` offset here — it drifts whenever page chrome changes.

---

## Notification Components

`src/components/notifications/` — bell, panel, item.

### NotificationBell

`src/components/notifications/NotificationBell.tsx`

Client component. Currently mounted in the Sidebar footer (replacing the stub bell).
Props: `userId: string`, `initialData: Notification[]`, `variant?: "sidebar" | "topbar"`.
Renders bell icon + unread dot (single dot only — never a number badge).
Owns `useState(open)` and wraps `NotificationPanel`.
No Supabase calls — all state in `useNotifications` hook.

### NotificationPanel

`src/components/notifications/NotificationPanel.tsx`

Dropdown panel. `w-[380px]` desktop. Mobile: position at bottom via CSS (future: bottom sheet).
Entrance: `opacity 0→1, y -4→0, 150ms --ease-out-expo`. Matches Section 5.09 dropdown spec.
Closes on outside click, Escape, item click with `action_url`.
Empty state: italic Playfair "You're all caught up."
Mark all read button visible when `unreadCount > 0`.

### NotificationItem

`src/components/notifications/NotificationItem.tsx`

Single row. Left unread dot (always rendered, transparent when read — layout stable).
On click: marks read, navigates to `action_url` if present (relative paths only — validated before `router.push`).
`formatRelativeTime()` from `src/lib/utils/dates.ts` for timestamps.

---

## Component Sweep — 2026-05-29

A full adoption sweep ran across `src/` replacing inline UI patterns with `src/components/ui/` library components. **33 replacements** made across 20 files. **7 items were flagged** at the time (in a flags doc since deleted; the table below preserves the summary).

### What was replaced

| Pattern                          | Component adopted                                         | Files                                                                                                                 |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `Loader2` inline spinners        | `Spinner`                                                 | CalledModal, PersonalDetailsCard, ProfileAvatarSection                                                                |
| Raw `<button>` primary/secondary | `Button`                                                  | All auth forms, all admin forms, profile forms, lead modals, dashboard widgets (refresh buttons)                      |
| Custom toggle/switch             | `Toggle`                                                  | NotificationPreferences, UserStatusControls                                                                           |
| Custom avatar/initials fallback  | `Avatar`                                                  | TaskRemarksPanel, SubTaskModal, PersonalTasksTab, CreateGroupTaskModal, GroupTaskWorkspace, GroupTasksTab, UsersTable |
| Inline search input              | `SearchBar`                                               | UsersTable                                                                                                            |
| Raw `<table>`                    | `Table`                                                   | UsersTable                                                                                                            |
| Period toggle buttons            | `TabSelector` (pill)                                      | ManagerLeadVolumeWidget                                                                                               |
| List filter bar                  | `PerformanceFilters` / `LeadsFilters` / `CampaignFilters` | `buildFilterParams`, `SearchBar`, `FilterDropdown`                                                                    |
| Custom tab bar                   | `TabSelector` (pill)                                      | TasksShell                                                                                                            |

### What was NOT touched (flagged)

The flagged-items table above is the surviving record (the original `component-sweep-flags.md` was deleted); it covered `AvatarStack`, `AssigneePickerModal` selected state, `CreateUserForm` connected-tab, both Recharts chart widgets, task icon-only `motion.button` instances, and InfoRow candidates.

### Rule established

Every future modal **must** compose `src/components/ui/modal.tsx`. Every future loading indicator **must** use `Spinner`. Every future form submit button **must** use `Button`. Search `src/components/ui/` before implementing any pattern inline.
