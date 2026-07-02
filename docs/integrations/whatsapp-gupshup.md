# WhatsApp / Gupshup

> **Purpose:** the WhatsApp integration: Gupshup configuration, the inbound webhook contract, the inbound-message pipeline (incl. WhatsApp-origin lead creation and the media durability layer), the 12 outbound templates, the `notifyLeadAssigned` orchestrator, per-user notification gating, the Elaya staff and customer channels, and the notification log.
> **Audience:** engineers. · **Source-of-truth scope:** everything between Serene and Gupshup/Meta. The `/whatsapp` page UI lives in `../pages/whatsapp.md`; the WhatsApp tables in `../architecture/database.md`; form-lead ingestion in `lead-ingestion.md`; the customer welcome-blast contract in `../modules/customer-welcome-blast.md`.
> **Last verified:** 2026-07-02 against `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/services/whatsapp-api.ts`, `whatsapp-ingestion.ts`, `whatsapp-media.ts`, `lead-assignment-notify.ts`, `src/lib/constants/whatsapp.ts`, `src/lib/services/elaya-whatsapp.ts`, `elaya-customer.ts`.

---

## 1. Provider & configuration

**Provider:** Gupshup v1 (BSP). The original Meta Cloud API direct integration was reverted
(Decision Log 2026-05-30) — Gupshup owns WABA compliance, template registration, and delivery
receipts. The Meta-direct code paths still compile but are dormant.

**Required env (`whatsapp-api.ts`):**
`GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`.
Validation is deferred: the module no longer throws at import. `assertGupshupConfigured()`
throws on the first SEND if a var is missing, so the Trigger.dev build scan can import the
module without the runtime secrets. The `WHATSAPP_*` Meta vars are optional (dormant path).
`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is optional; the customer welcome send is skipped
until it is set (`CUSTOMER_WELCOME_TEMPLATE_CONFIGURED`). Full registry:
`../operations/environments.md`.

**Outbound endpoints** (both POST `application/x-www-form-urlencoded`, auth via `apikey`
header — not Bearer):

- Templates → `https://api.gupshup.io/wa/api/v1/template/msg`
- Free text → `https://api.gupshup.io/wa/api/v1/msg`

**The Gupshup 200 quirk:** Gupshup returns HTTP 200 even for application-level errors.
`isGupshupDelivered()` returns `false` when the parsed body is `{ status: 'error' }`; a
non-JSON body is trusted as delivered. Delivered = `res.ok` AND body not `status:'error'`.

## 2. Service-file boundaries (five files, never blur them)

| File | Client | Role |
| ---- | ------ | ---- |
| `whatsapp-service.ts` | session (RLS applies) | UI-facing queries only — conversations, messages, unread, read-marks, search |
| `whatsapp-api.ts` | HTTP → Gupshup | **SERVER ONLY.** Outbound sends + notification logging. Never import in client components |
| `whatsapp-ingestion.ts` | admin client | **SERVER ONLY.** Inbound pipeline; `processStatusUpdate` is the only UPDATE ever made to `whatsapp_messages` (delivery receipts — the documented A-11 exception) |
| `whatsapp-media.ts` | admin client + Storage | **SERVER ONLY.** Media durability (migration 0141): `storeInboundMedia` downloads the time-limited Gupshup CDN url and re-uploads to the private `whatsapp-media` bucket; `signMediaPath` mints signed read urls |
| `elaya-customer.ts` | admin client | **SERVER ONLY.** The customer Elaya channel (migration 0151): `maybeSendCustomerWelcome` + `handleCustomerReply`, called only from `processInboundMessage`. See §8 |

## 3. Inbound webhook — `POST /api/webhooks/whatsapp`

`src/app/api/webhooks/whatsapp/route.ts`, exports `maxDuration = 180` (raised from 60 to
cover the Elaya brain turn and the customer-channel work inside `after()`).

- **Rate limit:** `createRateLimiter({ windowMs: 60_000, max: 300 })` per IP, applied first,
  before `req.text()` (security-audit F-4). The cap is 3x the leads route's: delivery
  receipts make Gupshup traffic burstier.
