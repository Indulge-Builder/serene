# Migrations

> **Purpose:** how a schema change is written, numbered, rehearsed and shipped, and the full ordered index of every migration.
> **Audience:** engineers.
> **Source-of-truth scope:** conventions and the history narrative. The SQL files in `supabase/migrations/` are the truth, and each file's header comment carries the full reasoning. `supabase/migrations/CLAUDE.md` is the code-side inventory, updated in the same commit as each migration. If they ever disagree, the SQL files win. What each table is for: `database.md`.
> **Last verified:** 2026-09-26 against every file in `supabase/migrations/` (0000 to 0245; the headers and created objects of 0157 to 0244 read in full), the changelog's apply notes, and production's applied list (`supabase migration list --linked`, run by the docs lead on 2026-09-26).

---

## Conventions (non-negotiable)

From `supabase/migrations/CLAUDE.md` and `../rules/The_Rules.md`, plus what the last three months
taught:

- **Never edit a migration that has run in production (A-14).** Write a new one, even for a
  typo. 0203 exists because a signature change was written into 0199 after 0199 had run: the file
  and the database disagreed, and the "Wake now" button failed with PGRST202.
- **Every new table enables RLS in the same migration (A-08).** Partitions too: Postgres does not
  pass RLS from a partitioned parent to its children (0170). New `wag_` month partitions go through
  `sia.wag_add_month_partition()`, which turns RLS on.
- **Log, activity and ledger tables get no UPDATE or DELETE policy, ever (A-11).** The named
  exceptions (delivery receipts, remark suppression, `elaya_actions`, `revival_candidates`,
  `suggestions`, the vendor engagement close) are resolve-once admin-client updates, listed in The
  Rules.
- **Reuse `update_updated_at()`** (0001). Never recreate it.
- **Every SECURITY DEFINER function pins its `search_path` (A-10).** Routines in `public` run on
  `public, gia, member` since 0210/0211; `sia` routines use a `sia`-first path; a function that
  names every table with its schema uses `pg_catalog, pg_temp` (0238, 0241).
- **Scope (Q-13).** A read RPC either derives its scope itself (`auth.uid()`, `get_user_role()`,
  `get_user_domain()`) and keeps the `authenticated` grant, or takes scope parameters and has
  EXECUTE revoked from `PUBLIC, anon, authenticated` in the same file, becoming admin-client only.
  New functions in `sia`, `member` and `freshdesk` default to service role only.
- **Several writes that must land together go into one RPC** (the 0030/0031 pattern; since then
  `sia.create_ticket` / `sia.apply_ticket_change`, `merge_vendors`, `remove_vendor`). Access
  control stays in the action, never inside the RPC.
- **Compare enums to enums.** `leads.domain` has been `app_domain` since 0041. 0180's first push
  failed with 42883 because a copied policy compared it to `get_user_domain()::text`.
- **Idempotency guards** (`IF EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`,
  `DROP CONSTRAINT IF EXISTS` before `ADD`) on anything that may meet divergent production state.
- **A CHECK that mirrors a TypeScript vocabulary is restated in full** (DROP, then ADD with every
  value), so nothing is narrowed by accident (0162). Give it a stable name: 0244 had to find the
  auto-named `sia_role` CHECK by its text.
- **Changing a function's arguments or return shape needs DROP, then CREATE,** and the old overload
  must go, or PostgREST refuses the call as ambiguous (0203, 0216, 0218).
- **PostgREST returns at most 1,000 rows per response, RPC results included,** and says nothing.
  Return a vocabulary as one array row, `ORDER BY` a stable key so the caller can page, or count in
  SQL (0192, 0238).
- **Exposing a schema on the API restates the whole list.** `ALTER ROLE authenticator SET
  pgrst.db_schemas = '…'` replaces the value; today it must include `public, graphql_public, sia,
  freshdesk, gia, member` (plus `hands` once 0245 is applied). Follow it with `NOTIFY pgrst, 'reload config'` and `'reload schema'`.
- **New data for Elaya's analyst is a new `elaya_read` view** with an explicit column list and a
  COMMENT: never `select *`, never a phone, email, password or WhatsApp jid.

## How a migration ships

1. **Pick the number last.** Check the highest file on `main` and the highest applied on
   production (`supabase migration list`) right before committing. Other sessions and PR branches
   write migrations in parallel (see "Numbering and file names").
2. **Write the header comment:** why, what, and what it was checked against.
3. **Rehearse off production.** What has been used:
   - `supabase db reset` on the local stack, rebuilding from every file (0186, 0192, the vendor
     PRs);
   - a throwaway Postgres 17 built to the before-state (0243, 0244);
   - a container copy of the live schema, including the rollback (0211);
   - for a schema move, Postgres **plus PostgREST** against the copy, because the embed break lives
     in PostgREST, not in the database (0212);
   - for security-sensitive SQL, the whole migration run inside a transaction on production and
     rolled back (0223: six real questions answered, fourteen attacks refused).
4. **Push with the Supabase CLI:** `supabase db push --dry-run`, read it, then `supabase db push`.
   A push applies **every** pending file, including ones another session left uncommitted in the
   shared folder, so the dry run matters. Use `--include-all` when a pending file sorts before the
   newest applied one (it was needed for 0000 on 2026-09-11).
5. **Verify against the catalog, read-only:** the constraint, the policy, `pg_get_functiondef`,
   a real call. An exit code is not proof.
6. **Regenerate `src/lib/types/database.ts`** (`supabase gen types typescript --linked` across
   `public, gia, member, sia, freshdesk`), keeping the hand-written tail below the generated block.
7. **Record it** in the same change: a `docs/changelog.md` entry, a row in
   `supabase/migrations/CLAUDE.md`, a row in the index below.

