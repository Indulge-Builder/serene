# Tickets: Page Spec

> **Purpose:** spec for the ticket screens: `/tickets` (the list and the suggested-tickets strip), `/tickets/new`, `/tickets/[id]`, `/tickets/board`, and `/settings/tickets`.
> **Audience:** engineers and designers working on the concierge floor's ticket screens.
> **Source-of-truth scope:** what each screen shows, who reaches it, what it reads and calls, and its states. How tickets work underneath (the state machine, SLA, the sentinel, intake, the drafter, the training loop, the vendor link) lives in `../modules/tickets.md`; this page links there instead of repeating it.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/tickets/` (list, `new`, `[id]`, `board`), `src/app/(dashboard)/settings/tickets/`, `src/components/tickets/`, `src/components/settings/TicketSlaPoliciesPanel.tsx`, `TicketLabelsPanel.tsx`, `IntakeLessonsPanel.tsx`, `src/components/sia/SiaMessagesPeek.tsx`, `src/lib/actions/tickets.ts`, `ticket-settings.ts`, `src/lib/constants/route-permissions.ts`, `src/lib/utils/route-access.ts`.

## 1. Purpose

Where the concierge floor works member requests in Serene. The list shows live tickets and, above
them, the tickets Serene proposes from the member WhatsApp groups. The new-ticket form turns a
proposal, a selection of Sia messages, or a blank page into a ticket. The ticket page is the
workbench for one request: its status and deadlines, the brief, the checklist, money, the vendor,
the member's own words, the diary and the tasks spun off it, with the member's profile beside it.
The board is the same work as columns you drag between. The settings page is where the founder
tunes the SLA clocks, the status names, the tags and the lessons the ticket AI follows.

Freshdesk is still the team's working tool (see `../integrations/freshdesk.md`). These screens run
beside it until the move over.

## 2. Who sees it

| Route | Who reaches it | Listed in the nav for | Whose tickets show |
| --- | --- | --- | --- |
| `/tickets`, `/tickets/new`, `/tickets/[id]`, `/tickets/board` | admin, founder, the tech workbench, the concierge domain (`canAccessRoute`; everyone else is sent to `/dashboard`) | admin and the tech workbench. Hidden for the founder (`FOUNDER_NAV_PREFIXES`) and for concierge (`DOMAIN_NAV_HIDDEN`; the floor arrives from Sia and from notifications) | RLS on `sia.tickets` through `can_access_member_queendom()`: admin and founder all; a seated teammate their own queendom; the Joker head every queendom (0244). A ticket with no queendom: admin and founder only |
| `/settings/tickets` | admin, founder, the tech workbench (`hasElevatedPageAccess`; others go to `/settings`) | a card on the `/settings` hub (see `settings.md`) | not applicable; saving is admin and founder only |

More detail:

- **The intake numbers line** on `/tickets` (chats read, accepted, the Freshdesk exam, cost) is
  shown to admin and founder only.
- **The queendom filter and the all-queendoms view** (list, board, staff pickers) are for admin,
  founder and the Joker head (`isCompanyWideSeat`). A seated teammate is pinned to their queendom.
- **Approving a priority** is offered to anyone whose platform role is not `agent` (queen, bishop,
  Joker head, admin, founder). The server does not re-check this; see Open items.
- **Every write** on a ticket checks `canAccessMember` against the ticket's queendom, so a person
  can only change tickets they can see. The vendor picker on a ticket follows the ticket's gate,
  not the Vendors module's gate.
- An unseated concierge account, or a tech workbench account without the admin role, reaches the
  pages but sees no tickets and no cards.
- Opening a ticket writes a `member_access_log` row for its member (surface `ticket_help`).

The seats and the queendom boundary are explained in `../modules/tickets.md` section 16 and
`../architecture/auth-and-rbac.md`.

## 3. Data sources

| Route | Reads (services) | Writes (actions) |
| --- | --- | --- |
| `/tickets` | `listTickets` (session, RLS), `listOpenIntakeProposals` (session, RLS, up to 40 open cards plus the total), `getIntakeStats` (admin client via `sia.intake_stats`, admin/founder only), `getQueendoms`, `listQueendomStaff`, `getTicketSettings` | `dismissIntakeProposalAction`, `acceptIntakeUpdateAction` |
| `/tickets/new` | `getIntakeProposal` (session, RLS) for `?proposal=`, the member row for `?member=` | `draftTicketAction`, `createTicketAction`, `searchMembersAction`, `listQueendomStaffAction`, `getSiaMessagesAction` (the message peek) |
| `/tickets/[id]` | `getTicketDetail` (session: the ticket, its last 500 events, up to 200 message links with text from the archive, the queendom's staff, the tasks, the SLA policy), `getTicketHelp` (the member twin and the Freshdesk mirror), `getTicketSettings`, `getTicketVendor`, `getTicketVendorReview` | `moveTicketStatusAction`, `assignTicketAction`, `setTicketPriorityAction`, `updateTicketBriefAction`, `tickChecklistAction`, `updateTicketMoneyAction`, `addTicketNoteAction`, `updateTicketTagsAction`, `createTicketTaskAction`, `resolveSentinelProposalAction`, `suggestTicketVendorsAction`, `searchTicketVendorsAction`, `setTicketVendorAction`, `reviewTicketVendorAction` |
| `/tickets/board` | `listBoardTickets` (session, per column, capped at 60), `getQueendoms`, `listQueendomStaff`, `getTicketSettings`; then Realtime on `sia.tickets` | `listBoardTicketsAction` (the live re-read), `moveTicketStatusAction` |
| `/settings/tickets` | `listTicketSlaPolicies`, `getTicketSettings`, `getQueendoms`, `listIntakeLessons` (session, RLS admin/founder), `getDraftReviewScoreboard` (last 90 days) | `upsertTicketSlaPolicyAction`, `deleteTicketSlaPolicyAction`, `updateTicketSettingsAction`, `approveIntakeLessonAction`, `updateIntakeLessonAction`, `discardIntakeLessonAction`, `writeIntakeLessonNowAction` |

All ticket writes go `src/lib/actions/tickets.ts` or `ticket-settings.ts` → the cores in
`src/lib/services/ticket-mutations.ts` (and `ticket-vendor.ts`, `intake-lessons.ts`) → the two
ticket RPCs. After a ticket write the action wakes the ticket's sentinel inside `after()`. No
Redis: every read is live.

## 4. Components

All in `src/components/tickets/` unless noted.

| Component | Used on | What it is |
| --- | --- | --- |
| `IntakeProposals`, `IntakeStatsLine` | `/tickets` | The "Suggested by Serene" strip and its numbers line |
| `TicketsFilters` | `/tickets`, board | The filter strip over `<FilterBar>` + `useUrlFilters` |
| `TicketsTable`, `TicketsTableSkeleton` | `/tickets` | The dense list and its skeleton |
| `TicketStatusPill`, `PriorityDot` | everywhere | THE status pill (takes the renamed label) and the priority marker (shows whether the priority is approved) |
| `NewTicketForm` (+ `TICKET_SELECTION_KEY`) | `/tickets/new` | The whole new-ticket body |
| `SiaMessagesPeek` (`components/sia/`) | `/tickets/new` | The mini WhatsApp view of the messages a ticket rests on |
| `TicketHeaderControls` | `/tickets/[id]` | Status, resolution, priority and approval, assignee, the vendor dialog, the review dialog |
| `TicketSentinelCard`, `SentinelProposal` | `/tickets/[id]` | The sentinel's summary and its suggested move (Approve / Dismiss) |
| `TicketVendorCard`, `VendorFinder`, `VendorReviewForm` | `/tickets/[id]` | Who does the job, THE picker, the review after resolving |
| `TicketTagsCard` | `/tickets/[id]` | The ticket's tags |
| `TicketHelpPanel`, `TicketLinkedMessagesCard` (`TicketSideCards.tsx`) | `/tickets/[id]` | The member's profile beside the ticket; the member's linked words |
| `TicketBriefCard`, `TicketChecklistCard`, `TicketMoneyCard` | `/tickets/[id]` | The typed request, the checklist, the money |
| `TicketTimeline` | `/tickets/[id]` | The diary and the note box |
| `TicketTasksCard` | `/tickets/[id]` | Sub-work and the spin-off form |
| `TicketBoard` | board | The live columns |
| `TicketSlaPoliciesPanel`, `TicketLabelsPanel`, `IntakeLessonsPanel` (`components/settings/`) | `/settings/tickets` | The three settings panels |

Shared primitives: `FilterBar`, `FilterDropdown`, `FormSelect`, `DatePicker`, `EmptyState`,
`CardHeader`, `InfoRow`, `Modal`, `Pagination`, `BackButton`, `SelectionButton`, `CheckTile`,
`TaskFormFields` (`DueDateField`), `@dnd-kit/core` on the board. Contracts in
`src/components/CLAUDE.md`.

## 5. States

| Route | Loading | Empty | Error |
| --- | --- | --- | --- |
| `/tickets` | `loading.tsx`: header, filter strip and table skeletons. The strip's cards arrive with the page; the numbers line holds its height and shows "Counting the week…" until the count streams in | Table: framed `EmptyState` "Nothing open." (or "No tickets match." with filters). Strip: nothing is rendered when there are no cards and no numbers line; with the numbers line, "Nothing waiting. Serene is listening." | A failed list read logs and shows the empty state; a failed card action shows a toast and the card stays |
| `/tickets/new` | `loading.tsx` in the form's shape; "Elaya is reading the messages…" while drafting | Not applicable | A failed draft: a warning toast and the form stays empty for a hand fill. A failed create: the message above the buttons; nothing typed is cleared |
| `/tickets/[id]` | `loading.tsx`: dossier card skeletons | Each card has its own inline empty state ("Watching. Nothing to say yet.", "No messages linked.", "No tasks yet.", "No vendor was used.", "No checklist for this category.") | A ticket the person cannot see, or that does not exist: the dashboard `not-found` page. A failed action: a toast (the timeline keeps an unsent note) |
| `/tickets/board` | `loading.tsx`: the filter strip and one column per board status | "Nothing here." inside an empty column | An illegal or refused move: a toast and the board re-reads |
| `/settings/tickets` | `loading.tsx`: card skeletons | A lesson kind with nothing yet says so in its block | Save errors show in the panel; nothing is cleared |

## 6. Invariants

- A ticket changes only through the actions and cores, and every change is a diary event
  (`../modules/tickets.md` section 3.3).
- Only the moves the state machine allows are offered, and the core refuses any other.
- `awaiting_vendor` needs a vendor: the ticket page asks for one instead of refusing.
- The intake card and the sentinel's suggestion each have exactly two actions. A human makes
  every call; the only automatic move is the sentinel's close after 48 quiet hours.
- What the human changed against a machine draft is measured on the server against the stored
  draft, never taken from the browser.
- The training numbers and the lessons are admin and founder only.
- Status renames are display only; the machine and the database values never change.

## 7. Open items

- **Priority approval is a page-only gate.** `setTicketPriorityAction` trusts the `approve` flag.
- **The Approve priority button and the "awaiting approval" banner are dormant in practice.** A
  ticket a person creates approves its priority at creation, and no path creates a `proposed`
  ticket, so both only appear for a proposed ticket. The board's Proposed column is empty for the
  same reason.
- **The board ignores every filter except the queendom.** The strip shows search, status, genie,
  category, tag and Mine, but `listBoardTickets` takes only the queendom.
- **The ticket page decodes `?from=` a second time** (`decodeURIComponent` on a value Next has
  already decoded). The 2026-09-26 Team page entry in the changelog says this pattern breaks on a
  search containing `%`. TODO: verify on the ticket page.
- **The linked-messages empty state** tells people to link messages from Sia, but Sia can only
  start a new ticket; linking to an existing ticket happens only through an intake update card.
- **The Money card and the sentinel use different payment-status words** (not started / requested
  / paid / waived against unpaid / partial / paid).
- **The Brief card cannot change the category,** although the action accepts one.
- **Tickets are hidden from the founder's nav and the concierge nav;** both reach them by link.

## 8. Deep dive

### 8.1 `/tickets`: the list

**Header.** "Tickets." with two actions on the right: Board (link to `/tickets/board`) and New
ticket (`/tickets/new`). The notification bell sits beside them when the top bar is on.

**The "Suggested by Serene" strip** (`IntakeProposals`), above the filters. It shows the open
intake cards the person can see, newest first, grouped one block per member (a member with three
bursts is one block with a "Name · 3 suggestions" line). The header says "N waiting · M members".
The first five members show; "Show N more members" opens the rest, and a note says how many older
cards load once these are decided (the page loads 40 cards). Each card shows:

- the member's name, and chips: "A request" (confidence 0.85 or more), "Is this a request?"
  (below that), or "Update to T-000123"; the drafted category and priority; the tone when
  frustrated or angry; how long ago;
- the drafted title (or the summary), and the member's first message quoted, with "+N more";
- two actions. **Review and create** (a request) opens `/tickets/new?proposal=<id>`; **Add to
  T-000123** (an update) links the messages to that ticket at once. **Dismiss** opens a one-line
  "In your words, why?" box and the reasons (Not a request, Already handled, Duplicate, Wrong
  member, Something else) plus Back. A handled card leaves the strip at once.

For admin and founder the strip carries the week's training numbers in one line: chats read,
suggested, accepted (with no edits), dismissed, how often right, how often Freshdesk agreed, the
health signals written, and the approximate cost. The mechanics are in `../modules/tickets.md`
sections 9 and 10.

**Filters** (`TicketsFilters`, URL-driven, commit at once): search on title or ticket number;
Status (multi-select, showing the renamed labels); Queendom (only when more than one queendom is
offered); Genie (the queendom's staff, or every seated person for admin, founder and the Joker
head); Category; Tag (when the vocabulary has tags); and a Mine toggle. URL parameters: `search`,
`status` (comma list), `queendom`, `assignee`, `category`, `tag`, `mine=1`, `page`. With no
status chosen the list shows live tickets plus proposed ones; resolved, closed and dropped need
the Status filter.

**The table** (`TicketsTable`, display-only, 50 per page with `<Pagination>`), newest update
first. Columns: number (mono); Request (the title as a real link, and under it member ·
category · queendom); Status; Priority (the dot); Genie ("unassigned" in the warning colour);
Due (the first-response deadline until it is met, then the resolve deadline, red when late);
Updated. A row click and the title link both open the ticket with `?from=` set so Back returns to
the same filtered view.

### 8.2 `/tickets/new`: the new-ticket form

Three ways in, one form (`NewTicketForm`):

| Way in | How it arrives | What the form does |
| --- | --- | --- |
| From an intake card | `?proposal=<id>` from the strip or the notification | The page loads the card through RLS; only an open request card is used (a closed one opens the plain form). The form fills from the card's stored draft with no second model call; the member is fixed |
| From a Sia selection | The Sia chat's "Create a ticket from messages" mode: tap messages, then Create ticket. The chat writes the selection to `sessionStorage` under `TICKET_SELECTION_KEY` (`serene:ticket-selection`) and opens `/tickets/new?member=<id>&from=sia` | The form reads the key once and removes it, fixes the member, puts the messages in the note, and calls `draftTicketAction` ("Elaya is reading the messages…"). A failed draft leaves the form for a hand fill with a warning |
| By hand | New ticket, optionally `?member=<id>` | Search a member by name or number (2 or more characters, 8 results), then fill the form |

**The form** (left column): Member; Category; Sub-category (when the category has any); Title;
the brief fields for the category (dates with a date-and-time picker, early check-in as Yes / No);
Priority (suggested), with the drafter's reason under it; Needed by; Genie (the member's
queendom's staff, else the caller's); Note (filled with the messages when there are any).
**"What did Serene get wrong? (optional)"** appears only when there is a draft and at least one
field now differs from it; the placeholder names the changed fields. It is the most useful thing
the training loop receives (`../modules/tickets.md` section 11).

**The side column:** "Elaya suggests", the acknowledgement the genie can send in the group by hand,
the draft's confidence and its vendor search words; and "N messages this ticket rests on",
rendered by `SiaMessagesPeek` as real WhatsApp bubbles inside the conversation around them (the
request's messages ringed, Earlier and Later to page, "Open in Sia" in a new tab at that exact
message). On a phone the side column shows first (`serene-dossier-grid--side-first`).

**Create ticket** is enabled once there is a member and a title and no draft is running. It calls
`createTicketAction` with the origin (`whatsapp_group` when there are messages, else `manual`),
the message links (the first as `origin`, the rest as `update`), the card id, the human's words,
and, on the Sia path, the draft it was given. On success a toast names the new number and the
ticket page opens. The ticket starts `open` with its priority approved and its SLA running.

### 8.3 `/tickets/[id]`: the ticket page

**Header.** Back (to the `?from=` path when it is under `/tickets`, else the list), then the
ticket number in small mono and the title. Under it one line: "For <member>" (a link to the member
page), when it was opened, "First response due …" until someone responds, "Resolve by …" while
live (both red when late), and "Priority awaiting approval; the SLA has not started." when the
priority is not approved.

**The controls strip** (`TicketHeaderControls`):

- The status pill and **Move to…**, listing only the legal next statuses (renamed labels).
  Resolved, closed and dropped first ask for a resolution (Delivered, Cancelled by the member,
  Could not source, Duplicate, Not a request).
- Moving to **Awaiting vendor** with no vendor opens "Who is doing this job?" with the vendor
  picker; choosing one sets the vendor and makes the move in one step.
- Resolving a ticket that has a vendor, as Delivered, opens "How did <vendor> do?" with the review
  form (speed, quality, pricing, reliability, 1 to 5, any subset, and words). It can be left for
  later; the Vendor card keeps asking.
- The priority dot and select. A manager's change approves the priority and restarts the
  deadlines; an agent's change does not approve. **Approve priority** shows for managers while the
  priority is unapproved.
- **Assign a genie** / "Genie: <name> · change": pick from the queendom's staff; a reassignment
  asks for a reason (Shift ended, Workload, Better suited, On leave, Other).

**Aside** (on the left from the `lg` breakpoint, after the main column on smaller screens):

- **Sentinel**: the sentinel's summary, when it looks next, what it has fired, how many looks and
  readings, and how much of its model budget is spent. When it suggests a move, a "Move this to
  <status>?" box with its reason and exactly two buttons, Approve and Dismiss. Empty: "Watching.
  Nothing to say yet." (live) or "Retired with the ticket."
- **Vendor**: with none, Find a vendor (the picker: ranked suggestions for this ticket until you
  type, then a name search; each row shows score, category, city, phone, the first reason and any
  warning flag). With one: the name (a link to the vendor page), details, Change and Remove while
  live, the review prompt once resolved, and "Reviewed · 4.3 of 5" after.
- **Tags**: the vocabulary as toggles plus a free tag; saves on every change and reverts with a
  toast on error.
- **Member** (the help window): the health pill, dislikes, addresses and other facts from the
  member twin; **Requests like this**: the member's other open Serene tickets and up to six
  Freshdesk tickets in the same category (linking to the Freshdesk page); **Coming up**: the
  member's upcoming occasions.

**Main column:**

- **Brief**: category and needed-by, the brief fields; Edit changes the title, sub-category and
  brief fields in place.
- **Checklist** ("x of y"): the category's items as tick tiles; a done item is struck through
  (who ticked it and when is saved on the ticket and in the diary).
- **Money**: quote, cost, price to member, payment status and invoice number; Edit to change.
- **The member's words**: the linked WhatsApp messages with their text, in time order.
- **Timeline**: every event with its actor and a plain label ("Deadline missed", "Escalated to the
  bishops"), and the note box. A note is an event; the first note stamps the first response.
- **Sub-work**: tasks spun off the ticket and a form (title, who, priority, due presets). The task
  lands in My Tasks with the usual reminders.

### 8.4 `/tickets/board`: the live board

Header: Back to the list, "Board.", then List and New ticket. The same filter strip as the list,
though only the queendom choice changes what the board shows (Open items). Eight columns in
order: Proposed, Open, Sourcing, Awaiting member, Awaiting vendor, In delivery, Payment due,
Resolved (renamed labels apply), up to 60 cards each, newest update first.

A card shows the ticket number, the priority dot, the title (a link), member · category, tags,
the genie (or "unassigned"), and the nearest deadline ("due in 2 hours", red "late …") or the last
update. **Drag** a card to another column to move it: a column the state machine refuses is marked
while dragging and a drop there shows a toast; a legal drop moves at once and calls
`moveTicketStatusAction`. A move into Awaiting vendor without a vendor is refused with a toast
that sends the person to the ticket. **On touch screens** each card also carries a "Move to…" menu
with the legal next statuses (a finger cannot easily drag and scroll at once; a drag needs a
200 ms press).

**Live:** a Realtime subscription on `sia.tickets` (one queendom or all) re-reads the board through
`listBoardTicketsAction`, debounced 400 ms, so two people always see the same columns. A seated
teammate's board is pinned to their queendom on the server whatever the browser asks.

### 8.5 `/settings/tickets`: ticket settings

Back to Settings, then "Tickets." and three panels. Saving anything is admin and founder only;
the rules behind each panel are in `../modules/tickets.md` sections 6, 7 and 11.

- **SLA policies** (`TicketSlaPoliciesPanel`): one card per policy: its scope (queendom,
  category, sub-category, priority; blank means every), the five clocks in minutes, business hours
  or the clock, the escalation ladder written as a sentence ("after 15 min → the bishops"), and
  active. Save per card; Delete (the last active policy cannot be deleted); New policy starts from
  the defaults. The most specific matching policy wins for a ticket, whole.
- **Status names and tags** (`TicketLabelsPanel`): a display name for any status (up to 30
  characters; leave blank for the built-in name) and the tag vocabulary. Saves on Save; nothing is
  cleared on error.
- **What the team has taught the ticket AI** (`IntakeLessonsPanel`): one block per kind (Is this a
  request? / How to fill the ticket / When to suggest a status move) with the approved lesson, the
  draft waiting (editable; Approve, or "Approve with my edits", and Discard), Write a lesson now
  (queued on Trigger.dev; "A draft is waiting" when one exists), the scoreboard of verdicts by
  prompt version over the last 90 days, and earlier versions. **Download instructions.md** in the
  header exports every approved lesson as one file.

A tech workbench account without the admin role can open the page and read the policies, the
names and the scoreboard (those reads use the admin client), but the lessons themselves do not
load for them (RLS on `sia.intake_lessons` is admin and founder only) and every save is refused.
