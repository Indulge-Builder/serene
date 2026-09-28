# Sia: the concierge module

> **Purpose:** the hub for Sia, the member-operations side of Serene. What it is, its layers and their status, how the concierge floor is organised (queendoms and seats), and one link per layer to the doc that owns it.
> **Audience:** everyone: engineers, the founders, anyone onboarding to the concierge side.
> **Source-of-truth scope:** the module map, the organisation model (queendoms, seats, what a seat can see in summary), the staff phone link, and the rules that never change. Each layer's detail lives in its own doc (linked below). The full enforcement matrix lives in `../architecture/auth-and-rbac.md`; tables in `../architecture/database.md`.
> **Last verified:** 2026-09-26 against `src/lib/constants/sia-roles.ts`, `src/lib/services/sia-access.ts`, `src/lib/services/sia-staff-link.ts`, `src/lib/constants/route-permissions.ts`, `src/trigger/sia-*.ts`, `connector/src/`, and migrations 0169 to 0244.

---

## What Sia is

Gia is sales: it works a lead until the deal closes. Sia is everything after that: looking
after the member. The concierge team (Indulge calls them the floor) works in WhatsApp groups,
one group per member, and in Freshdesk tickets. Sia gives Serene a copy of both, a record of
each member, Serene's own tickets, a vendor book, and Elaya on top to answer questions about
all of it.

The one-line version: a silent WhatsApp account sits in every member group and saves every
message; Serene links each group to a member, reads the chat to learn about the member, turns
requests into tickets, and lets each queendom see only its own members.

## The layers today

| Layer | What it is | Status | Home doc |
| --- | --- | --- | --- |
| WhatsApp group archive | The Baileys watcher (`connector/`) on AWS Fargate saves every message, edit, reaction and media file from the groups it sits in, raw first, into `sia.wag_*` | Live since 2026-08-27. About 160,000 messages in 516 groups by 2026-09-19 | [`../integrations/sia-connector.md`](../integrations/sia-connector.md) |
| The `/sia` page | A read-only WhatsApp-Web-style viewer: groups rail, chat, media, search, group info, deep links, "make a ticket from these messages". The admin console holds health, pairing and group mapping | Live | [`../pages/sia.md`](../pages/sia.md) |
| Queendoms and seats | Three queendoms; each teammate holds a seat (`profiles.sia_role`) in one of them, or the one company-wide seat | Live (seats 0201, many bishops 0242, pinned seats 0243, Joker head 0244) | This doc, below |
| Member spine and group links | `member.members`, one row per member; `sia.wag_groups.member_id` links a group to its member | Live. 401 groups linked on 2026-09-18 | [`./members.md`](./members.md) |
| The member twin | Facts, people, relations, timeline, health, the profiler that reads the chats, the hourly pulse and weekly judgement, the encrypted vault | Live | [`./members.md`](./members.md), [`../pages/members.md`](../pages/members.md) |
| Serene tickets | `sia.tickets` with its board, the per-ticket sentinel, intake suggestions read from the groups, and the training loop | Shipped and running. Intake reads the groups in production (week to 2026-09-25: 4,090 chats read, 824 cards proposed, no human verdicts yet). The floor still works in Freshdesk; the cutover is not built | [`./tickets.md`](./tickets.md), [`../pages/tickets.md`](../pages/tickets.md) |
| Vendors | The shared vendor book, the ranking, and the live extractor that reads Freshdesk notes | Live, open to the whole concierge domain since 2026-09-18 | [`./vendors.md`](./vendors.md) |
| Freshdesk mirror | A read-only copy of the Freshdesk account, synced every minute, with `/freshdesk` pages | Live | [`../integrations/freshdesk.md`](../integrations/freshdesk.md) |
| Zoho Books | Live, read-only finance per member and for the company (`/books`) | Live | [`../integrations/zoho-books.md`](../integrations/zoho-books.md) |
| Elaya on the floor | Member, group, Freshdesk and ticket tools, each scoped to the caller's queendom at call time | Live on both brains | [`./elaya.md`](./elaya.md) |
| Freshdesk contact notes | The one-off import of the Notes tab on Freshdesk contacts into the twin and the vault | Done 2026-09-24; 369 contacts parked | [`../data-imports/freshdesk-contact-notes.md`](../data-imports/freshdesk-contact-notes.md) |

