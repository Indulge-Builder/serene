# Serene — Data Model & RPCs (Claude Project digest)

> Digest of `docs/architecture/database.md`, `docs/architecture/migrations.md`, `docs/architecture/
> auth-and-rbac.md`, and the module specs (through migration file `0149`, 2026-06-26). The raw schema
> dump is `docs/architecture/database_architecture.sql`. RLS posture and the two-tier RPC model are
> summarised here; the rules are in `6-engineering-rules.md`.

## Ground rules

- **Every table has RLS enabled** in its migration (A-08). Authorization reads only from
  `public.profiles` (A-01); RLS policies call `get_user_role()` / `get_user_domain()` (SECURITY
  DEFINER, `SET search_path = public`, wrapped `(SELECT …)`).
- **Two real Postgres enums:** `user_role` (founder/admin/manager/agent/guest), `app_domain` (9
  domains). Everything else called an "enum" is **text + CHECK**, mirrored in `src/lib/constants/` via
  `defineEnum()` (Q-02).
- **Append-only** log/activity tables (A-11) — two documented UPDATE exceptions: WhatsApp
  delivery-receipt status, and `task_remarks` suppression flags.
- **SECURITY DEFINER RPCs are two-tier (Q-13):** *self-scoped* keep `GRANT EXECUTE TO authenticated`;
  *scope-param* have EXECUTE revoked and run admin-client-only with session-derived args.

## Tables by domain

### Identity & access
- **`profiles`** — root of authorization. `role` (`user_role`), `domain` (`app_domain`), `is_active`,
  `theme`, `app_icon` (`icon-1..4`, 0121), `reports_to`, `job_title`, dormant `last_seen_at`. Created
  only by the `on_auth_user_created` trigger (which also copies `job_title` from invite metadata,
  0125). Self-update policy permits cosmetic fields; `WITH CHECK` blocks self role/domain elevation.
- **`profile_audit_log`** — append-only, `ON DELETE RESTRICT`. Every role/domain/active change.
- **`agent_routing_config`** — round-robin pool switch (`is_active`) + shift windows/days. Auto-created
  for role `agent` **and** `manager` (0124). Advisory; read by ingestion + the SLA shift overrides.

### Leads (Gia)
- **`leads`** — lifecycle `new→touched→in_discussion→nurturing→won|lost|junk`. E.164 `phone`; flat
  `source`/`medium`/`utm_campaign` + immutable `attribution jsonb` (`{}` minimum, never NULL);
  `assigned_to`; `resolution_reason` (lost/junk); `archived_at` soft-delete; `previous_lead_id` dedup
  chain; trigger-generated immutable `slug` (`priya-sharma-9182`; the lower()-before-strip bug was
  fixed 2026-06-25); `search_text` STORED column + trigram index; `service_interests text[]` (0109,
  never an enum); `last_call_outcome` + `last_call_outcome_at` (0112); `last_activity_at`.
- **`lead_activities`** / **`lead_notes`** — append-only ledgers (notes are team-visible; call notes
  carry `call_outcome`).
- **`lead_raw_payloads`** — immutable webhook log incl. failures; **full PII** by recorded decision,
  admin/founder SELECT only → `/error-log`. Written before auth so rejects leave a trace.
- **`lead_sla_timers`** — service-role only; the SLA engine's timer state.

### Tasks
- **`tasks`** — one table. `task_category` ∈ `personal`/`group_subtask`; `task_module` enum
  (gia/sia/core); status `to_do/in_progress/in_review/completed/error/cancelled`; priority
  urgent/high/normal; checklist in `attachments jsonb`; `tags text[]`; `overdue_at` (0113, stamped
  once by the overdue job). Lead follow-ups are a `personal` task + a **`task_gia_meta`** link row
  (the meta row IS the link since 0138; `create_lead_gia_task` is the single writer of both).
- **`task_groups`** — flat visibility (creator OR assigned a subtask).
- **`task_remarks`** — append-only narrative; `status_change` CHECK coupled to `tasks.status`; one
  narrow admin/founder suppression UPDATE exception.
- **`task_audit_log`** — append-only, 6 fields, CASCADE on task delete.
- **`task_gia_meta`** — task↔lead link + `call_outcome`.
- **`task_events`** (0144) — **append-only** oversight stream. `task_event_type` enum
  (created/status_changed/reassigned/remark_added/overdue), `domain app_domain NOT NULL`,
  `actor_id`/`subject_id`, `task_title` snapshot, `meta jsonb`, FK→tasks CASCADE. **manager+ SELECT,
  NO INSERT/UPDATE/DELETE policy ever**; Realtime enabled; written only by the task-mutation cores +
  the overdue job via the admin client. **Migration 0144 is in the working tree, not yet on prod.**

