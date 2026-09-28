# WhatsApp / Gupshup

> **Purpose:** the business WhatsApp line: Gupshup configuration, the inbound webhook, the staff routing gate (Elaya on WhatsApp), the lead pipeline for unknown numbers, the outbound templates and the 24-hour free-text rule, the `notifyLeadAssigned` orchestrator, per-user gating, and the notification log.
> **Audience:** engineers. · **Source-of-truth scope:** everything between Serene and Gupshup/Meta on the one business number. Not here: the Sia WhatsApp group archive (a separate, unofficial companion device, see `sia-connector.md`); the `/whatsapp` page UI (`../pages/whatsapp.md`); form-lead ingestion (`lead-ingestion.md`); the customer welcome-blast contract (`../modules/customer-welcome-blast.md`); Elaya's brains and tools (`../modules/elaya.md`).
> **Last verified:** 2026-09-26 against `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/services/whatsapp-api.ts`, `whatsapp-ingestion.ts`, `whatsapp-media.ts`, `elaya-whatsapp.ts`, `elaya-customer.ts`, `lead-assignment-notify.ts`, `elaya-service.ts` (`waFreeTextWindowOpen`), `profiles-service.ts` (`getActiveProfileByPhone`), `src/lib/constants/whatsapp.ts`, `src/lib/constants/notification-categories.ts`, `src/lib/utils/whatsapp-format.ts`, `src/lib/supabase/schemas.ts`.

---

## 1. Provider and configuration

**Provider:** Gupshup v1 (the BSP). The original Meta Cloud API integration was reverted
(Decision Log 2026-05-30): Gupshup owns WABA compliance, template registration and delivery
receipts. The Meta-direct code paths still compile but are dormant.

**Env (`whatsapp-api.ts`):** `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`,
`GUPSHUP_WEBHOOK_SECRET`. The module does not throw at import; `assertGupshupConfigured()` throws
on the first SEND if one is missing, so the Trigger.dev build scan can import the module without
secrets. The `WHATSAPP_*` Meta vars are optional (dormant path).
`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is optional; the customer welcome is skipped until it is set.

**Sends happen in two runtimes.** Vercel sends lead assignment, task assignment, lead
initiation, agent replies, Elaya replies and customer replies. The Trigger.dev worker sends the SLA alerts, task reminders and nudges, the Sia
watcher alarm, the founders' brief and the live alerts. The `GUPSHUP_*` vars must therefore exist
in BOTH environments. TODO: verify the Trigger.dev prod environment carries them: an operator note
of 2026-09-22 (not in the changelog) found the brief's WhatsApp send failing there with "Missing
required env vars". Full registry: `../operations/environments.md`.

**Outbound endpoints** (both POST `application/x-www-form-urlencoded`, auth via the `apikey`
header, not Bearer):

- Templates: `https://api.gupshup.io/wa/api/v1/template/msg`
- Free text and media: `https://api.gupshup.io/wa/api/v1/msg`

**The Gupshup 200 quirk:** Gupshup answers HTTP 200 even for application errors.
`isGupshupDelivered()` returns false when the parsed body is `{ status: 'error' }`; a non-JSON
body is trusted as delivered. Delivered = `res.ok` AND the body is not `status: 'error'`.

## 2. Service files (never blur them)

All the WhatsApp tables live in the `gia` schema since 2026-09-17 (migration 0210):
`whatsapp_conversations`, `whatsapp_messages`, `whatsapp_conversation_reads`,
`whatsapp_notification_logs`. Code reaches them through `giaDb(client)`
(`src/lib/supabase/schemas.ts`); Realtime channels name `schema: "gia"`.

