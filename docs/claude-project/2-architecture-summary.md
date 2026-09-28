# Serene: Architecture Summary (Claude Project digest)

> **Purpose:** the system map: the stack, where every piece runs, the API routes, request flow, auth and RBAC (roles, domains, seats), the schemas, caching, background work and the outside services.
> **Audience:** a claude.ai Project chat that cannot read the repo.
> **Source-of-truth scope:** a digest of `docs/architecture/overview.md`, `auth-and-rbac.md`, `database.md`, `caching.md`, `migrations.md` and `docs/integrations/trigger-dev.md`. Tables in depth: `7-data-model.md`. Integrations: `8-integrations-and-jobs.md`. Rules: `6-engineering-rules.md`. Elaya: `5-elaya-jarvis.md`. The concierge side: `12-sia-concierge.md`.
> **Last verified:** not re-checked against code (a digest). Regenerated 2026-09-26 from the docs verified against the code that day (migrations through 0245; production has 0244 applied, 0245 not).

## Tech stack (final; never propose alternatives)

**The web app (`src/`, on Vercel):** Next.js **16.2.6** App Router (the proxy is `src/proxy.ts`; there
is **no** `middleware.ts`) · React **19.2.4** · TypeScript strict (no `any`) · Tailwind v4 + CSS
variables (every colour a token) · Supabase (Postgres 17, Auth, the Supabase OAuth server, Realtime,
Storage) · Upstash Redis (cache-aside) · Trigger.dev SDK v4 · Gupshup (WhatsApp BSP) · Framer Motion
12 (`import { m as motion }`, transform and opacity only) · Recharts 3 (through `useChartTokens()`) ·
React Hook Form + Zod 4 · @dnd-kit · react-grid-layout (the dashboard) · cmdk (the ⌘K palette) ·
lucide-react · date-fns / date-fns-tz · libphonenumber-js · `xlsx` (client-side only) · `web-push`
(VAPID) · `@aws-sdk/client-s3` + presigner (Sia media reads) · `mcp-handler` +
`@modelcontextprotocol/server` 2.x (the MCP connector) · `@anthropic-ai/sdk` (imported by one adapter
file only) · Deepgram (voice, REST) · pnpm.

**The Python brain (`backend/`):** FastAPI + uvicorn + httpx + the `anthropic` SDK, on AWS ECS Fargate
(Copilot app `serene`, env `prod`, service `api`, `ap-south-1`) behind a load balancer with a
CloudFront HTTPS front. Deployed with `copilot svc deploy`.

**The Sia watcher (`connector/`):** Node 22 + Baileys `7.0.0-rc14`, on the same Copilot app as service
`watcher` (one arm64 task, recreate-only deploys), writing to the `sia` schema and to an S3 bucket.

**Tooling:** `pnpm build` = `node scripts/check-tokens.mjs && next build` (the token guard fails the
build on a stray hex or forbidden pattern). `pnpm lint` (ESLint 9 flat config, correctness-only, not
in the build) enforces the `m as motion` import, no `window.confirm`/`alert`, the Supabase import
scoping, the "only `adapters/anthropic.ts` imports the SDK" rule, and refuses an unscoped `.from()` on
a table that moved schema. `pnpm check:ui` runs the token guard, a UI-controls audit and a control
contract test. `pnpm trigger:deploy` ships the background tasks.

