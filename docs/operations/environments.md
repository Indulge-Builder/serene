# Environments and Env Vars

> **Purpose:** the complete registry of environment variables: name, purpose, where the code reads it, how exposed it is, and which runtimes must carry it. **Never values.**
> **Audience:** engineers and ops. · **Source-of-truth scope:** the env var registry. How each runtime is deployed: `deployment.md`.
> **Last verified:** 2026-09-26 against `grep process.env` over `src/` (38 names) and `scripts/`, the `env()` helper in `src/lib/services/zoho-api.ts`, `backend/app/config.py`, `backend/copilot/api/manifest.yml`, `backend/copilot/watcher/manifest.yml`, `connector/src/config.ts`, `trigger.config.ts`, and `.env.example`.

---

## Rules (S-10 / S-11)

- Anything ending `_KEY`, `_SECRET` or `_TOKEN` is server-only. The `NEXT_PUBLIC_` prefix is only
  for values that are genuinely public; Next inlines them into the browser bundle at build time.
- Secrets never appear in logs, client bundles, docs or chat.
- `.env.local` is never committed; `.env.example` is always committed and lists names only.
- Read a secret on first use, never at module load with a throw. The Trigger.dev build evaluates
  every module on a task's import chain without the runtime secrets (`../integrations/trigger-dev.md` §2).

## Where env lives (the homes)

| Home | What runs there | How it is set |
| ---- | --------------- | ------------- |
| **Vercel** (Production) | the Next app: pages, server actions, the API routes | Vercel project settings. Values marked Sensitive cannot be read back with `vercel env pull` |
| **Trigger.dev** (prod environment) | every task in `src/trigger/` | Trigger.dev dashboard, project `proj_xfyyvwjmrumreyvawcwg`. Separate from Vercel: a var set on Vercel is NOT visible to the jobs |
| **Fargate `api`** (the Python brain) | `backend/` FastAPI | `variables:` in `backend/copilot/api/manifest.yml`, secrets from SSM `/copilot/serene/prod/secrets/<NAME>` |
| **Fargate `watcher`** (the Sia connector) | `connector/` Baileys watcher | `variables:` and SSM secrets in `backend/copilot/watcher/manifest.yml`, plus the S3 addon's output |
| **Local** | `pnpm dev`, scripts, a local connector | `.env.local` at the repo root (the connector reads it too), `backend/.env` for the brain |

## The Next app (`src/`)

"Runtimes" says where the var must be set for production to work. V = Vercel, T = Trigger.dev
worker, L = local only.

