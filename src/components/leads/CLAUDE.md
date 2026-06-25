# src/components/leads — CLAUDE.md

All components in this folder are **display-only**. They receive data via props.
Zero DB calls. Zero business logic. Zero service imports.
**Sole exception — the `*Async.tsx` server components** (`LeadTasksAsync`, `LeadInfoCardAsync`,
`LeadDealCardAsync`, `LeadNotesSectionAsync`, `LeadActivitiesAsync`, `LeadWhatsAppCardAsync`):
each is a direct child of a `<Suspense>` boundary on the dossier page, is the *only* place its
service function is called from the dossier, and delegates all rendering to a display component.

Cross-feature data flows through `lib/` only.
Every modal composes `src/components/ui/modal.tsx` — never reimplements chrome.

---

## LeadsFilters — immediate-commit contract

`LeadsFilters.tsx` — `'use client'`

**The Apply/draft model is gone (2026-06-12).** Every filter commits the moment it
changes, exactly like `DealsFilters` — each `push` merges into the existing URL params
via `buildFilterParams`, so selections compound (status AND agent AND dates).
There is no `FilterDraft`, no `draftFromParams`, no `isDirty`, no Apply button —
never reintroduce them.

**Commit paths (two, by selection shape):**

- **Single-selects (Source, Campaign, Agent, Domain) + dates:** read the committed
  value straight from `params`, commit with `url.push({ key: value })` on change —
  byte-for-byte the `DealsFilters` pattern.
- **Multi-selects (Status, Outcome):** `useMultiSelectUrlParam(url, key)` from
  `src/hooks/useUrlFilters.ts` — THE optimistic multi-select param. Local state echoes
  the URL value so checkboxes tick instantly (`useSearchParams` only updates after the
  navigation commits); the URL commit goes through `url.pushDebounced` (350ms, the
  standard delay), so a burst of checkbox toggles lands as **ONE** `router.push` / one
  RSC render. Re-syncs from the URL on commit echo, back/forward, and clearAll. Never
  hand-roll this echo+debounce state in a filter component.

`pushDebounced` accumulates updates in a ref and every commit path (`push`, the search
effect, `clearAll`) drains the accumulator first — an immediate single-select push can
never race a pending multi-select commit into dropping a key; they merge into the same
navigation.

**Sort order toggle** lives in `LeadsTable.tsx` toolbar (right cluster), immediately left of the Columns button — not in `LeadsFilters`. Cycles `'desc' → 'asc' → 'desc'` on click; commits immediately to the URL via `buildFilterParams` (resets `page`). Labels: "Newest first" (default, `desc`) / "Oldest first" (`asc`). `sort_order=asc` is the only value written to the URL; default `desc` omits the param. `clearAll()` in `LeadsFilters` pushes bare `pathname`, which also clears `sort_order`.

