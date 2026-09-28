# Serene: Integrations, Background Jobs and Deploy Targets (Claude Project digest)

> **Purpose:** the outside world in one read: where each part of Serene runs, every inbound and outbound integration, all 26 Trigger.dev tasks, the LLM layer and the two Elaya brains, and the rules that govern sends and deploys.
> **Audience:** a Claude Project chat that cannot read the repo, and the engineers who use it.
> **Source-of-truth scope:** a digest. Full contracts: `docs/integrations/` (`lead-ingestion.md`, `whatsapp-gupshup.md`, `sia-connector.md`, `freshdesk.md`, `zoho-books.md`, `mcp.md`, `trigger-dev.md`, `upstash-redis.md`) and `docs/operations/` (`deployment.md`, `environments.md`, `maintenance.md`, `engine-health-check.md`), plus `docs/modules/web-push.md`, `voice-dictation.md` and `elaya.md` §4-5. Elaya's tools and persona: `5-elaya-jarvis.md`. The Sia concierge product (groups, members, tickets): `12-sia-concierge.md`.
> **Last verified:** digested 2026-09-26 from those docs as refreshed and verified against the code that day.

## Where everything runs

| Target | What runs there | How it ships |
| --- | --- | --- |
| **Vercel** | the Next.js 16 app: pages, Server Actions, the nine API routes. Production alias `indulge-serene.vercel.app` | a push to `main` builds and promotes Production |
| **Supabase** | Postgres 17, Auth (including the OAuth server the MCP connector uses), Realtime, Storage. Schemas `public`, `gia`, `member`, `sia`, `freshdesk`, `elaya_read` | the Supabase CLI (`db push`) |
| **Trigger.dev** | every task in `src/trigger/` (project `proj_xfyyvwjmrumreyvawcwg`) | `pnpm trigger:deploy` (CLI, SDK and build pinned together at 4.4.6) |
| **AWS, Copilot app `serene`, env `prod`, `ap-south-1`** | two ECS Fargate services in one cluster: `api` (the Python brain, FastAPI) and `watcher` (the Sia WhatsApp connector) | `copilot svc deploy` from `backend/` |
| **CloudFront** `dvoitvfdf56l3.cloudfront.net` | the HTTPS front on the `api` load balancer (caching off, 60 s origin timeout for SSE) | configured by hand |
| **S3** (the `sia-media` addon) | the watcher's media files | Copilot storage addon |
| **Upstash** | Redis over REST (cache only) | env vars |
| **Gupshup** | the WhatsApp BSP for the one business number | env vars, approved templates |
| **Pabbly** | webhook middleman for Meta, Google and website lead forms | its own dashboard |
| **External APIs Serene calls** | Freshdesk (read), Zoho Books (read), Anthropic (models), Deepgram (speech) | env vars |

A Vercel deploy does **not** update the Trigger.dev jobs or the Fargate services: each target has
its own bundle and its own env vars. The watcher is its own service because it holds a WhatsApp
socket all day and a brain deploy must never drop it.

## The A-16 rule (governs every outward send)

