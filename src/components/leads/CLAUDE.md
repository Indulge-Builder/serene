# src/components/leads — CLAUDE.md

All components in this folder are **display-only**. They receive data via props.
Zero DB calls. Zero business logic. Zero service imports.

Cross-feature data flows through `lib/` only.
Every modal composes `src/components/ui/modal.tsx` — never reimplements chrome.

---

## LeadsFilters — draft → Apply contract

`LeadsFilters.tsx` — `'use client'`

**`FilterDraft` type** (defined in the component file):
```ts
type FilterDraft = {
  status: LeadStatus[];
  outcome: CallOutcome[];
  domain: string | null;
  agent_id: string | null;
  source: string | null;
  campaign: string | null;
  date_from: string | null;
  date_to: string | null;
  // search is NOT in FilterDraft — it has its own searchInput state + useDebounce
};
```

**Search state** is managed separately from the dropdown/date draft:
- `searchInput: string` — controlled display value, updates on every keystroke.
- `debouncedSearch` — `useDebounce(searchInput, 350)` from `src/hooks/useDebounce.ts`.
- A `useEffect` keyed on `debouncedSearch` guards with `trimmed === (params.get('search') ?? '')` before pushing.
- `clearAll` calls `setSearchInput('')` immediately (no 350ms wait).
- `SearchBar` from `src/components/ui/SearchBar.tsx` renders the input — never re-implement inline.

**`draftFromParams(params: URLSearchParams): FilterDraft`** — pure helper that reads all filter keys from the current `URLSearchParams`. Used to initialise state and to sync draft on browser back/forward (`useEffect([params])`).

**`isDirty`** — computed `boolean`. Compares each `draft` field against the live URL param using serialised string comparison (`draft.status.join(',') !== params.get('status') ?? ''` etc.). Never a `useState`. Array reference equality traps will give false positives — always compare serialised strings.

**Two-row layout:**
- Row 1: `flex + alignItems: center + gap: --space-3`. Icon + badge (`flexShrink: 0`). Search input (`flex: 1`).
- Row 2: `flex + alignItems: center + gap: --space-2 + flexWrap: nowrap`. Every `FilterDropdown` and date control gets `flexShrink: 0`. A `flex: 1` spacer separates filters from the action buttons. **Never** set `overflow: hidden` or `overflow: auto` on Row 2 — dropdown panels are absolutely positioned and must float above layout unconstrained.

**Apply button:** `Button variant="primary" size="sm"` (not `MotionButton`) wrapped in `AnimatePresence motion.div` (`initial/exit: { opacity: 0, scale: 0.95 }`, 150ms `EASE_OUT_EXPO`). Rendered only when `isDirty`. Calls `applyFilters()` which builds the full URL from all draft keys and fires one `router.push`.

**`committedCount`** — counts active URL params (what the table is showing), **not** draft values. Used for the badge and for showing/hiding the Clear button. Never substitute `isDirty` for `committedCount`.

**Domain change invariant:** `domain` change must atomically clear `agent_id` and `campaign` in the same `setDraft` call. Never use a separate `useEffect` for this.

**Zero `setTimeout` debounce.** Zero per-keystroke `router.push` — including search.

---

## Component inventory

### LeadInfoCard

`LeadInfoCard.tsx` — `'use client'`

Props:

```text
lead:            Lead
assigneeName:    string | null
adCreatives?:    AdCreative[]         — all videos for the lead's campaign (newest first); resolved by the dossier page
canEdit?:        boolean              — inline edit for email + source (`utm_source`) (assigned agent, manager in-domain, admin, founder)
canEditDomain?:  boolean              — Gia domain inline select menu (manager+ with access; agents never)
canReassign?:    boolean              — inline assignee select menu (manager/admin/founder)
agents?:         { id: string; full_name: string }[]   — active agents for the lead's domain; pre-fetched by dossier page
```

Renders the left-column contact card on the lead dossier page.
Campaign (`utm_campaign`) is an `InfoRow` after Received; opens `CampaignVideoModal` when `adCreatives.length > 0`.
`Last modified` shows `lead.updated_at` (read-only).
Name and phone are always read-only `InfoRow`s. Email: click → inline text input. Domain, source (`utm_source`), assignee: identical to `InfoRow` at rest; click opens a simple themed option menu (no `FilterDropdown`, no search). No card-wide edit mode.

**Reassignment rules:**

