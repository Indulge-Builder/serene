# Database

> **Purpose:** the schema narrative. Every schema, every table's purpose and key relationships, its RLS posture where it matters, and the functions and views the app leans on.
> **Audience:** engineers.
> **Source-of-truth scope:** what each table is *for* and the contracts around it. Exact DDL lives in `supabase/migrations/` (the truth) and the generated `src/lib/types/database.ts`. Migration history and conventions: `migrations.md`. The authorization model (roles, helpers, RLS philosophy): `auth-and-rbac.md`. Per-page query usage: `../pages/*.md`.
> **Last verified:** 2026-09-26 against the migration files through 0244 (all applied to production), `src/lib/types/database.ts` (generated after 0241, five schemas) and the code that reads them (`schemas.ts`, `gia-task-links.ts`, `backend/app/core/supa.py`). `database_architecture.sql` was not refreshed.

---

## Read this first

- **`database_architecture.sql` is a snapshot, not the truth.** It is a `pg_dump` taken on
  2026-06-12, before migration 0108. It knows nothing about the schema restructure, Sia, the
  member twin, Freshdesk, vendors, subscriptions or most of Elaya, and it still shows the Gia
  tables in `public`. Use it only for the shape of the June tables. For anything newer, the
  migrations are the truth. Regenerate it with `supabase db dump` if a fresh dump is needed.
- **`src/lib/types/database.ts` is the quickest inventory.** It is generated from the linked
  project across `public`, `gia`, `member`, `sia` and `freshdesk`, with a hand-written tail of
  derived types below the generated block. It does not cover `elaya_read` (that schema is not
  exposed to the API).
- **Production has every migration through 0244** (`supabase migration list --linked`,
  2026-09-26). 0245 (`hands`: a `hands` schema for Elaya's second WhatsApp number, plus
  `vendors.kind`) is committed but not applied, so it is not described here yet; see
  `hands-plan.md` and the warning in `migrations.md`, "Production status".

## Schemas at a glance

| Schema | What lives there | On the REST API | Who reads it | How code addresses it |
| --- | --- | --- | --- | --- |
| `public` | Identity (`profiles`), tasks, notifications, activity, Elaya, vendors, subscriptions, usage, suggestions, the MCP ledger, and almost every RPC | yes | session client under RLS; admin client inside services | plain `.from('tasks')` |
| `gia` | Gia (sales): leads, deals, SLA, revival, ad spend, the Gupshup lead WhatsApp, call intelligence. Moved out of `public` on 2026-09-17 (0210) | yes | session client under RLS | `giaDb(client)` |
| `member` | The member twin: the `members` spine, facts, people, relations, timeline, health, snapshot, vault. Renamed from `clients` (0202b) and moved out of `public` (0211) on 2026-09-17 | yes | session client under queendom RLS; admin client for sessionless callers | `memberDb(client)` |
| `sia` | The WhatsApp group archive (`wag_*`), queendoms, Serene's own tickets, the profiler and intake working tables, the ticket training ledger | yes | mostly the admin client; signed-in users read queendoms, tickets, intake cards, a few settings and the training tables under RLS | `client.schema('sia')` inline (no helper yet) |
| `freshdesk` | A read-only mirror of the Freshdesk account (0193) | yes | admin client only (RLS on, zero user policies) | `freshdeskDb()` in `src/lib/services/freshdesk-sync.ts` |
| `elaya_read` | Cleaned views for Elaya's read-only SQL (0223) | no | only the login-less role `elaya_reader`, through `public.elaya_run_query()` | `runElayaQuery()` in `src/lib/services/elaya-query-service.ts` |

The API's schema list is one role setting, on production last set by 0211:
`pgrst.db_schemas = 'public, graphql_public, sia, freshdesk, gia, member'`. `SET` replaces the
whole list, so a migration that exposes a new schema must restate every existing one.

`auth`, `storage`, `realtime` and `vault` belong to Supabase. Extensions live in `extensions`
(`pg_trgm` 0098, `vector` 0110, `pgcrypto` 0166). The subscription password key lives in Vault.

## Working across schemas

1. **PostgREST embeds only inside the schema of the request.** A cross-schema foreign key exists
   and is enforced, but `giaDb(c).from('leads').select('*, profiles!…(full_name)')` returns
   PGRST200, and a page built on it renders empty rather than failing loudly. This emptied the
   leads list, dossier, deals and SLA reads on 2026-09-17, and broke every task status change for
   two days after that (see `schema-restructure-plan.md` §12).
2. **Two standard answers, both in place:**
   - A moved table that needs a staff name embeds the `profiles` view in its own schema:
     `gia.profiles` and `member.profiles` (0212, narrowed to `id, full_name` by 0213).
     `security_invoker = true`, so the caller's RLS on `public.profiles` applies, and only SELECT
     is granted. Add a column only when an embed needs it.
   - Public code that needs a lead link reads through `src/lib/services/gia-task-links.ts`
     (`getTaskIdsForLead`, `getGiaLinksForTasks`, `isLeadTask`): two plain queries instead of one
     embed. Never add a `task_gia_meta` embed back onto a `public.tasks` query.
   - For the member list, the WhatsApp link is mirrored onto `member.members.wa_group_jid` by a
     trigger (0217) so the list never has to reach into `sia`.
3. **The helpers.** `giaDb()` and `memberDb()` live in `src/lib/supabase/schemas.ts`, next to
   `GIA_TABLES` and `MEMBER_TABLES`. ESLint refuses an unscoped `.from('<moved table>')` in
   `src/`. It cannot see an embed inside a select string, so after any schema move, sweep the
   select strings by hand.