| Variable | Exposure | Purpose | Read in | Runtimes |
| -------- | -------- | ------- | ------- | -------- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL | the four `lib/supabase/*` client files, `lib/mcp/metadata.ts` (the OAuth issuer), `elaya/tools/customer-registry.ts` (public media URLs) | V, T |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (RLS-bound) | `lib/supabase/client.ts`, `server.ts`, `middleware.ts` | V |
| `SUPABASE_SERVICE_ROLE_KEY` | server | service-role key, bypasses RLS | `lib/supabase/admin.ts` only | V, T |
| `NEXT_PUBLIC_SITE_URL` | public | canonical site origin | `lib/actions/profiles.ts` (password-reset `redirectTo`), `lib/mcp/metadata.ts` (the MCP resource URL) | V |
| `PABBLY_WEBHOOK_SECRET` | server | Bearer token for `POST /api/webhooks/leads` from Pabbly | `api/webhooks/leads/route.ts` | V |
| `SHOP_APP_WEBHOOK_SECRET` | server | Bearer token for the same route when `source=shop_app`; separate so either sender can be rotated alone | `api/webhooks/leads/route.ts` | V |
| `UPSTASH_REDIS_REST_URL` | server | Upstash REST endpoint | `lib/redis.ts` (lazy, first use) | V, T |
| `UPSTASH_REDIS_REST_TOKEN` | server | Upstash REST token | `lib/redis.ts` | V, T |
| `ANTHROPIC_API_KEY` | server | the model API for every AI call on the Node side | `lib/elaya/adapters/anthropic.ts` (the only `@anthropic-ai/sdk` import) | V, T |
| `DEEPGRAM_API_KEY` | server | voice-note transcription | `services/transcription-service.ts` (the only Deepgram call site; the media reader calls it from Trigger.dev since 0246) | V, T |
| `ELAYA_BRAIN_URL` | server | where Node reaches the Python brain. Production must be `https://` (the CloudFront front); an `http://` value is refused in production | `lib/elaya/python-brain.ts` | V |
| `BRAIN_API_SECRET` | server | the shared bearer in both directions: Node to the brain, and the brain's write calls back to `/api/elaya/bridge` | `lib/elaya/python-brain.ts`, `api/elaya/bridge/route.ts` | V (and the brain, below) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | server | the LiveKit Cloud project for Elaya's voice channel (0247): the action mints room tokens with them. `LIVEKIT_URL` must be `wss://` in production. The same three live in SSM for the `voice` worker | `services/elaya-voice-service.ts` (the only token mint) | V (and the voice worker, below) |
| `ELAYA_BRAIN_OVERRIDE_IN_APP` / `ELAYA_BRAIN_OVERRIDE_WHATSAPP` | server | test seam: `node` or `python` overrides the `brain_*` settings rows so the eval harness can drive a local brain. Ignored when `NODE_ENV` is `production` | `services/llm-providers-service.ts` | L |
| `VAPID_PUBLIC_KEY` | server | Web Push VAPID public key | `services/push-service.ts` | V, T |
| `VAPID_PRIVATE_KEY` | server | Web Push VAPID private key | `services/push-service.ts` | V, T |
| `VAPID_SUBJECT` | server | VAPID contact (`mailto:`) | `services/push-service.ts` | V, T |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | the same public key for the browser's `pushManager.subscribe` | `hooks/usePushSubscription.ts` | V (build time) |
| `GUPSHUP_API_KEY` | server | Gupshup auth (`apikey` header) | `services/whatsapp-api.ts` | V, T |
| `GUPSHUP_APP_NAME` | server | Gupshup app name | `services/whatsapp-api.ts` | V, T |
| `GUPSHUP_PARTNER_NUMBER` | server | the business WhatsApp number | `services/whatsapp-api.ts` | V, T |
| `GUPSHUP_WEBHOOK_SECRET` | server | `x-gupshup-secret` on `POST /api/webhooks/whatsapp`. Also part of the send guard: `assertGupshupConfigured()` refuses to send unless all four `GUPSHUP_*` are set | `api/webhooks/whatsapp/route.ts`, `services/whatsapp-api.ts` | V, T |
| `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` | server | the approved customer welcome template; unset = the welcome is skipped | `constants/whatsapp.ts` (read at module load, a sentinel default, no throw) | V |
| `WHATSAPP_ACCESS_TOKEN` | server | Meta Cloud API token, **dormant path** | `services/whatsapp-api.ts` (optional) | V (optional) |
| `WHATSAPP_WEBHOOK_SECRET` | server | Meta webhook signature secret, dormant | `services/whatsapp-api.ts` (optional) | V (optional) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | server | Meta GET hub-challenge verify token | `services/whatsapp-api.ts` | V (optional) |
| `WHATSAPP_DEBUG_MEDIA` | server | `true` turns on inbound media debug logs | `api/webhooks/whatsapp/route.ts` | V (optional) |
| `FRESHDESK_DOMAIN` | server | the Freshdesk account host | `services/freshdesk-api.ts` | V, T |
| `FRESHDESK_API_KEY` | server | a personal agent API key, tied to that agent's Freshdesk account | `services/freshdesk-api.ts` | V, T |
| `FRESHDESK_WEBHOOK_SECRET` | server | `x-freshdesk-webhook-secret` on `POST /api/webhooks/freshdesk` | `api/webhooks/freshdesk/route.ts` | V |
| `ZOHO_CLIENT_ID` | server | Zoho Books OAuth client | `services/zoho-api.ts` | V, T |
| `ZOHO_CLIENT_SECRET` | server | Zoho Books OAuth secret | `services/zoho-api.ts` | V, T |
| `ZOHO_REFRESH_TOKEN` | server | Zoho OAuth refresh token (read only scope) | `services/zoho-api.ts` | V, T |
| `ZOHO_ORGANIZATION_ID` | server | the Zoho Books organisation | `services/zoho-api.ts` | V, T |
| `ZOHO_ACCOUNTS_HOST` | server | optional accounts host override (default `accounts.zoho.in`, the India data centre) | `services/zoho-api.ts` | V, T (optional) |
| `MEMBER_VAULT_KEY` | server | AES-256-GCM key for the member vault (32 bytes, base64). Lives only in the app environment, never in the database | `utils/vault-crypto.ts` | V |
| `MEMBER_VAULT_KEY_VERSION` | server | the version number stamped on new ciphertexts | `utils/vault-crypto.ts` | V |
| `MEMBER_VAULT_KEY_PREVIOUS` | server | the previous key, kept during a rotation so old rows still open | `utils/vault-crypto.ts` | V (during a rotation) |
| `SIA_S3_ACCESS_KEY_ID` | server | a read-only IAM identity for the Sia media bucket (presigned URLs on the page, downloads in the media reader) | `services/sia-media-store.ts` | V, T, L |
| `SIA_S3_SECRET_ACCESS_KEY` | server | its secret | `services/sia-media-store.ts` | V, T, L |
| `SIA_S3_REGION` | server | bucket region, default `ap-south-1` | `services/sia-media-store.ts` | V, T, L (optional) |
| `WAG_MEDIA_DIR` | server | the on-disk media root for pre-S3 rows (default `connector/media`) | `services/sia-service.ts` | L |
| `TRIGGER_SECRET_KEY` | server | Trigger.dev SDK auth for arming and cancelling runs from the app. Production must hold the `tr_prod_…` key; the `tr_dev_…` key arms runs in DEV, which production workers never run. Read by the SDK, not by name in `src/` | the Trigger.dev SDK | V (prod key), L (dev key) |
| `NODE_ENV` | runtime | standard | `supabase/client.ts`, `python-brain.ts`, `llm-providers-service.ts`, `ServiceWorkerRegistration.tsx` (the service worker registers in production only), `ui/Table.tsx` | all |

