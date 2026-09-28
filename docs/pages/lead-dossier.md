# Lead Dossier — Page Spec

> **Purpose:** spec for `/leads/[id]`, the per-lead workspace: lifecycle actions, call and team notes, inline field edits, lead tasks, the WhatsApp card, the journey timeline, the activity log, the linked deal, Shop app product enquiries, and the Call Intelligence card.
> **Audience:** engineers.
> **Source-of-truth scope:** the dossier route and its async children. List page, actions tables and invariants: `leads.md`; lifecycle and status semantics: `../modules/gia.md`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/leads/[id]/page.tsx`, `src/components/leads/*` (the dossier cards, `CalledModal`, `LeadNotesInput`, `ProductEnquiryCard*`), `src/lib/services/{tasks-service,gia-task-links,lead-enquiries-service}.ts` and the changelog through 2026-09-26.

## 1. Purpose

The single place an agent works a lead. Slug-first lookup (`priya-sharma-9182`; UUID fallback
for legacy links), a wave-1 blocking fetch for the header and status panel only, everything else
streamed behind per-section `<Suspense>` boundaries. Won-deal capture writes `gia.deals` through
`recordDeal`; the linked deal renders in `LeadDealCard`. A lead from the Shop app shows its
product enquiries (`ProductEnquiryCard`, 2026-08-31).

## 2. Who sees it

Same row access as the list (agent: own; manager: domain; admin/founder: all). No access →
`redirect('/leads')`; a slug or id that matches no lead → `notFound()`, which renders the
in-shell 404 page (2026-09-25). The Back button returns to `?from=` when it starts with `/leads`
(so a filtered list comes back where it was), else to `/leads`. The performance drills link with
`?from=/performance`, which this button ignores (the browser's back still works).
Per-capability matrix (who can edit fields, reassign, record deals): Deep dive §7a.

## 3. Data sources

Wave 1: `getCurrentProfile()` + `getLeadBySlug(id)` → `getLeadById(id)` fallback
(Redis 120 s, dual-key, `../architecture/caching.md`). Streamed children fetch by `lead.id`
(UUID, **never the URL param**): `getAdCreativesForCampaign`, `getAssignableUsers`,
`getLeadDeal`, `getLeadProductEnquiries` (`lead-enquiries-service.ts`), `getLeadNotesFull`,
`getLeadActivitiesFull`, `getConversationByLeadId`, `getAllLeadTasks` (task ids from
`getTaskIdsForLead` in `gia-task-links.ts`, then the rows; `public.tasks` cannot embed the
`gia` link table), `getOpenCandidateForLead` (Lead Revival, `revival-service.ts`),
`getCasesForLead` + `getHooksForCategories` (Call Intelligence, `intelligence-service.ts`).
All lead tables are in the `gia` schema and read through `giaDb(client)`.
Mutations: the `leads.ts` actions table in `leads.md` (Deep dive §5); Lead Revival's
`reviveLeadAction` / `dismissRevivalCandidateAction` are in `lib/actions/revival.ts`
(`../modules/revival.md`).

## 4. Components

All in `src/components/leads/`: `StatusActionPanel` (lifecycle CTAs + `CalledModal` /
`WonDealModal` / resolution confirms), `RevivalDossierAction` (Lead Revival R1: surfaces an
open `revival_candidate` + `ReviveLeadButton`; renders `null` otherwise),
`ProductEnquiryCardAsync`→`ProductEnquiryCard` (Shop app enquiries; renders `null` for every
other lead), `CardHeader` (THE card header strip every dossier card composes),
`LeadInfoCardAsync`→`LeadInfoCard` (inline per-field edits via `InlineSelectField`/`InfoRow` —
incl. `InterestsInlineField` for `service_interests`), `PersonalDetailsCard`, `DynamicFormResponses`,
`ServiceInterestCardAsync`→`ServiceInterestCard` (Call Intelligence Surface A — top of the right
column, always mounted), `LeadNotesInput` + `LeadNotesSectionAsync`, `LeadActivitiesAsync`
(journey timeline + activity log), `LeadDealCardAsync`→`LeadDealCard`,
`LeadWhatsAppCardAsync`→`LeadWhatsAppCard`, `LeadTasksCard` (+ on-intent `CreateLeadTaskModal`),
`LeadDossierSkeletons`.

## 5. States

- **Loading:** `leads/[id]/loading.tsx` dossier-shaped navigation skeleton; per-section `DossierCardSkeleton` fallbacks while streaming.
- **Empty:** per-card `<EmptyState>` inline variants (the one anatomy since 2026-09-25: "No tasks yet.", "No activity yet.", no conversation, no notes).
- **Error:** no access → `redirect('/leads')`; unknown lead → the in-shell 404; action errors return `{ error }` → inline message bars (fields never cleared).

## 6. Invariants

The leads-module invariant list (incl. dossier items: fetch-by-UUID-not-param, slug
immutability, dual-key cache deletes, streaming boundaries) lives in `leads.md` § Deep dive
§10 — one list, one home.

## 7. Open items

- The Call Intelligence card's library is seeded only for onboarding; on house, shop and legacy
  leads it often shows the search-first view (`../modules/call-intelligence.md`).
- Otherwise the list-page items in `leads.md` §7.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document.

### 7. The Lead Dossier Page (`/leads/[id]`)

#### 7a. Page Component

**Lookup:** `getLeadBySlug(id)` then `getLeadById(id)` if null. No lead → `notFound()`; no access → `redirect('/leads')`.

**Streaming shape (perf audit 2026-06-11 item B):** the page blocks only on wave 1 —
`Promise.all(getCurrentProfile(), lead slug→UUID lookup)`. The header, `StatusActionPanel`,
`PersonalDetailsCard`, `DynamicFormResponses`, and `LeadNotesInput` render from wave 1 alone.
Everything else is a self-fetching async server component behind its own `<Suspense>` boundary
(all in `src/components/leads/`). Every fetch keys on `lead.id` (UUID) — never the URL param,
which may be a slug. `leads/[id]/loading.tsx` provides the dossier-shaped navigation skeleton.

| Async child | Fetch | Fallback |
| ----------- | ----- | -------- |
| `LeadInfoCardAsync` | `Promise.all`: `getAdCreativesForCampaign(utm_campaign)` (skipped if no campaign) + `getAssignableUsers({ domain: lead.domain, roles: LEAD_ASSIGNABLE_ROLES })` (only if `canReassign`; agents **and** managers — managers carry leads) | `DossierCardSkeleton` |
| `LeadDealCardAsync` | `getLeadDeal(lead.id)`: non-null only for won leads with a linked `gia.deals` row; RLS-scoped (null if caller can't see the deal) | `null`: most leads have no deal, and a skeleton would flash and shift the layout |
| `ProductEnquiryCardAsync` | `getLeadProductEnquiries(lead.id)` (session client; RLS scopes to whoever can see the lead), the only dossier call site. Renders `null` when there are none, which is every non-Shop-app lead | `null`, the same reasoning as the deal card |
| `RevivalDossierAction` | `getOpenCandidateForLead(lead.id)` — non-null only when the lead holds an OPEN `revival_candidate` (Lead Revival R1); renders `null` otherwise. Mounted directly under `StatusActionPanel`, above the deal card | `null` — most leads have no open candidate; a skeleton would flash for nothing |
| `ServiceInterestCardAsync` | `Promise.all`: `getCasesForLead(service_interests, city, domain)` + `getHooksForCategories(service_interests, domain)` (hooks skipped when `service_interests` empty — a city-only tag match shows cases, no hooks). Call Intelligence Surface A; **top of the right column, always mounted** | `DossierCardSkeleton` (`headerWidth=150`, `rows=2`) |
| `LeadTasksAsync` | `getAllLeadTasks(lead.id)`: `getTaskIdsForLead` (gia) then `tasks .in('id', ids)` (public), active before terminal | `LeadTasksCardSkeleton` |
| `LeadWhatsAppCardAsync` | `getConversationByLeadId(lead.id)` then (serial, **inside the boundary** — never a page-level wave) `getMessages(conversation.id, { limit: 30 })` | `DossierCardSkeleton` |
| `LeadNotesSectionAsync` | `getLeadNotesFull(lead.id)` | `DossierCardSkeleton` |
| `LeadActivitiesAsync` | `getLeadActivitiesFull(lead.id)` — one fetch renders both `LeadJourneyTimeline` and `LeadActivityLog` (never split: same data) | two `DossierCardSkeleton`s |

**Access gates (page-level, mirrors actions):**

| Capability | Agent | Manager | Admin | Founder |
| ---------- | ----- | ------- | ----- | ------- |
| View dossier | Own assigned only | Same `domain` | All | All |
| `canEditLeadFields` (email, source, assignee UI) | Own | Domain | ✓ | ✓ |
| `canEditDomain` | ✗ | ✓ | ✓ | ✓ |
| `canReassign` | ✗ | ✓ | ✓ | ✓ |
| `canEditPersonalDetails` / `canAdd` notes | Own | Domain | ✓ | ✓ |

Agent = own leads; manager = domain; admin/founder = all. *(Corrected 2026-06-11: a
`canEditScratchpad` row and a reference to the deleted `gia-workflow.md` doc were removed —
the private scratchpad was dropped in migration 0061.)*

**Layout:** header (`BackButton` + name with the page-title dot + mono phone) → `StatusActionPanel` → `RevivalDossierAction` (`Suspense fallback={null}`; renders only when an open `revival_candidate` exists) → `LeadDealCardAsync` (renders only when the lead has a deal; full-width, Framer fade-in, links to `/deals`) → `ProductEnquiryCardAsync` (only for Shop app leads) → 2-col grid (`.serene-dossier-grid`, one column below lg) (**left:** LeadInfoCardAsync, Form data, PersonalDetails | **right:** ServiceInterestCardAsync, LeadTasksAsync, LeadNotesInput, LeadWhatsAppCardAsync) → Notes → Journey → Activity log.

The dossier `<main>` is full-width: plain `flex-1 p-4 sm:p-6 lg:p-8`, like sibling detail pages.
The old `maxWidth: 1280px` inline cap was dropped 2026-07-02 from both `page.tsx` and
`loading.tsx`.

**Tasks:** `<Suspense fallback={<LeadTasksCardSkeleton />}><LeadTasksAsync leadId={lead.id} /></Suspense>`.

#### 7b. StatusActionPanel

Returns `null` if caller cannot act (same as edit gate for actions).

| Current status | Actions shown |
| -------------- | ------------- |
| `new` | Status pill; **Called** |
| `touched` | Pill; **Level Up** → `in_discussion`; **Junk** (reason modal); **Called** |
| `in_discussion` | Pill; **Won** (`WonDealModal` → `recordDeal`); **Nurture**; **Lost** (reason); **Called** |
| `nurturing` | Pill; **Called** only |
| `won` / `lost` | Pill only; **Called** disabled (`isTerminal`) |
| `junk` | Pill; **Revive Lead** → `in_discussion`; **Called** disabled |

Terminal = `won` \| `lost` \| `junk` for Called disable only.

**Optimistic status (`useOptimistic`):** The status pill and all button conditionals read from `optimisticStatus` (`useOptimistic(lead.status)`), not `lead.status` directly. Every status-changing path calls `setOptimisticStatus(newStatus)` inside `startTransition` before the action fires, then `throw new Error(result.error)` on failure — the throw is what signals React to revert `optimisticStatus` back to `lead.status` (actions return `{ data, error }` and never throw natively). `isPending` from `useTransition` is the disabled/loading signal for all buttons — no separate `isLoading` state.

**Called button — `new → touched` optimistic advance:** The Called `onClick` checks `lead.status === 'new'` (server truth, not `optimisticStatus`) and if true fires its own `startTransition(() => setOptimisticStatus('touched'))` before opening `CalledModal`. The parent owns this decision; `CalledModal` has no `initialStatus` or callback props. The `add_lead_call_note` RPC always auto-advances `new → touched` — that invariant is what makes the pre-emptive set safe. Using `lead.status` (not `optimisticStatus`) for the guard prevents a double-advance race on mid-transition re-renders.

#### 7c. LeadInfoCard

**Read-only:** Full Name, Phone, City (edited in `PersonalDetailsCard`), Call count, Received, Last modified. Name and phone are not editable in the UI. The card composes `CardHeader` and `InfoRow`; an editable value uses `ui/InlineEdit` (`EditableValueText` + `FieldSaveFeedback`: the dashed underline, the saving mandala, a check after).

**Inline-editable (`canEdit`):** Email → `updateLeadEmail`; Source (`source`) → `updateLeadSource` via inline select pattern; Interests → `updateLeadInterests` via `InterestsInlineField` (FormChip multi-select in the `LeadFieldShell` chrome, explicit Save/Cancel; options from the lead's domain vocabulary, server re-drops unknowns; activity logs old → new; `onSaved` → `router.refresh()` so `ServiceInterestCard` re-renders with new matches).

**Domain (`canEditDomain`):** `updateLeadDomain` — `GIA_DOMAIN_FILTER_ITEMS`; agents cannot.

**Assignee (`canReassign`):** `assignLead` via the same inline `InlineSelectField` menu as domain/source (searchable agent list — no separate combobox component); optimistic name + 2s checkmark.

**Attribution (no separate `AttributionStrip` component):** Source and Campaign live in the contact grid. Campaign uses `CampaignLinkTrigger` when `adCreatives.length > 0` — hover `var(--theme-accent)`, opens modal.

**CampaignVideoModal trigger:** `adCreatives.length > 0 && lead.utm_campaign` — modal receives full `adCreatives[]` (multi-video per migration 0058).

#### 7d. PersonalDetailsCard

**Fields:** `company`, `occupation`, `interests`, `notes` (wide textarea) — the four `leads.personal_details` JSONB keys (`JSONB_FIELD_KEYS` in the component) — **plus `city`**.

**`city` is a dedicated `leads.city` column (migration 0066), NOT a JSONB key.** It carries its own component state (`cityValue` / `savedCity`) and is saved through a **separate** action. `PERSONAL_DETAIL_FIELDS` / `JSONB_GRID_FIELDS` explicitly omit `city` — the file comments "city is intentionally absent (it lives in `leads.city`)".

**Edit mode:** Click the dormant card → a form with a Save/Cancel footer; the card lifts while editing (no accent border since 2026-09-25). The fields sit in `.serene-form-row` rows, stacked on a phone.

**Storage:** the JSONB keys → `leads.personal_details` via `updatePersonalDetails`; `city` → `leads.city` via `updateLeadCity`. Save runs **both actions in parallel** (`Promise.all`) inside one `startTransition`; either `error` aborts the save and surfaces inline (fields never cleared).

#### 7f. CalledModal

**Required:** call outcome (`CALL_OUTCOMES`, a `FilterDropdown` whose menu is portaled) + note content (`AddCallNoteSchema`).

**Two ways to save:** **Log Update** (`addLeadCallNote` only) and **Log Update + Task**, which
logs the call and then creates a lead follow-up through `createLeadTaskAction` with the chosen
type (Call, WhatsApp, Other) and a required due date and time (`DatePicker` with time; the
assignee gets an in-app reminder at that moment). If the note saves but the task fails, the modal
says so and keeps the call. A whole-form error renders through the `Modal` `error` prop, above the
buttons (2026-09-26).

**`call_count`:** RPC increments `call_count` by 1 on `leads`.

**Activities:** `call_logged` `{ outcome, call_count }`; `note_added` `{ call_outcome }`; if status was `new`, also `status_changed` `{ old_status: 'new', new_status: 'touched' }`.

**Voice dictation (2026-06-12):** the Note field carries the shared `ui/DictationButton` (`variant="inline"`, the same cluster as `LeadNotesInput`; `useAudioRecorder` + `transcribeAudioAction` inside it), transcript appended to the textarea as an editable draft, saved through the unchanged `addLeadCallNote` path. Both footer buttons are disabled while recording/transcribing. Closing the modal mid-recording unmounts the component and the hook's unmount cleanup discards the take and releases the mic.

**Status:** Auto `new` → `touched` when first call on `new` lead (in RPC). The optimistic pill update for this transition is handled entirely by `StatusActionPanel` before the modal opens — `CalledModal` has no `initialStatus` or status-callback props.

#### 7g. LeadNotesInput vs LeadNotesSection

**LeadNotesInput:** Plain team note → `addLeadNote` → RPC `add_lead_plain_note`; `call_outcome` null; does not increment `call_count`. Submit button or ⌘+Enter. Header is the shared `CardHeader` ("Notes").

**Voice dictation (2026-06-12):** `ui/DictationButton` (`variant="inline"`) in the composer footer records via `useAudioRecorder` (`src/hooks/useAudioRecorder.ts` — MediaRecorder codec negotiation, 2-minute auto-stop, mic-track release) and transcribes server-side via `transcribeAudioAction` (`lib/actions/transcription.ts` → `transcription-service.ts`, Deepgram Nova-2 `hi-Latn` for Hinglish). The transcript is **appended to the textarea as an editable draft** — never auto-submitted; the save is the same `addLeadNote` path as a typed note (sanitisation, activity log, cache invalidation identical). Audio is transcribed in-memory and discarded — never stored (D-01 carve-out, Decision Log 2026-06-12). The mic renders only when `MediaRecorder` is supported; the recording's actual MIME type travels with the blob (Safari mp4/aac, Chrome webm/opus).

**LeadNotesSection:** Read-only timeline from props; author `note.author.full_name`; **call outcome badge** when `note.call_outcome` set (styled via `OUTCOME_BADGE` tokens e.g. `var(--color-warning-light)`). Chronological display from server order (newest first in service). **Timeline markup mirrors `LeadActivityLog`** (2026-06-15): each note is a `display: flex` row with a fixed 15px dot/connector column — `alignItems: center` centers the dot and the 1px rule, no absolute positioning or negative margins. Never reintroduce the absolute-dot scheme.

#### 7h. LeadJourneyTimeline

**Data:** `lead.created_at` for `new`; first `status_changed` activity per target status from `lead_activities`.

**Stages rendered:** `new`, `touched`, `in_discussion`, plus fourth slot = terminal status if `won`|`lost`|`junk`|`nurturing`, else placeholder `won`.

**Dwell:** Between stage timestamps; format `Xd` / `Xh` / `Xm`; active stage suffix `" here"`.

#### 7i. LeadActivityLog

**Data:** `activities` prop (`LeadActivityWithActor[]`).

**Actor:** `act.actor.full_name` when present.

**Filters out:** `note_added` rows (duplicate of `call_logged`).

**Labels:** e.g. `lead_created` → "Lead ingested"; `call_logged` → "Called — {outcome}"; `status_changed` → "Status: A → B"; `agent_assigned` → "Agent assigned".

#### 7j. LeadTasksAsync + LeadTasksCard + CreateLeadTaskModal

**Fetch:** `getAllLeadTasks(leadId)` in `tasks-service.ts`. A lead's tasks are found through the `gia.task_gia_meta` link, **not** a category check: `getTaskIdsForLead` (`gia-task-links.ts`) returns the lead's task ids, then `public.tasks` is read with `.in('id', ids)`, ordered by due date, active before terminal in JS. It used to be an inner-join embed; since the schema move (0210) PostgREST cannot embed across schemas, and for a day after 2026-09-17 this card came back empty until the 2026-09-18 fix.

**Task types (CreateLeadTaskModal / `TASK_TYPE_LABELS`):** `call` → "Call", `whatsapp_message` → "WhatsApp", `other` → "Other".

**Action:** `createLeadTaskAction` → RPC `create_lead_gia_task` — atomically writes a **personal** task (`task_category = 'personal'`, `module = 'gia'`) **plus** its `task_gia_meta` row (the task→lead link) together; `create_lead_gia_task` is the sole writer of both. The card's behaviour is otherwise unchanged: it shows only this lead's tasks and creates tasks for this lead. The card title may still read "Gia Tasks" in the UI; the underlying model is a personal task + meta row, not a former `'gia_followup'` category. `revalidatePath(/leads/${slug ?? id})` and `revalidatePath('/tasks')`; optional `scheduleTaskReminder`. Empty card: `<EmptyState title="No tasks yet.">`.

**Overdue due date colour:** `var(--color-danger)` when overdue; else `var(--theme-text-tertiary)`.

#### 7k. DynamicFormResponses

**Source:** `leads.form_data` JSONB from props.

**Render:** Key/value pairs when `form_data` has keys; omitted from tree when empty.

#### 7l. ServiceInterestCardAsync + ServiceInterestCard (Call Intelligence Surface A, 2026-06-12)

**Mount:** top of the dossier's right column, **always mounted** behind its own
`<Suspense fallback={<DossierCardSkeleton headerWidth={150} rows={2} />}>`. The card owns a
library search, so leads with no interests/matches get the search-first view rather than nothing —
both old hide-gates were removed. Self-fetching async server child (no page-level waterfall).

**Fetch (`ServiceInterestCardAsync`):** `Promise.all` of
`getCasesForLead(service_interests, lead.city, domain)` + `getHooksForCategories(service_interests, domain)`
from `intelligence-service.ts`. `getCasesForLead` returns `[]` itself when interests AND city are both
empty; hooks are scoped to the lead's stated interest categories, so an empty `service_interests`
short-circuits hooks to `[]` (a city-only tag match shows cases but no hooks — no category to scope to).
This is the **only** dossier call site for both functions. `lead.domain` is narrowed to `AppDomain` once
at this boundary.

**`service_interests`:** a `text[]` column (per-domain vocabulary via `DOMAIN_INTERESTS` /
`getDomainInterests`), **never an enum** — unknown values are dropped at ingestion
(`extractServiceInterests`), never rejected. Edited inline on `LeadInfoCard` via `InterestsInlineField`
(§7c); `onSaved` → `router.refresh()` re-renders this card with the new matches.

**`ServiceInterestCard` (display, `'use client'`):** "Why we're perfect." header + a library `SearchBar`
(lazy `getHelpdeskLibraryAction(lead.domain)` on the first keystroke; filtered client-side via
`caseMatchesQuery`) + matched `CaseCard`s + `HookList` + a quiet `/helpdesk?category=` footer link.
Composes the shared `components/intelligence/` primitives — never re-inlines a case/hook renderer.

**Card cap (2026-07-02):** the content region (cases/hooks/search results) is wrapped in a
`maxHeight: 300px` + `overflowY: auto` scroll body, capped like the sibling dossier cards
(WhatsApp message list 300px, tasks list 220px). The header, search bar, and footer link stay
pinned; only the cases/hooks scroll internally.

#### 7m. RevivalDossierAction (Lead Revival R1, migration 0119)

**Mount:** directly under `StatusActionPanel`, behind `<Suspense fallback={null}>` (most leads have no
open candidate — a skeleton would flash for nothing). Async server component; the **second** of
`ReviveLeadButton`'s two mount points (the first is `RevivalReviewBanner` on `?revival=true`).

**Fetch:** `getOpenCandidateForLead(leadId)` (`revival-service.ts`, admin client). Returns `null` →
the component renders `null` (no card). Non-null → a paper card with a `Sparkles` glyph, "Revival
suggested" eyebrow, the candidate's `ai_reasoning`, an optional suggested-revive date, and an inline
`<ReviveLeadButton showDismiss size="sm" />`.

**Action — task-only, NEVER changes the lead row:** the button calls `reviveLeadAction` → `reviveLeadCore`
(`lead-mutations.ts`), which wraps the E2 `createLeadTaskCore` path + a "Revived" marker and resolves the
`revival_candidate` (open → actioned). **It does NOT mutate `leads.status` or any lead column** — that is
the separate `StatusActionPanel` junk → "Revive Lead" button (§7b), which DOES set `in_discussion`. The
two share only the word "revive". `showDismiss` exposes `dismissRevivalCandidateAction` (open → dismissed).
Full contract: `../modules/revival.md`.

---

#### 7n. ProductEnquiryCardAsync + ProductEnquiryCard (Shop app channel, migration 0180)

**Mount:** under the deal card, above the two-column grid, behind `<Suspense fallback={null}>`.
Server component, display-only.

**Fetch:** `getLeadProductEnquiries(leadId)` (`lead-enquiries-service.ts`, session client; RLS
scopes the rows to whoever can see the lead). Returns `[]` for every lead that did not come
from the Shop app, and the card renders `null`: it is additive to the dossier, so it needs no
empty state.

**Shows:** one row per enquiry, newest first: thumbnail, product name, brand, price (or "price
on request"), sold-out flag, the enquiry-type pill (enquire / price request / source request),
the member's note when present, and links out to the listing and to the member's record in the
shop's own admin. Everything renders from the frozen snapshot in `gia.lead_product_enquiries`;
the card never re-fetches the shop's product URL (the shop hard-deletes listings, so a dead link
is expected and honest).

**Why the card exists:** one person can ask about several products. Phone dedup keeps one lead
per person; each product is an enquiry on that lead, so the agent sees every piece the member
asked about. Channel contract: `../integrations/lead-ingestion.md`; module note:
`../modules/gia.md` §4.