4. **Functions did not move.** Every routine in `public` had `gia` and `member` appended to its
   search path (0210, 0211), so no `.rpc()` call changed. The member gate functions
   (`member_visible`, `can_access_member_queendom`, `get_user_queendom`) stay in `public`.
5. **The Python brain has its own client.** `backend/app/core/supa.py` routes moved tables through
   `_MOVED_TABLES`. A future schema move must update it, the Vercel build and the Trigger.dev
   tasks together (see `migrations.md`, "Schema moves").

## Enums

```sql
CREATE TYPE user_role       AS ENUM ('founder','admin','manager','agent','guest');
CREATE TYPE app_domain      AS ENUM ('concierge','onboarding','finance','marketing','tech','shop','business','house','legacy');
CREATE TYPE task_module     AS ENUM ('gia','sia','core');          -- 0138
CREATE TYPE task_event_type AS ENUM ('created','status_changed','reassigned','remark_added','overdue');  -- 0144
```

`user_role` and `app_domain` are created by `20260526000000_base_enums.sql`. `business` was
`b2b` until 0202a renamed the label (rows were not rewritten). Every other vocabulary (lead
status, task status, ticket status, vendor stance, and so on) is `text` plus a CHECK, mirrored by
a constant in `src/lib/constants/`. A new value means a new constant entry and a CHECK migration.

## Access patterns in one table

Full model in `auth-and-rbac.md`. The postures you will meet below:

| Posture | Where | How |
| --- | --- | --- |
| Role and domain RLS | Gia tables, tasks, activity | `(SELECT get_user_role())` / `get_user_domain()`, InitPlan-hoisted (0088) |
| Queendom RLS | `member.*`, `sia.tickets` family, intake cards | `can_access_member_queendom(queendom_id)` and `member_visible(member_id)`: admin, founder, the caller's own queendom, and (0244) the active concierge Joker head for any non-NULL queendom |
| Vendor RLS | every vendor table and the `vendor-invoices` bucket | `can_access_vendors()` (0221): an active profile that is admin, founder, or in the concierge domain |
| Service role only | `freshdesk.*`, `sia.wag_*`, the profiler and intake state, `member_vault`, `elaya_query_log`, usage tables | RLS on with no user policy. The app reads through the admin client behind its own gate (for Sia and Freshdesk, `getSiaViewerScope()` in `sia-access.ts`) |
| Append-only ledger (A-11) | activity, audit, message and money ledgers (listed per schema) | SELECT policy at most. No UPDATE or DELETE policy, ever. Named carve-outs are resolve-once admin-client updates |
| Write through an RPC only | `sia.tickets`, vendor merge and remove | the RPC writes the row and its history in one transaction; EXECUTE is revoked from `authenticated` (Q-13) |

---

## `public`

### Identity and team

**`profiles`**: one row per team member, `id` = `auth.users.id`. The root of all authorization
(Rule 09). Created only by the `on_auth_user_created` trigger (`handle_new_user()`, which also
copies `job_title` (0125) and the seat fields `sia_role` / `queendom_id` (0201) from signup
metadata). Key columns: `role` (default `agent`), `domain` (default `concierge`), `is_active`
(soft-deactivate, never delete), `is_on_leave`, `phone` (E.164; it is how staff WhatsApp contacts
link to accounts), `reports_to`, `timezone`, `last_seen_at` (dormant, nothing writes it).
Preference columns: `theme` (CHECK of eight: earth, air, water, fire, candy, rose, moss, lilac,
after 0157), `appearance` (`light` / `dark` / `system`, 0158), `app_icon` (`icon-1`..`icon-4`,
0121).

The concierge seat layer (0194, 0201, 0242 to 0244): `queendom_id` → `sia.queendoms` and
`sia_role` (`queen`, `bishop`, `genie`, `joker`, `joker_head`, CHECK `profiles_sia_role_values`).
Both are allowed only in the concierge domain; every position names a queendom except the Joker
head, who never has one. Partial unique indexes allow one active queen and one active joker per
queendom and one active Joker head in the company; bishops and genies are many (0242 dropped the
one-bishop index). The self-update branch of `profiles_update` pins `role`, `domain`, `sia_role`
and `queendom_id` (0243), so nobody can change their own seat or queendom through the API.

**`profile_audit_log`**: append-only audit of `role`, `domain`, `is_active`, `is_on_leave`,
`full_name`, `email`, `username` changes (trigger `log_profile_changes()`). `ON DELETE RESTRICT`,
so a profile with history cannot be hard-deleted. It does **not** log `sia_role` or `queendom_id`
changes (an open item in the 0243 changelog entry).

### Tasks

One `tasks` table. `task_category` describes structure only (`personal` | `group_subtask`); what
a task is *about* is carried by a meta table and `tasks.module` (`task_module` enum).

