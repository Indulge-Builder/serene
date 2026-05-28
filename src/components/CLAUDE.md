# Components CLAUDE.md

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
- Reference implementation: `DatumRow` / `DatumValue` in `src/components/leads/LeadInfoCard.tsx`.
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

`src/components/tasks/` — TaskModal, TaskChatPanel, AssigneePickerModal.

### TaskModal

`src/components/tasks/TaskModal.tsx`

Props:
```
open:            boolean
onClose:         () => void
task:            Task
assignee:        Pick<Profile, "id" | "full_name" | "avatar_url"> | null
initialMessages: TaskMessageWithAuthor[]
currentUserId:   string
currentUserName: string
```

Two-column layout (desktop): left 55% details, right 45% chat. Mobile: full-screen bottom sheet, details on top, chat below.

**Inline editing:** Title and Description save on blur via `updateTaskAction`. 400ms debounce. Accent underline on focus signals editability. **Pending saves are flushed synchronously when the modal closes** — never lost.

**Status segmented control:** 6 compact pills in a 3-column grid (2-column at ≤480px). Active pill uses status-specific colour tokens. Calls `updateTaskStatusAction`.

**Priority pills:** 3 pills (Urgent/High/Normal). Uses `--color-danger`, `--color-warning`, `--theme-text-secondary` via `var()` — zero hex values.

**No `<form>` tag.** All interactions via onClick/onChange handlers.

**Does not fetch task data.** Receives `task` as a prop. Parent is responsible for data fetching.

### TaskChatPanel

`src/components/tasks/TaskChatPanel.tsx`

Props:
```
taskId:          string
currentUserId:   string
currentUserName: string
initialMessages: TaskMessageWithAuthor[]
```

Realtime: subscribes to `task_messages` filtered by `task_id` on mount. **Channel name: `task-messages-${taskId}`** — unique per task, prevents cross-task subscription bleed.

Optimistic insert: message appears immediately at 0.6 opacity. Confirmed on Realtime echo (matched by content + author_id). If action errors: optimistic row removed, `toast.danger` fires.

Auto-scrolls to bottom on new messages. Textarea grows to 3 lines max. Enter sends, Shift+Enter inserts newline.

Export: `TaskMessageWithAuthor = TaskMessage & { author: Pick<Profile, "full_name" | "avatar_url"> | null }`.

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
