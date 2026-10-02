# Serene: Sia, the Concierge Side (Claude Project digest)

> **Purpose:** the whole concierge side of Serene in one file: queendoms and seats, who can see what, the WhatsApp group archive, the member twin, Serene's own tickets, the vendor book, the Freshdesk mirror and the Zoho member finance page.
> **Audience:** a claude.ai Project chat that cannot read the repo. Upload with the rest of `docs/claude-project/`.
> **Source-of-truth scope:** a digest only. The owning docs are `docs/modules/sia.md` (the hub), `docs/modules/members.md`, `docs/modules/tickets.md`, `docs/modules/vendors.md`, `docs/integrations/sia-connector.md`, `docs/integrations/freshdesk.md`, `docs/integrations/zoho-books.md`, and the page specs `docs/pages/sia.md`, `docs/pages/members.md`, `docs/pages/tickets.md`. When this file and those disagree, they win; when they and the code disagree, the code wins.
> **Last verified:** not re-checked against code (a digest). Regenerated 2026-09-26 from the docs verified against the code that day (migrations through 0245; production has 0244 applied, 0245 not).

---

## 1. What Sia is, and where it stands

Gia is sales: it works a lead until the deal closes. **Sia is everything after that: looking after
the member.** The concierge team (Indulge calls it "the floor") works in WhatsApp groups, one group
per member, and in Freshdesk tickets. Sia gives Serene a silent copy of every group, a record of
each member that fills itself, Serene's own tickets, a vendor book, a read-only copy of Freshdesk,
live money from Zoho, and Elaya on top of all of it. Each queendom sees only its own members.

**Status (2026-09-26): live, running beside Freshdesk.** The archive, the `/sia` viewer, seats,
member records, the vendor book and the Freshdesk mirror are in daily use. Serene's own tickets are
built and running (intake proposes cards from the chats every minute) but the floor still works its
tickets in Freshdesk. Not built: the Freshdesk cutover, and the bridge from a won Gia deal to a
member record (`gia.deals.member_id` exists and is never set).

| Layer | Status | Owning doc |
| --- | --- | --- |
| WhatsApp group archive (the Baileys watcher on AWS Fargate) | Live since 2026-08-27. About 160,000 messages in 516 groups by 2026-09-19; history back to 2023-08 | `docs/integrations/sia-connector.md` |
| `/sia` page (read-only WhatsApp-Web-style viewer + admin console) | Live | `docs/pages/sia.md` |
| Queendoms and seats | Live (seats 0201, many bishops 0242, own seat pinned 0243, Joker head 0244) | `docs/modules/sia.md`, `docs/architecture/auth-and-rbac.md` |
| Member spine and group links | Live. 614 members loaded 2026-09-15; 401 groups linked on 2026-09-18 | `docs/modules/members.md` |
| The member twin (facts, people, profiler, health, pulse, judgement, vault) | Live | `docs/modules/members.md`, `docs/pages/members.md` |
| Serene tickets (board, sentinel, intake, training loop) | Built and running; not yet the floor's main tool | `docs/modules/tickets.md`, `docs/pages/tickets.md` |
| Vendors | Live, open to the whole concierge domain since 2026-09-18 | `docs/modules/vendors.md` |
| Freshdesk mirror + `/freshdesk` | Live, synced every minute | `docs/integrations/freshdesk.md` |
| Zoho Books (member finance page, `/books`) | Live, read only | `docs/integrations/zoho-books.md` |
| Elaya on the floor (member, group, Freshdesk, ticket, vendor tools) | Live on both brains | `docs/modules/elaya.md`, file `5-elaya-jarvis.md` |
| Freshdesk contact-notes import | Done 2026-09-24 (369 contacts parked) | `docs/data-imports/freshdesk-contact-notes.md` |

---

## 2. How the floor is organised

### Queendoms

A queendom is one concierge team with its own members. There are three, seeded by migration 0194
in `sia.queendoms`: `anishqa`, `ananyshree`, `sanika` (`QUEENDOM_SLUGS`). Each row carries
`freshdesk_group_id`, the Freshdesk group that queendom works in. A member belongs to one queendom
(`member.members.queendom_id`), and the whole queendom sees that member. That one rule drives
members, WhatsApp groups, Freshdesk, tickets and Elaya's answers.

### Seats

A seat is a position on top of the platform role, stored in `profiles.sia_role` and
`profiles.queendom_id`. Only `concierge`-domain accounts can hold one (0201 CHECK). The account
forms derive and lock the platform role from the seat (`SIA_ROLE_PLATFORM_ROLE`,
`components/admin/RoleDomainFields.tsx`).

| Seat | Platform role | Queendom | How many |
| --- | --- | --- | --- |
| `queen` | manager | one | one active holder per queendom |
| `bishop` | manager | one | many (0242 dropped the one-bishop index) |
| `genie` | agent | one | many |
| `joker` | agent | one | one active holder per queendom |
| `joker_head` | manager | none (company-wide) | one active holder in the company (0244) |

Rules, all enforced in the database:

- A queendom seat must name its queendom; the Joker head must not (0244 CHECK).
- **Nobody can change their own seat or queendom** (0243 pins both on the self branch of
  `profiles_update`). Only admin and founder seat people, on the Team page (`/admin/users`).
- `isCompanyWideSeat(profile)` (`constants/sia-roles.ts`) is THE test for company-wide reach. It
  keys on the seat, never on an empty `queendom_id` (every non-concierge account has an empty one).
- Seat reads return `bishops[]`: `getQueendomSeats()` (`services/queendom-seats.ts`, sessionless,
  used by the sentinel and intake) and `getQueendomRoster()` (`profiles-service.ts`, pages).
- **Open:** seat changes are not written to `profile_audit_log`.