| Table | Purpose and relationships | Notes |
| --- | --- | --- |
| `tasks` | Every task. `status` `to_do / in_progress / in_review / completed / error / cancelled`; `priority` `urgent / high / normal`; `task_type` `call / whatsapp_message / other`; `attachments jsonb` = the checklist; `tags text[]`; `group_id` → `task_groups`; `overdue_at` (stamped once, 0113); repeat nudges `nudge_every_minutes` (30..1440), `nudge_until`, `nudge_count` (0232) | `module = 'gia'` if and only if a `gia.task_gia_meta` row exists (the single-writer rule below). A ticket's sub-work has a `task_ticket_meta` row |
| `task_groups` | Domain-stamped group containers | Visibility is flat (0058b): the creator or anyone assigned a subtask |
| `task_remarks` | Append-only progress timeline. `status_change` CHECK is coupled to `tasks.status` | One narrow admin/founder UPDATE for suppression columns only |
| `task_audit_log` | Append-only log of six fields (title, description, status, priority, due_at, assigned_to) | `ON DELETE CASCADE` on the task |
| `task_events` | The `/oversight` stream (0144): one row per task mutation, domain-stamped | Append-only; manager+ SELECT; no write policy; Realtime on |
| `task_ticket_meta` | Links a task to a `sia.tickets` row (0195), the `task_gia_meta` pattern for Sia | SELECT when the caller can see the ticket's queendom |

**The single-writer rule (load-bearing).** The RPC `create_lead_gia_task` (still in `public`, like
every Gia RPC) and the nurturing branch of `update_lead_status` are the only writers of a
`gia.task_gia_meta` row and of `module = 'gia'`, always together in one transaction. Every other insert writes `module = 'core'` and no meta row.
So "is this a lead follow-up" is `EXISTS task_gia_meta` or `module = 'gia'`, never a category
check. Because `task_gia_meta` now lives in `gia`, reads from `public.tasks` go through
`gia-task-links.ts`.

### Notifications and activity

| Table | Purpose | RLS / writes |
| --- | --- | --- |
| `notifications` | The in-app inbox. `type` CHECK re-stated in full by 0162, extended with six ticket types in 0195 and renamed `ticket_client_*` → `ticket_member_*` in 0202b. `action_url` must be relative | Realtime on (drives the bell) |
| `push_subscriptions` | Per-device Web Push endpoints (0120), `endpoint` UNIQUE | Owner-only; dispatch and prune run on the admin client |
| `notification_preferences` | Sparse per-user mutes per category and channel (0133). No row = on; the gate fails open. Keys mirror `lib/constants/notification-categories.ts`, including five ticket keys (0195, renamed 0202b) | Owner-only |
| `activity_events` | The unified activity stream for the mobile Activity room (0159): `subject_type` lead/task/deal, seven event types, domain-stamped, denormalised `title` | Append-only; admin/founder all, manager own domain, others own rows; emitted only by `emitActivityEvent()`; Realtime on |

### Elaya

The substrate every AI feature plugs into. Deep dives: `../modules/elaya.md` and
`../modules/elaya-analyst.md`. Unless noted, writes are service-role only and the signed-in user
reads only their own rows.

| Table | Purpose | Posture |
| --- | --- | --- |
| `elaya_conversations` | One row per chat session; `channel` `in_app` / `whatsapp`. The 24-hour expiry is enforced in `elaya-service.ts`, not SQL | Self SELECT + self `in_app` INSERT |
| `elaya_messages` | Every turn: `role` user/assistant/tool, `tool_calls`, `meta` (model, usage, the playbook that fired). 0148 added a partial UNIQUE on `meta->>'wa_message_id'` so a WhatsApp redelivery can never run two turns | Append-only (A-11) |
| `user_context` | One row per user: the `persona` settings from `/profile`. The old `learned` blurb is folded only until a user's first `elaya_user_memory` entry exists | Self SELECT |
| `elaya_user_memory` (0237) | The living memory: one row per thing learned about one user (`kind` rule / preference / correction / style / fact / interest), with the user's words as evidence. Retired, never deleted. Context, never permission | Owner + admin/founder SELECT |
| `elaya_improvement_requests` (0237) | When a user says Elaya was wrong about the system. `status` open / fixed / declined / playbook; open and recently fixed ones are folded into prompts as known issues | Owner + admin/founder SELECT; status changes via the admin action |
| `elaya_actions` | The write-tool ledger (0116, used from 0118): proposed → executed / failed / dismissed | State-machine carve-out: resolve-once admin-client UPDATE; never a user UPDATE policy |
| `elaya_playbooks` (0234) | The founder's plain-words method for a kind of question (example questions + instructions), picked by the Python router per turn | Admin/founder SELECT |
| `elaya_jobs` (0235) | Background deep reads queued by a chat turn and run on Trigger.dev (`kind` deep_read; `status` queued / running / done / failed; plan, progress, result, answer) | Requester + admin/founder SELECT |
| `elaya_labels` (0235) | What a deep read decided, per row: UNIQUE (`subject_kind`, `subject_id`, `label_set`), a re-read replaces. Visible to the analyst as `elaya_read.labels` | Admin/founder SELECT |
| `elaya_alerts` (0235) | The live alert sweep's record; `dedupe_key` stops one incident firing twice | Append-only; admin/founder SELECT |
| `elaya_query_log` (0223) | Every SQL the analyst ran through `elaya_run_query`, with outcome and timing | Append-only; RLS on, no policies |
| `mcp_tool_calls` (0226) | Every tool call an outside AI app made through `/api/mcp`: user, client id, tool, ok, duration | Append-only; owner + admin/founder SELECT |
| `llm_providers` | Job tier → provider + model (`routing`, `reasoning`, `heavy` since 0176). Read per request, so a model switch is a row edit | Admin/founder SELECT |
| `elaya_settings` | Key/value switches, read per request. Seeded rows: `daily_message_cap`, `pii_masking_depth`, `session_expiry_hours` (0116); `brain_whatsapp`, `brain_in_app` (0179); `member_profiler_enabled` (0215); `ticket_intake_enabled` (0219); `daily_briefing_enabled` (0225); `mcp_audience` (0233); `elaya_alerts_enabled`, `elaya_alerts_state` (0235). Code also reads unseeded keys that default ON or to a number (`member_assessment_enabled`, `intake_lessons_enabled`, `elaya_labels_refresh_enabled`, `elaya_deep_read_spend_cap_usd`); the readers are in `llm-providers-service.ts` | Admin/founder SELECT |
| `elaya_training_assets` (0150) | Customer-facing material Elaya may send (brochures, testimonials, facts) | Editable: all-authenticated SELECT, manager+ writes |
| `elaya_notes` (0152) | Per-user notes Elaya reads as context (`/notes`) | Owner-only, editable |