- When `canReassign={true}`, the "Assigned to" field uses the same inline themed option menu as domain/source — not `FilterDropdown`, not a combobox component.
- At rest it is visually identical to every other read-only `InfoRow` — no border, no box, no visible chevron.
- On hover: a dashed accent underline appears under the name text and a small `ChevronDown` fades in.
- On click: a dropdown opens with a search input (auto-focused) and a list of agents from the `agents` prop.
- Selecting an agent calls `assignLead` from `lib/actions/leads.ts`, optimistically updates `currentAssigneeName` in local state, and shows a `Check` tick for 2 seconds. No page reload needed.
- `canReassign` is derived server-side from `profile.role` — never computed in the component.
- `agents` is fetched once in the dossier page via `getAgentsForDomain(lead.domain)` and is `[]` for agent-role callers (the field falls back to read-only `InfoRow`).

**Ad creative trigger rules:**

- A campaign may have multiple videos — `adCreatives` is an array. The modal shows an `AdCreativeCarousel` (loops through all videos).
- `utm_campaign` is an `InfoRow` after Received; renders as `CampaignLinkTrigger` only when `adCreatives.length > 0`.
- Hover: `color → var(--theme-accent)`, `text-decoration-color → var(--theme-accent)`, 150ms transition.
- When `adCreatives` is empty, campaign renders as plain mono text — no cursor change, no hover affordance.

---

### CampaignVideoModal

`CampaignVideoModal.tsx` — `'use client'`

Props:

```text
isOpen:       boolean
onClose:      () => void
campaignName: string
adCreatives:  AdCreative[]
```

Composes `ui/modal.tsx` with `maxWidth="max-w-2xl"`, footer `null`. Renders
`AdCreativeCarousel` (from `components/campaigns/`) with `showMeta` — loops through
all of the campaign's videos via prev/next arrows. Subtitle shows the count when > 1.
Returns `null` when `adCreatives` is empty. The carousel owns the `<video>` element (autoplay and pause-on-unmount); this modal no longer renders a raw `<video>`.

---

### AddLeadModal

`AddLeadModal.tsx` — `'use client'`

Props:

```text
open:          boolean
onClose:       () => void
callerProfile: { id: string; role: UserRole; domain: AppDomain; full_name: string }
initialAgents: { id: string; full_name: string }[]
onSuccess:     (leadId: string) => void
```

Fields: First name, Last name, Phone, Email, Source, Domain (manager+), Assign to.
Source optional select → `leads.utm_source` (values from `lib/constants/lead-sources.ts`). `lead_intent` always null on manual leads.
Duplicate detection server-side; inline banner with dossier link on dup — modal stays open.

---

### LeadColumnPicker

`LeadColumnPicker.tsx` — `'use client'`

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

Drag-to-reorder via `@dnd-kit/sortable`. Locked columns (status, name) show `Lock` icon — not toggleable.
Entrance animation: `opacity 0→1, y -4→0`, 200ms, ease-out-expo.

---

### LeadNotesInput

`LeadNotesInput.tsx` — `'use client'`

Props:

```text
leadId:       string
canAdd:       boolean    — same gate as canEditPersonalDetails on the dossier page
onNoteAdded?: () => void — optional callback fired after successful note post
```

Calls `addLeadNote` action. Submits via button click or ⌘+Enter. Uses `useTransition`.
Header uses `--color-info-dark-*` tokens. Note has `call_outcome = null` — it does NOT increment `call_count` or change `last_call_outcome`.

---

### ReasonModal (inside StatusActionPanel)

`ReasonModal` is a private component inside `StatusActionPanel.tsx`.
It receives a `status: 'junk' | 'lost'` prop and uses it to select the correct reason list:

- `'junk'` → `JUNK_REASONS` from `src/lib/constants/lead-resolution-reasons.ts`
- `'lost'` → `LOST_REASONS` from `src/lib/constants/lead-resolution-reasons.ts`

The reason selector is rendered with `FilterDropdown multi={false}` — matching the `CalledModal`
outcome selector pattern exactly. The old raw `<select>` + `ChevronDown` overlay is removed.

`RESOLUTION_REASON_LABELS` (same file) maps reason IDs to display labels for use in the activity log.

---

### StatusActionPanel — Revive flow

When `status === 'junk'`, a `Revive Lead` button (amber/warning style, Zap icon) appears.
Clicking opens a `ConfirmModal` that calls `updateLeadStatus('in_discussion')`.
All prior history (calls, notes, activities) is preserved.
SLA timers re-schedule automatically — the existing `updateLeadStatus` action handles this correctly because `in_discussion` is not in `TERMINAL_SLA_STATUSES`.
The Called button remains disabled for junk leads — revive first, then call.

---

---

### LeadTasksCard

`LeadTasksCard.tsx` — `'use client'`

Props:

```text
leadId:       string
initialTasks: Task[]    — pre-fetched by LeadTasksAsync (server component)
```

