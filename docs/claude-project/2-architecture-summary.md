# Serene — Architecture Summary (Claude Project digest)

> Digest of `docs/architecture/*` and `docs/integrations/*` (through 2026-06-26). Source of truth is
> the repo docs. The full data model is in `7-data-model.md`; integrations in
> `8-integrations-and-jobs.md`; the engineering rules in `6-engineering-rules.md`.

## Tech stack (final — never propose alternatives)

Next.js 16 App Router (proxy at `src/proxy.ts`, **no** `middleware.ts`) · TypeScript 5 strict
(no `any`) · Tailwind v4 + CSS variables (every colour a token) · shadcn/ui + bespoke primitives ·
Supabase (Postgres 17, Auth, Realtime, Storage) · Upstash Redis (cache-aside) · Trigger.dev SDK v4
(imports via the `/v3` entry point) · Gupshup v1 (WhatsApp BSP) · Framer Motion 12 (transform/opacity
only, `import { m as motion }`) · Recharts 3 (via `useChartTokens()`) · React Hook Form + Zod 4 ·
@dnd-kit · lucide-react · xlsx client-side only · `web-push` (VAPID) · Deepgram (voice) ·
Anthropic (`@anthropic-ai/sdk`, the Elaya brain) · Vercel · pnpm.

**Not dependencies (never assume):** React Query/@tanstack, Sentry, virtualization libs, a Meta
WhatsApp-direct integration (reverted to Gupshup), an ElevenLabs/TTS layer (locked for a future
phase). Data fetching is Server-Components-first; client widgets use Server-Actions-in-`useEffect`.
Big lists paginate server-side.

## Topology

Meta/Pabbly lead webhooks and Gupshup WhatsApp webhooks POST into Vercel (Next.js). Browser agents
hit RSC pages + Server Actions. Behind Vercel: Supabase (source of truth + Auth + Realtime +
Storage), Upstash Redis (read cache only), Trigger.dev (SLA timers, task reminders, daily
lead-revival sweep, usage snapshot/rollup), Gupshup API (outbound WhatsApp, always inside `after()`),
the Elaya LLM provider (Anthropic adapter — `reasoning`/Sonnet for chat + `routing`/Haiku for the
note-AI gate and memory summarizer), Deepgram (inbound voice transcription, in-memory), and
Web Push/VAPID (outbound push).

- **Five API routes, no others:** the two webhooks (`/api/webhooks/leads`, `/api/webhooks/whatsapp`),
  `/api/auth/callback`, `/api/elaya/chat` (Elaya SSE streaming — sanctioned P-02 exception), and
  `/api/manifest` (dynamic per-icon PWA manifest — sanctioned P-02 carve-out). All mutations are
  Server Actions returning `{ data, error }`.
- **Request flow:** proxy (session refresh via JWKS-cached `getSession()`, webhook bypass, sets
  `x-pathname`) → dashboard layout server guard (no session → `/login`; `canAccessRoute` domain gate
  → `/dashboard`; zero-flash theme + app-icon scripts) → RSC page (thin orchestrator,
  Suspense-wrapped async children calling `lib/services/`) → interactions via Server Actions
  (`Zod → requireProfile → service → invalidate caches → revalidatePath`) → Realtime merges live
  inserts.
- **Outward sends that must complete** (Gupshup, any external fetch): `after()` from `next/server`
  with the send awaited inside — never `void fetch().catch()` (Vercel freezes the lambda on response
  flush; this caused the 2026-06-08 silent notification loss). Routes carrying sends export
  `maxDuration` (60s on the webhooks; 180s on both Elaya entry points). Full rule: A-16 in
  `6-engineering-rules.md`.

## Auth & RBAC

- **Authorization reads from `public.profiles` only** — never JWT claims (they go stale).
- Roles: `founder`/`admin` (full access, deliberately distinct so no role both performs and audits a
  sensitive action), `manager` (own domain), `agent` (own assigned leads), `guest` (reserved). One
  domain per user; no grants table.
- **Two domain registries — never mix:** `APP_DOMAINS` (9: concierge, onboarding, finance, marketing,
  tech, shop, b2b, house, legacy — the platform enum) vs `GIA_DOMAINS` (4: onboarding, house, shop,
  legacy — Gia pickers). Labels from `DOMAIN_LABELS` only (Q-17).
- **Two-layer security:** RLS at the DB **and** `requireProfile(roles?)` at the start of every
  session-based Server Action (A-18); neither layer trusts the other. RLS policies call only
  `get_user_role()`/`get_user_domain()` (SECURITY DEFINER, `SET search_path = public`, wrapped as
  `(SELECT …)` for once-per-statement evaluation). Enum→text compares need `::text`.
