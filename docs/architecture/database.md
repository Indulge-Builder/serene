# Database

> **Purpose:** the schema narrative — every table, its purpose, key columns, and relationships. Companion to the raw dump in `database_architecture.sql`.
> **Audience:** engineers. · **Source-of-truth scope:** what each table is *for* and its contracts. Exact DDL = the dump + `supabase/migrations/`; per-page query usage = `../pages/*.md`; RLS/authorization = `auth-and-rbac.md`.
> **Last verified:** 2026-06-11 against `database_architecture.sql` (pre-0098 dump — refresh via `supabase db dump` after applying 0098–0103; the dump lacks `leads.search_text`) and the migration files.

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
it follows the user across devices), `timezone` (default `Asia/Kolkata`), `reports_to` (self-FK),
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
trigger-generated, immutable), and `search_text` (0098 — STORED generated column over
name/email/city/phone backing the trigram search index).

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
enabled — drives the bell badge live.

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
