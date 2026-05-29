# Components CLAUDE.md

## UI Component Library — `src/components/ui/`

All components are display-only (A-06). Zero business logic. Zero DB calls. All colours are CSS variables.

### Core Primitives

| Component | File | Props Interface | Notes |
|---|---|---|---|
| `Spinner` | `Spinner.tsx` | `SpinnerProps` | Sizes: sm/md/lg. Reuses `eia-spin` keyframe. Canvas variant. |
| `Button` | `Button.tsx` | `ButtonProps` | Variants: primary/secondary/ghost/danger/success. Sizes: xs/sm/md/lg. Loading state swaps label for Spinner. `iconLeft`/`iconRight`. Primary always uses `--theme-accent-fg` (V-02). Uses `React.forwardRef` — required by `MotionButton`. |
| `Avatar` | `Avatar.tsx` | `AvatarProps` | Sizes: xs/sm/md/lg/xl. Square `--radius-md`. Initials fallback: 6 semantic colour pairs from name hash. `loading="lazy"`. `selected?: boolean` — accent ring via `box-shadow`; CSS transition only, no layout shift. **Box-shadow composition:** caller `style.boxShadow` and `selected` ring are joined with `, ` — both layers always coexist; neither overwrites the other. |
| `MotionButton` | `MotionButton.tsx` | All `ButtonProps` + Framer Motion props | `motion(Button)` factory — wraps Button without duplicating internals. Requires `Button` to use `React.forwardRef` (already done). Import `MOTION_BUTTON_DEFAULTS` for standard `whileTap: { scale: 0.97 }` + spring transition. Non-animated consumers import `Button` directly — `MotionButton` adds zero bundle cost to those. |
| `AvatarStack` | `AvatarStack.tsx` | `AvatarStackProps` | `users: AvatarStackUser[]`, `max?` (default 4), `size?` (default `sm`), `overlap?` (default 8px). Renders up to `max` `Avatar` components with `box-shadow: 0 0 0 2px var(--theme-paper)` separator rings. Overflow pill: `+N`, `--radius-full`, paper-subtle background. Framer Motion `whileHover` spreads stack via `x` transform only — never animates margin. |
| `SearchBar` | `SearchBar.tsx` | `SearchBarProps` | Controlled. Sizes: sm/md/lg. Clear button. Focus ring `--shadow-focus`. Fires `onChange` every keystroke — debounce by consumer. |
| `InfoRow` | `InfoRow.tsx` | `InfoRowProps` | Label + value. `value` accepts `React.ReactNode` (strings, badges, composite nodes). Optional icon left. Optional copy-to-clipboard. Horizontal/stacked. `divider` prop adds border-bottom. `style`/`className` pass through to the **root** element — use `style={{ gridColumn: '1 / -1' }}` for full-width grid spans. |
| `EditButton` | `EditButton.tsx` | `EditButtonProps` | Icon-only Pencil. Ghost default, accent on hover. Tooltip "Edit". Composes hover states — do not re-implement. |
| `Toggle` | `Toggle.tsx` | `ToggleProps` | Sizes: sm/md. Spring thumb. Label + description slot. |
| `ProgressBar` | `ProgressBar.tsx` | `ProgressBarProps` | Auto-intent (value<33→danger, 33–66→warning, >66→success) unless `intent` override. Framer Motion fill animation. |

### Navigation & Selection

| Component | File | Props Interface | Notes |
|---|---|---|---|
| `TabSelector` | `TabSelector.tsx` | `TabSelectorProps` | **Backwards-compat wrapper** — accepts `tabs`, `activeTab`, `onChange` flat props and composes the compound API internally. Existing consumers do not need to change. New consumers should use the compound API (`Tabs` + `TabsList` + `TabsTrigger` + `TabsContent`) for full control. Variants: `pill`, `border-bottom`, `connected`. Spring indicator uses `SPRING_CONFIG` from `motion.ts`. **Pill variant**: active chip is `--theme-canvas` fill with `--theme-sidebar-border` hairline — dark chip on light tray. Active label is `--theme-canvas-text` (not `--theme-accent`). **z-index contract**: for the pill variant the label text is wrapped in `<span style="position:relative; z-index:1">` — this is required so the text sits above the dark `position:absolute` chip. Do not remove it. See compound API section below. |
| `RadioGroup` | `RadioGroup.tsx` | `RadioGroupProps` | Variants: `default`, `card`. Card fills `--theme-accent-surface` when selected. |
| `FilterDropdown` | `FilterDropdown.tsx` | `FilterDropdownProps` | Trigger with icon + count badge. Multi-select (checkboxes) and single-select. `DROPDOWN_VARIANTS`. |
| `Accordion` | `Accordion.tsx` | `AccordionProps` | `single`/`multiple` type. ChevronDown rotates 180°. `AnimatePresence` height animate. |

