# Tickets (Sia's own ticketing)

> **Purpose:** the as-built record of Serene's native ticketing for the concierge floor: the data model, the state machine, SLA policies, the sentinel, the intake sweep, the ticket drafter, the training loop, the vendor on a ticket, the board, notifications and who can see what.
> **Audience:** engineers, and anyone deciding what the ticket system should do next.
> **Source-of-truth scope:** how tickets work end to end. The screens are specified in `../pages/tickets.md`. The member twin, the profiler and the vault are in `members.md`; the vendor ranking and ledger in `vendors.md`; Elaya's tools in `elaya.md`; the WhatsApp archive and queendom scoping of Sia pages in `sia.md`. Code wins over this doc.
> **Last verified:** 2026-09-26 against `supabase/migrations/` 0195 to 0244, `src/lib/constants/tickets.ts` and `ticket-intake.ts`, `src/lib/services/ticket-*.ts`, `intake-*.ts`, `draft-reviews.ts`, `queendom-seats.ts`, `src/lib/actions/tickets.ts` and `ticket-settings.ts`, `src/trigger/ticket-sentinel.ts`, `ticket-intake.ts`, `intake-lessons.ts`, and `src/components/tickets/`.

---

## 1. What it is

A ticket is one member request that the concierge team works until it is done: book a table,
source a watch, arrange tickets for an event. Freshdesk is still the team's working tool; Serene's
tickets were built alongside it (founder, 2026-09-15) so the team can move over once the system
has proved itself. The Freshdesk data is mirrored separately (see `../integrations/freshdesk.md`).

The system has five moving parts:

1. **The ticket itself** (`sia.tickets`), written only through two database functions that save
   the change and its diary entry in one transaction.
2. **The sentinel**, one small watcher per ticket that checks deadlines, reads new notes and
   member messages, and suggests status moves for a human to approve.
3. **Intake**, a sweep that reads the member WhatsApp groups every minute and proposes tickets as
   cards. A human creates or dismisses every card.
4. **The drafter**, one model call that turns a stretch of member chat into a filled ticket form.
5. **The training loop**, which keeps every human verdict on a machine draft and turns them into
   written lessons that the founder approves before any prompt follows them.

The founder's rule over all of it: Serene does the work, a human makes the call. Nothing in this
module creates a ticket, moves a ticket or approves a lesson on its own, with one exception: the
sentinel closes a resolved ticket after 48 quiet hours.

**Where it stands (from the changelog, not the database).** Intake runs in production: in the
week to 2026-09-25 it read 4,090 chat bursts and proposed 824 cards, with 129 open. As of that
entry no card had been accepted or dismissed, so the training loop had no verdicts. The
2026-09-19 entry says no real ticket existed yet. TODO: verify current ticket and verdict counts.

---

## 2. The pieces at a glance