On Vercel the function is frozen the instant the response (or a Server Action's return) is flushed.
A `void fetch().catch()` still in flight is orphaned: silent, intermittent loss with no log row (the
2026-06-08 WhatsApp outage). The only correct shape is `after()` from `next/server` with the send
awaited inside; code already running inside an `after()` uses a plain `await`. Routes with work in
`after()` export `maxDuration`:

| Route | `maxDuration` | Why |
| --- | --- | --- |
| `api/webhooks/leads` | 60 | the assignment notification sends |
| `api/webhooks/whatsapp` | 180 | a full Elaya staff turn plus the customer channel |
| `api/webhooks/freshdesk` | 60 | the re-read of the ticket |
| `api/elaya/chat` | 180 | the SSE stream |
| `api/elaya/bridge` | 60 | the Python brain's calls back into the Node cores |
| `api/mcp` | 60 | the MCP connector's tool calls |

The session proxy (`src/proxy.ts`) skips `/api/webhooks`, `/api/manifest`, `/api/elaya/bridge`,
`/api/mcp`, `/.well-known` and the PWA files: those callers carry no cookie.

## Lead ingestion (Pipeline A, `POST /api/webhooks/leads?source=…`)

Pabbly posts `meta`, `google` or `website`; the Indulge Shop app posts `shop_app` directly. Order
(auditability first): resolve `source` against `LEAD_SOURCES` (meta, google, website, whatsapp,
referral, ypo, events, shop_app, self; unknown → website) → rate limit 100/min/IP before the body →
`readJsonBody` → **log the raw payload to `gia.lead_raw_payloads` before auth** (so failures are
auditable; `sanitizeRawPayload` strips the `res2` token, not PII) → Bearer check per sender
(`SHOP_APP_WEBHOOK_SECRET` for the shop, `PABBLY_WEBHOOK_SECRET` otherwise; separate so either can
rotate) → `ingestLead()` → `after(notifyLeadAssigned(...))` → `201 { leadId }` (a shop redelivery
answers a silent `200 { duplicate: true }`).

- **Adapters** (`src/lib/leads/adapters.ts`): `adaptMeta` (reads `res3.field_data`; `medium` from
  `res3.platform`; ad metadata into `attribution`; `source` only ever from the query param),
  `adaptGoogle`, `adaptWebsite`, `adaptShopApp` (a typed `product_enquiry` and the shop's
  `external_id`).
- **Inside `ingestLead()`:** Zod → domain (explicit field → campaign prefix `TG_Global`
  onboarding, `TG_Shop` shop, `TG_Legacy` legacy, `TG_House` house, `TG_B2B` business → then a
  **Gia-only coercion**: anything not a Gia domain, `business` included, lands in `onboarding`) →
  phone canonicalised (an empty phone is rejected 422 `empty_phone`) → dedup via
  `get_active_lead_by_phone` (active lead → a `duplicate_submission` activity, no new row; terminal
  lead → a new lead with `previous_lead_id`) → round-robin `get_next_round_robin_agent` (agents and
  managers with an active routing row; an empty pool leaves the lead unassigned) → INSERT (a 23505
  from the 0137 active-phone index means a racing insert won; the existing lead is returned) →
  activities → awaited `invalidateLeadCaches`.
- **Shop product enquiries** (0180): one lead per person, many enquiries in
  `gia.lead_product_enquiries`, idempotent on `external_lead_id`. A known person asking about a new
  product gets an in-app "new enquiry" only (no WhatsApp); a redelivery is fully silent; a shop
  payload without an external id or product name is rejected 422.
- Failures set `ingestion_error` on the raw row and surface on `/error-log`.

## WhatsApp / Gupshup (the one business number)

**Provider:** Gupshup v1 (the Meta Cloud path is dormant). Env `GUPSHUP_API_KEY`,
`GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`;
`assertGupshupConfigured()` throws on the first send, not at import. Outbound is form-encoded with
an `apikey` header. **Gupshup answers 200 even on app errors**: delivered = `res.ok` AND the body
is not `{status:'error'}`. Sends happen in **two runtimes**: Vercel (lead and task assignment, lead
initiation, agent replies, Elaya and customer replies) and the Trigger.dev worker (SLA alerts,
reminders, nudges, the Sia alarm, the brief, alerts), so the `GUPSHUP_*` vars must be set in both.
An operator note of 2026-09-22 found them missing on the worker; still to verify.

**Service files, never blurred:** `whatsapp-service.ts` (session reads), `whatsapp-api.ts`
(every outbound send plus the log), `whatsapp-ingestion.ts` (the inbound lead pipeline;
`processStatusUpdate` is the only UPDATE on `whatsapp_messages`), `whatsapp-media.ts` (copies the
expiring Gupshup CDN file into the private `whatsapp-media` bucket), `elaya-whatsapp.ts` (the staff
gate and turn), `elaya-customer.ts` (the customer channel). All four tables live in `gia`.

**Inbound `POST /api/webhooks/whatsapp`:** rate limit 300/min/IP first; the `x-gupshup-secret`
compare (timing-safe; the handler reads the body before this compare); always 200 once auth
passes; all work in `after()`. Then:

1. **The staff routing gate** (`tryHandleElayaWhatsAppMessage`) matches the sender against active
   `profiles.phone`. No match → the lead pipeline. A match whose team does not have Elaya
   (`hasElayaAccess` false) → one line saying so, and the message is swallowed. A match with Elaya
   → the full staff turn, never a lead. Dedup on `wa_message_id` (plus the 0148 index); a voice note
   is transcribed in memory; the brain is picked by the `brain_whatsapp` row (Python today); a
   15-second "On it" holding line; `markdownToWhatsApp()`; answers over 4,000 characters split into
   several messages; then `learnFromTurn` updates the living memory.
   **A blank `profiles.phone` turns a staff message into a new lead** (it happened 2026-09-22).
   Triage order: the profile's phone and `is_active`, stray leads ending in their last four digits,
   their `elaya_messages` on channel whatsapp, `elaya_reply` log rows with `delivered = false`.
2. **`processInboundMessage()`** (Pipeline B) for unknown numbers: normalise, dedup, resolve the
   lead by phone; no lead → `createLeadFromWhatsApp` (domain onboarding, round-robin, then an awaited
   `notifyLeadAssigned`); existing lead → the message threads in with no staff notification; store
   media; insert; bump `last_message_at`.
3. **The customer channel** (0151, additive): the welcome template exactly once per lead
   (`welcomed_at`, and only if `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is set), then replies from the
   `elaya_training_assets` library by a hard-capped customer principal on the Node side; an agent's
   manual reply sets `bot_active = false`.

**`notifyLeadAssigned()`** is the single entry for all four assignment paths (webhook, `assignLead`
and bulk reassign, `createManualLead`, WhatsApp new number): agent WhatsApp (when assigned, not a
repeat enquiry), founder WhatsApp (**paused**: `FOUNDER_LEAD_ALERTS_PAUSED = true` since
2026-09-21, and the founders' own preference rows mute lead and SLA alerts since 2026-09-23),
in-app (self-notify suppressed), and SLA timers whenever `scheduleSla` is true, assigned or not.

**The 24-hour rule.** Free text only within 24 hours of the person's last message; otherwise an
approved template. `waFreeTextWindowOpen(userId)` decides for staff; the brief and the alerts send
the full text inside the window, else `sendElayaTemplatePing` (one line over the Sia alert
template), and save the full text to the person's Elaya conversation.

**The 13 templates** (`src/lib/constants/whatsapp.ts`), all thin wrappers over the internal
`sendGupshupTemplate()` (fetch, delivered check, one awaited log row per attempt): lead assignment
(agent) · founder lead alert (paused) · SLA agent · SLA manager · lead initiation (the one sender
that re-throws, so the dossier shows the failure) · task due reminder · task overdue → manager
(lead-shaped) · task due soon (30 min before) · task overdue → agent · task overdue → manager
(generic) · task assigned (also every repeat nudge) · **Sia alert** (the watcher alarm and the
Elaya template ping) · customer welcome (env-driven id). Free-text senders:
`sendElayaWhatsAppReply`, `sendCustomerWhatsAppReply`, `sendTextMessage`,
`sendGupshupMediaMessage`.

**Per-user gating:** broadcast senders check `notification_preferences` (absence = ON, fails
open). Never gated: lead initiation, Elaya replies, customer sends, the Sia alarm. Ticket
categories have WhatsApp checkboxes but no ticket template or sender exists yet (tickets notify
in-app and by push only).

**`gia.whatsapp_notification_logs`:** one row per attempt, 14 types, last four phone digits only,
admin/founder SELECT. There is no retry or alert on a failed delivery.

## The Sia connector (the WhatsApp group watcher)

A separate, unofficial companion device, not Gupshup. A small Node service (Baileys
7.0.0-rc14) on its own Fargate service (`watcher`, arm64, 512 CPU / 2048 MB, one task,
`deployment.rolling: recreate`), linked to a dedicated number that sits silently in the member,
vendor and internal groups. **It never sends.** Every event goes to `sia.wag_raw_events` first,
then normalised into the `sia.wag_*` tables (idempotent on WhatsApp's own message triple; facts
never mutate). The session lives in Postgres (`sia.wag_auth_state`), so the container is
disposable and a deploy never re-pairs; media goes to a private S3 bucket and the app presigns
15-minute links with a read-only identity (`SIA_S3_*`). Crash-only: any disconnect exits and ECS
restarts it. Pairing is by QR from Sia → gear → Session (admin/founder).

**The operating rule:** Sia is mission-critical. Never experiment on the live session; exactly one
process may hold it (scale the service to 0 before running it anywhere else). If it wobbles:
freeze, audit read-only, let a human decide.

**The alarm:** the watcher beats `sia.wag_watcher_status` every 60 s; `sia-silence-watch` (every
minute) raises `down` (3 min without a beat), `session_lost` (at once on logout, 15 min unpaired),
`unreachable` (15 min stuck connecting) or `quiet` (6 h with no events). The named tech responders
hear it first (in-app, push, the Sia alert template, every 10 min via a Redis latch); founders join
after an hour. Not gated by preferences. Upkeep: the watcher phone must come online every two
weeks or so; never bump Baileys to v8 without migrating the auth table first. Full detail:
`docs/integrations/sia-connector.md`, `connector/RUNBOOK.md`, and `12-sia-concierge.md`.

## Freshdesk (read-only mirror, schema `freshdesk`)

Freshdesk (`indulge.freshdesk.com`, REST v2, Basic auth with a personal agent key) is where the
concierge team runs tickets today. Serene mirrors it and **never writes ticket data back** (its
only write ever was registering two "Serene mirror" automation rules).

- **Limits:** 400 calls a minute for the account, but 100 a minute on each ticket endpoint, shared
  with the member app (before 2026-09-18 the account was throttled at 50). Each cycle spends at most
  `FD_RUN_MAX_CALLS` (80), stops at `FD_RATE_RESERVE` (15) remaining, and has a 30-second budget.
  (The root `CLAUDE.md` row and the task file header still say 50 a minute; `constants/freshdesk.ts`
  is current.)
- **The sync** (`freshdesk-sync` task, every minute, one at a time, exits if it starts over 150 s
  late): reference data every 6 h; poll by `updated_since` watermark (the truth path) with a diff
  into the append-only `ticket_changes` (the movement history Freshdesk does not expose;
  `fdComparable()` compares a due date as an instant); thread pulls; file copies into the private
  `freshdesk-attachments` bucket (the links die within hours); contacts; backfill.
- **The webhook** (`/api/webhooks/freshdesk`, `x-freshdesk-webhook-secret`): stores the event,
  answers 200, re-reads the ticket in `after()` on its own 6-call budget. A missed webhook is
  repaired by the next poll.
- **History** came from the account export (about 50,000 tickets, 209,000 notes), loaded by
  `scripts/freshdesk/load-export.py`.
- **Pages:** `/freshdesk` (overview strip from one RPC scan, filters, table, `?member=` scope) and
  `/freshdesk/[id]` (thread with files, movement, summary). Access is `getSiaViewerScope()`: admin,
  founder and the tech workbench see all; a seated concierge teammate is pinned server-side to their
  queendom's Freshdesk group; the Joker head to the three queendom groups.
- **Other readers:** the member page's Requests card, ticket help windows and the intake "free
  exam", the vendor live extractor (unread notes, every 5 min), the member judgement, Elaya's
  Freshdesk tools and views, the pulse, brief and alerts.
- **Invariant:** the conversation upsert must never include `vendor_extracted_at` (not even null),
  or every note is re-queued and re-billed for extraction.

## Zoho Books (read-only, live)

The company ledger. Serene reads it live and **never writes**; nothing from Zoho lands in
Postgres (Redis holds it for minutes at most). India data centre (`accounts.zoho.in`,
`www.zohoapis.in`), Books REST v3, OAuth refresh token (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
`ZOHO_REFRESH_TOKEN`, `ZOHO_ORGANIZATION_ID`). `zoho-api.ts` is the only client (one in-flight token
refresh, token cached in Redis); every read carries a budget of at most 25 calls and never dips
below a 500-call reserve of the 10,000 a day shared with the member app's server.

Two reads (`zoho-service.ts`): `getBooksOverview()` (12 to 16 calls; Redis 5 min) for `/books`
(admin and founder only; the tech workbench is blocked) and Elaya, and `getMemberFinance(customerId)`
(4 calls; Redis 1 min) for the member finance page's Zoho cards (anyone who can see the member,
except guests and the Joker head). The founders' brief reads the overview from Trigger.dev
(without the Zoho vars there, it leaves money out).

## The MCP connector (Serene inside Claude, ChatGPT and other AI apps)

A remote MCP server at `/api/mcp` (live since 2026-09-21). An AI app adds the URL, the person signs
in through the Supabase OAuth server and Serene's consent page (`/oauth/consent`), and the app can
call **Elaya's read tools as that person**. The connector owns no tool list: it publishes the
person's role-gated read toolset from Elaya's registry and runs every call through `executeTool`
(the same gates and PII mask). Admission: the role must be in the `mcp_audience` settings row
(seeded to every role but guest; founder + admin if the row breaks) **and** `hasElayaAccess` must
be true; anyone else gets zero tools and a sentence. Extras: `export_rows` (founder/admin, up to
5,000 rows as CSV), `search` / `fetch` (for ChatGPT), resources (`serene://vocab`, catalog, pulse,
member, ticket) and prompts (weekly review, campaign audit, SQL help, member brief, vendor
shortlist). Limits: 60 calls a minute per person, 60,000-character results. Every call logged in
`mcp_tool_calls`. **Read only:** write tools (Phase 4) are not built. Apps are disconnected from
`/profile` → Connected AI apps.

## The LLM layer and the two Elaya brains

- **Provider contract:** `complete()` in `src/lib/elaya/provider.ts`;
  `adapters/anthropic.ts` is the only file allowed to import `@anthropic-ai/sdk` (ESLint enforces
  it). A turn may carry files (base64); an adapter that cannot show one drops it.
- **Tiers are rows in `llm_providers`, read per call** (a model switch is a data edit):
  `routing` = `claude-haiku-4-5` (single judgements: the router, memory reader, revival gate, vendor
  reader and extractor, intake, sentinel, alert tone reads, deep-read judging), `reasoning` =
  `claude-sonnet-5` (since a 2026-08-27 data edit; most specialists, the customer brain, the brief,
  profiler, judgement, ticket drafts, lesson writer), `heavy` = `claude-opus-5` (0176; the Python
  analytics and analyst specialists, falling back to `reasoning`). The live value is always the row.
- **Two brains.** Both channels think in the **Python brain** (`backend/app/`, FastAPI on Fargate
  behind CloudFront), picked per message by the `brain_whatsapp` / `brain_in_app` settings rows
  (both `python` since 2026-09-03/04; a missing row reads `node`; no automatic fallback mid-turn).
  Node reaches it through `src/lib/elaya/python-brain.ts` (bearer `BRAIN_API_SECRET` to
  `ELAYA_BRAIN_URL/v1/elaya/chat`, `https://` required in production). **"Python thinks, Node
  mutates":** every write and every read whose logic lives in Node runs back through
  `/api/elaya/bridge` into the same Node registry and cores. The in-process **Node brain is
  frozen**, kept as the one-row rollback, with retirement targeted **2026-10-16**.
- **One Anthropic account** serves Elaya, the profiler, intake, sentinel, vendor extractor, brief,
  alerts, deep read, lesson writer and judgements. Reaching its monthly spend limit silences all of
  them (2026-09-18). The deep read has its own cap (default 50 dollars).

## Trigger.dev: all 26 tasks

Config: `trigger.config.ts`, runtime node, default `maxDuration` 300, scan dir `src/trigger/`
(18 files; helpers such as `cancelRunsByTag` live in `src/lib/trigger/` so the scan skips them).
Imports use the SDK's `/v3` entry. Cron timezone is always `Asia/Calcutta` (the validator rejects
`Asia/Kolkata`). Tasks import their services dynamically inside `run()`; the build replaces
`server-only` with an empty module, so those chains run fine. The worker has **its own env vars**.
Runs armed from the website use Vercel's `TRIGGER_SECRET_KEY`, which must be the `tr_prod_` key
(a wrong key failed every armed run silently until 2026-09-21; runs were arriving again by 09-26).