**Deploy order.** When code and SQL depend on each other, say in the changelog which goes first.
Additive SQL goes first. A REVOKE or a rename goes with or after the code that stops using the old
shape (0102). A change the app tolerates either way can go in any order (0242).

### Schema moves (the 2026-09-17 lesson)

Moving tables between schemas (0172, 0210, 0211) is a catalog relabel: rows, indexes, policies,
triggers and foreign keys move for free and nothing is copied. What breaks is everything that
*names* the tables:

- **The migration and its build are one release.** On 2026-09-17 both halves were pushed before
  their code was live (gia at 13:41 IST with the build at 13:43; member at about 15:55 with the
  code at 16:04). Each time, the running app asked for tables that had just moved; the Sia surfaces
  were down for about ten minutes. Push only when the build that follows is ready to promote.
- **Every reader follows, not only Vercel.** The Trigger.dev tasks need their own deploy, and the
  Python brain on Fargate has its own PostgREST client (`backend/app/core/supa.py`, which now routes
  moved tables through `_MOVED_TABLES`). After 0210 it kept asking for `public.leads` for about two
  and a half hours.
- **Rehearse the app's reads, not only the database.** The 0210 rehearsal proved rows, policies and
  routines intact and missed that cross-schema embeds return PGRST200. That emptied the leads pages
  (fixed by 0212/0213) and, two days later, was found to have broken every task status change
  (fixed in code with `gia-task-links.ts`).
- **Count rows before and after** with `scripts/db/row-counts.ts`. It reads the table list from
  `database.ts`, so take the "before" run with `--profile <schema>=public` once the types already
  name the new schema.

Full runbook and what happened: `schema-restructure-plan.md`.

## Numbering and file names

A file is named `YYYYMMDD` + a six-digit serial + `_snake_case_name.sql`, for example
`20260926000244_joker_head.sql`. The 14-digit prefix is the **version**: the CLI orders migrations
by it and records it in `supabase_migrations.schema_migrations`. Two consequences:

- **A reused version is silently skipped.** If a file carries a version production has already
  recorded, `db push` treats it as applied: no error, no table. Every PR branch that adds a
  migration must renumber onto the current `main` before merge.
- **A file dated before the newest applied version is refused** unless pushed with `--include-all`.

**Repeated serials.** Six serials appear twice with different dates, so they are different versions
and both files apply, in date order. The index marks them a/b.

| Serial | Files (in apply order) |
| --- | --- |
| 0058 | `20260601000058_ad_creatives_multi_video`, `20260605000058_task_groups_flat_visibility` |
| 0066 | `20260603000066_leads_city_column`, `20260604000066_domain_health_metrics` |
| 0122 | `20260615000122_agent_today_pulse_notes`, `20260615113534_deal_category_and_domain_type` (the only file whose prefix ends in a clock time instead of a serial; its header calls itself 0122) |
| 0141 | `20260623000141_whatsapp_media_bucket`, `20260624000141_backfill_campaign_account_segment` |
| 0161 | `20260710000161_business_minutes_response_time`, `20260807000161_status_counts_agent_domain` (the second sorts after 0162) |
| 0202 | `20260916000202_rename_b2b_to_business`, `20260917000202_members_rename` (the second sorts after 0203) |

**Gaps.** 0131 was superseded by 0132 before it ever ran, and the file was deleted. 0205 to 0209
were skipped on purpose: 0210 was numbered to stay clear of the 020x files another session was
writing that week.

**Renumbering history.** Every case had the same cause: a branch numbered from an older `main`.

| When | From → to | Why |
| --- | --- | --- |
| 2026-08-21 | subscriptions 0154-0157 → 0163-0166 (0167, 0168 added later) | collided with the applied theme migrations and sorted before production's newest |
| 2026-09-05 | vendors 0179 / 0180 → 0183 / 0184 | 0179 and 0180 were already applied (brain switch, product enquiries); the CLI would have skipped the vendor files |
| 2026-09-11 | vendors re-dated as 0183-0191 (0191 new) | `main` took 0182 on 09-10 while the branch files were dated 09-05 to 09-08 |
| 2026-09-18 | vendor live extractor 0205 → 0213 → 0214 | production was past 0212; then `main` landed its own 0213 |
| 2026-09-21 | vendor cleanup 0223-0226 → 0227-0230 | `main` had applied 0223-0225 and held 0226 (the MCP ledger) |

**Next free number:** 0248 (0247 is `20260928000247_elaya_voice_channel.sql`).

## Production status

- **0000 to 0244: all applied.** Checked with `supabase migration list --linked` on 2026-09-26.
  The "not yet applied" notes in older rows below (and in the 0242 to 0244 changelog entries,
  written before their push) were true when written and are kept only as history. The ledger has
  been reconciled several times along the way: 2026-06-12 for 0065 to 0108 (applied out of band),
  2026-07-06 for 0138 to 0153 (applied through the Supabase MCP), and late August for 0161 and 0169
  to 0176.
- **0245 (`hands`): applied to production 2026-09-28 (`supabase db push`).** It creates the `hands` schema for Elaya's second
  WhatsApp number (see `hands-plan.md`). As first committed (a11f297) it set `pgrst.db_schemas` to a
  list without `gia` and `member`, which would have emptied the leads, deals and members pages the
  moment it was pushed. It was caught in the 2026-09-26 docs review and fixed before any push
  (9f486fc): the file now restates the full list plus `hands`. The lesson is the rule above: a
  schema exposure restates the whole list.
- **0246 (`media_readings`): applied to production 2026-09-28 (`supabase db push`); the reader's switches are OFF.** Elaya's
  eyes, steps 0 to 2; see `media-understanding-plan.md`. Its switch is off.

