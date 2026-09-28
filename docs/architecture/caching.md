# Caching

> **Purpose:** the caching layers (Upstash Redis cache-aside, React `cache()`, and a few module-scope memos), with the key registry, TTLs, invalidation contracts, and the list of surfaces that are deliberately never cached.
> **Audience:** engineers. · **Source-of-truth scope:** cache architecture and invariants. Provider setup and failure policy live in `../integrations/upstash-redis.md`; per-function cache notes live code-adjacent in `src/lib/CLAUDE.md` and `src/lib/services/CLAUDE.md`.
> **Last verified:** 2026-09-26 against `src/lib/redis.ts`, `src/lib/constants/redis-keys.ts`, `src/lib/constants/zoho.ts`, `src/lib/services/{cache-helpers,lead-cache,leads-service,tasks-service,task-mutations,dashboard-service,intelligence-service,usage-service,zoho-api,zoho-service,intake-lessons}.ts`, `src/lib/actions/{intelligence,books}.ts`, `src/trigger/sia-silence.ts`, `src/lib/utils/webhook.ts`, and a grep of every `redis` import, `withRedisCache` call and `cache(` in `src/lib/services/`.

---

## 1. The pattern: cache-aside, read-through

A read service checks Redis first. On a miss it asks Postgres (or Zoho), writes the result back
with a TTL, and returns it. **Postgres is always the source of truth**: a cold cache is correct,
just slower. Every Redis call is wrapped so an outage falls back to a direct read, never an error
on screen.

- **One client:** `src/lib/redis.ts` exports `redis`, a lazy proxy over one `Redis.fromEnv()`
  instance. Never make another.
- **Keys and TTLs:** `src/lib/constants/redis-keys.ts` (`REDIS_KEYS`, `buildLeadListKey()`,
  `REDIS_TTL`, `TASK_*_TTL`, `DASHBOARD_PIPELINE_ROLES`, `SIA_ALERT_KINDS`,
  `PRESENCE_KEY_PATTERN`) holds every key string and TTL except Zoho's, which sit beside the rest
  of the Zoho vocabulary in `src/lib/constants/zoho.ts` (`ZOHO_REDIS_KEYS`, `ZOHO_CACHE_TTL`).
  No inline key strings or magic TTL numbers anywhere else.
- **The envelope:** `withRedisCache(key, ttl, fetchFn, normalize?)` in
  `src/lib/services/cache-helpers.ts` is THE cache-aside wrapper (get → fetch on miss → setex; a
  Redis failure on either side is logged and ignored). `dashboard-service.ts` and
  `zoho-service.ts` use it. Older services (`leads-service`, `tasks-service`,
  `intelligence-service`) still hand-write the same shape; a new service must use the envelope.

## 2. Key registry (by namespace)

