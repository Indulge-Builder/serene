# Migrations CLAUDE.md

## Rules

- Never edit a migration that has already run in production (rule A-14). Write a new one.
- Every new table gets `ALTER TABLE x ENABLE ROW LEVEL SECURITY` (rule A-08).
- Log and activity tables are append-only — no UPDATE or DELETE RLS policies, ever (rule A-11).
- Reuse `update_updated_at()` — never recreate it. It is defined in the earliest migration.
- All `SECURITY DEFINER` functions must have `SET search_path = public` (rule A-10).
- A `SECURITY DEFINER` read RPC must either **self-derive** its scope (`auth.uid()` /
  `get_user_role()` / `get_user_domain()` inside the body) — then it may be GRANTed to
  `authenticated` — or, if it accepts caller-supplied scope params (`p_role`/`p_domain`/
  `p_user_id`) or returns whatever slice it is asked for, its EXECUTE **must** be REVOKEd from
  `PUBLIC, anon, authenticated` in the same migration and it becomes admin-client-only from the
  service layer with session-derived args (Q-13; pattern: 0007/0008/0102 — audit F-1).

## Migration inventory

| File | What it does |
| --- | --- |
| `20260526000001_profiles.sql` | `user_role`, `app_domain` enums; `profiles` table; `update_updated_at()` function |
| `20260526000002_agent_routing_config.sql` | `agent_routing_config` table; round-robin helpers |
| `20260527000003_leads.sql` | `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` |
| `20260527000004_lead_raw_payloads.sql` | `lead_raw_payloads` immutable log |
| `20260527000005_lead_raw_payloads_error.sql` | `ingestion_error` column on `lead_raw_payloads` |
| `20260527000006_scratchpad_rls.sql` | RLS fix for `private_scratchpad` |
| `20260527000007_round_robin_fn.sql` | Atomic `get_next_round_robin_agent()` DB function |
| `20260527000008_lead_dedup.sql` | `previous_lead_id` FK; `get_active_lead_by_phone()` (v1 — `SETOF leads`, `SELECT *`) |
| `20260608000090_fix_select_star_rpcs.sql` | `get_active_lead_by_phone` v2 — `RETURNS TABLE` with 9 explicit columns; no `SELECT *`. `get_personal_tasks` unchanged |
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
| `20260606000080_get_leads_status_counts.sql` | `get_leads_status_counts(p_agent_id, p_date_from, p_date_to, p_campaign, p_search, p_health, p_source, p_outcomes, p_statuses)` RPC — returns `TABLE(status text, cnt bigint)` for the full filtered dataset; role/domain scoping self-enforced via `get_user_role()` / `get_user_domain()`; STABLE SECURITY DEFINER; empty-array guard on `p_outcomes`/`p_statuses` (treats as "no filter"); GRANT EXECUTE to authenticated. Called in `Promise.all` alongside the paginated query in `getLeadsByRole`. **Superseded by 0083 — `p_health` removed.** |
| `20260608000083_status_counts_drop_health.sql` | Removes the `lead_health` feature remnant from `get_leads_status_counts`. Drops the old 9-param overload (with `p_health`) and recreates the 8-param version without `p_health` / the `l.lead_health` predicate — the `lead_health` column was dropped in 0082. Matches the updated `getLeadsByRole` / `getLeadsForExport` call sites (8 RPC params). STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated. |
| `20260608000084_lead_health_full_removal.sql` | Idempotent completion of `lead_health` removal on production: `DROP COLUMN IF EXISTS lead_health`, `DROP INDEX IF EXISTS idx_leads_health`, `DROP FUNCTION IF EXISTS refresh_lead_health_bulk()`, `CREATE OR REPLACE` for `add_lead_call_note` and `add_lead_plain_note` with `lead_health` SET clauses removed (bodies match 0030/0040). Safe when 0082 already ran. |
| `20260608000092_fix_ad_creatives_storage_rls.sql` | Storage RLS for the `ad-creatives` bucket. Drops legacy permissive `"Ad Creative Modal insert/delete"` policies; creates `ad_creatives_storage_insert` / `ad_creatives_storage_delete` gating `storage.objects` writes (`bucket_id = 'ad-creatives'`) to `profiles.role IN ('admin','founder')`. No SELECT policy — bucket read stays public for dossier/campaign playback. Mirrors the table-level write RLS from 0012. |
| `20260608000094_explicit_insert_delete_policies.sql` | `tasks_insert` (personal, self-assigned); `tasks_delete` (agent, personal, non-terminal); `tasks_delete_privileged` (manager/admin/founder). No deals INSERT/DELETE policies — `COMMENT ON TABLE public.deals` documents intentional RPC/service-role-only writes. |
| `20260604000069_dashboard_date_filter.sql` | Extends `get_dashboard_summary` (5th + 6th params: `p_date_from timestamptz DEFAULT NULL`, `p_date_to timestamptz DEFAULT NULL`), `get_lead_pipeline_refresh` (same two params), and `get_campaign_pipeline_refresh` (same two params). Date filter applies `created_at >= p_date_from AND created_at < p_date_to` to the `lead_status` and `campaigns` CTEs only. `agent_tasks` and `agent_activity` are unaffected. Backwards-compatible: all existing callers that omit the params see NULL → all-time behaviour unchanged. All three functions remain STABLE SECURITY DEFINER; GRANT EXECUTE preserved. |
| `20260604000070_fix_pipeline_agent_total.sql` | Fixes `agent_counts` / `campaign_agg` totals: `COUNT(*)` on status subquery rows → `SUM(cnt)` (actual lead count). Affects `get_dashboard_summary`, `get_lead_pipeline_refresh`, `get_campaign_pipeline_refresh`. Restores correct per-agent stacked bar proportions and campaign sort order. |
| `20260530000036_rpc_get_wa_unread_count.sql` | `get_wa_unread_count()` RPC — per-agent unread WhatsApp conversation count; LEFT JOIN `whatsapp_conversation_reads` on `agent_id = auth.uid()`; counts open conversations where `last_read_at IS NULL` or `last_message_at > last_read_at`; gated by `can_access_wa_conversation()`; RETURNS integer; STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated |
| `20260530000037_whatsapp_messages_outbound_insert.sql` | `wa_messages_outbound_insert` RLS INSERT policy — allows authenticated agents/managers/admin/founder to insert outbound rows (`direction='outbound'`, `sender_type='agent'`, `sender_id=auth.uid()`, `can_access_wa_conversation(lead_id)`); inbound inserts remain service-role only via `createAdminClient()` in `whatsapp-ingestion.ts` |
| `20260530000039_fix_nurturing_task_insert.sql` | `CREATE OR REPLACE FUNCTION update_lead_status` — fixes nurturing auto-task: original RPC omitted `title` (NOT NULL after migration 0017) and `task_category` (must be `'gia_followup'`, not the default `'personal'`); both omissions caused the INSERT to fail silently; task now gets title `'Nurturing follow-up'` and correct category |
| `20260530000041_normalize_lead_domain.sql` | Single-transaction domain normalization (7 steps): (1) UPDATE profiles agent rows concierge→onboarding; (2) UPDATE leads for all indulge*\*/concierge→enum values; (3) UPDATE whatsapp_notification_logs.domain; (4) DO block audits both tables, RAISE WARNING + remap any unexpected value; (5) DROP all 15 RLS policies that reference leads.domain or task_groups.domain (direct or via sub-SELECT), including lead_activities_select, lead_notes_select, `lead_sla_timers*_*select`, `wa_conversations*_`, `wa*messages*\*`; (6) ALTER TABLE leads/task_groups/whatsapp_notification_logs domain TYPE app_domain; (7) RECREATE all 15 dropped policies + CREATE OR REPLACE can_access_wa_conversation() — all `::text`casts on`get_user_domain()`removed since both sides are now`app_domain` |
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
| `20260530000038_whatsapp_notification_logs.sql` | `whatsapp_notification_logs` table — one row per outbound template send attempt. Stores last-4 phone digits only (never full numbers), `gupshup_status`/`gupshup_body`/`delivered`. `type` CHECK initially `('agent_assignment','founder_alert')` — later widened by 0067. RLS enabled. |
| `20260530000040_rpc_add_lead_plain_note.sql` | `add_lead_plain_note(p_lead_id, p_author_id, p_content, p_now)` RPC — plain note insert + `last_activity_at` bump, **no** `call_count`/`last_call_outcome` change. SECURITY DEFINER; backs `addLeadNote`. |
| `20260602000061_remove_private_scratchpad.sql` | `DROP COLUMN leads.private_scratchpad`; `DROP FUNCTION get_lead_scratchpad(uuid)` — scratchpad feature removed. |
| `20260603000065_attribution_refactor.sql` | Attribution refactor: 7 flat ad columns → `source`, `medium`, `utm_campaign` + `attribution jsonb`. Renames `utm_source→source`, `utm_medium→medium`; drops `platform`/`campaign_id`/`ad_name`/`utm_content` (backfilled into `attribution` JSONB). Filter index renamed `idx_leads_utm_source → idx_leads_source`. |
| `20260603000066_leads_city_column.sql` | `leads.city text` top-level column; backfills out of `personal_details->>'city'` then strips the key from the JSONB. |
| `20260603000067_extend_whatsapp_notification_log_types.sql` | Widens `whatsapp_notification_logs.type` CHECK to `('agent_assignment','founder_alert','sla_breach','lead_initiation')`. Historical rows unchanged (SLA rows stay `agent_assignment` — no reliable discriminator). |
| `20260604000066_domain_health_metrics.sql` | `get_domain_health_metrics(p_domains app_domain[], p_date_from, p_date_to)` RPC — one row per requested domain (always, even zero leads); CTEs for cohort/closures/pipeline/calls; pipeline is a live snapshot, rest date-filtered. STABLE SECURITY DEFINER. **NOTE: duplicate `0066` timestamp prefix shared with `leads_city_column` — both apply, ordered by full filename.** |
| `20260604000068_domain_health_add_calls_revenue.sql` | Extends `get_domain_health_metrics` with `total_calls_made` (SUM call_count on period cohort) and `total_revenue` (SUM deal_amount on `status='won'` by `status_changed_at`). Later repointed to `deals` in 0076. |
| `20260605000058_task_groups_flat_visibility.sql` | **Flat group-task visibility** (replaces role-branched model): a user sees groups they CREATED or are ASSIGNED a subtask in; delete = creator only. `get_group_task_summaries` updated with the same two-condition WHERE; all `get_user_role()`/`get_user_domain()` removed. Adds `idx_tasks_group_assignee`. **NOTE: duplicate `0058` prefix shared with `ad_creatives_multi_video`.** |
| `20260605000071_avatars_storage_bucket.sql` | Public `avatars` storage bucket; object name == `profile.id`; idempotent RLS: `avatars_public_read` + own-object insert/update/delete. |
| `20260605000072_create_deals_table.sql` | `public.deals` first-class table (reverses the 2026-05-31 "no deals table" decision). Columns: `lead_id` (nullable — walk-ins), `client_id` (FK deferred), contact fields, `domain`, `deal_amount`, `deal_type` (`membership`/`retail`), `deal_duration`, `assigned_to`, `won_at`, `archived_at`. RLS mirrors leads scoping. No INSERT/DELETE policies (RPC/service-role writes only). |
| `20260605000073_backfill_deals_from_won_leads.sql` | Idempotent backfill (`NOT EXISTS` guard) of `public.deals` from existing `status='won'` leads — every pre-migration `/deals` row stays visible. |
| `20260605000074_get_deals_summary_over_deals.sql` | Rewrites `get_deals_summary` to query `public.deals` (was `leads`); structural WHERE collapses to `archived_at IS NULL`; date filters apply to `won_at`. Two-domain param split (`p_caller_domain`/`p_filter_domain`) preserved from 0053. |
| `20260605000075_deals_add_source.sql` | `deals.source text` column (CHECK `meta`/`google`/`website`/`whatsapp`/`referral`/`ypo`/`events`) mirroring `leads.source`; nullable; partial index `deals_source_idx`. |
| `20260605000076_domain_health_revenue_from_deals.sql` | Repoints `get_domain_health_metrics.total_revenue` to `SUM(deals.deal_amount) WHERE archived_at IS NULL` by `won_at`. All other CTEs stay on `leads` (lifecycle, not revenue). |
| `20260606000077_lead_health_column.sql` | **(reverted by 0082)** Adds `leads.lead_health text` (`healthy`/`needs_attention`/`at_risk`) + `idx_leads_health`. |
| `20260606000078_lead_health_rpc_hooks.sql` | **(reverted by 0082)** Patches `add_lead_call_note`/`add_lead_plain_note`/`update_lead_status` to set `lead_health` on every write. |
| `20260606000079_refresh_lead_health_rpc.sql` | **(reverted by 0082)** `refresh_lead_health_bulk()` RPC — hourly bulk health recompute over active non-terminal leads; SECURITY DEFINER. |
| `20260606000081_dashboard_cold_leads.sql` | Adds `cold_leads_count` CTE to `get_dashboard_summary` (no activity 5+ days, non-terminal; threshold matches `COLD_LEAD_THRESHOLD_DAYS`). manager → domain, admin/founder → all, agent early-returns. Backs `ManagerColdLeadsWidget` first-paint. |
| `20260606000082_revert_lead_health.sql` | **Reverts the entire `lead_health` feature (077–079):** drops the column, `idx_leads_health`, and `refresh_lead_health_bulk()`; restores the three RPC bodies to their pre-health form (matching 0030/0040/0060). |
| `20260608000085_fix_wa_unread_count.sql` | Fixes `get_wa_unread_count()` — `can_access_wa_conversation()` expects `lead_id`, not `wc.id`; the wrong arg made the unread badge return 0 for every agent. |
| `20260608000086_fix_tasks_status_default.sql` | `ALTER tasks.status SET DEFAULT 'to_do'` — 0017 migrated the CHECK values but left the default as legacy `'pending'`, violating `tasks_status_check` on INSERT. |
| `20260608000087_fix_campaign_first_touch_key.sql` | Fixes `get_campaign_detail_metrics.avg_hours_to_first_touch` — lateral join read `details->>'to'` but `update_lead_status` writes `old_status`/`new_status` keys. |
| `20260608000088_rls_initplan_hoist.sql` | Hoists `get_user_role()`/`get_user_domain()` into uncorrelated `(SELECT …)` scalar subqueries across RLS policies (leads + others) so STABLE helpers evaluate once per statement, not per row. (Three policies missed here are fixed in 0095.) |
| `20260608000089_drop_dead_rpc_overloads.sql` | Drops superseded overloads: old 4-param (no-date) `get_dashboard_summary` and old 2-param `get_campaign_pipeline_refresh`. |
| `20260608000091_fix_leads_update_policy.sql` | `leads_update` RLS now requires `archived_at IS NULL` — archived leads are immutable via direct UPDATE; un-archive must go through a SECURITY DEFINER path. |
| `20260608000093_remove_duplicate_avatar_policies.sql` | Drops the legacy quoted-name avatar storage policies; canonical set from 0071 (`avatars_*`) remains. |
| `20260608000095_rls_hoist_missed_three.sql` | Completes the 0088 InitPlan hoist for three policies it missed: `wa_notif_logs_admin_founder_select`, `routing_config_update`, and one more — wraps bare `get_user_role()` in `(SELECT …)`. |
| `20260608000096_attribution_comment.sql` | `COMMENT ON COLUMN leads.attribution` documenting the immutable-after-insert UTM/platform snapshot contract. No data change. |
| `20260608000097_drop_leads_dead_deal_columns.sql` | Drops orphaned `leads.deal_amount`/`deal_type`/`deal_duration` (and CASCADE their CHECK constraints) — dead since deals became first-class (0072–0074); `recordDeal` writes to `public.deals`. |
| `20260611000098_leads_search_text_trgm.sql` | **(perf C-2)** `pg_trgm` extension (schema `extensions`); `leads.search_text` STORED generated column (`first_name + last_name + email + city + phone`) — THE search surface for every lead search path; `idx_leads_search_trgm` GIN trigram partial index (`archived_at IS NULL`). Table rewrite on ADD COLUMN — fast at current volume. Bonus: multi-word name search now matches across the first/last boundary. |
| `20260611000099_status_counts_total_fold.sql` | **(perf C-1)** `get_leads_status_counts` v3 (10 params): adds `p_domain` (admin/founder Gia slice only — agent/manager scoping stays self-derived) + `p_going_cold` (fixes the live PGRST202 — the service had passed `p_going_cold` since the going-cold preset shipped but no overload had it, so EVERY list load's count RPC failed and pills rendered empty); search switched to `l.search_text ILIKE`; `p_date_to` now inclusive (`<=`, matches `.lte()`). Drops the 8-param overload. `totalCount` in `getLeadsByRole` is now the sum of these rows — the paginated query dropped `{ count: 'exact' }`. **Run before deploying the service change** (new signature is a superset with defaults; old deployed call matches immediately). |
| `20260611000100_leads_domain_created_index.sql` | **(perf C-4)** `idx_leads_domain_created (domain, created_at DESC) WHERE archived_at IS NULL` — serves the manager list path (`domain = X ORDER BY created_at DESC LIMIT 30`) in one descent. Verify with `EXPLAIN ANALYZE` post-deploy; cheap to drop if unused. |
| `20260611000101_agent_performance_rpcs.sql` | **(perf D-2)** `_agent_core_metrics(agent, from, to)` internal helper (EXECUTE revoked from clients); `get_agent_performance(from, to, prev_from?, prev_to?)` — SELF-SCOPED (`auth.uid()` + `get_user_domain()`, no identity params) jsonb: core + previous + effort + outcomes + benchmarks; replaces the agent view's ~17-query fan-out. Benchmarks now true domain-wide (SECURITY DEFINER) — previously agent-RLS silently reduced them to the caller's own rows. `get_agent_roster_performance(from, to, domain?)` — role-gated (manager+ only; manager pinned to `get_user_domain()`, p_domain honoured only for admin/founder, NULL = all); one row per active agent via LEFT-JOINed aggregate CTEs (leads cohort, won/lost, deals revenue, first-touch AVG). Both STABLE SECURITY DEFINER `SET search_path = public`; GRANT to authenticated. |
| `20260611000102_revoke_scope_param_rpcs.sql` | **(security F-1, Q-13)** REVOKEs EXECUTE from `PUBLIC, anon, authenticated` on all 11 Class B/C read-RPC signatures that trust caller-supplied scope params or have no internal gate: `get_dashboard_summary`, `get_agent_recent_activity`, **both** `get_lead_pipeline_refresh` overloads (the 2-param one is dead code 0089 missed), `get_campaign_pipeline_refresh`, `get_deals_summary`, `get_gia_tasks`, `get_campaign_metrics`, `get_campaign_detail_metrics`, `get_campaign_agent_distribution`, `get_domain_health_metrics`. Explicit `service_role` GRANTs. The 10 service call sites switched to `createAdminClient()` — args stay session-derived (caller = trust boundary). Self-scoped RPCs keep their `authenticated` GRANT. |
| `20260611000103_leads_update_explicit_with_check.sql` | **(security §1 polish)** `leads_update` policy recreated with an explicit `WITH CHECK` identical to its `USING` body (0091 form, InitPlan hoist preserved) — previously the new-row gate was implicit via PostgreSQL's USING-fallback on UPDATE. Zero behaviour change; survives a future column-specific `WITH CHECK` edit. |
| `20260612000104_ad_spend_daily.sql` | `ad_spend_daily` table — day-grain Meta spend (budget page); `UNIQUE(campaign_key, spend_date, source)`; `campaign_key` lowercase+trim CHECK (mirrors ad_creatives 0012 — the lead join depends on it); RLS manager+ read, admin/founder write; reuses `update_updated_at()`. |
| `20260612000105_domain_targets.sql` | `domain_targets` table — founder-set monthly targets per domain; metric CHECK `('deals_closed')`, period CHECK `('month')`, `UNIQUE(domain, metric, period)`; RLS all-authenticated read, admin/founder write. Nothing seeded. |
| `20260612000106_get_budget_summary.sql` | `get_budget_summary(p_date_from, p_date_to)` RPC — spend per campaign LEFT-joined to lead counts (`created_at` cohort, `lower(trim(utm_campaign))` join) + deals (count/revenue by `won_at` via `deals.lead_id`); spend dates filtered on IST calendar days. STABLE SECURITY DEFINER; **EXECUTE revoked from authenticated (Q-13)** — admin client only. |
| `20260612000107_domain_health_deals_count.sql` | Extends `get_domain_health_metrics` with `total_deals` (COUNT from `public.deals` by `won_at`, same source/date-field as `total_revenue`); all other CTEs unchanged; re-applies the 0102 revoke posture after DROP/recreate. |
| `20260612000108_agent_today_pulse.sql` | `get_agent_today_pulse(p_today_start, p_date_from, p_date_to)` RPC — SELF-SCOPED (`auth.uid()`, GRANT authenticated, 0101 pattern): calls-today new-vs-old split (partition of one row set — always sums to total), 14-day daily call trend (IST day boundary passed in from `lib/utils/ist`), period deals count + revenue from `public.deals`. |
| `20260612000109_leads_service_interests.sql` | **(Call Intelligence Phase 1)** `leads.service_interests text[] NOT NULL DEFAULT '{}'` + partial GIN index (`archived_at IS NULL`). `text[]` by design, never the category enum — per-domain vocabularies live in `lib/constants/interests.ts`. Spec named this 0085/0086 — renumbered, those slots were taken. |
| `20260612000110_call_intelligence_tables.sql` | **(Call Intelligence Phase 1)** `service_cases` (brag library: text category, freeform tags incl. mandatory city slug, weighted generated FTS vector + GIN, tags GIN, featured/sort indexes, `update_updated_at()` trigger, dormant `embedding extensions.vector(1536)` — **HNSW index deferred to Phase 2**) + `conversation_hooks`. RLS both tables: all-authenticated SELECT; admin/founder-only writes via InitPlan-hoisted `(SELECT get_user_role())`. Installs the `vector` extension into `extensions`; adds `public.immutable_array_to_string(text[], text)` (plain `array_to_string` is STABLE — Postgres rejects it in a GENERATED column). **Content is NOT bulk-seeded:** every case/hook is entered via the admin path only after team verification — `docs/modules/call-intelligence-content-worksheet.md`. |
| `20260612000111_sla_policies.sql` | **(Follow-up engine Phase 2)** `sla_policies` config table — one row per engine rule: `trigger_kind` CHECK (`status`/`outcome`/`task_due`), `trigger_value`, `threshold_minutes`, `recipient_role` CHECK (`agent`/`manager`/`founder`), `auto_task`, `channels text[]`, `hours_mode` CHECK (`agent_shift`/`business`/`clock`), `active`. RLS: admin/founder SELECT only; writes service-role (future settings UI goes through an admin-gated action). Seeded: the 8 live SLA rules copied from `SLA_RULES` (statusTrigger `active` stored as the real status `nurturing`) + `SLA-01C` (new·45min·founder) + `CAD-01A/B/C` (outcome cadence: rnr/switched_off/wrong_number) + `TASK-01A/B` (gia task due / overdue+30 clock-min). Engine reads per job run — never module-cached. |
| `20260612000112_last_call_outcome_at.sql` | `leads.last_call_outcome_at timestamptz` — when the latest outcome was logged (the cadence 7-day freshness window reads it; `last_call_outcome` itself has existed since 0003). `CREATE OR REPLACE add_lead_call_note` — body identical to 0084 plus the one new SET line. Backfill from latest outcome-bearing `lead_notes.created_at`; leads whose outcome predates note history stay NULL = never fresh = never arm. |
| `20260612000113_task_overdue_and_notification_types.sql` | `tasks.overdue_at timestamptz` + partial index — stamped **exactly once** by `check-task-overdue` (`UPDATE … WHERE overdue_at IS NULL`); deliberately a timestamp, the `tasks.status` CHECK does NOT grow. Widens `notifications.type` CHECK with `sla_breach_founder` + `task_overdue_manager` and `whatsapp_notification_logs.type` CHECK with `task_due_reminder` + `task_overdue_manager`. |
| `20260612000114_cad02_in_discussion_cadence.sql` | **(Follow-up engine Phase 3)** Seeds `CAD-02A` — the In Discussion 48h cadence (`status` · `in_discussion` · 2880 biz-min · agent · auto_task · channels `{}` · `agent_shift`); idempotent `ON CONFLICT (code) DO NOTHING`. Paired engine extension: every CAD-prefixed code takes the cadence fire path (follow-up task + re-arm) regardless of trigger_kind; status cadences re-arm `threshold_minutes` ahead. **⚠️ NOT yet applied to prod.** |

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