## Repair migrations (drift fixed by a later file: the pattern to copy)

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
| 0127 | 0003 | live `lead_activities.actor_id` had drifted to NOT NULL; system inserts would have failed |
| 0147 | 0046 | the slug strip ran before `lower()` and dropped every capital letter |
| 0162 | 0016 / 0113 / 0136 | `notifications.type` CHECK had fallen behind the TypeScript union; inserts of the missing types failed silently |
| 0192 | 0187 / 0188 | vocabularies and candidate sets cut at PostgREST's 1,000-row response cap |
| 0198 | 0197 | `flag_threads_for_media` walked every ticket and hit the statement timeout |
| 0203 | 0199 | a signature change written into 0199 after it ran; production kept the old function |
| 0212, 0213 | 0210 / 0211 | cross-schema embeds returned PGRST200; `profiles` views restored them, then narrowed to `id, full_name` |
| 0216, 0220 | 0215, 0218 | the profiler's due-groups read timed out, then starved groups never started |
| 0222 | 0173 | `wag_group_activity()` scanned every message, timed out, and the rail showed zero messages everywhere |
| 0228, 0229 | 0190 | the vendor history search timed out on common words, and the category chip filtered out the vendor who had done the job |
| 0230 | 0227 | Remove always hid; a row with nothing attached is now really deleted |
| 0243 | 0095 | `profiles_update` never pinned `sia_role` / `queendom_id`, so a concierge account could move itself into another queendom |

## Index