### Vendors

The supplier directory the concierge floor books with. Deep dive: `../modules/vendors.md`. Every
table has one SELECT policy on `can_access_vendors()` (0221) and no user write policy: writes go
through the cores in `vendor-mutations.ts` on the admin client. Scores are never stored; they are
computed per read from `get_vendor_score_inputs`.

| Table | Purpose and relationships | Notes |
| --- | --- | --- |
| `vendors` (0183) | The identity spine: `name` + generated `name_key` UNIQUE, `aliases`, `category` / `subcategory`, `status` active / paused / blacklisted, `identity_status` unverified / verified (one-way, `verifyVendorAction`), `contacts jsonb`, `primary_phone`, `sources` (includes `freshdesk_live`, 0214), `import_raw` provenance. Generated `search_text` / `search_key` (0187; contact names and phones added 0227). `deleted_at` / `deleted_by` = removed but kept (0227) | `sia.wag_groups.vendor_id`, `sia.wag_contacts.vendor_id` and `sia.tickets.vendor_id` point here |
| `vendor_capabilities` (0183) | `offers` / `declines` per category, service and cities | Config; cascades on a hard delete |
| `vendor_engagements` (0185) | The job ledger: one row per job per ticket, UNIQUE (`vendor_id`, `source`, `source_ref`); `member_id`, `lead_id`, `agent_id`; outcome completed / cancelled / failed / unknown; `amount_inr`; `invoice_paths[]` into `vendor-invoices` | Append-only with one resolve-once close (`closeEngagementCore`). `ON DELETE RESTRICT` to the vendor: jobs record money that moved |
| `vendor_reviews` (0185) | Manual 1-5 ratings (speed, quality, pricing, reliability) | Append-only |
| `vendor_notes` (0186) | Timestamped notes with author | Append-only; cascades with the vendor |
| `vendor_agent_preferences` (0191) | One teammate's `preferred` / `avoid` stance plus a note, one row per (vendor, agent) | Editable opinion, not history |
| `vendor_merges` (0227) | One row per merge, holding the deleted spine row in full | Append-only |
| `vendor_removals` (0230) | One row per removal: `mode` deleted (nothing attached, row gone) or hidden (`deleted_at` set) | Append-only |

### Subscriptions

The Finance and Tech bills tracker (0163 to 0168). Deep dive: `../modules/subscriptions.md`.
SELECT for admin/founder or the finance/tech domains (the `departments` array is filtering, not a
security boundary); writes admin-client only.

| Table | Purpose | Notes |
| --- | --- | --- |
| `subscriptions` | One account of a tool: billing shape (monthly / yearly / top_up / other), currency, due day or date, `departments text[]`, `tool_id`. `password` is pgcrypto ciphertext under a Vault key (0166); `decrypt_subscription_password` is service-role only | Soft delete via `is_archived` |
| `subscription_payments` | One row per paid cycle; `paid_amount_inr` is entered by hand, never converted | Append-only |
| `subscription_topups` | Top-ups of prepaid accounts | Append-only |
| `subscription_password_reveals` | Written before any plaintext leaves (0167) | Append-only; admin/founder SELECT |
| `subscription_tools` | One tool, many accounts; generated `name_key` UNIQUE (0168) | |

### Usage and suggestions

- **`usage_heartbeats`** / **`usage_daily`** (0126): active-time tracking for `/admin/usage`.
  RLS on with no policies; the jobs write on the admin client and the page reads only through
  `get_agent_usage` (revoked tier). Heartbeats are append-only and pruned after 30 days.
- **`suggestions`** (0134): staff bug reports and ideas, screenshots as paths in the private
  `suggestions` bucket. Sender reads own; admin/founder read all and have one narrow UPDATE for
  the status fields; no DELETE policy.

---

## `gia`

The Gia sales business: 22 tables moved from `public` by 0210 with their rows, indexes, policies
and grants intact. Read through `giaDb()`. Deep dives: `../modules/gia.md`,
`../modules/revival.md`, `../modules/call-intelligence.md`,
`../integrations/lead-ingestion.md`, `../integrations/whatsapp-gupshup.md`.

### Leads

**`leads`**: the lead record. Identity (`first_name`, `last_name`, `email`, `phone` E.164,
`city`, `personal_details jsonb`), routing (`domain`, `assigned_to`, `assigned_at`), lifecycle
(`status` `new → touched → in_discussion → nurturing → won | lost | junk`, `status_changed_at`,
`last_activity_at`, `resolution_reason`, `archived_at` soft delete; archived rows are immutable
to users, 0091), attribution (flat `source` / `medium` / `utm_campaign` plus the immutable
`attribution jsonb`; `form_data` is the raw payload written once at insert), call telemetry
(`call_count`, `last_call_outcome`, `last_call_outcome_at`), dedup (`previous_lead_id`; the
active-phone partial index on `lead_phone_key(phone)`, 0137, which is UNIQUE unless the apply met
old collisions and fell back to a plain index: TODO: verify on production), `slug` (unique,
human-readable, fixed to keep capitals in 0147), `search_text` (generated, trigram-indexed, 0098),
`service_interests text[]` (never an enum, 0109), `lead_intent`, and `welcomed_at` (the
one-welcome stamp, 0151).