**Not dependencies (never assume):** React Query, Sentry, a virtualization library, an embeddings
provider (none chosen; Anthropic has none), text-to-speech, an email provider (auth mail goes through
Supabase's custom SMTP on Brevo), `dotenv` (scripts use `--env-file`).

## Where everything runs

```text
 Meta / Pabbly, website, shop app ─┐   Gupshup ─┐   Freshdesk ─┐       Browser / PWA (staff)
 (lead webhooks)                   │ (WhatsApp) │   (webhook)  │       Outside AI apps (MCP)
                                   ▼            ▼              ▼                │
                ┌───────────────────────────────────────────────────────┐      │
                │ Vercel: Next.js 16 (src/): proxy, RSC pages, actions,   │◀─────┘
                │ nine API routes                                         │
                └──┬──────────┬───────────┬──────────────┬───────────┬────┘
                   ▼          ▼           ▼              ▼           ▼ HTTPS + bearer
               Supabase    Upstash    Trigger.dev    Gupshup,      Python brain (backend/)
               Postgres,   Redis      v4 workers     Anthropic,    ECS Fargate + CloudFront
               Auth +      (cache)    (src/trigger)  Deepgram,     writes and bridged reads come
               OAuth,                                Freshdesk,    back to /api/elaya/bridge
               Realtime,                             Zoho, S3
               Storage  ◀──── Sia watcher (connector/, ECS Fargate): WhatsApp groups → sia.wag_*, media → S3
```

Regions: everything is in Mumbai. The AWS services are in `ap-south-1`; the 2026-09-16 navigation
trace (changelog) measured Vercel, Supabase and Upstash in Mumbai too. No config file in the repo
records the Vercel region; it lives in the Vercel project settings.

**Standing rules of the topology:**

- **Postgres is the one source of truth.** Redis only caches reads, Realtime only pushes changes, a
  cold cache is always correct. Zoho is read live, never stored.
- **Every mutation is a server action or a mutation core**, returning `{ data, error }`.
- **Outward sends that must finish run in `after()` with the send awaited** (A-16): Vercel freezes the
  lambda on response flush (the 2026-06-08 silent WhatsApp loss).
- **"Python thinks, Node mutates."** The Python brain never writes a table itself; writes and the
  reads whose logic lives in Node go through `/api/elaya/bridge` into the same registry, cores, gates
  and PII seam as the Node brain.
- **The watcher never sends a WhatsApp message**, and exactly one watcher holds the session.

## API routes (P-02: these nine and no others)

| Route | Called by | Auth |
| --- | --- | --- |
| `/api/webhooks/leads` | Pabbly, website, shop app (`?source=` meta, google, website or shop_app) | rate limit, raw payload logged, then a Bearer secret per sender (timing-safe) |
| `/api/webhooks/whatsapp` | Gupshup | `x-gupshup-secret`; staff numbers go to Elaya before the lead pipeline |
| `/api/webhooks/freshdesk` | Freshdesk automation rules | `x-freshdesk-webhook-secret`; stores the event, acks, re-reads the ticket in `after()` |
| `/api/auth/callback` | legacy auth links only | code exchange (invites now land on the client page `/auth/callback`) |
| `/api/elaya/chat` | the Elaya chat UI (SSE) | session, `hasElayaAccess`, burst limit, daily cap |
| `/api/elaya/bridge` | the Python brain | `BRAIN_API_SECRET` bearer; the principal is re-read from `profiles` |
| `/api/manifest` | the browser (PWA) | none; static JSON, `?icon=` validated |
| `/api/mcp` | outside AI apps | Supabase OAuth bearer → `profiles`; role in `mcp_audience` and `hasElayaAccess` |
| `/.well-known/oauth-protected-resource` (also under `/api/mcp`) | MCP clients | public discovery document |

The proxy skips session refresh for the webhooks, the manifest, the bridge, `/api/mcp` and
`/.well-known` (none carries a cookie).

**Route groups:** `(auth)` (login, forgot-password, update-password, the invite landing
`/auth/callback`, the OAuth consent page `/oauth/consent`; the one atmospheric surface) ·
`(dashboard)` (every staff page) · `(client)/m` (the phone layer; staff-session gated because customer
auth does not exist yet).

## Request flow (one navigation)

1. **Proxy** (`src/proxy.ts` → `updateSession()`): refreshes the session and checks the token with
   `auth.getClaims()` (a local signature check, no auth-server round trip), sets `x-pathname`.
2. **Root layout:** stamps `data-theme` and `data-neu` on `<html>` from cookies (no flash), mounts
   `<MotionProvider>` and the service worker.
3. **Dashboard layout:** `getCurrentProfile()` (identity from `getClaims()`, authorization from the
   `profiles` row, memoised per request). No profile or inactive → `/login`; `canAccessRoute()` false →
   `/dashboard`. Mounts the shell.
4. **Page (RSC):** a thin orchestrator; header and filter bar, then `<Suspense>`-wrapped async children
   calling `src/lib/services/`. The dashboard streams its widgets through `ui/Await.tsx`.
5. **Interaction:** server actions: `Zod → requireProfile → gate → core or service → invalidate caches
   → revalidatePath → { data, error }`.
6. **Live updates:** Realtime (notifications, task remarks, task events, activity events, the Gia
   WhatsApp tables, `sia.tickets`) or a short poll where Realtime cannot see the rows (the `/sia` chat
   polls every 4 seconds). Known gap: `public.tasks` is not in the Realtime publication, so the group
   workspace's live subtask updates never arrive.

## SSR preference cookies

| Preference | Column | Cookie | What the root layout does |
| --- | --- | --- | --- |
| Theme | `profiles.theme` | `serene-theme` | stamps `data-theme` |
| Appearance (light / dark / system) | `profiles.appearance` (0158) | `serene-appearance` | stamps `data-neu="dark"`; `system` adds a tiny pre-paint script |
| Home-screen icon | `profiles.app_icon` (0121) | `serene-app-icon` | points the manifest at `/api/manifest?icon=<key>` |

Also: `serene-domain` (the admin/founder global domain scope) and `serene-force-desktop` (opts an
admin/founder phone out of the `/m` redirect). `applyAppearanceToDom()` is the only place `data-neu`
flips. All three preferences ride the existing `updateProfile` action.

## Auth and RBAC

- **Authorization reads only `public.profiles`** (A-01), never JWT claims. A role, seat or deactivation
  change takes effect on the next request. Identity comes from `getClaims()`; the `profiles` read that
  follows is never skipped.
- **Roles** (`user_role` enum): `founder` and `admin` (full access; separate so no one role both acts
  and audits), `manager` (their domain), `agent` (in Gia, their own assigned leads), `guest` (reserved;
  Elaya and MCP refuse it).
- **Domains** (`app_domain` enum, nine): concierge, onboarding, finance, marketing, tech, shop,
  business, house, legacy. Lists never mixed: `APP_DOMAINS` (all nine), `GIA_DOMAINS` (onboarding,
  house, shop, legacy), `ELAYA_DOMAINS` (concierge + the four Gia domains), `WORKBENCH_DOMAINS` (tech).
  One domain per user; no grants table.
- **Concierge seats:** `profiles.sia_role` (queen, bishop, genie, joker, joker_head) +
  `profiles.queendom_id`. Queen and joker one per queendom, bishops many (0242), one company-wide Joker
  head with a queen's reach everywhere and no money (0244), nobody changes their own seat (0243). The
  queendom boundary is enforced in RLS (`can_access_member_queendom()`, `member_visible()`), in
  services (`canAccessMember`, `getSiaViewerScope`), in pages and in every Elaya tool. Full detail:
  `12-sia-concierge.md` §2 and §3.
- **The tech workbench** (domain `tech`, any role) reaches every page except `/books`, to test; it
  widens pages only. Actions keep `requireProfile(roles)` and RLS keeps scoping rows, so its writes are
  refused and member and ticket pages show it no rows.
- **Route protection, three layers:** proxy session refresh → layout guard (`canAccessRoute`) → the
  page's own gate. `canAccessRoute` order: admin/founder always; the workbench (except `/books`);
  `/elaya` asks `hasElayaAccess`; `ALWAYS_ALLOWED_PREFIXES` (`/dashboard`, `/profile`, `/helpdesk`,
  `/notes`); then `DOMAIN_ROUTE_MAP[domain]`:

| Domain | Route prefixes |
| --- | --- |
| onboarding, house, shop, legacy | `/leads`, `/deals`, `/tasks`, `/performance`, `/oversight`, `/campaigns`, `/escalations`, `/budget`, `/whatsapp`, `/settings`, `/admin/elaya-training` |
| concierge | `/tasks`, `/members`, `/tickets`, `/sia`, `/freshdesk`, `/vendors` |
| finance, tech | `/tasks`, `/subscriptions`, `/settings` |
| marketing | `/tasks`, `/campaigns`, `/settings` |
| business | `/tasks`, `/leads`, `/deals`, `/campaigns`, `/settings` |

The map grants reachability only; the page gate is the authorization boundary. `DOMAIN_NAV_HIDDEN`
hides reachable pages from a domain's sidebar (concierge: `/helpdesk`, `/tickets`);
`FOUNDER_NAV_PREFIXES` is the founder's curated sidebar. Page gates: `hasElevatedPageAccess` (admin,
founder, workbench), `hasManagerPageAccess` (manager and above), a literal admin/founder check on
`/books`.