The whole company was onboarded from the roster on 2026-09-26 by `scripts/admin/onboard-roster.ts`
through `createStaffAccountCore()` (the one account-creation core).

### The concierge nav

Routes in `DOMAIN_ROUTE_MAP.concierge`: `/tasks`, `/members`, `/tickets`, `/sia`, `/freshdesk`,
`/vendors`. A seated teammate's sidebar shows Dashboard, Elaya, Members, Tasks, Vendors, Notes, Sia,
Freshdesk. `/tickets` is reachable but not listed (the floor arrives from Sia and notifications);
`/helpdesk` is hidden; `/settings` left the concierge map on 2026-09-25. The concierge dashboard is
My Tasks and Elaya only. Elaya is on for concierge (`ELAYA_DOMAINS`).

---

## 3. Who sees what (the queendom boundary)

**One fact decides it: `profiles.queendom_id` plus the seat, re-read from the database on every
request.** Every layer derives from it:

| Layer | What enforces it |
| --- | --- |
| Database (session reads) | `public.can_access_member_queendom(queendom)` and `public.member_visible(member_id)` in the RLS of every member table, `sia.tickets` and its family, and intake cards |
| Services on the admin client (no RLS) | `canAccessMember(principal, memberQueendomId)` (`lib/elaya/access.ts`) before any member read or write; `getSiaViewerScope()` + `canViewSiaGroup()` + `pinnedFreshdeskGroup()` / `pinnedGroupFilter()` (`services/sia-access.ts`) before every Sia and Freshdesk read. A group's queendom is always read from the database (`wag_groups.member_id` → `members.queendom_id`), never from the browser |
| Pages | the queendom filter only for admin, founder and the Joker head; `/sia` and `/freshdesk` ask `getSiaViewerScope()` |
| Elaya (both brains) | every member, group, Freshdesk and ticket tool re-reads the seat at call time; a name outside the seat answers "outside your seat" and nothing more |
| Alerts | the sentinel and intake pick recipients per queendom seat |

| Viewer | Sees |
| --- | --- |
| Seated queen, bishop, genie, joker | Their own queendom only: its members (money included), the WhatsApp groups linked to those members (read only), the queendom's Freshdesk group, its tickets and suggestions. No leads, no Sia console, no company books |
| Joker head | A queen's reach in every queendom. Never the internal or unlinked groups, other Freshdesk groups, or the console. Vault as a list only (`canUseMemberVault` false). No member money (`canSeeMemberFinance` false; `withoutMemberMoney()` strips figures on the server). No ticket alerts |
| Concierge account with no seat | Nothing concierge: sent home from `/sia` and `/freshdesk`, empty member and ticket lists (it can still use the vendor pages, whose audience is the domain) |
| Admin, founder | Everything, plus the Sia console, group mapping, Freshdesk "Sync now" |
| Tech workbench (domain `tech`) | `/sia` and `/freshdesk` as "all"; member and ticket pages open but RLS shows no rows; console, mapping and Sync now render but their actions refuse (admin/founder only) |

Two founder-role accounts sit in the concierge domain and so bypass every scope; that is a founder
decision (2026-09-25), not a bug.

**Open gaps (in `docs/TODO.md`):** `linkMemberGroupAction` checks only that the caller can see the
member, not their role or the group's queendom (a seated teammate calling it directly could pull
another queendom's group into their scope); ticket priority approval is enforced only in the page.

---

## 4. The WhatsApp archive (the watcher)

**The operating rule, first:** Sia is mission-critical. Never experiment on the live WhatsApp
session (`sia.wag_auth_state` is production data). If the watcher wobbles: **freeze** (scale the
service to 0 or leave it), **audit read-only**, **let a human decide**. This comes from the
2026-08-27 incident, when pairing experiments corrupted the session and capture went down.
**Exactly one process may hold the session at a time**; two sockets can log the number out.

| Fact | Value |
| --- | --- |
| What | A Node/TypeScript service (`connector/`, Baileys `7.0.0-rc14`) linked as a companion device to a dedicated WhatsApp number that sits silent in member, vendor and internal groups |
| Where | AWS ECS Fargate via Copilot: app `serene`, env `prod`, service `watcher`, `ap-south-1`; 512 CPU / 2048 MB, arm64, one task, `rolling: recreate` (old task stops first) |
| State | None on disk. Session in Postgres (`sia.wag_auth_state`, 0174); media in a private, encrypted, versioned S3 bucket |
| Never sends | No send call anywhere in `connector/src/`; `markOnlineOnConnect: false`; only `@g.us` group chats are read |

**How it works.** Socket handlers only enqueue and return. A drain loop writes every event
**raw first** to `wag_raw_events`, then normalizes into `wag_*` rows in batches of 50. A message's
identity is WhatsApp's triple `(chat_jid, wa_message_id, sender_jid)` plus `wa_timestamp`; every
write is an upsert on it (the dedup wall), so redeliveries and history overlap land once. Facts
never mutate: an edit is a new row chained by `edit_of_wa_message_id`, a delete flips `is_revoked`.
**Crash-only:** any disconnect exits the process, ECS starts a fresh one, the session resumes from
Postgres, WhatsApp redelivers the gap. No in-process reconnect.

**Tables (schema `sia`, service-role only, no user policy):** `wag_raw_events` and `wag_messages`
(monthly partitions to 2027-03 plus a default; `sia.wag_add_month_partition()` adds months),
`wag_media` (`pending → done`, or `retrying → dead_letter`, or `expired`), `wag_reactions`,
`wag_receipts` (empty by design: receipts only come for messages you send), `wag_groups`
(`group_kind` member / vendor / internal / unmapped, `is_active`, `member_id` set by Serene, never by
the watcher), `wag_group_members`, `wag_contacts` (`jid`, `lid`, `phone`, `participant_role`,
`staff_profile_id`, `member_id`), `wag_auth_state`, `wag_watcher_status` (the heartbeat),
`wag_pipeline_cursors` (unused).