| Table | Purpose | Notes |
| --- | --- | --- |
| `lead_activities` | Every status change, assignment, call and note event | Append-only; `actor_id` NULL = system |
| `lead_notes` | Note bodies; all team-visible | Append-only |
| `lead_raw_payloads` | Every inbound webhook payload, failures included (`ingestion_error`) | Admin/founder SELECT; keeps full PII by decision (see `lead-ingestion.md`) |
| `lead_sla_timers` | SLA engine state (`pending / fired / cancelled`) | Service role only |
| `lead_product_enquiries` (0180) | Shop-app product enquiries, many per lead; `external_lead_id` UNIQUE is the idempotency key; product columns are a frozen snapshot | Append-only; SELECT follows the parent lead |
| `task_gia_meta` | The task → lead link (`task_id`, `lead_id`, `call_outcome`); see the single-writer rule under `public.tasks` | Created with the task by `create_lead_gia_task` |
| `agent_routing_config` | The round-robin pool: one row per agent or manager, `is_active` toggle, advisory `shift_start` / `shift_end` / `shift_days` | Rows auto-created by trigger when a profile becomes agent or manager (0124) |

### Deals, spend and targets

| Table | Purpose | Notes |
| --- | --- | --- |
| `deals` | First-class closed deals (0072). `lead_id` nullable (walk-ins). `deal_type` is derived from the domain, never picked (onboarding → membership with a duration, shop → retail with a category, house / legacy → sale). `source` CHECK must list every `LEAD_SOURCES` value (now incl. `shop_app` 0180 and `self` 0182). `member_id` → `member.members` (FK since 0202b): the one Gia-to-member join column, though nothing in the app sets it yet (walk-in deals write NULL) | No user write policies: `recordDealCore` on the admin client |
| `ad_creatives` | Campaign videos by `campaign_key` (many per campaign) | Files in the `ad-creatives` bucket |
| `ad_spend_daily` (0104) | Day-grain Meta spend from uploaded CSV/XLSX, UNIQUE (`campaign_key`, `spend_date`, `source`) | Manager+ read, admin/founder write |
| `ad_account_recharges` (0139) | Money sent to each Meta ad account; balance = recharged minus spent | Editable finance figure (UPDATE/DELETE for admin/founder); a CHECK rejects card numbers |
| `domain_targets` (0105) | Founder monthly deals-closed targets per domain | |

### Follow-up engines

| Table | Purpose | Notes |
| --- | --- | --- |
| `sla_policies` (0111) | One row per SLA / cadence / task-due rule, read per job run | Admin/founder SELECT; service-role writes. Not the same table as `freshdesk.sla_policies` or `sia.ticket_sla_policies` |
| `revival_policies` (0119) | Silence thresholds and daily cap per status | Admin/founder SELECT |
| `revival_candidates` (0119) | The revival ledger (`open → actioned / dismissed`), one open candidate per lead | SELECT scoped through the lead; resolve-once admin UPDATE; revival never writes the lead row |

### Lead WhatsApp (Gupshup) and call intelligence

| Table | Purpose | Notes |
| --- | --- | --- |
| `whatsapp_conversations` | One per lead / phone (`wa_id`, `lead_id` both UNIQUE) | Realtime on; access via `can_access_wa_conversation()` |
| `whatsapp_messages` | Messages; `media_url` holds a path in the private `whatsapp-media` bucket | Append-only except the delivery-receipt status UPDATE; Realtime on |
| `whatsapp_conversation_reads` | Per-user read position | |
| `whatsapp_notification_logs` | One row per outbound template or session send, last four digits only. `type` CHECK last widened by 0177 (`sia_alert`) | |
| `service_cases`, `conversation_hooks` (0110) | The call-intelligence library and talking points | All-authenticated read; admin/founder write |

This Gupshup family is the Gia lead channel. It never mixes with the Sia WhatsApp group archive
in `sia.wag_*`.

---

## `member`

The member twin: everything Indulge knows about a member. Built in `public` as `clients` (0181,
0194), renamed to members (0202b), moved here (0211). Read through `memberDb()`. Deep dive:
`../modules/members.md`.

Access: `members` and every table keyed by `member_id` use `member_visible(member_id)` or
`can_access_member_queendom(queendom_id)` (both in `public`). A concierge seat sees its own
queendom, the Joker head sees every queendom, admin and founder see everything. Services that run
without a session (Elaya, Trigger.dev) use the admin client and gate with `canAccessMember()` in
code first.