- **Auth:** `x-gupshup-secret` header, compared with `safeSecretCompare` (timing-safe,
  equal-length buffer guard). Note: the handler reads `await req.text()` before the secret
  compare; only the rate limit precedes the body read.
- **Always returns 200** after auth passes — even on bad payloads — so Gupshup/Meta do not
  retry-storm. All processing is deferred via `after()`.
- **GET handler:** Meta hub-challenge verification (Gupshup also uses it for URL verification).
- **Envelope (Gupshup v2, active):** `{ type: 'message', payload: { id, source,
  sender: { name }, payload: { … } } }` → `messageId` ← `payload.id`, `waId` ←
  `payload.source` (no `+`), `phone` ← `+${payload.source}`. `message-event` /
  `billing-event` types are acknowledged silently. The Meta v3 envelope parser exists but is
  dormant.
- **Media-aware mapping:** `buildGupshupMessage()` maps every inner type to a typed
  `MetaInboundMessage`. text and audio pass through; image / video / audio / `file`
  (Gupshup's name for document) become media messages carrying the direct, time-limited
  Gupshup CDN url (`inner.url` + `contentType` / `caption` / `name`), so no Meta media-id
  fetch is needed. Un-renderable types (sticker / location / contact / reaction / button and
  list replies) become labelled text like `[Sticker]` so a bubble is never stored blank.
- The route is excluded from the Next.js proxy session refresh (see
  `../architecture/auth-and-rbac.md` §7).

### Elaya staff routing gate — runs BEFORE the lead pipeline (both branches)

Every inbound `message` event (the active Gupshup branch **and** the dormant Meta branch) first
calls `tryHandleElayaWhatsAppMessage(phone, message)` (`src/lib/services/elaya-whatsapp.ts`)
**before** `processInboundMessage`. The sender number is matched (via the shared `normalizeWaPhone`)
against active `profiles`:

- **Known staff number → Elaya staff channel.** The gate runs Elaya's full brain turn to
  completion inside the route's existing `after()` (cap/session/tools — same brain, cap, and 24h
  session as in-app), sends one reply via `sendElayaWhatsAppReply` (`elaya_reply` audit row,
  migration 0117), and returns `true`. A staff message **never enters the lead pipeline** — it
  writes only `elaya_messages`, never `leads`/`whatsapp_conversations`/`whatsapp_messages`. Once a
  profile matches, the gate returns `true` on every path including failures, so a staff message can
  never fall through and mint a lead.
- **Idempotency (migration 0148):** the gate first checks `hasProcessedWaMessage(message.id)`
  (`elaya-service.ts`, reads `meta->>wa_message_id`). A partial UNIQUE index
  (`idx_elaya_messages_wa_dedup`, migration 0148) is the structural backstop: a concurrent Gupshup redelivery that
  races past the check hits 23505 on the insert and the turn stops, so a redelivered staff
  message never burns the cap or double-replies.
- **Voice notes (E4a):** `message.type === 'audio'` → `transcribeWhatsAppAudio` fetches the
  Gupshup CDN url (15s timeout, 16MB cap) and transcribes via Deepgram
  (`transcription-service.ts`); the transcript runs the same brain turn. An empty transcript
  gets a graceful nudge reply and burns no cap.
- **Unknown number → falls through.** The gate returns `false` and the lead pipeline
  (`processInboundMessage`) runs; only an unknown number reaches it. The lead pipeline now
  ends with the customer-Elaya layer (§8), so an unknown prospect can also get an automated
  reply, from the customer channel rather than the staff one.

### `processInboundMessage()`: the 10-step pipeline (`whatsapp-ingestion.ts`)

1. Normalize phone to E.164 (raw `+`-prefixed fallback on parse failure).
2. **Idempotency:** dedup on `wa_message_id` — exits silently if already processed.
3. `resolveLeadByPhone()` — most recent non-archived lead with that phone.
4. **No lead → Pipeline B lead creation:** `createLeadFromWhatsApp(waId, phone, senderName)` —
   domain defaults to `DEFAULT_LEAD_DOMAIN` (**`onboarding`** — WhatsApp leads carry no UTM),
   round-robin assigns, inserts lead + activities. It returns `alreadyExisted` (the 0137
   phone-unique-index race backstop): when another inbound message won the insert race, the
   assignment notification and SLA arm are **skipped** and only this message is attached.
   Otherwise the path awaits `invalidateLeadCaches(lists + dashboard)` and then
   **`await notifyLeadAssigned({ …, isNew: true, scheduleSla: true })`**. A plain `await`
   (not `void`, not nested `after()`) is required here: this code already runs inside the
   route's `after()`; a `void` would detach the send from the tracked chain and Vercel would
   freeze the lambda before Gupshup is reached.