**Hidden ids.** WhatsApp addresses group members by privacy ids (`@lid`). The watcher stores every
lid/phone pair it is given (participant metadata, history `lidPnMappings`, the live
`lid-mapping.update` stream) on `wag_contacts`. A lid with no pair shows "Not synced yet".

**Pairing.** QR only (pairing codes retired). Normal path: Sia → gear → Session, scan the QR the
console shows (published in `wag_watcher_status.qr`, 0177). **Re-pair session** wipes and restarts;
**Restart watcher** keeps the session. Both admin/founder only. Fallback from a terminal:
`connector/RUNBOOK.md`. On `loggedOut` the watcher wipes the session and exits, so the next boot
shows a fresh QR.

**Media.** Live media downloads while keys are in memory, then uploads to S3. A backfill drip
retries old rows on every connect (first full drain 2026-08-30: 12,580 recovered, 2,345 expired).
The app presigns two 15-minute S3 links per view (`getSiaMediaPayload`) with a read-only IAM
identity in `SIA_S3_*` variables.

**The heartbeat and alarm.** The watcher beats `wag_watcher_status` every 60 seconds.
`src/trigger/sia-silence.ts` (task `sia-silence-watch`, every minute) raises one condition at a
time: `down` (3 minutes without a beat), `session_lost` (at once on logout, 15 minutes unpaired),
`unreachable` (15 minutes stuck connecting), `quiet` (6 hours with no events). The first alert
goes to a named list of tech responders (`SIA_ALERT_TIER1_PROFILE_IDS`, `constants/sia-alerts.ts`)
in-app, by push and on WhatsApp (the Gupshup "Sia alert" template, deliberately not gated by
preferences), with a reminder every 10 minutes (a Redis latch); founders join after one unresolved
hour; recovery is announced once. TODO (from the docs): confirm the `GUPSHUP_*` variables are set
on the Trigger.dev worker, or the WhatsApp leg fails quietly.

**The staff phone link.** The founder's rule (2026-09-22): the company phone joins the groups, the
email signs in to Serene, so the phone ties the two. `linkStaffContactsByPhone()`
(`services/sia-staff-link.ts`, every 15 minutes, task `sia-staff-link`, plus "Link now" on a user's
page) sets `wag_contacts.staff_profile_id` and the `participant_role` from the seat, links hidden-id
rows through the lid pairing, clears links of gone accounts. Elaya, the profiler, the waiting-for-
reply read and the pulse all use it to tell staff from the member side. **A blank `profiles.phone`
breaks this and turns that person's WhatsApp messages to Elaya into a new lead.**

### The `/sia` page

A reader, never a sender (no compose box). WhatsApp Web anatomy on Serene surfaces: a rail of
groups (sorted by last message, kind chips, "No member" filter for admin/founder), the chat (keyset
pages of 60, seamless history, reply jump, deep links `?group=<jid>&message=<id>` built by
`siaGroupHref` / `siaMessageHref`), full-text search, media, a group info panel (linked member,
roster with an **Indulge** badge on staff), and "Create a ticket from messages" (select messages,
hand off to `/tickets/new` via `sessionStorage`). The live tail is a **4-second poll through a server
action**, not Realtime, because the `wag_*` tables have no user policy. Admin and founder get the
console (`SiaControlModal`): health, media pipeline, Session (QR, Restart, Re-pair), group mapping.
Every read action re-checks the group with `canViewSiaGroup`. Spec: `docs/pages/sia.md`.

---

## 5. Members (the member twin)

**The rule: facts are rows, scores are computed.** The spine holds identity and join keys; every
other piece of knowledge is a row with a source, a confidence and evidence, and every number a
person sees (health, activity, the judgement) is derived.

**The spine** is `member.members`, one row per membership (a couple is one member with two people
under it). History: `public.clients` (0181, 2026-09-04) → queendom and join keys (0194) → renamed
`members` (0202, 2026-09-17) → moved to the `member` schema (0211, the same afternoon). Old
`/clients` links redirect to `/members`. Columns worth knowing: `primary_phone` (unique, E.164),
`queendom_id` (the access boundary), `tier` (premium, celebrity, genie, standard, monthly_trial),
`membership_status` (Active, Expired, Trial), dates and `membership_amount_inr`, join keys
`freshdesk_contact_id`, `zoho_customer_id`, `app_member_id`, `wa_group_jid` (a **mirror** kept by a
trigger from `sia.wag_groups.member_id`, 0217, never written by code), `identity_status`, `sources`,
`import_raw`, `consent` (reserved for DPDP, unused). Dynamic data (address, city, email) is never a
column; it is a fact.

**The stores (schema `member`, reached with `memberDb(client)`):**

| Table | Holds |
| --- | --- |
| `member_people` | the humans under a membership (primary, spouse, child, staff, ...) with `can_request` |
| `member_facts` | typed facts, **append-only**, with source, confidence, evidence, `observed_at`, `superseded_by` |
| `member_relations` | the relationship map (person, vendor, place, venue, brand, interest), strength and evidence count; written only by `upsertMemberRelation` |
| `member_events` | the timeline, monthly partitions to 2027-03 |
| `member_anticipations` | "coming up": occasion, renewal, pattern, follow_up, trip, silence |
| `member_snapshot` | one jsonb per member: `pulse`, `assessment`, reserved `narrative` |
| `member_health_policy`, `member_health_events` | the 15 health signals, and the append-only health ledger |
| `member_access_log` | every open of a member, finance or ticket help page (append-only, the DPDP trail) |
| `member_vault`, `member_vault_access` | encrypted cards and IDs, and their trail |
| `member_documents`, `member_chunks` | tables only (`vector(1024)`), nothing writes them |
| `members_list` (view, 0241) | the spine plus pulse and judgement as sortable columns |