**Why the Sia media vars are not called `AWS_*`.** direnv exports `.env.local` into the shell. An
`AWS_ACCESS_KEY_ID` there silently replaces the operator's own AWS credentials with this read-only
identity and breaks every `aws` command in the repo (it happened once). When unset, the S3 client
falls back to the default AWS chain. Vercel has no AWS task role, so media on the deployed `/sia`
needs credentials in the Vercel env. TODO: verify whether Vercel carries the `SIA_S3_*` pair or
standard `AWS_*` keys.

**Which Trigger.dev tasks need what.** Every task needs the Supabase URL and service-role key.
On top of that: `ANTHROPIC_API_KEY` for the revival gate, profiler, intake, sentinel, vendor
extractor, brief, alerts, deep read, lesson writer and member judgement; `GUPSHUP_*` for anything
that sends WhatsApp (SLA fires, task reminders and nudges, the Sia alarm, the brief, alerts);
`VAPID_*` for push from any job that calls `createNotification`; `UPSTASH_*` for the Sia alarm
latches, the usage snapshot and cache invalidation; `FRESHDESK_DOMAIN` + `FRESHDESK_API_KEY` for
`freshdesk-sync`; `ZOHO_*` for the money section of the brief (without them the brief leaves
money out). A missing var fails quietly inside a job (a skipped send, a disabled push, a no-op
sync), so check the worker's env whenever a background feature "does nothing".

Verified 2026-09-28 with the envvars SDK **and a personal access token** (a `tr_dev_` secret key
answers for DEV whatever environment you name, which misled the first check): the Trigger.dev prod
environment holds `ANTHROPIC_API_KEY`, the two Supabase vars, the four `GUPSHUP_*`, the three
`FRESHDESK_*`, the two `UPSTASH_*`, and since that day the three `SIA_S3_*` and `DEEPGRAM_API_KEY`
(the media reader skipped every Sia file and every voice note without them). **Still missing there:
`VAPID_*` (push from jobs is a no-op) and `ZOHO_*` (the brief leaves money out).** Adding a variable
is one script run, `scripts/.probe/trigger-envvars.ts NAME…`, with `TRIGGER_ACCESS_TOKEN` set from
the CLI login (`~/Library/Preferences/trigger/config.json`), never the dev secret key; a new value
applies on the next run. `media-reader` and `media-redo` (0246) need `ANTHROPIC_API_KEY`,
`DEEPGRAM_API_KEY` and the `SIA_S3_*` trio.

## The Python brain (`backend/`)

Settings come from `backend/app/config.py` (pydantic-settings; field names map to upper-case env
names; locally from `backend/.env`).

