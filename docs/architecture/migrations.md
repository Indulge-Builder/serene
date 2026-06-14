# Migrations

> **Purpose:** migration conventions and the full ordered index of every schema migration.
> **Audience:** engineers. · **Source-of-truth scope:** conventions + history narrative. The migration *files* in `supabase/migrations/` are truth; the code-adjacent inventory in `supabase/migrations/CLAUDE.md` is updated in the same commit as each new migration — this index is the docs-side view and must be synced when migrations ship. If they ever disagree, the SQL files win.
> **Last verified:** 2026-06-11 against `supabase/migrations/` (105 migration files, 0001–0103).

---

## Conventions (non-negotiable)

- **Never edit a migration that has already run in production (A-14).** Write a new one — even
  for typos. Repair migrations are normal (see the repair list below).
- **Every new table** ships with `ALTER TABLE x ENABLE ROW LEVEL SECURITY` (A-08) in the same
  migration.
- **Log/activity tables** get no UPDATE or DELETE policies, ever (A-11).
- **Reuse `update_updated_at()`** (defined in 0001) — never recreate it.
- **SECURITY DEFINER functions:** always `SET search_path = public` (A-10); never a
  caller-supplied scope parameter (Q-13) — self-derive scope, or REVOKE client EXECUTE
  (see `auth-and-rbac.md` §10).
- **Enum↔text comparisons** always cast: `get_user_domain()::text` (42883 guard).
- **Idempotency guards** (`IF EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT DO NOTHING`) on any
  migration that may meet divergent production state — see 0056, 0073, 0084.

## Numbering caveat

Migrations apply in **filename-timestamp order** (`YYYYMMDD…`), not by trailing serial. Two
serials were reused on different days: **0058** (`ad_creatives_multi_video` 06-01 *and*
`task_groups_flat_visibility` 06-05) and **0066** (`leads_city_column` 06-03 *and*
`domain_health_metrics` 06-04). Always trust the date prefix.

## Repair migrations (drift fixed by a later migration — the pattern to copy)

| Repair | Fixed | What drifted |
| ------ | ----- | ------------ |
| 0042–0044 | 0020/0029/0014 | enum↔text 42883 casts |
| 0046 | 0045 | slug collision handling |
| 0051 | 0035 | remark RPC auth (`auth.uid()` NULL under service role) |
| 0056 | 0055 | `get_gia_tasks` on DBs where 0055 ran before the 0045 slug column |
| 0082→0083→0084 | 0077–0079 | `lead_health` revert; **0084 is the true final removal** — 0082 recorded the revert but function bodies had drifted in production |
| 0085 | 0036 | WA unread count passed conversation id where a lead id was expected (badge always 0) |
| 0086 | 0017 | `tasks.status` default still `'pending'` after the CHECK migrated to `to_do…` |
| 0087 | 0031 | campaign first-touch read the wrong jsonb key |
| 0095 | 0088 | three RLS policies missed by the InitPlan hoist |

## Index

> Compact one-liners; full reasoning lives in each SQL file's header comment.

