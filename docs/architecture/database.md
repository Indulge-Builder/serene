# Database

> **Purpose:** the schema narrative — every table, its purpose, key columns, and relationships. Companion to the raw dump in `database_architecture.sql`.
> **Audience:** engineers. · **Source-of-truth scope:** what each table is *for* and its contracts. Exact DDL = the dump + `supabase/migrations/`; per-page query usage = `../pages/*.md`; RLS/authorization = `auth-and-rbac.md`.
> **Last verified:** 2026-06-26 against the migration files (through 0149; sequence skips 0131, superseded by 0132; serial 0141 is reused — 0141a/0141b). The `database_architecture.sql` dump is pre-0098 — refresh via `supabase db dump` after applying 0098–0149; the dump lacks `leads.search_text`, `leads.service_interests`, `profiles.app_icon`, and the Call Intelligence / SLA / Elaya / Lead Revival / push / usage-tracking / notification-preferences / suggestions / `ad_account_recharges` / `task_events` tables. Newly verified since 0137: `20260617000138_collapse_gia_category_module_enum.sql` (category→2 values + `task_module` enum), `20260620000139_ad_account_recharges.sql`, `20260623000141_whatsapp_media_bucket.sql`, `20260624000144_oversight_task_events.sql`, `20260625000145_personal_tasks_lead_identity.sql`, `20260625000146_agent_performance_trend.sql`, `20260625000148_elaya_wa_message_dedup_unique.sql`, `20260625000149_elaya_sessionless_rpc_twins.sql`. **Migrations 0144 (oversight `task_events`) and 0146 (`get_agent_performance_trend`) are NOT yet applied to prod** — verify against the live DB before assuming.

---

## Enums (migration 0001)

```sql
CREATE TYPE user_role  AS ENUM ('founder','admin','manager','agent','guest');
CREATE TYPE app_domain AS ENUM ('concierge','onboarding','finance','marketing','tech','shop','b2b','house','legacy');
```

Other "enums" (`leads.status`, `tasks.status`, deal types, notification types, …) are `text` +
CHECK constraints, mirrored as typed constants in `src/lib/constants/`.

## Identity & team (3 tables)

### `profiles`

One row per team member, `id` = `auth.users.id`. The root of all authorization (A-01).
Key columns: `role user_role` (default `agent`), `domain app_domain` (default `concierge`),
`is_active` (soft-deactivate — never delete), `is_on_leave`, `theme` (5-value CHECK; DB-stored so
it follows the user across devices), `app_icon` (0121 — `text NOT NULL DEFAULT 'icon-1'`, CHECK in
`icon-1..icon-4`; the PWA home-screen icon pick, mirrors `theme` exactly and rides the same
`updateProfile` action; no new RLS — the 0001 `profiles_update` self-update policy covers it),
`timezone` (default `Asia/Kolkata`), `reports_to` (self-FK),
`last_seen_at` (**dormant** — no code writes it). Rows are created only by the
`on_auth_user_created` trigger; `email` is not editable after creation (truth lives in
`auth.users`); `phone` is E.164.

### `profile_audit_log`

Append-only audit of `role`, `domain`, `is_active`, `is_on_leave`, `full_name`, `email`,
`username` changes (not theme/timezone). `ON DELETE RESTRICT` on `profile_id` — profiles with
history cannot be hard-deleted. Trigger `log_profile_changes()` uses
`COALESCE(auth.uid(), NEW.id)` so service-role writes still audit cleanly.

### `agent_routing_config`

The round-robin on-duty switch — one row per pool-member profile, auto-created by trigger when a
profile's `role` becomes `'agent'` **or** `'manager'` (migration 0124 — managers now carry
round-robin leads alongside agents). The round-robin pool is `role IN ('agent','manager')`:
`get_next_round_robin_agent` assigns into the same fair queue for both roles, and the literal list
mirrors `ROUTING_POOL_ROLES` in `lib/constants/roles.ts` (keep in sync).
`is_active = false` removes the member from the assignment pool instantly.
`shift_start`/`shift_end` (time) + `shift_days integer[]` (0059; JS day-of-week, NULL = global
`BUSINESS_HOURS`) are advisory — read by ingestion, not DB-enforced.