### Armed by the app (delayed and on-demand)

| Task | File | What it does |
| --- | --- | --- |
| `fire-lead-sla` | `lead-sla.ts` | one SLA or cadence rule for one lead; re-reads the policy row and the lead (stale-fire guard); 3 attempts |
| `send-task-due-soon` | `task-reminders.ts` | the "due soon" WhatsApp 30 min before any open task is due |
| `send-task-reminder` | `task-reminders.ts` | at due: in-app `task_due`, the agent's overdue WhatsApp, the lead-shaped reminder for lead tasks, arms the overdue check |
| `check-task-overdue` | `task-reminders.ts` | stamps `tasks.overdue_at` once, emits the oversight event, escalates to managers |
| `send-task-nudge` | `task-reminders.ts` | one repeat reminder (0232; "remind him every 3 hours"), then arms the next |
| `elaya-deep-read` | `elaya-deep-read.ts` | reads and judges every row for one question; 25-minute budget, then a continuation job |
| `intake-lesson-write` | `intake-lessons.ts` | one lesson draft on demand ("Write a lesson now") |
| `member-assess-one` | `member-assessment.ts` | refreshes the pulse and judges one member now |

### Scheduled (times IST)

| Task | Schedule | Gate | What it does |
| --- | --- | --- | --- |
| `sweep-revival-candidates` | `0 2 * * *` Asia/Calcutta | active revival policies | the revival sweep (see the note below) |
| `snapshot-usage-presence` | every minute | none | Redis presence → `usage_heartbeats` |
| `rollup-usage-today` / `-nightly` | every 15 min / 00:20 | none | recompute `usage_daily`; nightly prunes heartbeats over 30 days |
| `sia-silence-watch` | every minute | none | the Sia watcher alarm |
| `sia-staff-link` | every 15 min | none | links WhatsApp contacts to Serene accounts by phone |
| `freshdesk-sync` | every minute | Freshdesk env present | one budgeted mirror cycle |
| `vendor-extract` | every 5 min | none (fails closed without the Anthropic key) | vendor facts from unread Freshdesk notes; settles finished jobs |
| `member-profiler` | every 10 min | `member_profiler_enabled`, off unless true | files member-group conversations into the member twin |
| `member-pulse` | minute 7 hourly | none | every member's activity numbers in one SQL statement |
| `member-assessment-weekly` | Sunday 04:00 | `member_assessment_enabled`, on unless false | Serene's judgement of Active members (about ₹2 each) |
| `ticket-intake` | every minute | `ticket_intake_enabled`, off unless true | suggested-ticket cards from new member messages |
| `ticket-sentinel` | every minute | none | wakes due tickets (rules, then a model read on new text only) |
| `intake-lessons-weekly` | Monday 06:00 | `intake_lessons_enabled`, on unless false | lesson drafts from human verdicts |
| `elaya-briefing-morning` / `-evening` | 10:00 / 18:00 | `daily_briefing_enabled`, off unless true | the founders' brief |
| `elaya-alerts` | every 5 min | `elaya_alerts_enabled`, off unless true | waiting members, escalating tickets, sour chats, Elaya's silent turns |
| `elaya-labels-refresh` | 05:30 | `elaya_labels_refresh_enabled`, on unless false | nightly deep-read top-up |