| Namespace | Written by | TTL | Invalidation |
| --- | --- | --- | --- |
| `lead:list:{role}:{callerDomain}:{userId}:{filterHash}` | `leads-service.getLeadsByRole` | 30 s | **Version counter.** The stored value is `{ v, result }`; the reader fetches the counter `lead:list:v:{role}:{domain}` and the entry in one `MGET` and accepts a hit only when `v` matches. `invalidateLeadCaches` INCRs the **agent** and **manager** counters for the lead's domain, which voids every page for those roles at once. See §6 for admin and founder |
| `lead:list:v:{role}:{domain}` | `lead-cache.ts` (INCR) | none | the counter itself |
| `lead:filter-options:{role}:{domain}:{targetDomain}` | `getLeadFilterOptions` | 300 s | TTL only |
| `lead:row:slug:{slug}` / `lead:row:id:{leadId}` | `getLeadBySlug` / `getLeadById` | 120 s | **Explicit `del` of both** on every lead-row mutation (the dual-key invariant, §3) |
| `lead:notes:{leadId}` / `lead:activities:{leadId}` | `getLeadNotesFull` / `getLeadActivitiesFull` | 120 s | explicit `del` on a note or activity write |
| `dashboard:lead-status:{role}:{domain}:{from}:{to}` | `dashboard-service` | 60 s | role-scoped (Q-16, role ∈ `DASHBOARD_PIPELINE_ROLES`); the all-time slot is deleted for every role by `invalidateLeadCaches`' dashboard scope |
| `dashboard:campaigns:{role}:{domain}:{from}:{to}` | `dashboard-service` | 120 s | same as lead-status |
| `dashboard:lead-volume:{role}:{domain}:{from}:{to}` and `dashboard:lead-volume:multi:{domains}:{from}:{to}` | `dashboard-service` | 120 s | TTL only: a `del` cannot enumerate the date ranges in the key |
| `dashboard:agent-tasks:{userId}` | `dashboard-service` | 30 s | explicit `del` in the task-mutation cores |
| `task:gia:{userId}:{role}:{domain}` | `tasks-service` | 60 s | explicit `del` on task writes |
| `task:personal:page1:{userId}:v2` | `tasks-service` | 30 s | explicit `del` on task writes (the `:v2` suffix retired the pre-0145 row shape) |
| `task:group-list:{userId}` | `tasks-service` | 120 s | explicit `del`; user-scoped, so assigning a subtask deletes both the caller's and the assignee's key. Subtasks and remarks are not in Redis (React `cache()` only) |
| `helpdesk:cases:{domain}` | `intelligence-service.getHelpdeskLibrary` | 3600 s | explicit `del` in `actions/intelligence.ts`, awaited before `revalidatePath('/helpdesk')`. One `{ cases, hooks }` envelope per domain; the dossier reads are not cached |
| `presence:{userId}` | `usage-service.recordPresence` | 150 s | **TTL only, never `del`.** The adoption heartbeat SETs it every 60 s while the tab is visible and in use; the one-minute Trigger.dev snapshot SCANs `presence:*` and appends to `usage_heartbeats`. No database write on the heartbeat path |
| `sia:alert:{kind}` | `src/trigger/sia-silence.ts` | 600 s | the watcher-alarm latch per kind (`down`, `session_lost`, `unreachable`, `quiet`); its value is the escalation tier. While it lives, no repeat alert; when it expires, a reminder goes out. Recovery deletes every kind |
| `sia:alert:{kind}:since` | `src/trigger/sia-silence.ts` | none | first-detected time; drives the one-hour founder escalation; deleted on recovery |
| `zoho:books:token:v1` | `zoho-api.ts` | 3540 s | the Zoho OAuth access token (Zoho issues 3600 s). A module memo also keeps one in-flight refresh per process |
| `zoho:books:overview:v1` | `zoho-service.getBooksOverview` | 300 s | explicit `del` by `refreshBooksOverviewAction` (admin/founder, `actions/books.ts`) before `revalidatePath` |
| `zoho:books:client:{zohoCustomerId}:v1` | `zoho-service.getMemberFinance` | 60 s | explicit `del` by `refreshMemberFinanceAction` before `revalidatePath` |

Two of these are written from Trigger.dev, not from the web app: the presence SCAN (the usage
snapshot task) and the Sia alarm latches. Those tasks need the Upstash env vars on the
Trigger.dev worker too.

## 3. The non-negotiable rules

### P-08: `await` the `del` before revalidating

Every `redis.del` in a server action or mutation core is awaited inside a `try/catch` that logs a
`[module]`-prefixed warning, **before** `revalidatePath` fires. A `void redis.del().catch()` races
the revalidation: a re-render can refill Redis from the database before the late `del` lands, and
the `del` then evicts the fresh entry. The try/catch keeps Redis failure non-fatal; the await keeps
the order. The two do not conflict.

### The lead dual-key invariant

A lead row is cached under **two** keys: `leadRowSlug(slug)` (hit on every slug-based dossier
load) and `leadRowId(leadId)` (the UUID fallback). A mutation must delete **both** when the lead
has a slug. Deleting only the id key is a silent no-op on normal dossier traffic.

### Both are structural: `invalidateLeadCaches()`

