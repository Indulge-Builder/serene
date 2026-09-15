# Freshdesk

> **Purpose:** how Serene mirrors the Freshdesk account (tickets, threads, contacts, agents,
> groups, fields, SLA policies) and what the mirror is for.
> **Audience:** engineers, and the founder for the go-live steps.
> **Source-of-truth scope:** the connection, the sync, the page. The future Serene-native
> ticketing lives in `../../client-ticket-plan.md`, not here.
> **Last verified:** 2026-09-15 against the live account and migration 0193.

---

## Why a mirror

Freshdesk is where the concierge team runs tickets today. Serene's own ticketing (the Sia module)
replaces it later. Until then Serene learns from it: how a ticket moves and how long each stage
takes, which WhatsApp group message became which ticket, which agent handles what. That needs the
data in our database, joinable to `public.clients` and to `sia.wag_messages`, with a change
history Freshdesk does not expose on its own. Serene never writes to Freshdesk.

## The account, as read on 2026-09-15

| Fact | Value |
| --- | --- |
| Domain | `indulge.freshdesk.com`, REST v2, Basic auth (API key as username, `X` as password) |
| Rate limit | **50 calls a minute** (`X-RateLimit-Total`) for the whole account. The mirror is the priority consumer (founder, 2026-09-15); it spends up to 42 a minute and leaves 6 |
| List window | `GET /tickets` returns the last 30 days only; `updated_since` opens the whole history (max 100 per page, 300 pages per query) |
| Tickets | #415 (2024-01-30) to #55054 (2026-09-14), about 55k; roughly 150 a day since September 2026; 75 open at the time of reading |
| Groups | 12; three queendoms (Ananyshree's, Anishqa's, Sanika's) plus Bishop, Concierge, Finance and Billing, Global Events, Indulge Shop, Jokers, Management, Queendom, Retail |
| Agents | 78 |
| Statuses | 2 Open, 3 Pending, 4 Resolved, 5 Closed (customers see "Did not solve"), 6 Nudge Client, 7 Nudge Vendor, 8 Ongoing Delivery, 9 Invoice Due (Finance group only), 9000 Assigned to AI Agent |
| Category | `cf_category_of_request`, a required nested field: Travel (Flight > Tickets / Web Check-in, Hotel Booking, Car Transfer, Experiences, Airport Assistance, Visa), Dining, Retail (Bag, Watch, General, Gifting), Special Request, and more |
| Type | 14 values the SLA policies key on: "Travel - Flight" … "Retail - Bags", "Gifting", "Events", "Special Requests", "Travel - Visa" |
| SLA policies | 9: respond within 15 minutes and resolve within 8 business hours for most types; watches and bags 48 hours; a default of 24 hours first response. Business hours 09:00 to 20:00 IST |
| Contact fields | 51, of which 40 are preferences: birthday, anniversary, marital status, pet, sport, favourite brand, designer, book, country, travel frequency, car, watch, stays, flight seat, veg or non-veg, allergies, diet, drink, food, restaurant, coffee, cuisine, dessert, flowers, blood group, diabetic, need assistance with, company and designation, instagram, linkedin |
| Ticket custom fields | about 110 `cf_*` fields; the useful brief fields are pax, date, from and to location, budget, request, product details, events, note, poc, time, duration, luggage, airport, early check-in, assistance required, gift specifications, location, plus the Periskope message and chat ids (the WhatsApp link) |
| Existing automations | The member app and the old dashboard already receive webhooks from this account; Periskope receives ticket updates. Our two rules sit beside them |

## The data model (migration 0193, schema `freshdesk`)

| Table | Posture | What |
| --- | --- | --- |
| `tickets` | current state, overwritten by the sync | every list field, `custom_fields` whole, `raw` whole, `status_label` resolved from `ticket_fields`, the requester's name and E.164 phone denormalised, `client_id` resolved by `freshdesk_contact_id` then phone, the `stats` timestamps, the thread bookkeeping |
| `conversations` | current state | notes and replies, `private` and `incoming` flags, text and html, attachments as JSON (the urls expire) |
| `contacts` | current state | identity, `phone_e164`, the preference fields whole, `client_id` |
| `agents`, `groups`, `ticket_fields`, `sla_policies` | reference, refreshed every 6 hours | `ticket_fields.choices` holds the status vocabulary and the category tree |
| `ticket_changes` | **append-only** | one row per field flip the sync observed: status, priority, agent, group, type, category, subject, due dates, escalation, tags, and every `cf_*` as `cf.<name>`. `observed_at` is our clock (resolution = the sync cadence), `fd_updated_at` is Freshdesk's |
| `webhook_events` | append-only | the raw automation payloads, with `processed_at` and `error` |
| `sync_state` | cursors | `poll` (watermark), `backfill` (updated_since + page + done), `contacts`, `reference` |
| `sync_runs` | audit | every step: kind, calls made, rate remaining, rows written, error |

Access: RLS on, zero user policies. The Trigger.dev task and the webhook route write; the page
reads on the admin client behind an admin/founder page gate (Q-13). Broader access comes with
the Sia UI as its own migration.

## The sync

```text
every minute (Trigger.dev freshdesk-sync, budget 42 calls, reserve 6)
  reference   when 6h old: groups, agents, SLA policies, the field list
  poll        GET /tickets?updated_since=<watermark - 3 min>&order_by=updated_at   (4 credits / 100 tickets)
              upsert → diff → ticket_changes; then the threads of what changed (1 call each)
  threads     newest tickets whose thread is missing or older than the ticket
  contacts    every 15 min, _updated_since watermark
  backfill    oldest update first from 2023-01-01, resumable; re-anchors at the 300-page cap
  choices     dropdown fields still missing their choice list

on a webhook (api/webhooks/freshdesk, seconds)
  store the event → 200 → after(): re-read the ticket, same upsert, same thread pull
  404 = deleted: flip `deleted`, write the change row
```

Every step is idempotent (upserts on Freshdesk's own ids) and stops cleanly when the budget
ends; the next run finishes it. The poll is the truth path; the webhook only shortens latency.
The reserve keeps a few calls free for a human or another integration using the same account.

**The history came from the account export, not the API (2026-09-15).** Freshdesk's Admin →
Account → Export data produced 176 XML files (50,312 tickets from 2024-01-30, 209,153 notes with
attachment names, 1,577 contacts, 81 agents, 12 groups), and `scripts/freshdesk/load-export.py`
loads them straight into the mirror in minutes (the same upsert shape the API sync writes; no
`ticket_changes`, the export has no history). It sets the poll watermark to the export's last
`updated-at`, so the minute task continues from there. Re-runnable; dry run by default.

`scripts/freshdesk/backfill.ts` runs the same core in a loop from a laptop for an API pull
(about six hours for the tickets at 42 calls a minute, then about a day for the threads, newest first). It can be
stopped and restarted at any time.

**`backfill.ts --poll` is the minute task from a laptop** (2026-09-15). Until `pnpm trigger:deploy`
puts the real task in the cloud, this loop runs one `runSyncCycle` a minute (the same core the
task runs), so the mirror keeps up with Freshdesk: new tickets, status moves, replies, all within
a minute or two, plus the `ticket_changes` diff rows the export could not give. Start it with

```bash
npx tsx --env-file=.env.local scripts/freshdesk/backfill.ts --poll --minutes 1440
```

and leave the terminal open (the laptop must stay awake and online). Each line prints what the
minute did and the new watermark. Stopping it is safe: the next start resumes from the watermark
in `freshdesk.sync_state`.

## Attachments (0197)

Freshdesk keeps files on its own storage and gives the API a link that expires in hours; the
export carried names only. So every thread pull copies the files and the pasted images its
fresh links point at into the PRIVATE `freshdesk-attachments` bucket (`freshdesk-media.ts`),
at most 40 per pull, keeping paths already copied across a re-pull. The ticket page signs a
one-hour link per file and shows images as thumbnails, video and audio playable, the rest as
chips. A file that could not be copied keeps its name with the reason on hover.

The history (about 63,000 files, roughly 13 GB) is a backlog: `backfill.ts --poll --media`
re-queues old threads for the catch-up whenever the queue of changed tickets is short, and
prints the backlog every ten minutes. Downloads are not API calls; only the thread pull is.

## The page

`/freshdesk` (admin and founder): the overview strip, the shared filter bar, the dense table,
"Sync now". The strip answers for the same filters as the table (0196 `freshdesk.ticket_overview`,
one scan): the five tiles are the filtered set (the last one reads "Matching" instead of
"Mirrored"), the by-status pills ignore only the status picks so they show the mix a pick would
narrow to. Until 0196 is applied the same numbers come from parallel HEAD counts. `?client=<uuid>` scopes the whole page to one Serene client (exact `client_id`); the client page's "See tickets" link opens it. `/freshdesk/[id]`: the thread, the movement timeline, the summary card, a link to the
client record when the requester is linked. Display-only; nothing here writes to Freshdesk.

## Go-live

1. Apply migration 0193: `supabase db push --include-all`. **Done 2026-09-15.**
2. Env on Vercel and on the Trigger.dev worker: `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`,
   `FRESHDESK_WEBHOOK_SECRET` (the values are in `.env.local`).
3. `pnpm trigger:deploy` so the minute task exists. Until then, `backfill.ts --poll` on a laptop
   is the minute task (running since 2026-09-15).
3b. Apply migration 0196 (the overview RPC): `supabase db push --include-all`.
4. History: `python3 scripts/freshdesk/load-export.py --dir cleint-data/tickets-freshdesk-export --apply` (**run 2026-09-15**); the API backfill script is only for a re-pull.
5. After the Vercel deploy is live: `npx tsx --env-file=.env.local scripts/freshdesk/register-webhooks.ts --site https://<serene-domain> --apply`.
6. Open `/freshdesk`, press Sync now, watch the sync line.

## Files

| File | Role |
| --- | --- |
| `supabase/migrations/20260915000193_freshdesk_mirror.sql` | the schema |
| `src/lib/constants/freshdesk.ts` | the vocabulary and the budget numbers |
| `src/lib/types/freshdesk.ts` | row and API types (hand-declared until `gen types` covers the schema) |
| `src/lib/services/freshdesk-api.ts` | THE REST client |
| `src/lib/services/freshdesk-sync.ts` | THE mirror core (every write) |
| `src/lib/services/freshdesk-service.ts` | the page reads |
| `src/lib/actions/freshdesk.ts` | Sync now |
| `src/trigger/freshdesk-sync.ts` | the minute task |
| `src/app/api/webhooks/freshdesk/route.ts` | the webhook |
| `src/app/(dashboard)/freshdesk/` + `src/components/freshdesk/` | the page |
| `scripts/freshdesk/load-export.py` | the account-export loader (the history, in minutes) |
| `scripts/freshdesk/backfill.ts` (`--poll` = the minute task from a laptop), `scripts/freshdesk/register-webhooks.ts` | the API re-pull / the laptop poll, and the webhook registration |
| `supabase/migrations/20260915000196_freshdesk_ticket_overview.sql` | the overview strip in one scan |