| Piece | Home | What it does |
| --- | --- | --- |
| Vocabulary and state machine | `src/lib/constants/tickets.ts` | Statuses, transitions, SLA-stopped set, priorities, categories, brief fields, checklists, origins, resolutions, event kinds, sentinel numbers, board and settings constants |
| Intake numbers | `src/lib/constants/ticket-intake.ts` | Every tuning number of intake, the training ledger and the lesson writer |
| Write cores | `src/lib/services/ticket-mutations.ts` | Create, move status, assign, priority, brief, checklist, note, links, money, tags, tasks, settings, SLA policies, the answer to a sentinel suggestion |
| Reads | `src/lib/services/tickets-service.ts` | The list, the board, the ticket page, the help window, settings, SLA policy resolution, Elaya's two readers |
| The sentinel | `src/lib/services/ticket-sentinel.ts` | The rule pass, the reading pass, the judgement, sleep, the sweep |
| Intake | `src/lib/services/ticket-intake.ts` | Bursts, cheap filters, the classifier, the card, health signals |
| The drafter | `src/lib/services/ticket-draft-core.ts` (+ `ticket-creator.ts`, the form's thin entry) | Chat to ticket draft, names masked |
| Intake reads | `src/lib/services/intake-service.ts` | Open cards, one card, resolve a card once, the training numbers, the verdict and lesson lists |
| Training ledger | `src/lib/services/draft-reviews.ts` + `src/lib/utils/draft-diff.ts` | One row per human verdict, and THE compare of draft against final |
| Lessons | `src/lib/services/intake-lessons.ts` | The lesson writer, approve / edit / discard, the prompt block, the scoreboard |
| Vendor on a ticket | `src/lib/services/ticket-vendor.ts` | Suggest, search, set, close the vendor's job, review |
| Seats | `src/lib/services/queendom-seats.ts` | Who holds which seat in a queendom, for jobs with no session |
| Actions | `src/lib/actions/tickets.ts`, `src/lib/actions/ticket-settings.ts` | Zod, auth, the queendom gate, then the core |
| Background jobs | `src/trigger/ticket-sentinel.ts`, `ticket-intake.ts`, `intake-lessons.ts` | The minute sentinel sweep, the minute intake sweep, the Monday lesson writer |
| Types | `src/lib/types/ticket.ts`, `src/lib/types/intake.ts` | Row and view shapes |
| Screens | `src/app/(dashboard)/tickets/`, `settings/tickets/`, `src/components/tickets/`, `src/components/settings/Ticket*Panel.tsx`, `IntakeLessonsPanel.tsx` | See `../pages/tickets.md` |

---

## 3. Data model

All ticket tables live in the `sia` schema except the task link. Migration 0202 (2026-09-17)
renamed every "client" word to "member": `client_id` became `member_id`, `awaiting_client` became
`awaiting_member`, `last_client_update_at` became `last_member_update_at`,
`client_silence_min` became `member_silence_min`, and the notification types became
`ticket_member_*`. The full schema narrative is in `../architecture/database.md`.

### 3.1 Tables

| Table | Migration | Kind | What it holds |
| --- | --- | --- | --- |
| `sia.tickets` | 0195, 0200 | current state | One row per ticket. `ticket_no` (T-000001, from `sia.ticket_no_seq`), `member_id`, `queendom_id` (copied from the member at creation), `origin` + `origin_ref`, `group_jid`, `category`, `sub_category`, `title`, `brief` (jsonb), `checklist` (jsonb), `priority` + `priority_approved_at/by`, `status`, `requested_for`, the SLA stamps (`first_response_due_at`, `next_update_due_at`, `resolve_due_at`, `first_responded_at`, `last_member_update_at`), `assignee_id`, `vendor_id`, `money` (jsonb), `summary`, `tags` (0200), `sentinel_state`, `next_wake_at`, `wake_reason`, `closed_at`, `resolution`, `created_by_kind`, `proposed_by_run_id`, `freshdesk_id`. On the Realtime publication since 0200 |
| `sia.ticket_events` | 0195 | append-only diary | Every change and note: `actor_kind` (human, sentinel, intake, elaya, system, member), `event_type`, `body`, `meta`, `run_id`. Partitioned by month (2026-09 to 2027-12 plus a default partition) |
| `sia.ticket_message_links` | 0195 | append-only | Which WhatsApp messages belong to a ticket, as soft triples (`chat_jid`, `wa_message_id`, `sender_jid`) plus `link_kind` (origin, update, member_reply, staff_reply, attachment). Can also point at a mirrored Freshdesk ticket (`freshdesk_id`) |
| `sia.ticket_sla_policies` | 0195 | config | The SLA rows (section 6) |
| `sia.ticket_settings` | 0200 | config | Key to jsonb: `status_labels` (renames) and `tags` (the vocabulary) |
| `sia.genie_roster` | 0195 | config | Shifts, capacity, specialities, languages, leave. **No code reads or writes it yet** (it was for the scored picker, not built) |
| `public.task_ticket_meta` | 0195 | link | `task_id` to `ticket_id`: a task spun off a ticket (the `task_gia_meta` pattern) |
| `sia.intake_proposals` | 0219 | cards | One card per burst (`UNIQUE (group_jid, first_message_at)`): `kind` (request, update), `status` (open, accepted, dismissed, expired), `confidence`, `tone`, `summary`, `draft`, `messages`, `ticket_id`, run ids, `dismiss_reason`, `fields_changed` |
| `sia.intake_group_state` | 0219 | bookmark | Per group: `last_message_at`, `bursts_done`, `fail_count`, `last_error` |
| `sia.draft_reviews` | 0239 | append-only ledger | One row per human verdict on a machine draft (section 11) |
| `sia.intake_lessons` | 0240 | versioned documents | The lessons (section 11). One approved and one draft per kind at a time; never deleted |

Model calls from this module write to `sia.extraction_runs` (the shared run ledger, owned by the
Sia and member docs), with `kind` = `intake`, `ticket_creator`, `sentinel` or `lesson_writer`.

**Columns and values kept but not written by any code path today:** `bishop_id` (the sentinel
honours it if set), `handoff_department`, `satisfaction`, `freshdesk_id`, `tier` on SLA policies
(always saved as null), the `proposed` status (no caller creates a proposed ticket), and the
origins `app`, `call`, `email` and `freshdesk_import` (the form writes `whatsapp_group` or
`manual`).

### 3.2 Functions

| Function | Migration | Who calls it | What it does |
| --- | --- | --- | --- |
| `sia.create_ticket(p_ticket, p_event)` | 0195, 0202 | `createTicketCore` | Inserts the ticket and its first event in one transaction |
| `sia.apply_ticket_change(p_ticket_id, p_patch, p_event)` | 0195, 0200, 0202 | every core and the sentinel | Updates the columns present in the patch (an empty string clears a nullable column) and inserts the event, in one transaction. 0200 taught it `tags` |
| `sia.wake_sentinel_on_event()` / `wake_sentinel_on_link()` | 0199 | triggers | Any event not written by the sentinel, and any new message link, sets `next_wake_at = now()` on a live ticket (the sentinel's mailbox) |
| `sia.claim_sentinel_wakes(p_limit, p_lease_min, p_ticket_id)` | 0199, 0203 | the sweep and `wakeTicketNow` | Claims due tickets with `FOR UPDATE SKIP LOCKED` and leases them; with `p_ticket_id` it claims that one ticket |
| `sia.sentinel_sleep(...)` | 0199 | the sentinel | Writes state and the next alarm with no event, so the diary holds only what happened |
| `sia.intake_due_groups(p_limit, p_statuses, p_since)` | 0219 | the intake sweep | Linked member groups of Active members with a message newer than their bookmark |
| `sia.intake_stats(p_since, p_exam)` | 0238 | `getIntakeStats` | The training numbers in one statement (section 10) |
| `sia.draft_review_scoreboard(p_since)` | 0240 | `getDraftReviewScoreboard` | Verdicts by source and prompt version |
| `public.can_access_member_queendom(uuid)` | 0202, 0244 | every ticket and card RLS policy | The queendom gate (section 16) |

Every callable function here except the gate is service-role only (Q-13 revoked tier): the caller gates.

### 3.3 The write law

- Every change to a ticket goes through `create_ticket` or `apply_ticket_change` on the admin
  client, so the row and its diary entry can never disagree. There are no user write policies on
  any ticket table (the deals posture).
- A note or a message link is not a ticket change: the cores insert it into `ticket_events` or
  `ticket_message_links` directly with the service role.
- The state machine is enforced in exactly one place, `moveTicketStatusCore`. The status CHECK in
  the database only lists the allowed values.
- The sentinel never updates `sia.tickets` directly; it uses `apply_ticket_change` for anything
  with an event and `sentinel_sleep` for bookkeeping.

---

## 4. Vocabulary and the state machine

All lists live in `src/lib/constants/tickets.ts`; the SQL CHECKs mirror them.

### 4.1 Statuses

The ten statuses keep every Freshdesk meaning, named for who is waiting on whom, plus `proposed`.

| Status | Label | SLA clock | Allowed next |
| --- | --- | --- | --- |
| `proposed` | Proposed | stopped | open, dropped |
| `open` | Open | running | sourcing, awaiting_member, awaiting_vendor, in_delivery, resolved, dropped |
| `sourcing` | Sourcing | running | open, awaiting_member, awaiting_vendor, in_delivery, payment_due, resolved, dropped |
| `awaiting_member` | Awaiting member | stopped | sourcing, awaiting_vendor, in_delivery, resolved, dropped |
| `awaiting_vendor` | Awaiting vendor | running | sourcing, awaiting_member, in_delivery, payment_due, resolved, dropped |
| `in_delivery` | In delivery | stopped | sourcing, payment_due, resolved, dropped |
| `payment_due` | Payment due | stopped | in_delivery, resolved, dropped |
| `resolved` | Resolved | stopped | closed, open |
| `closed` | Closed | stopped | open |
| `dropped` | Dropped | stopped | open |

- **Live work** (`TICKET_ACTIVE_STATUSES`): open, sourcing, awaiting_member, awaiting_vendor,
  in_delivery, payment_due. **Terminal**: resolved, closed, dropped.
- **SLA-stopped** (`TICKET_SLA_STOPPED_STATUSES`) copies Freshdesk's own `stop_sla_timer` flags.
- **A vendor stage needs a vendor** (founder, 2026-09-19): `awaiting_vendor` is refused by
  `moveTicketStatusCore` unless the ticket has a `vendor_id` (`TICKET_VENDOR_REQUIRED_STATUSES`).
- Moving to resolved, closed or dropped stamps `closed_at` and a `resolution` (default
  `delivered`, or `not_a_request` for dropped) and clears the update deadline. Moving out of a
  closed state clears both and writes a `reopened` event. `proposed` to `open` writes `approved`
  and starts the SLA stamps.
- The labels shown in the app can be renamed in settings (section 7). The machine never changes.
- `TICKET_APP_STAGE` maps each status to the member app's four stages, kept for a later
  integration. Nothing reads it yet.

### 4.2 The rest of the vocabulary

| List | Values |
| --- | --- |
| Priorities | low, medium, high, urgent (default medium) |
| Categories | travel, dining, retail, events, special_request, itinerary, recommendations, staff_hiring (the Freshdesk tree, read 2026-09-15; `FRESHDESK_CATEGORY_TO_TICKET` maps the Freshdesk labels) |
| Sub-categories | travel: flight, hotel_booking, car_transfer, experiences, airport_assistance, visa · dining: reservation, delivery, private_chef · retail: bag, watch, general, gifting · events: tickets, private_event · the other four have none |
| Brief fields | 21 typed fields (pax, date, time, date_to, from/to location, budget, product details, quantity, delivery address and contact, preferred vendor, event name, duration, luggage, airport, early check-in, assistance, gift specifications, notes). `TICKET_BRIEF_FIELDS_BY_CATEGORY` decides which a category shows |
| Checklists | One template per category (`TICKET_CHECKLIST_TEMPLATES`), copied onto the ticket at creation, from Freshdesk's internal task lists |
| Resolutions | delivered, cancelled_by_member, could_not_source, duplicate, not_a_request |
| Reassign reasons | shift_end, workload, speciality, leave, other |
| Event types | `TICKET_EVENT_TYPES` (no CHECK in SQL, so the sentinel can add kinds) |
| Money fields | quote_inr, cost_inr, price_inr, payment_status, invoice_no (INR only; Zoho stays the ledger) |

---

## 5. The write cores and the action gate

Every ticket action in `src/lib/actions/tickets.ts` runs: Zod (`parseActionInput`) →
`requireProfile()` → the ticket's (or member's) queendom checked with `canAccessMember` →
the core → `revalidatePath` → `{ data, error }`. After every ticket write, creation included, the
action calls `wakeTicketNow(ticketId)` inside `after()`, so the sentinel reads the change in the
same request instead of waiting for the next sweep.

| Core | What it does beyond the RPC |
| --- | --- |
| `createTicketCore` | Reads the member's queendom, resolves the SLA policy, stamps the three due times, copies the category's checklist, and writes the message links. A ticket created by a person approves its own priority at creation, so its SLA starts at once. Notifies the assignee (`ticket_assigned`) when it is someone else |
| `moveTicketStatusCore` | Refuses an illegal move and a vendor stage without a vendor; recomputes the update deadline; closes the vendor's job when the ticket ends (section 12). Takes an actor kind so the sentinel's auto-close is a sentinel event |
| `assignTicketCore` | Writes `assigned` or `reassigned` with the reason; notifies the new assignee |
| `setTicketPriorityCore` | Changes the priority; with `approve` it stamps the approval and restarts the SLA stamps |
| `updateTicketBriefCore` | Title, category, sub-category, brief, needed-by |
| `tickChecklistCore` | Ticks or unticks one item, with who and when |
| `addTicketNoteCore` | Inserts a `note` event. The first human note on a ticket also stamps `first_responded_at` |
| `linkTicketMessagesCore` | Links WhatsApp messages and writes `member_message_linked` |
| `updateTicketMoneyCore` | Merges the money fields and writes `quote_added` |
| `updateTicketTagsCore` | Sets the tags; the change is an `observation` event |
| `createTicketTaskCore` | Section 13 |
| `resolveSentinelProposalCore` | Section 8.4 |
| `upsertTicketSlaPolicyCore`, `deleteTicketSlaPolicyCore`, `updateTicketSettingsCore` | Section 7 |

The same cores serve Elaya's write tools and the sentinel. Never write `sia.tickets` any other way.

---

## 6. SLA policies

The sentinel is the SLA engine; there is no separate timer table. Each policy row
(`sia.ticket_sla_policies`) has a scope and five clocks, all in minutes:

| Field | Meaning |
| --- | --- |
| `queendom_id`, `category`, `sub_category`, `priority` | Scope; null means "every" |
| `first_response_min` | Time to the first response |
| `update_cadence_min` | How often the member should hear from us while the clock runs |
| `vendor_silence_min` | How long a ticket may wait on a vendor with nothing happening |
| `member_silence_min` | How long a member may leave a question unanswered in `awaiting_member` |
| `resolve_target_min` | Time to resolution |
| `business_hours` | Count only business minutes (Mon to Sat, 09:00 to 19:00 IST, from `src/lib/constants/sla.ts`) |
| `escalation` | The ladder: `[{after_min, to: bishop / queen / founder}]`, measured from the breach |
| `is_active` | Off rows are ignored |

**Seeded rows (0195),** from Freshdesk's numbers: one per priority, all with a 15-minute first
response and an 8-hour resolve target; update cadence 24 h (low), 12 h (medium), 4 h (high),
2 h (urgent); ladders bishop at +15 min and queen at +60 min, urgent bishop +10, queen +30,
founder +120. Two more rows give retail watches and bags a 48-hour resolve target.

**Which row applies.** `resolveSlaPolicy` in `tickets-service.ts` scores every active row that
does not contradict the ticket: queendom 8, sub-category 4, category 2, priority 1; the highest
score wins. The winning row applies **whole**: fields are not merged across rows. One consequence
worth knowing: a medium retail watch ticket takes the watch row, which has no escalation ladder.

**When the clock starts.** A ticket a person creates approves its own priority, so its stamps are
set at creation. A proposed ticket gets no stamps until it is approved. Changing the priority
with approval (`setTicketPriorityCore`, approve true) recomputes the stamps under the new
priority's policy: from the creation time when the priority was already approved, else from now.
A change without approval only changes the priority. The sentinel reads the policy on every wake,
so an edit in settings applies on the next look.

---

## 7. Status labels, tags and SLA editing (`/settings/tickets`)

The founder edits ticketing on `/settings/tickets` without a deploy. The page is reachable by
admin, founder and the tech workbench (`hasElevatedPageAccess`); every write is admin or founder
only (`requireProfile(['admin','founder'])` in `src/lib/actions/ticket-settings.ts`), on the
service role because the settings tables have no user write policy.

| Panel | Component | What it edits | Core |
| --- | --- | --- | --- |
| SLA policies | `components/settings/TicketSlaPoliciesPanel.tsx` | One card per policy: scope, the five clocks, business hours, the ladder as a sentence, active, delete (the last active policy cannot be deleted), New policy | `upsertTicketSlaPolicyCore`, `deleteTicketSlaPolicyCore` |
| Status names and tags | `components/settings/TicketLabelsPanel.tsx` | A display name for any status (max 30 characters; only real renames are stored) and the tag vocabulary (up to 60 tags; lowercase letters, digits and dashes, max 30 characters) | `updateTicketSettingsCore` |
| Lessons | `components/settings/IntakeLessonsPanel.tsx` | Section 11 | the lesson cores |

`resolveTicketStatusLabels()` applies the renames on the list, the board, the status pill, the
header controls and the filters. The tag vocabulary is seeded with seven tags (vip,
urgent-client, vendor-issue, payment-pending, gift, travel, repeat). A ticket may carry up to 12
tags, from the vocabulary or free.

---

## 8. The sentinel

One watcher per ticket, not one process per ticket. Its identity is the ticket row, its memory is
`sentinel_state`, its mailbox is the event and link tables (the 0199 triggers set `next_wake_at`
on every arrival), and its alarm clock is `next_wake_at`.

### 8.1 How it runs

| Path | Trigger | What happens |
| --- | --- | --- |
| The minute sweep | `src/trigger/ticket-sentinel.ts` (`* * * * *`, 60 s max) | `runSentinelSweep`: claim up to 20 due tickets, lease them for 5 minutes, wake each, loop while there is time (45 s budget) |
| The reactive wake | every ticket action and Elaya's ticket writes | `wakeTicketNow(ticketId)` claims that one ticket through `claim_sentinel_wakes(p_ticket_id)` and wakes it in the same request |
| The laptop loop | `scripts/tickets/sentinel.ts --loop` | The same sweep from a laptop, for when the Trigger task is not deployed |

There is no on/off switch; the sentinel runs whenever tickets are due. A crashed worker's tickets
come back when their lease ends. A wake that throws sets the next alarm 10 minutes out with the
error as its reason. TODO: verify the Trigger task is deployed (it has no work while there are no
live tickets).

### 8.2 The rule pass (no model)

`planWake()` is pure code over the ticket, its policy, its memory and the clock. Each rule fires
once per key (`state.fired` remembers), and the state is written in the same `apply_ticket_change`
transaction as the event, before any notification leaves, so a double fire is impossible.

| Rule | Fires when | Event | Who is told (notification key) |
| --- | --- | --- | --- |
| First response recorded | a human note or staff reply arrives before `first_responded_at` | observation | nobody |
| Member replied | a new member message is linked | observation | assignee (`ticket_member_replied`, transactional) |
| Proposal waiting | a `proposed` ticket is an hour old | reminder_sent | bishops (`ticket_proposed_for_approval`) |
| First response warning | 5 min before the due time | sla_warning | assignee (`ticket_sla_warning`) |
| First response breach | the due time passes with no response | sla_breached | assignee (`ticket_sla_breach`, transactional) |
| First response ladder | each ladder step after the breach | escalated | bishops, queen or founders (`ticket_sla_breach_manager`) |
| Update cadence | the next update is due | reminder_sent, and the next deadline is set | assignee (`ticket_sla_warning`) |
| Vendor silent | `awaiting_vendor` with nothing for `vendor_silence_min` | reminder_sent | assignee |
| Member silent | `awaiting_member` with no member word for `member_silence_min` | reminder_sent | assignee |
| Requested time passed | `requested_for` passes and the ticket is not in delivery or payment | reminder_sent | assignee |
| Resolve warning | 60 min before the resolve target | sla_warning | assignee |
| Resolve breach, then ladder | the target passes | sla_breached, escalated | assignee, then the ladder |
| Quiet after resolved | resolved for 48 h with no member reply | a `closed` status change by the sentinel | nobody |

The rules for first response, update cadence and resolve only run while the SLA clock runs
(an active status outside the SLA-stopped set). Business-hours policies count business minutes.

**Sleep.** The next alarm is the earliest deadline ahead, at least one minute and at most 12 hours
out (`SENTINEL_MAX_SLEEP_MIN`); with nothing ahead it is a routine 12-hour look.

**Recipients** (`resolveRecipients`): the assignee; the ticket's own bishop if one is set,
otherwise every active bishop of the queendom (0242 allows several); the queen; up to three active
founders. Seats come from `getQueendomSeats()` (profiles, 0201). An alert for the assignee on an
unassigned ticket goes to the bishops; an alert for the bishops with none seated goes to the queen.
The Joker head has no queendom, so they are never picked as a bishop, queen or founder recipient
(by design, 0244); only a ticket assigned to them alerts them.

### 8.3 The reading pass (one model call, only for new text)

Runs when a human note or a linked member message is new and the ticket has used less than
60,000 tokens (`SENTINEL_TOKEN_BUDGET`). Routing tier through the Elaya provider, the text masked
with `maskPii`, at most 6,000 characters of new text, one `sia.extraction_runs` row
(`kind: sentinel`, prompt `sentinel-read-v2` plus the lesson suffix). It returns JSON and fails
closed: a bad reply means rules only.

| What it reads | What it does with it |
| --- | --- |
| A summary of where the ticket stands | Saved as `summary` |
| Checklist items the note shows done | Ticked, with a `checklist_ticked` event |
| Money figures stated plainly in notes | Filled in, only where the field was empty (`quote_added`) |
| A change the member made to the request | Recorded as a proposal in the diary and state (`proposed_brief`), never applied; the assignee is told |
| The member's tone | Frustrated or angry: an observation and the bishops are told (`ticket_member_unhappy`) |
| The member asking where things stand | A reminder and the assignee is told |
| A status the text supports | The judgement (8.4) |

### 8.4 The judgement: suggested status moves

The reading may name `suggested_status`, but only a move the state machine allows from the
current status, and never `closed`, `open` or `proposed` (checked in code, not trusted from the
model). "The member says it was delivered" becomes a suggestion to resolve. The suggestion is
stored as `sentinel_state.proposal` with its reason and run id, noted in the diary, and the
assignee is told.

On the ticket page the Sentinel card shows it with exactly two actions (`SentinelProposal.tsx`):

- **Approve** is the ordinary status move, made by that person through `moveTicketStatusCore`,
  with a note that it was the sentinel's idea.
- **Dismiss** removes the proposal and keeps the refusal as an event.

Both answers are written to the training ledger (`source: sentinel`). A suggestion belongs to the
status it was made in: once the ticket moves, the next wake drops it. The sentinel never moves a
ticket itself, except the quiet-after-resolved close.

---

## 9. Intake: Serene proposes tickets from the chats

`runIntakeSweep()` in `src/lib/services/ticket-intake.ts` reads the linked WhatsApp groups of
Active members as messages arrive and files a card for anything that reads as a request. A card is
not a ticket: it takes no ticket number and starts no clock.

### 9.1 The sweep, cheapest step first

1. **Only groups with something new** (`sia.intake_due_groups`): linked member groups
   (`group_kind = 'member'`, active) of members with `membership_status = 'Active'`. A group never
   seen before starts 6 hours back, never at the start of its history.
2. **Only settled bursts.** New messages are cut into bursts on 20-minute gaps; the last burst
   waits until the chat has been quiet for 45 seconds.
3. **No member message** in the burst: skipped, no model.
4. **Only acknowledgements** ("ok thanks", emoji; the literal `INTAKE_ACK_WORDS` list): skipped.
5. **Already on a ticket** (a genie linked these messages): skipped.
6. **One classifier call** (routing tier, low effort, 30 s timeout, prompt `intake-v1` plus the
   lesson suffix) returns kind (request, update, question, feedback, chatter), confidence, tone, a
   one-line summary, which messages form the request, whether more requests are hidden in it, and
   the open ticket an update belongs to (believed only if it was one of the tickets offered).
7. **A health signal** is written from the verdict whatever the kind (below).
8. **A card is worth filing** only for a request, or an update naming an open ticket, at
   confidence 0.6 or more. Below that the verdict stays in the run ledger and nobody sees it.
9. **The profiler flush.** Before drafting, `profileGroupNow()` files the group's unread chat into
   the member profile, so the draft sees what the member said earlier that day (see
   `members.md`). Best effort.
10. **The draft** (requests only): the drafter (section 10) with the request's messages and the
    conversation around them.
11. **The card** is upserted into `sia.intake_proposals` (one per burst, a repeat is ignored) and
    the queendom is told.

Names never reach the model: every burst goes through the profiler's vault (`openVault`: code
names per group, the masker and a leak check that refuses to send). Every classifier call is a
`sia.extraction_runs` row (`kind: intake`), chatter included.