### TabSelector — Compound API

`src/components/ui/TabSelector.tsx` exports both a flat `TabSelector` wrapper (backwards-compat) and a full compound component API.

#### Compound component exports

```typescript
<Tabs
  value?: string                    // controlled active tab
  defaultValue?: string             // uncontrolled initial tab
  onValueChange?: (id: string) => void
  indicatorLayoutId?: string        // default "eia-tab-indicator" — see collision warning below
  animatedContent?: boolean         // default true — TabsContent fade/slide
  variant?: 'pill' | 'border-bottom' | 'connected'  // default 'pill'
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

| Component | File | Props Interface | Notes |
|---|---|---|---|
| `Table` | `Table.tsx` | `TableProps<T>` | Generic. Sticky header option. Dev-only `console.warn` when `rowCount > 100 && !virtualized` (P-03). |
| `ListRow` | `ListRow.tsx` | `ListRowProps` | Left slot, primary text, secondary text, right slot, chevron. |
| `ChecklistItem` | `ChecklistItem.tsx` | `ChecklistItemProps` | Checked: strikethrough + `--color-success` icon. |
| `Checklist` | `Checklist.tsx` | `ChecklistProps` | Composes `ChecklistItem` + `ProgressBar`. |

### Inputs & Date

| Component | File | Props Interface | Notes |
|---|---|---|---|
| `Calendar` | `Calendar.tsx` | `CalendarProps` | Month grid. Framer Motion slide between months. Today dot. Range selection. |
| `DatePicker` | `DatePicker.tsx` | `DatePickerProps` | Trigger + popover. Mounts `Calendar`. Focus ring `--shadow-focus`. |

### Overlays

| Component | File | Props Interface | Notes |
|---|---|---|---|
| `Dialog` | `Dialog.tsx` | `DialogProps` | Eia overlay (`--theme-canvas` 72% opacity), `--theme-paper` surface, `--shadow-4`, `--radius-xl`. Five sizes: sm/md/lg/xl/full. `ENTER_DURATION`/`EXIT_DURATION` from `motion.ts`. |
| `Modal` | `Modal.tsx` | `ModalProps` | Wraps `Dialog`. `type="lia"` enforces exactly two actions (Approve + Dismiss) with `LiaGlyph`. `maxWidth` prop for backward compat. **Every modal in Eia composes this or `modal.tsx` — never reimplements chrome.** |
| `modal.tsx` | `modal.tsx` | `ModalProps` (legacy) | Legacy modal with `maxWidth` string prop. Existing callers preserved. New modals: prefer `Modal.tsx`. |

### Charts — `src/components/ui/charts/`

All charts: `--theme-paper` bg, `--theme-paper-border` grid, `--theme-text-tertiary` axis labels, `--shadow-2` tooltip. All colours via `useChartTokens` — zero hardcoded hex passed to Recharts props.

| Component | File | Props Interface | Notes |
|---|---|---|---|
| `useChartTokens` | `useChartTokens.ts` | `ChartTokens` | Resolves 6 series colours + grid/axis/tooltip from `getComputedStyle`. Re-resolves on `themeKey` change. Exports `resolveColorMap(map)` — resolves CSS variable strings in a `Record<string, string>` to computed hex/rgb values at runtime (same `getComputedStyle` pattern). Use when a feature-level colour map needs to be passed to SVG fills. |
| `LineChart` | `LineChart.tsx` | `LineChartProps` | Multi-series. `loading` → `ChartSkeleton`. |
| `BarChart` | `BarChart.tsx` | `BarChartProps` | Stacked option. Top-radius bars. **`colorMap?: Record<string, string>`** — per-key semantic colour override; keys match `series[].key`; values are CSS variable strings resolved via `resolveColorMap` at mount and on theme switch. Partial maps valid — unmatched keys fall back to positional tokens. When `colorMap` is provided, the built-in Recharts `<Legend>` is suppressed (caller owns the legend and reads from the same map for swatch colours). **`STATUS_COLORS` pattern:** domain colour maps stay in the feature folder; `colorMap` is the bridge prop — never import feature colour maps into the wrapper. Additional passthrough props: `margin`, `barCategoryGap`, `xAxisProps`, `yAxisProps`, `tooltipProps`, `gridProps`. |
| `PieChart` | `PieChart.tsx` | `PieChartProps` | Legend optional. |
| `DonutChart` | `DonutChart.tsx` | `DonutChartProps` | `centerLabel` slot. |
| `AreaChart` | `AreaChart.tsx` | `AreaChartProps` | Gradient fill (token colour). Stacked option. |
| `ButterflyChart` | `ButterflyChart.tsx` | `ButterflyChartProps` | Vertical bar layout. Negative left series. |
| `ChartSkeleton` | `ChartSkeleton.tsx` | `ChartSkeletonProps` | Reuses `.skeleton` CSS class (`eia-skeleton-pulse`). |

### Motion Constants — `src/lib/constants/motion.ts`

All animation components import from here. Never re-declare inline.
Key exports: `ENTER_DURATION`, `EXIT_DURATION`, `BASE_DURATION`, `FAST_DURATION`, `SLOW_DURATION`, `EASE_OUT_EXPO`, `EASE_IN_EXPO`, `EASE_SPRING`, `EASE_IN_OUT`, `MODAL_VARIANTS`, `DROPDOWN_VARIANTS`, `FADE_VARIANTS`.

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

Status summary pills live in `LeadsTable.tsx` toolbar (left of column picker), not in the page header. Derived from the `leads` prop; `.status-pill` utilities in `design-tokens.css`; `hidden md:flex`.

## Labelled datum row (read-only detail fields)

Standard layout for every read-only field in detail cards (dossiers, profile sections, audit panels).

```
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

