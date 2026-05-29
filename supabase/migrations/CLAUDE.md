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
