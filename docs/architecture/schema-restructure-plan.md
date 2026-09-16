# Schema restructure plan: `public` → `gia` + `client` (with `sia` and `freshdesk` as they are)

Written 2026-09-16. Status: **PLAN, not applied.** Decided with the founder the same day: do the
whole restructure at once, rehearse it first, and treat the leads data as untouchable. The Legacy
and Shop teams work in Gia every day.

Read `migrations.md` for the conventions and `20260827000172_sia_schema_move.sql` for the
precedent: the WhatsApp group tables moved from `public` to `sia` with this exact technique and
nothing was lost.

---

## 1. Why, in one paragraph

`public` holds 108 tables today. 53 of them are the client twin (12 tables plus 41 monthly
slices of the timeline) and 22 are Gia. Five years from now each business should read as its
own folder: the staff and platform in `public`, the leads business in `gia`, the person in
`client`, the concierge desk in `sia`, the Freshdesk mirror in `freshdesk`. A schema is a
folder inside the one database. Joins and foreign keys across schemas cost nothing. A separate
database would break exactly those joins, so this plan never creates one.

## 2. Target layout

| Schema | Holds | Count after |
| --- | --- | --- |
| `public` | staff + platform: profiles, tasks and their events/remarks/groups/audit, notifications, Elaya, subscriptions, vendors, suggestions, usage, LLM config, activity feed, task_ticket_meta | 34 tables |
| `gia` | the leads business | 22 tables |
| `client` | the client twin | 12 tables + 41 slices |
| `sia` | tickets, sentinel, WhatsApp groups and media, queendoms, roster | unchanged |
| `freshdesk` | the read-only mirror | unchanged |

### 2.1 `gia` (22 tables, names unchanged)