## Modal Rule

Every modal in Eia **must compose** `src/components/ui/modal.tsx`. Never reimplement modal chrome.

Modal props contract:
```
open:      boolean          — controls visibility
onClose:   () => void       — fired on Escape, backdrop click, or explicit close
title:     string           — rendered in modal header
children:  React.ReactNode  — body slot
footer:    React.ReactNode  — footer slot (rendered right-aligned)
maxWidth?: string           — Tailwind max-width class (default: "max-w-lg")
```

## AddLeadModal

`src/components/leads/AddLeadModal.tsx`

Props:
```
open:          boolean
onClose:       () => void
callerProfile: { id: string; role: UserRole; domain: AppDomain; full_name: string }
initialAgents: { id: string; full_name: string }[]   — pre-fetched at page level for caller's domain
onSuccess:     (leadId: string) => void
```

**Fields (in order):** First name, Last name, Phone, Email, Source, Domain (manager+ only), Assign to.

**Source field:** optional `<select>` — WhatsApp, Website, Meta, Google, Referral, YPO, Events. Stored in `form_data.manual_source`. `lead_intent` is always `null` on manual leads.

**Agent-domain enforcement rule:**
- Agents never see the Domain field — domain is always locked to `callerProfile.domain`.
- Agents never see the Assign-to select — rendered as a read-only display chip showing their own name.
- The server action (`createManualLead`) enforces `domain = caller.domain` on the server regardless of what the form sends.
- Managers/admins/founders see both Domain and Assign-to fields. When the domain changes, `listAgentsForDomain` is called to repopulate the agent dropdown.

**Duplicate phone handling:**
- Duplicate detection runs server-side via `get_active_lead_by_phone()`.
- When a duplicate is detected, the modal does NOT close. An inline warning banner appears with a link to the existing lead.
- The action returns `{ data: { leadId, duplicate: true }, error: null }` — never a silent insert.

## LeadColumnPicker

`src/components/leads/LeadColumnPicker.tsx`

