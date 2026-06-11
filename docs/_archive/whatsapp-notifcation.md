# WhatsApp Notification & Lead Ingestion Ecosystem — Full Analysis

> **Status: current as of 2026-06-09.** Dispatch is routed through the single orchestrator
> `notifyLeadAssigned()` (`src/lib/services/lead-assignment-notify.ts`), which **awaits** its
> Gupshup sends and is invoked inside Next's **`after()`** so the HTTP response returns immediately
> while Vercel keeps the lambda alive until the sends settle. The old fire-and-forget
> `void fn().catch()` pattern silently dropped most notifications on Vercel (the lambda freezes on
> response flush and orphans the in-flight Gupshup fetch). That pattern is fully retired — every
> assignment path now uses `after()` + awaited sends. See root `CLAUDE.md` → Pattern Notes →
> "Outward network sends" and `src/lib/services/CLAUDE.md` → "Template send functions".

---

## 1. Architecture Overview

Two separate lead-ingestion pipelines, both triggering WhatsApp notifications through the same
Gupshup API layer and the same orchestrator.

```text
Pipeline A — Form/Webhook leads
  Pabbly/Meta → POST /api/webhooks/leads?source=meta|google|website
  → ingestLead() → round-robin assign → after(notifyLeadAssigned(...))

Pipeline B — Inbound WhatsApp messages
  Lead sends WA → POST /api/webhooks/whatsapp (Gupshup v2 envelope)
  → after(processInboundMessage()) → createLeadFromWhatsApp() (new number only)
  → await notifyLeadAssigned(...)  (inside the route's after())
```

---

## 2. Gupshup Configuration

5 template IDs are hardcoded in `src/lib/constants/whatsapp.ts` (lines 85–89):

| Constant | Template ID | Purpose | Params |
| --- | --- | --- | --- |
| `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID` | `193e330d-…-f3808b50fc80` | Notify agent on assignment | `{{1}}` agent first name, `{{2}}` lead full name, `{{3}}` lead phone |
| `GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID` | `d5828042-…-e72185d7d0c1` | Notify all founders | `{{1}}` domain, `{{2}}` agentName, `{{3}}` leadName, `{{4}}` leadPhone |
| `GUPSHUP_SLA_AGENT_TEMPLATE_ID` | `54d5dd55-…-49e9b9e22745` | SLA breach → agent | `{{1}}` leadName, `{{2}}` leadPhone, `{{3}}` status, `{{4}}` lastUpdatedAt |
| `GUPSHUP_SLA_MANAGER_TEMPLATE_ID` | `682fd320-…-9a390770fac8` | SLA breach → manager | `{{1}}` leadName, `{{2}}` leadPhone, `{{3}}` agentName, `{{4}}` status, `{{5}}` lastUpdatedAt |
| `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID` | `7aee2a33-…-d20a2e39895a` | Agent-initiated outreach | `{{1}}` leadName, `{{2}}` agentName |

**Env vars (server throws at module load if any of the four are missing — `whatsapp-api.ts:31`):**
`GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`.
Meta vars (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`,
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`) are optional — the Meta path is
dormant; those functions compile but are not called.

**Outbound endpoints:**

- Template messages → `https://api.gupshup.io/wa/api/v1/template/msg`
- Free-text messages → `https://api.gupshup.io/wa/api/v1/msg`

Both POST `application/x-www-form-urlencoded`, authenticated via the `apikey` header (not Bearer).

**Critical Gupshup quirk:** Gupshup returns HTTP 200 even for application-level errors. `isGupshupDelivered()`
(`whatsapp-api.ts:231`) returns `false` when the parsed body contains `{ "status": "error" }`. A
**non-JSON body is treated as delivered** (trust `res.ok`) — we never false-negative on unknown
success shapes. HTTP 200 alone is not enough; delivery = `res.ok` AND body is not `status: error`.

---

## 3. Pipeline A: Webhook Lead Ingestion

**Entry:** `POST /api/webhooks/leads?source=meta|google|website`
**File:** `src/app/api/webhooks/leads/route.ts` (exports `maxDuration = 60`).

Order of operations:

1. Resolve `source` param (unknown → defaults to `website` with a warn).
2. Rate limit — 100 req/min per IP, in-memory per worker (checked before reading the body).
3. Parse JSON body (400 on parse failure).
4. Log raw payload to `lead_raw_payloads` **before** the auth check, so auth failures are auditable. `sanitizeRawPayload` strips sensitive envelope keys (`res2` — Meta page access token).
5. Bearer token check (`PABBLY_WEBHOOK_SECRET`) — on failure, mark the raw log row `ingestion_error: 'unauthorized'` and return 401.
6. `ingestLead(rawPayload, source, rawPayloadId)`.
7. On success → `after(notifyLeadAssigned({ ... }))` — the orchestrator handles agent WA, founder WA, in-app notification, and SLA scheduling. `after()` flushes the 201 first, then keeps the lambda alive while `notifyLeadAssigned` awaits the Gupshup sends.

Inside `ingestLead()` (`src/lib/services/lead-ingestion.ts`):

- Source adapter normalizes the payload.
- Zod validation (`leadPayloadSchema`, passthrough; 422 on failure, marks `ingestion_error`).
- Domain resolution: explicit `domain` field → campaign-prefix map → `DEFAULT_LEAD_DOMAIN`.
- Dedup check via `get_active_lead_by_phone()` RPC:
  - **Active** statuses (new/touched/in_discussion/nurturing) → log a `duplicate_submission` activity, return early as success with `is_duplicate: true` and `assigned_to: null`.
  - **Terminal** statuses (won/lost/junk) → create a new lead with a `previous_lead_id` chain.
- `getNextRoundRobinAgent(domain)` — atomic DB-level round-robin.
- Fetch agent `full_name` for the notification.
- INSERT lead row; backfill `lead_id` on the raw-payload log row.
- INSERT `lead_created` activity; INSERT `agent_assigned` activity (if assigned).
- Return `IngestionResult`: `{ success, leadId, rawPayloadId, assigned_to, agent_name, domain, lead_name, lead_phone, is_duplicate }`.

Back in the route:

```ts
// route.ts — the 201 returns to Pabbly immediately; Vercel keeps the lambda alive
// until notifyLeadAssigned's awaited Gupshup sends settle. maxDuration = 60 for headroom.
after(
  notifyLeadAssigned({
    leadId:      result.leadId,
    assignedTo:  result.assigned_to,
    agentName:   result.agent_name,
    leadName:    result.lead_name,
    leadPhone:   result.lead_phone,
    domain:      result.domain,
    isNew:       !result.is_duplicate,
    isDuplicate: result.is_duplicate,
    actorId:     null,
    scheduleSla: !result.is_duplicate,
  }).catch((err) =>
    console.error('[webhooks/leads] notifyLeadAssigned failed (non-fatal):', err),
  ),
);
return NextResponse.json({ leadId: result.leadId }, { status: 201 });
```

**Duplicate behaviour:** on a duplicate active resubmission `is_duplicate` is `true`, so
`isDuplicate: true` and `scheduleSla: false` flow into the orchestrator — the founder send is
suppressed and no SLA timers are scheduled. The agent send is also skipped (`assigned_to` is null
on the duplicate path).

---

## 4. Pipeline B: Inbound WhatsApp Lead Creation

**Entry:** `POST /api/webhooks/whatsapp` with the `x-gupshup-secret` header.
**File:** `src/app/api/webhooks/whatsapp/route.ts` (exports `maxDuration = 60`).

Authentication uses `timingSafeEqual` on `x-gupshup-secret` (equal-length buffer guard). The route
returns **200 OK immediately**; all processing is deferred via `after()`.

**Gupshup v2 envelope** (active BSP): `{ type: 'message', payload: { id, source, sender:{name}, payload:{ text } } }`.

- `messageId` ← `payload.id`
- `waId` ← `payload.source` (no `+` prefix)
- `phone` ← `+${payload.source}`
- text ← `payload.payload.text`
- `message-event` / `billing-event` types → silent 200, no processing.

`processInboundMessage()` (`src/lib/services/whatsapp-ingestion.ts`) — 9-step pipeline:

1. Normalize phone to E.164 (falls back to raw `+`-prefixed on parse failure).
2. Dedup guard on `wa_message_id` — idempotent; silently exits if the message already exists.
3. `resolveLeadByPhone()` — most recent non-archived lead with matching phone.
4. **No lead** → `createLeadFromWhatsApp(waId, phone, senderName)` which returns `{ leadId, assignedTo, assignedAt, domain }`:
   - Domain defaults to `DEFAULT_LEAD_DOMAIN` (concierge) — WhatsApp leads carry no UTM.
   - Round-robin assigns an agent; inserts lead + activities.
   - Re-fetch the full lead row; fetch the assigned agent's `full_name` (one query, non-fatal).
   - **`await notifyLeadAssigned({ ... leadId, isNew: true, isDuplicate: false, scheduleSla: true, assignedAt })`.**
     A plain `await` (not `void`) is required here: `processInboundMessage` already runs inside the
     route's `after()`, so the `await` keeps the send in that tracked chain. A `void` would detach
     it and Vercel would freeze the lambda before Gupshup is reached.