> Compact one-liners; the full reasoning is in each file's header comment. Rows 0000 to 0156 were
> written as each migration shipped and keep their original status notes (see "Production
> status"). From 0157 on, rows are in apply order (by version), one line each.

| # (date) | What it creates / changes |
| -------- | ------------------------- |
| 0000 (05-26) | **The two base enums `user_role` and `app_domain`.** 0001 has always USED both on its first `CREATE TABLE`, but no migration ever created them: on production they were made out-of-band (the same drift this file's ledger note records for 0065-0108), so production has been correct all along and this file changes nothing there. What was broken is building the schema FROM SCRATCH - a local `supabase db reset` died on `type "user_role" does not exist`. A-14 forbids editing 0001, and types must exist before it runs, so the fix is a file that sorts ahead of it. Every statement is idempotent (`duplicate_object` swallowed); labels and their ORDER are copied verbatim from the live database via `database.ts`. **Applied to prod 2026-09-11 (`supabase db push --include-all`).** |
| 0001 (05-26) | `profiles`; `profile_audit_log`; `get_user_role()`/`get_user_domain()`; `on_auth_user_created`; `update_updated_at()` |
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
| 0114 (06-12) | **CAD-02A seed** — the In Discussion 48h cadence row (`status` · `in_discussion` · 2880 biz-min · agent · auto_task · channels `{}` · `agent_shift`); idempotent `ON CONFLICT (code) DO NOTHING`. Engine treats every CAD-prefixed code as a cadence (task + re-arm) regardless of trigger_kind. Not applied when written; applied since (see Production status). |
| 0115 (06-12) | **`get_dashboard_summary` agent snapshot counts** — `pending_calls_count` + `new_leads_count` added to the agent branch (live snapshots, ignore the date filter); signature unchanged |
| 0116 (06-12) | **Elaya foundation** — `elaya_conversations`, `elaya_messages` (append-only, `channel` column), `user_context`, `elaya_actions`, `llm_providers`, `elaya_settings`; RLS users read own / assistant·tool·config writes service-role; config SELECT admin/founder |
| 0117 (06-12) | `whatsapp_notification_logs.type` CHECK + `elaya_reply` |
| 0118 (06-13) | **Elaya Phase 2 (agentic writes)** — no schema change; partial index `idx_elaya_actions_pending` (`WHERE status='proposed'`) + lifecycle COMMENT. State-machine table (A-11 carve-out), not append-only |
| 0119 (06-14) | **`revival_candidates` + `revival_policies` tables** (Lead Revival R1) — per-lead revival ledger (`open→actioned/dismissed`) + per-status silence thresholds & daily cap (editable from `/settings`, admin-client read per run, `sla_policies` pattern); the daily sweep layers over leads, never mutates the lead row |
| 0120 (06-14) | **`push_subscriptions` table** (Web Push / PWA push channel) — per-device VAPID endpoints; `endpoint` UNIQUE (one row per device, many per user); owner-only RLS (`profile_id = auth.uid()`, SELECT/INSERT/DELETE, no UPDATE); the cross-user read + 404/410 dead-endpoint prune in `dispatchPush` are service-role. The second delivery channel behind `createNotification` (fan-out lives inside the function — zero call-site edits); the in-app row stays source of truth. Not applied when written; applied since (see Production status). |
| 0121 (06-15) | **`profiles.app_icon`** (PWA home-screen icon picker) — enum-validated text column (`CHECK app_icon IN ('icon-1'..'icon-4')`), `NOT NULL DEFAULT 'icon-1'`; the `profiles.theme` column pattern exactly. **No new RLS** (the 0001 `profiles_update` self-update policy already covers it; WITH CHECK only guards role/domain); not audited (cosmetic). The chosen PWA install icon; rides the existing `updateProfile` action. Not applied when written; applied since (see Production status). |
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
| 0138 (06-17) | **Collapse `gia_followup` category; model the lead-link by the meta table.** `tasks.task_category` drops to two STRUCTURAL values (`personal` \| `group_subtask`); a lead follow-up is now a `personal` task that HAS a `task_gia_meta` row. `tasks.module` converted from free text to a native enum `task_module` (`gia` \| `sia` \| `core`). **Single-writer invariant (load-bearing):** `create_lead_gia_task` is the ONLY writer of both a `task_gia_meta` row AND `module='gia'`, always together; every other insert is `module='core'` + no meta row — so `EXISTS(task_gia_meta)` / `module='gia'` is a permanent substitute for the retired category check. §0 cleans up the 60 known prod orphans first, §1 hard-fails on any remaining ACTIVE orphan. |
| 0139 (06-20) | **`ad_account_recharges` table** — finance ledger of money sent to each Meta ad account, kept SEPARATE from `ad_spend_daily` (spend is derived from campaign keys via `resolveAccountFromCampaign`; account is never stored on spend). Mirrors `ad_spend_daily` (0104): admin/founder write + DELETE permitted (an editable finance figure, NOT append-only), manager+ read, two-layer RLS, shared `update_updated_at`. `ad_account` CHECK mirrors `AD_ACCOUNT_KEY_VALUES`; `method` is a free-text label, card-PAN-rejected by a CHECK backstop. Powers the `/budget` Accounts tab (recharged − spent = balance). |
| 0140 (06-23) | **DRY the going-cold cutoff** — `public.cold_lead_cutoff()` STABLE function (`now() - interval '5 days'`) becomes THE single SQL source of the cold window (mirrors `COLD_LEAD_THRESHOLD_DAYS`; change both together). `get_dashboard_summary` recreated from the LIVE (drifted-ahead) body with the ONLY change being the cold predicate → `cold_lead_cutoff()` (reconciles file ⇆ DB). NULL `last_activity_at` still excluded (that's SLA-01A's job). |
| 0141a (06-23) | **WhatsApp media bucket (PRIVATE)** — holds inbound (later outbound) WhatsApp media. Gupshup's media URL is time-limited, so ingestion downloads the bytes and re-uploads here, storing the STORAGE PATH (never a URL) in `whatsapp_messages.media_url`; reads mint signed URLs. PRIVATE like `suggestions` (0135) — no public read; object path `${leadId}/${messageId}.${ext}`. Writes + reads run on the admin client (the inbound webhook is sessionless), + one defence-in-depth admin/founder SELECT policy. |
| 0141b (06-24) | **Backfill `leads.utm_campaign` to the account-bearing naming convention** — campaign keys gain a third segment carrying the Meta ad account (`TG_<Domain>_<Account>_<Type>_<Date>`) so `/budget` can attribute spend via `resolveAccountFromCampaign` (index-2 segment). Rewrites EXISTING leads (active + archived) to the new names (Meta campaigns were renamed in place), incl. intentional merges; non-Meta traffic deliberately left without a segment → "Unattributed". Isolated UPDATE (no FK/generated-col/slug dependency); not idempotent by design (keys off the OLD name); asserts zero old names survive. |
| 0142 (06-24) | **Three new `whatsapp_notification_logs.type` values** for the lead-agnostic task reminders: `task_due_soon` (TASK-01A 30-min-before agent ping, every still-open task), `task_overdue_agent` (TASK-01A at-deadline agent ping), `task_overdue_manager_generic` (TASK-01B escalation for a NON-lead task to the assignee's manager; the lead path keeps the existing lead-shaped `task_overdue_manager`). LOG types only — no `notification_preferences` CHANGE (the agent pings ride `task_due`, the generic manager escalation rides `task_overdue_manager`). |
| 0143 (06-24) | **`get_dashboard_summary` — going-cold honours the domain selector** — the cold-leads predicate scoped admin/founder as org-wide (`p_role IN ('admin','founder') THEN true`), ignoring `p_initial_domain` while `lead_status` + `campaigns` already honoured it. Recreated from the live 0140 body changing ONLY the cold predicate to the same scoping CASE the other two CTEs use (manager → own domain, admin/founder → picked domain or all). Cutoff stays `cold_lead_cutoff()`; date filter still not applied (going-cold is live state). |
| 0144 (06-24) | **Oversight — `task_events` stream + 3 read RPCs** (the `/oversight` surface). `task_events` append-only table (`task_event_type` enum: `created`/`status_changed`/`reassigned`/`remark_added`/`overdue`; `domain app_domain NOT NULL`, `actor_id`/`subject_id`→profiles, `task_title` snapshot, `meta jsonb`; FK→`tasks` CASCADE; indexes `(domain, created_at DESC)` + `(subject_id, created_at DESC)`; **manager+ SELECT, NO INSERT/UPDATE/DELETE policy ever** (A-11); Realtime ENABLED) — written ONLY by the task-mutation cores + the overdue job via the admin client. Three SECURITY DEFINER scope-param RPCs (EXECUTE REVOKEd from `PUBLIC/anon/authenticated` → admin-client only, Q-13): `get_team_task_overview` (Tier 1 — per-rostered-domain task tallies + agent count), `get_team_agent_breakdown` (Tier 2 — per-agent tallies in a team), `get_agent_tasks_oversight` (Tier 3 — an agent's task rows + lead identity via `task_gia_meta` LEFT JOIN). All three derive task→domain via `COALESCE(task_groups.domain, assignee.profiles.domain)` (no `tasks.domain` column) and **force-clamp a manager to their own domain in SQL** (the manager tasks RLS is role-only — RLS can't isolate teams). **Applied to prod via MCP + verified 2026-06-24** (interim `lib/types/oversight.ts` hand-types + `as any` casts until `database.ts` regen). |
| 0145 (06-25) | **`get_personal_tasks` returns linked-lead identity** — widened from `RETURNS SETOF tasks` to the full `tasks` row PLUS four nullable lead-identity columns (`lead_id`/`lead_first_name`/`lead_last_name`/`lead_slug`) via a LEFT JOIN through `task_gia_meta`→`leads`, so My Tasks can show WHICH lead a "Call"/"WhatsApp message" follow-up belongs to. The 0138 single-writer invariant guarantees ≤1 meta row per task (join never fans). WHERE/cursor/ORDER BY/params byte-identical to the live 0026 body — only the SELECT list + return type change (a DROP, not CREATE OR REPLACE). Self-scoped → keeps `GRANT … authenticated`. **Applied to prod + verified.** |
| 0146 (06-25) | **`get_agent_performance_trend` RPC** — real daily IST trend (`[{ day, leads_won, calls, notes }]`, zero-filled, oldest first) feeding the redesigned agent `/performance` self-scorecard (replaces the fabricated `makeSpark` sparklines + the fixed 14-day call chart). Self-scoped (agent = `auth.uid()`, no scope params) → keeps the client `authenticated` GRANT (the 0108 pattern, NOT the Q-13 revoked tier). Additive. Not applied when written; applied since (see Production status). |
| 0147 (06-25) | **Fix the lead-slug uppercase strip** (severe latent bug) — `generate_lead_slug` (0046) ran the `[^a-z0-9\-]` char-class strip BEFORE `lower()`, deleting every capital (`Akhil Deekshith → khil-eekshith`); **4,705 of 5,219 active slugs (90%) were missing their first letter**. Moves `lower()` inside before the strip, then regenerates ALL slugs (NULL-all-first so the collision loop never trips on a stale value; oldest-first so the earliest holder keeps the clean slug). Masked until now only because the dossier route falls back to UUID and search uses `search_text`. **Applied to prod + verified** (corrupted count → 0; 91 residual are legitimately unsupported source data — Devanagari/junk names — that fall back to a phone-suffix slug by design). |
| 0148 (06-25) | **Elaya WhatsApp idempotency — structural dedup index** (audit M7) — a partial UNIQUE index on `elaya_messages ((meta->>'wa_message_id')) WHERE channel='whatsapp' AND role='user' AND wa_message_id present`. The `hasProcessedWaMessage` SELECT + insert weren't atomic and the marker is written only after profile lookup + (for voice) a multi-second transcription, so two BSP redeliveries could both run a full brain turn + reply. A raced second insert now fails `23505`, which `insertUserMessage` maps to "already processed" — exactly one turn per message. In-app + assistant rows are untouched (not in the index); `elaya_messages` stays append-only (an index, not a policy). **Applied to prod + verified** (no existing dupes). |
| 0149 (06-25) | **Elaya sessionless RPC twins — channel parity (Jarvis Phase 1)** — explicit-param admin twins of the three self-scoped reads that derive scope from `auth.uid()`/`get_user_*()` inside SQL (so returned empty in the sessionless WhatsApp webhook): `get_group_task_summaries_for_user(p_user_id)`, `get_agent_today_pulse_for_user(p_agent)`, `get_agent_roster_performance_for_elaya(p_domain)`. Each is a byte-faithful copy with the `auth.uid()`/`get_user_*()` reads replaced by params. Q-13 revoked tier — EXECUTE revoked from `PUBLIC/anon/authenticated`, GRANTed `service_role` only (the Elaya data layer's admin client + principal-derived args are the trust boundary). The ORIGINAL self-scoped functions are untouched (in-app UI pages still call them). **Applied to prod + verified.** |
| 0150 (06-26) | **`elaya_training_assets` + public `elaya-training` storage bucket** (customer welcome-blast Block 2). Elaya's curated customer-facing material library (brochures, work examples, testimonials, reviews, podcasts, images, videos, docs, facts, links). Columns: `kind` (CHECK = the 10 `TRAINING_ASSET_KINDS` in `lib/constants/elaya-training.ts`), `title`, `description` (the `'fact'` kind stores its brief here), `url` / `storage_path` (at most one source; both nullable), `tags text[]`, `domain app_domain` (NULL = all domains), `send_order`, `active`. EDITABLE content, NOT A-11: `update_updated_at()` trigger + UPDATE/DELETE policies (the `ad_creatives` 0012 posture). RLS: all-authenticated SELECT; manager/admin/founder writes. Bucket is PUBLIC (Gupshup fetches sent media with no signing) + 4 `storage.objects` policies (public read, manager+ writes). **Applied to prod via MCP + verified.** |
| 0151 (06-26) | **Customer welcome-blast plumbing** (Blocks 3–4). (1) `leads.welcomed_at timestamptz`: the one-blast-per-lead idempotency stamp; NULL = never welcomed; set once under an `UPDATE … WHERE welcomed_at IS NULL RETURNING` guard (the `overdue_at` exactly-once pattern) so the welcome fires exactly once per lead. A layer over leads, NOT a lifecycle column. (2) `whatsapp_notification_logs.type` CHECK widened (DROP + re-ADD, re-listing all 10 existing values) with `customer_welcome` (the approved Gupshup welcome template, the first cold-number touch) + `customer_reply` (a free-form session reply Elaya sends a customer inside the 24h window). **Applied to prod via MCP + verified.** |
| 0152 (06-26) | **`elaya_notes`** (Jarvis Feature 3). Per-user free-form notes Elaya reads as CONTEXT, never permission. Columns: `user_id` FK (CASCADE), `title`, `body`, timestamps; `idx_elaya_notes_user (user_id, updated_at DESC)`. EDITABLE personal content, NOT A-11 (`update_updated_at()` trigger + UPDATE/DELETE policies). **Owner-only RLS** (the `push_subscriptions` 0120 posture): SELECT/INSERT/UPDATE/DELETE all gated `user_id = (SELECT auth.uid())`, InitPlan-hoisted. The Elaya turn read runs service-role scoped by `principal.userId` in code (channel parity: `auth.uid()` is NULL on the sessionless WhatsApp webhook). Backs the `/notes` page. **Applied to prod via MCP + verified.** |
| 0153 (06-26) | **`whatsapp_notification_logs.type` CHECK widened with `task_assigned`**, the log type for the "a task was assigned to you" WhatsApp template (`sendTaskAssignedNotification`; fires to the assignee on a personal-task-to-another or a group subtask). Gated by the EXISTING `task_assigned` control-plane key (0133): a new LOG type, not a new gate category. Mirrors the 0142/0117/0151 widenings (DROP + re-ADD, re-listing all 12 existing values). **Applied to prod via MCP + verified.** |
| 0154 (07-02) | **`profiles.theme` CHECK extended with `'coffee'`** — the sixth theme (coffee bronze accent `#8a7650`, cream paper `#ece7d1`, sage sidebar `#8e977d`). Drops and re-adds the autonamed `profiles_theme_check` (0001) so the SQL mirror of `THEME_KEYS` (`src/lib/constants/themes.ts`) stays in sync — the 0121 app-icon precedent. No RLS change (theme is a cosmetic self-update field). **Applied to prod (remote ledger verified 2026-07-03).** |
| 0155 (07-02) | **`profiles.theme` CHECK extended with the pastel trio `'macha'`/`'martini'`/`'candy'`** (themes 07–09 — matcha green `#84b179`, periwinkle `#9fa1ff`, candy pink `#f9b2d7`; all three accents carry dark-ink `--theme-accent-fg`, the Earth precedent). Same drop-and-re-add of `profiles_theme_check` as 0154; the CHECK re-lists all nine keys — the SQL mirror of `THEME_KEYS`. Palettes in `design-tokens.css` + `DESIGN-DNA.md`. No RLS change. **Applied to prod (remote ledger verified 2026-07-03).** |
| 0156 (07-02) | **`profiles.theme` — retire `'cosmos'`/`'coffee'`/`'macha'`** (same-day roster trim; final vocabulary `earth`/`air`/`water`/`fire`/`martini`/`candy`). **Order load-bearing:** UPDATEs any profile on a retired theme to `'earth'` BEFORE the drop-and-re-add of the narrowed `profiles_theme_check` (live `cosmos` rows exist — the theme shipped in Phase 5). 0154/0155 kept on disk unedited (A-14); the 0154→0155→0156 sequence net-applies cleanly. App side: a retired value fails `isThemeKey()` → `DEFAULT_THEME` fallback. **Applied to prod (remote ledger verified 2026-07-03).** |
| 0157 (07-03) | `profiles.theme` retires `martini` (its rows move to `lilac`) and admits `rose`, `moss`, `lilac`: the final eight themes. |
| 0158 (07-03) | `profiles.appearance` (`light` / `dark` / `system`), the light and dark mode preference, mirrored in the `serene-appearance` cookie. |
| 0159 (07-06) | `activity_events`: the append-only, domain-stamped activity stream behind the mobile Activity room (Realtime on, 30 days backfilled). |
| 0160 (07-06) | `get_domain_task_summary(p_domain, p_from, p_to)`: per-assignee task counts for the mobile Tasks room (revoked tier). |
| 0161a (07-10) | `business_minutes_between()`, and response time counted in business minutes (09:00 to 19:00 IST, Monday to Saturday) in the four performance and campaign RPCs. |
| 0162 (07-10) | `notifications.type` CHECK restated to match the whole `NotificationType` union (inserts of the missing types were failing silently). |
| 0161b (08-07) | `get_leads_status_counts` v4: an agent's `p_domain` narrows their own rows, so the status pills match the table. |
| 0163 (08-21) | `subscriptions` (the Finance and Tech bills tracker) and the private `subscription-invoices` bucket; SELECT for admin, founder and the finance / tech domains. |
| 0164 (08-21) | `subscription_payments`: append-only payment history (the INR amount is entered by hand, never converted). |
| 0165 (08-21) | `subscription_topups`: append-only top-ups of prepaid accounts. |
| 0166 (08-21) | `subscriptions.password` encrypted at rest (pgcrypto, key in Vault); decrypting is service role only. |
| 0167 (08-21) | `subscription_password_reveals`: append-only audit, written before any plaintext is returned. |
| 0168 (08-21) | `subscription_tools` (one tool, many accounts; `name_key` UNIQUE) and `subscriptions.tool_id`. |
| 0169 (08-27) | The Sia WhatsApp group archive: `wag_raw_events` and `wag_messages` (both partitioned by month), `wag_groups`, `wag_contacts`, `wag_group_members`, `wag_media`, `wag_reactions`, `wag_receipts`, `wag_pipeline_cursors`. RLS on, no user policies. |
| 0170 (08-27) | RLS on every `wag_` partition, and `wag_add_month_partition()` so a new month never lands without it. |
| 0171 (08-27) | `wag_group_activity()`: message count and last activity per group in one pass (service role only). |
| 0172 (08-27) | Moves the whole `wag_` family into a new `sia` schema (service role only) and adds `sia` to the API. |
| 0173 (08-27) | `sia.wag_group_activity()` gains the last-message preview for the `/sia` rail. |
| 0174 (08-27) | `sia.wag_auth_state` (the watcher's Baileys session in Postgres; live key material) and the `expired` media status. |
| 0175 (08-27) | `sia.wag_watcher_status`: the watcher's one-row heartbeat. |
| 0176 (08-28) | `llm_providers` gains the `heavy` tier (seeded `claude-opus-5`); the brain falls back to `reasoning` when the row is off. |
| 0177 (08-29) | Re-pairing from the browser: `qr`, `qr_at`, `restart_requested_at` on the watcher status row; `whatsapp_notification_logs.type` gains `sia_alert`. |
| 0178 (08-29) | `sia.wag_media.wa_timestamp` and an index, so the media backfill recovers the newest messages first. |
| 0179 (08-31) | Settings rows `brain_whatsapp` / `brain_in_app` (`node` or `python`), seeded `node`: the per-channel brain switch. |
| 0180 (08-31) | `lead_product_enquiries`: append-only shop-app enquiries, many per lead, idempotent on `external_lead_id`; `deals.source` gains `shop_app`. |
| 0181 (09-04) | `public.clients`, the member identity spine (renamed `members` in 0202b), with real foreign keys from `sia.wag_groups` and `sia.wag_contacts`. |
| 0182 (09-10) | `deals.source` gains `self` (a lead a team member brought in). |
| 0183 (09-11) | `vendors` (the identity spine) and `vendor_capabilities` (offers / declines); wires the Sia `vendor_id` columns. |
| 0184 (09-11) | The private `vendor-invoices` bucket. |
| 0185 (09-11) | `vendor_engagements` (the append-only job ledger) and `vendor_reviews`, with `get_vendor_score_inputs` (the one score rollup) and the "used most by" / "used for" tallies. |
| 0186 (09-11) | `vendor_notes` (append-only, with author); the rollup gains `total_used`. |
| 0187 (09-11) | The vendor list search: generated `search_text` / `search_key` with trigram indexes, `search_vendors`, `count_vendors`, and the category and city vocabularies. |
| 0188 (09-11) | `get_vendor_candidates`: the ranker's candidate set in SQL (offers minus declines). |
| 0189 (09-11) | `find_vendors_by_history`: match a request against 46,000+ past ticket titles. |
| 0190 (09-11) | `find_vendors_by_history` takes ranked terms (`p_terms`, most important first); a `declines` capability now excludes here too. |
| 0191 (09-11) | `vendor_agent_preferences` (each teammate's preferred / avoid mark and note) and the rollup's preferred / avoid counts. |
| 0192 (09-11) | Beats the RPC row cap: the vocabularies return one `text[]`, and candidates are ordered by id so they can be paged. |
| 0193 (09-15) | The `freshdesk` schema, a read-only mirror: tickets, conversations, contacts, agents, groups, fields, SLA policies, the append-only `ticket_changes` and `webhook_events`, and the sync state. |
| 0194 (09-15) | Queendoms and the member twin, step M0: `sia.queendoms`, `profiles.queendom_id` and `sia_role`, the queendom gate functions, queendom RLS on `clients`, the twin's stores (facts, people, relations, the partitioned events, documents and chunks, snapshot, health policy and events, anticipations, access log), and `sia.extraction_runs`. |
| 0195 (09-15) | Sia tickets T1: `sia.tickets`, `ticket_events` (partitioned), `ticket_message_links`, `ticket_sla_policies`, `genie_roster`, `public.task_ticket_meta`, the write RPCs `create_ticket` / `apply_ticket_change`, and six ticket notification types. |
| 0196 (09-15) | `freshdesk.ticket_overview(...)`: the `/freshdesk` strip in one scan, with the list's filters. |
| 0197 (09-15) | Freshdesk files: the private `freshdesk-attachments` bucket, `tickets.attachments`, `conversations.media_synced_at`, `media_backlog()`, `flag_threads_for_media()`. |
| 0198 (09-15) | `flag_threads_for_media` starts from the backlog index (it was timing out). |
| 0199 (09-15) | The ticket sentinel's plumbing: wake triggers on new events and links, `claim_sentinel_wakes` (a leased pool), `sentinel_sleep`. |
| 0200 (09-15) | `sia.tickets.tags`, `sia.ticket_settings` (status labels and the tag vocabulary), tags in `apply_ticket_change`, and Realtime on `sia.tickets`. |
| 0201 (09-16) | Queendom seats: the seat columns on `sia.queendoms` dropped (holders derive from `profiles`), the seat CHECKs, one queen / bishop / joker per queendom, and `handle_new_user()` copies the seat from signup metadata. |
| 0202a (09-16) | The `app_domain` value `b2b` renamed `business`; the subscriptions departments CHECK follows. |
| 0203 (09-16) | `claim_sentinel_wakes` gains `p_ticket_id` (the "Wake now" button); the old two-argument overload dropped. |
| 0202b (09-17) | Clients become members: every `client*` table, column, function, index, policy and stored value renamed to `member*` in one transaction; `deals.member_id` gains its foreign key. |
| 0204 (09-17) | `sia.wag_contacts.participant_role` admits `joker`. |
| 0210 (09-17) | 22 Gia tables move to a new `gia` schema; `gia` appended to every public routine's search path and added to the API. |
| 0211 (09-17) | The member twin (52 relations, partitions included) moves to a new `member` schema; `member` appended to the search paths and added to the API. |
| 0212 (09-17) | Hotfix: read-only `gia.profiles` / `member.profiles` views (security invoker) so staff-name embeds work again. |
| 0213 (09-18) | Those views narrowed to `id, full_name`. |
| 0214 (09-18) | The vendor extractor's queue on `freshdesk.conversations` (`vendor_extracted_at`, `vendor_extract_attempts`; existing rows marked read); vendor sources admit `freshdesk_live`. |
| 0215 (09-18) | The member profiler: `sia.codenames`, `sia.profiler_group_state`, the due-groups and broad-senders reads, and the `member_profiler_enabled` switch (seeded off). |
| 0216 (09-18) | The profiler's two reads made cheap (one index probe per group). |
| 0217 (09-18) | `member.members.wa_group_jid`: a trigger-kept mirror of the linked Sia group, for the list's WhatsApp filter. |
| 0218 (09-18) | The profiler reads Active members only (a parameter) and steps over a conversation after repeated failures (`fail_count`). |
| 0219 (09-18) | Ticket intake: `sia.intake_proposals` (the cards), `sia.intake_group_state`, `sia.intake_due_groups`, and the `ticket_intake_enabled` switch (seeded off). |
| 0220 (09-18) | The profiler reads the longest-waiting group first. |
| 0221 (09-18) | `can_access_vendors()`: the vendor module opens to the concierge domain; every vendor SELECT policy and the invoice bucket's read policy re-declared on it. |
| 0222 (09-19) | `sia.wag_group_activity()` rewritten without full scans. |
| 0223 (09-19) | "Ask the database": the `elaya_reader` role, the `elaya_read` schema of cleaned views, `elaya_read.run()`, the one door `public.elaya_run_query()`, and `elaya_query_log`. |
| 0224 (09-19) | `sia.groups_waiting_for_reply()`: member groups where the member had the last word. |
| 0225 (09-19) | The `daily_briefing_enabled` switch (seeded off). |
| 0226 (09-19) | `mcp_tool_calls`: the append-only ledger of MCP connector tool calls. |
| 0227 (09-21) | Vendors: contact names and phones join the search, `vendor_merges` and `merge_vendors()`, and `vendors.deleted_at` / `deleted_by` (removed but kept). |
| 0228 (09-21) | The vendor history search drops words found in more than 5% of titles (it was timing out). |
| 0229 (09-21) | The guessed category boosts the history search instead of filtering it; removed vendors are never suggested. |
| 0230 (09-21) | `vendor_removals` and `remove_vendor()`: delete a vendor with nothing attached, hide one with history, log both. |
| 0231 (09-21) | `elaya_read.run()` row cap raised from 500 to 5,000 for the MCP export. |
| 0232 (09-21) | Repeat nudges on tasks: `nudge_every_minutes`, `nudge_until`, `nudge_count`. |
| 0233 (09-21) | The `mcp_audience` settings row: the roles the MCP connector admits. |
| 0234 (09-21) | `elaya_playbooks`: the founder's written method for a kind of question. |
| 0235 (09-24) | `elaya_jobs` (deep reads), `elaya_labels` with the `elaya_read.labels` view, `elaya_alerts`, and the alert switch and bookmark rows (off). |
| 0236 (09-24) | `member.member_vault` (encrypted in the app, no user policy) and the append-only `member.member_vault_access`; `member_facts.source` admits `freshdesk_note`. |
| 0237 (09-25) | `elaya_user_memory` (the living memory of each user) and `elaya_improvement_requests`. |
| 0238 (09-25) | `sia.intake_stats()`: the intake training numbers in one statement. |
| 0239 (09-25) | `sia.draft_reviews`: the append-only ledger of human verdicts on machine drafts. |
| 0240 (09-25) | `sia.intake_lessons` (versioned instructions, one approved per kind) and `sia.draft_review_scoreboard()`. |
| 0241 (09-26) | `member.compute_member_pulse()` and the `member.members_list` view. |
| 0242 (09-26) | Bishops are many: drops the one-bishop-per-queendom index. |
| 0243 (09-26) | `profiles_update` pins `sia_role` and `queendom_id` on the self branch: nobody changes their own seat or queendom. |
| 0244 (09-26) | The Joker head: the `joker_head` seat (no queendom, one active holder), and `can_access_member_queendom()` passes it for every queendom. Apply with 0243. |
| 0245 (09-26) | Hands, step 1: a `hands` schema for Elaya's second WhatsApp number (`auth_state`, `connector_status`, `allowed_contacts`, `threads`, `raw_events`, `messages`, an `outbox` the connector polls), the private `hands-media` bucket, and `vendors.kind` (`human` / `agent`). Applied 2026-09-28; see `hands-plan.md`. |
| 0246 (09-27) | Elaya's eyes, step 0: `public.media_readings` (one row per stored file: status, class, summary, the words in it, cost; service-role writes, admin/founder read), the `sia.wag_messages_read` view that folds a reading into its message, a narrow `elaya_read.media_readings` view for the analyst (no extracted text, no sensitive rows), the private `elaya-turns` bucket, and the SQL queue (enqueue by anti-join, claim a batch). Applied 2026-09-28, switches OFF; see `media-understanding-plan.md`. |
| 0247 (09-28) | Elaya's voice channel: the `channel` CHECKs on `elaya_conversations` and `elaya_messages` learn `voice` (and `mcp`, for parity with the later tables), and `elaya_settings.voice_enabled` is seeded `false`. Applied 2026-09-28; the row was flipped to `true` the same day for the first call test. See `docs/modules/elaya.md` section 9. |
| 0248 (09-28) | Jokers, step 1: `sia.joker_texts` (each distinct text, labelled once; `tag` recommendation or engagement from its kind), `sia.joker_openings` (one per opening per group), `sia.joker_messages` (every joker message decided once), and the `joker_capture_enabled` switch (off). |
| 0249 (09-28) | Jokers, step 2: the outcome on `sia.joker_openings` (starts `not_replied`), `sia.joker_messages.thread_reason`, `sia.joker_replies` (each member reply judged: quote, reaction, typed, thanks or none) and the append-only `sia.joker_reply_corrections`. |
| 0250 (09-28) | Jokers, Activity: `sia.team_senders` (every WhatsApp id that is not the client's side, with why and `team_until`; never deleted) and `sia.client_activity_daily` (one row per linked member group per India day: the client's side's messages, reactions, senders, first/last message, our team's last message), refreshed by `sia.refresh_team_senders()` and `sia.refresh_client_activity(from, to)`. Counting only, no model. |
| 0251 (09-28) | Jokers, the dashboards: `sia.joker_board(days)` (the Recommendations & Engagement page's one read) `sia.joker_reply_corrections.not_a_reply` (the Fix "not a reply to this item") and `sia.joker_openings.joker_profile_id` (the Joker's account, frozen at capture; the Jokers are found by their seats). 0250 (unreleased) also gained `sia.client_side()`, per-hour counts, `client_activity_messages` and `client_activity_board`. |

> **`lead_health` is fully removed (0084).** No column, util, component, or filter remains —
> any reference found anywhere is stale. (Unrelated: *Domain Health* — `DomainOverviewPanel` /
> `getDomainHealthMetrics` — is a separate, live feature.)