Vocabulary: `constants/member-facets.ts` (facets identity, address, family, dietary, preference,
interest, occasion, travel, budget_signal, contact_rule, note; SQL CHECKs mirror it).

**How facts get in.** The 2026-09-15 seed (6,757 facts over 493 members from Atlas, Typeform,
Freshdesk contact fields and the sheets); the **Observation box** (a teammate writes free text, a
routing-tier reader files up to 12 facts and 8 relations and keeps the sentence as a note; fails
closed for facts, open for the note); a **correction** (double-click a value; the correction is a new
row that supersedes the old ones); the **chat profiler**; the one-off **Freshdesk contact-notes
import**. There is no "add a fact" form. Confidence ladder so a machine never outranks a person:
a person's correction 1.0, the Observation reader 0.9, seed imports 0.9, the profiler capped at
0.85 (below 0.5 dropped). Agreeing sources collapse to one line on read.

**The chat profiler** (`services/member-profiler.ts`). Reads each **linked** member group of an
**Active** member, one finished conversation at a time (six quiet hours end one), and files facts,
people, relations, one timeline line (summary and tone) and coming-up items. **Names never reach the
model:** per-group code names (`sia.codenames`: MEMBER, STAFF_n, VENDOR_n) via `openVault()`, plus
`maskPii`, plus a leak check that stops the reading. Reasoning tier, low effort, prompt
`profiler-v1.1`; every call is a `sia.extraction_runs` row. A failed reading writes nothing and does
not move the bookmark; three failures on one conversation step over it; provider outages never count.
Runs every 10 minutes (`member-profiler`), switch `member_profiler_enabled` (off unless exactly
`true`; on since 2026-09-21, 67% of history read then, TODO verify finished). Ticket intake also
calls `profileGroupNow()` to flush a group before drafting a ticket.

**Health** is one number, 0 to 100, since 2026-09-26: **Serene's latest judgement as the base, plus
every health signal logged after it, each fading by its half-life** (70 before any judgement).
`computeHealthScore()` is the one formula. Bands: under 50 "Needs care", 50 to 74 "Steady", 75 up
"Happy". Only three signals have writers today (complaint -12, praise +5, frustration_tone -4, all
from ticket intake at 75% confidence or more, at most once per member per 24 hours) plus the Health
card's `manual_adjust` (-20 to +20 with a note). A signal of |delta| ≥ 10 queues a fresh judgement.

**The pulse** (0241): `member.compute_member_pulse()` computes plain activity numbers for every
member in one SQL statement (last message from the member side, messages both ways in 30 days,
requests in 90 days across Freshdesk and Serene tickets, open and escalated, last contact, and an
`activity_score` 0 to 100). Hourly at :07 (`member-pulse`), about 7.5 seconds for 614 members.

**Serene's judgement** (`assessMember`, 0241): one reasoning-tier read over the masked last 180 days
(facts, requests with reply and resolve hours, timeline, signals, coming up, pulse, membership)
returns score, engagement, satisfaction, value (0 to 100), risk (low / watch / high shown as
Settled / Watch / At risk), a verdict, strengths, concerns and next actions with evidence, and a
confidence. Plain text by field, never JSON. Every active staff name is masked to STAFF too.
Weekly on Sunday 04:00 IST (`member-assessment-weekly`, switch `member_assessment_enabled`, on
unless `false`) and on demand ("Assess now"). About ₹2 to ₹3 a member; all 348 Active members were
judged on 2026-09-26 for about ₹700.

**The vault** (0236). Members' cards, passports, Aadhaar and PAN, used to book on their behalf.
AES-256-GCM in the app with a key only in `MEMBER_VAULT_KEY` (never the database), the member id
bound as authenticated data, rotation via a version and a previous key. **No RLS policy for
signed-in users at all**: only the service role, behind gated actions. In the clear: a label, the
last four, an expiry month. A reveal asks why, writes the trail row **before** decrypting, and shows
the secret for 60 seconds. Never part of any dossier, tool result or prompt. Add and reveal: anyone
who can see the member except the Joker head; remove: admin/founder (a real delete; the trail
remains). Some cards were imported with the CVV, by founder decision; written card-on-file consent
is not recorded anywhere.

**The WhatsApp group link.** Truth is `sia.wag_groups.member_id`, written only through
`updateSiaGroupMapping` (the Sia panel, the member page's WhatsApp card, the mapper script). Links
came from the importer's three-signal matcher (207 on 2026-09-04) plus founder-reviewed batches (134
by name, 58 orphans). On 2026-09-18: 401 groups linked, 213 members with no group (69 Active), 64
member-type groups unlinked. TODO: verify today's counts.

**Money.** Two layers, one gate. Serene holds the membership amount and money events on the
timeline (`MONEY_EVENT_KINDS`: payment, invoice, renewal; nothing writes them yet). Zoho is read live
on `/members/[id]/finance` (section 9). `canSeeMemberFinance` is the one place to narrow money:
everyone who can see the member except guests and the Joker head.

**Pages.** `/members` (list over `members_list`, sorted Most active by default, filters for search,
queendom, tier, status, health, not-linked, sort; 50 a page), `/members/[id]` (identity and team,
Health, WhatsApp, "Why the health score is what it is", Observation, Essentials and Preferences,
Requests (Freshdesk only today), Activity, People, Cards & documents, App, Money, Relationships,
Coming up, In a few words), `/members/[id]/finance`. Every open is logged. Spec:
`docs/pages/members.md`.