- **Route protection, three layers:** proxy session refresh → layout guard (`canAccessRoute` over
  `DOMAIN_ROUTE_MAP` + `ALWAYS_ALLOWED_PREFIXES` = `/dashboard`, `/profile`, `/elaya`, `/helpdesk`) →
  Sidebar never renders inaccessible links. Admin/founder bypass domain checks. `/performance` and
  `/escalations` are all-roles `ANALYTICS_NAV` exceptions but stay Gia-domain-only via the route map.
- Profiles are created only by the `on_auth_user_created` trigger; role/domain never self-editable
  (RLS `WITH CHECK` self-elevation guard); deactivation = `is_active=false`, never deletion; changes
  audited append-only in `profile_audit_log`.
- **SECURITY DEFINER RPCs use a two-tier scoping model (Q-13, migration 0102):** *self-scoped* RPCs
  derive scope from `auth.uid()` and keep `GRANT EXECUTE TO authenticated`; *scope-param* RPCs have
  client EXECUTE revoked and are reachable only via the admin client inside an action (the calling
  action is the trust boundary). A scope-param RPC with a live `authenticated` grant is a violation.
- Webhooks authenticate **before reading the body**: leads = Bearer `PABBLY_WEBHOOK_SECRET`, whatsapp
  = `x-gupshup-secret` header — both timing-safe compares (`safeSecretCompare`) + rate-limited
  (`createRateLimiter`).
- **Password reset = OTP code** (replaced the magic-link to dodge corporate link-scanners
  pre-burning the single-use token): `requestPasswordResetAction` emails a 6-digit `{{ .Token }}` →
  `verifyResetOtpAction` (`verifyOtp` type `recovery`, establishes the session) →
  `updatePasswordAction`. `/update-password` is a two-step, `?email`-only form with no session at
  arrival. Login is unchanged (`signInWithPassword` + `is_active` gate).

## Database (Postgres, all tables RLS-enabled)

Two real enums: `user_role`, `app_domain`. Other "enums" are text + CHECK, mirrored in
`src/lib/constants/` via `defineEnum()`. The full table-by-table breakdown is in `7-data-model.md`.
At a glance:

- **Identity:** `profiles` (root of authorization; `theme`, `app_icon`, `reports_to`) ·
  `profile_audit_log` (append-only) · `agent_routing_config` (round-robin pool switch + shift
  windows; managers now in the pool, 0124).
- **Leads:** `leads` (lifecycle `new→touched→in_discussion→nurturing→won|lost|junk`; E.164 phone;
  `source`/`medium`/`utm_campaign` + immutable `attribution jsonb`; `assigned_to`;
  `resolution_reason`; `archived_at`; `previous_lead_id` dedup chain; trigger-generated `slug`;
  `search_text` STORED + trigram; `service_interests text[]`; `last_call_outcome_at`) ·
  `lead_activities`/`lead_notes` (append-only) · `lead_raw_payloads` (immutable webhook log, full
  PII, admin/founder only → `/error-log`) · `lead_sla_timers` (service-role only).
- **Tasks:** one `tasks` table (`task_category` personal/group_subtask; lead follow-up = a personal
  task + a `task_gia_meta` link row since 0138; `task_module` enum gia/sia/core; `overdue_at`) ·
  `task_groups` · `task_remarks` (append-only except admin/founder suppression) · `task_audit_log` ·
  `task_gia_meta` · `task_events` (0144 — the append-only oversight stream).
- **WhatsApp:** `whatsapp_conversations` · `whatsapp_messages` (append-only except delivery-receipt
  status) · `whatsapp_conversation_reads` · `whatsapp_notification_logs` (last-4 phone digits only).
- **Commerce:** `deals` (first-class since 0072; `lead_id` nullable = walk-in; **`deal_type` is
  domain-derived** via `DOMAIN_DEAL_CONFIG`, set server-side, 0122 CHECKs couple retail⇔category;
  `won_at` immutable; no write RLS — admin-client writes via `recordDeal`/`createWalkInDeal`;
  `client_id` reserved) · `ad_creatives` (campaign videos keyed by `campaign_key` string-match) ·
  `ad_spend_daily` (0104, day-grain Meta spend) · `ad_account_recharges` (0139, per-account ledger) ·
  `domain_targets` (0105, founder monthly targets).
- **Notifications:** `notifications` (Realtime → bell badge) · `push_subscriptions` (0120, Web Push) ·
  `notification_preferences` (0133, per-user×category channel mutes; **absence = ON, fails OPEN**).
- **Call Intelligence:** `service_cases` + `conversation_hooks` (0110; dormant `embedding vector(1536)`).
- **SLA / Revival:** `sla_policies` (0111) · `revival_policies` + `revival_candidates` (0119).
- **Usage:** `usage_heartbeats` + `usage_daily` (0126, adoption tracking).
- **Suggestions:** `suggestions` (0134) + private `suggestions` Storage bucket (0135).
- **AI / Elaya:** `elaya_conversations` + `elaya_messages` (0116, append-only) · `user_context` (0116,
  per-user persona + learned memory) · `elaya_actions` (0118, write-proposal state-machine ledger;
  before/after snapshots) · `llm_providers` + `elaya_settings` (0116; read per turn, never cached).

