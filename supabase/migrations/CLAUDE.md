# Migrations CLAUDE.md

## Rules

- Never edit a migration that has already run in production (rule A-14). Write a new one.
- Every new table gets `ALTER TABLE x ENABLE ROW LEVEL SECURITY` (rule A-08).
- Log and activity tables are append-only — no UPDATE or DELETE RLS policies, ever (rule A-11).
- Reuse `update_updated_at()` — never recreate it. It is defined in the earliest migration.
- All `SECURITY DEFINER` functions must have `SET search_path = public` (rule A-10).

## Migration inventory

| File | What it does |
| ---- | ------------ |
| `20260526000001_profiles.sql` | `user_role`, `app_domain` enums; `profiles` table; `update_updated_at()` function |
| `20260526000002_agent_routing_config.sql` | `agent_routing_config` table; round-robin helpers |
| `20260527000003_leads.sql` | `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` |
| `20260527000004_lead_raw_payloads.sql` | `lead_raw_payloads` immutable log |
| `20260527000005_lead_raw_payloads_error.sql` | `ingestion_error` column on `lead_raw_payloads` |
| `20260527000006_scratchpad_rls.sql` | RLS fix for `private_scratchpad` |
| `20260527000007_round_robin_fn.sql` | Atomic `get_next_round_robin_agent()` DB function |
| `20260527000008_lead_dedup.sql` | `previous_lead_id` FK; `get_active_lead_by_phone()` |
| `20260527000009_lead_personal_details.sql` | `personal_details JSONB` on `leads` |
| `20260528000010_lead_filter_indexes.sql` | UTM source/campaign/outcome partial indexes |
| `20260528000011_lead_search_index.sql` | `text_pattern_ops` index for ILIKE search |
| `20260528000012_ad_creatives.sql` | `ad_creatives` table |
| `20260528000013_performance_indexes.sql` | Performance page partial indexes |
| `20260528000014_campaign_analytics.sql` | `get_campaign_metrics` RPC + campaign indexes |
| `20260528000015_campaign_detail_metrics.sql` | `get_campaign_detail_metrics` RPC |
| `20260528000016_notifications.sql` | `notifications` table; Realtime enabled |
| `20260528000017_os_tasks.sql` | `task_groups` table; `task_messages` table (append-only + Realtime); `tasks` extended (title, description, priority, task_category, group_id, new status enum); `notifications` type CHECK expanded with `task_assigned` |
| `20260528000018_task_groups_rls_domain.sql` | A-09 fix: `task_groups` SELECT and UPDATE policies now enforce `get_user_domain() = domain` for manager role; admin/founder retain full access |
| `20260528000019_task_messages_rls_creator.sql` | A-09 fix: `task_messages` SELECT and INSERT policies add `created_by = auth.uid()` (task creator was locked out of own chat) and domain-scope managers via `task_groups.domain` join |
| `20260528000020_group_task_summaries_rpc.sql` | `get_group_task_summary` RPC |
| `20260528000021_task_suppression_audit.sql` | `task_messages` suppression columns (`is_suppressed`, `suppressed_by`, `suppressed_at`) + UPDATE RLS for admin/founder; `task_audit_log` append-only table + `log_task_changes()` trigger (AFTER UPDATE on tasks, six fields: title/description/status/priority/due_at/assigned_to) |
| `20260529000022_task_remarks.sql` | DROP TABLE task_messages CASCADE (pre-production, no data); CREATE TABLE `task_remarks` (replaces task_messages with added `status_change` nullable column, ASC index, same suppression + RLS pattern); Realtime enabled on `task_remarks` |
| `20260529000023_task_attachments.sql` | ADD COLUMN `attachments jsonb NOT NULL DEFAULT '[]'` to `tasks`; CHECK constraint `tasks_attachments_is_array` validates JSON array; intentionally excluded from `log_task_changes()` trigger |
| `20260529000029_get_dashboard_summary.sql` | `get_dashboard_summary(p_role, p_domain, p_user_id)` RPC — single jsonb response with 4 keys (`agent_tasks`, `agent_activity`, `lead_status`, `campaigns`); SECURITY DEFINER; role-based CTEs; all COUNT cast `::int`; GRANT EXECUTE to authenticated |
| `20260529000030_rpc_add_lead_call_note.sql` | `add_lead_call_note(p_lead_id, p_author_id, p_content, p_call_outcome, p_now)` RPC — wraps all DB writes for `addLeadCallNote` action in one transaction (note insert + lead UPDATE + 2–3 activity inserts); returns `jsonb` with `note_id`, `new_call_count`, `did_auto_advance`, `assigned_to`, `domain`, `old_status`; SECURITY DEFINER; access control stays in action layer |
| `20260529000031_rpc_update_lead_status.sql` | `update_lead_status(p_lead_id, p_actor_id, p_status, p_reason, p_now)` RPC — wraps all DB writes for `updateLeadStatus` action in one transaction (lead UPDATE + activity insert + conditional nurturing task + task_gia_meta); returns `jsonb` with `changed`, `old_status`, `new_status`, `assigned_to`, `domain`, `first_name`, `last_name`; early-returns `{ changed: false }` when status unchanged; SECURITY DEFINER; access control and won notifications stay in action layer |
| `20260530000032_whatsapp_conversations.sql` | `whatsapp_conversations` table — one row per lead/phone; `wa_id` (E.164 without +) and `lead_id` both UNIQUE; `bot_active/bot_paused_by/bot_paused_at` columns; `can_access_wa_conversation()` SECURITY DEFINER helper; RLS mirrors leads table (agent → assigned leads, manager → domain, admin/founder → all); Realtime enabled |
| `20260530000033_whatsapp_messages.sql` | `whatsapp_messages` table — **append-only** with one narrow UPDATE exception (delivery receipts: `status` + `status_at` only, via service-role client); `wa_message_id` is a **partial unique index** (`WHERE wa_message_id IS NOT NULL`) to allow multiple NULL rows for optimistic inserts; same RLS domain-scoping via `can_access_wa_conversation()`; no DELETE policy ever; Realtime enabled |
| `20260530000034_whatsapp_reads.sql` | `whatsapp_conversation_reads` table — per-agent read position for unread badge counts (not in The_Gia.md §14 — deliberate addition); UNIQUE(conversation_id, agent_id); RLS: agents read/insert/update own rows only; no other roles need policies |
| `20260530000035_rpc_add_task_remark_with_status.sql` | `add_task_remark_with_status(p_task_id, p_author_id, p_content, p_status_change)` RPC — collapses remark + optional status UPDATE into 1 round-trip; SECURITY DEFINER; access control stays in action layer (view = post via user-scoped `tasks` SELECT before `adminClient.rpc()`) |
| `20260529000024_task_tags.sql` | `tags text[] NOT NULL DEFAULT '{}'` on `tasks`; GIN index for personal tasks |
| `20260529000025_task_performance_indexes.sql` | Task index fix + `get_personal_tasks` v1 |
| `20260529000026_get_personal_tasks_cursor.sql` | Cursor params on `get_personal_tasks` |
| `20260529000027_lead_sla_columns.sql` | `status_changed_at`, `last_activity_at` on `leads` |
| `20260529000028_lead_sla_timers.sql` | `lead_sla_timers` table |
| `20260529000040_rpc_add_lead_plain_note.sql` | `add_lead_plain_note` RPC — plain note without call_count |
| `20260531000049_leads_deal_duration.sql` | `leads.deal_duration` for won leads |
| `20260531000052_get_deals_summary.sql` | `get_deals_summary` RPC — Deals page summary strip aggregates |
| `20260531000053_get_deals_summary_manager_domain_fix.sql` | `get_deals_summary` — `p_caller_domain` vs `p_filter_domain` split for manager role-gate |
| `20260531000057_task_type_other.sql` | `task_type` vocabulary → `call`, `whatsapp_message`, `other`; backfill legacy values; nurturing auto-task uses `other` |
| `20260604000069_dashboard_date_filter.sql` | Extends `get_dashboard_summary` (5th + 6th params: `p_date_from timestamptz DEFAULT NULL`, `p_date_to timestamptz DEFAULT NULL`), `get_lead_pipeline_refresh` (same two params), and `get_campaign_pipeline_refresh` (same two params). Date filter applies `created_at >= p_date_from AND created_at < p_date_to` to the `lead_status` and `campaigns` CTEs only. `agent_tasks` and `agent_activity` are unaffected. Backwards-compatible: all existing callers that omit the params see NULL → all-time behaviour unchanged. All three functions remain STABLE SECURITY DEFINER; GRANT EXECUTE preserved. |
| `20260530000036_rpc_get_wa_unread_count.sql` | `get_wa_unread_count()` RPC — per-agent unread WhatsApp conversation count; LEFT JOIN `whatsapp_conversation_reads` on `agent_id = auth.uid()`; counts open conversations where `last_read_at IS NULL` or `last_message_at > last_read_at`; gated by `can_access_wa_conversation()`; RETURNS integer; STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated |
| `20260530000037_whatsapp_messages_outbound_insert.sql` | `wa_messages_outbound_insert` RLS INSERT policy — allows authenticated agents/managers/admin/founder to insert outbound rows (`direction='outbound'`, `sender_type='agent'`, `sender_id=auth.uid()`, `can_access_wa_conversation(lead_id)`); inbound inserts remain service-role only via `createAdminClient()` in `whatsapp-ingestion.ts` |
| `20260530000039_fix_nurturing_task_insert.sql` | `CREATE OR REPLACE FUNCTION update_lead_status` — fixes nurturing auto-task: original RPC omitted `title` (NOT NULL after migration 0017) and `task_category` (must be `'gia_followup'`, not the default `'personal'`); both omissions caused the INSERT to fail silently; task now gets title `'Nurturing follow-up'` and correct category |
| `20260530000041_normalize_lead_domain.sql` | Single-transaction domain normalization (7 steps): (1) UPDATE profiles agent rows concierge→onboarding; (2) UPDATE leads for all indulge_*/concierge→enum values; (3) UPDATE whatsapp_notification_logs.domain; (4) DO block audits both tables, RAISE WARNING + remap any unexpected value; (5) DROP all 15 RLS policies that reference leads.domain or task_groups.domain (direct or via sub-SELECT), including lead_activities_select, lead_notes_select, `lead_sla_timers_*_select`, `wa_conversations_*`, `wa_messages_*`; (6) ALTER TABLE leads/task_groups/whatsapp_notification_logs domain TYPE app_domain; (7) RECREATE all 15 dropped policies + CREATE OR REPLACE can_access_wa_conversation() — all `::text` casts on `get_user_domain()` removed since both sides are now `app_domain` |
| `20260530000042_fix_group_task_summaries_domain_type.sql` | `CREATE OR REPLACE FUNCTION get_group_task_summaries` — fixes `42883` runtime error caused by migration 0041 changing `task_groups.domain` to `app_domain` while the RPC still compared `tg.domain = get_user_domain()::text` (no `=(app_domain, text)` operator exists); both sides are now `app_domain` so the `::text` cast is removed; `tg.domain::text` cast added to the SELECT list to preserve the `RETURNS TABLE (domain text)` contract |
| `20260530000043_fix_dashboard_summary_domain_type.sql` | `CREATE OR REPLACE FUNCTION get_dashboard_summary` — fixes `42883` runtime error on `/dashboard` caused by migration 0041 changing `leads.domain` to `app_domain` while `p_domain` parameter was still `text`; parameter type changed to `app_domain`; old `(text, text, uuid)` overload dropped |
| `20260530000044_fix_campaign_metrics_domain_type.sql` | `CREATE OR REPLACE FUNCTION get_campaign_metrics` — fixes `42883` runtime error on `/campaigns` caused by migration 0041 changing `leads.domain` to `app_domain` while `p_domain` parameter was still `text`; parameter type changed to `app_domain`; `domain::text` cast added to SELECT list to preserve `RETURNS TABLE (domain text)` contract; old `(text, timestamptz, timestamptz)` overload dropped |
| `20260530000045_lead_slug.sql` | `leads.slug text UNIQUE` column; `generate_lead_slug(first_name, last_name, phone)` function; `set_lead_slug()` trigger (BEFORE INSERT, immutable — no UPDATE trigger); `idx_leads_slug` partial unique index (`WHERE slug IS NOT NULL`); back-fills all existing rows with non-null phone |
| `20260530000046_lead_slug_collision_fix.sql` | Replaces `generate_lead_slug` with a collision-safe version that appends `-2`, `-3`, ... until the slug is free (archived/previous leads can share name+phone-suffix); re-runs backfill via per-row DO loop ordered `created_at ASC` so oldest lead keeps the clean slug |
| `20260531000048_dashboard_activity_limit_25.sql` | `CREATE OR REPLACE FUNCTION get_dashboard_summary` — bumps `agent_activity` LIMIT 10 → 25; all other CTEs unchanged; `getAgentRecentActivity` service function limit also bumped to 25 |
| `20260531000051_task_remark_rpc_auth_fix.sql` | `add_task_remark_with_status` — removes broken `auth.uid()` gate (NULL under service-role); `tasks_agent_select` + `task_remarks` RLS aligned to creator/assignee; action gates on user-scoped `tasks` SELECT (view = post) |
| `20260531000050_dashboard_activity_role_scoped.sql` | `CREATE OR REPLACE FUNCTION get_dashboard_summary` — fixes `agent_activity` CTE: admin/founder now see all activities (no filter); manager sees activities on leads in their domain; agent still sees `actor_id = p_user_id` only |
| `20260531000047_dashboard_agent_tasks_all_categories.sql` | `CREATE OR REPLACE FUNCTION get_dashboard_summary` — replaces `agent_tasks` CTE: now fetches all 3 task categories (`personal`, `group_subtask`, `gia_followup`) with active statuses (`to_do`, `in_progress`, `in_review`); LEFT JOINs `task_gia_meta`+`leads` for gia context label and `task_groups` for group label; sorted overdue→priority→due_at; limit 30; `newLeadsCount` removed |
| `20260531000054_create_lead_gia_task.sql` | `create_lead_gia_task(p_lead_id, p_assigned_to, p_created_by, p_task_type, p_title, p_description, p_priority, p_due_at)` RPC — two-INSERT transaction (`tasks` + `task_gia_meta`) to prevent orphaned task rows; returns the full `tasks` row; SECURITY DEFINER; GRANT EXECUTE to authenticated |
| `20260531000055_get_gia_tasks.sql` | `get_gia_tasks(p_user_id uuid, p_role text, p_domain app_domain)` RPC — returns all `gia_followup` tasks for the caller with joined lead identity (`lead_id`, `lead_first_name`, `lead_last_name`, `lead_phone`, `lead_slug`, `lead_domain`); agent role filters `assigned_to = p_user_id`; other roles filter `leads.domain = p_domain`; `p_domain` typed `app_domain` to avoid `42883` after migration 0041; order: active tasks first, then `due_at ASC NULLS LAST`; STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated; includes `ADD COLUMN IF NOT EXISTS slug` guard |
| `20260531000056_get_gia_tasks_slug_prereq.sql` | Hotfix when 0055 ran before 0045: ensures `leads.slug` + `idx_leads_slug`, optional backfill via `generate_lead_slug`, recreates `get_gia_tasks` (fixes `42703 column l.slug does not exist`) |
| `20260601000058_ad_creatives_multi_video.sql` | Drops the UNIQUE constraint on `ad_creatives.campaign_key` so one campaign can have multiple ad videos (one row per video). Idempotent `pg_constraint` guard; recreates non-unique `idx_ad_creatives_campaign_key`; normalisation CHECK from 0012 unchanged. |
| `20260602000059_agent_shift_days.sql` | `ADD COLUMN IF NOT EXISTS shift_days integer[]` on `agent_routing_config`; JS day-of-week array (0=Sun…6=Sat); NULL = use global BUSINESS_HOURS. |
| `20260602000060_leads_resolution_reason.sql` | `leads.resolution_reason TEXT` column; partial index `idx_leads_resolution_reason` (junk/lost, not archived); `CREATE OR REPLACE FUNCTION update_lead_status` — surgically adds persistence of `p_reason` to the column on junk/lost, clears it on revive (in_discussion); `GRANT EXECUTE` preserved. |
| `20260603000062_get_dashboard_summary_role_branch.sql` | `DROP FUNCTION get_dashboard_summary(text, app_domain, uuid)` then `CREATE OR REPLACE` as 4-param `(text, app_domain, uuid, app_domain DEFAULT NULL)`: agent role returns immediately after agent_tasks + agent_activity CTEs (empty stubs for lead_status/campaigns); manager/admin/founder compute all 4 CTEs; domain scoping: manager → p_domain, admin/founder + p_initial_domain → that domain, admin/founder + NULL → all-org. Only one overload remains. |
| `20260603000063_get_agent_recent_activity.sql` | New `get_agent_recent_activity(p_role text, p_domain app_domain, p_user_id uuid)` RPC — single `lead_activities LEFT JOIN leads` query; CASE role filter (admin/founder: all, manager: domain-scoped, agent: actor_id); returns jsonb array of 25 activities DESC; STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated. Replaces two-step Node.js pump in `getAgentRecentActivity`. |
| `20260603000064_dashboard_refresh_rpcs.sql` | `get_lead_pipeline_refresh(p_role text, p_domain app_domain)` — STABLE SECURITY DEFINER; returns `{totals, byAgent}` jsonb matching `DashboardLeadStatusSummary`; manager → domain-scoped, admin/founder → all. `get_campaign_pipeline_refresh(p_role text, p_domain app_domain)` — same scoping; returns top-12 campaign mix array matching `DashboardCampaignStatusMix[]`. Both eliminate Node-side aggregation from `getLeadStatusSummary` and `getLeadsByCampaign`. GRANT EXECUTE to authenticated. |