**Not built:** the member-app feed, money events, the won-deal to member bridge, documents and
embeddings, the narrative writer, most health-signal writers (SLA, reopen, renewal, silence), marking
coming-up items done, per-person tagging inside a shared group, the `consent` column.

---

## 6. Tickets (Serene's own)

A ticket is one member request the team works until it is done. Built alongside Freshdesk (founder,
2026-09-15) so the team can move over once it has proved itself. **The founder's rule over all of
it: Serene does the work, a human makes the call.** Nothing creates, moves or approves on its own,
except one thing: the sentinel closes a resolved ticket after 48 quiet hours.

**Where it stands (from the changelog):** in the week to 2026-09-25 intake read 4,090 chat bursts and
proposed 824 cards (129 open); no card had been accepted or dismissed yet, so the training loop had no
verdicts. TODO in the docs: verify current ticket and verdict counts.

### The five moving parts

1. **The ticket** (`sia.tickets`, numbered `T-000001`), written only through two RPCs,
   `sia.create_ticket` and `sia.apply_ticket_change`, which save the row and its diary event in one
   transaction. No user write policies. The diary is `sia.ticket_events` (append-only, monthly
   partitions to 2027-12). `sia.ticket_message_links` ties WhatsApp messages to a ticket.
2. **The sentinel**: one small watcher per ticket (identity = the row, memory = `sentinel_state`,
   alarm = `next_wake_at`, mailbox = triggers that wake it on any new event or message link).
3. **Intake**: a sweep that reads member groups every minute and proposes tickets as **cards**
   (`sia.intake_proposals`). A human creates or dismisses every card.
4. **The drafter** (`draftTicketCore()`, `services/ticket-draft-core.ts`): the one place chat
   becomes a ticket draft. Two callers: the New ticket form (a genie selected messages in Sia) and
   intake.
5. **The training loop**: every human verdict on a machine draft is kept (`sia.draft_reviews`) and
   turned into written lessons (`sia.intake_lessons`) that reach a prompt **only after the founder
   approves them**.

### State machine (`constants/tickets.ts`, enforced only in `moveTicketStatusCore`)

Ten statuses: `proposed`, `open`, `sourcing`, `awaiting_member`, `awaiting_vendor`, `in_delivery`,
`payment_due`, `resolved`, `closed`, `dropped` (Freshdesk's meanings named for who waits on whom).
Live work = open through payment_due; terminal = resolved, closed, dropped. The SLA clock stops in
proposed, awaiting_member, in_delivery, payment_due and the terminal states (copied from
Freshdesk's own flags). **`awaiting_vendor` needs a vendor**: the core refuses it without one, and the ticket page
asks for one instead. Ending a ticket stamps `closed_at` and a resolution (delivered,
cancelled_by_member, could_not_source, duplicate, not_a_request). Status labels can be renamed in
settings; the machine never changes. Categories come from Freshdesk's tree (travel, dining, retail,
events, special_request, itinerary, recommendations, staff_hiring) with sub-categories, 21 typed brief
fields, and a checklist template per category. Money fields are INR only (quote, cost, price,
payment status, invoice no); Zoho stays the ledger.

### SLA policies and the sentinel

The sentinel is the SLA engine; there is no timer table. `sia.ticket_sla_policies` rows have a scope
(queendom, category, sub-category, priority; null = every) and five clocks in minutes (first
response, update cadence, vendor silence, member silence, resolve target), business hours (Mon to Sat
09:00 to 19:00 IST) and an escalation ladder to bishop / queen / founder. The most specific active
row wins **whole** (no merging), which means the seeded watch and bag rows (48-hour resolve) have no
ladder and never escalate (open item). A person-created ticket approves its own priority, so its SLA
starts at once.

**The rule pass** (`planWake()`, pure code, each rule fires once per key, the state written in the
same transaction as the event): first response warning and breach, the ladder, update cadence,
vendor silent, member silent, requested time passed, resolve warning (60 minutes before) and breach,
and the 48-hour close. **The reading pass** (routing tier, masked, only on new human notes or linked
member messages, a 60,000-token budget per ticket, prompt `sentinel-read-v2`): a summary, checklist
ticks, money figures where empty, a proposed brief change (never applied), the member's tone, "where
is my order", and **the judgement**: a `suggested_status` (only a move the machine allows, never
closed, open or proposed) shown on the ticket page with exactly two actions, Approve (an ordinary
human move) and Dismiss (kept as an event). Runs every minute (`ticket-sentinel`, no switch) and
reactively after every ticket write (`wakeTicketNow` inside `after()`).

### Intake (`services/ticket-intake.ts`, cheapest step first)

Only linked member groups of Active members with something new → settled bursts (20-minute gaps,
45 seconds of quiet) → skip bursts with no member message, only acknowledgements ("ok thanks"), or
messages already on a ticket → **one classifier call** (routing, low effort, prompt `intake-v1`:
request / update / question / feedback / chatter, confidence, tone, summary) → a health signal from
the verdict → a card only for a request, or an update naming an open ticket, at confidence 0.6 or
more → the profiler flush → the draft (requests only) → the card, and the queendom's bishops (else
the queen, else genies) are notified. Names go through the profiler's vault. Every call is a run
row. Cards nobody touches for 24 hours expire. Task `ticket-intake` every minute; switch
`ticket_intake_enabled` (off unless `true`; switched on in production). A card's two actions:
**Review and create** (opens `/tickets/new?proposal=<id>` filled from the stored draft, no second
model call) or **Add to T-000123** for an update; **Dismiss** needs a reason.

### The training loop