| Table | Purpose and relationships | Posture |
| --- | --- | --- |
| `members` | The spine: one row per member human. `full_name`, `primary_phone` UNIQUE, `alt_phones`, `freshdesk_contact_id`, `zoho_customer_id`, `app_member_id`, `queendom_id`, `tier`, the strict membership summary (`membership_type`, `membership_status`, `membership_amount_inr`, start, end), `identity_status`, `sources`, `import_raw`, `consent`. `wa_group_jid` is a trigger-kept mirror of `sia.wag_groups.member_id` (0217): never write it from code | Queendom SELECT / INSERT / UPDATE; no DELETE |
| `member_people` | The humans under a membership (spouse, child, staff) | Queendom read and write |
| `member_facts` | Typed facts per facet with source, confidence, evidence and `superseded_by`. `source` includes `freshdesk_note` (0236), which `FACT_SOURCES` in `lib/constants/member-facets.ts` does not list yet | Append-only. A signed-in user may insert only an `agent_note` fact under their own name (no model run); corrections supersede through the service-role core |
| `member_relations` | The relationship map (people, vendors, places, brands), with strength and evidence | Derived; service-role writes |
| `member_events` | The timeline, RANGE-partitioned by month (2024-01 to 2027-03, plus DEFAULT) | Derived; service-role writes |
| `member_documents` / `member_chunks` | Prose and masked chunks with `vector(1024)` embeddings (HNSW). Nothing writes them yet: the tables are ready for a later retrieval layer | Chunks have no user policy at all |
| `member_snapshot` | One `data jsonb` per member. Writers merge their own key: `pulse` (0241), `assessment` (member-assessment.ts), `narrative` (reserved for the profiler) | Service-role writes |
| `member_health_policy` | Delta and half-life per health signal (rows, not code) | All-authenticated read; admin-action writes |
| `member_health_events` | The health ledger | Append-only; users may insert only `manual_adjust` |
| `member_anticipations` | The "right time" queue (occasions, renewals) | Status moves through the admin client |
| `member_access_log` | Every card open (DPDP audit) | Append-only; insert own, admin/founder read |
| `member_vault` (0236) | Cards and ID documents: `label`, `hint` (last four), `expires_on` in the clear; the secret as AES-256-GCM `ciphertext` + `nonce` under the app-side `MEMBER_VAULT_KEY` | RLS on with **no** policy for signed-in users. Only `member-vault.ts` on the service role touches it, behind the gated actions. Never loaded into a dossier, tool result or prompt |
| `member_vault_access` (0236) | Every reveal, add, delete and import, with actor and reason, written before the secret leaves | Append-only; admin/founder read |

Views and functions:

- **`member.members_list`** (0241): members plus the pulse and judgement columns
  (`activity_score`, `last_contact_at`, `open_tickets`, `assessment_*`) so `/members` can sort on
  them. `security_invoker`, so the members RLS applies.
- **`member.profiles`** (0212/0213): the staff-name lookup for embeds.
- **`member.compute_member_pulse()`** (0241): one statement over the WhatsApp archive, the
  Freshdesk mirror and Sia tickets that writes activity numbers and `activity_score` into every
  `member_snapshot.data->pulse`. Service role only; hourly from Trigger.dev.

---

## `sia`

The concierge side: the WhatsApp group archive, the org units, and Serene's own tickets. Created by
0172 (the `wag_` tables moved out of `public`). This section is the table inventory; how the
pieces work together lives in `../modules/sia.md` (the WhatsApp side), `../modules/tickets.md` and
`../integrations/sia-connector.md` (the watcher that writes the archive).

### The WhatsApp group archive (`wag_*`)