## Multi-write RPC pattern (perf-02)

When a server action performs multiple sequential DB writes that must be atomic, move all writes into a `SECURITY DEFINER` RPC. Access control (Zod validation, auth check, role/domain verification) stays in the action layer. Application-layer side-effects (Trigger.dev, notifications, SLA scheduling) also stay in the action layer — they cannot go inside a Postgres function.

**Pattern established by:** `add_lead_call_note` (migration 0030) and `update_lead_status` (migration 0031).

**Rules:**

- RPC must be `SECURITY DEFINER SET search_path = public` (A-10).
- Never add access-control logic inside the RPC — it runs as the function owner, not the calling user.
- Return a `jsonb` object with everything the action needs for fire-and-forget side-effects.
- Use `RAISE EXCEPTION` for not-found cases; the action maps these to user-facing errors.
- Cast `bigint` COUNT fields to `Number()` in the service/action layer before use (Q-09).

## whatsapp_messages — append-only contract with delivery-receipt exception

`whatsapp_messages` is append-only. There is no DELETE policy and no UPDATE policy for app users.

The one narrow exception: delivery receipt status updates (`status`, `status_at`) are written by the webhook handler using the **service-role client** (`src/lib/supabase/admin.ts`), which bypasses RLS. This is a system write, not a user mutation — it satisfies A-11.