`recordDraftReviewCore()` writes one `sia.draft_reviews` row per human decision (sources
`intake_card`, `ticket_creator`, `sentinel`; decisions accepted / edited / dismissed) with the draft,
the final, every change as `{field, from, to}` (`diffDraft()`, `utils/draft-diff.ts`), the reason and
the human's own words. The New ticket form asks "What did Serene get wrong?" only when something
differs. The lesson writer (`writeLessonDraft(kind)`, reasoning tier, members masked to `MEMBER_n`,
plain-text reply, writes nothing below 10 new verdicts) produces one draft per kind (intake,
ticket_creator, sentinel). The founder edits, approves or discards on `/settings/tickets`;
`lessonPromptBlock(kind)` folds only the approved lesson into the three prompts and adds `+L<version>`
to their prompt version, and a scoreboard splits verdicts by prompt version. Weekly on Monday 06:00
IST (`intake-lessons-weekly`, switch `intake_lessons_enabled`, on unless `false`) plus a "Write a
lesson now" button.

### The vendor on a ticket (`services/ticket-vendor.ts`)

Suggestions come from THE one vendor ranking with the ticket's own words, city and member (never
re-ranked). Choosing a vendor puts `vendor_id` on the ticket and opens a job on the vendor's ledger
(`source = ticket`, `source_ref` = the ticket number). Ending the ticket closes the job with the
outcome the resolution implies and the cost from the Money card, inside `moveTicketStatusCore`, so
every path (a person, Elaya, the sentinel) feeds the vendor score. After resolving, one review per
ticket (speed, quality, pricing, reliability). This is the only vendor review form in the app.

### Screens, access, notifications

- `/tickets`: the "Suggested by Serene" strip (cards grouped per member; the week's training numbers
  for admin/founder) above the list (filters: search, status, queendom, genie, category, tag, Mine;
  50 a page). `/tickets/new`: one form, three ways in (a card, a Sia selection, by hand), with
  `SiaMessagesPeek` showing the real WhatsApp bubbles the request rests on. `/tickets/[id]`: the
  workbench (status controls, brief, checklist, money, the member's words, timeline, sub-work, the
  Sentinel card, the Vendor card, tags, the member help window). `/tickets/board`: eight live
  columns over Realtime on `sia.tickets`, drag to move (or a "Move to" menu on touch).
  `/settings/tickets`: SLA policies, status names and tags, lessons. Spec: `docs/pages/tickets.md`.
- Access: RLS via `can_access_member_queendom()`; every action re-checks `canAccessMember`; the
  queendom filter is for admin, founder and the Joker head. Listed in the nav for admin and the tech
  workbench only (hidden for founder and concierge; reached by link). Settings writes are
  admin/founder.
- Notifications: in-app and Web Push only (no WhatsApp sender for ticket alerts yet):
  `ticket_assigned`, `ticket_proposed`, `ticket_sla_warning`, `ticket_sla_breach`,
  `ticket_member_replied`, `ticket_member_unhappy`. `ticket_daily_digest_founder` exists with no job.
- Tasks spun off a ticket are normal personal tasks linked through `public.task_ticket_meta`, tagged
  `ticket` (module stays `core`).
- Elaya: `list_tickets`, `get_ticket` (reads), `add_ticket_note` (inline), `move_ticket_status`
  (propose then confirm).

**Not built:** the scored genie picker (`sia.genie_roster` is unused), proposed tickets (the Proposed
column is dormant), the daily digest and WhatsApp ticket alerts, the member-update drafter, card
approval from WhatsApp, linking messages to an existing ticket from the Sia chat, the Freshdesk cutover
and history import, autonomy. **Open:** priority approval trusted from the page; two payment-status
vocabularies (Money card vs sentinel); the board ignores every filter but the queendom.

---

## 7. Vendors

About **21,600 suppliers and 46,000+ past jobs**, distilled from the Freshdesk archive (loaded
2026-09-11: 21,580 vendors, 25,596 capabilities, 46,574 jobs, 4,977 invoice files) and kept current by
a live extractor. Tables live in `public` (not moved by the schema restructure). **Facts are rows,
scores are computed** on every read.

| Table | Holds |
| --- | --- |
| `vendors` | the spine: name (`name_key` unique), aliases, category (free text), status (active / paused / blacklisted), contacts jsonb, `identity_status` (unverified / verified), `sources`, `import_raw`, `deleted_at` (hidden, 0227) |
| `vendor_capabilities` | offers / declines per request category, service and cities; a `declines` row hard-excludes |
| `vendor_engagements` | **the ledger**, one row per job, unique `(vendor_id, source, source_ref)`; append-only with two sanctioned writes (close once; refine a repeat of the same ticket) |
| `vendor_reviews` | append-only, four 1 to 5 dimensions (speed, quality, pricing, reliability) |
| `vendor_notes` | append-only team notes |
| `vendor_agent_preferences` | one teammate's sticky note: preferred / avoid + why |
| `vendor_merges`, `vendor_removals` | append-only trails of every merge and removal, with the row in full |
| `vendor-invoices` bucket | private; one-hour signed URLs per click |

**Access:** pages `hasVendorAccess` (admin, founder, the whole concierge domain, the tech workbench
page-only); actions and Elaya `hasVendorActionAccess` / `canAskAboutVendors` (the same minus the
workbench); SQL `can_access_vendors()` (0221) on every SELECT policy. Pause/blacklist, merge and
remove/restore are admin/founder only; "Looks right" (verify) is open to everyone with access.