- **Feature predicates (one per question, never re-inlined):** `hasElayaAccess`, `getSiaViewerScope`,
  `canAccessMember`, `canSeeMemberFinance`, `canUseMemberVault`, `hasVendorAccess` /
  `hasVendorActionAccess`, `canAccessLead`, `canManageSubscriptions`, `verifyMcpBearer`.
- **Two-layer security:** RLS **and** `requireProfile(roles?)` at the start of every session action
  (A-18); neither trusts the other. Where reads use the admin client (Sia `wag_*`, `freshdesk`, the
  vault, every Elaya read) the code gate is the boundary and the tables stay deny-by-default.
- **SECURITY DEFINER two-tier model (Q-13):** self-scoped RPCs derive scope from `auth.uid()` and keep
  the `authenticated` grant; RPCs that take scope parameters have EXECUTE revoked and run only on the
  admin client (`callAdminRpc` in `rpc-helpers.ts`). Every one pins `search_path` (`public, gia,
  member` since the schema move).
- **Accounts:** profiles are made only by the `on_auth_user_created` trigger; every account is created
  by `createStaffAccountCore()` (admin/founder, or the roster script). The app has no sign-up screen.
  **Open risk:** the trigger copies role, domain, seat and queendom from sign-up metadata, which is safe
  only while public sign-up is off on the live project (checked off on 2026-09-26). Deactivation =
  `is_active = false` plus an auth ban. `profile_audit_log` is append-only but does not yet record seat
  changes.