Lead writes never hand-assemble `del` blocks. They call
`invalidateLeadCaches(site, { leadId, slug, domain }, scope)` from
`src/lib/services/lead-cache.ts`, which awaits every operation inside the try/catch convention.
Scopes: `row` (both row keys), `notes`, `activities`, `lists` (INCR the agent and manager
counters for the lead's domain), `dashboard` (the all-time lead-status and campaigns slots, for
every role in `DASHBOARD_PIPELINE_ROLES`). Dashboard volume keys are outside every scope on
purpose. Callers: four shared cores in `lead-mutations.ts` (`addLeadNoteCore`,
`addLeadCallNoteCore`, `updateLeadStatusCore`, `assignLeadCore`), which the actions in
`actions/leads.ts` and Elaya's write tools both call; the direct action callers `bulkUpdateLeads`
and `createManualLead`; and the ingestion paths (`ingestLead` and its repeat-enquiry branch in
`lead-ingestion.ts`, `processInboundMessage` in `whatsapp-ingestion.ts`).

### Every scoping dimension in the key (Q-16)

A shared key includes every dimension that scopes the result: domain for domain-scoped reads,
`userId` for user-scoped ones, and **role** where the result depends on role (the 2026-07-02
precedent: the dashboard pipeline keys gained a role segment after a manager and an admin on the
same domain and range were found sharing a slot). Lead list keys use the session-verified
`callerDomain`, never `filters.domain`.

### Build a cached value with a client that can read it

A value cached for everyone must be built with a client that sees the rows. On 2026-09-26 the
helpdesk library, called from Elaya off-session, was being read as `anon` (which RLS answers with
nothing) and that empty result was cached for an hour for every user. `getHelpdeskLibrary` now
takes an optional client and `elaya-data.ts` passes the admin client.

## 4. Deliberately never cached

These read live every time. Do not add Redis to them without a reason in the changelog.

| Surface | Why |
| --- | --- |
| Campaign reads (`getCampaignMetrics` and the detail RPCs), `ad-creatives-service.ts` | A `campaign:ad-creative:*` cache existed 2026-06-01 to 06-08; its `void del` was a P-08 bug and the cache was removed. Freshness comes from `revalidatePath` |
| `performance-service.ts` | RPC-backed; React `cache()` per request only. A `perf:*` namespace never existed in code |
| `/budget` (`ad-spend-service.ts`, `domain-targets-service.ts`) | Always-live RPCs |
| Elaya reads (`elaya-data.ts`) and the analyst door | Live every turn, on the admin client |
| Members, tickets, Sia, Freshdesk, vendors, subscriptions, the pulse, the activity feed | Live reads (the Freshdesk overview is one RPC scan; the Sia chat polls every 4 s) |
| Oversight | Live `task_events` rails |
| Web Push subscriptions | Read live per fan-out; a stale device list would mis-route. The in-app `notifications` row is the truth; push is best effort (`../modules/web-push.md`) |

## 5. Per-request and per-process memos

| Layer | Scope | Where it is used |
| --- | --- | --- |
| React `cache()` | one server render pass | `profiles-service` (`getCurrentProfile`, memoised for the layout, page and children), `tasks-service`, `performance-service`, `dashboard-service` (`getDashboardSummary`), `leads-service`, `members-service`, `tickets-service`, `notification-prefs-service` |
| `unstable_cache` | cross-request | **none in `src/`**. Any service that calls `createClient()` reads `cookies()`, which Next.js forbids inside an `unstable_cache` closure (P-09). The rules stay as guidance for a future adoption: key per Q-16, revalidate with `revalidateTag(tag, { expire: 0 })` |
| Module-scope memo | one warm lambda or worker | `intake-lessons.ts` keeps the approved lesson per kind for 5 minutes (`LESSON_CACHE_MS`; cleared on approval in that process); `zoho-api.ts` keeps one in-flight token refresh; `createRateLimiter()` (`utils/webhook.ts`) counts hits in an in-memory map per instance; `getClaims()` keeps the JWKS per process |

A module-scope memo is per instance, not shared: two lambdas can hold different copies for up to
the memo's lifetime. Use one only where that is harmless.

## 6. Known gaps

- **Admin and founder lead lists refresh on the TTL only.** `invalidateLeadCaches` bumps the
  agent and manager counters; the admin and founder list pages validate against
  `lead:list:v:admin:{domain}` and `lead:list:v:founder:{domain}`, which nothing bumps. So their
  list pages can lag a write by up to 30 s. TODO: verify whether this is intended.
- The older hand-written cache-aside blocks in `leads-service`, `tasks-service` and
  `intelligence-service` predate `withRedisCache`; they behave the same but are three more places
  to keep in step.
