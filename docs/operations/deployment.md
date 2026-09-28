# Deployment

> **Purpose:** how Serene is built and shipped today: every deploy target, the commands, the release order for migrations, and how to prove a deploy actually landed.
> **Audience:** engineers and ops. · **Source-of-truth scope:** deployment topology, commands and verification. Env vars: `environments.md`. Job mechanics: `../integrations/trigger-dev.md`. The watcher's own operations (pairing from the /sia console, session reset, number replacement, media): `../integrations/sia-connector.md` and `connector/RUNBOOK.md`.
> **Last verified:** 2026-09-26 against `package.json`, `trigger.config.ts`, `tsconfig.json` excludes, `.vercelignore`, `src/proxy.ts`, every `maxDuration` export under `src/app/api/`, `backend/Dockerfile`, `backend/copilot/api/manifest.yml`, `backend/copilot/watcher/manifest.yml`, `backend/README.md`, `connector/RUNBOOK.md`, and the changelog entries for the AWS foundation (2026-08-27), the schema restructure (2026-09-17), the build breaks (2026-08-29, 2026-09-16, 2026-09-24) and the Trigger.dev key (2026-09-21).

---

## 1. What runs where

| Target | What it runs | How it ships |
| ------ | ------------ | ------------ |
| **Vercel** | the Next.js 16 app: pages, server actions, the API routes. Production alias `indulge-serene.vercel.app` | a push to `main` builds and promotes Production |
| **Supabase** | Postgres 17 (17.6), Auth (including the OAuth server used by the MCP connector), Realtime, Storage. Project ref `xmucqqhbupudnzderchy`. Schemas `public`, `gia`, `member`, `sia`, `freshdesk`, `elaya_read` | migrations from `supabase/migrations/` via the Supabase CLI (§4) |
| **Trigger.dev** | every task in `src/trigger/` (project `proj_xfyyvwjmrumreyvawcwg`) | `pnpm trigger:deploy` (§5) |
| **AWS, Copilot app `serene`, env `prod`, `ap-south-1`** | three ECS Fargate services in one cluster: `api` (the Python brain), `watcher` (the Sia WhatsApp connector) and `voice` (Elaya's LiveKit voice worker, 0247; not yet deployed as of 2026-09-28) | `copilot svc deploy` from `backend/` (§6, §7, §7b) |
| **CloudFront** `E25WKM3MQB2HCY` (`dvoitvfdf56l3.cloudfront.net`) | the HTTPS front on the `api` load balancer | configured by hand, not in the repo |
| **S3** (the `sia-media` addon) | the watcher's media files | Copilot storage addon, `backend/copilot/watcher/addons/sia-media.yml` |
| **Upstash** | Redis over REST | `../integrations/upstash-redis.md` |
| **Gupshup** | the WhatsApp BSP | `../integrations/whatsapp-gupshup.md` |
| **Pabbly** | webhook middleman for Meta, Google and website lead forms | `../integrations/lead-ingestion.md` |
| Freshdesk, Zoho Books, Anthropic, Deepgram | external APIs Serene calls | `../integrations/freshdesk.md`, `../integrations/zoho-books.md` |

**Regions:** everything runs in Mumbai. AWS is `ap-south-1`; Vercel, Supabase and Upstash were
measured in Mumbai by the 2026-09-16 navigation trace (changelog, "Navigation feel"). The repo has
no `vercel.json`, so the Vercel function region is set in the Vercel project settings, not in code.

**Why two AWS services and not one.** The watcher must hold a WhatsApp socket all day, which
neither Vercel nor a laptop can do, and a brain deploy must never drop that socket. So the
watcher is its own service with its own deploy.

## 2. Build and run (pnpm)

| Command | What it does |
| ------- | ------------ |
| `pnpm dev` | Next dev server |
| `pnpm build` | `node scripts/check-tokens.mjs` then `next build`. The design-token guard runs before every build, so an undefined token fails the Vercel build |
| `pnpm start` | production server |
| `pnpm check:tokens` | the token guard alone |
| `pnpm lint` / `pnpm lint:fix` | ESLint (correctness only; not part of the build) |
| `pnpm check:ui` | token guard + the UI control audit + the control contract tests |
| `pnpm trigger:dev` / `pnpm trigger:deploy` | Trigger.dev local runner / deploy (CLI 4.4.6) |
| `pnpm tsc --noEmit` | the typecheck (zero errors policy) |
| `supabase gen types typescript --linked` | regenerate `src/lib/types/database.ts` after a schema change (all schemas) |

**What the Next build leaves out.** `tsconfig.json` excludes `connector`, `backend`, `evals` and
`graphify-out`, and `.vercelignore` keeps those folders (plus data folders and CSVs) out of the
upload. Two reasons (2026-09-16): the Next build must not type-check the Baileys connector, which
has its own dependencies, and the upload has to stay under Vercel's 15,000-file limit.

## 3. Runtime constraints

**API routes and their time limits.** Vercel freezes a function the moment its response is sent,
so any route that keeps working in `after()` exports a `maxDuration` (A-16).

| Route | `maxDuration` | Why |
| ----- | ------------- | --- |
| `api/webhooks/leads` | 60 | the `after()` notification sends |
| `api/webhooks/whatsapp` | 180 | a full Elaya staff turn plus the customer channel inside `after()` |
| `api/webhooks/freshdesk` | 60 | the `after()` re-read of the ticket |
| `api/elaya/chat` | 180 | the SSE stream (sanctioned P-02 exception) |
| `api/elaya/bridge` | 60 | the Python brain's write calls back into the Node cores |
| `api/mcp` | 60 | the MCP connector's tool calls |
| `api/auth/callback`, `api/manifest` | default | short |

- **Trigger.dev** tasks default to `maxDuration: 300` (`trigger.config.ts`); a task can set its own.
- **The session proxy** (`src/proxy.ts`) skips `api/webhooks`, `api/manifest`, `api/mcp`,
  `.well-known`, the manifest, `sw.js`, `offline.html`, `icons/` and `apple-icon`. External POSTs
  and PWA files must never trigger a Supabase session refresh.

## 4. Database migrations (Supabase CLI)

The CLI is linked to the production project. The order that works:

1. `supabase migration list`: see what is pending. `db push` applies EVERY pending file,
   including ones another session has written into the same working tree and not committed.
   Check the list before you push.
2. `supabase db push --dry-run`: see exactly what would apply.
3. `supabase db push` (add `--yes` to answer the prompt; `--include-all` when a pending file is
   dated earlier than the newest applied one).
4. Verify: read back the objects you changed (`supabase db query --linked "<sql>"` for read-only
   checks against `pg_constraint`, `pg_policies`, function definitions). Regenerate
   `database.ts`.

Never edit a migration that has been applied (A-14); write a new one.

**Release order depends on the kind of migration.**

- **Additive** (new table, new column, a function whose new signature is a superset): push the
  migration first, then the code. Old code keeps working against the new database.
- **Move or rename** (a table changes schema or name): the migration and the build are ONE
  release. Old code breaks the instant the SQL commits. On 2026-09-17 both halves of the schema
  restructure went out ahead of their code: 0210 (the `gia` move) at about 13:40 IST, and the
  Python brain answered nothing about leads from 13:41 until its own fix shipped; 0211 (the
  `member` move) at about 15:55 IST with the code at 16:04, so the Sia pages errored for about
  ten minutes. Either push the migration only when the commit is ready to go out right behind
  it, or have the deployment built and promote it the moment the migration lands.
  `scripts/db/row-counts.ts` is the before-and-after row-count proof for a move.

**Everything that reads the database** (all of it must be updated for a move): the Next app
(Vercel), the Trigger.dev tasks (their own bundle), the Python brain (its own PostgREST client,
`backend/app/core/supa.py`, which maps moved tables in `_MOVED_TABLES`), and the one-off scripts.
The watcher touches only `sia.wag_*`.

**Local stack.** `supabase start` builds an empty Postgres 17 from every migration;
`supabase/seed.sql` re-grants table privileges so local matches production (it runs on
`start` / `db reset`, never on `db push`).

## 5. Trigger.dev

`pnpm trigger:deploy` from the repo root (`npx trigger.dev@4.4.6 deploy` is the same). The CLI,
`@trigger.dev/sdk` and `@trigger.dev/build` are pinned together at 4.4.6; a newer CLI refuses the
project. Deploy whenever `src/trigger/`, `trigger.config.ts`, or any service a task imports has
changed: the worker runs its own bundle, so a Vercel deploy does not update the jobs, and a new
schedule does not exist until this deploy. The worker's env vars are set in the Trigger.dev
dashboard, separately from Vercel (`environments.md`).

## 6. The Python brain (Fargate `api`)

The second Elaya brain lives in `backend/app` (FastAPI, Python 3.13 slim image, port 8080) and
runs as the Copilot Load Balanced Web Service `api`: 0.25 vCPU, 512 MB, one task,
`linux/x86_64`, health check `/healthz`. Env and secrets: `environments.md`.

```bash
cd backend
copilot svc deploy --name api --env prod > /tmp/api-deploy.log 2>&1; echo REAL_EXIT=$?
```

Then confirm the RUNNING state (§8): the ECS service shows the new task-definition revision as
PRIMARY with 1 running and 0 failed, and `GET /healthz` answers 200 through CloudFront.

How production reaches it:

- **HTTPS front:** CloudFront `E25WKM3MQB2HCY` (`dvoitvfdf56l3.cloudfront.net`) in front of the
  Copilot load balancer: caching off, all methods, 60 s origin read timeout (the SSE stream must
  keep sending within that window), host header rewritten to the origin. Vercel's
  `ELAYA_BRAIN_URL` points here. The load balancer's own hostname is plain HTTP and must never be
  used from production code (hardening candidate in `maintenance.md`).
- **Shared bearer:** `BRAIN_API_SECRET`, in four places that move together (`environments.md`).
  After an SSM change, force a new deployment so the task re-reads it.
- **Who is on it:** the `elaya_settings` rows `brain_whatsapp` and `brain_in_app` (`node` |
  `python`), read per message. Flip or roll back with one row update, no deploy. Both are on
  `python`.
- **Deploy it after any schema move or rename** (§4).

Smoke after a deploy (no secrets printed; uses the eval manager profile):

```bash
set -a; source backend/.env; set +a
curl -s -N --max-time 60 -X POST https://dvoitvfdf56l3.cloudfront.net/v1/elaya/chat \
  -H "Authorization: Bearer $BRAIN_API_SECRET" -H "Content-Type: application/json" \
  -d '{"user_id":"f70219ad-9b28-479b-98f7-f5f05673ec07","message":"ping, one line please","channel":"whatsapp","wa_message_id":"smoke-'$(date +%s)'"}' \
  | grep -o '"type": "[a-z]*"' | sort | uniq -c
```

Expect one `meta`, some `delta`, one `done`. A 401 means the bearer has drifted between its four
homes. A 403 means the profile id is unknown or inactive.

## 7. The Sia watcher (Fargate `watcher`)

The Copilot Backend Service `watcher` builds `connector/Dockerfile` (the manifest points at
`../connector`): no port, no load balancer, `linux/arm64` (Graviton), 512 CPU / 2048 MB (512 MB
was OOM-killed every 90 seconds by the media backfill on 2026-08-29), one task. Two settings are
load-bearing:

- `deployment.rolling: recreate`: the old task stops before the new one starts. Exactly one
  process may hold the WhatsApp session; two sockets on one session can get the number logged out.
- No volume: the session lives in Postgres (`sia.wag_auth_state`), so the container is disposable
  and a deploy never needs a new QR pairing.

Deploy from `backend/` like the brain: `copilot svc deploy --name watcher --env prod`, with the
same real-exit-code capture. TODO: verify this exact command; the changelog records no watcher
deploy command. A deploy is a short capture gap by design; WhatsApp's offline queue redelivers
what happened meanwhile and the dedup wall makes each redelivery land once. Never run a local
connector while the Fargate task is running (scale it to 0 first; `connector/RUNBOOK.md`).

## 7b. The voice worker (Fargate `voice`)

The Copilot Backend Service `voice` builds `backend/voice/Dockerfile`: no port, no load balancer,
512 CPU / 1024 MB, one task, outbound only (a WebSocket to LiveKit Cloud and HTTP to the brain
over Service Connect at `http://api:8080`). First time: `copilot secret init` for `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `VOICE_TTS_VOICE`, then `copilot svc init --name
voice`. Then, and every time after, from `backend/`: `copilot svc deploy --name voice --env prod`
with the same real-exit-code capture as the brain. More workers = more calls at once
(`count`), not faster calls. The door stays shut until `elaya_settings.voice_enabled` is `true`
and the Next app has the three `LIVEKIT_*` values. Proof: the LiveKit Cloud agents page lists
`elaya-voice`, and a test call shows as `/v1/elaya/chat` turns with `channel: "voice"` in the
brain's logs. Runbook: `backend/voice/README.md`.

## 8. Proving a deploy landed

"Deployed" is unproven until you have read back the running state. Each rule below cost real
downtime or a wrong diagnosis once.

- **Read the real exit code, never a pipe's.** `copilot svc deploy … | tail; echo $?` reports
  `tail`'s status. On 2026-08-29 that hid a failed deploy and made an outage worse. Redirect to a
  file, echo `$?`, then read the file.
- **Check the running task, not the command output.** The cluster runs two services (`api` and
  `watcher`), so the first task ARN in a list can be the wrong one. Read the service's running and
  desired counts, the task-definition revision and memory, and one log line from the new task.
- **Check Vercel for your commit.** Confirm the Production deployment carries the SHA you pushed
  and is Ready. Between 2026-09-21 and 2026-09-24 every production build failed in one second at
  the token guard (a token defined only in another session's uncommitted file) and nothing pushed
  went live, unnoticed for three days.
- **Count real runs after an env change.** The 2026-09-21 Trigger.dev key problem was invisible
  because arms ended in `.catch(() => {})`. After changing a key on Vercel or Trigger.dev, look
  for new runs on the Trigger.dev side.
- **CloudFormation stuck in `UPDATE_ROLLBACK_FAILED`:** `aws cloudformation
  continue-update-rollback --resources-to-skip Service`, wait for `UPDATE_ROLLBACK_COMPLETE`, then
  redeploy with a task size that can survive.
- **Start shell commands with an absolute `cd`.** The working directory persists between commands
  and has sent a script to the wrong path before.

## 9. Deploy checklist

1. `pnpm tsc --noEmit` clean, and `pnpm build` clean (token guard included).
2. Migrations: list, dry run, push, verify (§4). A move or rename ships with its code as one
   release.
3. Env parity: every new var set on each runtime that needs it (`environments.md`), including
   Trigger.dev and SSM, not only Vercel.
4. Push to `main`; confirm the Vercel Production deployment for your SHA is Ready.
5. `pnpm trigger:deploy` if a task or anything it imports changed.
6. `copilot svc deploy --name api --env prod` if `backend/` changed, and always after a schema
   move. `--name watcher` if `connector/` changed.
7. Verify each target's running state (§8).
8. A `docs/changelog.md` entry exists for the change (Rule 12).
