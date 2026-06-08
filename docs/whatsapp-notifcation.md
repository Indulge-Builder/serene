# WhatsApp Notification & Lead Ingestion Ecosystem — Full Analysis

> **UPDATED 2026-06-08 — notification dispatch reworked.** This document originally
> described the dispatch as fire-and-forget `void fn().catch(...)`. That pattern silently
> dropped most notifications on Vercel (the lambda freezes on response flush and orphans
> the in-flight Gupshup fetch). All lead-assignment notifications now route through the
> single orchestrator `notifyLeadAssigned()` (`src/lib/services/lead-assignment-notify.ts`),
> which **awaits** its Gupshup sends, invoked inside Next's **`after()`** so the response
> still returns immediately while Vercel keeps the lambda alive until the sends settle.
> Sections below that say "void / fire-and-forget" describe the OLD behaviour and are
> annotated inline. See the root `CLAUDE.md` → Pattern Notes → "Outward network sends".

1. Architecture Overview
   There are two completely separate lead ingestion pipelines, both triggering WhatsApp notifications through the same Gupshup API layer.

Pipeline A: Form/Webhook leads
Pabbly/Meta → POST /api/webhooks/leads?source=meta|google|website
→ ingestLead() → round-robin assign → WA notifications

Pipeline B: Inbound WhatsApp messages  
 Lead sends WA → POST /api/webhooks/whatsapp (Gupshup v2)
→ processInboundMessage() → createLeadFromWhatsApp() → WA notifications 2. Gupshup Configuration
5 template IDs are hardcoded in src/lib/constants/whatsapp.ts:

Constant Template ID Purpose
GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID 193e330d-e7ee-48e0-9cd4-f3808b50fc80 Notify agent on assignment
GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID d5828042-fbfc-4e6d-a9d9-e72185d7d0c1 Notify all founders
GUPSHUP_SLA_AGENT_TEMPLATE_ID 54d5dd55-a1fa-482b-8823-49e9b9e22745 SLA breach → agent
GUPSHUP_SLA_MANAGER_TEMPLATE_ID 682fd320-3b04-45da-8b1a-9a390770fac8 SLA breach → manager
GUPSHUP_LEAD_INITIATION_TEMPLATE_ID 7aee2a33-3442-4b3a-a1b6-d20a2e39895a Agent-initiated outreach
Env vars required (server throws at startup if missing): GUPSHUP_API_KEY, GUPSHUP_APP_NAME, GUPSHUP_PARTNER_NUMBER, GUPSHUP_WEBHOOK_SECRET.

