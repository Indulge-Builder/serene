# Migrations

> **Purpose:** migration conventions and the full ordered index of every schema migration.
> **Audience:** engineers. · **Source-of-truth scope:** conventions + history narrative. The migration *files* in `supabase/migrations/` are truth; the code-adjacent inventory in `supabase/migrations/CLAUDE.md` is updated in the same commit as each new migration — this index is the docs-side view and must be synced when migrations ship. If they ever disagree, the SQL files win.
> **Last verified:** 2026-06-20 against `supabase/migrations/` (139 migration files, 0001–0137;
> the sequence skips 0131 — it was superseded by 0132 before it was ever applied — and a couple of
> numbers are carried on date-stamped filenames, so the file count is not `maxNumber − 1`).

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
`task_groups_flat_visibility` 06-05), **0066** (`leads_city_column` 06-03 *and*
`domain_health_metrics` 06-04), and **0122** (`agent_today_pulse_notes` *and*
`deal_category_and_domain_type`, both 06-15 — distinguished by timestamp, indexed below as
0122a/0122b). Serial **0131 is intentionally skipped** — there is no `0131` file on disk; it was
superseded by 0132 before it was ever applied (see the 0132 row). Always trust the date prefix.

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
| 0115 (06-12) | **`get_dashboard_summary` agent snapshot counts** — `pending_calls_count` + `new_leads_count` added to the agent branch (live snapshots, ignore the date filter); signature unchanged |
| 0116 (06-12) | **Elaya foundation** — `elaya_conversations`, `elaya_messages` (append-only, `channel` column), `user_context`, `elaya_actions`, `llm_providers`, `elaya_settings`; RLS users read own / assistant·tool·config writes service-role; config SELECT admin/founder |
| 0117 (06-12) | `whatsapp_notification_logs.type` CHECK + `elaya_reply` |
| 0118 (06-13) | **Elaya Phase 2 (agentic writes)** — no schema change; partial index `idx_elaya_actions_pending` (`WHERE status='proposed'`) + lifecycle COMMENT. State-machine table (A-11 carve-out), not append-only |
| 0119 (06-14) | **`revival_candidates` + `revival_policies` tables** (Lead Revival R1) — per-lead revival ledger (`open→actioned/dismissed`) + per-status silence thresholds & daily cap (editable from `/settings`, admin-client read per run, `sla_policies` pattern); the daily sweep layers over leads, never mutates the lead row |
| 0120 (06-14) | **`push_subscriptions` table** (Web Push / PWA push channel) — per-device VAPID endpoints; `endpoint` UNIQUE (one row per device, many per user); owner-only RLS (`profile_id = auth.uid()`, SELECT/INSERT/DELETE, no UPDATE); the cross-user read + 404/410 dead-endpoint prune in `dispatchPush` are service-role. The second delivery channel behind `createNotification` (fan-out lives inside the function — zero call-site edits); the in-app row stays source of truth. **⚠️ NOT yet applied to prod.** |
| 0121 (06-15) | **`profiles.app_icon`** (PWA home-screen icon picker) — enum-validated text column (`CHECK app_icon IN ('icon-1'..'icon-4')`), `NOT NULL DEFAULT 'icon-1'`; the `profiles.theme` column pattern exactly. **No new RLS** (the 0001 `profiles_update` self-update policy already covers it; WITH CHECK only guards role/domain); not audited (cosmetic). The chosen PWA install icon; rides the existing `updateProfile` action. **⚠️ NOT yet applied to prod.** Regenerate `database.ts` after applying. |
| 0122a (06-15) | **`get_agent_today_pulse` v2 — `notes_today`** — adds the genuine since-IST-midnight count of notes the agent logged today to the today-pulse RPC (file `20260615000122_agent_today_pulse_notes`, serial 0122, earlier timestamp than the deal_category file below). |
| 0122b (06-15) | **`deals.deal_category` + domain-derived `deal_type`** — enforces the domain→type→category rule (decision-log 2026-06-15). Adds `deal_category text`; recreates `deals_deal_type_check` to admit `'sale'` (house/legacy); adds `deals_deal_category_check` (value whitelist) + `deals_retail_category_check` (`retail ⇒ category NOT NULL`, `non-retail ⇒ category NULL` — modelled on `deals_membership_duration_check`). DELETEs the one pre-rule `onboarding+retail` walk-in **before** the CHECKs (table must be rule-clean), backfills surviving retail rows to `'other'`. `deal_type` is derived server-side from `DOMAIN_DEAL_CONFIG`; the CHECKs are the backstop. **Applied to prod + verified.** (File: `20260615113534_deal_category_and_domain_type` — the migration header reads "Migration 0122".) |
| 0123 (06-15) | **`get_agent_first_touch_pairs` RPC** — raw `(lead, created_at, first_call_at)` pairs for one agent's cohort, feeding the first-touch-speed scorecard on the performance deck. Returns RAW pairs (not bucket counts) because the 5 speed buckets are measured in **business minutes** per the agent's shift, and that calendar/shift math lives only in TS (`lib/utils/sla.businessMinutesBetween` + `buildAgentShiftOverride`) — SQL only returns each lead's creation time + earliest qualifying call note; the service mapper buckets. `first_call_at = MIN(lead_notes.created_at WHERE call_outcome IS NOT NULL)`. Scope-param RPC: **EXECUTE REVOKED** from `authenticated`, admin-client-only (Q-13, the 0102 posture). |
| 0124 (06-16) | **Managers join the round-robin routing pool** — `handle_agent_routing_config()` now auto-creates an `agent_routing_config` row for role `manager` too (not just `agent`), and `get_next_round_robin_agent` assigns to `role IN ('agent','manager')`. Pool membership literal mirrors `ROUTING_POOL_ROLES` in `lib/constants/roles.ts` — keep in sync. Managers carry/call leads alongside agents; they now receive round-robin leads in the same fair queue when their pool toggle is on. |
| 0125 (06-16) | **`handle_new_user()` also persists `job_title` from invite metadata** — the on-signup trigger previously copied only `full_name`/`role`/`domain` from `raw_user_meta_data`, silently dropping `job_title` for every *invited* user (the password-mode `createUser` path set it via a follow-up update, so only invites were affected). Adds `job_title` to the INSERT; nullable, idempotent `CREATE OR REPLACE`, body otherwise byte-identical. |
| 0126 (06-16) | **Usage / active-time tracking** (adoption monitoring) — two tables, three jobs. `usage_heartbeats` (raw append-only tick log, A-11, no UPDATE/DELETE RLS, 30-day prune) + `usage_daily` (the rollup the dashboard reads via a SECURITY DEFINER RPC). Hot path is Redis-only (`presence:{userId}` every 60s, the request path never writes the DB); a snapshot Trigger.dev job (every 1 min) appends one row per active user; a rollup Trigger.dev job re-rolls today every 15 min + the prior IST day nightly into `usage_daily` (idempotent UPSERT). "Active" = tab visible AND interaction in the last ~2 min, gated client-side in `UsagePresence.tsx`. Powers `/admin/usage`. |
| 0127 (06-16) | **`lead_activities.actor_id` restored NULLABLE** (schema-drift fix) — migration 0003 declared `actor_id` nullable ("NULL = system/webhook action") but the live DB had drifted to `NOT NULL` (applied out-of-band, no migration). The drift was masked by a hand-loosened `database.ts` type until a fresh `gen types` surfaced it; `lead-ingestion.ts` inserts `actor_id: null` in five system/webhook paths that would each throw. Re-aligns schema with 0003's intent; FK + "NULL = system action" semantics unchanged. |
| 0128 (06-16) | **`get_silent_leads_for_revival` RPC** (Lead Revival — sweep scaling) — pushes the revival judge-once anti-join from Node into Postgres. Previously `findSilentLeadsForStatus` SELECTed every `revival_candidates.lead_id` into a JS Set and inflated the leads LIMIT by its size — both growing unbounded with the ledger. Now one bounded query returns up to `p_limit` silent leads in the trigger status with NO revival_candidate of any status (`NOT EXISTS`, served by `idx_revival_candidates_lead` from 0119). Semantics byte-identical to the prior Node logic. Scope-param sweep tool: **EXECUTE REVOKED**, GRANTed to `service_role` only (the daily Trigger.dev sweep, admin client). |
| 0129 (06-17) | **Manager Lead Pipeline shows the FULL domain roster** — the per-agent scorecard (`lead_status.byAgent`) was `GROUP BY assigned_to` over the date-filtered cohort, so a teammate with zero leads in the period vanished and the manager appeared only if personally assigned leads. In the MANAGER branch only, `agent_counts` now bases on a domain ROSTER CTE (`profiles WHERE domain = p_domain AND role IN ('agent','manager') AND is_active`) LEFT JOINed to per-(agent,status) cohort counts — every member present even at zero. Founder/admin cohort-only rollup left byte-identical. |
| 0130 (06-17) | **Fix `get_agent_recent_activity` aggregate (42803)** — the 0063 body applied `ORDER BY la.created_at DESC LIMIT 25` to the single-row `jsonb_agg(...)` aggregate query, which Postgres 17 rejects (column must appear in GROUP BY or an aggregate). Latent until the 2026-06-17 global-domain work added a server-side call in the dashboard `Promise.all` seed. Fix: select + order + LIMIT the rows in a CTE first, THEN `jsonb_agg` over the bounded set. Behaviour, signature, and GRANT/REVOKE posture (0102, admin-client-only) unchanged. |
| 0132 (06-17) | **`get_recent_lead_activity` — the "recent leads worked" rollup** — reframes the dashboard Recent Activity widget from an EVENT stream (one row per `lead_activities` insert) into a LEAD rollup: one card per lead, most-recently-worked first, showing current status + latest call outcome + latest note. Queries `leads` (already denormalises every field) `ORDER BY last_activity_at DESC` joined to the latest note — no aggregation/GROUP BY/dedup. `p_scope`: `'mine'` (leads assigned to the caller, any role) vs role-scoped. **Supersedes migration 0131** (`get_agent_recent_activity` enrich), which was never applied (Docker down when authored) and is documented as dead — **there is no 0131 file; numbering skips it.** |
| 0133 (06-17) | **Notification preferences** (per-user channel control) — `notification_preferences` table: every user starts/stops each notification CATEGORY on each CHANNEL (in-app, whatsapp) for themselves. **ABSENCE = ON** (sparse mute-rows): a row exists only once a user touches a checkbox; the gate (`notification-prefs-service.ts`) fails OPEN (missing/malformed/thrown → send). Re-checking both boxes DELETEs the row (back to implicit-on). Owner-only RLS (the 0120 `push_subscriptions` posture); cross-user fan-out read runs on the admin client. Transactional types (`lead_initiation`/`elaya_reply`) have no key and are never silenceable. |
| 0134 (06-17) | **Suggestion box / bug-report channel** — `suggestions` table (message + up to 4 screenshots). Any staff member submits; admin/founder triage in `/admin/suggestions` (open → resolved). NOT append-only — a status lifecycle, so exactly ONE narrow admin/founder UPDATE policy (the `revival_candidates` carve-out); the "only status/resolved_by/resolved_at writable" restriction is enforced in the action/service layer (`resolveSuggestion`). No DELETE policy ever. `image_paths` holds storage PATHS in the private `suggestions` bucket (0135), never URLs; CHECK mirrors `MAX_SUGGESTION_IMAGES` (4). |
| 0135 (06-17) | **Suggestions screenshot bucket (PRIVATE)** — holds screenshots for 0134. Unlike `avatars`/`ad-creatives` (public), this bucket has NO public-read policy; admin viewing mints short-lived signed URLs server-side (`createSignedUrl` in `suggestions-service`). Object path `${sender_id}/${draftId}/${i}-${filename}` — the first segment is the uploader's uid; the insert policy + the action both pin writes to the caller's own prefix (defence in depth). |
| 0136 (06-17) | **`notifications.type` — add `'suggestion_resolved'`** — when admin/founder resolves a suggestion, the original sender gets an in-app notification (`resolveSuggestionAction` → `createNotification`). Like `lead_initiation`/`elaya_reply` it is transactional: NO `notification_preferences` key, never silenceable. DROP + re-ADD the full CHECK value list (0113) verbatim plus the new value. |
| 0137 (06-17) | **Lead phone canonical key + active-phone uniqueness** (audit 2026-06-17) — `lead_phone_key(text)` IMMUTABLE canonical-phone function (digits-only collapse, mirrors `canonicalizePhone()` + `generate_lead_slug`'s regex) + a partial UNIQUE index `idx_leads_phone_key_active` on `lead_phone_key(phone)` for ACTIVE leads only (`archived_at IS NULL`, non-empty phone, status `new/touched/in_discussion/nurturing` — matches `get_active_lead_by_phone`). The structural backstop for the dedup TOCTOU race: two concurrent submissions for one new number can no longer both create active leads — the loser gets `23505`, caught and resolved to the existing lead. Detects pre-existing active-phone collisions and degrades to a non-unique index with `RAISE WARNING` rather than hard-failing. **⚠️ Verify the warning did not fire on apply; if it did, re-create the index UNIQUE after cleanup.** |

> **Migration ledger repaired (2026-06-12).** `supabase_migrations.schema_migrations` previously
> recorded only 0001–0064 (0065–0108 were applied out-of-band — the Phase 0 audit finding). Each
> of the 46 missing migrations had its primary schema effect catalog-verified live, then was
> recorded. 0109/0110 were applied **with** ledger rows. Local files == remote ledger, zero
> pending — `supabase db push` is safe again. Keep it that way: every future apply records its row.

> **`lead_health` is fully removed (0084).** No column, util, component, or filter remains —
> any reference found anywhere is stale. (Unrelated: *Domain Health* — `DomainOverviewPanel` /
> `getDomainHealthMetrics` — is a separate, live feature.)
