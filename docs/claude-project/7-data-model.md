# Serene: Data Model and RPCs (Claude Project digest)

> **Purpose:** the Postgres data model in one read: the six schemas, every table grouped by schema, the load-bearing functions and views, the RLS postures, storage, and what is applied on production.
> **Audience:** a Claude Project chat that cannot read the repo, and the engineers who use it.
> **Source-of-truth scope:** a digest. The truth is `supabase/migrations/` (each file's header carries the reasoning). Full narrative: `docs/architecture/database.md`; migration history, conventions and the full index: `docs/architecture/migrations.md`; the authorization model: `docs/architecture/auth-and-rbac.md`. The rules the schema obeys are in `6-engineering-rules.md`.
> **Last verified:** digested 2026-09-26 from `database.md` and `migrations.md` as refreshed that day (both verified against every migration file through 0245 and production's applied list, `supabase migration list --linked`).

## Production status (read first)

- **Migrations 0000 to 0244 are all applied to production** (checked 2026-09-26). Older "not yet
  applied" notes in the changelog or the migration index are history.
- **0245 (`hands`) is committed but NOT applied.** It creates a `hands` schema for Elaya's second
  WhatsApp number (tables `auth_state`, `connector_status`, `allowed_contacts`, `threads`,
  `raw_events`, `messages`, and an `outbox` the connector polls), a private `hands-media` bucket,
  and `vendors.kind` (`human` / `agent`). Plan: `docs/architecture/hands-plan.md`. As first
  committed it set the API's exposed-schema list without `gia` and `member`, which would have
  emptied the leads, deals and members pages on push; it was fixed before any push (commit
  9f486fc). Do not describe the `hands` tables as live. `handsDb()` already exists in
  `src/lib/supabase/schemas.ts` for when it lands.
- **Next free migration number: 0246.**
- `docs/architecture/database_architecture.sql` is a `pg_dump` from 2026-06-12 (before 0108). It
  knows nothing about the schemas below. Do not use it for anything newer than June.
- `src/lib/types/database.ts` is the fastest inventory: generated across `public`, `gia`, `member`,
  `sia`, `freshdesk` (not `elaya_read`, which is not on the API), with a hand-written tail of
  derived types below the generated block. A regen must keep that tail byte-identical.

## Ground rules

- **RLS on every table, in its creation migration** (A-08), partitions included: Postgres does not
  pass RLS from a partitioned parent to its children.
- **Authorization reads only `public.profiles`** (A-01). Policies call `get_user_role()`,
  `get_user_domain()`, `get_user_queendom()` (SECURITY DEFINER, pinned `search_path`, wrapped in
  `(SELECT ...)` so Postgres hoists them).
- **Four real enums:** `user_role` (founder, admin, manager, agent, guest), `app_domain` (concierge,
  onboarding, finance, marketing, tech, shop, business, house, legacy; `b2b` became `business` in
  0202a), `task_module` (gia, sia, core; 0138), `task_event_type` (0144). Every other vocabulary is
  `text` plus a CHECK mirrored by a constant in `src/lib/constants/` (a new value = a constant entry
  plus a CHECK migration that restates the full list).
- **Append-only ledgers** (A-11): at most a SELECT policy, never an UPDATE or DELETE policy. Named
  exceptions are resolve-once admin-client updates (listed in `6-engineering-rules.md`).
- **Two-tier SECURITY DEFINER RPCs** (Q-13): self-scoped ones derive the caller from `auth.uid()`
  and keep the `authenticated` grant; scope-parameter ones have EXECUTE revoked and run only on the
  admin client with session-derived arguments. New functions in `sia`, `member`, `freshdesk`
  default to service role only.
- **No user write policy by design** on several tables (`deals`, vendors, subscriptions,
  `sia.tickets`): the server action's gate plus the admin client is the write boundary, and SELECT
  policies still decide who sees a row.
- **Service-role-only tables** (RLS on, zero user policies): the whole `freshdesk` schema, the
  `sia.wag_*` archive, the profiler and intake state, `member.member_vault`, `elaya_query_log`, the
  usage tables. The app reads them on the admin client behind a code gate (`getSiaViewerScope()`,
  `canAccessMember()`), which is the trust boundary there.

## The six schemas

| Schema | What lives there | On the REST API | How code addresses it |
| --- | --- | --- | --- |
| `public` | Identity (`profiles`), tasks, notifications, activity, Elaya, vendors, subscriptions, usage, suggestions, the MCP ledger, and almost every RPC | yes | plain `.from('tasks')` |
| `gia` | Gia (sales): leads, deals, SLA, revival, ad spend, the Gupshup lead WhatsApp, call intelligence. 22 tables moved from `public` on 2026-09-17 (0210) | yes | `giaDb(client)` |
| `member` | The member twin: the `members` spine, facts, people, relations, timeline, health, snapshot, vault. Built as `clients` (0181, 0194), renamed members (0202b), moved here (0211) on 2026-09-17 | yes | `memberDb(client)` |
| `sia` | The WhatsApp group archive (`wag_*`), queendoms, Serene's own tickets, profiler and intake state, the ticket training ledger (created 0172) | yes | `client.schema('sia')` inline (no helper yet) |
| `freshdesk` | A read-only mirror of the Freshdesk account (0193) | yes | `freshdeskDb()` in `freshdesk-sync.ts` |
| `elaya_read` | Cleaned views for Elaya's read-only SQL (0223) | no | only through `public.elaya_run_query()` |

**The exposed-schema list** is one role setting, last set by 0211:
`pgrst.db_schemas = 'public, graphql_public, sia, freshdesk, gia, member'`. `ALTER ROLE ... SET`
replaces the whole value, so a migration exposing a new schema must restate every existing one,
then `NOTIFY pgrst, 'reload config'` and `'reload schema'`.

**Working across schemas.**

1. PostgREST embeds only inside the schema of the request. A cross-schema foreign key is real and
   enforced, but an embed across it returns PGRST200 and the page renders empty. This emptied the
   leads pages on 2026-09-17 and broke every task status change for two days after.
2. The fixes in place: read-only `gia.profiles` and `member.profiles` views (0212, narrowed to
   `id, full_name` by 0213, `security_invoker`) for staff-name embeds; `gia-task-links.ts` for the
   `public.tasks` to `gia.task_gia_meta` link (two plain queries, never an embed); a trigger-kept
   `member.members.wa_group_jid` mirror (0217) so the member list never reaches into `sia`.
3. Functions did not move. Every routine in `public` had `gia, member` appended to its search path,
   so no `.rpc()` call changed. Gia's RPCs and the member gate functions live in `public`.
4. The Python brain has its own PostgREST client (`backend/app/core/supa.py`, `_MOVED_TABLES`). A
   schema move must update it, the Vercel build and the Trigger.dev tasks in one release.

## Access postures you will meet

| Posture | Where | How |
| --- | --- | --- |
| Role and domain RLS | Gia tables, tasks, activity | `get_user_role()` / `get_user_domain()` (InitPlan-hoisted, 0088) |
| Queendom RLS | `member.*`, the `sia.tickets` family, intake cards | `can_access_member_queendom(queendom_id)` and `member_visible(member_id)`: admin, founder, the caller's own queendom, and (0244) the active Joker head for any non-NULL queendom |
| Vendor RLS | every vendor table and the `vendor-invoices` bucket | `can_access_vendors()` (0221): an active admin, founder or concierge-domain profile |
| Service role only | `freshdesk.*`, `sia.wag_*`, profiler and intake state, the member vault, `elaya_query_log`, usage | no user policy; code gate on the admin client |
| Append-only | activity, audit, message and money ledgers | SELECT at most |
| Write through an RPC only | `sia.tickets`, vendor merge and remove | the RPC writes row plus history in one transaction; EXECUTE revoked from `authenticated` |

---

## `public`

### Identity and team

- **`profiles`**: one per team member, `id` = `auth.users.id`, the root of all authorization.
  Created only by the `on_auth_user_created` trigger (`handle_new_user()`, which copies
  `job_title` (0125) and the seat `sia_role` / `queendom_id` (0201) from signup metadata). Columns:
  `role` (default agent), `domain` (default concierge), `is_active` (soft-deactivate, never
  delete), `is_on_leave`, `phone` (E.164; the only way Elaya's WhatsApp gate and the Sia staff link
  recognise a person), `reports_to`, `timezone`, dormant `last_seen_at`, and preferences `theme`
  (eight keys, 0157), `appearance` (light / dark / system, 0158), `app_icon` (icon-1..4, 0121).
- **The concierge seat layer** (0194, 0201, 0242 to 0244): `queendom_id` → `sia.queendoms` and
  `sia_role` (queen, bishop, genie, joker, joker_head; CHECK `profiles_sia_role_values`). Concierge
  domain only. Every seat names a queendom except the Joker head, who never has one. Partial unique
  indexes: one active queen and one active joker per queendom, one active Joker head in the
  company; bishops and genies are many (0242). The self-update branch of `profiles_update` pins
  `role`, `domain`, `sia_role` and `queendom_id` (0243): nobody changes their own seat.
- **`profile_audit_log`**: append-only, `ON DELETE RESTRICT`, via `log_profile_changes()`: role,
  domain, active, leave, name, email, username. It does **not** log seat or queendom changes (open
  item).

### Tasks

`tasks` is one table. `task_category` is structure only (`personal` | `group_subtask`); what a task
is about is `tasks.module` plus a meta table.

| Table | Purpose | Notes |
| --- | --- | --- |
| `tasks` | status `to_do / in_progress / in_review / completed / error / cancelled`; priority urgent / high / normal; `task_type` call / whatsapp_message / other; checklist in `attachments jsonb`; `tags text[]`; `group_id`; `overdue_at` (stamped once, 0113); repeat nudges `nudge_every_minutes` (30..1440), `nudge_until`, `nudge_count` (0232) | `module = 'gia'` if and only if a `gia.task_gia_meta` row exists |
| `task_groups` | domain-stamped containers | flat visibility: creator or any subtask assignee (0058b) |
| `task_remarks` | append-only progress timeline, `status_change` CHECK coupled to `tasks.status` | one narrow admin/founder UPDATE for suppression columns |
| `task_audit_log` | six fields logged | append-only, CASCADE with the task |
| `task_events` | the `/oversight` stream (0144) | append-only, manager+ SELECT, no write policy, Realtime |
| `task_ticket_meta` | task → `sia.tickets` link (0195) | SELECT when the caller can see the ticket's queendom |

**Single-writer rule:** `create_lead_gia_task` and the nurturing branch of `update_lead_status` are
the only writers of a `task_gia_meta` row and of `module = 'gia'`, always together. Every other
insert is `module = 'core'`. "Is this a lead follow-up" = `EXISTS task_gia_meta` or `module='gia'`.

### Notifications and activity

- **`notifications`**: the in-app inbox; `type` CHECK restated in full by 0162, six ticket types
  added in 0195 (renamed `ticket_member_*` in 0202b); `action_url` relative only; Realtime drives
  the bell.
- **`push_subscriptions`** (0120): one row per device, `endpoint` UNIQUE; owner-only RLS, no
  UPDATE; dispatch and dead-endpoint prune on the admin client.
- **`notification_preferences`** (0133): sparse per-user mutes per category and channel
  (`in_app`, `whatsapp`). No row = on; the gate fails open. `lead_initiation` and `elaya_reply` have
  no key and can never be muted.
- **`activity_events`** (0159): the mobile Activity room's stream; lead / task / deal subjects,
  domain-stamped; append-only; admin/founder all, manager own domain, others own rows; emitted only
  by `emitActivityEvent()`; Realtime.

### Elaya

Writes are service-role only unless noted; users read their own rows.

| Table | Purpose |
| --- | --- |
| `elaya_conversations` / `elaya_messages` | chat sessions (`channel` in_app / whatsapp; 24-hour expiry in code) and every turn (append-only; 0148 partial UNIQUE on `meta->>'wa_message_id'` so a WhatsApp redelivery never runs twice) |
| `user_context` | the `/profile` persona; the old `learned` blurb folds only until a user's first memory entry |
| `elaya_user_memory` (0237) | the living memory: one row per thing learned about one user (rule, preference, correction, style, fact, interest), retired never deleted. Context, never permission |
| `elaya_improvement_requests` (0237) | "Elaya was wrong about the system"; open / fixed / declined / playbook; folded into prompts as known issues |
| `elaya_actions` | the write-tool ledger: proposed → executed / failed / dismissed (resolve-once admin UPDATE) |
| `elaya_playbooks` (0234) | the founder's plain-words method per kind of question, picked by the Python router |
| `elaya_jobs`, `elaya_labels`, `elaya_alerts` (0235) | deep-read jobs; per-row verdicts (UNIQUE subject + label set; visible to the analyst as `elaya_read.labels`); the live alert record (append-only, `dedupe_key`) |
| `elaya_query_log` (0223) | every SQL the analyst ran; append-only, no policies |
| `mcp_tool_calls` (0226) | every MCP connector tool call; append-only; owner + admin/founder SELECT |
| `llm_providers` | job tier → model: `routing`, `reasoning`, `heavy` (0176); read per request |
| `elaya_settings` | key/value switches read per request: `daily_message_cap`, `pii_masking_depth`, `session_expiry_hours`, `brain_whatsapp`, `brain_in_app`, `member_profiler_enabled`, `ticket_intake_enabled`, `daily_briefing_enabled`, `mcp_audience`, `elaya_alerts_enabled`, `elaya_alerts_state`; code also reads unseeded keys with defaults (`member_assessment_enabled`, `intake_lessons_enabled`, `elaya_labels_refresh_enabled`, `elaya_deep_read_spend_cap_usd`) |
| `elaya_training_assets` (0150) | customer-facing material Elaya may send; all-authenticated read, manager+ write |
| `elaya_notes` (0152) | per-user notes Elaya reads as context (`/notes`); owner-only, editable |

### Vendors

One SELECT policy per table on `can_access_vendors()`; no user write policy (writes go through the
cores in `vendor-mutations.ts`). Scores are computed per read, never stored.

| Table | Purpose |
| --- | --- |
| `vendors` (0183) | identity spine: `name` + generated `name_key` UNIQUE, `aliases`, category, `status` active / paused / blacklisted, `identity_status` unverified → verified (one way), `contacts`, `primary_phone`, `sources` (incl. `freshdesk_live`, 0214), `import_raw`, generated search columns (0187, contacts added 0227), `deleted_at` / `deleted_by` (removed but kept, 0227) |
| `vendor_capabilities` | offers / declines per category, service, cities |
| `vendor_engagements` (0185) | the job ledger, UNIQUE (vendor, source, source_ref); outcome, `amount_inr`, invoices. Append-only with three sanctioned writes (close, refine-NULLs-only, the merge fold). `ON DELETE RESTRICT` to the vendor |
| `vendor_reviews`, `vendor_notes` | append-only ratings (speed, quality, pricing, reliability) and notes |
| `vendor_agent_preferences` (0191) | one teammate's preferred / avoid stance, editable |
| `vendor_merges` (0227), `vendor_removals` (0230) | append-only records of merges (the deleted row kept whole) and removals (deleted if nothing attached, else hidden) |

### Subscriptions (0163 to 0168)

SELECT for admin/founder or the finance and tech domains; writes admin-client only.
`subscriptions` (billing shape, currency, due day or date, `departments text[]`, `tool_id`;
`password` is pgcrypto ciphertext under a Vault key, decrypt service-role only; soft delete
`is_archived`), `subscription_payments` and `subscription_topups` (append-only;
`paid_amount_inr` entered by hand, never converted), `subscription_password_reveals` (append-only,
written before any plaintext leaves), `subscription_tools` (one tool, many accounts). Status is
computed in code (`utils/subscription-status.ts`), never stored.

### Usage and suggestions

`usage_heartbeats` / `usage_daily` (0126: RLS on, no policies; jobs write, the page reads through
`get_agent_usage`). `suggestions` (0134: sender reads own; admin/founder read all with one narrow
status UPDATE; screenshots as paths in the private `suggestions` bucket).

---

## `gia` (Gia sales)

- **`leads`**: identity (names, email, E.164 `phone`, `city`, `personal_details`), routing
  (`domain`, `assigned_to`), lifecycle `new → touched → in_discussion → nurturing → won | lost |
  junk` with `status_changed_at`, `last_activity_at`, `resolution_reason`, `archived_at` (archived
  rows immutable, 0091), attribution (flat `source` / `medium` / `utm_campaign` plus the immutable
  `attribution jsonb`, `{}` minimum; `form_data` written once), call telemetry (`call_count`,
  `last_call_outcome`, `last_call_outcome_at`), dedup (`previous_lead_id`; the active-phone partial
  index on `lead_phone_key(phone)`, 0137), a unique human `slug` (fixed to keep capitals, 0147),
  generated trigram `search_text` (0098), `service_interests text[]` (never an enum, 0109),
  `lead_intent`, `welcomed_at` (0151).
- **Lead ledgers:** `lead_activities` and `lead_notes` (append-only), `lead_raw_payloads` (every
  inbound webhook incl. failures, full PII by recorded decision, admin/founder SELECT),
  `lead_sla_timers` (service role), `lead_product_enquiries` (0180: shop-app enquiries, many per
  lead, idempotent on `external_lead_id`, product columns a frozen snapshot), `task_gia_meta`,
  `agent_routing_config` (round-robin pool for agents and managers, advisory shifts).
- **Money and targets:** `deals` (first-class since 0072; `lead_id` nullable for walk-ins;
  `deal_type` derived from the domain: onboarding → membership, shop → retail with a category,
  house / legacy → sale; `source` CHECK lists every lead source incl. `shop_app` and `self`;
  `member_id` → `member.members` exists but nothing sets it yet; no user write policy),
  `ad_creatives`, `ad_spend_daily` (0104, UNIQUE per key, day, source), `ad_account_recharges`
  (0139, editable, card numbers rejected by CHECK), `domain_targets` (0105).
- **Follow-up engines:** `sla_policies` (0111, rules as data; not the same as
  `freshdesk.sla_policies` or `sia.ticket_sla_policies`), `revival_policies` and
  `revival_candidates` (0119; one open candidate per lead; revival never writes the lead row).
- **Lead WhatsApp (Gupshup) and call intelligence:** `whatsapp_conversations` (one per lead,
  Realtime), `whatsapp_messages` (append-only except delivery receipts; media paths in the private
  `whatsapp-media` bucket), `whatsapp_conversation_reads`, `whatsapp_notification_logs` (last four
  digits only; 14 type values), `service_cases` / `conversation_hooks` (0110). This Gupshup family
  never mixes with the Sia group archive.

## `member` (the member twin)

Access through `member_visible()` / `can_access_member_queendom()`: a concierge seat sees its own
queendom, the Joker head every queendom, admin and founder everything. Sessionless callers (Elaya,
Trigger.dev) use the admin client and check `canAccessMember()` first.

| Table | Purpose |
| --- | --- |
| `members` | the spine: `full_name`, `primary_phone` UNIQUE, `alt_phones`, `freshdesk_contact_id`, `zoho_customer_id`, `app_member_id`, `queendom_id`, `tier`, the membership summary (type, status, amount, dates), `identity_status`, `sources`, `consent`; `wa_group_jid` is the trigger-kept mirror of the linked Sia group (never written by code). No DELETE |
| `member_people` | the humans under a membership |
| `member_facts` | typed facts per facet with source, confidence, evidence, `superseded_by`; append-only (a user may insert only their own `agent_note`); `source` admits `freshdesk_note` (0236) |
| `member_relations` | people, vendors, places, brands, with strength and evidence |
| `member_events` | the timeline, partitioned by month (2024-01 to 2027-03 + DEFAULT) |
| `member_documents` / `member_chunks` | prose and `vector(1024)` chunks; nothing writes them yet |
| `member_snapshot` | one `data jsonb` per member; writers merge their own key (`pulse`, `assessment`, reserved `narrative`) |
| `member_health_policy` / `member_health_events` | health signal config (rows, not code) and the append-only ledger |
| `member_anticipations` | the "right time" queue (occasions, renewals) |
| `member_access_log` | every card open (DPDP audit), append-only |
| `member_vault` (0236) | cards and ID documents: label, last-four hint and expiry in the clear, the secret as AES-256-GCM ciphertext under the app-side `MEMBER_VAULT_KEY`. **No policy for signed-in users at all**; only `member-vault.ts` on the service role. Never in a dossier, tool result or prompt |
| `member_vault_access` | every reveal, add, delete and import, written before the secret leaves |

Views and functions: `member.members_list` (0241, members plus pulse and judgement columns, security
invoker, so `/members` can sort by activity), `member.profiles`, `member.compute_member_pulse()`
(0241, one statement over the archive, the Freshdesk mirror and tickets; hourly).

## `sia` (the concierge side)

- **The WhatsApp group archive (`wag_*`)**, written only by the Baileys watcher in `connector/`
  with the service role; zero user policies; three laws from 0169: raw first, facts never mutate
  (an edit is a new row, a delete flips `is_revoked`), inserts never fail (no CHECK on WhatsApp's
  vocabularies, DEFAULT partitions). Tables: `wag_raw_events` and `wag_messages` (partitioned by
  month, 2026-08 to 2027-03 + DEFAULT; message identity is the triple chat_jid, wa_message_id,
  sender_jid), `wag_groups` (`group_kind` member / vendor / internal / unmapped; `member_id` is the
  one source of the member link; `vendor_id`), `wag_contacts` (`participant_role`,
  `staff_profile_id` set by phone, `member_id`, `vendor_id`), `wag_group_members` (with history),
  `wag_media` (storage path is S3, `download_status`), `wag_reactions`, `wag_receipts` (empty by
  design: the watcher never sends), `wag_pipeline_cursors` (unused), `wag_auth_state` (live session
  keys: never add a user policy), `wag_watcher_status` (the one-row heartbeat plus QR and restart
  channel).
- **`queendoms`** (0194): the org units (three seeded), `freshdesk_group_id` joins the mirror;
  readable by every signed-in user. Seat holders derive from `profiles` (the seat columns here were
  dropped by 0201; reading them fails quietly).
- **`extraction_runs`** (0194): one row per model run over member data (profiler, intake, drafts,
  sentinel, assessment, lesson writer, brief, alerts, deep reads) with tokens, cost, prompt version.
- **Tickets** (0195 on): `tickets` (current state: `ticket_no` T-000001, member, queendom, origin,
  category, brief / checklist / money jsonb, priority and approval, SLA stamps, `vendor_id`, `tags`,
  sentinel state; queendom SELECT; **written only by `sia.create_ticket` /
  `sia.apply_ticket_change`**; Realtime), `ticket_events` (the diary, partitioned 2026-09 to
  2027-12 + DEFAULT, append-only), `ticket_message_links` (append-only), `ticket_sla_policies`
  (most specific wins), `ticket_settings` (founder-edited status labels and tags), `genie_roster`
  (unused yet).
- **Profiler, intake, training:** `codenames` (one stable code name per sender per group, so real
  names never reach a model), `profiler_group_state`, `intake_proposals` (the suggested-ticket
  cards, queendom SELECT), `intake_group_state`, `draft_reviews` (0239, append-only human verdicts
  on machine drafts), `intake_lessons` (0240, one approved and one draft lesson per kind).

## `freshdesk` (the mirror)

Read-only mirror (0193), service role only; the sync overwrites business fields and Serene never
writes to Freshdesk. `tickets` (current state plus `raw`, `custom_fields`, `attachments`, a soft
`member_id`), `conversations` (notes and replies; `media_synced_at`; the vendor extractor's queue
columns `vendor_extracted_at` and `vendor_extract_attempts`, which the sync's upsert must never
include), `contacts`, `agents`, `groups`, `ticket_fields`, `sla_policies`, `ticket_changes`
(append-only movement history), `webhook_events` (append-only inbox), `sync_state`, `sync_runs`.

## `elaya_read` (the analyst's door)

About 40 views with explicit column lists (no phone, email, password, login, raw payload or
WhatsApp jid; groups and senders as md5 ids; long text cut), the `data_dictionary` view, and
`labels` (0235). Only the login-less role `elaya_reader` can see this schema.
`elaya_read.run(sql, max_rows)` runs a query as that role in a READ ONLY transaction, as one
wrapped sub-select, row-capped (5,000 since 0231; the chat tool keeps 300 in code). The one entry
point is `public.elaya_run_query()` (service role), behind the founder/admin gate; every query is
logged. A column added to a base table is invisible here until a migration adds it to a view.

---

## Storage

| Bucket | Access | Notes |
| --- | --- | --- |
| `avatars` | public read | own-object writes |
| `ad-creatives` | public read | admin/founder writes |
| `elaya-training` (0150) | public read | Gupshup fetches sent media unsigned; manager+ writes |
| `suggestions` (0135) | private | own `uid/` prefix writes |
| `whatsapp-media` (0141a) | private | Gia lead media, signed reads |
| `subscription-invoices` (0163) | private | own `uid/` uploads |
| `vendor-invoices` (0184) | private | read policy on `can_access_vendors()` |
| `freshdesk-attachments` (0197) | private | the sync copies files here; one-hour signed links |
| `hands-media` (0245) | private | not applied yet |

Rows store a storage **path**, never a URL. Sia group media is not in Supabase Storage: the watcher
writes it to an S3 bucket and the app presigns links.

**Realtime publication:** `notifications`, `task_remarks`, `task_events`, `activity_events`,
`gia.whatsapp_conversations`, `gia.whatsapp_messages`, `sia.tickets`. RLS still filters rows.

## Load-bearing functions (about 80 in all)

**`public`**

- RLS helpers: `get_user_role`, `get_user_domain`, `get_user_queendom`,
  `can_access_member_queendom` / `member_visible` (Joker head since 0244), `can_access_vendors`,
  `can_access_wa_conversation`.
- Leads: `get_next_round_robin_agent` (SELECT FOR UPDATE SKIP LOCKED; agents and managers),
  `get_active_lead_by_phone`, `generate_lead_slug`, `lead_phone_key`, `add_lead_call_note`,
  `update_lead_status`, `add_lead_plain_note`, `create_lead_gia_task`, `get_leads_status_counts`,
  `get_recent_lead_activity`, `cold_lead_cutoff()` (the one cold threshold, now minus 5 days).
- Dashboards and performance: `get_dashboard_summary`, `get_campaign_*`,
  `get_domain_health_metrics`, `get_deals_summary`, `get_budget_summary`,
  `get_agent_performance`, `get_agent_roster_performance`, `get_agent_today_pulse`,
  `get_agent_performance_trend`, `get_agent_first_touch_pairs`, and `business_minutes_between()`
  (response time counted 09:00 to 19:00 IST, Monday to Saturday).
- Tasks: `get_personal_tasks` (keyset cursor; carries the linked lead's identity),
  `get_group_task_summaries`, `add_task_remark_with_status`, `get_gia_tasks`,
  `get_domain_task_summary` (mobile), the oversight trio `get_team_task_overview` /
  `get_team_agent_breakdown` / `get_agent_tasks_oversight`, and the Elaya sessionless twins (0149).
- Vendors: `get_vendor_score_inputs` (the one score rollup, at most 500 ids per call),
  `search_vendors` / `count_vendors`, `get_vendor_candidates` (ordered by id so it can be paged past
  the 1,000-row cap), `find_vendors_by_history` (past ticket titles; common words dropped 0228; the
  category boosts, never filters, 0229), `merge_vendors` (0227, one transaction over seven tables),
  `remove_vendor` (0230).
- Elaya and more: `elaya_run_query`, `get_agent_usage`, `encrypt_/decrypt_subscription_password`.

**`sia`** (all service role): `create_ticket`, `apply_ticket_change` (the only ticket writers),
`claim_sentinel_wakes` (a leased pool; one-ticket form 0203), `sentinel_sleep`,
`wag_group_activity()` (rewritten for speed 0222), `groups_waiting_for_reply(min_minutes,
max_hours)` (0224), `wag_add_month_partition()`, `profiler_due_groups` (Active members,
longest-waiting first), `intake_due_groups`, `member_wa_group` + the `sync_member_wa_group`
trigger, `intake_stats()` (0238), `draft_review_scoreboard()` (0240).

**`member`**: `compute_member_pulse()`, views `members_list`, `profiles`.
**`freshdesk`**: `ticket_overview(...)` (the overview strip in one scan), `media_backlog()`,
`flag_threads_for_media()`. **`gia`**: the `profiles` view only.

**The 1,000-row trap:** PostgREST returns at most 1,000 rows per response, RPC results included,
silently. Return vocabularies as one array row, `ORDER BY` a stable key so the caller can page
(`callAdminRpcAll`), or count in SQL.

## Migration numbering reality

- A file is `YYYYMMDD` + a six-digit serial + a name; the 14-digit prefix is the **version** the CLI
  orders and records. A reused version is silently skipped by `db push` (no error, no table), so a
  branch must renumber onto current `main` before merge. A file dated before the newest applied one
  needs `--include-all`.
- **Six serials appear twice** (different dates, so both apply): 0058, 0066, 0122, 0141, 0161,
  0202. Prose marks them a/b. Cite the full filename when it matters (for example
  `20260710000161_business_minutes_response_time` vs `20260807000161_status_counts_agent_domain`).
- **Gaps:** 0131 never ran and was deleted; 0205 to 0209 were skipped on purpose.
- **Renumbered branches** (always the same cause, a branch numbered from an older `main`):
  subscriptions (2026-08-21), vendors (2026-09-05 and 09-11), the vendor extractor (to 0214), vendor
  cleanup (to 0227-0230).
- The applied ledger was reconciled several times (June for 0065-0108, July for 0138-0153, late
  August for 0161 and 0169-0176). All consistent now.
- `lead_health` is fully removed (0084). *Domain Health* (`getDomainHealthMetrics`) is a separate,
  live feature.

## Open items

- **Partition upkeep:** add monthly partitions before 1 March 2027 (`wag_messages`,
  `wag_raw_events`, `member_events`) and 1 December 2027 (`ticket_events`); nothing schedules it
  (`docs/operations/maintenance.md`).
- Seat and queendom changes are not audited.
- `sia` has no query helper (inline `.schema('sia')` in many services).
- Unused so far: `sia.genie_roster`, `sia.wag_pipeline_cursors`, `member_documents`,
  `member_chunks`, the `sia` value of `task_module`, `gia.deals.member_id`.
- `FACT_SOURCES` in `lib/constants/member-facets.ts` does not list `freshdesk_note` yet.
- The 0137 active-phone index: verify on production that it is UNIQUE (it falls back to a plain
  index if it met old collisions).