Outbound endpoint: [Gupshup template msg API](https://api.gupshup.io/wa/api/v1/template/msg) (POST, application/x-www-form-urlencoded, authenticated via apikey header — not Bearer).

Critical Gupshup quirk handled: Gupshup returns HTTP 200 even for application-level errors. The isGupshupDelivered() function (whatsapp-api.ts:231) checks for { "status": "error" } in the response body — HTTP 200 alone is not enough to confirm delivery.

## Pipeline A: Webhook Lead Ingestion

Entry: POST /api/webhooks/leads?source=meta|google|website

File: src/app/api/webhooks/leads/route.ts

Exact order of operations (lines 74–148):

Rate limit — 100 req/min per IP, in-memory per worker
Parse JSON body
Log raw payload to lead_raw_payloads immediately — before auth check, so auth failures are auditable
Bearer token check (PABBLY_WEBHOOK_SECRET) — failed auth marks the raw log row as unauthorized
ingestLead(rawPayload, source, rawPayloadId)
On success → after(notifyLeadAssigned({ ... })) — the single orchestrator handles agent WA, founder WA, in-app notification, and SLA scheduling. after() flushes the 201 first, then keeps the lambda alive while notifyLeadAssigned awaits the Gupshup sends. (OLD: two separate void fn().catch() calls fired inline — lost on Vercel freeze.)
Inside ingestLead() (src/lib/services/lead-ingestion.ts):

Source adapter normalizes payload
Zod schema validation (422 on failure, marks ingestion_error)
Domain resolution: explicit field → campaign prefix map → DEFAULT_LEAD_DOMAIN
Dedup check via get_active_lead_by_phone() RPC:
Active statuses (new/touched/in_discussion/nurturing) → log duplicate_submission activity, return early as success with assigned_to: null — no WA notification sent on duplicate
Terminal statuses (won/lost/junk) → create new lead with previous_lead_id chain
getNextRoundRobinAgent(domain) — atomic DB-level round-robin
Fetch agent's full_name for notification
INSERT lead row
Backfill lead_id on raw payload log
INSERT lead_created activity
INSERT agent_assigned activity (if assigned)
Return { success, leadId, assigned_to, agent_name, domain, lead_name, lead_phone }
After ingestion, back in the webhook route:

// after() returns the 201 to Pabbly immediately, then Vercel keeps the lambda
// alive until notifyLeadAssigned's awaited Gupshup sends settle.
// The route exports `export const maxDuration = 60` for headroom.
after(
  notifyLeadAssigned({ leadId, assignedTo, agentName, leadName, leadPhone, domain, isNew, isDuplicate, actorId: null, scheduleSla })
    .catch((err) => console.error('[webhooks/leads] notifyLeadAssigned failed (non-fatal):', err)),
)

notifyLeadAssigned internally awaits both WhatsApp sends in parallel via Promise.allSettled (agent send only when assignedTo is set; founder send on every non-duplicate). Each send awaits its own logNotification in finally, so the log row is durably written before the lambda can freeze.

Important gap (still open, behavioural): When result.assigned_to is null (no agent available), the agent send is skipped but the founder send still fires on new leads. On duplicate submissions the founder send is suppressed (isDuplicate) — neither agent nor founder is pinged about the re-submission. (See Issues 2 & 3 — these are product decisions, not the Vercel loss bug, which is fixed.)

## Pipeline B: Inbound WhatsApp Lead Creation

Entry: POST /api/webhooks/whatsapp with x-gupshup-secret header

File: src/app/api/webhooks/whatsapp/route.ts

Authentication uses timingSafeEqual on x-gupshup-secret. Response is always 200 OK immediately — all processing is deferred via Next.js after().

processInboundMessage() pipeline (src/lib/services/whatsapp-ingestion.ts):

Normalize phone to E.164
Dedup guard on wa_message_id — idempotent, silently exits if message already processed
resolveLeadByPhone() — finds most recent non-archived lead with matching phone
If no lead exists → createLeadFromWhatsApp(waId, phone, senderName):
Domain defaults to DEFAULT_LEAD_DOMAIN (concierge) — WhatsApp leads carry no UTM
Round-robin assigns agent
Inserts lead + activities
Then awaits notifyLeadAssigned in processInboundMessage. processInboundMessage already runs inside the whatsapp route's after(), so a plain await (not void) keeps the send in that tracked chain — a void here would detach it and freeze it out. The whatsapp route exports maxDuration = 60.
If lead exists → conversation is linked to existing lead, no notifications fired
getOrCreateConversation() — SELECT → INSERT ON CONFLICT → SELECT (race-safe)
Insert message row
Update last_message_at
One gap here: When creating a lead from WhatsApp, leadId is not passed to sendFounderLeadNotification() (line 143–150). The 5th parameter is omitted. This means lead_id will be null in whatsapp_notification_logs for WhatsApp-origin founder alerts. Compare to the webhook route which always passes result.leadId.

## Assignment Paths

Four code paths trigger WA notifications on assignment. All route through notifyLeadAssigned() and all await the Gupshup sends (no path uses bare void). The first three wrap notifyLeadAssigned in after(); the WhatsApp path is already inside the route's after() and uses a plain await.

Path | File | Dispatch construct | leadId to founder
Webhook ingestion | route.ts | after(notifyLeadAssigned(...)) | result.leadId
assignLead (manual reassign) | leads.ts | after(notifyLeadAssigned(...)) | leadId
createManualLead (Add Lead modal) | leads.ts | after(notifyLeadAssigned(...)) | leadId
WhatsApp inbound (new number) | whatsapp-ingestion.ts | await notifyLeadAssigned(...) (inside route after()) | leadId

(All four now pass leadId through notifyLeadAssigned to sendFounderLeadNotification — the old WhatsApp-path omission of leadId, Issue 1, no longer applies since the orchestrator always threads it.)

## Notification Logging (whatsapp_notification_logs)

Table schema (migration 038):

Column Value
type 'agent_assignment' or 'founder_alert'
recipient_phone Last 4 digits only — never full number
lead_phone Last 4 digits only
gupshup_status HTTP status code (0 = network error / fetch threw)
gupshup_body Response body, truncated to 2000 chars
delivered true only if HTTP ok AND body is not { status: 'error' }
RLS: Only admin and founder roles can read these logs.

The finally-block pattern — every template send function (services/CLAUDE.md) guarantees exactly one log row per attempt regardless of whether the HTTP call succeeds, fails, or throws. The logNotification call in finally is now awaited (was void) so the row is durably written before the send function resolves and the lambda can freeze. gupshup_status = 0 means a network-level fetch error.

sendSlaAgentNotification logs with type: 'agent_assignment' even though it's an SLA alert — this is a minor classification mismatch since there's no 'sla_alert' type in the CHECK constraint.

## The 5 Send Functions — What Gets Sent

sendLeadAssignmentNotification(agentId, leadName, leadPhone, domain?)

Template params: {{1}} = leadName, {{2}} = leadPhone

Agent's phone fetched from profiles — if no phone, skips with console.warn.

sendFounderLeadNotification(domain, agentName, leadName, leadPhone, leadId?)

Queries all profiles WHERE role = 'founder' and sends to each.

Template params: {{1}} = domain, {{2}} = agentName, {{3}} = leadName, {{4}} = leadPhone

sendSlaAgentNotification(agentId, leadName, leadPhone, status, lastUpdatedAt)

Template params: {{1}} = leadName, {{2}} = leadPhone, {{3}} = status, {{4}} = lastUpdatedAt

sendSlaManagerNotification(recipientIds[], leadName, leadPhone, agentName, status, lastUpdatedAt)

Template params: {{1}} = leadName, {{2}} = leadPhone, {{3}} = agentName, {{4}} = status, {{5}} = lastUpdatedAt

sendLeadInitiationMessage(to, leadName, agentName) — the exception:

Can throw — action layer catches and surfaces to UI
Does NOT log to whatsapp_notification_logs — the CHECK constraint doesn't cover 'lead_initiation'
Used for agent-initiated outreach from the dossier 8. Issues & Gaps Found
Issue 1 — Missing leadId in WhatsApp-origin founder notifications (whatsapp-ingestion.ts:143)

sendFounderLeadNotification is called without leadId. The lead_id column in whatsapp_notification_logs will be null for all WhatsApp-originated founder alerts, making it impossible to trace the log back to the lead.

Issue 2 — No notification when no agent is available

Both pipelines skip notifications entirely when assigned_to is null (no active agents). The founder is not notified of an unassigned lead. This could mean leads silently sit unassigned without anyone knowing.

Issue 3 — Duplicate leads get no notification

When a lead re-submits and ingestLead returns early (duplicate path), result.assigned_to is null, so neither agent nor founder is notified. The original assigned agent is not pinged about the re-submission.

Issue 4 — SLA notification misclassified in logs

sendSlaAgentNotification logs with type: 'agent_assignment' instead of a dedicated SLA type. The whatsapp_notification_logs.type CHECK constraint only allows 'agent_assignment' and 'founder_alert' — there's no way to distinguish SLA breach notifications from lead assignment notifications in the logs.

Issue 5 — sendLeadInitiationMessage has no log trail

When an agent initiates a WhatsApp conversation from the dossier, no row is written to whatsapp_notification_logs. If it fails and the agent doesn't notice the error, there's no audit trail.

Issue 6 — assignLead has a redundant extra profile fetch

After firing sendLeadAssignmentNotification, there's a separate admin.from('profiles').select('full_name') query (leads.ts:368) just to get the agent name for the founder notification. This could use the agent name already fetched inside sendLeadAssignmentNotification itself — but since that function is internal, the action layer has to re-fetch.

## Correct Flow Summary (Happy Path)

[Pabbly sends webhook]
→ POST /api/webhooks/leads?source=meta
→ Rate limit check
→ Parse JSON → log to lead_raw_payloads (id: rawPayloadId)
→ Verify Bearer token (PABBLY_WEBHOOK_SECRET)
→ ingestLead(payload, 'meta', rawPayloadId)
→ normalize via meta adapter
→ Zod validate
→ resolve domain (campaign prefix → app_domain)
→ dedup check (phone) → no existing active lead
→ getNextRoundRobinAgent('concierge') → agentId
→ fetch agent full_name
→ INSERT into leads → leadId
→ UPDATE lead_raw_payloads SET lead_id = leadId
→ INSERT lead_activities (lead_created, agent_assigned)
→ return { success: true, leadId, assigned_to: agentId, ... }
→ after(notifyLeadAssigned({ ... }))         // schedules post-response work; 201 returns now
→ return 201 { leadId }                       // Pabbly acked immediately
   ── lambda kept alive by after(); notifyLeadAssigned runs: ──
   → await Promise.allSettled([
       sendLeadAssignmentNotification(agentId, name, phone, domain, leadId),
         → fetch agent.phone from profiles
         → POST gupshup template/msg (template 193e330d)
         → isGupshupDelivered() check
         → await logNotification({ type: 'agent_assignment', delivered: true/false }),
       sendFounderLeadNotification(domain, agentName, name, phone, leadId),
         → fetch all profiles WHERE role='founder'
         → for each founder (parallel): POST gupshup template/msg (template d5828042)
         → await logNotification({ type: 'founder_alert', lead_id: leadId, delivered: true/false }),
     ])
   → in-app notification + SLA timer scheduling
   ── all settled → lambda may freeze ──