**Health from the chat** (`healthSignalFor`, confidence 0.75 or more): feedback with a frustrated
or angry tone is a complaint, happy feedback is praise, and any other non-chatter message in a
frustrated or angry tone is a "frustrated tone" signal. Written through `addHealthSignalCore`, at
most once per member per signal per 24 hours.

**The notification.** A new card notifies every bishop of the queendom; with none seated, the
queen; with neither, up to 12 genies (`ticket_proposed`, key `ticket_proposed_for_approval`). The
link opens `/tickets/new?proposal=<id>` for a request, or `/tickets` for an update.

**Failures.** A burst that fails keeps the bookmark and is retried; after 3 failed readings it is
stepped over and the group state says so. A model call that throws counts as a failure only when
another burst was read successfully in the same run (the proof the provider was up); three
provider failures in a row stop the run. Cards nobody touched for 24 hours become `expired`.

### 9.2 Runs and switches

| Item | Value |
| --- | --- |
| Trigger task | `ticket-intake`, every minute, one run at a time, 110 s max, a 40 s working budget, skipped when it starts more than 50 s late |
| Switch | `elaya_settings.ticket_intake_enabled` (seeded false in 0219; switched on in production; flip the row to stop it, no deploy) |
| Per run | up to 40 groups, 60 bursts, 4 groups in parallel; one member's two groups never run together |
| Dry run | `scripts/tickets/intake-pilot.ts` (nothing proposed, no bookmark moves) |

