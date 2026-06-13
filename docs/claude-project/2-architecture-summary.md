# Serene — Architecture Summary (Claude Project digest)

> Generated digest of `docs/architecture/*` and `docs/integrations/*` — 2026-06-11.
> Source of truth is the repo docs; regenerate when they change.

## Tech stack (final — never propose alternatives)

Next.js 16 App Router (proxy at `src/proxy.ts`, **no** `middleware.ts`) · TypeScript 5 strict
(no `any`) · Tailwind v4 + CSS variables (every colour a token) · shadcn/ui + bespoke
primitives · Supabase (Postgres 17, Auth, Realtime, Storage) · Upstash Redis (cache-aside) ·
Trigger.dev SDK v4 (imports via `/v3` entry point) · Gupshup v1 (WhatsApp BSP) · Framer Motion
12 (transform/opacity only, `import { m as motion }`) · Recharts 3 (via `useChartTokens()`) ·
React Hook Form + Zod 4 · lucide-react · @dnd-kit · xlsx client-side only · Vercel · pnpm.

**Not dependencies (never assume):** React Query/@tanstack, Sentry, virtualization libs.
Data fetching is Server-Components-first; client widgets use Server-Actions-in-`useEffect`.
Big lists paginate server-side.

## Topology

Meta/Pabbly lead webhooks and Gupshup WhatsApp webhooks POST into Vercel (Next.js). Browser
agents hit RSC pages + Server Actions. Behind Vercel: Supabase (source of truth + Auth +
Realtime + Storage), Upstash Redis (read cache only), Trigger.dev (SLA timers, task
reminders), Gupshup API (outbound WhatsApp, always inside `after()`).

- **No API routes** except the two webhooks (`/api/webhooks/leads`, `/api/webhooks/whatsapp`)
  and `/api/auth/callback`. All mutations are Server Actions returning `{ data, error }`.
- **Request flow:** proxy (session refresh, webhook bypass, sets `x-pathname`) → dashboard
  layout server guard (no session → `/login`; `canAccessRoute` domain gate → `/dashboard`;
  zero-flash theme script) → RSC page (thin orchestrator, Suspense-wrapped async children
  calling `lib/services/`) → interactions via Server Actions
  (`Zod → requireProfile → service → invalidate caches → revalidatePath`) → Realtime merges
  live inserts.
- **Outward sends** that must complete (Gupshup, external fetch): `after()` from
  `next/server` with the send awaited inside — never `void fetch().catch()` (Vercel freezes
  the lambda on response flush; this caused the 2026-06-08 silent notification loss).

## Auth & RBAC

- **Authorization reads from `public.profiles` only** — never JWT claims (they go stale).
- Roles: `founder`/`admin` (full access, deliberately distinct so no role both performs and
  audits a sensitive action), `manager` (own domain), `agent` (own assigned leads),
  `guest` (reserved). One domain per user; no grants table.
- **Two domain registries — never mix:** `APP_DOMAINS` (9: concierge, onboarding, finance,
  marketing, tech, shop, b2b, house, legacy — the platform enum) vs `GIA_DOMAINS` (4:
  onboarding, house, shop, legacy — Gia pickers). Labels from `DOMAIN_LABELS` only.
- **Two-layer security:** RLS at the DB **and** `requireProfile(roles?)` at the start of every
  session-based Server Action; neither layer trusts the other. RLS policies call only
  `get_user_role()`/`get_user_domain()` (SECURITY DEFINER, `SET search_path = public`,
  wrapped as `(SELECT …)` for once-per-statement evaluation). Enum→text compares need `::text`.
- **Route protection, three layers:** proxy session refresh → layout guard
  (`canAccessRoute` over `DOMAIN_ROUTE_MAP` + `ALWAYS_ALLOWED_PREFIXES` = `/dashboard`,
  `/profile`) → Sidebar never renders inaccessible links. Admin/founder bypass domain checks.
- Profiles are created only by the `on_auth_user_created` trigger; role/domain never
  self-editable (RLS `WITH CHECK` self-elevation guard); deactivation = `is_active=false`,
  never deletion; changes audited append-only in `profile_audit_log`.
