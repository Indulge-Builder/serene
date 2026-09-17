# Deployment

> **Purpose:** how Serene is built and deployed — providers, build commands, runtime constraints.
> **Audience:** engineers/ops. · **Source-of-truth scope:** deployment topology and commands. Env vars: `environments.md`.
> **Last verified:** 2026-07-02 against `package.json`, `trigger.config.ts`, `src/trigger/` (five files), route `maxDuration` exports.

---

## Providers

| Provider | Role | Notes |
| -------- | ---- | ----- |
| **Vercel** | hosts the Next.js 16 app (RSC + Server Actions + the two webhook routes) | lambdas freeze on response flush — the A-16 `after()` contract exists because of this |
| **Supabase** | Postgres 17 + Auth + Realtime + Storage | migrations applied via Supabase CLI from `supabase/migrations/` |
| **Upstash** | Redis (REST) | `../integrations/upstash-redis.md` |
| **Trigger.dev** | delayed jobs + scheduled cron tasks (SLA timers, task reminders, daily lead-revival sweep, usage rollup/snapshot) | project `proj_xfyyvwjmrumreyvawcwg`; `../integrations/trigger-dev.md` |
| **Gupshup** | WhatsApp BSP | `../integrations/whatsapp-gupshup.md` |
| **Pabbly** | webhook middleware for Meta/Google/website lead forms | `../integrations/lead-ingestion.md` |

**Regions:** TODO: verify — Vercel/Supabase/Upstash regions are not recorded anywhere in the
repo. Record them here once confirmed.

## Build & run (pnpm)

| Command | What it does |
| ------- | ------------ |
| `pnpm dev` | Next dev server |
| `pnpm build` | **`node scripts/check-tokens.mjs` then `next build`** — the token-check guard runs before every build; a token violation fails the build |
| `pnpm start` | production server |
| `pnpm check:tokens` | run the token guard alone |
| `pnpm trigger:dev` / `pnpm trigger:deploy` | Trigger.dev local runner / deploy jobs |
| `pnpm tsc --noEmit` | the required post-change typecheck (zero errors policy) |
| `supabase gen types typescript --local` | regenerate `src/lib/types/database.ts` after schema changes |
| `supabase db dump` | refresh `docs/architecture/database_architecture.sql` |

## Runtime constraints

- **`maxDuration`** is exported by three routes: `api/webhooks/leads` at **60**
  (headroom for the `after()`-deferred notification sends), `api/webhooks/whatsapp` at
  **180** (covers the full in-request Elaya staff turn and customer-channel work plus the
  `after()` sends), and `api/elaya/chat` at **180** (the long-running SSE streaming lambda).
  Any new route that carries outward sends in `after()` must export it too (A-16).
- **Trigger.dev `maxDuration: 300`** (trigger.config.ts) bounds job runtime.
- **Migrations before code** when a migration is ADDITIVE (the 0098–0101 pattern: new SQL
  signatures are defaults-supersets so old code keeps working against the new DB; the reverse
  degrades).
- **A migration that MOVES or RENAMES is the opposite case: the migration and the build are ONE
  release.** Old code cannot survive it — the table it asks for is gone the instant the SQL
  commits. Both halves of the 2026-09-17 schema restructure were pushed ahead of their build and
  each took the affected pages down for minutes (0210, then 0211; schema-restructure-plan.md
  §10–§11.1). Either push the migration only when the commit is ready to go out behind it, or
  build the deployment first and promote it the moment the migration lands.
- **Webhook routes bypass the session proxy** (matcher exclusion + early return) — external
  POSTs must never trigger Supabase session refresh.

## Deploy checklist

1. `pnpm tsc --noEmit` clean.
2. `pnpm build` clean (token guard included).
3. Apply pending migrations (`supabase/migrations/`) — never edit applied ones (A-14).
4. Verify env registry parity (`environments.md`) in the Vercel project.
5. `pnpm trigger:deploy` if `src/trigger/` or `trigger.config.ts` changed.
6. `copilot svc deploy --name api --env prod` if `backend/` changed — **and always after a
   schema move**: the Python brain reads tables over PostgREST too (`backend/app/core/supa.py`,
   `_MOVED_TABLES`), so it goes stale exactly like the app does. Both brains serve Elaya
   (`elaya_settings.brain_whatsapp` / `brain_in_app`), so a stale brain means Elaya answers
   nothing about leads.
7. `docs/changelog.md` entry exists for the change (Q-06a).

**Everything that reads the database, for a schema move:** the Next app (Vercel), the
Trigger.dev tasks, the Python brain (Fargate), and the one-off scripts. The Sia watcher
(`connector/`) touches only `sia.wag_*` and is unaffected.

## Python brain (Fargate `api` service)

The second Elaya brain lives in `backend/app` (FastAPI) and runs as the Copilot service
`api` in the `prod` environment, next to the Sia `watcher` service in the same cluster.

Deploy from `backend/`:

```bash
cd backend
copilot svc deploy --name api --env prod > /tmp/api-deploy.log 2>&1; echo REAL_EXIT=$?
```

Read the exit code, not the tail of the log (a piped `| tail` reports tail's status, which
once hid a failed deploy). Then confirm the RUNNING state: the ECS service shows the new
task-definition revision as PRIMARY with 1 running and 0 failed, and `GET /healthz` answers
200 through the HTTPS front.

How production reaches it:

- **HTTPS front:** CloudFront distribution `E25WKM3MQB2HCY` (`dvoitvfdf56l3.cloudfront.net`)
  in front of the Copilot load balancer. Caching disabled, all methods, 60s origin read
  timeout (the SSE stream must keep sending within that window), host header rewritten to
  the origin. Vercel's `ELAYA_BRAIN_URL` points here. The load balancer's own hostname is
  plain HTTP and must never be used from production code.
- **Shared bearer:** `BRAIN_API_SECRET`, in four places that move together (backend/.env,
  .env.local, Vercel prod env, SSM `/copilot/serene/prod/secrets/BRAIN_API_SECRET`). After
  an SSM change, force a new deployment so the task re-reads it.
- **Who is on it:** the `elaya_settings` rows `brain_whatsapp` and `brain_in_app`
  (`"node"` | `"python"`), read per message. Flip or roll back with one row update; no deploy.

Smoke after a deploy (no secrets printed; uses the eval manager profile):

```bash
set -a; source backend/.env; set +a
curl -s -N --max-time 60 -X POST https://dvoitvfdf56l3.cloudfront.net/v1/elaya/chat \
  -H "Authorization: Bearer $BRAIN_API_SECRET" -H "Content-Type: application/json" \
  -d '{"user_id":"f70219ad-9b28-479b-98f7-f5f05673ec07","message":"ping, one line please","channel":"whatsapp","wa_message_id":"smoke-'$(date +%s)'"}' \
  | grep -o '"type": "[a-z]*"' | sort | uniq -c
```

Expect one `meta`, some `delta`, one `done`. A 401 means the bearer has drifted between its
four homes. A 403 means the profile id is unknown or inactive.
