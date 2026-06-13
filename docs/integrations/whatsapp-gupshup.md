# WhatsApp / Gupshup

> **Purpose:** the WhatsApp integration — Gupshup configuration, the inbound webhook contract, the inbound-message pipeline (incl. WhatsApp-origin lead creation), the five outbound templates, the `notifyLeadAssigned` orchestrator, and the notification log.
> **Audience:** engineers. · **Source-of-truth scope:** everything between Serene and Gupshup/Meta. The `/whatsapp` page UI lives in `../pages/whatsapp.md`; the WhatsApp tables in `../architecture/database.md`; form-lead ingestion in `lead-ingestion.md`.
> **Last verified:** 2026-06-11 against `src/app/api/webhooks/whatsapp/route.ts`, `src/lib/services/whatsapp-api.ts`, `whatsapp-ingestion.ts`, `lead-assignment-notify.ts`, `src/lib/constants/whatsapp.ts`.

---

## 1. Provider & configuration

**Provider:** Gupshup v1 (BSP). The original Meta Cloud API direct integration was reverted
(Decision Log 2026-05-30) — Gupshup owns WABA compliance, template registration, and delivery
receipts. The Meta-direct code paths still compile but are dormant.

**Required env (server throws at module load if any is missing — `whatsapp-api.ts`):**
`GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`.
The `WHATSAPP_*` Meta vars are optional (dormant path). Full registry:
`../operations/environments.md`.

**Outbound endpoints** (both POST `application/x-www-form-urlencoded`, auth via `apikey`
header — not Bearer):

- Templates → `https://api.gupshup.io/wa/api/v1/template/msg`
- Free text → `https://api.gupshup.io/wa/api/v1/msg`

**The Gupshup 200 quirk:** Gupshup returns HTTP 200 even for application-level errors.
`isGupshupDelivered()` returns `false` when the parsed body is `{ status: 'error' }`; a
non-JSON body is trusted as delivered. Delivered = `res.ok` AND body not `status:'error'`.

## 2. Service-file boundaries (three files, never blur them)

| File | Client | Role |
| ---- | ------ | ---- |
| `whatsapp-service.ts` | session (RLS applies) | UI-facing queries only — conversations, messages, unread, read-marks, search |
| `whatsapp-api.ts` | HTTP → Gupshup | **SERVER ONLY.** Outbound sends + notification logging. Never import in client components |
| `whatsapp-ingestion.ts` | admin client | **SERVER ONLY.** Inbound pipeline; `processStatusUpdate` is the only UPDATE ever made to `whatsapp_messages` (delivery receipts — the documented A-11 exception) |

## 3. Inbound webhook — `POST /api/webhooks/whatsapp`

`src/app/api/webhooks/whatsapp/route.ts`, exports `maxDuration = 60`.

- **Auth:** `x-gupshup-secret` header, compared with `safeSecretCompare` (timing-safe,
  equal-length buffer guard). Reject **before** reading the body (S-12).
- **Rate limit:** `createRateLimiter({ windowMs: 60_000, max: 300 })` per IP, applied before
  `req.text()` (security-audit F-4, fixed 2026-06-11).
- **Always returns 200** after auth passes — even on bad payloads — so Gupshup/Meta do not
  retry-storm. All processing is deferred via `after()`.
- **GET handler:** Meta hub-challenge verification (Gupshup also uses it for URL verification).
- **Envelope (Gupshup v2, active):** `{ type: 'message', payload: { id, source,
  sender: { name }, payload: { text } } }` → `messageId` ← `payload.id`, `waId` ←
  `payload.source` (no `+`), `phone` ← `+${payload.source}`. `message-event` /
  `billing-event` types are acknowledged silently. The Meta v3 envelope parser exists but is
  dormant.
- The route is excluded from the Next.js proxy session refresh (see
  `../architecture/auth-and-rbac.md` §7).

### `processInboundMessage()` — the 9-step pipeline (`whatsapp-ingestion.ts`)

1. Normalize phone to E.164 (raw `+`-prefixed fallback on parse failure).
2. **Idempotency:** dedup on `wa_message_id` — exits silently if already processed.
3. `resolveLeadByPhone()` — most recent non-archived lead with that phone.
4. **No lead → Pipeline B lead creation:** `createLeadFromWhatsApp(waId, phone, senderName)` —
   domain defaults to `DEFAULT_LEAD_DOMAIN` (**`onboarding`** — WhatsApp leads carry no UTM),
   round-robin assigns, inserts lead + activities, then **`await notifyLeadAssigned({ …,
   isNew: true, scheduleSla: true })`**. A plain `await` (not `void`, not nested `after()`) is
   required here: this code already runs inside the route's `after()`; a `void` would detach
   the send from the tracked chain and Vercel would freeze the lambda before Gupshup is reached.