## Leads (5 tables)

### `leads`

The Gia lead record. Identity (`first_name`, `last_name`, `email`, `phone` E.164,
`city` 0066a, `personal_details jsonb` enrichment bag), routing (`domain app_domain`,
`assigned_to` → profiles, `assigned_at`), lifecycle (`status` text — `new → touched →
in_discussion → nurturing → won | lost | junk`, `status_changed_at`, `last_activity_at`,
`resolution_reason` 0060, `archived_at` soft-delete), attribution (0065: flat indexed `source` +
`medium` + `utm_campaign`; `attribution jsonb` immutable snapshot written once at ingestion —
`{}` means "captured, nothing present", never SQL NULL), call telemetry (`call_count`,
`last_call_outcome`), dedup (`previous_lead_id` self-FK — a terminal lead re-enquiring spawns a
new lead linked back), URL identity (`slug` — unique, human-readable `priya-sharma-9182`,
trigger-generated, immutable), `search_text` (0098 — STORED generated column over
name/email/city/phone backing the trigram search index), and `service_interests text[]` (0109 —
the per-domain Call Intelligence interest vocabulary, **never an enum**; partial GIN; unknown
values dropped at ingestion, never rejected).

### `lead_activities` · `lead_notes`

Append-only (A-11). Every status change, assignment, note, call log lands in
`lead_activities` (D-03); `lead_notes` holds the note bodies (all notes are team-visible —
there is no private tier; the scratchpad concept was removed in 0061).

### `lead_raw_payloads`

Immutable log of every inbound webhook payload, including failed ingestions
(`ingestion_error` column). Admin/founder SELECT only — surfaced on `/error-log`.
**PII retention decision (security-audit F-5):** raw payloads retain full lead PII by design;
see `../integrations/lead-ingestion.md` § Raw payload policy.

### `lead_sla_timers`

SLA engine infrastructure state (status `pending | fired | cancelled`, `rule_code`,
`scheduled_fire_at`, `trigger_run_id`). Service-role only — no user RLS write policies.
See `../modules/gia.md` § SLA Engine.

## Tasks (6 tables)

One `tasks` table, with `task_category` describing **structure only**
(`personal` | `group_subtask` — `gia_followup` was removed in 20260617000138). A lead
follow-up is no longer its own category: it is a `personal` task that **has a `task_gia_meta`
row** — that meta row *is* the task→lead link.

- **`tasks`** — `status`: `to_do | in_progress | in_review | completed | error | cancelled`
  (legacy `pending`/`done` no longer exist; default fixed to `to_do` in 0086); `priority`:
  `urgent | high | normal`; `attachments jsonb` = checklist array; `tags text[]` + GIN;
  `task_type`: `call | whatsapp_message | other` (0057); `group_id` → task_groups.
  `module`: native enum `task_module` (`gia` | `sia` | `core`, was free text before
  20260617000138) — `gia` = lead follow-up, `sia` = future tickets, `core` = everything else.

  **THE SINGLE-WRITER RULE (load-bearing):** `create_lead_gia_task` (and the
  `update_lead_status` nurturing branch) is the **sole writer** of both a `task_gia_meta` row
  **and** `module = 'gia'`, always together in one transaction. Every other insert writes
  `module = 'core'` and **no** meta row. Therefore meta-presence and `module = 'gia'` are
  interchangeable, permanent signals of a lead follow-up — reads detect a lead task via
  EXISTS `task_gia_meta` / `module = 'gia'` / a `task_gia_meta!inner` join, **never** by a
  category check. (Unaffected: `sla_policies.trigger_value = 'gia_followup'` is a separate
  column — the SLA "task due" rule catalog — and still exists.)