5. **Lead exists** → conversation linked to the existing lead; **no notifications fired.**
6. `getOrCreateConversation()` — SELECT → INSERT (unique on `lead_id`; 409 ignored) → re-SELECT (race-safe).
7. Insert inbound message row (`insertInboundMessage`, content sanitized via `sanitizeText`).
8. Update `last_message_at`.
9. Realtime broadcast is automatic via the `supabase_realtime` publication.

The orchestrator threads `leadId` through to `sendFounderLeadNotification`, so WhatsApp-origin
founder alerts carry a non-null `lead_id` in the log. (This was historically a gap — now closed.)

---

## 5. Assignment Paths

Four code paths trigger WA notifications on assignment. All route through `notifyLeadAssigned()`
and all **await** the Gupshup sends internally (no path uses bare `void`). The first three wrap
`notifyLeadAssigned` in `after()`; the WhatsApp path is already inside the route's `after()` and
uses a plain `await`.

| Path | File | Dispatch construct | leadId threaded |
| --- | --- | --- | --- |
| Webhook ingestion | `api/webhooks/leads/route.ts` | `after(notifyLeadAssigned(...))` | `result.leadId` |
| `assignLead` (manual reassign) | `lib/actions/leads.ts` | `after(notifyLeadAssigned(...))` | `leadId` |
| `createManualLead` (Add Lead modal) | `lib/actions/leads.ts` | `after(notifyLeadAssigned(...))` | `leadId` |
| WhatsApp inbound (new number) | `lib/services/whatsapp-ingestion.ts` | `await notifyLeadAssigned(...)` (inside route `after()`) | `leadId` |

---

## 6. The Orchestrator — `notifyLeadAssigned()`

`src/lib/services/lead-assignment-notify.ts`. Single entry point for all four assignment
side-effects. Input shape (`LeadAssignedNotifyInput`): `leadId`, `assignedTo` (null = no agent),
`agentName`, `leadName`, `leadPhone`, `domain`, `isNew`, `isDuplicate`, `actorId?`, `scheduleSla`,
`leadStatus?` (default `'new'`), `assignedAt?` (default now).

Order and gating:

1. **Agent WhatsApp** — only when `assignedTo` is set. `sendLeadAssignmentNotification`.
2. **Founder WhatsApp** — on every non-duplicate (`!isDuplicate`). `sendFounderLeadNotification`, passing `agentName ?? 'Unassigned'`.
3. Steps 1 + 2 run in parallel via `await Promise.allSettled([...])` — failure isolation; a rejection is logged, never thrown.
4. **In-app notification** — only when `assignedTo` is set AND `assignedTo !== actorId` (suppress self-notify). Fire-and-forget `.catch(() => {})`.
5. **SLA timers** — only when `scheduleSla` AND `assignedTo`. Dynamic-imports `scheduleSlaTimersForLead`.

**Why awaited (Vercel):** the two outward sends are awaited so the function does not resolve until
Gupshup has accepted/rejected each message and each log row is written. Callers run it inside
`after()`; awaiting without `after()` would delay the response, `after()` without awaiting would
kill the sends. Both halves are required.

---

## 7. The 5 Send Functions (`whatsapp-api.ts`)

All four template-send functions (`sendLeadAssignmentNotification`, `sendFounderLeadNotification`,
`sendSlaAgentNotification`, `sendSlaManagerNotification`) use the **canonical finally-block pattern**:
declare `gupshupStatus`/`gupshupBody`/`delivered` before the try, populate in try, zero out in
catch, and `await logNotification(...)` in `finally` — exactly one log row per attempt regardless
of how control exits. Each is fire-and-forget safe (never throws to its caller).

| Function | Recipients | Logs `type` |
| --- | --- | --- |
| `sendLeadAssignmentNotification(agentId, leadName, leadPhone, domain?, leadId?)` | agent's phone from `profiles` (skips with warn if none) | `agent_assignment` |
| `sendFounderLeadNotification(domain, agentName, leadName, leadPhone, leadId?)` | all `profiles WHERE role='founder'`, sent in parallel via `Promise.all` | `founder_alert` |
| `sendSlaAgentNotification(agentId, leadName, leadPhone, status, lastUpdatedAt)` | the agent | `sla_breach` |
| `sendSlaManagerNotification(recipientIds[], leadName, leadPhone, agentName, status, lastUpdatedAt)` | each manager | `sla_breach` |