- SECURITY DEFINER RPCs never trust caller-supplied scope params; scope-param RPCs have client
  EXECUTE revoked (migration 0102) and are reachable only via service-role inside actions.
- Webhooks authenticate **before reading the body**: leads = Bearer `PABBLY_WEBHOOK_SECRET`,
  whatsapp = `x-gupshup-secret` header — both timing-safe compares + rate-limited.

## Database (Postgres, all tables RLS-enabled)

Enums: `user_role`, `app_domain`. Other "enums" are text + CHECK, mirrored in
`src/lib/constants/`.

| Group | Tables (key facts) |
| ----- | ------------------ |
| Identity | `profiles` (root of authorization; theme/timezone; `reports_to`; dormant `last_seen_at`) · `profile_audit_log` (append-only, `ON DELETE RESTRICT`) · `agent_routing_config` (round-robin pool switch + shift windows/days; advisory, read by ingestion) |
| Leads | `leads` (lifecycle `new→touched→in_discussion→nurturing→won\|lost\|junk`; E.164 phone; flat `source`/`medium`/`utm_campaign` + immutable `attribution jsonb` snapshot (`{}` minimum, never NULL); `assigned_to`; `resolution_reason` for lost/junk; `archived_at` soft-delete; `previous_lead_id` dedup chain; immutable trigger-generated `slug` like `priya-sharma-9182`; `search_text` STORED column + trigram index) · `lead_activities`/`lead_notes` (append-only; all notes team-visible) · `lead_raw_payloads` (immutable webhook log incl. failures, full PII by recorded decision, admin/founder SELECT only → `/error-log`) · `lead_sla_timers` (service-role only) |
| Tasks | one `tasks` table, `task_category` ∈ personal/group_subtask/gia_followup; status `to_do/in_progress/in_review/completed/error/cancelled`; priority urgent/high/normal; checklist in `attachments jsonb`; `tags text[]` · `task_groups` (flat visibility: creator OR assigned a subtask) · `task_remarks` (append-only narrative; `status_change` CHECK coupled to `tasks.status`) · `task_audit_log` (append-only, 6 fields, CASCADE on task delete) · `task_gia_meta` (task↔lead link + call_outcome) |
| WhatsApp | `whatsapp_conversations` (one per phone/lead; `wa_id` + `lead_id` UNIQUE; Realtime) · `whatsapp_messages` (append-only except the delivery-receipt status UPDATE; partial-unique `wa_message_id`; Realtime) · `whatsapp_conversation_reads` (per-user read position, UPSERT) · `whatsapp_notification_logs` (one row per template send attempt; last-4 phone digits only) |
| Commerce | `deals` (first-class since 0072; `lead_id` nullable = walk-in; `deal_type` membership/retail, membership requires duration; `won_at` immutable; **no write RLS by design** — all writes via admin client in `recordDeal`/`createWalkInDeal`; `client_id` reserved for clients module) · `ad_creatives` (campaign videos keyed by `campaign_key` string-match to `leads.utm_campaign`, no FK; multiple per campaign) |
| Notifications | `notifications` (typed CHECK; `action_url` relative-only; Realtime → bell badge) |

Storage buckets: `avatars` (public read, own-row write), `ad-creatives` (public read,
admin/founder write). ~30 SECURITY DEFINER RPCs; load-bearing ones include
`get_next_round_robin_agent`, `get_active_lead_by_phone`, `update_lead_status`,
`add_lead_call_note`, `get_dashboard_summary`, `get_agent_performance`, `get_deals_summary`.

## Caching (three layers)