## How the concierge floor is organised

### Queendoms

A queendom is one concierge team with its own members. There are three, seeded by migration
0194 in `sia.queendoms` (slugs in `QUEENDOM_SLUGS`, `src/lib/constants/sia-roles.ts`):
`anishqa`, `ananyshree` and `sanika`. Each row carries `freshdesk_group_id`, the Freshdesk
group that queendom works in, which is how the mirror's tickets are scoped.

A member belongs to one queendom (`member.members.queendom_id`), and the whole queendom sees
that member. That single rule drives members, WhatsApp groups, Freshdesk, Sia tickets and
Elaya's answers.

### Seats

A seat is a position on top of the platform role. It lives in two profile columns:
`profiles.sia_role` and `profiles.queendom_id`. Only accounts in the `concierge` domain can
hold one (a CHECK from 0201). The platform role (`profiles.role`) is derived from the seat by
the account forms, never picked by hand (`SIA_ROLE_PLATFORM_ROLE`).

| Seat (`sia_role`) | Label | Platform role | Queendom | How many |
| --- | --- | --- | --- | --- |
| `queen` | Queen | manager | one | one active holder per queendom |
| `bishop` | Bishop | manager | one | many (0242 dropped the one-bishop index) |
| `genie` | Genie | agent | one | many |
| `joker` | Joker | agent | one | one active holder per queendom |
| `joker_head` | Joker head | manager | none (company-wide) | one active holder in the company |

The rules, all enforced in the database:

- A queendom seat must name its queendom; the Joker head must not (0244 CHECK
  `profiles_sia_role_needs_queendom`).
- Queen and joker are single seats (`SIA_SINGLE_SEATS`, partial unique indexes on active
  holders). A second bishop is allowed since 0242.
- Nobody can change their own `sia_role` or `queendom_id` (0243 pinned both on the self branch
  of `profiles_update`). Only admin and founder seat people, through the Team page.
- `COMPANY_WIDE_SEATS` lists the seats with no queendom (today only `joker_head`).
  `isCompanyWideSeat(profile)` is the one test for company-wide reach. It keys on the seat,
  never on an empty `queendom_id`, because every non-concierge account also has an empty one.

Seats are set on the account forms through `RoleDomainFields`
(`src/components/admin/RoleDomainFields.tsx`). The Team page (`/admin/users`) shows the seats
per queendom (`QueendomRosterCard`) and the whole team by domain (`DomainRosterCard`). See
[`../pages/user-management.md`](../pages/user-management.md).

### What each seat can see (summary)

The boundary is one fact, `profiles.queendom_id`, read from the database on every request.
RLS enforces it on member tables and Sia tickets (`can_access_member_queendom()`); the pages
and tools that read through the admin client ask `getSiaViewerScope` / `canViewSiaGroup` /
`canAccessMember` first. Full matrix: [`../architecture/auth-and-rbac.md`](../architecture/auth-and-rbac.md).

| Who | What they see |
| --- | --- |
| Seated queen, bishop, genie, joker | Their own queendom only: its members (member finance included, decided 2026-09-15), the WhatsApp groups linked to those members (read only), the queendom's Freshdesk group, its Sia tickets and suggestions. Nothing of another queendom. No leads, no Sia console, no company books |
| Joker head | A queen's reach in every queendom. Never the internal or unlinked groups, the other Freshdesk groups, or the console. Vault as a list only (`canUseMemberVault` is false). No member money (`canSeeMemberFinance` is false). No ticket alerts (alerts go to queendom seats) |
| Concierge account with no seat | Nothing. `/sia` and `/freshdesk` send it back to the dashboard |
| Admin, founder | Everything, plus the Sia console, group mapping, Freshdesk "Sync now" |
| Tech workbench (domain `tech`) | `/sia` and `/freshdesk` pages as "all", but the console, mapping and Sync now actions refuse (they stay admin/founder) |