**`sendLeadInitiationMessage(to, leadName, agentName)` — the exception:**

- Used for agent-initiated outreach from the dossier.
- **Can throw** — re-throws after logging so the action layer surfaces the error to the UI. (Do not remove the `throw err`.)
- **Does log** to `whatsapp_notification_logs` with `type: 'lead_initiation'` (migration 0067 added this CHECK value), so every initiation attempt has an audit row.

---

## 8. Notification Logging (`whatsapp_notification_logs`)

Internal `logNotification()` (`whatsapp-api.ts:250`) writes every template-send attempt.

| Column | Value |
| --- | --- |
| `type` | `'agent_assignment'` \| `'founder_alert'` \| `'sla_breach'` \| `'lead_initiation'` (CHECK constraint) |
| `recipient_phone` | **Last 4 digits only** — never the full number |
| `lead_phone` | Last 4 digits only (null if absent) |
| `gupshup_status` | HTTP status code (`0` = network error / fetch threw) |
| `gupshup_body` | Response body, truncated to 2000 chars |
| `delivered` | `true` only if HTTP ok AND body is not `{ status: 'error' }` |

**RLS:** only `admin` and `founder` roles can read these logs.

`logNotification` swallows its own errors (never throws), and is **awaited** inside each send's
`finally` so the row is durably written before the send resolves and the lambda can freeze.
`gupshup_status = 0` means a network-level fetch error (no HTTP response).

---

## 9. Correct Flow Summary (Happy Path — webhook lead)

```text
[Pabbly sends webhook]
→ POST /api/webhooks/leads?source=meta
→ rate-limit check → parse JSON → log to lead_raw_payloads (rawPayloadId)
→ verify Bearer token (PABBLY_WEBHOOK_SECRET)
→ ingestLead(payload, 'meta', rawPayloadId)
    → normalize via meta adapter → Zod validate
    → resolve domain (campaign prefix → app_domain)
    → dedup check (phone) → no active lead
    → getNextRoundRobinAgent('concierge') → agentId
    → fetch agent full_name → INSERT lead → leadId
    → UPDATE lead_raw_payloads SET lead_id = leadId
    → INSERT lead_activities (lead_created, agent_assigned)
    → return { success, leadId, assigned_to: agentId, is_duplicate: false, ... }
→ after(notifyLeadAssigned({ ... }))        // schedules post-response work
→ return 201 { leadId }                      // Pabbly acked immediately
   ── lambda kept alive by after(); notifyLeadAssigned runs: ──
   → await Promise.allSettled([
       sendLeadAssignmentNotification(agentId, leadName, phone, domain, leadId)
         → fetch agent.phone → POST gupshup template/msg (193e330d)
         → isGupshupDelivered() → await logNotification(type:'agent_assignment'),
       sendFounderLeadNotification(domain, agentName, leadName, phone, leadId)
         → fetch role='founder' → parallel POST gupshup template/msg (d5828042)
         → await logNotification(type:'founder_alert', lead_id: leadId),
     ])
   → in-app notification (if assignedTo !== actorId)
   → SLA timer scheduling (scheduleSla && assignedTo)
   ── all settled → lambda may freeze ──
```

---

## 10. Behavioural Notes & Open Product Decisions

These are **product decisions**, not bugs (the Vercel-loss bug is fixed). Listed so the behaviour
is explicit.

1. **Unassigned new lead (no active agent):** `assigned_to` is null, so the agent send is skipped, but the founder send **still fires** with `agentName: 'Unassigned'`. Founders are alerted; the agent send is simply absent. ✅ handled.
2. **Duplicate active resubmission:** `isDuplicate: true` → founder send suppressed, agent send skipped, no SLA reschedule. The originally-assigned agent is **not** re-pinged about the resubmission. Open product question if re-pinging is desired.
3. **Existing-lead inbound WhatsApp message:** no notification fired (only conversation/message rows written). Intentional — a reply on an existing thread is not a new assignment.

### Resolved (previously flagged as issues)

- ~~Missing `leadId` in WhatsApp-origin founder notifications~~ — orchestrator always threads `leadId`.
- ~~SLA notifications misclassified as `agent_assignment`~~ — now logged as `sla_breach`; CHECK constraint extended.
- ~~`sendLeadInitiationMessage` has no log trail~~ — now logs `lead_initiation` (migration 0067).
- ~~Silent loss on Vercel via `void fn().catch()`~~ — all paths use `after()` + awaited sends.