**The revival time is unsettled.** The pattern `0 2 * * *` with the IST timezone fires at
**02:00 IST**; the code comment, root `CLAUDE.md` and the health-check SQL say 07:30 IST. Check the
dashboard, then fix the pattern or the comments.

**Conventions:** a sweep runs one at a time (`concurrencyLimit: 1`), with a time budget under its
interval and an early exit when it starts late (the 2026-09-18 lesson: 173 stale Freshdesk runs
and a 17-hour lag). Delayed runs carry an idempotency key and a tag (every task reminder rides
`task-reminder-${taskId}`, so completing, deleting or re-dating a task sweeps them all);
`cancelRunsByTag` is THE cancel. Policy rows are read per run. Log arm errors. **Is it running?**
`scripts/engine-health-check.sql` (run with `SET search_path = public, gia` until it is updated for
the schema move) and the Trigger.dev dashboard.

## The SLA engine (config in `gia.sla_policies`)

| Code | Trigger | Threshold | Recipient |
| --- | --- | --- | --- |
| SLA-01A/B/C | status `new` | 15 / 30 / 45 min | agent / manager / founder |
| SLA-02A/B | `touched` | 24 / 36 h | agent / manager |
| SLA-03A/B | `in_discussion` | 24 / 36 h | agent / manager |
| SLA-04A/B | `nurturing` | 4 business days | agent / manager |

