# Freshdesk

> **Purpose:** how Serene mirrors the Freshdesk account (tickets, notes, contacts, agents, groups, fields, SLA policies), the `/freshdesk` pages that show it, who may see what there, and what else reads the mirror.
> **Audience:** engineers, and the founders for the operating notes.
> **Source-of-truth scope:** the connection, the sync, the mirror's tables, and the `/freshdesk` and `/freshdesk/[id]` pages (this doc is their one home). Serene's own tickets live in `../modules/tickets.md`; the vendor extractor that reads the mirrored notes in `../modules/vendors.md`; Elaya's Freshdesk tools in `../modules/elaya.md`.
> **Last verified:** 2026-09-26 against `src/lib/services/freshdesk-{api,sync,media,service}.ts`, `src/lib/constants/freshdesk.ts`, `src/trigger/freshdesk-sync.ts`, `src/app/api/webhooks/freshdesk/route.ts`, `src/app/(dashboard)/freshdesk/`, `src/components/freshdesk/`, `src/lib/services/sia-access.ts`, and migrations 0193, 0196 to 0198, 0202, 0214.

---

## Why a mirror

Freshdesk is where the concierge team runs tickets today, and it stays so until Serene's own
tickets take over. Until then Serene learns from it: how a ticket moves and how long each stage
takes, which member raised what, which agent handles what, and which vendor did the job. That
needs the data in our database, joinable to `member.members` and to the WhatsApp archive, with a
change history Freshdesk does not expose on its own.

**The mirror never writes to Freshdesk.** Every read path is one-way. Configuration aside
(`scripts/freshdesk/register-webhooks.ts` created the two "Serene mirror" automation rules that
push ticket events to us), Serene writes to a Freshdesk ticket in exactly ONE place, since
2026-09-29 (migration 0250, Decision Log): `finance-mutations.ts`, after a finance person
confirmed a reimbursement invoice on a ticket in Invoice Due. That write is a private note with
the invoice PDF, the fields Billable, Invoice Number and Invoice Amount, and the tag
`Invoice Done`. It is made with that person's OWN Freshdesk API key (`staff-freshdesk-keys.ts`),
never the company key, so Freshdesk shows their name. **It never changes a ticket's status**:
only a genie resolves. See `docs/architecture/finance-plan.md`.

## The account

Read live on 2026-09-15; the rate limits were corrected by Freshdesk on 2026-09-18.