| Variable | Purpose | Set in prod by |
| -------- | ------- | -------------- |
| `ENV` | `production` on Fargate (also baked into the Dockerfile) | manifest `variables` |
| `SUPABASE_URL` | the Supabase project URL | manifest `variables` |
| `SUPABASE_SERVICE_ROLE_KEY` | its own PostgREST client (`app/core/supa.py`) | SSM secret |
| `ANTHROPIC_API_KEY` | the brain's model calls | SSM secret |
| `BRAIN_API_SECRET` | the shared bearer; empty = every brain endpoint refuses (fails closed) | SSM secret |
| `WEB_APP_URL` | the Next app, for the write bridge (`/api/elaya/bridge`); prod `https://indulge-serene.vercel.app` | manifest `variables` |

**`BRAIN_API_SECRET` lives in four places that move together:** `backend/.env`, `.env.local`,
Vercel Production, and SSM `/copilot/serene/prod/secrets/BRAIN_API_SECRET`. Drift makes the
brain's calls 401 (it happened on 2026-08-30). After an SSM change, force a new `api` deployment
so the task re-reads it. See `maintenance.md` #4.

## The voice worker (`backend/voice/`)

Copilot Backend Service `voice`, `backend/copilot/voice/manifest.yml`. Outbound only.

| Var | Meaning | Home |
| --- | --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | the same LiveKit project the Next app holds | SSM secrets |
| `BRAIN_API_SECRET` | the shared bearer (the brain's existing SSM value) | SSM secret |
| `ELAYA_BRAIN_URL` | the brain over Service Connect, `http://api:8080` | manifest variable |
| `VOICE_STT_MODEL` / `VOICE_STT_LANGUAGE` / `VOICE_TTS_MODEL` / `VOICE_TTS_LANGUAGE` / `VOICE_TURN_DETECTION` / `VOICE_MAX_CALL_SECONDS` | the models and the call ceiling; defaults in the manifest and `agent.py` | manifest variables |
| `VOICE_TTS_VOICE` | Elaya's voice id at the TTS provider; empty = the model's default | SSM secret (may be empty) |

## The Sia watcher (`connector/`)

`connector/src/config.ts` reads `../.env.local` and then the process env (process env wins).

| Variable | Purpose | Set in prod by |
| -------- | ------- | -------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | required | watcher manifest `variables` |
| `SUPABASE_SERVICE_ROLE_KEY` | required; the watcher writes `sia.wag_*` directly | SSM secret |
| `WAG_MEDIA_BUCKET` | S3 bucket for media; falls back to `SIAMEDIA_NAME` | not set; the S3 addon injects `SIAMEDIA_NAME` |
| `SIAMEDIA_NAME` | the bucket name output by `backend/copilot/watcher/addons/sia-media.yml` | Copilot addon |
| `AWS_REGION` | default `ap-south-1` | Fargate |
| `WAG_MEDIA_DIR` | the local media store when no bucket is set | local only |
| `WAG_PAIR_NUMBER` | the retired pairing-code flow; emergency only, leave unset | never |

Details: `../integrations/sia-connector.md` and `connector/RUNBOOK.md`.

## Scripts only

| Variable | Used by |
| -------- | ------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | `scripts/db/row-counts.ts`, for the local rehearsal stack (falls back to the service-role key) |
| `SERENE_BROWSER_PORT` | the UI check scripts (`scripts/check-*.mjs`): the Chrome DevTools port to attach to (default 9223 or 9224) |
| `DATABASE_URL` | not read by code; the engine health check's `psql` example (`engine-health-check.md`) |

Most scripts read `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` like the app. The
local-only seeders refuse to run unless the URL is localhost.
`scripts/vendors/copy-notes-for-testing.ts` reads production credentials from a separate file
(`.env.local.prod-backup` by default) and writes only to localhost.

## `.env.example` gaps (flagged, not fixed in a docs pass)

`.env.example` now lists 26 names: the Supabase trio, both webhook secrets, the site URL,
Deepgram, Anthropic, `BRAIN_API_SECRET`, `ELAYA_BRAIN_URL`, both Upstash vars, the four VAPID
vars, the three Freshdesk vars, the four Zoho vars (plus a commented `ZOHO_ACCOUNTS_HOST`) and
the three vault vars. Still missing: the four required `GUPSHUP_*` vars,
`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID`, the four `WHATSAPP_*` vars, the three `SIA_S3_*` vars,
`TRIGGER_SECRET_KEY`, and the local-only `WAG_MEDIA_DIR` / `ELAYA_BRAIN_OVERRIDE_*`. A fresh clone
still boots; WhatsApp fails on the first send and Sia media fails to sign. TODO: sync
`.env.example` in a code PR.