- **Password reset** is a 6-digit code (link scanners burned single-use links): request → verify (the
  session starts) → update. Invites land on `/auth/callback` signed in, then choose a password.
- **Outside callers:** the webhooks (secrets, timing-safe), the Python brain (bridge bearer), outside AI
  apps (Supabase OAuth tokens, consent at `/oauth/consent`, revocable on `/profile`), Trigger.dev tasks
  (service role, gated by settings rows).

## The database at a glance

One Postgres, several schemas. Cross-schema foreign keys work; **PostgREST embeds across schemas do
not** (PGRST200, a page silently renders empty), which is why cross-schema reads have helpers.

| Schema | Holds | How code reaches it |
| --- | --- | --- |
| `public` | profiles, tasks and their events, notifications, activity, Elaya's tables, vendors, subscriptions, usage, suggestions, the MCP ledger, most RPCs | plain `.from()` |
| `gia` | the 22 Gia tables (leads, deals, SLA, routing, revival, ad spend, the Gupshup WhatsApp tables, the helpdesk library), moved 2026-09-17 (0210) | `giaDb(client)` |
| `member` | the member twin (renamed from clients 0202, moved 0211) | `memberDb(client)` |
| `sia` | the WhatsApp archive (`wag_*`, service-role only), queendoms, tickets, sentinel state, intake cards, draft reviews, lessons, the model-run ledger | `client.schema('sia')` |
| `freshdesk` | the read-only mirror (0193), service-role only | `freshdeskDb()` |
| `elaya_read` | cleaned views for Elaya's read-only SQL (0223), not on the API | only via `public.elaya_run_query()` as the login-less role `elaya_reader` |
| `hands` | the hands layer (0245, **committed, not applied**) | `handsDb()`; unused in production |

Lead-task links across `public.tasks` and `gia.task_gia_meta` go through `gia-task-links.ts`; a moved
table that needs a staff name embeds the read-only `gia.profiles` / `member.profiles` views. The API's
exposed schemas are one role setting that must be restated in full when a schema is added. Real enums:
`user_role`, `app_domain`, `task_module`, `task_event_type`; everything else is text + CHECK mirrored by
a constant. Storage buckets: `avatars`, `ad-creatives`, `elaya-training` (public read); `whatsapp-media`,
`freshdesk-attachments`, `vendor-invoices`, `subscription-invoices`, `suggestions` (private, signed
URLs). Sia media lives in S3, not Supabase Storage. Table by table: `7-data-model.md` and
`docs/architecture/database.md`. Migrations: `docs/architecture/migrations.md` (never edit one that has
run; pick the number last, other sessions write migrations in parallel).

## Caching