- **`task_groups`** — domain-scoped group containers. Visibility is flat (0058b): creator OR
  assigned a subtask within.
- **`task_remarks`** — append-only progress timeline (replaced `task_messages`, 0022).
  `status_change` nullable column whose CHECK is **coupled** to `tasks.status` — a new status
  requires a migration on both. Only permitted mutation: suppression columns, admin/founder,
  via `suppressTaskRemarkAction`.
- **`task_audit_log`** — append-only; logs exactly six fields (title, description, status,
  priority, due_at, assigned_to — `attachments` deliberately excluded). `ON DELETE CASCADE`
  on task — deleting a task removes its trail (logged decision, 2026-05-28).
- **`task_gia_meta`** — one row per lead follow-up task: `task_id` + `lead_id` +
  `call_outcome`. Created atomically with the task via `create_lead_gia_task` (0054). Its
  presence (kept in lockstep with `tasks.module = 'gia'` by the single-writer rule above) is
  *the* signal that a `personal` task is a lead follow-up — `task_category` no longer carries
  this distinction (20260617000138).
- **`task_events`** (0144 — the `/oversight` stream) — **append-only (A-11)**. One row per task
  mutation: `task_event_type` enum (`created` | `status_changed` | `reassigned` | `remark_added` |
  `overdue`), `domain app_domain NOT NULL` (the point-in-time team), `actor_id`/`subject_id` →
  profiles, `task_title` snapshot, `meta jsonb`; FK → `tasks` CASCADE; indexes `(domain, created_at
  DESC)` + `(subject_id, created_at DESC)`; Realtime enabled. **manager+ SELECT, NO INSERT/UPDATE/
  DELETE policy ever** — written ONLY by the task-mutation cores + the overdue job via the admin
  client (so Elaya's write tools emit it for free). Feeds the three oversight RPCs + the live rails.
  **⚠️ Migration 0144 is not yet applied to prod.**

## WhatsApp (4 tables)

- **`whatsapp_conversations`** — one per phone/lead; `wa_id` (E.164 without `+`) and `lead_id`
  both UNIQUE; `last_message_at` drives list ordering; bot columns exist but the bot is not
  built. Realtime enabled.
- **`whatsapp_messages`** — append-only with one documented exception: the delivery-receipt
  status UPDATE (`processStatusUpdate`, admin client). `wa_message_id` has a **partial** unique
  index (WHERE NOT NULL) so optimistic pre-confirm inserts can hold NULL. Inbound/outbound media
  (image/video/document/audio) store a **storage path** in `media_url` (never a CDN URL — Gupshup's
  is time-limited), pointing at the private `whatsapp-media` bucket (0141a); reads mint signed URLs.
  Realtime enabled.
- **`whatsapp_conversation_reads`** — per-user read position; UNIQUE(conversation_id, agent_id);
  UPSERT on read.
- **`whatsapp_notification_logs`** — one row per template-send attempt (delivered or failed).
  Stores last-4 phone digits only — full numbers never stored.

## Commerce & content (5 tables)

### `deals`

First-class closed-deal record (0072–0074; reversed the earlier "deals = won leads" model).
`lead_id` **nullable** — walk-in sales have no lead. `contact_name`/`contact_phone` denormalised
at close. **`deal_type` is domain-derived, never client-picked** (0122b + decision-log 2026-06-15):
`onboarding → membership` (requires `deal_duration`: `3_months | 6_months | 1_year`),
`shop → retail` (requires `deal_category`), `house`/`legacy` → `sale`. One source
`DOMAIN_DEAL_CONFIG`; set server-side; the 0122b CHECKs (`deals_deal_type_check` admits `sale`,
`deals_deal_category_check`, `deals_retail_category_check` coupling retail⇔category) are the
backstop. `deal_amount numeric(12,2)` CHECK 0–100M. `won_at` immutable after insert. `source`
carries attribution onto the deal (0075). `client_id` is reserved for the future clients module.
**No INSERT/UPDATE/DELETE RLS policies by design** — all writes go through the admin client in
`recordDeal`/`createWalkInDeal` (0094 comment), and now also via Elaya's `log_deal` tool through the
shared `recordDealCore` (R-01).

### `ad_creatives`

Campaign video assets keyed by `campaign_key` (UNIQUE dropped in 0058a — multiple videos per
campaign). Files live in the `ad-creatives` Storage bucket.

### `ad_spend_daily` (0104)

Day-grain Meta ad spend, `UNIQUE(campaign_key, spend_date, source)`. Fed only from client-side
CSV/XLSX uploads (never a Meta API). Joined to lead counts (`created_at` cohort) + deals (`won_at`)
on the shared `campaign_key` by `get_budget_summary` (0106). RLS manager+ read / admin/founder write.

### `ad_account_recharges` (0139)

Finance ledger of money sent to each Meta ad account — kept SEPARATE from spend (account is derived
from the campaign key via `resolveAccountFromCampaign`, never stored on spend). The `/budget`
Accounts tab reads recharged − spent = balance (INR-only). `ad_account` CHECK mirrors
`AD_ACCOUNT_KEY_VALUES`; `method` is a free-text payment label, card-PAN-rejected by a CHECK
backstop. Mirrors `ad_spend_daily` RLS (manager+ read, admin/founder write) but — unlike the
append-only logs — **admin/founder UPDATE + DELETE are permitted** (a mis-keyed money figure must be
correctable).

### `domain_targets` (0105)

Founder monthly deals-closed targets per Gia domain, read by the performance Domains tab.

## Notifications (1 table)

### `notifications`

In-app inbox rows: `recipient_id`, `type` CHECK (`lead_assigned`, `lead_won`, `task_due`,
`task_assigned`, `mention`, `system`, `sla_breach_agent`, `sla_breach_manager`,
`sla_breach_founder`, `task_overdue_manager`, `suggestion_resolved`), `title`,
`body`, `action_url` (relative paths only — CHECK rejects `http%`), `read_at`. Realtime
enabled — drives the bell badge live. The `type` CHECK has grown over time —
`sla_breach_founder` + `task_overdue_manager` were added in 0113; `suggestion_resolved` in 0136
(transactional, non-silenceable — sent to the original sender when admin/founder resolves a
suggestion; has no `notification_preferences` key).

### `push_subscriptions` (0120)

Per-device Web Push (VAPID) endpoints — the **second** notification delivery channel behind the
in-app `notifications` row, fanned out from inside `createNotification` (zero call-site edits).
`profile_id` → profiles, `endpoint` (UNIQUE — one row per device, so one user holds many rows),
`p256dh`, `auth`, `user_agent`, `created_at`. `idx_push_subscriptions_profile` serves the dispatch
read. **Owner-only RLS** (`profile_id = auth.uid()`): SELECT/INSERT/DELETE for the owner (the
browser subscribes/unsubscribes on the session client); **no UPDATE policy** — a re-subscribe is an
upsert on `endpoint`. The cross-user dispatch read and the 404/410 dead-endpoint prune in
`dispatchPush` (`push-service.ts`) run on the admin client. **Non-fatal second channel** — the
in-app row stays the source of truth.

## Follow-up & revival engines (3 config/ledger tables)

### `sla_policies` (0111)

Config table behind the Gia follow-up (SLA) engine — one row per rule, read per job run via the
admin client (never module-cached, the `sla_policies` pattern), so a threshold edit applies on the
next fire without a deploy. `code` PK; `trigger_kind` CHECK (`status` | `outcome` | `task_due`);
`trigger_value`; `threshold_minutes`; `recipient_role` CHECK (`agent` | `manager` | `founder`);
`auto_task`; `channels text[]` (`in_app`/`whatsapp`; the CAD task-creating family carries `{}`);
`hours_mode` CHECK (`agent_shift` | `business` | `clock`); `active`. Seeded with the 8 live SLA
rules copied verbatim from `SLA_RULES` (the constants' `active` status trigger is stored as the
real status `nurturing`) + `SLA-01C` (founder escalation), `CAD-01A/B/C` (outcome cadence) and
`TASK-01A/B` (gia task due / overdue). **RLS: admin/founder SELECT only**; writes are service-role
(a future settings UI goes through an admin-gated action).

### `revival_policies` · `revival_candidates` (0119 — Lead Revival R1)

A layer *over* leads — Revival **never mutates the leads row**.

- **`revival_policies`** — per-status silence config (the `sla_policies` pattern): `trigger_status`
  PK CHECK (`touched` | `in_discussion` | `nurturing` — **cold excluded by design**),
  `silence_days`, `daily_cap_per_agent` (default 25), `active`; `update_updated_at` trigger. Read
  per sweep run via the admin client. Seeded touched=60d / in_discussion=60d / nurturing=90d.
  **RLS: admin/founder SELECT only**; writes service-role.
- **`revival_candidates`** — the per-lead candidate ledger. `lead_id`, **denormalised `assigned_to`**
  (so the daily-cap count is a native `.eq('assigned_to')` filter, not a silently-dropped PostgREST
  embed filter on a `head:true` count), `verdict` CHECK (`revive` | `unsure` | `dismiss` — the
  note-AI gate's three-way call), `ai_reasoning`, `status` CHECK (`open` | `actioned` | `dismissed`),
  `trigger_status`, `suggested_revive_at`, `resolved_at`/`resolved_by`. Partial UNIQUE
  `idx_revival_candidates_one_open (lead_id) WHERE status='open'` is the structural one-open-candidate
  guard. **A-11 carve-out** (the `elaya_actions` precedent): **SELECT-only RLS** scoped by role/domain
  via an `EXISTS` subquery on `leads`; **no user INSERT/UPDATE/DELETE** — all writes are service-role;
  the `open → actioned/dismissed` flip is a resolve-once admin-client UPDATE (column restriction
  enforced in `revival-service`, not SQL).

## Call Intelligence (2 tables, 0110)

The dossier "brag library" + on-call talking points. `category` is `text`, **not an enum**
(accommodates Shop/House/Legacy vocabularies, same reasoning as `leads.service_interests`).

### `service_cases`

Curated real past deliveries, searched live during calls (`/helpdesk` loads the full set once; the
dossier card pulls ≤6). `domain app_domain`, `category text`, `tags text[]` (freeform; every case
carries its city as a lowercase slug tag powering the dossier city match), `title`/`summary`/
`outcome_note`, `city`/`country`, `is_featured`/`sort_order`, audit columns + `update_updated_at`
trigger. `search_vector` is a **weighted STORED generated** `tsvector` (title A, summary/location B,
tags C) backed by a GIN index — unused in Phase 1 (filtering is client-side) but makes the
server-side FTS switch an action-layer change, not a schema change. A **dormant**
`embedding vector(1536)` exists from day one (NULL until Phase 2; **no HNSW index** — that is the
Phase 2 migration). Indexes on tags (GIN), category, domain, `lower(city)`, and featured/sort.

### `conversation_hooks`

Category-scoped talking points agents say on calls. `domain app_domain`, `category text` (matches
`service_cases.category` values), `hook` (the full line), `context` (optional guidance),
`sort_order`. Indexes on category and domain.

**RLS (both tables):** all-authenticated SELECT; **admin/founder-only writes** via InitPlan-hoisted
`(SELECT get_user_role())`.

## Elaya AI foundation (6 tables, 0116)

The substrate every AI feature plugs into. RLS posture across all six: users read their own rows;
config tables (`llm_providers`, `elaya_settings`) are admin/founder SELECT; all assistant/tool/
context/action/config **writes are service-role only** (the authed route is the trust boundary).

### `elaya_conversations`

One row per chat session. `user_id` → profiles, `channel` CHECK (`in_app` | `whatsapp` — present
from day one so the WhatsApp channel lands without a schema change), `title`, `last_message_at`
(drives recent-list ordering), `archived_at`. The **24h session expiry is enforced in
`elaya-service`, not SQL**. Self SELECT + self `in_app` INSERT only; `last_message_at` bumps and
archiving go through the service-role client (no UPDATE/DELETE policy).

### `elaya_messages`

**Append-only (A-11)** — no UPDATE or DELETE, ever. `conversation_id` → conversations,
denormalised `sender_id` (the human author on `role='user'` rows; NULL for assistant/tool — a CHECK
enforces `role <> 'user' OR sender_id IS NOT NULL`), `role` CHECK (`user` | `assistant` | `tool`),
`channel`, `content`, `tool_calls jsonb` (the assistant turn's normalised tool calls), `meta jsonb`
(provider/model/usage snapshot). A partial `(sender_id, created_at DESC) WHERE role='user'` index
serves the server-enforced daily message cap. Users SELECT messages on their own conversations and
INSERT only `role='user'` rows on them; assistant/tool rows are service-role writes.

### `user_context`

One durable context row per user (`user_id` PK, `context jsonb`). Self SELECT only; **writes
service-role**. As of the "Jarvis" build (2026-06-25) the `context` jsonb carries two sub-objects:
`persona` (user-set "how Elaya talks to me" — language/tone/depth/length + a 600-char note, edited
from `/profile` via `updateElayaPersonaAction`) and `learned` (Elaya-accumulated durable memory,
written by a throttled routing-tier summarizer in `memory.ts` — merge-write that never touches
`persona`). No longer empty. Both ride the cached system-prompt prefix as a STYLE-ONLY block — never
a permission (the Golden Rule).

### `elaya_actions`

The agentic-write ledger — **reserved empty in 0116, filled in 0118** (Elaya Phase 2 / E3).
`conversation_id`, `message_id`, `user_id`, `action_type`, `payload jsonb` (target/args/channel/
before/after snapshots), `status` proposed→approved/dismissed/executed/failed, `resolved_at`/
`resolved_by`. Now backs the **11 Elaya write tools** — inline writes (`add_lead_note`, `log_call`,
`create_lead_task`, `create_personal_task`, `create_group_task`, `update_task_status`,
`update_task`) append one terminal `executed` row; the propose→confirm tier (`update_lead_status`,
`reassign_lead`, `log_deal`, `delete_task`) writes a `proposed` row that flips on the next
affirmative human turn. `action_type` has **no DB CHECK**, so a new tool type (e.g. `log_deal`) needs
no migration. **State-machine table, NOT append-only** (an A-11 carve-out — it doubles as the
trust-and-rollback audit trail): the `proposed → executed/failed/dismissed` flip is a resolve-once
service-role admin-client UPDATE (same posture as `whatsapp_messages` delivery receipts). 0118 adds
the partial `idx_elaya_actions_pending (conversation_id, created_at DESC) WHERE status='proposed'`
(the per-turn confirmation-resolver read) and a lifecycle `COMMENT ON TABLE`. **Never add a user
UPDATE policy.** Self SELECT only; all writes service-role.

### `llm_providers`

Job-type → provider+model config (the `sla_policies` pattern: read per request via the admin
client, never module-cached — a model switch applies on the next message with no deploy).
`job_type` PK CHECK (`routing` | `reasoning`), `provider` CHECK (`anthropic` | `google` |
`openai`), `model`, `max_tokens`, `active`. Seeded `routing → claude-haiku-4-5`,
`reasoning → claude-sonnet-4-6`. RLS admin/founder SELECT; writes service-role.

### `elaya_settings`

Small key/value config (same read-per-request contract). `key` PK, `value jsonb`. Seeded
`daily_message_cap=200`, `pii_masking_depth='light'`, `session_expiry_hours=24`. RLS admin/founder
SELECT; writes service-role.

## Usage / adoption tracking (2 tables, 0126)

Measures how much **active** time each member spends in Serene (per agent, per domain, today and
historically) — an admin/founder adoption tool. "Active" = tab visible AND a real interaction in
the last ~2 min, NOT merely logged in. Three-job architecture: the client SETs a Redis
`presence:{userId}` key every 60s while active (hot path, **no DB write**); a 1-min snapshot job
appends the live presence keys into `usage_heartbeats` (admin client); a rollup job re-rolls today
every 15 min + the prior IST day nightly into `usage_daily`. Both tables **RLS-enabled with NO
policies = deny-by-default** — jobs write via the admin client, the dashboard reads ONLY through
the `get_agent_usage` SECURITY DEFINER RPC (no caller-supplied scope → Q-13 revoked tier: EXECUTE
revoked from `PUBLIC, anon, authenticated`, GRANTed `service_role` only; the founder/admin gate
lives in the service layer, never the RPC).

### `usage_heartbeats`

**Append-only (A-11)** raw active-presence ticks — one row per active user per snapshot-job run
(`user_id`, `domain app_domain`, `captured_at`). The ONLY writer is the snapshot job (admin
client); `usage_heartbeats_user_time_idx (user_id, captured_at)`. Never read by the dashboard;
pruned after 30 days by the nightly rollup (admin-client maintenance, not a user mutation).

### `usage_daily`

The rollup the dashboard reads — PK `(day, user_id, domain)` makes the rollup UPSERT idempotent
(recompute distinct minute-ticks, **overwrite never increment**); `active_minutes integer`;
`usage_daily_day_idx (day)`. Read live (today recomputed from `usage_heartbeats`) + historical
(`day >= p_history_from`) via `get_agent_usage`.

## Notification preferences (1 table, 0133)

### `notification_preferences`

Per-user In-app/WhatsApp on/off for each notification CATEGORY. PK `(user_id, notification_key)`;
`in_app`/`whatsapp` booleans (DEFAULT true); `notification_key` CHECK mirrors the 9 keys in
`lib/constants/notification-categories.ts` (`lead_assigned`, `new_lead_founder_alert`, `lead_won`,
`deal_created`, `task_assigned`, `task_due`, `task_overdue_manager`, `sla_breach`,
`sla_escalation`); `update_updated_at` trigger. **Sparse mute-rows — ABSENCE = ON:** a row exists
only as an opt-out; no row → both channels on. The gate (`notification-prefs-service.ts`) **fails
OPEN** (missing/malformed/thrown → send), so a new category is on-for-everyone with zero backfill
and the table holds only deliberate opt-outs. **Owner-only RLS** (the `push_subscriptions` 0120
posture): owner SELECT/INSERT/UPDATE/DELETE (`user_id = auth.uid()`, InitPlan-hoisted); the
cross-user read at notification fan-out runs service-role (admin client), like `dispatchPush`.
Transactional sends (`lead_initiation`, `elaya_reply`) have NO key here — never silenceable.

## Suggestions (1 table, 0134)

### `suggestions`

Staff-submitted suggestion / bug-report channel for admin/founder triage. `sender_id` FK,
`category` CHECK (`bug` | `idea` | `other`), `message`, `image_paths text[]` (CHECK ≤ 4 — mirrors
`MAX_SUGGESTION_IMAGES`; stores storage PATHS in the private `suggestions` bucket, never URLs),
`status` CHECK (`open` | `resolved`), `resolved_by`/`resolved_at`, timestamps;
`idx_suggestions_status_created (status, created_at DESC)`; `update_updated_at` trigger.
**NOT append-only** — a suggestion has a status lifecycle, so it gets exactly ONE narrow
admin/founder UPDATE policy (the `revival_candidates` carve-out); only
`status`/`resolved_by`/`resolved_at` are writable (enforced in `resolveSuggestion` — RLS cannot
restrict columns). RLS (InitPlan-hoisted per 0088): sender SELECT/INSERT own
(`sender_id = auth.uid()`); admin/founder SELECT all + UPDATE
(`get_user_role() IN ('admin','founder')`); **no DELETE policy, ever**. Screenshots live in the
private `suggestions` storage bucket (0135 — see Storage buckets).

## Storage buckets

| Bucket | Access | RLS |
| ------ | ------ | --- |
| `avatars` (0071) | public read | `avatars_public_read` / `_insert_own` / `_update_own` / `_delete_own` (the quoted-name duplicates were dropped in 0093) |
| `ad-creatives` (0012) | public read | INSERT/DELETE restricted to admin/founder (0092), matching the table RLS |
| `suggestions` (0135) | **PRIVATE** (no public read — reports can show sensitive screens) | `suggestions_storage_insert_own` (write only under the caller's own `${auth.uid()}/` prefix) / `_read_own` (same prefix) / `_read_admin` (admin/founder read all — backs `createSignedUrl` for the triage inbox). No UPDATE/DELETE — screenshots are write-once. Admin viewing mints short-lived signed URLs; the `suggestions` row stores PATHS, never URLs |
| `whatsapp-media` (0141a) | **PRIVATE** (no public read — lead conversations can be sensitive) | Writes + reads run on the admin client (the inbound webhook is sessionless), so no authenticated INSERT/SELECT policy is needed; one defence-in-depth admin/founder SELECT policy. Object path `${leadId}/${messageId}.${ext}`; `whatsapp_messages.media_url` stores the PATH (never Gupshup's time-limited CDN URL); reads mint signed URLs |

## RPC inventory

~40 SECURITY DEFINER functions (the scope-param class has client EXECUTE revoked — 0102/0123/0144/
0149; the self-scoped class keeps the `authenticated` GRANT). The load-bearing ones:
`get_user_role`/`get_user_domain` (RLS helpers) · `get_next_round_robin_agent` (0007) ·
`get_active_lead_by_phone` (0008/0090) · `generate_lead_slug` (0046, fixed 0147) ·
`lead_phone_key` + the active-phone partial UNIQUE index (0137) · `cold_lead_cutoff` (0140) ·
`add_lead_call_note` (0030) · `update_lead_status` (0031) · `add_lead_plain_note` (0040) ·
`get_dashboard_summary` (0029/0062, cold predicate domain-scoped 0143) ·
`get_leads_status_counts` (0080/0099) · `get_recent_lead_activity` (0132) ·
`get_campaign_metrics`/`_detail_metrics`/`_agent_distribution` (0014–0015) ·
`get_personal_tasks` (0026, lead-identity 0145) · `get_group_task_summaries` (0020) ·
`add_task_remark_with_status` (0035/0051) · `create_lead_gia_task` (0054) · `get_gia_tasks`
(0055) · `get_deals_summary` (0052/0074) · `get_budget_summary` (0106) ·
`get_wa_unread_count` (0036/0085) · `can_access_wa_conversation` (coupled to leads RLS — review
together) · `get_agent_performance` / `get_agent_roster_performance` (0101) ·
`get_agent_today_pulse` (0108/0122a) · `get_agent_performance_trend` (0146) ·
`get_agent_first_touch_pairs` (0123) · `get_silent_leads_for_revival` (0128) ·
`get_agent_usage` (0126) · the oversight trio `get_team_task_overview` /
`get_team_agent_breakdown` / `get_agent_tasks_oversight` (0144) · and the Elaya sessionless twins
`get_group_task_summaries_for_user` / `get_agent_today_pulse_for_user` /
`get_agent_roster_performance_for_elaya` (0149).