PostgreSQL RLS cannot restrict which columns may be updated within an eligible row. Column restriction (only `status` and `status_at`) is enforced exclusively at the application layer in the webhook handler. Future engineers: do not add an UPDATE policy for agent/manager roles.

**wa_message_id uniqueness:** Enforced via a **partial unique index** (`WHERE wa_message_id IS NOT NULL`), not a column `UNIQUE` constraint. This allows multiple rows with `wa_message_id = NULL` for optimistic pre-confirm inserts. A full unique constraint would reject these rows.

**Realtime:** Both `whatsapp_conversations` and `whatsapp_messages` are on `supabase_realtime`. The WhatsApp page subscribes to both channels.

**can_access_wa_conversation():** SECURITY DEFINER helper defined in migration 0032. Used by both `whatsapp_conversations` and `whatsapp_messages` RLS policies. If `leads` RLS ever changes, review this function too — they are coupled.

---

## task_remarks — append-only contract with suppression exception

`task_remarks` replaces `task_messages` (dropped in migration 0022, pre-production, no data loss).

`task_remarks` has SELECT, INSERT, and one narrow UPDATE policy (`task_remarks_suppression_update`).
There is no DELETE policy and no other UPDATE policy.

The UPDATE policy permits admin/founder to update `task_remarks` rows. PostgreSQL RLS does NOT
restrict which columns may be updated — only which rows are eligible. Column restriction (only
`is_suppressed`, `suppressed_by`, `suppressed_at` may change) is enforced exclusively at the
application layer in `suppressTaskMessageAction` (`src/lib/actions/tasks.ts`). Future engineers:
do not assume SQL prevents changes to `content`, `author_id`, `task_id`, or `status_change`.