5. **Lead exists** → the message threads into that lead's conversation; **no staff
   notifications** (the customer-Elaya layer at step 9 may still reply to the prospect).
6. Steps 6a and 6b run **concurrently** (`Promise.all`, perf pass 2026-07-02):
   - 6a. `getOrCreateConversation()`: SELECT → INSERT (`lead_id` unique; conflict ignored) →
     re-SELECT (race-safe).
   - 6b. **Media durability (migration 0141):** the Gupshup CDN url is time-limited, so
     `storeInboundMedia` downloads the bytes and re-uploads them to the private
     `whatsapp-media` bucket; the durable storage path is what `media_url` stores (reads mint
     signed urls via `signMediaPath`). On failure it falls back to the raw CDN url,
     non-fatally. The dormant Meta branch resolves a media-id via `getMediaDownloadUrl`
     first, then follows the same store-then-fallback path.
7. `insertInboundMessage`: content sanitized via `sanitizeText`; a failed insert logs loudly
   and aborts (the message must not be silently lost).
8. Update `last_message_at` (non-fatal).
9. **Customer-Elaya layer (migration 0151, additive):** dynamic import of `elaya-customer.ts`.
   Never welcomed (`leads.welcomed_at IS NULL`) → `maybeSendCustomerWelcome` (the approved
   welcome template, exactly once via the stamp-once UPDATE guard). Already welcomed →
   `handleCustomerReply`, gated on `conversation.bot_active`. Awaited, non-fatal. See §8.
10. Realtime broadcast is automatic via the `supabase_realtime` publication.

## 4. The orchestrator — `notifyLeadAssigned()` (`lead-assignment-notify.ts`)

Single entry point for all assignment side-effects. Input: `leadId`, `assignedTo` (null = no
agent), `agentName`, `leadName`, `leadPhone`, `domain`, `isNew`, `isDuplicate`, `actorId?`,
`scheduleSla`, `leadStatus?` (default `'new'`), `assignedAt?`.

Order and gating:

1. **Agent WhatsApp** — only when `assignedTo` is set.
2. **Founder WhatsApp** — on every non-duplicate (`agentName ?? 'Unassigned'`).
   (1 + 2 run via `await Promise.allSettled` — failure-isolated, logged, never thrown.)
3. **In-app notification** — when `assignedTo` set AND `assignedTo !== actorId`
   (self-notify suppressed). Fire-and-forget. Passes `notificationKey: 'lead_assigned'`
   (Seam A of the per-user control plane, migration 0133).
4. **SLA timers**: when `scheduleSla`, **regardless of `assignedTo`**. An unassigned new
   lead still arms the manager/founder escalation rules (SLA-01B/01C); those resolve
   recipients from the domain at fire time, and the agent rule (SLA-01A) self-skips at fire
   when `assignedTo` is null. Never gate this on `assignedTo`; that bug once left unassigned
   leads with zero timers. (Dynamic import of `scheduleSlaTimersForLead`.)

**Per-user notification controls (migration 0133).** Every broadcast sender in
`whatsapp-api.ts` checks the recipient's preferences before sending (Seam B):
`isChannelEnabled(userId, key, 'whatsapp')` for single recipients (`lead_assigned`,
`sla_breach`, `task_due`) and `filterRecipientsByPref(ids, key, 'whatsapp')` for fan-outs
(`new_lead_founder_alert`, `sla_escalation`, `task_overdue_manager`). Absence = ON; the gate
fails open. `lead_initiation` and the customer sends are transactional and deliberately not
gateable. Catalog: `src/lib/constants/notification-categories.ts`; gate:
`notification-prefs-service.ts`.