5. **Lead exists** → the message threads into that lead's conversation; **no notifications.**
6. `getOrCreateConversation()` — SELECT → INSERT (`lead_id` unique; conflict ignored) →
   re-SELECT (race-safe).
7. `insertInboundMessage` — content sanitized via `sanitizeText`.
8. Update `last_message_at`.
9. Realtime broadcast is automatic via the `supabase_realtime` publication.

## 4. The orchestrator — `notifyLeadAssigned()` (`lead-assignment-notify.ts`)

Single entry point for all assignment side-effects. Input: `leadId`, `assignedTo` (null = no
agent), `agentName`, `leadName`, `leadPhone`, `domain`, `isNew`, `isDuplicate`, `actorId?`,
`scheduleSla`, `leadStatus?` (default `'new'`), `assignedAt?`.

Order and gating:

1. **Agent WhatsApp** — only when `assignedTo` is set.
2. **Founder WhatsApp** — on every non-duplicate (`agentName ?? 'Unassigned'`).
   (1 + 2 run via `await Promise.allSettled` — failure-isolated, logged, never thrown.)
3. **In-app notification** — when `assignedTo` set AND `assignedTo !== actorId`
   (self-notify suppressed). Fire-and-forget.
4. **SLA timers** — when `scheduleSla` AND `assignedTo` (dynamic import of
   `scheduleSlaTimersForLead`).

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

## 5. The seven templates (`src/lib/constants/whatsapp.ts`)

| Constant | Purpose | Params |
| -------- | ------- | ------ |
| `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID` (`193e330d-…`) | agent: new lead assigned | agent first name · lead name · lead phone |
| `GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID` (`d5828042-…`) | all founders: new lead | domain · agentName · leadName · leadPhone |
| `GUPSHUP_SLA_AGENT_TEMPLATE_ID` (`54d5dd55-…`) | agent: SLA breach | leadName · leadPhone · status · lastUpdatedAt |
| `GUPSHUP_SLA_MANAGER_TEMPLATE_ID` (`682fd320-…`) | managers (and founders, SLA-01C): SLA breach | + agentName (5 params) |
| `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID` (`7aee2a33-…`) | agent-initiated outreach from the dossier | leadName · agentName |
| `GUPSHUP_TASK_DUE_REMINDER_TEMPLATE_ID` (`05411e50-…`) | agent: gia_followup task due (TASK-01A) | agent first name · lead name · lead phone · task title |
| `GUPSHUP_TASK_OVERDUE_MANAGER_TEMPLATE_ID` (`c7ddd983-…`) | domain managers: gia task overdue +30 min (TASK-01B) | manager first name (per-recipient) · agent name · lead name · task title · due time **IST human format ("4:00 PM") — never UTC/ISO** |

All seven senders are thin wrappers over the internal `sendGupshupTemplate()` core, which owns
the fetch, status/body/delivered capture, and the one-log-row-per-attempt
`finally { await logNotification }` contract. Never call the Gupshup template endpoint outside
it. The four notification senders never throw to their callers;
**`sendLeadInitiationMessage` is the sole exception** — it re-throws after logging so the
dossier action can surface the failure to the UI (do not remove the `throw`).

## 6. Notification log — `whatsapp_notification_logs`

One row per template-send attempt, written by `logNotification()` **awaited in each send's
`finally`** (durably written before the lambda may freeze; swallows its own errors).

| Column | Value |
| ------ | ----- |
| `type` | `agent_assignment` · `founder_alert` · `sla_breach` · `lead_initiation` · `task_due_reminder` · `task_overdue_manager` (CHECK, widened in 0113) |
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
3. **Inbound message on an existing lead:** no notification — a reply on an existing thread is
   not a new assignment. Agents discover it via the `/whatsapp` unread badge.
4. **Delivery receipts:** `processStatusUpdate` records Gupshup delivery events on
   `whatsapp_messages` (the A-11 exception); there is no retry/alert pipeline on failed
   deliveries yet — the log table is the audit surface.