Written by the Baileys watcher in `connector/`, read by the app on the admin client. RLS is on for
every table and every partition (0170) with **zero** user policies. Three laws from 0169: raw
first (every event stored before parsing), facts never mutate (an edit is a new row, a delete flips
`is_revoked`), inserts never fail (no CHECK on WhatsApp's own vocabularies; DEFAULT partitions).

| Table | Purpose |
| --- | --- |
| `wag_raw_events` | Every Baileys event untouched; partitioned monthly by `received_at` (2026-08 to 2027-03 + DEFAULT) |
| `wag_messages` | The messages; identity is WhatsApp's triple (`chat_jid`, `wa_message_id`, `sender_jid`); partitioned monthly by `wa_timestamp` (same range) |
| `wag_groups` | Every group a watcher sits in. `group_kind` member / vendor / internal / unmapped; `member_id` → `member.members` (the one source of truth for the link); `vendor_id` → `public.vendors` |
| `wag_contacts` | Every person seen. `participant_role` (our vocabulary, incl. `joker` since 0204); `staff_profile_id` → `profiles`, set by phone (`sia-staff-link.ts`); `member_id`, `vendor_id` |
| `wag_group_members` | Who is in which group, with history (`left_at`, never deleted) |
| `wag_media` | Media per message; `storage_path` points at S3 (`s3://…`), not Supabase Storage; `download_status` pending / retrying / done / dead_letter / expired |
| `wag_reactions`, `wag_receipts` | Current reaction and receipt state (history lives in raw) |
| `wag_pipeline_cursors` | Per-consumer positions in the stream. Unused: the profiler and intake keep their own per-group bookmarks instead |
| `wag_auth_state` (0174) | The watcher's Baileys session keys. Live key material: never add a user policy |
| `wag_watcher_status` (0175, 0177) | One-row heartbeat: state, `beat_at`, the pairing QR, and `restart_requested_at` (the app → watcher control channel) |

### Queendoms and the model-run ledger

- **`queendoms`** (0194): the org units (three seeded), with `freshdesk_group_id` joining the
  mirror. Readable by every signed-in user. The seat columns 0194 created were dropped by 0201:
  seat holders are derived from `profiles`.
- **`extraction_runs`** (0194): one row per model run over member data (profiler, intake,
  ticket drafts, sentinel, assessment, the lesson writer, the brief, alerts and deep reads), with
  tokens, cost, prompt version and masked output. Service role only.

### Tickets

Serene's own ticketing (0195 onward). The state machine lives in `lib/constants/tickets.ts` and is
enforced in `ticket-mutations.ts`.

| Table | Purpose | Posture |
| --- | --- | --- |
| `tickets` | Current state: `ticket_no` (T-000001), `member_id`, `queendom_id`, origin, category, brief / checklist / money jsonb, priority and approval, SLA due stamps, `vendor_id`, `tags` (0200), `sentinel_state` and `next_wake_at` | Queendom SELECT; **written only by `sia.create_ticket` / `sia.apply_ticket_change`**; Realtime on (0200) |
| `ticket_events` | The ticket diary, RANGE-partitioned by month (2026-09 to 2027-12 + DEFAULT) | Append-only; queendom SELECT |
| `ticket_message_links` | Which WhatsApp messages (soft triples) or Freshdesk ids belong to a ticket | Append-only |
| `ticket_sla_policies` | Response, update, silence and resolve targets per queendom / category / priority / tier; most specific wins | All-authenticated SELECT; admin-action writes |
| `ticket_settings` (0200) | Founder-editable status labels and the tag vocabulary | All-authenticated SELECT |
| `genie_roster` | Shifts, capacity, specialities, leave. Nothing reads or writes it yet | Queendom SELECT |

### Profiler, intake and the training loop

| Table | Purpose | Posture |
| --- | --- | --- |
| `codenames` (0215) | One stable code name per sender per group, so real names never reach a model | Service role only |
| `profiler_group_state` (0215, 0218) | The profiler's bookmark per group, with `fail_count` | Service role only |
| `intake_proposals` (0219) | Intake cards: what Serene thinks a member asked for, the drafted ticket, the outcome (`open / accepted / dismissed / expired`) and dismiss reason | Queendom SELECT; service-role writes |
| `intake_group_state` (0219) | Intake's bookmark per group | Service role only |
| `draft_reviews` (0239) | The training ledger: one row per human verdict on a machine draft, with draft, final, corrections and the human's words | Append-only; admin/founder SELECT |
| `intake_lessons` (0240) | Versioned instructions for the ticket AI per kind; one approved and one draft per kind | Admin/founder SELECT; service-role writes |

---

## `freshdesk`

A faithful, read-only mirror of the Freshdesk account (0193). Serene never writes to Freshdesk and
never writes business fields here; the sync overwrites them. RLS on with zero user policies; the
pages and Elaya read on the admin client, scoped by `getSiaViewerScope()`. Deep dive:
`../integrations/freshdesk.md`.

| Table | Purpose |
| --- | --- |
| `tickets` | Current state of every ticket plus `raw`, `custom_fields`, `attachments` (0197) and a soft `member_id` link; `conversations_synced_at` NULL = threads to fetch |
| `conversations` | Notes and replies. `media_synced_at` NULL = files still to copy (0197); `vendor_extracted_at` NULL = not yet read by the vendor extractor, `vendor_extract_attempts` counts failures (0214). The sync's upsert must never touch either extractor column |
| `contacts`, `agents`, `groups`, `ticket_fields`, `sla_policies` | Reference data (no CHECK on any Freshdesk value) |
| `ticket_changes` | Every field flip the sync observes: the movement history. Append-only |
| `webhook_events` | The raw webhook inbox. Append-only |
| `sync_state`, `sync_runs` | Cursors and the audit of every sync step and its API budget |

---

## `elaya_read`

The founder's "ask the database" door (0223). A login-less role, `elaya_reader`, can see only
this schema: 40 views with explicit column lists (no phone, email, password, login, raw payload or
WhatsApp jid; groups and senders appear as md5 ids; long text is cut short), the
`data_dictionary` view that describes them (0223), and `labels` (0235). `elaya_read.run(sql, max_rows)` runs a query as that
role in a READ ONLY transaction, wrapped as one sub-select, row-capped (5,000 since 0231), and
refuses schema-qualified names and dangerous built-ins. The only entry point is
`public.elaya_run_query()` (service role), called by `runElayaQuery()` behind the founder/admin
gate, and every query is logged in `public.elaya_query_log`.

A column added to a base table is invisible here until a migration adds it to a view. New data for
the analyst = a new view with an explicit column list and a `COMMENT`. Deep dive:
`../modules/elaya-analyst.md`.

---

## Storage buckets

| Bucket | Access | Notes |
| --- | --- | --- |
| `avatars` (0071) | public read | own-object writes |
| `ad-creatives` (0012) | public read | admin/founder writes (0092) |
| `elaya-training` (0150) | public read | Gupshup fetches sent media unsigned; manager+ writes |
| `suggestions` (0135) | private | writes under the caller's own `uid/` prefix; admin/founder read |
| `whatsapp-media` (0141a) | private | Gia lead media; admin-client writes and signed reads |
| `subscription-invoices` (0163) | private | uploads under own `uid/`; tracker audience read |
| `vendor-invoices` (0184) | private | flat attachment-id paths; read policy on `can_access_vendors()` (0221); admin-client signed URLs |
| `freshdesk-attachments` (0197) | private | the sync copies Freshdesk files here; admin/founder read policy; signed one-hour links |

Every row stores a storage **path**, never a URL. Sia WhatsApp group media is not in Supabase
Storage: the watcher writes it to S3.

## Realtime publication

`notifications`, `task_remarks`, `task_events`, `activity_events`, `gia.whatsapp_conversations`,
`gia.whatsapp_messages` (membership re-asserted by 0210), and `sia.tickets` (0200). RLS still
decides which rows a subscriber receives.

## RPC and view inventory

Around 80 functions across the schemas. The rule for each: a SECURITY DEFINER read that takes a
scope parameter has EXECUTE revoked from `authenticated` and is called only from the admin client
(Q-13); one that derives scope from `auth.uid()` keeps the `authenticated` grant. The load-bearing
ones:

**`public`**

- RLS helpers: `get_user_role`, `get_user_domain`, `get_user_queendom` (0194),
  `can_access_member_queendom` / `member_visible` (0194 as `client_*`, renamed 0202b, Joker head
  0244), `can_access_vendors` (0221), `can_access_wa_conversation` (0032).
- Lead writes and reads: `get_next_round_robin_agent`, `get_active_lead_by_phone`,
  `generate_lead_slug`, `lead_phone_key`, `add_lead_call_note`, `update_lead_status`,
  `add_lead_plain_note`, `create_lead_gia_task`, `get_leads_status_counts` (agent domain narrowing,
  0161b), `get_recent_lead_activity`, `cold_lead_cutoff`.
- Dashboards and performance: `get_dashboard_summary`, `get_lead_pipeline_refresh`,
  `get_campaign_*`, `get_domain_health_metrics`, `get_deals_summary`, `get_budget_summary`,
  `get_agent_performance`, `get_agent_roster_performance`, `get_agent_today_pulse`,
  `get_agent_performance_trend`, `get_agent_first_touch_pairs`, and the helper
  `business_minutes_between` (0161a: response time in 09:00 to 19:00 IST, Monday to Saturday).
- Tasks: `get_personal_tasks`, `get_group_task_summaries`, `add_task_remark_with_status`,
  `get_gia_tasks`, `get_domain_task_summary` (0160), the oversight trio `get_team_task_overview` /
  `get_team_agent_breakdown` / `get_agent_tasks_oversight`, and the Elaya sessionless twins (0149).
- Vendors: `get_vendor_score_inputs` (the one score rollup; ask for at most 500 ids per call),
  `search_vendors` / `count_vendors`, `get_vendor_candidates` (ordered by id so it can be paged past
  the 1,000-row cap), `find_vendors_by_history` (past ticket titles, ranked terms; common words
  dropped 0228; the category chip boosts, never filters, 0229), `get_vendor_categories` /
  `get_vendor_cities` (one `text[]` row each, 0192), `get_vendor_agent_usage`,
  `get_vendor_category_usage`, `merge_vendors` (0227: one transaction across seven tables and
  three UNIQUEs), `remove_vendor` (0230: hard delete only when nothing is attached).
- Elaya and usage: `elaya_run_query` (0223), `get_agent_usage` (0126),
  `encrypt_subscription_password` / `decrypt_subscription_password` (0166).
- Generated-column helpers: `immutable_array_to_string` (0110),
  `immutable_contact_search_text` (0227).

**`sia`**

- Tickets: `create_ticket(jsonb, jsonb)` and `apply_ticket_change(uuid, jsonb, jsonb)` (the only
  writers of `sia.tickets`, row and event in one transaction), `claim_sentinel_wakes(p_limit,
  p_lease_min, p_ticket_id)` (0199, one-ticket form 0203), `sentinel_sleep`, and the triggers
  `wake_sentinel_on_event` / `wake_sentinel_on_link`.
- Archive reads: `wag_group_activity()` (per-group count, last message and preview; rewritten for
  speed in 0222), `groups_waiting_for_reply(min_minutes, max_hours)` (0224: member groups whose
  last real message is from the member side), `wag_add_month_partition(parent, month)` (0170:
  creates a month partition with RLS on).
- Profiler and intake: `profiler_due_groups(p_limit, p_statuses)` (Active members by default,
  longest-waiting first, 0220), `profiler_broad_senders`, `intake_due_groups`,
  `member_wa_group` + the `sync_member_wa_group` trigger (0217).
- Training numbers: `intake_stats(p_since, p_exam)` (0238: the intake numbers in one statement)
  and `draft_review_scoreboard(p_since)` (0240).
- All service role only.

**`member`**: `compute_member_pulse()` (0241), views `members_list` and `profiles`.

**`freshdesk`**: `ticket_overview(...)` (0196, `p_member` since 0202b: the `/freshdesk` strip in
one scan), `media_backlog()`, `flag_threads_for_media(p_limit)` (0197/0198). SECURITY INVOKER,
service role only.

**`gia`**: the `profiles` view only. Gia's RPCs live in `public`.

## Open items

- **Partition upkeep.** Nothing scheduled creates new monthly partitions. `wag_messages`,
  `wag_raw_events` and `member_events` have slices through 2027-03, `ticket_events` through
  2027-12; later rows land in each DEFAULT partition (still fully queryable, just not pruned).
  `sia.wag_add_month_partition()` exists for the `wag_` parents only. TODO: verify whether a
  maintenance task is planned before 2027-03.
- **Seat changes are not audited.** `log_profile_changes()` skips `sia_role` and `queendom_id`.
- **The `sia` schema has no query helper.** Code calls `createAdminClient().schema('sia')` inline in
  many services, unlike `giaDb()` / `memberDb()` / `freshdeskDb()`.
- **Unused so far:** `sia.genie_roster`, `sia.wag_pipeline_cursors`, `member.member_documents`,
  `member.member_chunks`, the `sia` value of `task_module`, and `gia.deals.member_id` (never set).
