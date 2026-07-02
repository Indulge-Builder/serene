# Caching

> **Purpose:** the two live caching layers, Upstash Redis cache-aside and React `cache()`, with the key registry, TTLs, and invalidation contracts. (`unstable_cache` currently has zero live call sites; §4 keeps its rules as guidance.)
> **Audience:** engineers. · **Source-of-truth scope:** cache architecture and invariants. Connection/provider setup lives in `../integrations/upstash-redis.md`; exact per-function TTL values are maintained code-adjacent in `src/lib/CLAUDE.md` (services registry).
> **Last verified:** 2026-07-02 against `src/lib/redis.ts`, `src/lib/constants/redis-keys.ts`, `src/lib/services/lead-cache.ts`, `src/lib/services/cache-helpers.ts`, `src/lib/services/tasks-service.ts`, `src/lib/services/intelligence-service.ts`, `src/lib/CLAUDE.md`. Recent changes: the `dashboard:lead-status` / `dashboard:campaigns` keys gained a role segment (`DASHBOARD_PIPELINE_ROLES`, Q-16) and `invalidateLeadCaches` now dels every role variant of the all-time slots (2026-07-02); the Elaya "Jarvis" reads run on the admin client with NO Redis cache-aside (live every turn, the always-live posture §2 already describes); `/oversight` reads are uncached (live `task_events` rails); `ad-spend-service` (recharges) stays always-live (no Redis, §2). `task:personal page-1` bumped to a `…:v2` key (0145 widened the row shape) — same namespace, retire-on-read.

---

## 1. The pattern — cache-aside, read-through

Read services check Redis first; on a miss they query Postgres, write the result back with a
TTL, and return it. **Postgres is always the source of truth** — a cold cache is correct, just
slower. Every Redis call is wrapped so an outage degrades to direct Postgres reads, never a
user-facing error.

- **Client:** `src/lib/redis.ts` exports a single `redis = Redis.fromEnv()` — the only Upstash
  instance in the app.
- **Keys + TTLs:** `src/lib/constants/redis-keys.ts` (`REDIS_KEYS`, `buildLeadListKey()`,
  `REDIS_TTL`, `TASK_*_TTL`, `PERF_*_TTL`) is the **only** source of key strings and TTL
  values. No inline key strings or magic TTL numbers anywhere else.
- **Envelope helper:** `withRedisCache(key, ttl, fetchFn, normalize?)` in
  `src/lib/services/cache-helpers.ts` is THE structural cache-aside envelope (dry-audit D1).
  It owns the get → catch → fetch → setex → catch boilerplate; Redis failure is non-fatal on
  both sides. Adopted across `dashboard-service.ts`. Never hand-roll the boilerplate in a
  new service.

## 2. Key registry (by namespace)

| Namespace | Service | TTL | Invalidation |
| --------- | ------- | --- | ------------ |
| `lead:list:*` | `leads-service.getLeadsByRole` | 30s | **Version counter** — `INCR lead:list:v:{role}:{domain}` on any lead mutation atomically voids all list pages (no SCAN). Key includes `role + callerDomain + userId + filterHash + v{N}` |
| `lead:row:slug` / `lead:row:id` | `getLeadBySlug` / `getLeadById` | 120s | **Explicit `del` of BOTH keys** on every lead-row mutation when slug is non-null (dual-key invariant, §4) |
| `lead:notes` / `lead:activities` | `getLeadNotesFull` / `getLeadActivitiesFull` | 120s | Explicit `del` on note/activity write |
| `lead:filter-options` | `getLeadFilterOptions` | 300s | TTL-only |
| `dashboard:*` | `dashboard-service` (status, volume, multi-domain, campaigns, agent-tasks) | 30–120s | Keys are date-range-namespaced (`from:to`). `dashboard:lead-status` and `dashboard:campaigns` are ALSO role-scoped (`{role}:{domain}:{from}:{to}`, role ∈ `DASHBOARD_PIPELINE_ROLES` = manager/admin/founder, Q-16), and their **all-time slots are explicitly deleted** by `invalidateLeadCaches`' dashboard scope (loops every role variant). The *volume* keys stay TTL-only: a del cannot enumerate their date ranges |
| `task:*` | `tasks-service` (gia 60s, personal page-1 30s, group-list 120s) | 30–120s | Explicit `del` on task writes; `task:group-list` is **user-scoped** (flat-visibility migration 0058b) — on subtask assignment both the caller's and the assignee's keys are deleted. Subtasks and remarks are NOT Redis-cached: `getGroupSubtasks`/`getTaskRemarks` use React `cache()` per-request memoisation only |
| `helpdesk:cases:{domain}` | `intelligence-service.getHelpdeskLibrary` | 3600s (`REDIS_TTL.HELPDESK_CASES`) | Explicit `del` of `helpdeskCases(domain)` on every case/hook write — `actions/intelligence.ts` awaits the del before `revalidatePath('/helpdesk')`. One `{ cases, hooks }` envelope per domain; partial reads never cached. The dossier reads (`getCasesForLead`/`getHooksForCategories`) are deliberately un-cached |
| `presence:{userId}` | `usage-service.recordPresence` (write) / `listLivePresence` (read) | 150s (`REDIS_TTL.PRESENCE`) | **TTL-only — never `del`.** The active-time heartbeat (adoption tracking) SETs one key per active user every 60s (`UsagePresence` client gate: tab visible + interacted < 120s); value `{domain,role,ts}`. The 1-min snapshot job (`snapshotUsagePresenceTask`) SCANs `presence:*` (`PRESENCE_KEY_PATTERN`) and appends to `usage_heartbeats`. **No DB write on the heartbeat path** — Redis only, fails open. TTL > the 60s beat so a key survives one missed beat but expires within ~1 snapshot of the user going idle/hidden |