| # (date) | What it creates / changes |
| -------- | ------------------------- |
| 0001 (05-26) | `user_role`/`app_domain` enums; `profiles`; `profile_audit_log`; `get_user_role()`/`get_user_domain()`; `on_auth_user_created`; `update_updated_at()` |
| 0002 (05-26) | `agent_routing_config`; round-robin helpers; auto-create trigger |
| 0003 (05-27) | `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` |
| 0004 (05-27) | `lead_raw_payloads` immutable log |
| 0005 (05-27) | `ingestion_error` column on `lead_raw_payloads` |
| 0006 (05-27) | RLS fix for `private_scratchpad` (column later dropped, 0061) |
| 0007 (05-27) | `get_next_round_robin_agent()` — atomic `SELECT FOR UPDATE SKIP LOCKED` |
| 0008 (05-27) | Phone dedup — `previous_lead_id` FK, `get_active_lead_by_phone()` |
| 0009 (05-27) | `personal_details JSONB` on `leads` |
| 0010 (05-28) | Partial indexes: utm_campaign, last_call_outcome, utm_source (→ `idx_leads_source` in 0065) |
| 0011 (05-28) | `idx_leads_phone_text` (`text_pattern_ops`) |
| 0012 (05-28) | `ad_creatives` table (campaign_key UNIQUE — dropped in 0058a) |
| 0013 (05-28) | Performance partial indexes (lead_activities, lead_notes, leads) |
| 0014 (05-28) | Campaign indexes + `get_campaign_metrics` RPC |
| 0015 (05-28) | `get_campaign_detail_metrics` + `get_campaign_agent_distribution` RPCs |
| 0016 (05-28) | `notifications` table, Realtime enabled |
| 0017 (05-28) | `task_groups`; `task_messages` (replaced in 0022); `tasks` extended; status values migrated `pending→to_do`, `done→completed` |
| 0018–0019 (05-28) | `task_groups` / `task_messages` RLS domain enforcement |
| 0020 (05-28) | `get_group_task_summaries` RPC — self-enforcing domain scope |
| 0021 (05-28) | `task_messages` suppression + `task_audit_log` + `log_task_changes()` |
| 0022 (05-29) | `task_messages` → `task_remarks` (adds `status_change`); Realtime |
| 0023–0024 (05-29) | `attachments jsonb` (checklist) + `tags text[]` + GIN index on `tasks` |
| 0025–0026 (05-29) | Task indexes + `get_personal_tasks` keyset-cursor RPC |
| 0027–0028 (05-29) | `status_changed_at`/`last_activity_at` on leads; SLA notification types; `lead_sla_timers` |
| 0029 (05-29) | `get_dashboard_summary` RPC (single jsonb) |
| 0030–0031 (05-29) | `add_lead_call_note` / `update_lead_status` single-transaction RPCs |
| 0032–0034 (05-30) | `whatsapp_conversations` / `whatsapp_messages` (append-only + receipt exception) / `whatsapp_conversation_reads` |
| 0035 (05-30) | `add_task_remark_with_status` RPC |
| 0036–0038 (05-30) | `get_wa_unread_count` RPC; outbound-insert RLS; `whatsapp_notification_logs` |
| 0039–0040 (05-30) | nurturing auto-task fix; `add_lead_plain_note` RPC |
| 0041 (05-31) | `normalize_lead_domain` — `leads.domain` → `app_domain` enum; default → `onboarding` |
| 0042–0044 (05-31) | 42883 cast repairs (see repair table) |
| 0045–0046 (05-30/31) | `leads.slug` + trigger + collision fix + backfill |
| 0047–0048 (05-31) | dashboard summary: 3 task categories; activity limit 25 |
| 0049 (05-31) | `leads.deal_*` columns (dropped in 0097) |
| 0050 (05-31) | dashboard activity feed role-scoped |
| 0051 (05-31) | remark RPC auth repair (view = post) |
| 0052–0053 (05-31) | `get_deals_summary` RPC + manager-domain fix |
| 0054–0056 (05-31/06-01) | `create_lead_gia_task` RPC; `get_gia_tasks` RPC + slug prereq repair |
| 0057 (06-01) | `task_type` backfill → call / whatsapp_message / other |
| 0058a (06-01) | ad_creatives multi-video (drops campaign_key UNIQUE) |
| 0059 (06-02) | `agent_routing_config.shift_days integer[]` |
| 0060 (06-02) | `leads.resolution_reason` + RPC persistence |
| 0061 (06-02) | drop `private_scratchpad` + `get_lead_scratchpad()` |
| 0062–0064 (06-02/03) | dashboard summary `p_initial_domain`; `get_agent_recent_activity`; per-widget refresh RPCs |
| 0065 (06-03) | **Attribution refactor** — `utm_source→source`, `utm_medium→medium`; `platform`/`campaign_id`/`ad_name`/`utm_content` → `attribution jsonb`; `idx_leads_source` |
| 0066a (06-03) | `leads.city` column + JSONB backfill/cleanup |
| 0067 (06-03) | `whatsapp_notification_logs.type` CHECK + `lead_initiation` |
| 0066b (06-04) | domain-health aggregates RPC |
| 0068–0070 (06-04) | domain-health calls+revenue; dashboard date-filter; pipeline agent-total fix |
| 0058b (06-05) | task_groups flat visibility (creator OR subtask-assignee) |
| 0071 (06-05) | `avatars` Storage bucket + RLS |
| 0072–0074 (06-05) | **`public.deals` first-class table** + backfill + `get_deals_summary` rewrite |
| 0075–0076 (06-05) | `deals.source`; domain-health revenue reads `public.deals` |
| 0077–0079 (06-06) | `lead_health` build **[reverted 0082; final removal 0084]** |
| 0080–0081 (06-06) | `get_leads_status_counts` RPC; dashboard cold-leads query |
| 0082–0084 (06-06/08) | `lead_health` revert chain (see repair table) |
| 0085–0087 (06-08) | WA-unread fix; `tasks.status` default fix; campaign first-touch key fix |
| 0088 (06-08) | RLS InitPlan hoist (`(SELECT get_user_role())`) across policies |
| 0089–0090 (06-08) | drop dead RPC overloads; explicit projection on `get_active_lead_by_phone` |
| 0091 (06-08) | `leads_update` requires `archived_at IS NULL` (archived leads immutable) |
| 0092–0093 (06-08) | ad-creatives storage RLS tightened; duplicate avatar policies dropped |
| 0094 (06-08) | explicit `tasks` INSERT/DELETE policies; `deals` no-write-policy comment |
| 0095 (06-08) | InitPlan hoist for the three missed policies |
| 0096 (06-08) | `leads.attribution` contract comment (ingestion now writes it) |
| 0097 (06-08) | drop dead `leads.deal_amount/type/duration` columns |
| 0098 (06-11) | `leads.search_text` STORED generated column + `idx_leads_search_trgm` (pg_trgm GIN) — indexable list search (perf C-2) |
| 0099 (06-11) | `get_leads_status_counts` recreate — totalCount folded from per-status counts; predicate-parity fixes incl. the missing `p_going_cold` overload (perf C-1) |
| 0100 (06-11) | `idx_leads_domain_created` composite — manager list path (perf C-4) |
| 0101 (06-11) | `get_agent_performance` (self-scoped) + `get_agent_roster_performance` RPCs — performance page aggregation moved into SQL (perf D-2) |
| 0102 (06-11) | **REVOKE client EXECUTE on scope-param RPCs** (security F-1, Option A) — Class B/C read RPCs callable only via the service-role action path |
| 0103 (06-11) | explicit `WITH CHECK` on `leads_update` (self-documenting; body identical to the 0091 USING clause) |
| 0104 (06-12) | `ad_spend_daily` table — day-grain Meta spend; `UNIQUE(campaign_key, spend_date, source)` |
| 0105 (06-12) | `domain_targets` table — founder monthly deals-closed targets |
| 0106 (06-12) | `get_budget_summary` RPC — spend + lead/deal joins (EXECUTE revoked, Q-13) |
| 0107 (06-12) | domain-health `total_deals` aggregate from `public.deals` |
| 0108 (06-12) | `get_agent_today_pulse` self-scoped RPC (calls split + 14-day trend + period deals) |
| 0109 (06-12) | **`leads.service_interests text[]`** + partial GIN index (Call Intelligence Phase 1) |
| 0110 (06-12) | **`service_cases` + `conversation_hooks` tables** — RLS (all-authenticated read / admin+founder write), weighted FTS + tags GIN indexes, `immutable_array_to_string()` helper, dormant `embedding vector(1536)` column (no HNSW until Phase 2) |
| 0111 (06-12) | **`sla_policies` table** (follow-up engine Phase 2) — one row per rule (trigger_kind status/outcome/task_due, threshold, recipient_role, auto_task, channels, hours_mode, active); RLS admin/founder SELECT, service-role writes; seeded with the 8 live SLA rules (parity with `SLA_RULES`; 'active'→'nurturing') + SLA-01C (new·45·founder) + CAD-01A/B/C cadence family + TASK-01A/B task-due rules |
| 0112 (06-12) | **`leads.last_call_outcome_at`** — timestamp of the latest call outcome; `add_lead_call_note` stamps it alongside `last_call_outcome`; backfilled from the latest outcome-bearing `lead_notes` row (990 of 1096 outcome-carrying leads have no such note → stay NULL → never pass the cadence freshness window) |
| 0113 (06-12) | **`tasks.overdue_at`** (+ partial index) — stamped exactly once by the overdue job; status CHECK deliberately NOT grown. `notifications.type` CHECK + `sla_breach_founder`, `task_overdue_manager`; `whatsapp_notification_logs.type` CHECK + `task_due_reminder`, `task_overdue_manager` |
| 0114 (06-12) | **CAD-02A seed** — the In Discussion 48h cadence row (`status` · `in_discussion` · 2880 biz-min · agent · auto_task · channels `{}` · `agent_shift`); idempotent `ON CONFLICT (code) DO NOTHING`. Engine treats every CAD-prefixed code as a cadence (task + re-arm) regardless of trigger_kind. **⚠️ NOT yet applied to prod** — apply = SQL + ledger row in one transaction |
| 0120 (06-14) | **`push_subscriptions` table** (Web Push / PWA push channel) — per-device VAPID endpoints; `endpoint` UNIQUE (one row per device, many per user); owner-only RLS (`profile_id = auth.uid()`, SELECT/INSERT/DELETE, no UPDATE); the cross-user read + 404/410 dead-endpoint prune in `dispatchPush` are service-role. The second delivery channel behind `createNotification` (fan-out lives inside the function — zero call-site edits); the in-app row stays source of truth. **⚠️ NOT yet applied to prod.** (Index gap 0115–0119 not yet backfilled here — full inventory in `supabase/migrations/CLAUDE.md`.) |

> **Migration ledger repaired (2026-06-12).** `supabase_migrations.schema_migrations` previously
> recorded only 0001–0064 (0065–0108 were applied out-of-band — the Phase 0 audit finding). Each
> of the 46 missing migrations had its primary schema effect catalog-verified live, then was
> recorded. 0109/0110 were applied **with** ledger rows. Local files == remote ledger, zero
> pending — `supabase db push` is safe again. Keep it that way: every future apply records its row.

> **`lead_health` is fully removed (0084).** No column, util, component, or filter remains —
> any reference found anywhere is stale. (Unrelated: *Domain Health* — `DomainOverviewPanel` /
> `getDomainHealthMetrics` — is a separate, live feature.)