### WhatsApp
- **`whatsapp_conversations`** — one per phone/lead; `wa_id` + `lead_id` UNIQUE; Realtime. Dormant
  `bot_active` (customer bot not built).
- **`whatsapp_messages`** — append-only except the delivery-receipt status UPDATE; partial-unique
  `wa_message_id`; Realtime; supports inbound/outbound media. Dormant `is_bot`.
- **`whatsapp_conversation_reads`** — per-user read position (UPSERT).
- **`whatsapp_notification_logs`** — one row per template-send attempt; **last-4 phone digits only**;
  `delivered` = `res.ok` AND body not `{status:'error'}`; admin/founder SELECT only.

### Commerce / finance
- **`deals`** (first-class since 0072) — `lead_id` nullable (= walk-in); **`deal_type` is
  domain-derived** via `DOMAIN_DEAL_CONFIG` (onboarding→membership needs duration; shop→retail needs
  `deal_category`; house/legacy→sale), set server-side, with 0122 CHECKs coupling retail⇔category;
  `won_at` immutable; `source`. **No write RLS by design** — all writes via the admin client in
  `recordDeal`/`createWalkInDeal` (the action is the trust boundary). `client_id` reserved for the
  clients module.
- **`ad_creatives`** — campaign videos keyed by `campaign_key` string-match to `leads.utm_campaign`
  (no FK; multiple per campaign).
- **`ad_spend_daily`** (0104) — day-grain Meta spend; `UNIQUE(campaign_key, spend_date, source)`; RLS
  manager+ read.
- **`ad_account_recharges`** (0139) — per-account recharge ledger; manager+ read / admin/founder write;
  `method` is a payment-method label (card-PAN-rejected at Zod + DB CHECK). Balance is INR-only.
- **`domain_targets`** (0105) — founder monthly deals-closed targets.

### Notifications
- **`notifications`** — typed CHECK; `action_url` relative-only; Realtime → bell badge. Types include
  `lead_initiation`, `elaya_reply`, `sla_breach_founder`, `task_overdue_manager`, `suggestion_resolved`.
- **`push_subscriptions`** (0120) — one row per device (`endpoint` UNIQUE); owner-only RLS, **no
  UPDATE**; cross-user read + 404/410 dead-endpoint prune run service-role.
- **`notification_preferences`** (0133) — per-user × category × channel (`in_app`/`whatsapp`) mutes,
  sparse rows; **absence = ON, the gate fails OPEN**. Transactional types
  (`lead_initiation`/`elaya_reply`/`suggestion_resolved`) have no key and are never silenceable.

### Call Intelligence
- **`service_cases`** + **`conversation_hooks`** (0110) — RLS all-authenticated read / admin+founder
  write; weighted FTS + tags GIN; dormant `embedding vector(1536)` (no HNSW yet). Power `/helpdesk` +
  the dossier `ServiceInterestCard`; served as a Redis 1hr `{cases,hooks}` envelope (client-side filter).

### SLA / Revival
- **`sla_policies`** (0111) — the SLA rules (formerly hard-coded constants); one row per rule
  (trigger_kind status/outcome/task_due, threshold, recipient_role, auto_task, channels, hours_mode,
  active); admin/founder SELECT, service-role writes; read per run. Seeded with the 8 status rules +
  CAD cadence + TASK task-due families.
- **`revival_policies`** (0119) — per-status silence thresholds + daily cap (admin/founder SELECT,
  service-role write).
- **`revival_candidates`** (0119) — `open→actioned|dismissed` ledger; verdict revive/unsure/dismiss;
  denormalised `assigned_to` for the daily-cap count; partial UNIQUE `(lead_id) WHERE status='open'`.
  SELECT only (no user write policy); never mutates the leads row.

### Usage (adoption)
- **`usage_heartbeats`** (0126) — raw append-only tick log (30-day prune); only the snapshot job
  writes it (the request path never writes the DB — hot path is one Redis SET).
- **`usage_daily`** (0126) — the rollup the dashboard reads; PK `(day, user_id, domain)`; idempotent
  UPSERT (recompute-and-overwrite, never increment); never pruned.