| File | Client | Role |
| ---- | ------ | ---- |
| `whatsapp-service.ts` | session (RLS applies) | UI-facing reads only: conversations, messages, unread, read marks, search |
| `whatsapp-api.ts` | HTTP to Gupshup | **Server only.** Every outbound send plus the notification log. Never import in a client component |
| `whatsapp-ingestion.ts` | admin | **Server only.** The inbound lead pipeline. `processStatusUpdate` is the only UPDATE ever made to `whatsapp_messages` (delivery receipts, the documented A-11 exception) |
| `whatsapp-media.ts` | admin + Storage | **Server only.** Media durability (0141): `storeInboundMedia` copies the time-limited Gupshup CDN file into the private `whatsapp-media` bucket; `signMediaPath` mints signed read URLs |
| `elaya-whatsapp.ts` | admin | **Server only.** The staff routing gate and Elaya's WhatsApp turn (§3) |
| `elaya-customer.ts` | admin | **Server only.** The customer Elaya channel (0151), called only from `processInboundMessage` (§8) |

## 3. Inbound: `POST /api/webhooks/whatsapp`

`src/app/api/webhooks/whatsapp/route.ts`, `maxDuration = 180` (covers an Elaya turn plus the
customer-channel work inside `after()`).

- **Rate limit:** `createRateLimiter({ windowMs: 60_000, max: 300 })` per IP, applied first,
  before the body is read. Three times the leads route's cap, because delivery receipts make
  Gupshup traffic bursty.
- **Auth:** the `x-gupshup-secret` header against `GUPSHUP_WEBHOOK_SECRET`, compared with
  `safeSecretCompare` (timing-safe). The handler reads the body before the secret compare; only
  the rate limit comes before the body read.
- **Always 200** once auth passes, even for a bad payload, so Gupshup does not retry-storm. All
  processing runs in `after()`.
- **GET:** the Meta hub-challenge (also used by Gupshup for URL verification); any other GET
  answers a plain 200 `OK`.
- **Envelope (Gupshup v2, active):** `{ type: 'message', payload: { id, source, sender: { name },
  payload: { … } } }`. `messageId` ← `payload.id`, `waId` ← `payload.source` (no `+`), `phone` ←
  `+${payload.source}`. `message-event` and `billing-event` are acknowledged silently. The Meta v3
  parser exists but is dormant.