**The Vercel contract (A-16):** the outward sends are *awaited* inside the orchestrator, and
the orchestrator is invoked inside `after()` — awaiting without `after()` would delay the
response; `after()` without awaiting would orphan the sends when the lambda freezes. Both
halves are required. This closed the 2026-06-08 outage where `void fn().catch()` silently
dropped most notifications (no error, no log row — only lucky survivors logged).

### The four assignment paths (all route through the orchestrator)

| Path | File | Dispatch |
| ---- | ---- | -------- |
| Webhook ingestion | `api/webhooks/leads/route.ts` | `after(notifyLeadAssigned(…))` |
| `assignLead` (reassign) | `lib/actions/leads.ts` | `after(notifyLeadAssigned(…))` |
| `createManualLead` (Add Lead) | `lib/actions/leads.ts` | `after(notifyLeadAssigned(…))` |
| WhatsApp inbound (new number) | `lib/services/whatsapp-ingestion.ts` | `await notifyLeadAssigned(…)` inside the route's `after()` |

## 5. The 12 templates (`src/lib/constants/whatsapp.ts`)

| Constant | Purpose | Params |
| -------- | ------- | ------ |
| `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID` (`193e330d-…`) | agent: new lead assigned | agent first name · lead name · lead phone |
| `GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID` (`d5828042-…`) | all founders: new lead | domain · agentName · leadName · leadPhone |
| `GUPSHUP_SLA_AGENT_TEMPLATE_ID` (`54d5dd55-…`) | agent: SLA breach | leadName · leadPhone · status · lastUpdatedAt |
| `GUPSHUP_SLA_MANAGER_TEMPLATE_ID` (`682fd320-…`) | managers (and founders, SLA-01C): SLA breach | + agentName (5 params) |
| `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID` (`7aee2a33-…`) | agent-initiated outreach from the dossier | leadName · agentName |
| `GUPSHUP_TASK_DUE_REMINDER_TEMPLATE_ID` (`05411e50-…`) | agent: gia_followup task due (TASK-01A) | agent first name · lead name · lead phone · task title |
| `GUPSHUP_TASK_OVERDUE_MANAGER_TEMPLATE_ID` (`c7ddd983-…`) | domain managers: gia task overdue +30 min (TASK-01B) | manager first name (per-recipient) · agent name · lead name · task title · due time **IST human format ("4:00 PM") — never UTC/ISO** |
| `GUPSHUP_TASK_DUE_SOON_TEMPLATE_ID` (`123e5939-…`, 0142) | agent: any open task, 30 min before due | agent first name · task title · due time IST |
| `GUPSHUP_TASK_OVERDUE_AGENT_TEMPLATE_ID` (`7b926598-…`, 0142) | agent: task still open at due time | agent first name · task title · due time IST |
| `GUPSHUP_TASK_OVERDUE_MANAGER_GENERIC_TEMPLATE_ID` (`80aa1747-…`, 0142) | managers: non-lead task overdue (generic, no lead name) | manager first name · agent name · task title · due time IST |
| `GUPSHUP_TASK_ASSIGNED_TEMPLATE_ID` (`1cb3c51f-…`, 0153) | assignee: a task was assigned to them | assignee first name · assigner name · task title · due text |
| `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` (env-driven, 0151) | the lead (prospect): first-touch welcome | customer name. Read from `process.env`; `sendCustomerWelcomeTemplate` skips the send unless `CUSTOMER_WELCOME_TEMPLATE_CONFIGURED` |

All template senders are thin wrappers over the internal `sendGupshupTemplate()` core, which
owns the fetch, status/body/delivered capture, and the one-log-row-per-attempt
`finally { await logNotification }` contract. Never call the Gupshup template endpoint outside
it. The senders never throw to their callers;
**`sendLeadInitiationMessage` is the sole exception** — it re-throws after logging so the
dossier action can surface the failure to the UI (do not remove the `throw`).

## 6. Notification log — `whatsapp_notification_logs`

One row per send attempt, written by `logNotification()` **awaited in each send's
`finally`** (durably written before the lambda may freeze; swallows its own errors). Since
0151 the table also logs the free-form customer session sends, not only template attempts.