Plus cadences (CAD-01A/B/C: rnr / switched off / wrong number → a daily follow-up task on shift
days while the outcome holds and is under 7 days old; CAD-02A: in discussion every 48 business
hours) and task-due rules (TASK-01A reminder, TASK-01B manager escalation). Business hours IST
Monday to Saturday 09:00 to 19:00, with per-agent shift overrides. Admins add custom rules
(`USR-<id>`) from `/settings/follow-up-engine`. Response-time reporting uses
`business_minutes_between()` in SQL. Founders' SLA notifications are muted by preference today.

## Notifications and Web Push

`createNotification` is the chokepoint: it inserts the in-app row (the source of truth), then
`dispatchPush()` sends to every device in `push_subscriptions` (VAPID, the `web-push` library,
server and Node only, never throws, prunes 404/410 endpoints). Seam A: an optional
`notificationKey` gates the row and the push together (push rides the `in_app` channel). Seam B:
the broadcast WhatsApp senders. Callers include lead assignment, SLA fires, deals, tasks and
nudges, tickets (intake, sentinel, assignment), the Sia alarm (type `system`, unmutable), the
brief, alerts, deep reads, improvement requests and suggestions. iOS delivers only inside the
installed PWA. The three server VAPID keys must be on the Trigger.dev worker too, or job-made pushes
are silently off. Detail: `11-mobile-and-pwa.md`.