| Fact | Value |
| --- | --- |
| Domain | `indulge.freshdesk.com`, REST v2, Basic auth (the API key as username, `X` as password) |
| Rate limit | **400 calls a minute** for the account, and **100 a minute on every ticket endpoint** (list, view, conversations), shared with the member app. The mirror only calls ticket endpoints, so 100 is its real ceiling. (Before 2026-09-18 the account was throttled at 50 a minute) |
| List window | `GET /tickets` returns only the last 30 days; `updated_since` opens the whole history (100 per page, 300 pages per query) |
| Tickets | #415 (2024-01-30) onward, about 51,000 live in the mirror (not deleted, not spam), roughly 150 new a day |
| Groups | 12: the three queendom groups (Anishqa's, Ananyshree's, Sanika's) plus Bishop, Concierge, Finance and Billing, Global Events, Indulge Shop, Jokers, Management, Queendom, Retail |
| Agents | 78 on the API, 81 in the export |
| Statuses | 2 Open, 3 Pending, 4 Resolved, 5 Closed, 6 Nudge Client, 7 Nudge Vendor, 8 Ongoing Delivery, 9 Invoice Due (Finance group only), 9000 Assigned to AI Agent. The labels shown come from the synced field choices; `FD_STATUS_LABELS` is only the fallback |
| Category | `cf_category_of_request`, a required nested field: Travel (Flight > Tickets / Web Check-in, Hotel Booking, Car Transfer, Experiences, Airport Assistance, Visa), Dining, Retail (Bag, Watch, General, Gifting), Special Request, and more |
| Type | 14 values the SLA policies key on ("Travel - Flight" ... "Retail - Bags", "Gifting", "Events", "Special Requests", "Travel - Visa") |
| SLA policies | 9: respond within 15 minutes and resolve within 8 business hours for most types; watches and bags 48 hours; a default of 24 hours first response. Business hours 09:00 to 20:00 IST |
| Contact fields | 51, of which 40 are preferences (birthday, anniversary, diet, allergies, seat, stays, cuisine, drink, and so on) |
| Ticket custom fields | About 110 `cf_*` fields; the useful brief fields are pax, date, from and to, budget, request, product details, poc, time, luggage, assistance, gift specifications, plus the Periskope message and chat ids |
| Other consumers | The member app and the old dashboard receive webhooks from this account; Periskope receives ticket updates. Our two rules sit beside them |

## The data model (schema `freshdesk`)

Created by migration 0193. Same database, its own schema, service-role grants only; RLS on with
no user policy. Nothing outside the sync writes here, and the only CHECKs are on our own columns
(Freshdesk adds statuses without telling us).

| Table | Posture | What |
| --- | --- | --- |
| `tickets` | current state, overwritten by the sync | every list field, `custom_fields` and `raw` whole, `status_label` resolved from the field choices, requester name and E.164 phone, `member_id` (resolved by `freshdesk_contact_id`, then by primary or alternate phone), the `stats` timestamps, `attachments` (0197), `conversations_synced_at`; `is_incomplete` and `missing_info` (2026-10-03) are the team's submission check, written by that setup outside this repo and NEVER by the sync (the upsert sets only the columns it carries); Elaya reads them through `list_incomplete_tickets` |
| `conversations` | current state | notes and replies, `private` and `incoming` flags, text and HTML, `attachments` (with our storage paths), `media_synced_at` (0197), `vendor_extracted_at` and `vendor_extract_attempts` (0214, the vendor extractor's queue) |
| `contacts` | current state | identity, `phone_e164`, the preference fields whole, `member_id` |
| `agents`, `groups`, `ticket_fields`, `sla_policies` | reference, refreshed every 6 hours | `ticket_fields.choices` holds the status vocabulary and the category tree |
| `ticket_changes` | **append-only** | one row per field flip the sync saw (see "Movement history") |
| `webhook_events` | append-only inbox | the raw automation payloads with `processed_at` and `error` |
| `sync_state` | cursors | `poll` (watermark), `backfill` (cursor, `done`), `contacts`, `reference` |
| `sync_runs` | audit | every step: kind, calls made, rate remaining, rows written, error |

Functions: `freshdesk.ticket_overview(...)` (0196, the overview strip in one scan; re-declared in
0202 with `p_member`), `media_backlog()` and `flag_threads_for_media(p_limit)` (0197, rewritten
in 0198 to start from the backlog index). All service-role only.

The 0202 members rename turned `client_id` into `member_id` on `tickets` and `contacts`. The
member tables themselves moved to the `member` schema in 0211; code reaches this schema through
`freshdeskDb()` in `freshdesk-sync.ts` (the same idea as `giaDb()` / `memberDb()`).

## The sync

```text
every minute (Trigger.dev freshdesk-sync; 30-second time budget; at most 80 calls; stop at 15 remaining)
  reference   when 6 h old: groups, agents, SLA policies, the field list
  poll        GET /tickets?updated_since=<watermark - 3 min>&order_by=updated_at
              upsert -> diff -> ticket_changes; the tickets that changed are queued for a thread pull
  media       while the thread queue is short, re-queue up to 400 old threads for the file backlog
  threads     pull queued threads, 12 at a time, up to 300 a cycle (1 or 2 calls each)
  contacts    when 15 min old: updated contacts, 2 pages
  backfill    oldest update first from 2023-01-01, resumable, re-anchors at the 300-page cap
  choices     dropdown fields still missing their choice list

on a webhook (api/webhooks/freshdesk, seconds)
  rate limit -> secret check -> store the event -> 200
  after(): re-read the ticket (own 6-call budget), same upsert, same thread pull
           a 429 is waited out once (up to 45 s) before handing the ticket to the next poll
           404 = deleted: flip `deleted`, write a change row
```

- **The poll is the truth path**; the webhook only shortens the delay. A missed webhook is
  repaired by the next poll. Every step is an upsert on Freshdesk's own ids, so any step can be
  re-run.
- **The budget is calls and time** (`createFdBudget(maxCalls, reserve, deadlineMs)` in
  `freshdesk-api.ts`). When either runs out, every step stops starting new work; downloads in
  flight finish. The next run carries on.
- **The task cannot build a backlog.** It runs one at a time (`concurrencyLimit: 1`), passes a
  30-second deadline, has `maxDuration: 90` as a backstop, and exits at once if it starts more
  than 150 seconds after its scheduled minute. This was added on 2026-09-18 after cycles that
  copied files ran 90 to 116 seconds against a 60-second schedule, leaving 173 queued runs and a
  17-hour lag.
- Missing `FRESHDESK_DOMAIN` / `FRESHDESK_API_KEY` makes the task a quiet no-op.

### The numbers (`src/lib/constants/freshdesk.ts`)

| Constant | Value | Meaning |
| --- | --- | --- |
| `FD_RUN_MAX_CALLS` | 80 | calls one cycle may spend |
| `FD_RATE_RESERVE` | 15 | stop when this many remain in the window (the member app's share) |
| `FD_POLL_OVERLAP_MS` | 3 minutes | how far behind the watermark the poll re-reads |
| `FD_THREAD_CONCURRENCY` | 12 | threads pulled at once |
| `FD_THREADS_PER_CYCLE` | 300 | threads per cycle, if the budget allows |
| `FD_MEDIA_FLAG_BATCH` | 400 | old threads re-queued per cycle for the file backlog |
| `FD_MEDIA_PER_THREAD_MAX` | 40 | files copied per thread pull |
| `FD_MEDIA_COPY_CONCURRENCY` | 6 | files downloaded at once |
| `FD_ATTACHMENT_MAX_BYTES` | 30 MB | larger files stay a name only |
| `FD_REFERENCE_TTL_MS` | 6 hours | reference refresh |
| `FD_GROUP_AGENT_WINDOW_DAYS` | 90 | who "works" a group, for a pinned viewer's Agent filter |

"Sync now" on the page runs the same cycle with a 20-call budget. The webhook re-read has its
own budget of 6.

### The history

The history came from Freshdesk's account export, not the API (2026-09-15): 176 XML files
(50,312 tickets from 2024-01-30, 209,153 notes with attachment names, 1,577 contacts, 81 agents,
12 groups), loaded by `scripts/freshdesk/load-export.py` in minutes, with the poll watermark set
to the export's last update. The export has no field history, so `ticket_changes` starts from
the first live poll. `scripts/freshdesk/backfill.ts` can re-pull through the API if ever needed.

## Movement history

`ticket_changes` is the record Freshdesk does not give us: one row per tracked field that
changed between two reads of a ticket. Tracked: status, priority, agent (`responder_id`), group,
type, category, sub-category, classification, subject, both due dates, escalation flags, spam,
deleted, tags, and every custom field as `cf.<name>`. `observed_at` is our clock (so the
resolution is the sync cadence); `fd_updated_at` is Freshdesk's. `source` says poll or webhook.

**`fdComparable(field, value)`** is the one comparable form of a tracked value: a due date
compares as its instant, arrays compare order-free. Freshdesk writes a moment as `...Z` and
Postgres hands it back as `...+00:00`, so a text compare logged a fake "change" of both due dates
on every touch: 24,510 of 28,301 rows by 2026-09-18. The sync's diff now uses `fdComparable`, and
the ticket page reads up to 2,000 rows and hides any row whose two sides compare equal. The old
false rows were not deleted (the table is append-only; removing them is the founder's call).

## Files and pasted images (0197)

Freshdesk keeps files on its own storage and gives the API links that die within hours; the
export carried names only. So every thread pull copies what its fresh links point at into the
**private** `freshdesk-attachments` bucket (`freshdesk-media.ts`):

- `extractInlineImages()` finds Freshdesk-hosted images pasted into a note or description (a web
  image from elsewhere stays a link);
- `storeFreshdeskFile()` downloads and uploads under `{ticket}/{note}/{id}-{name}` (no API call,
  the link carries its own token);
- `copyMedia()` keeps paths already copied across a re-pull, records `store_error` so the name
  still shows, and counts a transient failure as still to do so the note is re-queued;
- `signFreshdeskAttachments()` signs one-hour links per page view.

The history (about 63,000 files, roughly 13 GB) is worked from the cloud since 2026-09-17: the
minute cycle re-queues old threads while the queue of changed tickets is short, so a live update
is never behind old files. The bucket has an admin/founder SELECT policy for defence in depth;
the pages sign links on the admin client, so a pinned viewer sees files on their own tickets.

## The pages

### `/freshdesk`

`src/app/(dashboard)/freshdesk/page.tsx`. A primary nav page on the list layout: title with the
blinking dot and "Sync now" (unpinned viewers only), the overview strip, the filter bar, the dense
table, the pager.

- **Overview strip** (`FreshdeskOverview`): five tiles (Open now, Created today, Resolved today,
  Escalated (open), and Mirrored, which reads "Matching" when a filter is active), then a "By
  status" strip with one cell per status and the sync line as its footer (when it last synced,
  whether the history is complete, threads still to pull, when a webhook was last heard, calls
  left this minute, the last error; it turns amber when the last poll failed or is over 5
  minutes old). The strip answers for the same filters as the table
  through `freshdesk.ticket_overview` (one scan). The status picks narrow the tiles but not the
  by-status cells, so the cells always show the mix a pick would narrow to. Its Suspense is keyed
  on every filter except the page number, so paging never re-counts.
- **Filters** (`FreshdeskFilters`, composing `FilterBar` + `useUrlFilters`): search (subject,
  requester, or a ticket number), Status (multi), Queendom (the Freshdesk group), Agent,
  Category, Priority, and the created-date range. URL-driven, immediate commit.
- **Table** (`FreshdeskTable`): display-only, newest update first, 50 a page (`Pagination`). A
  row opens the ticket with `?from=` so Back returns to the same view.
- **`?member=<uuid>`** scopes the whole page to one member (exact `member_id`). A line above
  the table reads "Tickets for" with the member's name linked, and "Show all". The member page's
  "See tickets" link uses it. The member is checked with `canViewMember` first; a member outside
  the viewer's reach is dropped silently.

### `/freshdesk/[id]`

`src/app/(dashboard)/freshdesk/[id]/page.tsx`. Back link, `#id` and subject as the title, then
the dossier grid:

- **Thread** (`TicketThread`): notes and replies in order, labelled internal note / from the
  member / reply, with authors resolved, and files through `FreshdeskAttachments` (image
  thumbnails, playable video and audio, file chips, a grey "not copied yet" chip with the reason).
- **Movement** (`TicketChangesTimeline`): the `ticket_changes` rows with ids resolved to names.
- **Summary** (`TicketSummaryCard`): status, priority, type, category, requester (with the
  linked member's name, or "not linked to a member"), phone, queendom, agent, source, the SLA stamps,
  tags, every filled custom field, the description with its files, "Open in Freshdesk", and a
  link to Sia when the requester is a member.

### Who sees them

Access is one answer from one place, `getSiaViewerScope(profile)` in `sia-access.ts`, because the
tables are service-role only and the page gate is the trust boundary.

| Viewer | What they get |
| --- | --- |
| Admin, founder | Every ticket, the Queendom filter, Sync now |
| Tech workbench | Every ticket and the Queendom filter; Sync now shows but its action refuses (admin/founder only) |
| Seated queen, bishop, genie, joker | **Pinned on the server** to their queendom's Freshdesk group (`sia.queendoms.freshdesk_group_id`), whatever the URL says. No Queendom filter. The Agent filter lists only the people who worked that group's tickets in the last 90 days (`getGroupAgentIds`; Freshdesk's group list has no members, so the work is the fact). No Sync now |
| Joker head | Pinned to the three queendom groups together; the Queendom filter offers just those three. The overview is counted group by group and added up (`overviewAcrossGroups`), because the RPC takes one group |
| Anyone else, or a pinned viewer with no Freshdesk group | Redirected to `/dashboard` |

`pinnedGroupFilter(groupIds, asked)` is the one pick rule: the asked group if it is one of
theirs, otherwise all of theirs. Elaya's Freshdesk tools use the same function. On the ticket
page, a ticket outside the viewer's groups answers "not found", so a ticket number never confirms
that another queendom's ticket exists. `/freshdesk` sits in the concierge route map for
reachability; the sidebar lists it under "Concierge" (admins see "Admin").

### States

- **Loading:** `freshdesk/loading.tsx` and `freshdesk/[id]/loading.tsx`; the strip and table have
  their own skeletons (`FreshdeskOverviewSkeleton`, `FreshdeskTableSkeleton`) that hold height.
- **Empty:** the table and the status strip use `EmptyState`; the movement card has its own empty
  state.
- **Error:** a failed list read returns an empty page (logged); a missing overview RPC falls back
  to parallel head counts through the same predicate (`applyTicketFilters`), so the numbers stay
  right, only slower. Sync now reports its run summary or the first real error.

## Who else reads the mirror

| Reader | What it reads |
| --- | --- |
| The member page | The Requests card (`getFreshdeskTicketsForMember`: open, recent, total) and the "See tickets" link |
| Serene tickets | The help window on a ticket (`getTicketHelp`: the member's past Freshdesk tickets in the same category) and the intake "free exam" (`sia.intake_stats`: how many suggested tickets Freshdesk also has) |
| The vendor live extractor | Unread notes on `conversations` (`vendor_extracted_at IS NULL`), every 5 minutes, and closes vendor jobs when the ticket is Resolved or Closed. See [`../modules/vendors.md`](../modules/vendors.md) |
| The member judgement | The member's last 180 days of tickets (`member-assessment.ts`) |
| Elaya | `get_freshdesk_overview`, `search_freshdesk_tickets`, `get_freshdesk_ticket` (queendom-pinned), the Freshdesk part of `get_member_360`, and the `elaya_read.freshdesk_*` views for `query_database` (0223). See [`../modules/elaya.md`](../modules/elaya.md) |
| The analyst layer | The live pulse (`getFreshdeskOverview`), the twice-daily brief (new and overdue tickets per queendom, notable tickets, resolved per agent), and the alert sweep (escalated, urgent or reopened since the last sweep). See [`../modules/elaya-analyst.md`](../modules/elaya-analyst.md) |

**An invariant for anyone touching the sync:** the conversation upsert in `freshdesk-sync.ts`
must never include `vendor_extracted_at`, not even as `null`. PostgREST builds the conflict
update from the keys present, so leaving the key out is what preserves the marker across a thread
re-pull. Sending it would re-queue every note on the ticket for the extractor and re-bill the
model read.

## Operating it

The mirror is live: migrations 0193, 0196, 0197, 0198 and 0214 are applied, the minute task runs
on Trigger.dev (deployed 2026-09-17), and the two "Serene mirror" automation rules push to
`/api/webhooks/freshdesk` (live since 2026-09-15).

| Need | How |
| --- | --- |
| Environment | `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY` on Vercel and the Trigger.dev worker; `FRESHDESK_WEBHOOK_SECRET` on Vercel (the route answers 500 without it). See [`../operations/environments.md`](../operations/environments.md) |
| Deploy the task | With the other Trigger.dev tasks; see [`./trigger-dev.md`](./trigger-dev.md) and [`../operations/deployment.md`](../operations/deployment.md) |
| Run the cycle from a laptop | `npx tsx --env-file=.env.local scripts/freshdesk/backfill.ts --poll [--minutes N] [--calls N] [--media]`. Only as a stopgap: it shares the rate limit with the cloud task, so give it a small share (`--calls 8`) |
| Re-register the webhooks | `npx tsx --env-file=.env.local scripts/freshdesk/register-webhooks.ts --site https://<serene-domain> --apply` |
| Reload the history from an export | `python3 scripts/freshdesk/load-export.py --dir <export folder> --apply` (dry run without `--apply`) |
| Check health | The sync line under the overview strip, or `freshdesk.sync_runs` |

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260915000193_freshdesk_mirror.sql` | The schema |
| `supabase/migrations/20260915000196_freshdesk_ticket_overview.sql` | The overview in one scan |
| `supabase/migrations/20260915000197_freshdesk_attachments.sql`, `...0198_freshdesk_media_flag_index_path.sql` | The file copy |
| `supabase/migrations/20260918000214_vendor_extraction_queue.sql` | The vendor extractor's columns on `conversations` |
| `src/lib/constants/freshdesk.ts` | Vocabulary, tracked fields, `fdComparable`, the budget numbers |
| `src/lib/types/freshdesk.ts` | Row and API types |
| `src/lib/services/freshdesk-api.ts` | THE REST client and the budget |
| `src/lib/services/freshdesk-sync.ts` | THE mirror core (every write), `freshdeskDb()` |
| `src/lib/services/freshdesk-media.ts` | The durable file copy and signing |
| `src/lib/services/freshdesk-service.ts` | The page reads, `applyTicketFilters`, the overview, the member Requests card |
| `src/lib/services/sia-access.ts` | Who sees what (`getSiaViewerScope`, `pinnedFreshdeskGroup`, `pinnedGroupFilter`) |
| `src/lib/actions/freshdesk.ts` | Sync now (admin/founder) |
| `src/trigger/freshdesk-sync.ts` | The minute task |
| `src/app/api/webhooks/freshdesk/route.ts` | The webhook |
| `src/app/(dashboard)/freshdesk/`, `src/components/freshdesk/` | The pages |
| `scripts/freshdesk/load-export.py`, `backfill.ts`, `register-webhooks.ts` | The export loader, the laptop loop and API re-pull, the webhook registration |

## Open items

- **The ticket page's member links are weak.** The Requester row names the member but does not
  link the member page, and "Open the member's WhatsApp group in Sia" goes to bare `/sia` instead
  of the group (`siaGroupHref`).
- **Sync now for the tech workbench.** The button renders for an unpinned viewer, but the action
  is admin/founder only, so a tech account's click fails.
- **False movement rows kept.** About 24,500 pre-fix due-date rows remain in `ticket_changes`,
  hidden by the page; deleting them is the founder's call.
- **Contact notes are not synced.** The Notes tab on a Freshdesk contact is not in the mirror; it
  was imported once by hand. See
  [`../data-imports/freshdesk-contact-notes.md`](../data-imports/freshdesk-contact-notes.md).
- **Backfill cursor.** TODO: verify whether `sync_state.backfill.done` is true in production; the
  step only runs with leftover budget.