- **Media mapping:** `buildGupshupMessage()` maps each inner type to a typed message. Text and
  audio pass through; image, video, audio and `file` (Gupshup's word for document) carry the
  direct, time-limited CDN URL. Types that cannot be rendered (sticker, location, contact,
  reaction, button and list replies) become labelled text like `[Sticker]`, so a bubble is never
  blank. `WHATSAPP_DEBUG_MEDIA=true` turns on extra media logging.
- The route is excluded from the session proxy (`../architecture/auth-and-rbac.md` §7).

### The staff routing gate (runs BEFORE the lead pipeline)

Every inbound `message` event first calls `tryHandleElayaWhatsAppMessage(phone, message)`
(`elaya-whatsapp.ts`), before `processInboundMessage`. The sender is normalised
(`normalizeWaPhone`) and matched against ACTIVE `profiles` by `getActiveProfileByPhone`: an exact
match first, then a digits-only comparison over the small set of staff with a phone.

- **No profile matches: the gate returns false** and the lead pipeline runs. Only unknown numbers
  reach it.
- **A profile matches but Elaya is off for their team** (`hasElayaAccess(profile)` is false; see
  `ELAYA_DOMAINS` in `src/lib/constants/route-permissions.ts`): one plain line says Elaya is not
  switched on for their team yet, and the gate returns true. The message is swallowed, never a lead.
- **A profile matches and Elaya is on:** the full staff turn runs inside the route's `after()`,
  and the gate returns true on every path, failures included, so a staff message can never mint a
  lead. The turn writes only `elaya_messages` (channel `whatsapp`) and an `elaya_reply` log row,
  never `leads` or the lead WhatsApp tables. If the staff number also matches an active lead, the
  profile wins and a `phone collision` warning is logged.

**The one identity is `profiles.phone`.** If a staff member's phone is blank (or wrong) the gate
cannot see them, and their message becomes a NEW LEAD: round-robin assigned, the agent pinged, SLA
timers armed, and Elaya never sees it. Nothing logs an error. This happened on 2026-09-22 when a
founder's phone was cleared. When Elaya is "silent" to one person, check in this order:
(1) `profiles.phone` and `is_active` for them; (2) the newest `gia.leads` rows ending in their last
four digits (a stray lead means the gate missed); (3) their `elaya_messages` on channel `whatsapp`
(a user row with no reply, or `meta.turnError`); (4) `gia.whatsapp_notification_logs` type
`elaya_reply` with `delivered = false`. The fix is to restore the phone and junk the stray lead. A
guard that refuses to mint a lead for a number linked to staff in `sia.wag_contacts` is an idea,
not built.

**Inside the staff turn:**

- **Dedup first.** `hasProcessedWaMessage(message.id)` (reads `meta->>wa_message_id`); the partial
  UNIQUE index `idx_elaya_messages_wa_dedup` (0148) is the backstop, so a redelivery never burns
  the cap or answers twice.
- **Input.** Text as is. A voice note is transcribed in memory by Deepgram (15 s download timeout,
  16 MB cap) and never stored; an empty transcript gets a short nudge and burns no cap. An image,
  video or document with a caption uses the caption as the message; without one, a "text and
  voice notes only" nudge.
- **Which brain thinks.** The `elaya_settings` row `brain_whatsapp` (`node` | `python`), read per
  message. `python` goes through `runPythonBrainTurn` (`src/lib/elaya/python-brain.ts`) to the
  FastAPI brain, which then owns the cap, session, persistence and turn. If the row says python
  but `ELAYA_BRAIN_URL` / `BRAIN_API_SECRET` are missing, the Node brain answers (logged). There
  is no automatic fallback when the Python brain fails; the row is the kill switch. Both channels
  are on Python today; the Node thinking loop is frozen (see `../modules/elaya.md`).
- **The holding line.** If the Python brain has not answered after 15 s, one "On it" line goes
  out first, then the real answer.
- **The reply.** `markdownToWhatsApp()` (`src/lib/utils/whatsapp-format.ts`) turns model markdown
  into WhatsApp formatting (`**x**` to `*x*`, headings to a bold line, bullets to a plain dash,
  links to `text (url)`). An answer over 4,000 characters is split into several messages by
  `splitWhatsAppText` and sent in order, never cut (2026-09-24). Each part is one
  `sendElayaWhatsAppReply` call with an `elaya_reply` log row.
- **After the reply,** `learnFromTurn` updates the person's living memory (non-fatal).

### `processInboundMessage()`: the lead pipeline (`whatsapp-ingestion.ts`)

For numbers the gate did not claim:

1. Normalise the phone to E.164 (raw `+` fallback when parsing fails).
2. **Dedup** on `wa_message_id`; exit quietly if already processed.
3. `resolveLeadByPhone()`: the most recent non-archived lead with that phone.
4. **No lead: create one** with `createLeadFromWhatsApp` (`lead-ingestion.ts`). Domain defaults
   to `onboarding` (WhatsApp leads carry no UTM), round-robin assigns, lead and activities are
   inserted. When another message won the insert race (the 0137 phone-unique backstop,
   `alreadyExisted`), notifications and SLA arming are skipped and only this message is attached.
   Otherwise it awaits `invalidateLeadCaches` and then `await notifyLeadAssigned({ isNew: true,
   scheduleSla: true })`. A plain `await` is required: this code already runs inside the route's
   `after()`, and a `void` would detach the send and lose it when the lambda freezes.
5. **Lead exists:** the message threads into that lead's conversation, with no staff
   notification (the customer channel may still reply, step 9).
6. In parallel: `getOrCreateConversation()` (select, insert with `lead_id` unique, re-select) and
   media durability (download the CDN file and store it in the private bucket; on failure keep the
   raw URL, non-fatally).
7. `insertInboundMessage`: content through `sanitizeText`; a failed insert logs loudly and aborts.
8. Update `last_message_at` (non-fatal).
9. **Customer Elaya layer** (0151, additive, awaited, non-fatal): never welcomed →
   `maybeSendCustomerWelcome`; already welcomed → `handleCustomerReply`, gated on
   `conversation.bot_active`. See §8.
10. Realtime broadcast is automatic via the `supabase_realtime` publication.

## 4. The orchestrator: `notifyLeadAssigned()` (`lead-assignment-notify.ts`)

The single entry point for every assignment side effect. Input: `leadId`, `assignedTo` (null =
no agent), `agentName`, `leadName`, `leadPhone`, `domain`, `isNew`, `isDuplicate`, `actorId?`,
`repeatEnquiry?`, `scheduleSla`, `leadStatus?` (default `new`), `assignedAt?`.

1. **Agent WhatsApp**, only when `assignedTo` is set and this is not a repeat enquiry.
2. **Founder WhatsApp**, on every non-duplicate, **currently paused**: see below.
   (1 and 2 run together under `await Promise.allSettled`; failures are logged, never thrown.)
3. **In-app notification** when `assignedTo` is set and is not the actor. A repeat enquiry (a
   known person asking about another shop product) swaps the copy to "New enquiry on your lead"
   naming the product. `notificationKey: 'lead_assigned'`.
4. **SLA timers** whenever `scheduleSla` is true, regardless of `assignedTo`: an unassigned lead
   must still arm the manager and founder escalation rules, and the agent rule skips itself at
   fire time. Never gate this on `assignedTo`. (The function's header comment still says "only
   when assignedTo is set"; the code is right, the comment is stale.)

**Founder pings paused (2026-09-21 and 2026-09-23).** At the founder's request:

- `FOUNDER_LEAD_ALERTS_PAUSED = true` in `src/lib/constants/whatsapp.ts` stops the "new lead"
  WhatsApp to every founder. To resume: set it to false and deploy.
- On 2026-09-23 the founders' own `notification_preferences` rows were set (data, not code) so no
  lead or SLA notification reaches a founder: `sla_escalation` off on in-app and WhatsApp,
  `new_lead_founder_alert` off on WhatsApp (so the pause survives a flip of the constant),
  `lead_won` off in-app. Each founder can turn these back on from /profile. Agents and managers
  are untouched; agent SLA alerts still fire.

**The Vercel contract (A-16):** the sends are awaited inside the orchestrator, and the
orchestrator is invoked inside `after()`. Awaiting without `after()` delays the response;
`after()` without awaiting orphans the sends when the lambda freezes. This closed the 2026-06-08
outage where `void fn().catch()` silently dropped most notifications.

| Path | File | Dispatch |
| ---- | ---- | -------- |
| Webhook form lead | `api/webhooks/leads/route.ts` | `after(notifyLeadAssigned(…))` |
| `assignLead`, bulk reassign | `lib/actions/leads.ts` (via `assignLeadCore`) | `after(notifyLeadAssigned(…))` |
| `createManualLead` (Add Lead) | `lib/actions/leads.ts` | `after(notifyLeadAssigned(…))` |
| WhatsApp inbound, new number | `whatsapp-ingestion.ts` | `await notifyLeadAssigned(…)` inside the route's `after()` |

## 5. Per-user gating

Broadcast senders in `whatsapp-api.ts` check the recipient's preferences (Seam B of migration
0133): `isChannelEnabled(userId, key, 'whatsapp')` for one recipient (`lead_assigned`,
`sla_breach`, `task_due`, `task_assigned`) and `filterRecipientsByPref(ids, key, 'whatsapp')`
for fan-outs (`new_lead_founder_alert`, `sla_escalation`, `task_overdue_manager`). Absence of a
row = ON; the gate fails open. Never gated: `lead_initiation`, Elaya replies, the customer sends,
and the Sia alarm (mission-critical). Catalog: `src/lib/constants/notification-categories.ts`;
gate: `notification-prefs-service.ts`.

The catalog also lists WhatsApp checkboxes for the ticket categories
(`ticket_proposed_for_approval`, `ticket_sla_breach_manager`, `ticket_member_unhappy`,
`ticket_daily_digest_founder`). No ticket template or sender exists yet: ticket notifications
are in-app plus push only, and nothing sends a daily ticket digest.

## 6. Outbound: templates and the 24-hour rule

WhatsApp allows free text to a person only within 24 hours of their last message to us. Outside
that window only an approved template can open the conversation.

**`waFreeTextWindowOpen(userId)`** (`elaya-service.ts`) is THE check for staff: true when the
person's last WhatsApp message to Elaya (`elaya_messages`, role user, channel whatsapp) is under
24 hours old. The founders' brief and the live alert sweep use it: window open means the full text
via `sendElayaWhatsAppReply`; window closed means **`sendElayaTemplatePing(to, recipientId,
firstName, title, body)`**, one template message over the Sia alert template with a one-line body
(Meta rejects newlines in a template parameter; body capped at 900 characters), logged as
`sia_alert`. The full text is still saved to their Elaya conversation, so "tell me more" works.

### The templates (`src/lib/constants/whatsapp.ts`)

| Constant | Who gets it | Params |
| -------- | ----------- | ------ |
| `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID` (`193e330d-…`) | agent: new lead assigned | agent first name · lead name · lead phone |
| `GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID` (`d5828042-…`) | founders: new lead (**paused**, §4) | domain · agent name · lead name · lead phone |
| `GUPSHUP_SLA_AGENT_TEMPLATE_ID` (`54d5dd55-…`) | agent: SLA breach | lead name · lead phone · status · last updated |
| `GUPSHUP_SLA_MANAGER_TEMPLATE_ID` (`682fd320-…`) | managers (and founders on SLA-01C): SLA breach | the four above + agent name |
| `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID` (`7aee2a33-…`) | the lead: agent-initiated outreach from the dossier | lead name · agent name |
| `GUPSHUP_TASK_DUE_REMINDER_TEMPLATE_ID` (`05411e50-…`) | agent: a lead task is due (TASK-01A) | agent first name · lead name · lead phone · task title |
| `GUPSHUP_TASK_OVERDUE_MANAGER_TEMPLATE_ID` (`c7ddd983-…`) | managers: a lead task is overdue (TASK-01B) | manager first name · agent name · lead name · task title · due time IST ("4:00 PM", never UTC or ISO) |
| `GUPSHUP_TASK_DUE_SOON_TEMPLATE_ID` (`123e5939-…`, 0142) | agent: any open task, 30 min before due | agent first name · task title · due time IST |
| `GUPSHUP_TASK_OVERDUE_AGENT_TEMPLATE_ID` (`7b926598-…`, 0142) | agent: task still open at due time | agent first name · task title · due time IST |
| `GUPSHUP_TASK_OVERDUE_MANAGER_GENERIC_TEMPLATE_ID` (`80aa1747-…`, 0142) | managers: a non-lead task is overdue | manager first name · agent name · task title · due time IST |
| `GUPSHUP_TASK_ASSIGNED_TEMPLATE_ID` (`1cb3c51f-…`, 0153) | assignee: a task was assigned; also every repeat nudge (0232) | assignee first name · assigner name · task title · due text |
| `GUPSHUP_SIA_ALERT_TEMPLATE_ID` (`28d339f8-…`, registered 2026-08-29) | the Sia watcher alarm (tier 1, then founders); also `sendElayaTemplatePing` for the brief and alerts | first name · title · detail |
| `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` (from env, 0151) | the lead: first-touch welcome | customer first name. Skipped unless `CUSTOMER_WELCOME_TEMPLATE_CONFIGURED` |

Every template sender is a thin wrapper over the internal `sendGupshupTemplate()`, which owns the
fetch, the delivered check and the one-log-row-per-attempt `finally { await logNotification }`
contract. Never call the template endpoint outside it. Senders never throw to their callers,
with one exception: `sendLeadInitiationMessage` re-throws after logging so the dossier can show
the failure (keep the `throw`). A recipient with no `profiles.phone` is skipped with a warning
(in-app and push still reach them).

**Free-text senders:** `sendElayaWhatsAppReply` (staff replies, the brief and alerts inside the
window), `sendCustomerWhatsAppReply` (the customer channel), `sendTextMessage` and
`sendGupshupMediaMessage` (agent replies and attachments from `/whatsapp`; the customer channel
also sends media through the latter).

**The Sia alarm sender** `sendSiaAlertNotification(title, body, audience)` resolves its own
recipients: `tier1` = the named responders in `src/lib/constants/sia-alerts.ts`, `founders` = role
founder, `both`. It is deliberately not gated by preferences. The alarm logic is in
`src/trigger/sia-silence.ts` (`trigger-dev.md` §6). Two other callers reuse it for the tech
responders: Elaya's `raise_improvement_request` tool (`elaya/tools/write-registry.ts`) and the
alert sweep's "Elaya went silent on a message" alert.

## 7. Notification log: `gia.whatsapp_notification_logs`

One row per send attempt, written by `logNotification()` awaited in each send's `finally`
(durable before the lambda can freeze; swallows its own errors). Covers templates and the
free-text sends.

| Column | Value |
| ------ | ----- |
| `type` | 14 values: `agent_assignment` · `founder_alert` · `sla_breach` · `lead_initiation` · `task_due_reminder` · `task_overdue_manager` (0113) · `elaya_reply` (0117) · `task_due_soon` · `task_overdue_agent` · `task_overdue_manager_generic` (0142) · `customer_welcome` · `customer_reply` (0151) · `task_assigned` (0153) · `sia_alert` (0177; also the Elaya template ping) |
| `recipient_phone` / `lead_phone` | **last 4 digits only**; full numbers are never stored (D-04) |
| `gupshup_status` | HTTP status; `0` = the fetch itself failed |
| `gupshup_body` | response body, cut to 2,000 characters |
| `delivered` | `res.ok` AND the body is not `{status:'error'}` |

RLS: admin and founder SELECT only.

**Behaviour notes.**

1. Unassigned new lead (empty round-robin pool): the agent send is skipped; the founder send
   would fire with `agentName: 'Unassigned'` if it were not paused.
2. Duplicate active resubmission: no founder send, no agent send, no SLA re-arm. A repeat shop
   enquiry gets the in-app "new enquiry" line only. Open question: should the original agent be
   re-pinged on a plain resubmission?
3. Inbound on an existing lead: no staff notification; agents see it through the `/whatsapp`
   unread badge. The customer channel may still auto-reply.
4. Delivery receipts: `processStatusUpdate` records them on `whatsapp_messages`; there is no
   retry or alert on a failed delivery. The log table is the audit surface.

## 8. The customer channel (pointer)

The outward-facing twin of the staff gate, for numbers that are LEADS. It runs inside the lead
pipeline (step 9), never instead of it, and only on the Node side (`src/lib/elaya/customer-brain.ts`
under `resolveCustomerPrincipal`, a hard-capped principal that cannot read staff or CRM data).
Summary: the approved welcome template fires exactly once per lead (the `welcomed_at` stamp-once
UPDATE), later messages get a reply from the `elaya_training_assets` library (up to 4 media per
turn), an agent's manual reply sets `bot_active = false` and Elaya stays quiet on that thread, and
every send logs `customer_welcome` / `customer_reply`. Replies are stored as bot rows in the lead's
`whatsapp_messages` thread. Full contract: `../modules/customer-welcome-blast.md`.
