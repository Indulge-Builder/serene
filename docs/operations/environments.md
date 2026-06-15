# Environments & Env Vars

> **Purpose:** the complete registry of environment variables — name, purpose, where used, exposure. **Never values.**
> **Audience:** engineers/ops. · **Source-of-truth scope:** env var registry. Provider setup: `deployment.md`.
> **Last verified:** 2026-06-15 against `grep process.env src/` (23 vars) + `.env.example`.

---

## Rules (S-10/S-11)

- Anything ending `_KEY`, `_SECRET`, `_TOKEN` is server-only. `NEXT_PUBLIC_` prefix only for
  genuinely public values. Secrets never appear in logs or client bundles.
- `.env.local` is never committed; `.env.example` is always committed.

## Registry

| Variable | Exposure | Purpose | Read in |
| -------- | -------- | ------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | public | Supabase project URL | both Supabase client factories |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | Supabase anon key (RLS-bound) | both client factories |
| `SUPABASE_SERVICE_ROLE_KEY` | server | service-role key — bypasses RLS | `lib/supabase/admin.ts` only |
| `NEXT_PUBLIC_SITE_URL` | public | canonical site origin (auth redirects, invite links) | auth actions/callback |
| `PABBLY_WEBHOOK_SECRET` | server | Bearer token for `POST /api/webhooks/leads` | leads webhook route |
| `UPSTASH_REDIS_REST_URL` | server | Upstash REST endpoint | `lib/redis.ts` (`Redis.fromEnv()`) |
| `UPSTASH_REDIS_REST_TOKEN` | server | Upstash REST token | `lib/redis.ts` |
| `DEEPGRAM_API_KEY` | server | Deepgram voice-note transcription auth (S-11) | `transcription-service.ts` (the only Deepgram call site, server-only) |
| `ANTHROPIC_API_KEY` | server | Anthropic API auth for the Elaya LLM layer (S-11) | `lib/elaya/adapters/anthropic.ts` (the only `@anthropic-ai/sdk` import) |
| `VAPID_PUBLIC_KEY` | server | Web Push VAPID public key (S-11) | `lib/services/push-service.ts` (VAPID config) |
| `VAPID_PRIVATE_KEY` | server | Web Push VAPID private key (S-11) | `lib/services/push-service.ts` (VAPID config) |
| `VAPID_SUBJECT` | server | Web Push VAPID subject (`mailto:` contact, S-11) | `lib/services/push-service.ts` (VAPID config) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public | Web Push VAPID public key mirrored to the browser (needed for `pushManager.subscribe`) | client push subscribe flow (`usePushSubscription.ts`) |
| `GUPSHUP_API_KEY` | server | Gupshup API auth (`apikey` header) | `whatsapp-api.ts` (throws at module load if missing) |
| `GUPSHUP_APP_NAME` | server | Gupshup app identifier | `whatsapp-api.ts` (required) |
| `GUPSHUP_PARTNER_NUMBER` | server | the business WhatsApp number | `whatsapp-api.ts` (required) |
| `GUPSHUP_WEBHOOK_SECRET` | server | `x-gupshup-secret` for `POST /api/webhooks/whatsapp` | whatsapp webhook route (required) |
| `WHATSAPP_ACCESS_TOKEN` | server | Meta Cloud API token — **dormant path** | `whatsapp-api.ts` (optional; needed for inbound media download) |
| `WHATSAPP_PHONE_NUMBER_ID` | server | Meta phone-number id — dormant | `whatsapp-api.ts` (optional) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | server | Meta WABA id — dormant | `whatsapp-api.ts` (optional) |
| `WHATSAPP_WEBHOOK_SECRET` | server | Meta webhook signature secret — dormant | whatsapp route (optional) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | server | Meta GET hub-challenge verify token | whatsapp route GET handler |
| `NODE_ENV` | runtime | standard Node/Next environment | various guards (e.g. test-only resets) |
| `TRIGGER_SECRET_KEY` | server | Trigger.dev SDK auth — consumed by the SDK/CLI, not read directly in `src/` | Trigger.dev runtime |

## Known gap (flagged, not fixed in the docs pass)

`.env.example` lists only 7 of these — the 4 required `GUPSHUP_*` vars, the 5 dormant
`WHATSAPP_*` vars, and `TRIGGER_SECRET_KEY` are missing. A fresh clone following
`.env.example` will crash at module load on the WhatsApp path (`whatsapp-api.ts` throws).
TODO: sync `.env.example` in a code PR (docs-only restructure did not touch source).