| Column | Value |
| ------ | ----- |
| `type` | 13-value CHECK: `agent_assignment` · `founder_alert` · `sla_breach` · `lead_initiation` · `task_due_reminder` · `task_overdue_manager` (0113) · `elaya_reply` (0117) · `task_due_soon` · `task_overdue_agent` · `task_overdue_manager_generic` (0142) · `customer_welcome` · `customer_reply` (0151) · `task_assigned` (0153) |
| `recipient_phone` / `lead_phone` | **last 4 digits only** — full numbers never stored (D-04) |
| `gupshup_status` | HTTP status; `0` = network-level fetch error |
| `gupshup_body` | response body, truncated to 2000 chars |
| `delivered` | `res.ok` AND body not `{status:'error'}` |

RLS: admin/founder SELECT only.

## 7. Behavioural notes & open product decisions

1. **Unassigned new lead** (empty round-robin pool): agent send skipped, founder send still
   fires with `agentName: 'Unassigned'`.
2. **Duplicate active resubmission:** founder send suppressed, agent send skipped, no SLA
   reschedule. *Open question:* should the original agent be re-pinged on resubmission?
3. **Inbound message on an existing lead:** no staff notification, since a reply on an existing
   thread is not a new assignment. Agents discover it via the `/whatsapp` unread badge. The
   customer-Elaya layer (§8) may still auto-reply to the prospect when `bot_active` is on.
4. **Delivery receipts:** `processStatusUpdate` records Gupshup delivery events on
   `whatsapp_messages` (the A-11 exception); there is no retry/alert pipeline on failed
   deliveries yet — the log table is the audit surface.

## 8. The Elaya customer channel (migration 0151, shipped 2026-06-26)

The outward-facing twin of the staff gate. Where the staff gate runs for a number that
matches a profile, this runs for a number that is a **lead**. It is wired into the lead
pipeline (`processInboundMessage` step 9), never replacing it: the lead is still created,
round-robin assigned, and the founder/agent notified. Full contract:
`../modules/customer-welcome-blast.md`.

- **`maybeSendCustomerWelcome(lead)`**: on a brand-new lead's first message, the approved
  Gupshup welcome template, fired **exactly once per lead**. The exactly-once contract is the
  `UPDATE leads SET welcomed_at = … WHERE welcomed_at IS NULL RETURNING` stamp: only the call
  that wins the stamp sends, and the stamp is never rolled back. Skipped entirely until
  `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is set in env
  (`CUSTOMER_WELCOME_TEMPLATE_CONFIGURED`).
- **`handleCustomerReply(...)`**: on a welcomed lead's subsequent inbound (24h session
  window open), runs `runCustomerTurn` (`customer-brain.ts`) under
  `resolveCustomerPrincipal`, a hard-capped principal whose toolset
  (`customer-registry.ts`: `get_company_material`, `note_customer_interest`) cannot read any
  staff/CRM data. Facts come only from the `elaya_training_assets` KB (migration 0150); it
  can share up to `MAX_MEDIA_PER_TURN = 4` media assets per turn via
  `sendGupshupMediaMessage`, spaced, never a dump. Voice notes are transcribed the same way
  as the staff channel.
- **Agent take-over:** `handleCustomerReply` is gated on
  `whatsapp_conversations.bot_active`. When an agent sends a manual reply
  (`actions/whatsapp.ts`), `bot_active` flips to `false` and `bot_paused_by` /
  `bot_paused_at` record who took over and when; Elaya then stays quiet on that thread.
- **Persistence:** the customer transcript is the existing `whatsapp_messages` thread.
  Elaya's replies are `direction: 'outbound'`, `sender_type: 'bot'`, `is_bot: true` rows,
  visible in `/whatsapp` and the dossier. There is no `elaya_conversations` row (that table
  is profile-keyed, staff only).
- **Logging:** every send writes a `whatsapp_notification_logs` row (`customer_welcome` /
  `customer_reply`), same one-log-row-per-attempt contract as the templates.
- **Lifecycle:** everything runs inside the webhook route's `after()` and never throws into
  the lead pipeline; a customer-channel failure never loses the lead or the message.
