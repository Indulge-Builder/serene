# Lead Dossier — Page Spec

> **Purpose:** spec for `/leads/[id]` — the per-lead workspace: lifecycle actions, call/team notes, inline field edits, Gia tasks, WhatsApp card, journey timeline, activity log, linked deal.
> **Audience:** engineers. · **Source-of-truth scope:** the dossier route and its async children. List page + actions tables + invariants: `leads.md`; lifecycle/status semantics: `../modules/gia.md`.
> **Last verified:** 2026-06-24 (streaming rewrite of perf-audit item B reflected; stale scratchpad rows corrected — the scratchpad was removed in migration 0061; the two post-2026-06-11 dossier surfaces folded in — `ServiceInterestCardAsync` (Call Intelligence, 2026-06-12) and `RevivalDossierAction` (Lead Revival R1, migration 0119); `city` corrected to a dedicated `leads.city` column).

## 1. Purpose

The single place an agent works a lead. Slug-first lookup (`priya-sharma-9182`; UUID fallback
for legacy links), wave-1 blocking fetch for header + status panel only, everything else
streamed behind per-section `<Suspense>` boundaries. Won-deal capture writes `public.deals`
via `recordDeal`; the linked deal renders in `LeadDealCard`.

## 2. Who sees it

Same row-access as the list (agent: own; manager: domain; admin/founder: all) — no access →
`redirect('/leads')`. Per-capability matrix (who can edit fields, reassign, record deals):
Deep dive §7g.

## 3. Data sources

Wave 1: `getCurrentProfile()` + `getLeadBySlug(id)` → `getLeadById(id)` fallback
(Redis 120s, dual-key — `../architecture/caching.md`). Streamed children fetch by `lead.id`
(UUID, **never the URL param**): `getAdCreativesForCampaign`, `getAssignableUsers`,
`getLeadDeal`, `getLeadNotesFull`, `getLeadActivitiesFull`, `getConversationByLeadId`,
`getAllLeadTasks`, `getOpenCandidateForLead` (Lead Revival — `revival-service.ts`),
`getCasesForLead` + `getHooksForCategories` (Call Intelligence — `intelligence-service.ts`).
Mutations: the `leads.ts` actions table in `leads.md` §5 (Deep dive); Lead Revival mutations
(`reviveLeadAction` / `dismissRevivalCandidateAction`) are in `revival.ts` (`../modules/revival.md`).

## 4. Components

All in `src/components/leads/`: `StatusActionPanel` (lifecycle CTAs + `CalledModal` /
`WonDealModal` / resolution confirms), `RevivalDossierAction` (Lead Revival R1 — surfaces an
open `revival_candidate` + `ReviveLeadButton`; renders `null` otherwise),
`LeadInfoCardAsync`→`LeadInfoCard` (inline per-field edits via `InlineSelectField`/`InfoRow` —
incl. `InterestsInlineField` for `service_interests`), `PersonalDetailsCard`, `DynamicFormResponses`,
`ServiceInterestCardAsync`→`ServiceInterestCard` (Call Intelligence Surface A — top of the right
column, always mounted), `LeadNotesInput` + `LeadNotesSectionAsync`, `LeadActivitiesAsync`
(journey timeline + activity log), `LeadDealCardAsync`→`LeadDealCard`,
`LeadWhatsAppCardAsync`→`LeadWhatsAppCard`, `LeadTasksCard` (+ on-intent `CreateLeadTaskModal`),
`LeadDossierSkeletons`.

## 5. States

- **Loading:** `leads/[id]/loading.tsx` dossier-shaped navigation skeleton; per-section `DossierCardSkeleton` fallbacks while streaming.
- **Empty:** per-card `<EmptyState>` inline variants (no notes yet, no tasks, no conversation).
- **Error:** no access/not found → `redirect('/leads')`; action errors return `{ error }` → inline message bars (fields never cleared).

## 6. Invariants

The leads-module invariant list (incl. dossier items: fetch-by-UUID-not-param, slug
immutability, dual-key cache deletes, streaming boundaries) lives in `leads.md` § Deep dive
§10 — one list, one home.

## 7. Open items

None recorded beyond the list-page items in `leads.md` §7.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document.

### 7. The Lead Dossier Page (`/leads/[id]`)