**The score** (`computeVendorScore()`, pure, 0 to 10): volume 2.5, recency 1.5, reliability 2.5,
reviews 2.5, sentiment 1.0, over a 12-month job window. A component with no data is dropped, never a
fake neutral. The displayed score stays null (an em dash) until the vendor has a review or a job with
a decided outcome. `vendorFlags()` adds cautions (failed jobs, "N teammates marked avoid", "Identity
not yet verified").

**The ranker** (`rankVendorsForRequest()`, the only ranking; used by `/vendors/find`, the ticket page,
Elaya's `find_vendors` and the MCP connector): a routing-tier read of the request into category,
service, city and search terms (display only, never filters; fails open) → a search of past job
titles weighted by rarity (words in over 5% of titles dropped, at most five words) with category and
service as boosts, city as a filter → a capability fallback → "a search that died is not a search
that found nothing" (`callAdminRpcChecked`, the rows say so) → title matches outrank usage → the
asking teammate's own avoid removes, own preferred boosts → top N with reasons.

**The live extractor** (0214, every 5 minutes, `vendor-extract`, no switch): reads unread notes off
the Freshdesk mirror (`freshdesk.conversations.vendor_extracted_at IS NULL`, fewer than 3 attempts),
one routing-tier call per note **with its bills and images as files** (supplier names are often only
on the bill; bill images go unmasked, a founder-approved exception), phones swapped for
placeholders before `maskPii`. Matching in tiers, each a fact: a phone unique to one vendor, then an
exact name or alias, then a close name only when long and distinctive; never fuzzy on short or
person-shaped names; near misses are flagged, never merged. Writes through the same cores as the UI,
born `unverified`. Fails closed. A settle pass closes open jobs when the mirrored ticket is Resolved
or Closed. About 20 paise a note, roughly ₹3,300 a month.

**Keeping the book clean:** a "Needs a look" queue on `/vendors` lists unconfirmed extractor rows.
Three answers: **Looks right** (verify, one way), **Merge in** (one transaction, `merge_vendors`;
the shortlist offers facts only, never fuzzy matches; the loser's name becomes an alias; old ids
redirect to the keeper), **Remove** (`remove_vendor`: a vendor with no history is deleted, one with
history is hidden via `deleted_at`, because its jobs record money that moved).

**Pages:** `/vendors` (list, "Needs a look", filters, 30 a page), `/vendors/[id]` (identity and
score cards, your take, notes, invoices, admin actions), `/vendors/find` (one search card, one "Best
matches" card).

**Not built:** UI for pause/blacklist, capability editing, manual job logging, a review form on the
vendor page; Sia's vendor WhatsApp groups do not feed vendors yet. **In progress:** migration 0245
(committed, not applied) adds `vendors.kind` (`human` / `agent`) for the hands plan
(`docs/architecture/hands-plan.md`).

---

## 8. The Freshdesk mirror

Freshdesk is where the floor runs tickets today. Serene keeps a **read-only** copy so it can learn
how tickets move, join them to members and the WhatsApp archive, and keep a change history Freshdesk
does not expose. **Serene never writes ticket data to Freshdesk** (the only write ever made was the
one-time script that registered two "Serene mirror" webhook rules).

| Fact | Value |
| --- | --- |
| Account | `indulge.freshdesk.com`, REST v2, Basic auth |
| Rate limit | 400 calls a minute for the account and 100 a minute on ticket endpoints, shared with the member app (was 50 before 2026-09-18). The mirror budgets 80 calls a cycle and stops at 15 remaining |
| Size | About 51,000 live tickets (#415 from 2024-01-30 onward), about 150 new a day; 12 groups (the three queendom groups plus Bishop, Concierge, Finance and Billing, Global Events, Indulge Shop, Jokers, Management, Queendom, Retail) |
| Statuses | 2 Open, 3 Pending, 4 Resolved, 5 Closed, 6 Nudge Client, 7 Nudge Vendor, 8 Ongoing Delivery, 9 Invoice Due, 9000 Assigned to AI Agent |

**Schema `freshdesk`** (0193; service-role only, RLS on with no user policy; code reaches it through
`freshdeskDb()`): `tickets` (current state, `member_id` resolved by contact id then phone),
`conversations` (notes and replies, attachments, the vendor extractor's queue columns), `contacts`,
reference tables (`agents`, `groups`, `ticket_fields`, `sla_policies`, refreshed every 6 hours),
`ticket_changes` (**append-only movement history**: one row per tracked field that changed between
two reads), `webhook_events`, `sync_state`, `sync_runs`.

**The sync** (`services/freshdesk-sync.ts`, task `freshdesk-sync` every minute, one at a time, a
30-second budget, skips a late start): reference refresh → poll by `updated_since` watermark (the truth
path; upsert, diff into `ticket_changes`) → thread pulls → file backlog → contacts → backfill. The
webhook (`/api/webhooks/freshdesk`) only shortens the delay: it stores the event, acks, and re-reads
the ticket in `after()`. `fdComparable()` is the one comparable form of a tracked value (a due date
compares as an instant; a text compare once logged about 24,500 false changes, kept, hidden by the
page). Files are copied into the private `freshdesk-attachments` bucket on every thread pull, because
Freshdesk's links die within hours (history about 63,000 files, 13 GB). History came from the account
export (50,312 tickets, 209,153 notes), loaded by `scripts/freshdesk/load-export.py`.

**Pages:** `/freshdesk` (overview strip from one RPC scan, filters, dense table, `?member=<id>` scoping)
and `/freshdesk/[id]` (thread with files, movement timeline, summary). **Who sees them:** admin and
founder all plus Sync now; the tech workbench all (Sync now refuses); a seated teammate **pinned on the
server** to their queendom's Freshdesk group; the Joker head the three queendom groups; anyone else is
sent home. A ticket outside the viewer's groups answers "not found".

**Who else reads the mirror:** the member page's Requests card, the ticket help window and intake's
"free exam" (did Freshdesk also get a ticket for this suggestion?), the vendor extractor, the member
judgement, Elaya's three Freshdesk tools and `get_member_360`, and the analyst layer (pulse, brief,
alerts). **Invariant:** the conversation upsert must never include `vendor_extracted_at`, or every note
re-queues for the extractor.

---

## 9. Zoho Books and member money

Serene reads Zoho Books (the company ledger, organisation PRICETIME TECHNOLOGIES PRIVATE LIMITED,
India data centre, REST v3, OAuth refresh-token flow) **live and read only. Nothing from Zoho lands in
Postgres**; Redis holds copies for minutes. `zoho-api.ts` is the only client (one token refresh at a
time; every read carries a budget of at most 25 calls and never goes below a reserve of 500 of the
organisation's 10,000 calls a day, shared with the member app).

| Read | Used by | Cache |
| --- | --- | --- |
| `getBooksOverview()` (12 to 16 calls) | `/books` (admin and founder only; the tech workbench is blocked), Elaya's `get_books_overview`, the founders' brief | Redis 5 minutes |
| `getMemberFinance(zohoCustomerId)` (4 calls) | `/members/[id]/finance`, Elaya's `get_member_finance`, the money part of `get_member_360` | Redis 1 minute |

**The member finance page** first shows what Serene holds (membership amount, status, dates, money
events), then streams `MemberZohoCards`: Outstanding, Invoiced, Paid, Unused credits, the Zoho customer
record (including the `cf_queendon` custom field shown as "Queendom (Zoho)"), invoices, payments and
credit notes, and a Refresh. Gate: `canAccessMember` then `canSeeMemberFinance` (the Joker head is
redirected to the member page). Credentials: four `ZOHO_*` variables on Vercel and on the Trigger.dev
worker (TODO in the docs: confirm they are on the worker, or the brief skips money).

---

## 10. Model calls and background jobs on the concierge side

Every call goes through the Elaya provider layer (`resolveLlmForJob`), so the model behind a tier is a
database row. None of them sends a real name to a model.

| Call | Tier | Prompt | Fails | Switch |
| --- | --- | --- | --- | --- |
| Observation reader | routing | `observation-v2` | closed for facts, open for the note | none |
| Chat profiler | reasoning, low effort | `profiler-v1.1` | closed | `member_profiler_enabled` (off unless true) |
| Member judgement | reasoning, low effort | `member-assessment-v1` | closed | `member_assessment_enabled` (on unless false) |
| Intake classifier | routing, low effort | `intake-v1` (+ lesson) | closed | `ticket_intake_enabled` (off unless true) |
| Ticket drafter | reasoning, low effort | `ticket-draft-v3` (+ lesson) | closed (the form is filled by hand) | via intake or the form |
| Sentinel reading | routing | `sentinel-read-v2` (+ lesson) | closed to rules only | none |
| Lesson writer | reasoning | `lesson-writer-v1` | closed | `intake_lessons_enabled` (on unless false) |
| Vendor request reader | routing | | open (raw phrase searched) | none |
| Vendor extractor | routing, with files | | closed (note stays queued) | none |

| Trigger.dev task | Schedule (IST) |
| --- | --- |
| `sia-silence-watch` | every minute |
| `sia-staff-link` | every 15 minutes |
| `freshdesk-sync` | every minute |
| `vendor-extract` | every 5 minutes |
| `member-profiler` | every 10 minutes |
| `member-pulse` | hourly at :07 |
| `member-assessment-weekly` | Sunday 04:00 |
| `member-assess-one` | on demand |
| `ticket-intake` | every minute |
| `ticket-sentinel` | every minute |
| `intake-lessons-weekly` | Monday 06:00 |
| `intake-lesson-write` | on demand |

The profiler, the analyst jobs and Elaya share one Anthropic account, so a reached spend limit stops
them all (it happened on 2026-09-18/19; failure rules were fixed so a provider outage never counts
against a conversation).

---

## 11. Rules that never change

1. **The watcher never speaks.** No send anywhere in `connector/src/`; the `/sia` chat has no composer.
2. **Facts are append-only.** A correction is a new row that supersedes the old one
   (`addFactCore`, the one sanctioned `superseded_by` update).
3. **An unlinked group is never read by a model.** The profiler and intake read only
   `group_kind = 'member'`, linked, active groups of Active members. The gate is the group link, not
   the people in it (a spouse or assistant in a linked group is normal).
4. **Names never reach a model.** The code-name vault (`openVault()`), `maskPii` and a leak check guard
   the profiler, intake, the drafter, the judgement and the lesson writer. The member vault is never
   part of any read, tool result or prompt.
5. **Serene never writes to Freshdesk or Zoho.**
6. **Sia and Gia meet at the member record** (`gia.deals.member_id`), which nothing sets yet. Shared
   platform pieces (tasks, Elaya, notifications, vendors) serve both sides.
7. **A human makes every call** on tickets and lessons; the machine proposes.

## 12. Open items worth knowing

- The Freshdesk cutover and the won-deal to member bridge are not built.
- `linkMemberGroupAction` does not check the group's queendom or the caller's role; seat changes are
  not audited; ticket priority approval is page-only.
- The tech workbench sees console, Sync now, Merge and Remove buttons it cannot use.
- Partitions run out: `sia.wag_*` and `member_events` in 2027-03, `sia.ticket_events` in 2027-12;
  nothing creates new months automatically (`docs/operations/maintenance.md`).
- Counts to re-check before quoting: groups linked, profiler history read, tickets and verdicts.
- The plan files in `docs/architecture/` (`sia-whatsapp-plan.md`, `sia-intelligence-plan.md`,
  `member-ticket-plan.md`, `sia-resilience-plan.md`) are the design narratives Sia came from;
  they describe intent, not today.