**No `ad-creatives` namespace.** A `campaign:ad-creative:*` cache was added 2026-06-01 and
removed 2026-06-08 (its `void redis.del` was a P-08 bug; the cache was dropped entirely).
`ad-creatives-service.ts` is plain Supabase queries; freshness comes from `revalidatePath`.
Do not re-add it. Likewise the campaign RPC reads (`getCampaignMetrics`,
`getCampaignDetailMetrics`, `getCampaignAgentDistribution`) are always live — there is no
`REDIS_KEYS.campaign.*` namespace.

**No `perf:*` namespace.** `performance-service.ts` is RPC-backed and uses React `cache()` for
per-request memoisation only — there is **no** Redis cache-aside. The `perf:*` row listed here
through 2026-06-11 never existed in code (stale doc, corrected 2026-06-11 in `src/lib/CLAUDE.md`,
removed from this table 2026-06-15). Do not re-add it; `/budget` (`ad-spend-service.ts`) is the
same posture — always-live RPCs, `revalidatePath` freshness, no Redis.

## 3. The non-negotiable rules

### P-08 — `await` the `del` before revalidating

Every `redis.del` in a Server Action is `await`-ed inside a `try/catch` that logs a
`[module-action]`-prefixed warning, **before** `revalidatePath`/`revalidateTag` fires.
`void redis.del().catch()` races the revalidation: an RSC re-render can repopulate Redis from
the DB before the late del lands, which then evicts the *fresh* entry and extends the
stale-serving window. The try/catch keeps Redis failure non-fatal; the await keeps the cache
layer consistent — the two requirements are not in conflict.

### The lead dual-key invariant

Lead rows are cached under **two** keys: `leadRowSlug(slug)` (primary — hit on every slug-based
dossier load) and `leadRowId(leadId)` (UUID fallback only). Any action that mutates a lead row
must delete **both** when `slug` is non-null. Deleting only `leadRowId` is a silent no-op on
normal dossier traffic.

### Both contracts are structural — `invalidateLeadCaches()`

Lead actions never hand-assemble `redis.del` blocks. They call
`invalidateLeadCaches(site, { leadId, slug, domain }, scope)` from
`src/lib/services/lead-cache.ts`, which awaits everything inside the try/catch-warn convention.
Scope flags: `row` (always deletes both row keys), `notes`, `activities`, `lists`
(version-counter INCRs for agent + manager scopes), `dashboard` (all-time lead-status +
campaigns slots, deleted for **every** role in `DASHBOARD_PIPELINE_ROLES` since those keys
are role-scoped). Dashboard *volume* keys are deliberately out of every scope — their read-side
keys embed an ISO `from:to` range a del cannot enumerate; freshness is TTL-only (120s).
Reference call sites: the shared lead-mutation cores in `src/lib/services/lead-mutations.ts`
(`addLeadNoteCore`, `addLeadCallNoteCore`, `updateLeadStatusCore`, `assignLeadCore`; the
actions in `src/lib/actions/leads.ts` delegate to these), plus the direct callers in
`actions/leads.ts`: `bulkUpdateLeads` (two call sites) and `createManualLead`.

### Domain in every scoped key (the Q-16 sibling)

A manager in `concierge` must never receive a cached response built for `finance`. List keys use
the **session-verified `callerDomain`**, never `filters.domain`. User-scoped queries include
`userId`. Redis key isolation was independently verified in
`../audits/security-audit-2026-06.md` §5.

## 4. React `cache()` vs `unstable_cache`

| | React `cache()` | `unstable_cache` |
| --- | --- | --- |
| Scope | One RSC render pass (per-request memoisation) | Cross-request, tag-revalidated |
| Dynamic APIs | Allowed | **`cookies()`/`headers()` forbidden inside the closure** — Next.js throws at runtime |
| Consequence | Required for any service calling `createClient()` (which reads `cookies()`) | Only for queries on the admin client or with no session dependency |

- **Reference for `cache()`:** `getDashboardSummary` in `dashboard-service.ts` — single RPC,
  memoised per request; do not split it back into individual calls.
- **`unstable_cache` has zero live call sites.** `getGroupTasks` (the former reference) migrated
  to React `cache()` + Redis cache-aside (`task:group-list:{userId}`, 120s). Its header comment
  says why: `createClient()` calls `cookies()`, which P-09 forbids inside an `unstable_cache`
  closure. There are also no `revalidateTag` call sites. The P-09 and Q-16 rules stay as
  guidance for any future `unstable_cache` adoption.
- **Key rule (Q-16):** a shared cache key includes every dimension that scopes the result —
  domain for domain-scoped queries, userId for user-scoped ones, and **role** where the query
  result is role-scoped (the 2026-07-02 precedent: `dashboard:lead-status`/`dashboard:campaigns`
  gained a role segment because a manager and an admin on the same domain+range were sharing a
  slot). Omitting a dimension allows cross-scope cache hits. Q-16's live enforcement surface
  today is Redis key scoping (§2 and §3).

## 5. Web Push channel — freshness posture (not a cache layer)

Web Push (VAPID, the `web-push` library, migration 0120) is a **second notification delivery
channel**, not a cache layer — noted here only to be explicit that **none of it is Redis-cached.**
The in-app `notifications` row is the **source of truth**; push is **best-effort**. The fan-out
seam lives inside `createNotification` (`notifications-service.ts`): after the in-app row insert it
calls `dispatchPush` (`push-service.ts`), which **never throws** — if every push send fails the
in-app row still stands. Device `push_subscriptions` are read live via the admin client on each
fan-out and dead endpoints (404/410) are pruned in one batched delete; subscriptions are **never
Redis-cached** (a stale subscription set would mis-route or miss devices). There is no TTL and no
explicit del to reason about here.