1. **Upstash Redis, cache-aside.** Read services check Redis, fall back to Postgres (or Zoho) and write
   back with a TTL; a Redis failure degrades to a direct read, never an error. One client
   (`src/lib/redis.ts`); every key and TTL in `constants/redis-keys.ts` (Zoho's in `constants/zoho.ts`).
   The envelope is `withRedisCache()` in `services/cache-helpers.ts`.
   - `lead:list:*` 30 s, voided by a per-role/domain **version counter**; `lead:row:slug` +
     `lead:row:id` 120 s under the **dual-key invariant**, always through `invalidateLeadCaches()`;
     lead notes and activities 120 s; filter options 300 s.
   - `dashboard:*` 30 to 120 s (role-scoped keys; date-range keys are TTL-only); `task:*` 30 to 120 s;
     `helpdesk:cases:{domain}` 1 hour.
   - `presence:{userId}` 150 s (the adoption heartbeat, TTL only); `sia:alert:{kind}` 600 s (the
     watcher-alarm latch); `zoho:books:token` 3540 s, `zoho:books:overview` 5 min,
     `zoho:books:client:{id}` 1 min.
   - **Never cached:** campaigns, ad creatives, budget, subscriptions, members, tickets, Sia, Freshdesk,
     vendors, and the WhatsApp conversation list (Realtime keeps it live).
   - **P-08:** every `redis.del` in an action is awaited in try/catch **before** `revalidatePath`.
2. **React `cache()`**: per-request memo; required for anything that calls `createClient()` (it reads
   `cookies()`).
3. **`unstable_cache`**: cross-request, tag-revalidated; forbidden if the closure touches `cookies()`
   (P-09); the key must include every scoping dimension (Q-16). `revalidateTag(tag, { expire: 0 })`.

## Background work (Trigger.dev v4)

18 files in `src/trigger/` define **26 tasks**. Most read a settings row before working, so a schedule
can be deployed switched off. IST schedules use `Asia/Calcutta` (Trigger.dev rejects `Asia/Kolkata`).

| Kind | What runs |
| --- | --- |
| Delayed, one run per record | lead SLA timers; task due-soon, reminder, overdue check and repeat nudges |
| Every minute | Freshdesk sync, ticket intake, the ticket sentinel, the Sia watcher alarm, the usage presence snapshot |
| Every few minutes or hourly | vendor extractor (5 min), Elaya's alert sweep (5 min), member profiler (10 min), staff WhatsApp link (15 min), usage rollup (15 min), member pulse (hourly) |
| Daily or weekly (IST) | lead revival (02:00; comments that say 07:30 are wrong), label refresh (05:30), the two briefs (10:00, 18:00), nightly usage rollup (00:20), member judgement (Sunday 04:00), lesson writer (Monday 06:00) |
| On demand | the deep read, one member judgement, one lesson draft |

Tasks that send WhatsApp or read Zoho need those variables on the Trigger.dev worker, not only on Vercel
(open check in `docs/TODO.md`). Inventory: `8-integrations-and-jobs.md`, `docs/integrations/trigger-dev.md`.

## Outside services

| Service | Used for |
| --- | --- |
| Gupshup | the company WhatsApp number: the Gia inbox, 13 notification templates, Elaya's staff channel, the customer welcome |
| Pabbly, website, shop app | lead ingestion |
| Freshdesk API | the read-only mirror |
| Zoho Books API | `/books` and member finance, read only |
| Anthropic | every model call, through the provider-neutral layer; models are `llm_providers` rows (routing, reasoning, heavy) |
| Deepgram | voice transcription (Nova-2, `hi-Latn`); audio never stored |
| Web Push (VAPID) | push to subscribed devices, a second channel inside `createNotification()` |
| AWS S3 | Sia media (the watcher writes, the app presigns 15-minute reads) |
| Supabase OAuth server | outside AI apps sign in for the MCP connector |

## Deeper detail (repo)

`docs/architecture/{overview,auth-and-rbac,database,caching,migrations,schema-restructure-plan}.md` ·
`docs/modules/*` · `docs/integrations/*` · `docs/operations/{environments,deployment,maintenance}.md` ·
the code-adjacent `CLAUDE.md` files (`src/lib/`, `src/lib/actions/`, `src/lib/services/`,
`src/lib/elaya/`, `src/components/`, `src/app/`, `supabase/migrations/`) · `backend/README.md` and
`connector/README.md` (both describe an older state; the docs above are current).