Storage buckets: `avatars` (public read, own-row write), `ad-creatives` (public read, admin/founder
write), `suggestions` (**private** — paths stored, signed URLs minted server-side). ~38+ SECURITY
DEFINER RPCs; load-bearing ones include `get_next_round_robin_agent`, `get_active_lead_by_phone`,
`update_lead_status`, `add_lead_call_note`, `get_dashboard_summary`, `get_agent_performance`,
`get_deals_summary`, `get_budget_summary`, plus the oversight trio and the Elaya sessionless twins.

## Caching (three layers)

1. **Upstash Redis, cache-aside:** read services check Redis → miss → Postgres → write back with
   TTL. Postgres is always the source of truth; Redis failure degrades to direct reads, never user
   errors. Single client `src/lib/redis.ts`; all keys/TTLs from `src/lib/constants/redis-keys.ts`.
   - `lead:list:*` 30s — invalidated by **version-counter** INCR per role+domain; key includes
     role+callerDomain+userId+filterHash+v{N}.
   - `lead:row:slug` + `lead:row:id` 120s — **dual-key invariant:** every lead-row mutation deletes
     BOTH keys. Structural via `invalidateLeadCaches(site, lead, scope)` — never a hand-rolled
     `redis.del` in a lead action.
   - `lead:notes`/`lead:activities` 120s (explicit del) · `lead:filter-options` 300s · `dashboard:*`
     30–120s (TTL-only; date-range-namespaced keys can't be enumerated) · `perf:*` 30–120s (TTL-only)
     · `task:*` 30–120s (group-list user-scoped) · helpdesk library 1hr.
   - **No campaign, ad-creatives, or budget namespaces** — those reads are always live; do not re-add.
   - **P-08:** every `redis.del` in an action is `await`-ed in try/catch (logged warn) **before**
     `revalidatePath` — `void del().catch()` races the revalidation and evicts fresh entries.
2. **React `cache()`** — per-request memoisation; **required** for services calling `createClient()`
   (which reads `cookies()`). Reference: `getDashboardSummary`.
3. **`unstable_cache`** — cross-request, tag-revalidated; **forbidden if the closure touches
   `cookies()`/`headers()`** (P-09 — Next.js throws); key must include every scoping dimension
   (domain, userId — Q-16). Reference: `getGroupTasks`; revalidated via
   `revalidateTag(tag, { expire: 0 })` (Next.js 16 needs the second arg).

## Integrations (summary — full detail in `8-integrations-and-jobs.md`)

- **Lead ingestion** (`POST /api/webhooks/leads?source=meta|google|website`): rate-limit before body
  read → raw payload logged **before** auth (auditability) → Bearer check → `ingestLead()`: Zod →
  domain resolution (explicit field → campaign-prefix map → default `onboarding`) → phone dedup RPC →
  race-free round-robin (`SELECT FOR UPDATE SKIP LOCKED`) → insert + activities → `after(notifyLeadAssigned)`.
- **WhatsApp/Gupshup:** three service files, never blurred — `whatsapp-service.ts` (UI reads),
  `whatsapp-api.ts` (outbound + logging), `whatsapp-ingestion.ts` (inbound). The Elaya staff routing
  gate runs **before** the lead pipeline (staff number → Elaya brain, one reply; unknown number →
  lead pipeline). Seven Gupshup templates, all via `sendGupshupTemplate()` (one-log-row-per-attempt;
  Gupshup returns HTTP 200 even on errors — delivered = `res.ok` AND body not `{status:'error'}`).
- **Notifications fan-out:** Web Push (VAPID) is a non-fatal second channel *inside* `createNotification`
  — the in-app `notifications` row is the source of truth; dead endpoints (404/410) self-prune.
- **Trigger.dev:** four job families across five files — lead SLA timers, task due reminders, the
  daily lead-revival sweep (the first cron `schedules.task`), and the usage snapshot/rollup pair.
  Cron timezone in code is `Asia/Calcutta` (Trigger.dev rejects the `Asia/Kolkata` alias).
- **SLA engine:** config-driven via `sla_policies` (0111) — 8 status rules + cadence (CAD) + task-due
  (TASK) families; agent rules notify the agent + auto-create a task, manager/founder rules escalate.

## Deeper detail lives in (repo)

`docs/architecture/{overview,database,auth-and-rbac,caching,migrations}.md` ·
`docs/modules/elaya.md` · `docs/integrations/*` · code-adjacent `CLAUDE.md`
files (`src/lib/`, `src/lib/elaya/`, `src/components/`, `src/app/`, `supabase/migrations/`) ·
`docs/architecture/database_architecture.sql` (raw dump).