**Going Cold chip** lives in `LeadsTable.tsx` toolbar (left cluster — first control, or just right of the manager view switcher when that's shown) — not in `LeadsFilters`. Immediate-commit via `buildFilterParams`; on activate clears `status` + `outcome` from URL. `activeCount` in `LeadsFilters` still counts `going_cold=true`.

**Shell composition:** the bar chrome (icon, search, divider, Range trigger + panel, Clear) is `<FilterBar>` from `src/components/ui/FilterBar.tsx` with `layout="scroll"`, `showCountBadge={false}`, `dateRange.trigger="chevron"`. This file owns only the six `FilterDropdown`s + their commit wiring.

**Search state** is managed separately from the dropdown/date draft — owned by `useUrlFilters({ resetKeys: ['page'] })` from `src/hooks/useUrlFilters.ts`:

- `searchInput: string` — controlled display value, updates on every keystroke.
- Debounced 350ms via `useDebounce` inside the hook; the push effect guards with `trimmed === (params.get('search') ?? '')`.
- `clearAll` (hook) calls `setSearchInput('')` immediately (no 350ms wait).
- `SearchBar` renders inside `<FilterBar>` — never re-implement inline.

**Multi-select URL parsing** is `parseMultiParam<T>(params, key)` from
`src/lib/utils/filter-params.ts` (comma-separated values) — never re-inline the split.

**Single-row layout** (left → right):

- Container: `<FilterBar layout="scroll">` — `flexWrap: nowrap`, `gap: var(--space-2)`, `overflowX: auto`, hidden scrollbar. Horizontal scroll on narrow viewports; chips stay on one line.
- Order: Sliders icon → `SearchBar` → 1px vertical divider → Status → Outcome → Source → Campaign? → Agent? → Domain? → Range → Clear?.
- **Search:** `suppressFocusAccent` — paper border + no `--shadow-focus` on focus. `style={{ flex: '1 1 180px', maxWidth: '280px' }}` — grows modestly but never dominates wide viewports (without `maxWidth`, chips scroll off-screen).
- **Filter chips:** `menuPortal` + `hideCountBadge` + `accentBorderOnOpen={false}` — no numeric count on triggers (prevents width shift); accent border/tint when the chip has a selection, not when the menu is open.
- **Range:** accent border only when dates are set (`rangeActive`), not when the panel is open.
- **Divider:** inline `div`, `width: 1`, `height: 1.25rem`, `background: var(--theme-paper-border)`, `flexShrink: 0` — separates search from filter chips.
- Every `FilterDropdown` and the Range trigger: `flexShrink: 0`.
- **Dropdown panels:** every `FilterDropdown` must pass `menuPortal` (menus render `position: fixed` on `document.body`). Without it, `overflowX: auto` on the row clips the absolutely positioned menu and options are unreachable. The Range date panel lives inside `<FilterBar>` (`usePortalAnchor()` + `<FloatingPanel>` + `<DateRangeFields>` — see `src/components/CLAUDE.md` Overlays) — same rule, owned structurally.

**`activeCount`** — counts active URL params (what the table is showing). Used only for showing/hiding the Clear button — no numeric badge in the bar.

**Domain change invariant:** `domain` change must atomically clear `agent_id` and `campaign` in the same `push()` call. Never use a separate `useEffect` for this.

**Zero hand-rolled debounce in this component.** All debouncing lives in `useUrlFilters` (search) and `pushDebounced`/`useMultiSelectUrlParam` (multi-selects). Zero per-keystroke `router.push` — including search.

---

## Component inventory

### LeadInfoCard

`LeadInfoCard.tsx` — `'use client'`

Props:

```text
lead:            Lead
assigneeName:    string | null
adCreatives?:    AdCreative[]         — all videos for the lead's campaign (newest first); resolved by the dossier page
canEdit?:        boolean              — inline edit for email + source (`leads.source`, renamed from `utm_source` in the 0065 attribution refactor) (assigned agent, manager in-domain, admin, founder)
canEditDomain?:  boolean              — Gia domain inline select menu (manager+ with access; agents never)
canReassign?:    boolean              — inline assignee select menu (manager/admin/founder)
agents?:         { id: string; full_name: string }[]   — active agents for the lead's domain; fetched by LeadInfoCardAsync
```

Renders the left-column contact card on the lead dossier page.
Campaign (`utm_campaign`) is an `InfoRow` after Received; opens `CampaignVideoModal` when `adCreatives.length > 0`.
`Last modified` shows `lead.updated_at` (read-only).
Name and phone are always read-only `InfoRow`s. Email: click → inline text input. Domain, source (`leads.source`), assignee: identical to `InfoRow` at rest; click opens a simple themed option menu (no `FilterDropdown`, no search). Interests (`service_interests`, `canEdit` gate): click → `FormChip` multi-select in the `LeadFieldShell` chrome with explicit Save/Cancel (multi-select cannot commit per toggle) — `InterestsInlineField`, private to this file; options from `getDomainInterests(lead.domain)`, the `updateLeadInterests` action returns the server-resolved array which becomes the display value, `onSaved` → `router.refresh()` re-renders `ServiceInterestCard`. No card-wide edit mode.

**Reassignment rules:**

- When `canReassign={true}`, the "Assigned to" field uses the same inline themed option menu as domain/source — not `FilterDropdown`, not a combobox component.
- At rest it is visually identical to every other read-only `InfoRow` — no border, no box, no visible chevron.
- On hover: a dashed accent underline appears under the name text and a small `ChevronDown` fades in.
- On click: a dropdown opens with a search input (auto-focused) and a list of agents from the `agents` prop.
- Selecting an agent calls `assignLead` from `lib/actions/leads.ts`, optimistically updates `currentAssigneeName` in local state, and shows a `Check` tick for 2 seconds. No page reload needed.
- `canReassign` is derived server-side from `profile.role` — never computed in the component.
- `agents` is fetched once in `LeadInfoCardAsync` via `getAssignableUsers({ domain: lead.domain, roles: LEAD_ASSIGNABLE_ROLES })` (agents + managers — managers carry leads) and is `[]` for agent-role callers (the field falls back to read-only `InfoRow`).

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

### LeadDealCard

`LeadDealCard.tsx` — `'use client'`

Props:

```text
deal: Deal     — the closed deal a won lead generated (from public.deals)
```

Dossier-only summary card rendered for won leads (`LeadDealCardAsync` resolves the `Deal` row
behind a `<Suspense fallback={null}>` and passes it in). Wraps the whole card in
`<Link href="/deals">` — there is **no per-deal route**, so `/deals` is the correct target.

- **Distinct from `DealCard`** (`src/components/deals/DealCard.tsx`, the deals-list row). Different
  shape, link target, and density. Never import or extend `DealCard` here.
- Trophy glyph + "Closed Deal" micro-label · mono `deal_amount` in accent · type chip
  (`DEAL_TYPE_LABELS`) · membership duration chip (`DEAL_DURATION_LABELS`) · "Won {date}".
- Labels come from `src/lib/constants/deal-types.ts`; currency via `formatCurrency`; date via `formatDate`.
- Framer Motion opacity-only fade-in (`BASE_DURATION`, `EASE_OUT_EXPO`).
- Chrome is a flat neutral `1px --theme-paper-border` card (no single-edge accent strip — the
  Trophy glyph + accent-coloured amount carry the "won" signal per the Side-edge-accent rule).

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

Fields: First name, Last name, Phone, Email, Source, Domain (manager+), Assign to, Interests (optional `FormChip` multi-select).
Source optional select → `leads.source` (values from `lib/constants/lead-sources.ts`). `lead_intent` always null on manual leads.
Interests: options from `getDomainInterests(watchedDomain)` + `getServiceCategoryLabel()` (`lib/constants/interests.ts`); domain switch filters the selection to the new vocabulary; server drops unknowns against the resolved domain via `extractServiceInterests` → `leads.service_interests text[]` (empty = `'{}'`).
Duplicate detection server-side; inline banner with dossier link on dup — modal stays open.
Loaded via `next/dynamic` in `AddLeadButton` behind `useMountOnFirstOpen` (perf G-1) — never statically import it into a route chunk.

---

### BulkEditLeadsModal

`BulkEditLeadsModal.tsx` — `'use client'`

Props: `open`, `onClose`, `selectedIds: string[]`, `callerRole: UserRole`, `callerDomain: AppDomain`, `onSuccess: () => void`.

THE bulk lead-edit panel — edits **one OR MORE** fields across the selected leads in one submit.
Each field is opt-in (a `Toggle` gates its picker): Reassign to agent, Set status (non-terminal
only — `BULK_STATUS_ENUM`), Set source, Move to domain. Domain + Assign-to are manager+ only
(`callerRole !== 'agent'`). Composes `modal.tsx` + `FilterDropdown` (`menuPortal` — the
AddLeadModal-in-a-modal pattern, never a clipped panel) + `Toggle`. The assignee pool is fetched
on intent via `getAssignableUsersAction(targetDomain)` and follows the chosen Move-to domain.
Calls `bulkUpdateLeads` (`lib/actions/leads.ts`) → toast `updated · skipped · failed` → `onSuccess()`
(clears selection) + `router.refresh()`. Mounted from `LeadsSelectionToolbar` via `next/dynamic`
(perf G-1) — out of the `/leads` chunk until first open. **The write path is NOT a batched raw
`UPDATE`** — `bulkUpdateLeads` loops the existing per-lead cores so SLA/notify/activity/cache fire
identically to single-edit (R-01); access is re-checked per lead, skipped leads never fail the batch.

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
Loaded via `next/dynamic` in `LeadsTable` behind `useMountOnFirstOpen` (perf G-1) — keeps the @dnd-kit chain out of the /leads chunk; the latch preserves the internal exit animation. `LeadRow` in the same file is `memo()`-ised (perf G-4) — keep its props primitive/stable (`selected` boolean + `useCallback`'d `onToggleSelect`, never the `Set`).

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

**Voice dictation (2026-06-12; extracted to `DictationButton` 2026-06-14):** the footer mounts
`<DictationButton variant="inline" what="a note" onError={setError} onBusyChange={setDictationBusy} />`
(`src/components/ui/DictationButton.tsx`) — THE shared voice cluster (records via `useAudioRecorder`,
transcribes via `transcribeAudioAction` → Deepgram Nova-3). The transcript is **appended to the
textarea as an editable draft** via `onTranscript` — never auto-submitted; saving always goes
through the same `addLeadNote` path as a typed note (sanitisation, activities, cache invalidation
identical). Audio is never persisted. The danger-dot `m:ss / 2:00` counter + stop/× buttons +
Transcribing… spinner all live inside `DictationButton` now (next to the mic) — the footer keeps
only the ⌘+Enter hint; `dictationBusy` (from `onBusyChange`) gates the Post-note submit while a
take is in flight. The mic renders only when `MediaRecorder` is supported (the component returns
`null` otherwise). **`CalledModal` mounts the same `DictationButton`** (`variant="inline"`,
`what="the note"`, Note label-row slot; saved via `addLeadCallNote`). Never re-inline a
mic/transcribe cluster — `DictationButton` is the only copy. Mid-recording modal close is safe:
unmount triggers the hook's discard + mic-track release.

---

### LeadNotesSection

`LeadNotesSection.tsx` — display-only read-only notes timeline (props only; resolved by `LeadNotesSectionAsync`).

**Timeline markup mirrors `LeadActivityLog` (2026-06-15, R-01):** each note is a `display: flex` row
with a fixed **15px dot/connector column** — `alignItems: center` centers both the 15px dot and the
1px vertical rule on the track, and the connector flows below the dot (`flex: 1` + `minHeight: var(--space-5)`,
rendered for every note but the last). **Never reintroduce the old absolute-positioned dot scheme**
(`position: absolute` + `left: '-var(--space-6)'` + `marginLeft: '-22px'`): a CSS var cannot be negated
inline, so that scheme floated the dots off the line. Every offset is a token; no raw px where a token
exists. The two dossier timelines (notes + activity) share this one structure — keep them in step.

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

### StatusActionPanel — Revive flow (junk → in_discussion, status-changing)

When `status === 'junk'`, a `Revive Lead` button (amber/warning style, Zap icon) appears.
Clicking opens a `ConfirmModal` that calls `updateLeadStatus('in_discussion')`.
All prior history (calls, notes, activities) is preserved.
SLA timers re-schedule automatically — the existing `updateLeadStatus` action handles this correctly because `in_discussion` is not in `TERMINAL_SLA_STATUSES`.
The Called button remains disabled for junk leads — revive first, then call.

**This is a DIFFERENT action from Lead Revival's `ReviveLeadButton`** — they only share the word
"revive". This one CHANGES the lead status (junk → in_discussion). The Lead Revival button below
creates a follow-up task and never touches the lead status.

---

### ReviveLeadButton (Lead Revival R1 — task-only, never changes status)

`ReviveLeadButton.tsx` — `'use client'`

THE single revive-action component, **two mount points** (one implementation, never two):
`RevivalReviewBanner` (review-row context) and `RevivalDossierAction` (dossier). Calls
`reviveLeadAction` (which wraps `reviveLeadCore` — the E2 task path + a "Revived" marker) and,
when a candidate is supplied, resolves it. Optional `showDismiss` → `dismissRevivalCandidateAction`.
**Revival NEVER mutates the lead's status or columns** — it creates a follow-up task + resolves the
`revival_candidate`. Props: `leadId`, `candidateId?`, `showDismiss?`, `size?`, `onResolved?`.

### RevivalReviewBanner

`RevivalReviewBanner.tsx` — `'use client'`. Rendered by `LeadsTableAsync` above the reused
`LeadsTable` only when `?revival=true`. Surfaces the AI **reasoning** beside each candidate (a
table cell can't hold a sentence of prose) + mounts `ReviveLeadButton` per row. It is the
reasoning + action surface, **NOT a second lead list** — the reused `LeadsTable` below is the list.
Locally hides a row on resolve (`onResolved`). Props: `rows: RevivalReviewRow[]`.

### RevivalDossierAction

`RevivalDossierAction.tsx` — async server component (the dossier mount point). Renders ONLY when
`getOpenCandidateForLead(leadId)` returns a candidate (most leads have none — `Suspense fallback={null}`,
like `LeadDealCardAsync`). Surfaces the AI reasoning + suggested date + `ReviveLeadButton` inline,
mounted right after `StatusActionPanel` on the dossier.

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
Header right slot: small `+` ghost icon button → opens `CreateLeadTaskModal` (loaded via `next/dynamic`, perf G-1 — the existing call-site `AnimatePresence` conditional already defers the chunk; no latch needed).
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

### Dossier async children (perf audit 2026-06-11 item B)

All follow the `LeadTasksAsync` pattern — async server component, direct child of `<Suspense>`,
the only dossier call site for its service function, delegates rendering to a display component.

| Component | Props | Fetches | Renders |
| --------- | ----- | ------- | ------- |
| `LeadInfoCardAsync` | `lead: LeadWithAssignee`, `canEdit`, `canEditDomain`, `canReassign` | `Promise.all`: `getAdCreativesForCampaign(utm_campaign)` (when present) + `getAssignableUsers({ domain, roles: LEAD_ASSIGNABLE_ROLES })` (when `canReassign`) | `<LeadInfoCard>` (derives `assigneeName` from `lead.assignee`) |
| `LeadDealCardAsync` | `leadId` | `getLeadDeal(leadId)` | `<LeadDealCard>` in a `--space-6` top-margin wrapper; `null` when no deal — pair with `fallback={null}` |
| `LeadNotesSectionAsync` | `leadId` | `getLeadNotesFull(leadId)` | `<LeadNotesSection>` |
| `LeadActivitiesAsync` | `lead: Lead` | `getLeadActivitiesFull(lead.id)` **once** | `<LeadJourneyTimeline>` + `<LeadActivityLog>` (owns both sections' margins — never split into two boundaries) |
| `LeadWhatsAppCardAsync` | `leadId`, `leadPhone`, `leadName`, `callerProfile: { id, role }` | `getConversationByLeadId(leadId)` then serial `getMessages(conversation.id, { limit: 30 })` — the serial hop stays **inside** this boundary | `<LeadWhatsAppCard>` |
| `ServiceInterestCardAsync` | `lead: Pick<Lead, 'service_interests' \| 'city' \| 'domain'>` | `Promise.all`: `getCasesForLead(interests, city, domain)` + `getHooksForCategories(interests, domain)` (hooks skipped when interests empty — city-only matches show cases, no hooks) | `<ServiceInterestCard>` (Call Intelligence Surface A: "Why we're perfect." + library `SearchBar` + `CaseCard`s + `HookList` + quiet `/helpdesk?category=` footer link). **Always renders** (2026-06-12 — both hide-gates removed): empty interests/matches get the search-first view; page fallback is `DossierCardSkeleton` |

---

### LeadTasksCardSkeleton

`LeadTasksCardSkeleton.tsx` — server-component-safe skeleton

Two rows at `TaskCompletionCircle` height. Widths: 80% / 60%.
Used as `fallback` for the `<Suspense>` wrapping `<LeadTasksAsync>` on the dossier page.

---

### LeadDossierSkeletons

`LeadDossierSkeletons.tsx` — exports `DossierCardSkeleton({ headerWidth?, rows? })`,
server-component-safe. The generic dossier paper-card fallback (subtle header strip + shimmer
rows, same chrome as `LeadTasksCardSkeleton`) composed from `Shimmer`/`skeletonStagger`
(`ui/PageSkeletons`). Used by every dossier `<Suspense>` fallback and `leads/[id]/loading.tsx` —
never hand-roll a new dossier card skeleton.

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

Composes `src/components/ui/modal.tsx`. Fields compose `src/components/ui/TaskFormFields.tsx` (dry-audit H-3). Four fields only:

1. Task type — `TaskTypeField` (RadioGroup-style list over `TASK_TYPES` / `TASK_TYPE_LABELS`)
2. Priority — `PriorityChipRow` (Urgent / High / Normal), default Normal
3. Due date & time — `DueDateField` (no presets) wrapping `DatePicker` with `showTime`
4. Notes (description) — optional `<textarea>` max 1000 chars; inline `FieldError` on failure

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
| LeadInfoCard          | none — props only (`adCreatives` + `agents` resolved by `LeadInfoCardAsync`)                         |
| LeadInfoCardAsync     | `getAdCreativesForCampaign` (`ad-creatives-service.ts`) + `getAssignableUsers` (`profiles-service.ts`) — server only |
| LeadDealCard          | none — props only (`Deal` resolved by `LeadDealCardAsync` via `deals-service.ts`)                    |
| LeadDealCardAsync     | `getLeadDeal` from `deals-service.ts` (server only)                                                  |
| LeadNotesSectionAsync | `getLeadNotesFull` from `leads-service.ts` (server only)                                             |
| LeadActivitiesAsync   | `getLeadActivitiesFull` from `leads-service.ts` (server only)                                        |
| LeadWhatsAppCardAsync | `getConversationByLeadId` + `getMessages` from `whatsapp-service.ts` (server only)                   |
| ServiceInterestCardAsync | `getCasesForLead` + `getHooksForCategories` from `intelligence-service.ts` (server only)          |
| ServiceInterestCard   | `'use client'` — `getHelpdeskLibraryAction(lead.domain)` (lazy, once, on first search keystroke) + `caseMatchesQuery` from `lib/utils/case-search.ts`; composes `components/intelligence/` CaseCard + HookList + `ui/SearchBar` |
| LeadDossierSkeletons  | none                                                                                                  |
| AddLeadModal          | `createManualLead` action, `getAssignableUsersAction` (`lib/actions/profiles.ts`)                                              |
| BulkEditLeadsModal    | `bulkUpdateLeads` action, `getAssignableUsersAction` (`lib/actions/profiles.ts`)                                               |
| LeadColumnPicker      | none — props only                                                                                    |
| CampaignVideoModal    | none — props only                                                                                    |
| LeadTasksCard         | `TaskCompletionCircle` + `useTaskCompletionToggle`; `createLeadTaskAction` via `CreateLeadTaskModal` |
| LeadTasksAsync        | `getAllLeadTasks` from `tasks-service.ts` (server only)                                              |
| LeadTasksCardSkeleton | none                                                                                                 |
| CreateLeadTaskModal   | `createLeadTaskAction` from `lib/actions/leads.ts`                                                   |
| ReviveLeadButton      | `reviveLeadAction` + `dismissRevivalCandidateAction` from `lib/actions/revival.ts`                   |
| RevivalReviewBanner   | none — props only (`rows` resolved by `LeadsTableAsync`); composes `ReviveLeadButton`                |
| RevivalDossierAction  | `getOpenCandidateForLead` from `revival-service.ts` (server only); composes `ReviveLeadButton`       |