**status_change column:** nullable text. Set when a remark accompanied a status transition.
CHECK values mirror `tasks.status` CHECK exactly — they are coupled and must stay in sync.
If `tasks.status` ever gains a new value, a new migration must extend `task_remarks.status_change` too.

**Suppressed remarks** are never deleted. `is_suppressed = true` causes the UI to render
"This message was removed." — original content is never shown for any role.

**Index:** `idx_task_remarks_task_id` on `(task_id, created_at ASC)` — ASC because timeline reads oldest-first.

## task_audit_log — trigger contract

`log_task_changes()` fires AFTER UPDATE on `tasks` FOR EACH ROW. It logs changes to exactly six
fields: `title`, `description`, `status`, `priority`, `due_at`, `assigned_to`. All other columns
are intentionally excluded.

`changed_by` defaults to `auth.uid()`. When `auth.uid()` is NULL (service-role context), falls
back to `NEW.assigned_to`. Known limitation: reassignment via service role logs the new assignee
as the changer. Accepted trade-off — do not add a `changed_by` column to `tasks` to compensate.

`task_audit_log` is append-only — no UPDATE or DELETE policies ever.

## tasks status vocabulary (post-0017)

Old values `pending` and `done` no longer exist in the DB. They were migrated to `to_do` and `completed` respectively. Any code referencing the old values will fail at the DB constraint level.

New full set: `to_do | in_progress | in_review | completed | error | cancelled`

## tasks.task_type vocabulary (post-0057)

Allowed values: `call | whatsapp_message | other`.

Legacy values `email` and `general_follow_up` were backfilled to `other` in migration 0057.
UI labels live in `src/lib/constants/task-types.ts`. Nurturing auto-task in `update_lead_status` RPC uses `other`.

Never reintroduce `general_follow_up` or `email` in application writes.
