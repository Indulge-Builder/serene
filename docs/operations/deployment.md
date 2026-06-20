# Deployment

> **Purpose:** how Serene is built and deployed — providers, build commands, runtime constraints.
> **Audience:** engineers/ops. · **Source-of-truth scope:** deployment topology and commands. Env vars: `environments.md`.
> **Last verified:** 2026-06-20 against `package.json`, `trigger.config.ts`, `src/trigger/` (five files), route `maxDuration` exports.

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

- **`maxDuration = 60`** is exported by both webhook routes (`api/webhooks/leads`,
  `api/webhooks/whatsapp`) so `after()`-deferred notification sends aren't killed by the
  default lambda timeout. Any new route that carries outward sends in `after()` must export it
  too (A-16).
- **Trigger.dev `maxDuration: 300`** (trigger.config.ts) bounds job runtime.
- **Migrations before code** when a deploy includes both (the 0098–0101 pattern: new SQL
  signatures are defaults-supersets so old code keeps working against the new DB; the reverse
  degrades).
- **Webhook routes bypass the session proxy** (matcher exclusion + early return) — external
  POSTs must never trigger Supabase session refresh.

## Deploy checklist

1. `pnpm tsc --noEmit` clean.
2. `pnpm build` clean (token guard included).
3. Apply pending migrations (`supabase/migrations/`) — never edit applied ones (A-14).
4. Verify env registry parity (`environments.md`) in the Vercel project.
5. `pnpm trigger:deploy` if `src/trigger/` or `trigger.config.ts` changed.
6. `docs/changelog.md` entry exists for the change (Q-06a).
