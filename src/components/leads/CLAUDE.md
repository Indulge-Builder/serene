# src/components/leads — CLAUDE.md

All components in this folder are **display-only**. They receive data via props.
Zero DB calls. Zero business logic. Zero service imports.

Cross-feature data flows through `lib/` only.
Every modal composes `src/components/ui/modal.tsx` — never reimplements chrome.

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
Header uses `--color-info-dark-*` tokens to visually distinguish from the scratchpad (which uses `--theme-paper-subtle`). Note has `call_outcome = null` — it does NOT increment `call_count` or change `last_call_outcome`.

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
Overdue `due_at` renders in `var(--color-danger)`.
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
