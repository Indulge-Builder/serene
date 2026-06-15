# Database

> **Purpose:** the schema narrative — every table, its purpose, key columns, and relationships. Companion to the raw dump in `database_architecture.sql`.
> **Audience:** engineers. · **Source-of-truth scope:** what each table is *for* and its contracts. Exact DDL = the dump + `supabase/migrations/`; per-page query usage = `../pages/*.md`; RLS/authorization = `auth-and-rbac.md`.
> **Last verified:** 2026-06-15 against the migration files (through 0121). The `database_architecture.sql` dump is pre-0098 — refresh via `supabase db dump` after applying 0098–0121; the dump lacks `leads.search_text`, `leads.service_interests`, `profiles.app_icon`, and the Call Intelligence / SLA / Elaya / Lead Revival / push tables.

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

The round-robin on-duty switch — one row per agent, auto-created by trigger when a profile gets
`role = 'agent'`. `is_active = false` removes the agent from the assignment pool instantly.
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

## Tasks (5 tables)

One `tasks` table for all three categories, discriminated by `task_category`
(`personal` | `group_subtask` | `gia_followup`):

- **`tasks`** — `status`: `to_do | in_progress | in_review | completed | error | cancelled`
  (legacy `pending`/`done` no longer exist; default fixed to `to_do` in 0086); `priority`:
  `urgent | high | normal`; `attachments jsonb` = checklist array; `tags text[]` + GIN;
  `task_type`: `call | whatsapp_message | other` (0057); `group_id` → task_groups.
- **`task_groups`** — domain-scoped group containers. Visibility is flat (0058b): creator OR
  assigned a subtask within.
- **`task_remarks`** — append-only progress timeline (replaced `task_messages`, 0022).
  `status_change` nullable column whose CHECK is **coupled** to `tasks.status` — a new status
  requires a migration on both. Only permitted mutation: suppression columns, admin/founder,
  via `suppressTaskRemarkAction`.
- **`task_audit_log`** — append-only; logs exactly six fields (title, description, status,
  priority, due_at, assigned_to — `attachments` deliberately excluded). `ON DELETE CASCADE`
  on task — deleting a task removes its trail (logged decision, 2026-05-28).
- **`task_gia_meta`** — one row per Gia follow-up task: `task_id` + `lead_id` +
  `call_outcome`. Created atomically with the task via `create_lead_gia_task` (0054).

## WhatsApp (4 tables)

- **`whatsapp_conversations`** — one per phone/lead; `wa_id` (E.164 without `+`) and `lead_id`
  both UNIQUE; `last_message_at` drives list ordering; bot columns exist but the bot is not
  built. Realtime enabled.
- **`whatsapp_messages`** — append-only with one documented exception: the delivery-receipt
  status UPDATE (`processStatusUpdate`, admin client). `wa_message_id` has a **partial** unique
  index (WHERE NOT NULL) so optimistic pre-confirm inserts can hold NULL. Realtime enabled.
- **`whatsapp_conversation_reads`** — per-user read position; UNIQUE(conversation_id, agent_id);
  UPSERT on read.
- **`whatsapp_notification_logs`** — one row per template-send attempt (delivered or failed).
  Stores last-4 phone digits only — full numbers never stored.

## Commerce & content (2 tables)

### `deals`

First-class closed-deal record (0072–0074; reversed the earlier "deals = won leads" model).
`lead_id` **nullable** — walk-in sales have no lead. `contact_name`/`contact_phone` denormalised
at close. `deal_type`: `membership | retail` (membership requires `deal_duration`:
`3_months | 6_months | 1_year`). `deal_amount numeric(12,2)` CHECK 0–100M. `won_at` immutable
after insert. `source` carries attribution onto the deal (0075). `client_id` is reserved for the
future clients module. **No INSERT/UPDATE/DELETE RLS policies by design** — all writes go through
the admin client in `recordDeal`/`createWalkInDeal` (0094 comment).

### `ad_creatives`

Campaign video assets keyed by `campaign_key` (UNIQUE dropped in 0058a — multiple videos per
campaign). Files live in the `ad-creatives` Storage bucket.

## Notifications (1 table)

### `notifications`

In-app inbox rows: `recipient_id`, `type` CHECK (`lead_assigned`, `lead_won`, `task_due`,
`task_assigned`, `mention`, `system`, `sla_breach_agent`, `sla_breach_manager`), `title`,
`body`, `action_url` (relative paths only — CHECK rejects `http%`), `read_at`. Realtime
enabled — drives the bell badge live. The `type` CHECK has grown over time —
`sla_breach_founder` + `task_overdue_manager` were added in 0113.

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
service-role** (the context writer lands in a later phase — empty until then).

### `elaya_actions`

The agentic-write ledger — **reserved empty in 0116, filled in 0118** (Elaya Phase 2 / E3).
`conversation_id`, `message_id`, `user_id`, `action_type`, `payload jsonb` (target/args/channel/
before/after snapshots), `status` proposed→approved/dismissed/executed/failed, `resolved_at`/
`resolved_by`. **State-machine table, NOT append-only** (an A-11 carve-out — it has
`status`/`resolved_at`/`resolved_by` and doubles as the trust + rollback audit trail): the
`proposed → executed/failed/dismissed` flip is a resolve-once service-role admin-client UPDATE
(same posture as `whatsapp_messages` delivery receipts). 0118 adds the partial
`idx_elaya_actions_pending (conversation_id, created_at DESC) WHERE status='proposed'` (the
per-turn confirmation-resolver read) and a lifecycle `COMMENT ON TABLE` — no columns, no CHECK, no
RLS change. **Never add a user UPDATE policy.** Self SELECT only; all writes service-role.

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

## Storage buckets

| Bucket | Access | RLS |
| ------ | ------ | --- |
| `avatars` (0071) | public read | `avatars_public_read` / `_insert_own` / `_update_own` / `_delete_own` (the quoted-name duplicates were dropped in 0093) |
| `ad-creatives` (0012) | public read | INSERT/DELETE restricted to admin/founder (0092), matching the table RLS |

## RPC inventory

~30 SECURITY DEFINER functions (classified one-by-one in
`../audits/security-audit-2026-06.md` §2; client EXECUTE revoked on the scope-param class in
0102). The load-bearing ones: `get_user_role`/`get_user_domain` (RLS helpers) ·
`get_next_round_robin_agent` (0007) · `get_active_lead_by_phone` (0008/0090) ·
`add_lead_call_note` (0030) · `update_lead_status` (0031) · `add_lead_plain_note` (0040) ·
`get_dashboard_summary` (0029/0062) · `get_leads_status_counts` (0080/0099) ·
`get_campaign_metrics`/`_detail_metrics`/`_agent_distribution` (0014–0015) ·
`get_personal_tasks` (0026) · `get_group_task_summaries` (0020) ·
`add_task_remark_with_status` (0035/0051) · `create_lead_gia_task` (0054) · `get_gia_tasks`
(0055) · `get_deals_summary` (0052/0074) · `get_wa_unread_count` (0036/0085) ·
`can_access_wa_conversation` (coupled to leads RLS — review together) ·
`get_agent_performance` / `get_agent_roster_performance` (0101).