1. **Upstash Redis, cache-aside:** read services check Redis → miss → Postgres → write back
   with TTL. Postgres is always the source of truth; Redis failure degrades to direct reads,
   never user errors. Single client `src/lib/redis.ts`; all keys/TTLs from
   `src/lib/constants/redis-keys.ts` only.
   - `lead:list:*` 30s — invalidated by **version counter** INCR per role+domain;
     key includes role+callerDomain+userId+filterHash+v{N}.
   - `lead:row:slug` + `lead:row:id` 120s — **dual-key invariant:** every lead-row mutation
     deletes BOTH keys. Structural via `invalidateLeadCaches(site, lead, scope)` — never
     hand-rolled `redis.del` in lead actions.
   - `lead:notes`/`lead:activities` 120s (explicit del) · `lead:filter-options` 300s (TTL-only)
     · `dashboard:*` 30–120s (TTL-only; date-range-namespaced keys can't be enumerated) ·
     `perf:*` 30–120s (TTL-only) · `task:*` 30–120s (explicit del; group-list is user-scoped).
   - **No campaign or ad-creatives namespaces** — those reads are always live; do not re-add.
   - **P-08:** every `redis.del` in an action is `await`-ed in try/catch (logged warn)
     **before** `revalidatePath` — `void del().catch()` races the revalidation and evicts
     fresh entries.
   - Every scoped key embeds session-verified domain/userId — never cross-domain cache hits.
2. **React `cache()`** — per-request memoisation; **required** for services calling
   `createClient()` (reads `cookies()`). Reference: `getDashboardSummary`.
3. **`unstable_cache`** — cross-request, tag-revalidated; forbidden if the closure touches
   `cookies()`/`headers()`; key must include every scoping dimension (domain, userId).
   Reference: `getGroupTasks`, revalidated via `revalidateTag(tag, { expire: 0 })`
   (Next.js 16 needs the second arg).

## Integrations

- **Lead ingestion** (`POST /api/webhooks/leads?source=meta|google|website`, maxDuration 60):
  rate-limit before body read → raw payload logged **before** auth (auditability) → Bearer
  check → `ingestLead()`: Zod → domain resolution (explicit field → campaign-prefix map
  `TG_Global→onboarding`, `TG_Shop→shop`, `TG_Legacy→legacy`, `TG_House→house`, `TG_B2B→b2b`
  → default `onboarding`) → phone dedup RPC (active lead = duplicate activity, no new row;
  terminal = new lead with `previous_lead_id`) → race-free round-robin
  (`SELECT FOR UPDATE SKIP LOCKED`) → insert + activities. Then
  `after(notifyLeadAssigned(...))` → 201. Failures land on `/error-log`.
- **WhatsApp/Gupshup:** three service files, never blurred — `whatsapp-service.ts` (session,
  UI reads), `whatsapp-api.ts` (server-only outbound + logging), `whatsapp-ingestion.ts`
  (admin client, inbound). Inbound webhook always returns 200 after auth; processing deferred
  in `after()`; 9-step pipeline dedups on `wa_message_id`, resolves lead by phone, creates a
  Pipeline-B lead (domain `onboarding`, round-robin, `await notifyLeadAssigned`) when none.
  Orchestrator `notifyLeadAssigned()` is the single entry for all 4 assignment paths: agent
  WhatsApp + founder WhatsApp (`Promise.allSettled`) + in-app notification (self-notify
  suppressed) + SLA timers. Five Gupshup templates, all through `sendGupshupTemplate()` core
  with one-log-row-per-attempt; Gupshup returns HTTP 200 even on errors — delivered =
  `res.ok` AND body not `{status:'error'}`.
- **Trigger.dev** (async > 3s or needing retry/delay; sub-3s post-response work uses
  `after()`): exactly two job families — lead SLA timers (`lead-sla.ts`; idempotency key
  `lead-sla-${leadId}-${ruleCode}`, tag-based cancellation, stale-fire guard re-reads the
  lead) and task due reminders (`task-reminders.ts`; cancel-before-delete contract).
  SLA actions run sessionless via admin client (the documented `requireProfile` exception).
- **SLA engine** (business rules in `modules/gia.md`): 8 rules — new 15min/30min,
  touched 24h/36h, in_discussion 24h/36h, nurturing 4 biz-days; A-rules notify the agent and
  auto-create a task, B-rules notify the manager. IST business hours Mon–Sat 09:00–19:00 with
  per-agent shift overrides. Activity refreshes SLA-02/03 only; SLA-01 only ends by leaving
  `new`. Terminal statuses cancel all timers.

## Deeper detail lives in (repo)

`docs/architecture/{overview,database,auth-and-rbac,caching,migrations}.md` ·
`docs/integrations/*` · code-adjacent `CLAUDE.md` files (`src/lib/`, `src/components/`,
`src/app/`, `supabase/migrations/`) · `docs/architecture/database_architecture.sql` (raw dump).