Two founder-role accounts sit in the concierge domain and so bypass every scope; that is a
founder decision, not a bug (changelog 2026-09-25).

### The concierge nav

Routes (`DOMAIN_ROUTE_MAP.concierge` in `src/lib/constants/route-permissions.ts`):
`/tasks`, `/members`, `/tickets`, `/sia`, `/freshdesk`, `/vendors`. `/tickets` is reachable
but not listed (the "make a ticket" hand-off from `/sia` lands there) and `/helpdesk` is
hidden (`DOMAIN_NAV_HIDDEN`). `/settings` left the concierge map on 2026-09-25.

What a seated teammate sees in the sidebar: Dashboard, Elaya, Members, Tasks, Vendors, Notes,
Sia, Freshdesk. Sia and Freshdesk sit in a section labelled "Concierge" (admins see it as
"Admin"). The concierge dashboard is My Tasks and Elaya only (`defaultGridFor`); the Gia
widgets do not serve this domain. Elaya is on for concierge (`ELAYA_DOMAINS`).

Reachability is not visibility: a route in the map only lets the page load. What the person
sees inside is decided by the scope above.

## Staff identity on WhatsApp: the phone link

The founder's rule (2026-09-22): every employee has a company phone and an email. The phone
joins the WhatsApp groups, the email signs in to Serene. So the phone ties the two.

`linkStaffContactsByPhone()` (`src/lib/services/sia-staff-link.ts`):

- every `sia.wag_contacts` row whose phone equals an active profile's phone gets
  `staff_profile_id` and a `participant_role` from the seat (the Joker head is tagged
  `joker`; a founder is tagged `founder`);
- a hidden-id contact (`@lid`) is linked through the lid pairing the watcher stores on the
  phone row;
- a link whose account is gone or inactive is cleared, so a phone can pass to the next hire;
- phones compare in E.164 on both sides.

It runs every 15 minutes (`src/trigger/sia-staff-link.ts`, task `sia-staff-link`) and on
demand from the **Link now** button on a user's page (`StaffWhatsAppCard`,
`linkStaffWhatsAppNowAction`, admin/founder). Elaya, the profiler, the waiting-for-reply read
and the member pulse all use `staff_profile_id` to tell staff from the member's side.
`scripts/sia-tag-staff-roster.py` stays only for people with no Serene account.

A blank `profiles.phone` breaks this link and, worse, turns that person's WhatsApp messages
to Elaya into a new lead. See [`./elaya.md`](./elaya.md).

## The watcher alarm

