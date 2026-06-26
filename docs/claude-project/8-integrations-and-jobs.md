# Serene — Integrations & Background Jobs (Claude Project digest)

> Digest of `docs/integrations/*` and the relevant `docs/modules/*` (through 2026-06-26). The Elaya
> LLM provider layer is detailed in `5-elaya-jarvis.md`. The governing rule for everything outward-
> facing is **A-16** (`after()` + awaited send, never `void fetch().catch()`).

## The A-16 rule (read first — it governs every outward send)

On Vercel the serverless function is **frozen/killed the instant the response (or server-action
return) is flushed.** A `void fetch().catch()` still in flight at that moment is orphaned — the send
is severed and any follow-up (e.g. a log insert) never runs. This is silent, intermittent loss (the
2026-06-08 WhatsApp-notification outage). The only correct pattern for a send that must complete:

```ts
import { after } from 'next/server';
after(notifyLeadAssigned({ … }).catch((e) => console.error('[module] notify failed', e)));
return NextResponse.json({ … }, { status: 201 });
```

`after()` keeps the lambda alive until the awaited send settles. Routes carrying sends export
`maxDuration` (60s on the webhooks, 180s on the Elaya entry points). Code already inside an `after()`
uses a plain `await` (a `void` there detaches from the tracked chain).

## Lead ingestion (Pabbly / Meta webhook)

`POST /api/webhooks/leads?source=meta|google|website` — `src/app/api/webhooks/leads/route.ts`,
`maxDuration = 60`. Order of operations (auditability-first):

1. Resolve `source` (unknown → `website` with a warn; validated against `LEAD_SOURCES`).
2. **Rate-limit before body read** (`createRateLimiter`, 100/min/IP, in-memory).
3. Parse JSON via `readJsonBody` (400 on failure).
4. **Log the raw payload to `lead_raw_payloads` BEFORE auth** (so auth failures are auditable);
   `sanitizeRawPayload` strips secret envelope keys (e.g. `res2` Meta page token) but **not PII**.
5. Bearer check (`PABBLY_WEBHOOK_SECRET`, `safeSecretCompare`) — failure marks the raw row
   `ingestion_error:'unauthorized'`, returns 401.
6. `ingestLead(rawPayload, source, rawPayloadId)`.
7. Success → `after(notifyLeadAssigned(...))` → `201 { leadId }`.

Source adapters (`src/lib/leads/adapters.ts`): `adaptMeta` (native `field_data` → Pabbly
`raw_meta_fields` → flat keys; `utm_medium ← res3.platform`, `utm_content ← res3.adset_name`;
`utm_source` is **never** hardcoded to `'meta'`), `adaptGoogle`, `adaptWebsite`. All `sanitizeText()`
every field; phone normalisation is try/caught (a lead is never rejected for an unparseable phone).

Inside `ingestLead()`: Zod validate → **domain resolution** (explicit `domain` field → campaign-prefix
map `TG_Global→onboarding`, `TG_Shop→shop`, `TG_Legacy→legacy`, `TG_House→house`, `TG_B2B→b2b` →
default `onboarding`) → **phone dedup** (`get_active_lead_by_phone`: active lead → log a
`duplicate_submission` activity, no new row; terminal lead → new lead with `previous_lead_id`) →
**round-robin** (`get_next_round_robin_agent`, SELECT FOR UPDATE SKIP LOCKED; empty pool → unassigned,
founder alert still fires) → INSERT lead (`status='new'`, attribution snapshot once) + activities.
Notifications + SLA are NOT done here — the route's `after(notifyLeadAssigned)` owns all four
assignment side-effects.

## WhatsApp / Gupshup

Provider: **Gupshup v1** (the Meta-direct integration was reverted; those paths compile but are
dormant). Required env (server throws on load if missing): `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`,
`GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`. Outbound is `x-www-form-urlencoded`, auth via the
`apikey` header (not Bearer). **Gupshup returns HTTP 200 even on app-level errors** —
`isGupshupDelivered()` returns false when the body is `{status:'error'}`; delivered = `res.ok` AND not
that.

**Three service files, never blurred:**

| File | Client | Role |
|------|--------|------|
| `whatsapp-service.ts` | session (RLS) | UI reads — conversations, messages, unread, read-marks, search |
| `whatsapp-api.ts` | HTTP → Gupshup | **server-only** outbound + notification logging |
| `whatsapp-ingestion.ts` | admin | **server-only** inbound; `processStatusUpdate` is the ONLY UPDATE ever made to `whatsapp_messages` (delivery receipts — the A-11 exception) |