## Deepgram (voice)

One call site, `transcribeAudio()` in `transcription-service.ts` (server only; model `nova-2`,
language `hi-Latn` for Hinglish, keyword boosting). At most 3 MB per note, a 2-minute recording
cap (`useAudioRecorder`). `<DictationButton>` drops the transcript into the field as an editable
draft (never auto-sends); Elaya's WhatsApp voice notes are transcribed server to server. Audio is
transcribed in memory and never stored (a logged D-01 carve-out). `DEEPGRAM_API_KEY`, Vercel only.

## Upstash Redis

One lazy client (`src/lib/redis.ts`, REST, `Redis.fromEnv()`), keys and TTLs only from
`lib/constants/redis-keys.ts` (Zoho's in `constants/zoho.ts`), cache-aside through
`withRedisCache`. Redis is an optimisation, never a dependency: every read falls back to Postgres
(or Zoho). Two uses are state, not cache: the Sia alarm latches and the Zoho access token. Callers
include the Trigger.dev usage snapshot and alarm, so the Upstash vars are needed on the worker too.
Key registry and invalidation rules: `docs/architecture/caching.md`.

## Environment variables by runtime (names only)

- **Vercel:** Supabase URL, anon and service-role keys; `NEXT_PUBLIC_SITE_URL`;
  `PABBLY_WEBHOOK_SECRET`, `SHOP_APP_WEBHOOK_SECRET`; `UPSTASH_*`; `ANTHROPIC_API_KEY`;
  `DEEPGRAM_API_KEY`; `ELAYA_BRAIN_URL`, `BRAIN_API_SECRET`; `VAPID_*` +
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`; `GUPSHUP_*` (+ the optional customer welcome id);
  `FRESHDESK_DOMAIN`, `FRESHDESK_API_KEY`, `FRESHDESK_WEBHOOK_SECRET`; `ZOHO_*`;
  `MEMBER_VAULT_KEY` (+ `_VERSION`, `_PREVIOUS` in a rotation); `SIA_S3_*`; `TRIGGER_SECRET_KEY`
  (the prod key).
- **Trigger.dev worker:** Supabase URL and service-role key, plus `ANTHROPIC_API_KEY`, `GUPSHUP_*`,
  `VAPID_*`, `UPSTASH_*`, `FRESHDESK_DOMAIN` / `FRESHDESK_API_KEY`, `ZOHO_*`. A missing var fails
  quietly inside a job.
- **Fargate `api`:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
  `BRAIN_API_SECRET` (SSM), `WEB_APP_URL`. `BRAIN_API_SECRET` lives in four places that move
  together (`backend/.env`, `.env.local`, Vercel, SSM); after an SSM change force a new deployment.
- **Fargate `watcher`:** Supabase URL and service-role key, the S3 bucket name from the addon.
- `.env.example` still lacks the `GUPSHUP_*`, `WHATSAPP_*`, `SIA_S3_*` and `TRIGGER_SECRET_KEY`
  names. Full registry: `docs/operations/environments.md`.

## Deploying and proving it landed

Checklist: `pnpm tsc --noEmit` and `pnpm build` clean → migrations (list, dry run, push, verify;
a schema move ships with its code) → env parity on every runtime → push `main` and confirm the
Vercel Production deployment carries your SHA → `pnpm trigger:deploy` if a task or anything it
imports changed → `copilot svc deploy --name api --env prod` if `backend/` changed (and always
after a schema move), `--name watcher` if `connector/` changed → verify each running state → a
changelog entry. Proving rules: capture the real exit code (never a pipe's), read the running task
and its revision, count real Trigger.dev runs after an env change. The Vercel region and the
Supabase region are not recorded in the repo (`deployment.md` leaves it as a TODO;
`upstash-redis.md` says Mumbai for all three).