Shows all gia_followup tasks for a lead (replaces `LeadDossierTasksAsync` which showed only the next task).
Header right slot: small `+` ghost icon button → opens `CreateLeadTaskModal`.
Uses `TaskCompletionCircle` + `useTaskCompletionToggle` for completion toggles.
After successful task creation, prepends new task to local state (no full refetch).
Overdue `due_at` renders in `var(--color-danger-text)` via `formatTaskDueAt()` (`h:mm a, d MMM`, IST).
Completed tasks rendered at 0.5 opacity with strikethrough.
Empty state: Playfair italic sentence.

---

### LeadTasksAsync

`LeadTasksAsync.tsx` — async server component (direct child of `<Suspense>`)

Props: `leadId: string`

Only place that calls `getAllLeadTasks(leadId)` from `tasks-service.ts`.
Passes result to `<LeadTasksCard>`.

---

### LeadTasksCardSkeleton

`LeadTasksCardSkeleton.tsx` — server-component-safe skeleton

Two rows at `TaskCompletionCircle` height. Widths: 80% / 60%.
Used as `fallback` for the `<Suspense>` wrapping `<LeadTasksAsync>` on the dossier page.

---

### CreateLeadTaskModal

`CreateLeadTaskModal.tsx` — `'use client'`

Props:

```text
open:          boolean
onClose:       () => void
leadId:        string
onTaskCreated: (task: Task) => void
```

Composes `src/components/ui/modal.tsx`. Four fields only:

1. Task type — RadioGroup-style list using `TASK_TYPES` / `TASK_TYPE_LABELS` from `task-types.ts`
2. Priority — three chip buttons (Urgent / High / Normal), default Normal
3. Due date & time — `DatePicker` with `showTime=true` from `src/components/ui/DatePicker.tsx`
4. Notes (description) — optional `<textarea>` max 1000 chars

Title derived from `TASK_TYPE_LABELS[taskType]` — never hardcoded.
Calls `createLeadTaskAction` on submit. On success calls `onTaskCreated(task)`.
Inline error below submit button in `var(--color-danger)` on failure.

**Replaced by:** `LeadDossierTasksAsync` is retired; this modal + `LeadTasksCard` together replace it.

---

### LeadWhatsAppCard

`LeadWhatsAppCard.tsx` — `'use client'`

Props:

```text
leadId:              string
leadPhone:           string | null
leadName:            string
callerProfile:       { id: string; role: string }
initialConversation: WhatsAppConversation | null
initialMessages:     WhatsAppMessage[]
```

Embedded WhatsApp chat card on the lead dossier page. Placed between the 2-col grid and `LeadNotesSection`.

**No-phone guard:** when `leadPhone` is null, renders Playfair italic *"No phone number on file."* — no composer.

**No-conversation guard:** when `initialConversation` is null, renders *"No messages yet."* + subtext. No composer (inbound-only conversation creation).

**Resolved state:** composer replaced by italic banner *"This conversation is resolved."*

**Realtime pattern:**

- Channel name: `wa-messages-${conversationId}-${mountId}` — `useId()` mount suffix required (P-06 / StrictMode safety)
- `seenIds` ref seeded from `initialMessages` to prevent double-append
- `optimisticIds` ref tracks pending sends; echo detection replaces the oldest optimistic row
- Cleanup: `supabase.removeChannel(channel)` — never `channel.unsubscribe()` alone
- Only subscribes when `initialConversation` is non-null

**Optimistic send:** adds a row with `id: optimistic-${Date.now()}`, replaces on Realtime echo, removes + `toast.danger` on error.

**Initiation state transition:** when `initialConversation` is null and `leadPhone` is non-null, the card renders a "Start Conversation" `Button` instead of the empty state. Clicking calls `initiateWhatsAppConversationAction(leadId)`. On success: `setConversation(data.conversation)` + `setMessages([data.message])`. The Realtime `useEffect` gates on `conversation?.id` (state, not prop), so it automatically subscribes after initiation without any extra wiring.

**Invariant:** imports ONLY from `lib/actions/whatsapp.ts` — never imports `whatsapp-service.ts` directly (server client restriction).

---

## Service dependency map

| Component             | Service used (via prop, not import)                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| LeadInfoCard          | `getAdCreativesForCampaign` on dossier page → `ad-creatives-service.ts`                              |
| AddLeadModal          | `createManualLead` action, `listAgentsForDomain` action                                              |
| LeadColumnPicker      | none — props only                                                                                    |
| CampaignVideoModal    | none — props only                                                                                    |
| LeadTasksCard         | `TaskCompletionCircle` + `useTaskCompletionToggle`; `createLeadTaskAction` via `CreateLeadTaskModal` |
| LeadTasksAsync        | `getAllLeadTasks` from `tasks-service.ts` (server only)                                              |
| LeadTasksCardSkeleton | none                                                                                                 |
| CreateLeadTaskModal   | `createLeadTaskAction` from `lib/actions/leads.ts`                                                   |