### 9.3 What a human does with a card

| Card | Action | What happens |
| --- | --- | --- |
| Request | Review and create | `/tickets/new?proposal=<id>` opens the form filled from the card's draft (no second model call). `createTicketAction` checks the card is visible, still open and about the same member, creates the ticket, closes the card as `accepted` with `fields_changed`, and writes a verdict |
| Update | Add to T-000123 | `acceptIntakeUpdateAction` links the messages to that ticket as `update` links (which wakes its sentinel), closes the card and writes a verdict |
| Either | Dismiss | A reason is required (not a request, already handled, duplicate, wrong member, something else) plus optional words; the card is closed once (`resolveIntakeProposal` only moves an open card) and a verdict is written |

---

## 10. The drafter and the training numbers

### 10.1 The drafter

`draftTicketCore()` in `src/lib/services/ticket-draft-core.ts` is the one place member chat
becomes a drafted ticket. Two callers share it so they can never drift:

- the New ticket form, when a genie selected messages in Sia (`draftTicketAction` →
  `ticket-creator.ts`, `via: selection`);
- the intake sweep (`via: intake`), which also passes the conversation around the request and
  the classifier's one-line reading as a hint.

It opens the vault, adds the member's essentials (address, dietary, family, contact rules) and
preferences from the profile, masks everything, and asks the reasoning tier (low effort, 4,000
output tokens, 60 s, prompt `ticket-draft-v3` plus the lesson suffix). The reply is validated
against our own vocabulary: an unknown category becomes `special_request`, an unknown priority
`medium`, brief fields outside the category are dropped. It returns category, sub-category,
title, brief, priority with a reason, needed-by, an acknowledgement the genie may send by hand,
up to four vendor search terms, and a confidence. Every call is a `sia.extraction_runs` row
(`kind: ticket_creator`). It fails closed: any problem returns null and the person fills the form.