The watcher writes its own heartbeat every minute. `src/trigger/sia-silence.ts` (task
`sia-silence-watch`, every minute) turns a stale beat, a lost session, a stuck connection or
six silent hours into an alert. The first alert goes to a named list of tech responders
(`SIA_ALERT_TIER1_PROFILE_IDS` in `src/lib/constants/sia-alerts.ts`) in-app, by push and on
WhatsApp, with a reminder every 10 minutes; founders join after one unresolved hour; recovery
is announced once. The WhatsApp leg is `sendSiaAlertNotification` over the Gupshup "Sia alert"
template, deliberately not gated by notification preferences. Detail:
[`../integrations/sia-connector.md`](../integrations/sia-connector.md#the-heartbeat-and-the-alarm).

The same template and the same responder list carry three other messages: Elaya's one-line
founder ping when their 24-hour window is closed (`sendElayaTemplatePing`, used by the brief and
the alert sweep), Elaya's silent-turn alert (`elaya-alerts.ts`), and a correction someone raised
against Elaya (`raise_improvement_request` in `src/lib/elaya/tools/write-registry.ts`). Those
belong to [`./elaya-analyst.md`](./elaya-analyst.md) and [`./elaya.md`](./elaya.md).

## The `sia` schema at a glance

All in one Postgres database; `sia` is its own schema so the archive stays out of `public`.
The WhatsApp tables are service-role only (no user policy); the ticket and intake tables have
RLS read policies by queendom. Column-level detail: [`../architecture/database.md`](../architecture/database.md).

| Area | Tables | Owner doc |
| --- | --- | --- |
| WhatsApp archive | `wag_raw_events`, `wag_messages` (both monthly partitions), `wag_media`, `wag_reactions`, `wag_receipts`, `wag_groups`, `wag_group_members`, `wag_contacts`, `wag_pipeline_cursors`, `wag_auth_state`, `wag_watcher_status` | [`sia-connector.md`](../integrations/sia-connector.md) |
| Organisation | `queendoms` | this doc |
| Tickets | `tickets`, `ticket_events`, `ticket_message_links`, `ticket_sla_policies`, `ticket_settings`, `genie_roster` | [`tickets.md`](./tickets.md) |
| Intake and training | `intake_proposals`, `intake_group_state`, `intake_lessons`, `draft_reviews` | [`tickets.md`](./tickets.md) |
| Reading the chats | `profiler_group_state`, `codenames`, `extraction_runs` | [`members.md`](./members.md) |

The member tables themselves live in the `member` schema (0211), the Freshdesk copy in
`freshdesk` (0193).

## Rules that never change

Checked against the code on 2026-09-26.

1. **The watcher never speaks.** There is no send call anywhere in `connector/src/`, the
   socket connects with `markOnlineOnConnect: false`, and the `/sia` chat has no composer. A
   silent member is what keeps the number from being flagged.
2. **Facts are append-only.** `member.member_facts` has no update or delete policy for users.
   A correction writes a new row and stamps `superseded_by` on the old one; that stamp is the
   one sanctioned update, done by `addFactCore` (`src/lib/services/member-mutations.ts`).
3. **An unlinked group is never read by a model.** The profiler and ticket intake read only
   groups with `group_kind = 'member'`, a `member_id`, and `is_active` (0219, 0220), and the
   profiler only Active members. Since 2026-09-17 the gate is the group link, not the members
   inside it: a spouse or assistant in a linked group is normal and does not block reading.
4. **Names never reach a model.** The profiler, intake, the ticket drafter and the lesson writer
   work through the code-name vault (`openVault()` in `member-profiler.ts`) plus `maskPii` and a
   leak check. The member vault (cards, IDs) is never part of any read, tool result or prompt.
5. **Serene never writes to Freshdesk or Zoho.** Both are read-only mirrors or live reads. The
   one exception is the one-time script that registered the Freshdesk webhook rules.
6. **Sia and Gia meet at the member record.** They keep separate tables and pages. The join is
   `gia.deals.member_id` (Elaya's member 360 reads it). Nothing in the app sets it yet: walk-in
   deals write `null`, and the post-won flow is not built. Shared platform pieces (tasks,
   Elaya, notifications, the vendor book) serve both sides.

## Background reading (plans, not truth)

`member-ticket-plan.md`, `plan-sia-intelligence.md` and `plan-whatsapp.md` at the repo root
are the design narratives Sia was built from. They are useful for the "why", but they describe
intent. Where they and the code disagree, the code and the docs above win.

## Open items

- **Seat changes are not audited.** `log_profile_changes` skips `sia_role` and `queendom_id`,
  though the admin page says changes are audited (changelog 2026-09-26, 0243 entry).
- **Linking a group checks the member, not the group, and not the role.** Two screens link a
  group to a member, both shown to admin and founder only: the Sia group info panel
  (`updateSiaGroupMappingAction`, admin/founder on the server too) and the member page's
  WhatsApp card (`linkMemberGroupAction`). The second action's server gate only asks whether the
  caller can see the member, so a seated teammate calling it directly could link any group jid,
  including another queendom's, to one of their members and pull that group into their scope.
  The fix is a role check and a group check in the action.
- **Groups still unlinked.** On 2026-09-18, 64 member-type groups had no member and 213 members
  had no group (69 of them Active). The rail's "No member" filter is the to-do list.
- **The post-won flow.** Nothing creates a member from a won Gia deal or sets
  `deals.member_id` yet.
- **Freshdesk is still the floor's ticket system.** Serene tickets run beside it; the move is
  not scheduled.