#### 7a. Page Component

**Lookup:** `getLeadBySlug(id)` then `getLeadById(id)` if null. No access → `redirect('/leads')`.

**Streaming shape (perf audit 2026-06-11 item B):** the page blocks only on wave 1 —
`Promise.all(getCurrentProfile(), lead slug→UUID lookup)`. The header, `StatusActionPanel`,
`PersonalDetailsCard`, `DynamicFormResponses`, and `LeadNotesInput` render from wave 1 alone.
Everything else is a self-fetching async server component behind its own `<Suspense>` boundary
(all in `src/components/leads/`). Every fetch keys on `lead.id` (UUID) — never the URL param,
which may be a slug. `leads/[id]/loading.tsx` provides the dossier-shaped navigation skeleton.

| Async child | Fetch | Fallback |
| ----------- | ----- | -------- |
| `LeadInfoCardAsync` | `Promise.all`: `getAdCreativesForCampaign(utm_campaign)` (skipped if no campaign) + `getAssignableUsers({ domain: lead.domain, roles: LEAD_ASSIGNABLE_ROLES })` (only if `canReassign`; agents **and** managers — managers carry leads) | `DossierCardSkeleton` |
| `LeadDealCardAsync` | `getLeadDeal(lead.id)` — non-null only for won leads with a linked `public.deals` row; RLS-scoped (null if caller can't see the deal) | `null` — most leads have no deal; a skeleton would flash + shift layout |
| `RevivalDossierAction` | `getOpenCandidateForLead(lead.id)` — non-null only when the lead holds an OPEN `revival_candidate` (Lead Revival R1); renders `null` otherwise. Mounted directly under `StatusActionPanel`, above the deal card | `null` — most leads have no open candidate; a skeleton would flash for nothing |
| `ServiceInterestCardAsync` | `Promise.all`: `getCasesForLead(service_interests, city, domain)` + `getHooksForCategories(service_interests, domain)` (hooks skipped when `service_interests` empty — a city-only tag match shows cases, no hooks). Call Intelligence Surface A; **top of the right column, always mounted** | `DossierCardSkeleton` (`headerWidth=150`, `rows=2`) |
| `LeadTasksAsync` | `getAllLeadTasks(lead.id)` | `LeadTasksCardSkeleton` |
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

**Layout:** `StatusActionPanel` → `RevivalDossierAction` (`Suspense fallback={null}`; renders only when an open `revival_candidate` exists) → `LeadDealCardAsync` (renders only when the lead has a deal; full-width, Framer fade-in, links to `/deals`) → 2-col grid (**left:** LeadInfoCardAsync, Form data, PersonalDetails | **right:** ServiceInterestCardAsync, LeadTasksAsync, LeadNotesInput, LeadWhatsAppCardAsync) → Notes → Journey → Activity log.

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

**Read-only:** Full Name, Phone, Call count, Received, Last modified — not inline-edited (name/phone are not mutable in UI).

**Inline-editable (`canEdit`):** Email → `updateLeadEmail`; Source (`source`) → `updateLeadSource` via inline select pattern; Interests → `updateLeadInterests` via `InterestsInlineField` (FormChip multi-select in the `LeadFieldShell` chrome, explicit Save/Cancel; options from the lead's domain vocabulary, server re-drops unknowns; activity logs old → new; `onSaved` → `router.refresh()` so `ServiceInterestCard` re-renders with new matches).

**Domain (`canEditDomain`):** `updateLeadDomain` — `GIA_DOMAIN_FILTER_ITEMS`; agents cannot.

**Assignee (`canReassign`):** `assignLead` via the same inline `InlineSelectField` menu as domain/source (searchable agent list — no separate combobox component); optimistic name + 2s checkmark.

**Attribution (no separate `AttributionStrip` component):** Source and Campaign live in the contact grid. Campaign uses `CampaignLinkTrigger` when `adCreatives.length > 0` — hover `var(--theme-accent)`, opens modal.

**CampaignVideoModal trigger:** `adCreatives.length > 0 && lead.utm_campaign` — modal receives full `adCreatives[]` (multi-video per migration 0058).

#### 7d. PersonalDetailsCard

**Fields:** `company`, `occupation`, `interests`, `notes` (wide textarea) — the four `leads.personal_details` JSONB keys (`JSONB_FIELD_KEYS` in the component) — **plus `city`**.

**`city` is a dedicated `leads.city` column (migration 0066), NOT a JSONB key.** It carries its own component state (`cityValue` / `savedCity`) and is saved through a **separate** action. `PERSONAL_DETAIL_FIELDS` / `JSONB_GRID_FIELDS` explicitly omit `city` — the file comments "city is intentionally absent (it lives in `leads.city`)".

**Edit mode:** Click dormant card → form with Save/Cancel footer.

**Storage:** the JSONB keys → `leads.personal_details` via `updatePersonalDetails`; `city` → `leads.city` via `updateLeadCity`. Save runs **both actions in parallel** (`Promise.all`) inside one `startTransition`; either `error` aborts the save and surfaces inline (fields never cleared).

#### 7f. CalledModal

**Required:** call outcome (`CALL_OUTCOMES`) + note content (`AddCallNoteSchema`).

**`call_count`:** RPC increments `call_count` by 1 on `leads`.

**Activities:** `call_logged` `{ outcome, call_count }`; `note_added` `{ call_outcome }`; if status was `new`, also `status_changed` `{ old_status: 'new', new_status: 'touched' }`.

**Voice dictation (2026-06-12):** the Note field carries the same mic cluster as `LeadNotesInput` — `useAudioRecorder` + `transcribeAudioAction`, transcript appended to the textarea as an editable draft, saved through the unchanged `addLeadCallNote` path. Both footer buttons are disabled while recording/transcribing. Closing the modal mid-recording unmounts the component and the hook's unmount cleanup discards the take and releases the mic.

**Status:** Auto `new` → `touched` when first call on `new` lead (in RPC). The optimistic pill update for this transition is handled entirely by `StatusActionPanel` before the modal opens — `CalledModal` has no `initialStatus` or status-callback props.

#### 7g. LeadNotesInput vs LeadNotesSection

**LeadNotesInput:** Plain team note → `addLeadNote` → RPC `add_lead_plain_note`; `call_outcome` null; does not increment `call_count`. Submit button or ⌘+Enter. Header uses `var(--color-info-dark-*)` tokens.

**Voice dictation (2026-06-12):** a mic button in the composer footer records via `useAudioRecorder` (`src/hooks/useAudioRecorder.ts` — MediaRecorder codec negotiation, 2-minute auto-stop, mic-track release) and transcribes server-side via `transcribeAudioAction` (`lib/actions/transcription.ts` → `transcription-service.ts`, Deepgram Nova-2 `hi-Latn` for Hinglish). The transcript is **appended to the textarea as an editable draft** — never auto-submitted; the save is the same `addLeadNote` path as a typed note (sanitisation, activity log, cache invalidation identical). Audio is transcribed in-memory and discarded — never stored (D-01 carve-out, Decision Log 2026-06-12). The mic renders only when `MediaRecorder` is supported; the recording's actual MIME type travels with the blob (Safari mp4/aac, Chrome webm/opus).

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

**Fetch:** `getAllLeadTasks(leadId)` in `tasks-service.ts` — a lead's tasks are detected via the `task_gia_meta` link (inner join `task_gia_meta`, **not** a category check), sort active before terminal in JS. (`task_gia_meta` is the task→lead link; its presence IFF the task is a lead follow-up — `module = 'gia'` — so the inner join is what scopes the card to this lead.)

**Task types (CreateLeadTaskModal / `TASK_TYPE_LABELS`):** `call` → "Call", `whatsapp_message` → "WhatsApp", `other` → "Other".

**Action:** `createLeadTaskAction` → RPC `create_lead_gia_task` — atomically writes a **personal** task (`task_category = 'personal'`, `module = 'gia'`) **plus** its `task_gia_meta` row (the task→lead link) together; `create_lead_gia_task` is the sole writer of both. The card's behaviour is otherwise unchanged: it shows only this lead's tasks and creates tasks for this lead. The card title may still read "Gia Tasks" in the UI — the underlying model is a personal task + meta row, not a former `'gia_followup'` category. `revalidatePath(/leads/${slug ?? id})`; optional `scheduleTaskReminder`.

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