### 10.2 The training numbers (0238)

`sia.intake_stats(p_since, p_exam)` counts, in one statement, what the Tickets page shows admins
and founders over the last 7 days (`getIntakeStats`):

- bursts read (dry runs excluded), by verdict kind, and the tokens used (priced in TypeScript at
  the Haiku rates written in `intake-service.ts`);
- cards proposed, open, accepted, accepted with no edits, dismissed (by reason), expired;
- **the free exam**: of the newest 60 request cards, how many had a Freshdesk ticket for the same
  member created between 30 minutes before and 2 hours after the first message;
- health signals written by intake, by signal.

It replaced a read that pulled every run into the app and was cut by PostgREST's 1,000-row cap.

---

## 11. The training loop

The founder's rule for this phase: every approval, rejection and correction must become an
instruction the ticket AI follows, and a human approves the instruction, never the machine.

### 11.1 The verdict ledger (0239)

`sia.draft_reviews` keeps one row per human decision on a machine draft, written by
`recordDraftReviewCore()` (best effort, never throws, admin client, append-only).

| Source | Written by | Decisions |
| --- | --- | --- |
| `intake_card` | `createTicketAction` (from a card), `dismissIntakeProposalAction`, `acceptIntakeUpdateAction` | accepted, edited, dismissed |
| `ticket_creator` | `createTicketAction` (from a Sia selection with a draft) | accepted, edited |
| `sentinel` | `resolveSentinelProposalCore` | accepted, dismissed |