Props:
```
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

```
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
const toast = useToast;   // toast is the singleton; hook re-exports it directly
toast.success("Lead saved");
toast.loading("Saving...");
toast.resolve(id, "success", "Saved!");
```

## Task Components

`src/components/tasks/` — SubTaskModal, TaskRemarksPanel, AssigneePickerModal.

### SubTaskModal

`src/components/tasks/SubTaskModal.tsx` — **replaces the deleted `TaskModal.tsx`**

Props:
```typescript
interface SubTaskModalProps {
  open:           boolean
  onClose:        () => void
  task:           Task
  group?:         TaskGroup          // present for group subtasks, absent for personal
  assignee?:      Profile
  initialRemarks: TaskRemarkWithAuthor[]
  callerProfile:  Pick<Profile, 'id' | 'role' | 'domain'>
}
```

**Shell:** centered overlay (`position: fixed; inset: 0`). `max-width: 1100px`, `width: 95vw`, `height: 90vh`, `max-height: 820px`. `var(--theme-overlay)` backdrop with `blur(4px)`. Scale entrance `0.96→1` at 200ms ease-out-expo. **NOT a bottom sheet.**

**Header:** breadcrumb left (`group.title › task.title` or `My Tasks › title`). Right cluster: status pill (inline dropdown, 6 options, optimistic), priority pill (inline dropdown, 3 options, optimistic), divider, edit pencil, more (⋯) menu, close ×.

**Two zones:**
- Zone A (38%, `var(--theme-surface)`): Title, Notes/Objective, Action Items checklist (group subtasks only), Key Variables (deadline + assignee), metadata footer. Edit mode footer (slide-up, Save Brief / Cancel).
- Zone B (62%, `var(--theme-paper-subtle)`): `TaskRemarksPanel` with `composerPlaceholder` prop.

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
```
taskId:               string
currentUserId:        string
currentUserName:      string
initialRemarks:       TaskRemarkWithAuthor[]
composerPlaceholder?: string   — defaults to "Add an update…"
```

Realtime: subscribes to `task_remarks` filtered by `task_id` on mount. **Channel name: `task-remarks-${taskId}-${mountId}`** — `mountId` (from `useId()`) prevents Strict Mode double-mount channel collisions. Unique per task, prevents cross-task subscription bleed.

Timeline: oldest at top, newest at bottom. Auto-scrolls to bottom on mount and on new remarks.

**Status chip:** if `remark.status_change` is set, a compact pill is rendered above the content using `TASK_REMARK_STATUS_LABELS` with status-specific colour tokens.

**Suppressed remarks:** italic "This remark was removed." in `var(--theme-text-tertiary)`.

**Compose area:** textarea (grows to 3 lines) + 6 status-change pills (3-col desktop, 2-col mobile at ≤480px via `.task-remarks-status-pills` class) + "Post update" button. `useTransition` + `isPending` guard prevents duplicate submissions. Optimistic insert at 0.6 opacity, confirmed on Realtime echo. On error: optimistic row removed, `toast.danger` fires.

**Empty state:** Playfair italic "No updates yet." centred in `var(--theme-text-tertiary)`.

Export: `TaskRemarkWithAuthor` (re-exported from `src/lib/services/tasks-service.ts`).

### AssigneePickerModal

`src/components/tasks/AssigneePickerModal.tsx`

Props:
```
open:          boolean
onClose:       () => void
onConfirm:     (userId: string, user: AssignableUser) => void
users:         AssignableUser[]       — pre-fetched by parent, max 100
initialDomain: AppDomain              — domain to pre-select
```

Opens as a nested modal. Backdrop: `--z-modal-overlay` (61). Panel: `--z-modal-nested` (62). Sits above `TaskModal` (`--z-modal` = 60).

Domain tabs at top — only shows domains with at least one user. Search filters client-side (no server round-trip). Single select. Role badge per user row. Confirm disabled until selection made.

Export: `AssignableUser = Pick<Profile, "id" | "full_name" | "avatar_url" | "role" | "domain">`.

## GroupTaskWorkspace

`src/components/tasks/GroupTaskWorkspace.tsx` — `'use client'`.

**Props:** `group: TaskGroup`, `initialSubtasks: SubtaskWithAssignee[]`, `currentUserId`, `currentUserName`, `callerRole`, `callerDomain`.

**View toggle:** `'list' | 'board'`. Persisted to `localStorage` at `eia:tasks:workspace-view:${groupId}`. Default `'list'` until hydration. `useState('list')` + `useEffect` reads localStorage — no hydration mismatch.

**List view:** Sorted by priority DESC + due_at ASC. Task rows with priority left border, title, assignee avatar, due chip, status pill, arrow to TaskModal. No inline complete.

**Board view:** 5 columns (`to_do`, `in_progress`, `in_review`, `completed`, `terminal`). Terminal column = Error + Cancelled; header label "Error / Cancelled"; count = sum of both; cards show actual status pill. Framer Motion layout animations on card move.

**Realtime:** `workspace-subtasks-${groupId}-${mountId}`. Merges INSERT/UPDATE into local state — no full refetch.

**Modal:** `SubTaskModal` opened on click. `handleModalClose` calls `getGroupSubtasksAction` to re-sync status changes.

**Add subtask FAB:** Floating `+ Add subtask` button (bottom-right, `var(--z-raised)`). Inline panel: title + priority select + due date + assignee picker. `createSubtaskAction` → re-fetches on success. No drag-and-drop. No inline complete for subtasks.

---

## CreateGroupTaskModal

`src/components/tasks/CreateGroupTaskModal.tsx` — `'use client'`

Props:
```
open:      boolean
onClose:   () => void
onCreated: (group: TaskGroup) => void   — parent converts to TaskGroupRow and prepends; no refetch
```

Composes `src/components/ui/modal.tsx` with `maxWidth="max-w-3xl"`. No `<form>` tag.

**Two-column layout:** left 280px live preview card · right form fields. Preview column hidden below 640px via `@media` rule inside `<style>`.

**Fields (in order):** Title (autofocus), Description (auto-grow textarea), Domain (native `<select>` from `APP_DOMAINS`), Accent Colour (10 swatches from `GROUP_TASK_ACCENT_COLORS`), Icon (25 Lucide icons from `GROUP_TASK_ICONS` in a 5×5 grid), divider, Priority (Urgent/High/Normal chips), Due Date (optional `datetime-local`), Add Members (search + avatar chips).

**Live preview card:** reads title, accentHex, iconName directly from state — updates on every keystroke, no debounce, no async.

**accent_color + icon_key:** UI-only. `task_groups` has no such columns as of migration 0017. Fields are NOT passed to `createGroupTaskAction`. TODO comments in file.

**Members:** `searchProfilesAction` does not exist yet. Search renders a stub dropdown with a "coming soon" message. Member chips are tracked locally but NOT passed to `createGroupTaskAction` — `task_group_members` table does not exist yet. TODO comments in file.

**Icons:** dynamic render via `import * as LucideIcons` namespace lookup, cast through `unknown` to bridge `IconComponentProps` → `{ style }` type gap.

**`onCreated`:** GroupTasksTab converts the returned `TaskGroup` to `TaskGroupRow` (adds `subtask_count: 0`, `completed_count: 0`, `assignee_previews: []`) and prepends to local state.

---

## CreatePersonalTaskModal

`src/components/tasks/CreatePersonalTaskModal.tsx` — `'use client'`

Props:
```
open:      boolean
onClose:   () => void
onCreated: (task: Task) => void   — parent prepends returned task to active list; no refetch
```

Composes `src/components/ui/modal.tsx`. No `<form>` tag — onClick/onChange throughout.

**Fields (in order):** Title (autofocus, grows 1→3 lines), Due date (Today/Tomorrow/Next week preset chips + specific datetime toggle), Priority (Urgent/High/Normal chips, default Normal), Tags (free-text chip input, max 10, Enter/comma to add), Notes (collapsed "+ Add notes" toggle, expands textarea).

**Due date IST end-of-day:** preset chips call `istEndOfDay(dayOffset)` — IST UTC+5:30 offset computed explicitly (5.5h). `toUTC()` from `dates.ts` is NOT used for presets because it is a UTC passthrough, not an IST end-of-day calculator. Specific datetime input uses `new Date(value).toISOString()`.

**Priority single-select:** clicking the active Non-normal chip deselects it → falls back to Normal. Normal cannot be deselected entirely.

**Tags:** UI-only. Tags are collected but NOT passed to `createPersonalTaskAction` — the `tasks` table has no `tags` column as of migration 0022. TODO comment in file. Add a migration + wire when ready.

**onCreated:** receives a synthetic `Task` object built from the known fields + server-returned `taskId`. Parent (PersonalTasksTab) prepends it to `activeTasks` state — no re-fetch needed.

**Inline error:** title-required error shown under the title field. Toast `danger` for server errors — modal stays open.

---

## PersonalTasksTab

`src/components/tasks/PersonalTasksTab.tsx`

Props:
```
initialResult:   PersonalTasksResult
currentUserId:   string
currentUserName: string
callerRole:      UserRole
callerDomain:    AppDomain
```

**Layout:** three active priority sections (URGENT / HIGH / NORMAL) + one collapsed Completed section at the bottom. No filter bar. No pagination.

**Data:** on mount, two parallel `getPersonalTasksAction` calls via `Promise.all`:
- Active tasks: `status: ['to_do','in_progress','in_review','error','cancelled'], limit: 500`
- Completed tasks: `status: ['completed'], limit: 20`

**Section collapse:** state lives in `useRef` (`sectionOpenRef`), **not** `useState`. A separate `sectionRenderKey` counter triggers re-renders only when the user explicitly toggles a section. This prevents optimistic status updates from collapsing sections. Default state: URGENT/HIGH/NORMAL open, COMPLETED closed.

**Completion circle:** 24px button on the left of each row. Own tasks (assigned_to = currentUserId or null) get a clickable solid circle → hover fills with accent surface → click calls `updateTaskStatusAction` optimistically. Completed tasks show a gold `CheckCircle2` (var(--theme-accent)) → click reopens via `updateTaskStatusAction(taskId, 'to_do')`. Tasks assigned to someone else get a dashed non-interactive circle.

**Optimistic status map:** `Record<string, TaskStatus>` keyed by `taskId`. On error: entry deleted + `toast.danger`. Completed section shows last 20 tasks from the completed fetch.

**Quick-add row:** title input + due date + assignee picker (manager+ only). No priority selector — defaults to `'normal'`, user sets priority in TaskModal. `useTransition` + `isPending` guard (Problem 7 pattern). After save, re-fetches active list.

**Due date chip colours:** overdue → `var(--color-danger-text)`, due today → `var(--color-warning-text)`, future → `var(--theme-text-tertiary)`.

**Empty state:** Playfair italic "All clear for now." — only shown when no active tasks.

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

A full adoption sweep ran across `src/` replacing inline UI patterns with `src/components/ui/` library components. **33 replacements** made across 20 files. **7 items flagged** in [`docs/component-sweep-flags.md`](../../docs/component-sweep-flags.md).

### What was replaced

| Pattern | Component adopted | Files |
|---------|------------------|-------|
| `Loader2` inline spinners | `Spinner` | CalledModal, AgentScratchpad, PersonalDetailsCard, ProfileAvatarSection |
| Raw `<button>` primary/secondary | `Button` | All auth forms, all admin forms, profile forms, lead modals, dashboard widgets (refresh buttons) |
| Custom toggle/switch | `Toggle` | NotificationPreferences, UserStatusControls |
| Custom avatar/initials fallback | `Avatar` | TaskRemarksPanel, SubTaskModal, PersonalTasksTab, CreateGroupTaskModal, GroupTaskWorkspace, GroupTasksTab, UsersTable |
| Inline search input | `SearchBar` | UsersTable |
| Raw `<table>` | `Table` | UsersTable |
| Period toggle buttons | `TabSelector` (pill) | ManagerLeadVolumeWidget, PerformancePeriodSelector |
| Custom tab bar | `TabSelector` (border-bottom) | TasksShell |

### What was NOT touched (flagged)

See [`docs/component-sweep-flags.md`](../../docs/component-sweep-flags.md) for the full list of 7 flagged items including `AvatarStack`, `AssigneePickerModal` selected state, `CreateUserForm` connected-tab, both Recharts chart widgets, task icon-only `motion.button` instances, and InfoRow candidates.

### Rule established

Every future modal **must** compose `src/components/ui/modal.tsx`. Every future loading indicator **must** use `Spinner`. Every future form submit button **must** use `Button`. Search `src/components/ui/` before implementing any pattern inline.
