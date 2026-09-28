# Upstash Redis

> **Purpose:** the Redis provider connection, who talks to it, and the failure-tolerance policy.
> **Audience:** engineers. · **Source-of-truth scope:** connection and operational policy only. The key registry, TTLs and invalidation contracts live in `../architecture/caching.md`; do not repeat them here.
> **Last verified:** 2026-09-26 against `src/lib/redis.ts`, `src/lib/constants/redis-keys.ts`, `src/lib/constants/zoho.ts`, `src/trigger/sia-silence.ts`, `src/trigger/usage-snapshot.ts`, and a grep of every `redis` import in `src/`.

---

## Connection

- **One client:** `src/lib/redis.ts` exports `redis`, a lazy Proxy over a memoised
  `Redis.fromEnv()` singleton (`@upstash/redis`, REST transport). Never make another. Building the
  client (and the missing-env-var throw) waits until the first method call instead of the import,
  so the Trigger.dev build scan can import modules that depend on Redis without the secrets
  present. The cost: a misconfigured deploy shows up at the first Redis use, not at boot.
- **Env (server-only, required):** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  (`Redis.fromEnv()` reads exactly these; see `../operations/environments.md`).
- **REST transport:** each command is an HTTPS call, so there is no connection pool to manage on
  Vercel lambdas. Round trips matter instead, which is why the lead list reads its version counter
  and its entry in one `MGET`.
- **Region:** Mumbai, the same as Vercel and Supabase (the 2026-09-16 navigation trace in
  `../changelog.md`).

## Who talks to Redis

| Caller | What it does |
| --- | --- |
| The web app (services and actions on Vercel) | Cache-aside reads and invalidation (`../architecture/caching.md`); the adoption heartbeat SET |
| Trigger.dev: `usage-snapshot.ts` | SCANs `presence:*` every minute and appends to `usage_heartbeats` |
| Trigger.dev: `sia-silence.ts` | Sets and clears the Sia watcher alarm latches (`sia:alert:*`) |
| Trigger.dev: any task that reaches a cached service | Invalidation through the same helpers (for example the lead cores) |

So the two Upstash variables must be set on the Trigger.dev worker as well as on Vercel.

## Failure-tolerance policy

Redis is an optimisation, never a dependency:

- Every Redis call in the services is wrapped so a failure **falls back to a direct Postgres read**
  (or a direct Zoho read). An outage makes pages slower; it never shows an error.
- Write-side failures (`del`, `INCR`, `setex`) are caught and logged with a `[module]`-prefixed
  `console.warn` or `console.error` (P-07, P-08). Non-fatal by contract.
- Nothing in Redis is the source of truth; a flushed cache is always correct once it refills.
- Two uses are state, not cache, and fail differently. The Sia alarm latch: if Redis is down,
  the alarm cannot tell whether it already announced an incident, so an alert may repeat on every
  one-minute tick instead of every ten minutes. The
  Zoho access token: if Redis is down, each process refreshes its own token (one in-flight refresh
  per process), which spends a few more of Zoho's token calls.

## Where everything else is documented

| Topic | Home |
| --- | --- |
| Key namespaces, TTLs, invalidation rules, the dual-key invariant, version counters, what is never cached | `../architecture/caching.md` |
| Key and TTL constants in code | `src/lib/constants/redis-keys.ts`; the Zoho keys in `src/lib/constants/zoho.ts` |
| Per-function cache notes | `src/lib/CLAUDE.md` and `src/lib/services/CLAUDE.md` |