Each row holds the draft as given, the final as made, every change as `{field, from, to}`, the
dismiss reason, the human's own words (`feedback`, max 500 characters), the run id and its prompt
version. "Edited" means the human changed at least one field. The compare is `diffDraft()` in
`src/lib/utils/draft-diff.ts`: pure and client-safe, used live by the form (to ask "What did
Serene get wrong?" only when something differs) and on the server for the ledger. For a card, the
draft compared against is the stored one, never what the browser sent.

### 11.2 The lessons (0240)

`sia.intake_lessons` holds one versioned plain-English instruction document per kind of work:

| Kind | Label | Learns from |
| --- | --- | --- |
| `intake` | Is this a request? | intake_card verdicts, all decisions |
| `ticket_creator` | How to fill the ticket | intake_card and ticket_creator verdicts that were accepted or edited |
| `sentinel` | When to suggest a status move | sentinel verdicts |

**The writer** (`writeLessonDraft(kind)`): reads the verdicts decided since the last lesson of
that kind (newest 150), masks member names to `MEMBER_n` and runs `maskPii`, refuses to write if a
full name survives in the input or the output, and asks the reasoning tier for the full
replacement document. The reply is plain text (a `SUMMARY:` line, a `---` line, the document);
JSON broke on the first real run. It writes one draft per kind (a second run replaces the draft).
Below 10 new verdicts it writes nothing; the button forces a writing, never with zero verdicts.
Every call is a run row (`kind: lesson_writer`, prompt `lesson-writer-v1`).

**The founder's moves** (`/settings/tickets`, admin/founder): edit the draft, Approve (the old
approved version is retired first, and put back if the approval fails), Discard (retired, kept),
Write a lesson now (queues `intake-lesson-write` on Trigger.dev), and Download instructions.md
(every approved lesson as one file, for the specialised ticket agent planned later).

**Only the approved lesson reaches a prompt.** `lessonPromptBlock(kind)` appends it to the system
text of the intake classifier, the drafter and the sentinel's reading, and adds `+L<version>` to
their prompt version (for example `intake-v1+L3`). It is cached for 5 minutes and dropped on
approval. The scoreboard (`sia.draft_review_scoreboard`, last 90 days on the settings page) splits
the verdicts by prompt version, so a lesson is judged by its numbers.