**Inbound webhook** (`POST /api/webhooks/whatsapp`, `maxDuration = 60`): auth via `x-gupshup-secret`
(`safeSecretCompare`) + rate-limit (300/min/IP) **before** reading the body; **always returns 200**
after auth (so Gupshup doesn't retry-storm); processing deferred in `after()`. The **Elaya staff
routing gate** runs **first** (`tryHandleElayaWhatsAppMessage` — staff number → Elaya, never the lead
pipeline; unknown number → falls through). Then `processInboundMessage()` (9 steps): normalize phone →
dedup on `wa_message_id` → resolve lead by phone → **no lead → Pipeline-B** (`createLeadFromWhatsApp`,
domain `onboarding`, round-robin, then `await notifyLeadAssigned(... isNew, scheduleSla)` — a plain
`await` inside the route's `after()`) → existing lead threads in with no notification →
get-or-create conversation → insert sanitized message → bump `last_message_at` → Realtime.

**The orchestrator `notifyLeadAssigned()`** is the single entry for all four assignment paths
(webhook ingestion, `assignLead`, `createManualLead`, WhatsApp new-number). Order: agent WhatsApp
(only if assigned) + founder WhatsApp (every non-duplicate; `Promise.allSettled`) + in-app
notification (self-notify suppressed) + SLA timers (when `scheduleSla` + assigned). All sends are
awaited inside, the orchestrator is invoked inside `after()` (A-16).

**Seven templates** (`src/lib/constants/whatsapp.ts`), all thin wrappers over `sendGupshupTemplate()`
(owns the fetch, the delivered check, and one log row per attempt): agent-assignment, founder-alert,
SLA-agent, SLA-manager, lead-initiation (the sole sender that re-throws so the dossier UI sees the
failure), task-due-reminder (TASK-01A), task-overdue-manager (TASK-01B, due time as IST human format,
never UTC/ISO). Every send logs to `whatsapp_notification_logs` (last-4 phone digits only).

## Trigger.dev (the async job layer, A-12)

`trigger.config.ts`: project `proj_xfyyvwjmrumreyvawcwg`, runtime `node`, `maxDuration: 300`, scan dir
`src/trigger`. SDK v4 (imports via the `/v3` entry point). Auth `TRIGGER_SECRET_KEY`. Four job families
across five files:

- **`lead-sla.ts`** — the Gia follow-up engine. `scheduleLeadSlasTask` (one delayed run per
  lead+rule; idempotency key `lead-sla-${leadId}-${ruleCode}`, cadence ticks add the IST date),
  `cancelLeadSlasByLeadTask` (cancels by tag `lead-sla-${leadId}`), `fireLeadSlaTask` (loads the
  `sla_policies` row **per fire** → status-breach vs cadence tick; a **stale-fire guard** re-reads the
  lead so a status that moved on exits). Runs sessionless via the admin client (`lib/actions/sla.ts`,
  the documented `requireProfile` exception).
- **`task-reminders.ts`** — `scheduleTaskReminder` (no-op when `dueAt <= now()`), `cancelTaskReminder`,
  `sendTaskReminderTask` (at due: in-app for every task; for `gia_followup` also the WhatsApp template
  + arms the overdue check), `checkTaskOverdueTask` (at due+30 min: stamps `tasks.overdue_at` **exactly
  once** + notifies domain managers, unless a clearing event happened). `deleteTaskAction` cancels the
  reminder **before** the DB delete.
- **`lead-revival.ts`** — `sweepRevivalCandidatesTask`, the project's **first cron `schedules.task`**:
  `0 2 * * *` `Asia/Calcutta` = **07:30 IST daily**. Reads `revival_policies` → finds silent leads with
  no candidate of any status (judge-once anti-join, `get_silent_leads_for_revival`) → note-AI 3-verdict
  gate (`revival-gate.ts`, reuses the Elaya `routing`/Haiku + `maskPii`, no tools, **fails closed to
  `unsure`**) → `revive` under the daily cap → `reviveLeadCore` (a "Revived" task via the
  `createLeadTaskCore` path, never the leads row); `dismiss` → `dismissed` candidate (audit, never
  review); `unsure`/overflow → `open` candidate (review tab `/leads?revival=true`).
- **`usage-snapshot.ts`** + **`usage-rollup.ts`** — adoption tracking (0126).
  `snapshotUsagePresenceTask` (`* * * * *`, every minute) reads live Redis `presence:*` keys and
  appends one `usage_heartbeats` row per active user (the ONLY writer; the request path never touches
  Postgres). `rollupUsageTodayTask` (`*/15 * * * *`) + `rollupUsageNightlyTask` (`20 0 * * *`,
  `Asia/Calcutta`) recompute `usage_daily` by `COUNT(DISTINCT minute-bucket)` and UPSERT (idempotent,
  never increment); the nightly job also prunes heartbeats >30 days.

**Cron timezone:** always `Asia/Calcutta`, **never `Asia/Kolkata`** — Trigger.dev's validator rejects
the alias (ICU canonicalises IST to `Asia/Calcutta`). Same UTC+5:30 zone.

**Worker note:** the worker pins **Node 21**; `@supabase/supabase-js` constructs a `RealtimeClient`
eagerly (needs a global `WebSocket`, absent on Node <22). `createAdminClient` passes `ws` as the
realtime transport only when `globalThis.WebSocket` is undefined (fixed 2026-06-25). If escalation
alerts ever look dormant, the cause is usually that the Trigger.dev worker isn't deployed against the
`tr_prod_` key (the `/escalations` *surface* computes breaches live regardless — see file 3).

## The SLA engine (config-driven via `sla_policies`, 0111)

Eight status rules, read per fire:

| Code | Trigger | Threshold | Recipient | Auto-task |
|------|---------|-----------|-----------|-----------|
| SLA-01A/B/C | `new` | 15 / 30 / 45 min | agent / manager / founder | A: yes (urgent) |
| SLA-02A/B | `touched` | 24 / 36 h | agent / manager | A: yes (high) |
| SLA-03A/B | `in_discussion` | 24 / 36 h | agent / manager | A: yes (high) |
| SLA-04A/B | `nurturing` | 4 biz-days | agent / manager | A: yes (high) |

Plus cadence + task-due families: **CAD-01A/B/C** (call outcomes rnr/switched_off/wrong_number → a
daily follow-up task at the next shift day, re-armed until the outcome/status changes, with three
duplicate-storm guards and a 7-day `last_call_outcome_at` freshness window), **CAD-02A** (in_discussion
every 48 biz-hours, reset by a call note), **TASK-01A/B** (gia task due → agent reminder; +30 min →
manager overdue escalation). Business hours: **IST, Mon–Sat 09:00–19:00** (`lib/constants/sla.ts`),
with per-agent shift overrides. Activity refreshes SLA-02/03 only; SLA-01 only ends by leaving `new`;
terminal statuses cancel all timers. Admin/founder can add custom rules from `/settings/follow-up-
engine` (code `USR-<id>`, inert; reserved prefixes rejected; a value that can never fire is rejected).

## Notifications fan-out (Web Push / VAPID, 0120)

`createNotification` is the single chokepoint: it INSERTs the in-app `notifications` row (the source of
truth) then calls `dispatchPush(recipient_id, {title, body?, url?})` — so every existing and future
notification type gets a push with **zero call-site edits**. `dispatchPush` (`push-service.ts`) reads
the recipient's devices via the admin client, sends in parallel via `web-push`, and **prunes dead
endpoints** (404/410 DELETE — mandatory). It **never throws** (non-fatal; the in-app row exists
regardless). Server+Node only (`web-push` throws on Edge). iOS delivers **only inside the installed
PWA** (standalone) — `usePushSubscription` reports `ios-needs-install` otherwise and shows an install
nudge; subscribe is gesture-gated. Env: `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`
(server) + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client). Per-user mutes for non-transactional categories
come from `notification_preferences` (0133; absence = ON, fails OPEN).

## Deepgram voice

One STT call site: `transcribeAudio()` in `transcription-service.ts` (`server-only`), **Deepgram
Nova-2**, language `hi-Latn` (Hinglish). 3 MB max audio, 2-min recording cap. Client entry
`transcribeAudioAction`; mic capture `useAudioRecorder` (codec negotiation, auto-stop, mic release);
UI `<DictationButton>` (composer/inline variants). Four staff surfaces compose it (Elaya composer,
WhatsApp composer, lead-notes input, called-modal); WhatsApp inbound voice notes are transcribed
server-to-server. **Audio is transcribed in-memory and discarded — never stored.** Transcripts land as
**editable drafts** (never auto-send) in-app. Env: `DEEPGRAM_API_KEY` (server-only).

## LLM provider layer (Anthropic)

Provider-neutral `complete()` contract (`src/lib/elaya/provider.ts`); `adapters/anthropic.ts` is the
ONLY file allowed to import `@anthropic-ai/sdk` (per-request 30s timeout, 1 retry). Config in
`llm_providers` (`routing`→`claude-haiku-4-5`, `reasoning`→`claude-sonnet-4-6`) + `elaya_settings`
(daily cap 200, PII depth `light`, session 24h), **read per request, never module-cached** — a model
switch is a DB edit, no deploy. An unimplemented provider fails loud (never silent fallback). The
`routing`/Haiku model is reused (no new SDK import) by the lead-revival gate and the Elaya
learned-memory summarizer. Env: `ANTHROPIC_API_KEY` (server-only). See `5-elaya-jarvis.md`.

## Upstash Redis (cache only)

Single client `src/lib/redis.ts` (`Redis.fromEnv()`, REST transport). Env
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. Redis is an **optimisation, never a dependency** —
every read degrades to direct Postgres on failure; nothing in Redis is source of truth. All keys/TTLs
from `src/lib/constants/redis-keys.ts` (the only source). Key namespaces, the dual-key lead-row
invariant, version counters, and the P-08 del-before-revalidate rule are in `2-architecture-summary.md`
(Caching) and `6-engineering-rules.md`.