`leads`, `lead_activities`, `lead_notes`, `lead_raw_payloads`, `lead_sla_timers`,
`lead_product_enquiries`, `deals`, `sla_policies`, `agent_routing_config`, `revival_candidates`,
`revival_policies`, `domain_targets`, `ad_creatives`, `ad_spend_daily`, `ad_account_recharges`,
`task_gia_meta`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_conversation_reads`,
`whatsapp_notification_logs`, `service_cases`, `conversation_hooks`.

Notes on the edge cases:

- `tasks` and its family stay in `public`. A ticket spins off a task, a lead spins off a task,
  so tasks are shared. `task_gia_meta` is the Gia link table and moves; its foreign key to
  `public.tasks` keeps working across schemas.
- `whatsapp_*` in `public` is the Gupshup channel for leads and staff notifications. It is
  Gia's channel. The `wag_*` group tables are already in `sia`. **Decide:**
  `whatsapp_notification_logs` also logs task and staff broadcasts. Recommendation: move it with
  its family; it is one log of one channel.
- `service_cases` and `conversation_hooks` are the Call Intelligence helpdesk the Gia agents use
  on calls. **Decide:** move to `gia` (recommended) or keep in `public`.
- `domain_targets` is the founder's monthly deals target per Gia domain. Move.

### 2.2 `client` (12 tables + slices, prefix dropped)

The `client_` prefix becomes the schema name, so `client_facts` → `client.facts`,
`client_events` → `client.events`, and so on: `people`, `facts`, `relations`, `events` (+ the 41
slices, renamed `events_2025_05` style), `documents`, `chunks`, `snapshot`, `health_policy`,
`health_events`, `anticipations`, `access_log`.

The three access functions move with them: `client_visible`, `can_access_client_queendom`,
`get_user_queendom` → `client.visible`, `client.can_access_queendom`, `client.user_queendom`.
The `sia.tickets` policies that call `client_visible` are re-pointed in the same migration.

**Decide the spine name.** `clients` inside `client` reads as `client.clients`. Indulge calls
these people members, so the recommendation is **`client.members`**. The UI keeps saying
Clients; only the table name changes.

## 3. What the move gives us for free, and what it breaks

`ALTER TABLE … SET SCHEMA` changes one catalog row per table. No data is copied, it runs in a
transaction, and it takes under a second per table even on the biggest one.

**Carried across untouched:** every row, every index, RLS enabled state and every policy,
every trigger, every foreign key in both directions, the Realtime publication membership,
the table's own grants, partition attachments (0172 proved this for `wag_*`).

**Breaks, and how each is handled:**

| What | Why it breaks | Fix |
| --- | --- | --- |
| The 58 RPC functions in `public` | 153 are `SECURITY DEFINER SET search_path = public` and write `FROM leads`, not `FROM public.leads` (232 bare references vs 36 qualified). After the move `leads` is not on their path. | One loop in the migration: for every function in `public` whose pinned path is `public`, set it to `public, gia, client`. The functions stay in `public`, so every `.rpc('…')` call in the app (35 distinct) is unchanged. No function body is rewritten. |
| REST exposure | PostgREST only serves schemas listed in `pgrst.db_schemas`. | Add `gia, client` the way 0172 added `sia`, then `NOTIFY pgrst`. |
| Grants | `sia` is service-role only. Gia is read through the **session** client under RLS, so `authenticated` needs `USAGE` on `gia` and `client` plus table grants, mirroring what it has in `public` today. | `GRANT USAGE` + `GRANT ALL ON ALL TABLES` to `authenticated` and `service_role`, plus `ALTER DEFAULT PRIVILEGES` for future tables. RLS still decides rows; the grant only opens the door. |
| App queries | `supabase.from('leads')` means `public.leads`. | Every call on a moved table becomes `.schema('gia').from('leads')` (or `client`). Call sites in `src`: leads 48, lead_activities 20, clients 19, whatsapp_conversations 13, whatsapp_messages 10, lead_raw_payloads 7, lead_notes 7, client_facts 7, and 40-odd more across the smaller tables. Done with one helper per schema (`giaDb()`, `clientDb()` beside the existing `freshdeskDb()`), never inline strings. |
| Realtime channels | A channel names its schema. Three subscribe to moved tables: `whatsapp_messages` (2 sites), `whatsapp_conversations` (1). | Pass `schema: 'gia'`. The channels on `tasks`, `task_events`, `task_remarks`, `notifications`, `activity_events` stay `public`. |
| Generated types | `Database['public']['Tables']['leads']` moves to `Database['gia']`. | Regenerate `database.ts`; fix the 9 files that spell the path out (`src/lib/types/client.ts` and friends). |
| Scripts | `import-shop.ts`, `revert-shop-import.ts`, `import-zoho*.ts`, `seed-*.ts`, the three Python client scripts, `freshdesk/load-export.py`. | Same schema switch. Python (supabase-py) uses `.schema('client')` or the `Accept-Profile` header. |
| Docs | `database.md`, the `.sql` mirror, `auth-and-rbac.md`, module and page specs. | Updated in the same commit. |

**Not affected:** the Python brain (reads through the Node bridge, no direct table access),
Redis (keys carry no schema), the lead webhook and the WhatsApp webhook (they call our services),
Pabbly, Meta and the Shop app (they post to our routes, never to the database), Trigger.dev tasks
(they call our services; redeploy so they pick up the new build), storage buckets and their
policies (they reference `profiles` only), the auth trigger `handle_new_user` (profiles stay).

## 4. Compatibility views: considered, not recommended

We could leave `CREATE VIEW public.leads … AS SELECT * FROM gia.leads` behind for a month so a
forgotten caller keeps working. Against it: Realtime cannot subscribe to a view, embedded
selects through views need verifying, and the generated types would show two `leads`. For it:
a forgotten script fails softly instead of loudly. The only writers into these tables are our
own code and our own scripts, so the recommendation is **no views**, a lint rule instead: an
unscoped `.from()` on a moved table name fails `pnpm lint`. A forgotten reader then fails at
build time, not in production.

## 5. Rehearsal before production (mandatory)

There is no staging project today. We make one for the day:

1. `supabase db dump` of production, schema and data, into the local Supabase stack
   (`supabase start`). This is a full copy, so the rehearsal runs on the real shapes and the
   real row counts.
2. Record row counts for every table in the five schemas (`scripts/db/row-counts.ts`, to be
   written; prints one line per table).
3. Run migrations 0203 (client) and 0204 (gia) against the copy.
4. Regenerate types, build the app against the copy, run the smoke list in §7.
5. Row counts again; the two printouts must match line for line.
6. Run the rollback (§6.4) on the copy once, to prove it, then re-apply.

Only when steps 3 to 6 pass without a single fix do we book the production window.

## 6. Production runbook

### 6.1 Window
Evening IST on a weekday, after the Legacy and Shop teams have signed off. Announce it in the
team WhatsApp the morning of. Expected time inside the window: under 30 minutes, most of it
verification.

### 6.2 Before
- Confirm Point-in-Time Recovery is on in the Supabase project, and take a manual backup.
- Row-count printout of production.
- The app build with the schema changes is already green on `main` and ready to deploy, not
  yet deployed.

### 6.3 Steps
1. Run 0203 and 0204 (each is one transaction: create schema, grants, `SET SCHEMA` loop,
   renames, function `search_path` loop, PostgREST reload).
2. Deploy the app (Vercel), then Trigger.dev (`trigger:deploy`).
3. Smoke list (§7). Row-count printout; compare with the "before".
4. Announce done.

### 6.4 Rollback
Because nothing was copied, the reverse is the same kind of statement: `SET SCHEMA public`
for every moved table, the prefix renames undone, function paths set back to `public`, and the
previous Vercel build promoted. Rehearsed in §5 step 6. Minutes, not hours, and no data is
ever in two places.

## 7. Smoke list (rehearsal and production)

Leads list with filters and pagination · a lead dossier (notes, activities, WhatsApp card,
product enquiries) · add a note · change a status · assign a lead · create a manual lead · the
lead webhook with a sample payload · the WhatsApp page with a live message · dashboard for
an agent, a manager, the founder · performance · campaigns and a campaign detail · budget ·
oversight · escalations · settings roster · revival review tab · Elaya asking about a lead and
about a client · tickets list, a ticket, the board · clients list and a client dossier ·
Freshdesk list.

## 8. Code work, in order

1. `src/lib/supabase/schemas.ts`: the schema names and the two helpers `giaDb(client)` and
   `clientDb(client)` typed against the regenerated `Database`.
2. Services: switch every moved-table call to the helper. Services only; actions and
   components do not touch tables (Rule 03), so the blast radius is `src/lib/services`,
   `src/trigger`, `src/app/api/webhooks`, and the scripts.
3. Realtime: the three WhatsApp channels.
4. Types: regenerate; fix the spelled-out paths.
5. Lint rule for unscoped moved tables.
6. Docs and changelog.

Estimate: rehearsal one day, code two days, production window one evening.

## 9. Decisions needed from the founder

1. `whatsapp_notification_logs` moves to `gia` with its family (recommended) or stays shared.
2. `service_cases` + `conversation_hooks` move to `gia` (recommended) or stay.
3. The spine table: `client.members` (recommended) or `client.clients`.
4. The production evening.