| Item | Value |
| --- | --- |
| Weekly task | `intake-lessons-weekly`, Monday 06:00 IST, all three kinds |
| On-demand task | `intake-lesson-write` (one per kind, idempotent per hour) |
| Switch | `elaya_settings.intake_lessons_enabled`, ON unless the row says false |
| Bench | `scripts/tickets/lesson-bench.ts` (dry run with hand-made verdicts, nothing written) |

As of 2026-09-25 there were no real verdicts, so no lesson had been written from production data.

---

## 12. The vendor on a ticket

`src/lib/services/ticket-vendor.ts` joins a ticket to the Vendors module. The ranking, the score
and the ledger themselves are described in `vendors.md`.

- **Suggest.** `suggestVendorsForTicket` asks THE one ranking (`rankVendorsForRequest`) with the
  ticket's own words (title, product, event, preferred vendor, gift details), its city (the first
  part of `to_location` or `from_location`), the member and the asking teammate. Top 5. Nothing is
  re-ranked here. `searchVendorsForTicket` searches active vendors by name.
- **Choose.** `setTicketVendorCore` puts `vendor_id` on the ticket (event `vendor_chosen`) and
  opens the job on the vendor's ledger through `logEngagementCore` with `source: 'ticket'` and
  `source_ref` = the ticket number, so picking the same vendor again refines one row. Switching
  vendor closes the previous vendor's open job as cancelled. Only an active vendor can be chosen.
- **Close.** When a ticket reaches resolved, closed or dropped, `moveTicketStatusCore` closes the
  open job with the outcome the ending implies (`outcomeForResolution`): dropped, cancelled by the
  member, duplicate or not a request = cancelled; could not source = failed; otherwise completed.
  The amount is the ticket's `money.cost_inr`. Because this sits in the core, a person, Elaya and
  the sentinel's auto-close all do it.
- **Review.** Once the ticket is resolved or closed, `reviewTicketVendorCore` files one review
  (speed, quality, pricing, reliability, 1 to 5, any subset, plus words) against the ticket's own
  job, and writes a `learning_written` event. One review per ticket. This is the only review form
  in the app: the vendor page has none (a comment in `ticket-vendor.ts` says more reviews are
  allowed there; that is not true today).
- **Access.** These actions are gated by the TICKET's queendom, not by the vendor module's gate:
  a teammate working a ticket can pick who does the job. They get a trimmed vendor (name,
  category, city, phone, score, reasons, flags). The vendor page itself has been open to the whole
  concierge domain since 0221, so the vendor's name on the ticket links to it (the older line that
  "the vendor dossier stays admin/founder", in the 2026-09-18 changelog and the file's header
  comment, is superseded).

---

## 13. Tasks spun off a ticket

`createTicketTaskCore` creates a normal personal task through `createPersonalTaskCore` (so it gets
the reminder, the notification and the cache clears every task gets), tags it `ticket`, puts
"T-000123 · title" in its description, links it through `public.task_ticket_meta`, and writes a
`subtask_created` event. The assignee defaults to the actor. The task shows in My Tasks like any
other (see `../pages/tasks.md`) and on the ticket page's Sub-work card. The task's `module` is
`core`; the `sia` value of the task-module enum is not used yet.

---

## 14. The live board

`sia.tickets` is on the Realtime publication (0200). The board (`TicketBoard.tsx`) subscribes to
changes on `sia.tickets` (one queendom, or all), and any change re-reads the board through
`listBoardTicketsAction`, debounced 400 ms. RLS scopes both the subscription and the read.
`listBoardTickets()` reads each of the eight board columns (proposed, the six live statuses,
resolved) separately, newest update first, up to 60 cards per column. A move is checked against
the state machine in the browser and again in the core. The screen is specified in
`../pages/tickets.md`.

---

## 15. Notifications

All ticket notifications go through `createNotification` (in-app plus Web Push), with a
preference key where the alert can be muted. There is no WhatsApp sender for ticket alerts yet,
even though the preference catalog offers a WhatsApp toggle for some of them.

| Type | Preference key | Sent by | To |
| --- | --- | --- | --- |
| `ticket_assigned` | none (transactional) | create and assign cores | the new assignee |
| `ticket_proposed` | `ticket_proposed_for_approval` | intake (new card), sentinel (stale proposal) | bishops, else queen, else genies (intake); bishops (sentinel) |
| `ticket_sla_warning` | `ticket_sla_warning` | sentinel | assignee |
| `ticket_sla_breach` | none on the assignee's own breach; `ticket_sla_breach_manager` on the ladder | sentinel | assignee, then the ladder |
| `ticket_member_replied` | none (transactional) | sentinel | assignee (member replied, request changed, member asks for an update, a suggested move) |
| `ticket_member_unhappy` | `ticket_member_unhappy` | sentinel | bishops |

`ticket_daily_digest_founder` exists in the catalog and the SQL CHECK, but nothing sends it. The
founders' twice-daily brief is a separate feature (`elaya-analyst.md`).

---

## 16. Access and queendom scoping

| Layer | Rule |
| --- | --- |
| Routes | `/tickets` is reachable for admin, founder, the tech workbench and the concierge domain (`DOMAIN_ROUTE_MAP`). It is listed in the nav for admin and the tech workbench only: hidden for the founder (`FOUNDER_NAV_PREFIXES`) and for concierge (`DOMAIN_NAV_HIDDEN`, the floor reaches it from Sia) |
| Rows (RLS) | `sia.tickets`, `ticket_events`, `task_ticket_meta`, `ticket_message_links` and `intake_proposals` are readable when `can_access_member_queendom(queendom_id)` passes: admin and founder always; a seated concierge teammate for their own queendom; the active concierge Joker head for every queendom (0244). A ticket or card with no queendom is admin/founder only. A message link that points only at a mirrored Freshdesk ticket (no Serene ticket) is readable by any signed-in user. `ticket_sla_policies` and `ticket_settings` are readable by every signed-in user. `draft_reviews` and `intake_lessons` are admin/founder only |
| Actions | Every ticket action checks `canAccessMember(profile, queendom)`, the TypeScript twin of the SQL gate (`src/lib/elaya/access.ts`) |
| Board and filters | Admin, founder and the Joker head (`isCompanyWideSeat`) pick a queendom or see all; a seat is pinned to its own |
| Settings | Page: admin, founder, tech workbench. Writes: admin and founder |