### Suggestions
- **`suggestions`** (0134) — staff suggestion/bug triage (message + ≤4 screenshot **paths**, never
  URLs); a status lifecycle (open→resolved), so exactly ONE narrow admin/founder UPDATE policy (only
  status/resolved_by/resolved_at); no DELETE policy ever. Private **`suggestions`** Storage bucket
  (0135) — no public read; signed URLs minted server-side.

### AI / Elaya
- **`elaya_conversations`** + **`elaya_messages`** (0116) — append-only; `channel` column (in_app /
  whatsapp); one active session per user across channels; `sender_id` denormalised for the cap count;
  WhatsApp dedup via a partial UNIQUE on `meta->>'wa_message_id'` (0148).
- **`user_context`** (0116) — per-user memory; `context.persona` (user-set) + `context.learned`
  (Elaya-written); RLS read-own, service-role write.
- **`elaya_actions`** (0118) — the write-proposal **state-machine** ledger
  (`proposed→executed|failed|dismissed`); before/after snapshots; partial index on `status='proposed'`;
  the proposed→terminal flip is a service-role admin-client UPDATE (an A-11 carve-out, not append-only).
- **`llm_providers`** + **`elaya_settings`** (0116) — provider config (`routing`→Haiku,
  `reasoning`→Sonnet) + PII depth / daily cap / session hours; read **per request**, never cached.

## Storage buckets

| Bucket | Read | Write |
|--------|------|-------|
| `avatars` | public | own row |
| `ad-creatives` | public | admin/founder |
| `suggestions` | **private** (signed URLs only) | own-prefix insert; admin reads via signed URLs |
| (WhatsApp inbound media) | private Supabase Storage copy of the Gupshup CDN asset | server (ingestion) |

## Load-bearing RPCs (selected)

- **Ingestion / leads:** `get_next_round_robin_agent` (SELECT FOR UPDATE SKIP LOCKED;
  `role IN ('agent','manager')` since 0124) · `get_active_lead_by_phone` · `update_lead_status` ·
  `add_lead_call_note` · `get_leads_status_counts` · `generate_lead_slug` (fixed 0147) ·
  `lead_phone_key` + the active-phone partial UNIQUE index (0137, dedup TOCTOU backstop).
- **Dashboard / performance:** `get_dashboard_summary` · `get_agent_performance` /
  `get_agent_roster_performance` · `get_agent_today_pulse` · `get_agent_performance_trend` (0146,
  working tree) · `get_agent_first_touch_pairs` (0123) · `get_recent_lead_activity` (0132).
- **Deals / budget:** `get_deals_summary` · `get_budget_summary` (0106) · domain-health total_deals
  aggregate (0107).
- **Oversight (0144, scope-param, admin-client only):** `get_team_task_overview` ·
  `get_team_agent_breakdown` · `get_agent_tasks_oversight`.
- **Revival:** `get_silent_leads_for_revival` (0128, pushes the judge-once anti-join into SQL).
- **Tasks:** `get_personal_tasks` (0145 widened to carry the linked lead's identity) ·
  `get_group_task_summaries` · `add_task_remark_with_status`.
- **Elaya sessionless twins (0149, scope-param, admin-client only):**
  `get_group_task_summaries_for_user` · `get_agent_today_pulse_for_user` ·
  `get_agent_roster_performance_for_elaya`.
- **Usage:** `get_agent_usage` (0126).

## Migration numbering reality (don't be surprised)

- The migration ledger was **repaired 2026-06-12** — 0001–0064 were recorded, 0065–0108 had been
  applied out-of-band and were then catalog-verified and recorded. Local files == remote ledger; every
  future apply records its row.
- The docs index in `migrations.md` **jumps 0137 → 0144** (0138–0143 shipped but weren't back-added to
  that docs-side index; the `supabase/migrations/CLAUDE.md` inventory + the SQL files are truth). The
  newest files on disk are `0145`–`0149` (2026-06-25).
- Several migrations are flagged **"NOT yet applied to prod"** in the changelog — notably **0144**
  (oversight) and **0146** (agent performance trend), plus a couple of earlier ones (0114 CAD-02A seed,
  0120/0121 noted at authoring time). Always verify against the live DB, not memory, before assuming a
  table/column/RPC exists. Built-vs-applied status is tracked in `9-roadmap-and-open-items.md`.
- `lead_health` is **fully removed** (0084) — any reference anywhere is stale. (Unrelated: *Domain
  Health* — `getDomainHealthMetrics` — is a separate live feature.)
