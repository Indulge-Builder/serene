# Upstash Redis

> **Purpose:** the Redis provider connection and failure-tolerance policy.
> **Audience:** engineers. · **Source-of-truth scope:** connection + operational policy only. Key registry, TTLs, and invalidation contracts live in `../architecture/caching.md` — do not duplicate them here.
> **Last verified:** 2026-07-02 against `src/lib/redis.ts`, `src/lib/constants/redis-keys.ts`.

---

## Connection

- **Client:** `src/lib/redis.ts` exports `redis`, a lazy Proxy over a memoised
  `Redis.fromEnv()` singleton (`@upstash/redis`, REST transport). Still the only Upstash
  client instance in the app; never instantiate another. Construction, and the
  missing-env-var throw, is deferred to first method access rather than import, so the
  Trigger.dev build scan can import redis-dependent modules without runtime secrets present.
  Operationally: a misconfigured deploy surfaces at the first Redis use, not at boot.
- **Env (server-only, required):** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  (`Redis.fromEnv()` reads exactly these — see `../operations/environments.md`).
- REST transport means no connection pooling concerns on Vercel lambdas — each command is an
  HTTPS call.

## Failure-tolerance policy

Redis is an optimisation, never a dependency:

- Every Redis call in the services is wrapped so a failure **degrades to a direct Postgres
  read** — a cache outage slows the app down; it never errors to the user.
- Write-side failures (`redis.del`, `INCR`) are caught and logged with a
  `[module-action]`-prefixed `console.warn` (P-07/P-08) — non-fatal by contract.
- Nothing in Redis is the source of truth; a flushed cache is always correct after repopulation.

## Where everything else is documented

| Topic | Home |
| ----- | ---- |
| Key namespaces, TTLs, invalidation rules, dual-key invariant, version counters | `../architecture/caching.md` |
| Key/TTL constants in code | `src/lib/constants/redis-keys.ts` (the only source) |
| Per-function cache annotations | `src/lib/CLAUDE.md` services registry |