**Seats.** Positions live on `profiles.sia_role` and `profiles.queendom_id` (0201). Queen and joker
are one active holder per queendom; bishops can be many (0242); nobody can change their own seat
or queendom (0243); the Joker head is one company-wide seat with a queen's reach in every
queendom, no ticket alerts and no member money (0244). Queen, bishop and Joker head map to the
`manager` platform role, genie and joker to `agent`. 0242 to 0244 are applied to production
(checked with `supabase migration list --linked` on 2026-09-26).

An unseated concierge account and a tech workbench account without the admin role reach the
pages but see no rows.

Opening a ticket page writes a `member_access_log` row for the ticket's member (surface
`ticket_help`), because the help window shows that member's profile (see `members.md`).

---

## 17. Elaya, MCP and other readers

Elaya reads and moves tickets on both brains (full detail in `elaya.md`):

| Tool | Kind | What it does |
| --- | --- | --- |
| `list_tickets` | read | The caller's queendom's live tickets (mine, by status, by words); admin/founder every queendom; the Joker head every queendom but never a ticket without one. Scope comes from the profile, never from the model |
| `get_ticket` | read | One ticket by number or id, with its last events, policy and allowed moves, after `canAccessMember` |
| `add_ticket_note` | write, runs at once | `addTicketNoteCore`, then wakes the sentinel |
| `move_ticket_status` | write, proposed | Checks the move at proposal time; on a yes, the resolver re-gates, checks the status has not changed, and runs `moveTicketStatusCore` |

The MCP connector exposes a `serene://ticket/{ticket}` resource over `get_ticket` (see
`../integrations/mcp.md`). The read-only analyst views `elaya_read.sia_tickets`,
`sia_ticket_events` and `ticket_suggestions` (0223) let founders ask about tickets in SQL (see
`elaya-analyst.md`). The member pulse (0241) counts a member's open Serene tickets with their open
Freshdesk tickets, and the member judgement reads their Serene tickets (see `members.md`).

---

## 18. Model calls at a glance

| Call | Tier | Prompt version | Run kind | Folds a lesson |
| --- | --- | --- | --- | --- |
| Intake classifier | routing, low effort | `intake-v1` | `intake` | yes (`intake`) |
| Drafter | reasoning, low effort | `ticket-draft-v3` | `ticket_creator` | yes (`ticket_creator`) |
| Sentinel reading | routing | `sentinel-read-v2` | `sentinel` | yes (`sentinel`) |
| Lesson writer | reasoning | `lesson-writer-v1` | `lesson_writer` | no |

All go through the Elaya provider layer (`resolveLlmForJob`), so the model behind each tier is the
`llm_providers` row. None of them names a person to the model.

---

## 19. What the plan described but is not built

`../architecture/member-ticket-plan.md` section 7 is the plan. These parts of it do not exist in code:

- **The scored genie picker** (`pick_genie_for_ticket`, shifts, load, speciality). `genie_roster`
  is empty and unused; assignment is by hand.
- **Proposed tickets.** Intake files cards in a separate table instead; nothing creates a ticket
  in `proposed`, so the "proposal waiting" rule and the board's Proposed column are dormant.
- **The daily digest** at 07:30 IST, WhatsApp delivery of ticket alerts, and health-drop alerts.
- **The judgement pass that drafts the member update** and the close pass that writes facts to
  the member twin. The event types `member_update_drafted` / `member_update_sent` are unused.
- **Approving or dismissing a card from WhatsApp** through Elaya.
- **Linking messages to an existing ticket from the Sia chat.** `linkTicketMessagesAction` exists
  with no screen calling it; messages reach an existing ticket only through an intake update card.
- **The Freshdesk cutover**: the pilot queendom, the history import (`origin = freshdesk_import`),
  and the member app reading Serene tickets.
- **Autonomy** (auto-create, auto-assign). Every call is still a human's.

---

## 20. Open items and known gaps

- **Priority approval is gated only in the page.** The ticket page lets managers (queen, bishop,
  Joker head, admin, founder) approve and hides the button from agents, but
  `setTicketPriorityAction` trusts the `approve` flag it is sent (default true) after the
  queendom check.
- **Two payment-status vocabularies.** The Money card offers not started / requested / paid /
  waived; the sentinel's reading writes unpaid / partial / paid.
- **Intake-card verdicts carry the drafter's run id**, so their prompt version is the drafter's
  (`ticket-draft-v3...`), and update cards (which have no draft) land under `unknown`. The
  `intake` lesson's scoreboard therefore does not split by the classifier's version. TODO: verify
  whether that is intended.
- **The notification catalog** describes `ticket_sla_warning` as five minutes before a first
  response or resolution target; the resolve warning is 60 minutes before.
- **The seeded watch and bag SLA rows have no escalation ladder**, and the most specific row wins
  whole, so those tickets never escalate. Add a ladder in settings if that is not wanted.
- **Diary partitions run out in 2027.** `sia.ticket_events` has monthly partitions from 2026-09 to
  2027-12; later rows fall into the default partition. Add months before then (the same upkeep as
  the WhatsApp archive tables in `../operations/maintenance.md`).
- **Hands (0245)**, Elaya's second WhatsApp number and a conversation thread on a ticket: step 1
  is committed but not applied to production, the rest is a plan; see
  `../architecture/hands-plan.md`.

---

## 21. Scripts

| Script | What it does |
| --- | --- |
| `scripts/tickets/sentinel.ts` | The sentinel sweep from a laptop (`--loop [--minutes N]`) |
| `scripts/tickets/intake-pilot.ts` | A dry run of intake over recent real chat; the report is written outside the repo |
| `scripts/tickets/lesson-bench.ts` | The lesson writer with hand-made verdicts; nothing written |
