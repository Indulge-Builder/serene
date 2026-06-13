# WhatsApp — Page Spec

> **Purpose:** spec for `/whatsapp` (shared inbox) and the dossier `LeadWhatsAppCard` — the in-app messaging surfaces.
> **Audience:** engineers. · **Source-of-truth scope:** the UI surfaces, `whatsapp-service.ts`, `whatsapp.ts` actions, Realtime wiring. The webhook contract, inbound pipeline, templates, and notification log live in `../integrations/whatsapp-gupshup.md`; tables in `../architecture/database.md`.
> **Last verified:** 2026-06-09 full pass; 2026-06-11 restructure.

## 1. Purpose

A shared WhatsApp inbox inside Serene: every lead phone number maps to one conversation thread,
messages sync in real time, agents reply without leaving the dashboard. Conversations are
keyed to `leads` and inherit lead assignment/domain rules. Two creation paths: inbound
(service-role pipeline) and agent-initiated from the dossier
(`initiateWhatsAppConversationAction` + the `lead_initiation` template, opening the 24-hour
session window).

## 2. Who sees it

Agents: conversations on own assigned leads (`can_access_wa_conversation`). Managers: domain.
Admin/founder: all. Resolve/reopen: manager+. Guest: redirected. Full capability×layer matrix:
Deep dive §10.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `whatsapp-service.ts` (session client, RLS) — `getConversations` (cursor = `last_message_at`), `getMessages` (ASC, joins sender), `getUnreadCount` (`get_wa_unread_count` RPC), `markConversationRead` (UPSERT), `searchConversations` |
| Actions | `whatsapp.ts` — `sendWhatsAppMessage`, `markConversationAsRead`, `resolveConversation`/`reopenConversation` (manager+), `getConversationsAction`, `getMessagesAction`, `searchConversationsAction`, `getConversationByLeadIdAction`, `initiateWhatsAppConversationAction` (idempotent on race) |
| Pipeline | inbound + outbound sends: `../integrations/whatsapp-gupshup.md` |

## 4. Components

`WhatsAppShell` (split-pane: list + thread) · `ConversationList` + period filter ·
`ConversationPanel` · `MessageBubble` (shows a "Elaya" label when `is_bot = true` — nothing sets
it today) · composer (optimistic insert, Realtime echo confirm) · dossier `LeadWhatsAppCard` +
`LeadWhatsAppCardAsync`.

## 5. States

- **Loading:** `whatsapp/loading.tsx` — bespoke split-pane skeleton (one of the two sanctioned bespoke loading interiors).
- **Empty:** `EmptyConversationState` (wraps `<EmptyState>`); thread empty state for new conversations.
- **Error:** send failures roll back the optimistic bubble + toast; initiation errors surface inline on the dossier card (the one sender that throws).

## 6. Invariants

Deep dive §11 — webhook always 200; `wa_message_id` partial-unique dedup; delivery-receipt
update is the only `whatsapp_messages` UPDATE; `can_access_wa_conversation` coupled to leads
RLS (review together); channel nonces; unread counts via the RPC only (fixed in 0085).

## 7. Open items

- **AI chatbot not built:** `bot_active`/`bot_paused_*` columns exist (defaults set) but no code
  reads or writes them for bot behaviour; `is_bot` is never set on outbound messages today.
- Meta Cloud API helpers remain dormant for a future BSP switch; `getMediaDownloadUrl` needs
  Meta credentials when inbound media arrives.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document. The former §5 (webhook
> route) and §7 (notification templates) now live in `../integrations/whatsapp-gupshup.md`.

### 1. Module Overview

The WhatsApp module gives Indulge agents and managers a shared inbox inside Serene: every lead phone number maps to one conversation thread, messages sync in real time, and agents reply without leaving the dashboard. It sits in the Gia domain because conversations are keyed to `leads` and inherit the same assignment and domain rules as the lead list.

**Three surfaces:**

| Surface | Route / file | Role |
| --- | --- | --- |
| **Inbox UI** | `/whatsapp` — `src/app/(dashboard)/whatsapp/page.tsx` | Authenticated users browse conversations, read threads, send outbound text, resolve/reopen (manager+). |
| **Lead dossier card** | `LeadWhatsAppCard` on `/leads/[id]` — `src/components/leads/LeadWhatsAppCard.tsx` | Embedded chat thread on a single lead. Can **initiate** a new conversation (template) when none exists. |
| **Inbound pipeline** | `POST /api/webhooks/whatsapp` — `src/app/api/webhooks/whatsapp/route.ts` | Gupshup (active) or Meta (dormant) webhooks authenticate, acknowledge fast, and process messages asynchronously. |

**Conversation creation — two paths (no longer inbound-only):**

1. **Inbound** — a message arrives from an unknown/known number → `whatsapp-ingestion.ts` creates the conversation (service-role).
2. **Agent-initiated** — an agent clicks "Start Conversation" on the lead dossier → `initiateWhatsAppConversationAction` creates the conversation (adminClient) and sends the `lead_initiation` Gupshup template to open the 24-hour session window.

**AI chatbot:** Planned, not built. Columns `bot_active`, `bot_paused_by`, and `bot_paused_at` exist on `whatsapp_conversations` (defaults: `bot_active = true`). No application code reads or writes them for bot behaviour. `MessageBubble` shows a "Elaya" label when `is_bot = true`, but nothing in the pipeline sets `is_bot = true` on outbound messages today.

**BSP:** Gupshup v1 for outbound text, the initiation template, and template notifications. Meta Cloud API helpers remain in `whatsapp-api.ts` for a future switch; they are not called on the active Gupshup path except `getMediaDownloadUrl` during inbound media handling (requires Meta credentials when media arrives).

---

### 2. Data Model

#### 2a. `whatsapp_conversations`

One row per lead (one thread per phone). Container for message history and inbox metadata.

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `lead_id` | `uuid` | NO | — | FK → `leads(id)` ON DELETE CASCADE |
| `wa_id` | `text` | NO | — | Meta/Gupshup sender ID, E.164 **without** `+` |
| `phone` | `text` | NO | — | Canonical E.164 **with** `+` |
| `status` | `text` | NO | `'open'` | CHECK: `'open' \| 'resolved'` |
| `last_message_at` | `timestamptz` | YES | — | Updated on inbound/outbound; drives sort + period filter |
| `bot_active` | `boolean` | NO | `true` | **Unused** — reserved for future bot |
| `bot_paused_by` | `uuid` | YES | — | FK → `profiles(id)`; **unused** |
| `bot_paused_at` | `timestamptz` | YES | — | **unused** |
| `created_at` | `timestamptz` | NO | `now()` | |
| `updated_at` | `timestamptz` | NO | `now()` | `update_updated_at()` trigger |

**UNIQUE constraints:**

| Constraint | Column(s) | Enforces |
| --- | --- | --- |
| `lead_id` UNIQUE | `lead_id` | At most one conversation per lead |
| `wa_id` UNIQUE | `wa_id` | At most one conversation per WhatsApp sender ID |

**Indexes:** `idx_wa_conversations_lead_id`; partial `idx_wa_conversations_last_message` on `(last_message_at DESC) WHERE status = 'open'`.

**RLS** (migration 0032, recreated in 0041, InitPlan-hoisted in 0088):

| Policy | Operation | Rule |
| --- | --- | --- |
| `wa_conversations_agent_select` | SELECT | `get_user_role() = 'agent'` AND `can_access_wa_conversation(lead_id)` |
| `wa_conversations_manager_select` | SELECT | `get_user_role() = 'manager'` AND `can_access_wa_conversation(lead_id)` |
| `wa_conversations_admin_founder_select` | SELECT | `get_user_role() IN ('admin', 'founder')` |
| `wa_conversations_update` | UPDATE | Agent/manager with `can_access_wa_conversation(lead_id)`, or admin/founder |

No INSERT policy for app users — conversation rows are created by **service-role** only: `whatsapp-ingestion.ts` (inbound) or `initiateWhatsAppConversationAction` via `createAdminClient()` (agent-initiated).

**Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations`.

---

#### 2b. `whatsapp_messages`

Append-only message log (both directions). One narrow UPDATE exception for delivery receipts (see below).

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `conversation_id` | `uuid` | NO | — | FK → `whatsapp_conversations` |
| `lead_id` | `uuid` | NO | — | FK → `leads` (denormalised for RLS JOIN) |
| `direction` | `text` | NO | — | CHECK: `'inbound' \| 'outbound'` |
| `sender_type` | `text` | NO | — | CHECK: `'lead' \| 'agent' \| 'bot'` |
| `sender_id` | `uuid` | YES | — | FK → `profiles`; NULL for lead/bot |
| `wa_message_id` | `text` | YES | — | Provider message ID; NULL allowed for optimistic outbound |
| `message_type` | `text` | NO | — | CHECK: `text`, `image`, `video`, `document`, `audio`, `template` |
| `content` | `text` | YES | — | Sanitized text; NULL for media-only |
| `media_url` | `text` | YES | — | Signed URL when resolved |
| `media_mime_type` | `text` | YES | — | |
| `status` | `text` | YES | `'sent'` | CHECK: `sent`, `delivered`, `read`, `failed` (outbound). Inbound rows insert `null`. |
| `status_at` | `timestamptz` | YES | — | Set with status updates |
| `is_bot` | `boolean` | NO | `false` | UI label only today |
| `created_at` | `timestamptz` | NO | `now()` | |

**Append-only contract (A-11):**

- No DELETE policy — messages are never deleted by users or app roles.
- No UPDATE policy for authenticated roles — agents/managers cannot mutate rows.
- **Delivery-receipt exception:** `processStatusUpdate()` in `whatsapp-ingestion.ts` may UPDATE **only** `status` and `status_at`, matched by `wa_message_id`, using **`createAdminClient()`** (service-role). This bypasses RLS intentionally: it is a system write from the webhook, not a user mutation. PostgreSQL RLS cannot restrict which columns change on an eligible row; column restriction is enforced in application code only.

**`wa_message_id` uniqueness — partial unique index (not column UNIQUE):**

```sql
CREATE UNIQUE INDEX idx_wa_messages_wa_message_id
  ON whatsapp_messages(wa_message_id)
  WHERE wa_message_id IS NOT NULL;
```

A column-level `UNIQUE` constraint would reject multiple explicit NULLs in some client patterns and confuse optimistic outbound rows: optimistic UI rows use `wa_message_id: null` until the server row arrives. Multiple concurrent optimistic rows may carry `NULL` without conflicting. Inbound rows always set `wa_message_id` from the provider for dedup.

**RLS:**

| Policy | Operation | Conditions |
| --- | --- | --- |
| `wa_messages_agent_select` | SELECT | Agent + `can_access_wa_conversation(lead_id)` |
| `wa_messages_manager_select` | SELECT | Manager + `can_access_wa_conversation(lead_id)` |
| `wa_messages_admin_founder_select` | SELECT | Admin/founder |
| `wa_messages_outbound_insert` (0037) | INSERT | `direction = 'outbound'` AND `sender_type = 'agent'` AND `sender_id = auth.uid()` AND `can_access_wa_conversation(lead_id)` AND role IN (`agent`, `manager`, `admin`, `founder`) |

**Inbound INSERT:** No policy for regular users — only **service-role** via `whatsapp-ingestion.ts` (`insertInboundMessage`).

**Agent-initiated INSERT:** `sendWhatsAppMessage` (inbox composer) uses the **session client** and satisfies `wa_messages_outbound_insert`. `initiateWhatsAppConversationAction` (dossier "Start Conversation") uses **adminClient** because it also creates the parent conversation row.

**Realtime:** Enabled on `whatsapp_messages`.

---

#### 2c. `whatsapp_conversation_reads`

Per-agent read cursor for unread badge logic (not in original Gia spec — deliberate addition).

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `conversation_id` | `uuid` | NO | — | FK → `whatsapp_conversations` |
| `agent_id` | `uuid` | NO | — | FK → `profiles` |
| `last_read_at` | `timestamptz` | NO | `now()` | |

**UNIQUE:** `(conversation_id, agent_id)` — one read row per agent per conversation.

**RLS:** Agents only — SELECT/INSERT/UPDATE where `agent_id = auth.uid()`. Managers/admins have no policies here (global unread badge uses RPC, not per-row reads for those roles).

**Unread derivation:** `get_wa_unread_count()` LEFT JOINs `whatsapp_conversation_reads wcr` ON `wcr.conversation_id = wc.id AND wcr.agent_id = auth.uid()`. A conversation counts as unread when `status = 'open'` AND (`wcr.last_read_at IS NULL` OR `wc.last_message_at > wcr.last_read_at`) AND `can_access_wa_conversation(wc.lead_id)` passes.

`markConversationRead()` UPSERTs `{ conversation_id, last_read_at }` with `onConflict: 'conversation_id,agent_id'`; `agent_id` is implied by RLS on INSERT/UPDATE.

---

#### 2d. `whatsapp_notification_logs`

Audit log for **template** sends only (not agent-composed inbox messages).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `type` | `text` | CHECK: `'agent_assignment' \| 'founder_alert' \| 'sla_breach' \| 'lead_initiation'` (widened by migration 0067) |
| `lead_id` | `uuid` | Nullable FK |
| `recipient_id` | `uuid` | Nullable FK → profiles |
| `recipient_phone` | `text` | **Last 4 digits only** |
| `agent_name` | `text` | Optional |
| `lead_name` | `text` | Optional |
| `lead_phone` | `text` | **Last 4 digits only** when set |
| `domain` | `text` | `app_domain` after migration 0041 |
| `gupshup_status` | `int` | HTTP status (`0` on fetch throw) |
| `gupshup_body` | `text` | Truncated to 2000 chars in app |
| `delivered` | `boolean` | `isGupshupDelivered(res.ok, body)` — Gupshup returns 200 even on app-level errors, so the parsed body is checked for `{ status: 'error' }` |
| `created_at` | `timestamptz` | |

**Type values in practice:**

- `agent_assignment` — `sendLeadAssignmentNotification`
- `founder_alert` — `sendFounderLeadNotification`
- `sla_breach` — `sendSlaAgentNotification` AND `sendSlaManagerNotification` (both use this value as of migration 0067; older SLA rows are still labelled `agent_assignment` and cannot be reclassified)
- `lead_initiation` — `sendLeadInitiationMessage`

**Who writes:** Internal `logNotification()` in `whatsapp-api.ts` only (adminClient). Never throws to caller. Called in a `finally` block on every send attempt (exactly one row per attempt — see §4b).

**RLS:** SELECT for admin/founder only.

---

### 3. Database RPCs and Helpers

#### 3a. `can_access_wa_conversation(p_lead_id uuid)`

- **Introduced:** migration `20260530000032_whatsapp_conversations.sql`
- **Recreated:** migration `20260530000041_normalize_lead_domain.sql` (Step 7)
- **Type:** `STABLE SECURITY DEFINER` SQL function, `SET search_path = public` — **not** a standalone RPC exposed to PostgREST; used inside RLS policies.

**What it checks:**

```sql
EXISTS (
  SELECT 1 FROM leads l
  WHERE l.id = p_lead_id
    AND l.archived_at IS NULL
    AND (
      (get_user_role() = 'agent'   AND l.assigned_to = auth.uid())
      OR (get_user_role() = 'manager' AND l.domain = get_user_domain())
      OR get_user_role() IN ('admin', 'founder')
    )
)
```

**Migrations/policies that depend on it:** All `whatsapp_conversations` and `whatsapp_messages` SELECT/UPDATE policies; `get_wa_unread_count()`.

**Coupling warning:** Access is defined by querying `leads` with the same rules as lead RLS. If lead assignment or domain policies change, **review and update this function** — conversation and message visibility will drift otherwise.

**Why recreated in 0041:** Migration 0041 changed `leads.domain` and related columns from `text` to `app_domain`. The original function used `l.domain = get_user_domain()::text`. After both sides are `app_domain`, the `::text` cast was removed: `l.domain = get_user_domain()`.

---

#### 3b. `get_wa_unread_count()`

- **Migration:** `20260530000036_rpc_get_wa_unread_count.sql`
- **Fixed:** `20260608000085_fix_wa_unread_count.sql`
- **Signature:** `get_wa_unread_count()` → `integer`
- **Security:** `STABLE SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE TO authenticated`

**Logic (post-fix):**

```sql
SELECT COUNT(*)::integer
FROM whatsapp_conversations wc
LEFT JOIN whatsapp_conversation_reads wcr
  ON wcr.conversation_id = wc.id AND wcr.agent_id = auth.uid()
WHERE wc.status = 'open'
  AND (wcr.last_read_at IS NULL OR wc.last_message_at > wcr.last_read_at)
  AND can_access_wa_conversation(wc.lead_id)  -- FIXED: passes lead_id, not conversation id
```

**The 0085 fix (historical bug, now resolved):** The original migration 0036 passed `wc.id` (the conversation id) to `can_access_wa_conversation`, whose parameter is `p_lead_id`. The leads lookup always failed, so the unread badge returned **0 for every agent**. Migration 0085 corrected the argument to `wc.lead_id`. The badge now counts correctly. *(This was an open caveat in the prior version of this doc — it has since been fixed.)*

**Returns:** Integer count; `COUNT(*)` never returns NULL — service layer coalesces to `0` on RPC error.

**Call sites:**

- `getUnreadCount()` in `whatsapp-service.ts` → `supabase.rpc('get_wa_unread_count')`
- `page.tsx` `Promise.all` with initial conversations — badge in `WhatsAppShell` header

Per-row unread dots in `ConversationRow` use optional `conversation.unread_count` on the type; list queries do not populate that field today — header badge uses RPC only.

---

### 4. The Three Service Files — Responsibilities and Boundaries

These three files are **not** interchangeable. Trust model, Supabase client, and error contracts differ.

| File | Client | RLS | Throws to caller? | Import from `'use client'`? |
| --- | --- | --- | --- | --- |
| `whatsapp-service.ts` | Session (`createClient()` server) | **Yes** — access enforced by DB | Returns empty/null on error | **No** — use actions |
| `whatsapp-api.ts` | None (HTTP) + admin for logs | Bypass for logs only | Templates: **never**. `sendLeadInitiationMessage`/`sendTextMessage`: **can throw** | **Never** |
| `whatsapp-ingestion.ts` | **adminClient** throughout | Bypass | Logs errors; inbound dedup exits silently | **Never** |

A fourth file — `lead-assignment-notify.ts` — orchestrates assignment side-effects (see §4d). It is not a query layer; it sequences the WhatsApp/notification/SLA calls.

---

#### 4a. `whatsapp-service.ts` — session client, UI queries

**Rule:** No manual domain/role checks — RLS + `can_access_wa_conversation` decide visibility. No `adminClient`.

Until `database.ts` includes WhatsApp tables, all queries cast supabase to `any` (same pattern as new RPCs).

| Export | Parameters | Returns | Query pattern |
| --- | --- | --- | --- |
| `getConversations` | `{ limit?, cursor?, period?, customFrom?, customTo? }` | `{ conversations, nextCursor }` | Join `leads!inner` for name/phone; `order last_message_at DESC nullsFirst: false`; optional period on `last_message_at`; cursor: `.lt('last_message_at', cursor)` when cursor set |
| `getConversation` | `conversationId: string` | `WhatsAppConversation \| null` | Single row + lead join |
| `getConversationByLeadId` | `leadId: string` | `WhatsAppConversation \| null` | Single row by `lead_id` FK + lead join. **Returns null when no conversation exists — not an error.** Used by the lead dossier card. |
| `getMessages` | `conversationId`, `{ limit?, before? }` | `WhatsAppMessage[]` | ASC `created_at`; profile join for sender; `before` → `.lt('created_at', before)` (older page) |
| `getUnreadCount` | none | `number` | `rpc('get_wa_unread_count')`; **0 on error**, never null |
| `markConversationRead` | `conversationId` | `void` | UPSERT `whatsapp_conversation_reads` on `(conversation_id, agent_id)` |
| `searchConversations` | `query`, optional period filters | `WhatsAppConversation[]` | `sanitizeText` + trim; ILIKE on `leads.first_name`, `leads.last_name`, `phone`; max **20**; same period helper |

**Pagination cursor (`getConversations`):**

- Sort: `last_message_at DESC`, `nullsFirst: false` (null timestamps sort last).
- Cursor value: ISO string of the **last row's** `last_message_at` from the previous page.
- Continuation: `.lt('last_message_at', cursor)`.

**Composite cursor caveat (nullable sort columns):** Keyset pagination with a single `.lt('col', cursor)` **silently drops rows where `col IS NULL`** because `NULL` comparisons are unknown in SQL. The platform rule (`src/lib/CLAUDE.md`) requires a composite cursor `{ last_message_at, id }` with a four-branch `.or()` when the sort column is nullable. `getConversations` today uses a **single-column** cursor on `last_message_at`. Period-filtered lists call `.not('last_message_at', 'is', null)` first, which avoids null cursor rows in filtered mode. Unfiltered lists with conversations that never received a message (`last_message_at IS NULL`) may not paginate correctly — if that edge case matters, adopt the composite pattern from `getPersonalTasks`.

**`getMessages` cursor:** Uses non-null `created_at` (NOT NULL column) — single-column `before` is safe.

---

#### 4b. `whatsapp-api.ts` — SERVER ONLY, Gupshup/Meta HTTP

**Startup guard** (module load throws if missing):

- `GUPSHUP_API_KEY`
- `GUPSHUP_APP_NAME`
- `GUPSHUP_PARTNER_NUMBER`
- `GUPSHUP_WEBHOOK_SECRET`

Optional (Meta dormant): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.

| Export | Purpose |
| --- | --- |
| `sendTextMessage(to, text)` | Gupshup `POST https://api.gupshup.io/wa/api/v1/msg`, `application/x-www-form-urlencoded`, header `apikey` (not Bearer). Returns `MetaApiResponse` shape. **Can throw on HTTP failure** — `sendWhatsAppMessage` action catches. |
| `sendTemplateMessage` | Meta Graph API — dormant |
| `sendMediaMessage` | Meta — dormant |
| `uploadMedia` | Meta — dormant |
| `getMediaDownloadUrl(mediaId)` | Meta media URL fetch — used by ingestion for inbound media |
| `verifyMetaSignature(rawBody, signatureHeader)` | HMAC-SHA256 vs `WHATSAPP_WEBHOOK_SECRET`; **`timingSafeEqual`** on equal-length buffers; header format `sha256=<hex>` |
| `sendLeadAssignmentNotification(agentId, leadName, leadPhone, domain?, leadId?)` | Gupshup template to agent's profile phone. Params `{{1}}` = **agent first name**, `{{2}}` = lead name, `{{3}}` = lead phone (or `'not provided'`). |
| `sendFounderLeadNotification(domain, agentName, leadName, leadPhone, leadId?)` | Template to all founders with phones, sent in **parallel** via `Promise.all` |
| `sendSlaAgentNotification(agentId, leadName, leadPhone, status, lastUpdatedAt)` | SLA agent template; logs as `sla_breach` |
| `sendSlaManagerNotification(recipientIds[], leadName, leadPhone, agentName, status, lastUpdatedAt)` | SLA manager template per recipient; logs as `sla_breach` |
| `sendLeadInitiationMessage(to, leadName, agentName)` | Gupshup `lead_initiation` template (`{{1}}` = lead name, `{{2}}` = agent name). **CAN THROW** — re-throws after logging so the action layer surfaces it to the UI. Logs as `lead_initiation`. |
| `WEBHOOK_VERIFY_TOKEN` | Re-export for GET challenge |
| `BUSINESS_ACCOUNT_ID` | Re-export |

**`logNotification(entry)`** (internal): Inserts into `whatsapp_notification_logs` via adminClient. `recipient_phone` and `lead_phone` stored as **`.slice(-4)` only**. `gupshup_body` truncated to 2000 chars. Wrapped in try/catch — **never throws**.

**Canonical finally-block log pattern (all template sends):**

```ts
let gupshupStatus = 0, gupshupBody = '', delivered = false;
try {
  const res = await fetch('.../template/msg', { ... });
  gupshupStatus = res.status;
  gupshupBody   = await res.text();
  delivered     = isGupshupDelivered(res.ok, gupshupBody);
} catch (fetchErr) {
  gupshupStatus = 0; gupshupBody = String(fetchErr); delivered = false;
} finally {
  await logNotification({ ..., gupshupStatus, gupshupBody, delivered });
}
```

`logNotification` runs **only** in `finally` — exactly one log row per attempt, regardless of how control exits (covers an exception thrown by `res.text()` itself). It is **awaited** so the row is durably written before the send function resolves: these sends are awaited up the chain (via `notifyLeadAssigned` → `after()`) and Vercel keeps the lambda alive only until the awaited chain settles. A `void logNotification()` would let the lambda freeze and drop the insert — the exact silent gap (missing rows, not error rows) this pattern prevents. Full rule in `src/lib/services/CLAUDE.md`.

**`isGupshupDelivered(httpOk, body)`:** Gupshup returns HTTP 200 even for application-level errors (inactive number, template-ID mismatch). `delivered` is `false` when `!httpOk` OR the parsed body has `{ status: 'error' }`. A non-JSON body is trusted as delivered.

**No longer "fire-and-forget at the call site":** The template send functions still swallow their own errors internally (except `sendLeadInitiationMessage`, which re-throws). But callers no longer use bare `void fn()`. Lead-assignment paths route through `notifyLeadAssigned` (§4d), which **awaits** the sends and is itself wrapped in `after()`. SLA breach sends are awaited inside the SLA handler. See §6 / §7 for call sites.

**Import restriction:** File reads secrets at module load and uses `createAdminClient`. Importing in a client bundle would expose env expectations and pull server-only code — **hard failure**. Client components must use `sendWhatsAppMessage` / `initiateWhatsAppConversationAction` actions instead.

---

#### 4c. `whatsapp-ingestion.ts` — SERVER ONLY, adminClient inbound pipeline

All writes bypass RLS. Idempotent on `wa_message_id` for inbound messages.

| Export | One-line description |
| --- | --- |
| `parseWebhookPayload(body)` | Flattens Meta `entry[].changes[]` into `{ type: 'message' \| 'status', data, waId, phone }[]` |
| `processInboundMessage(waId, phone, message, senderName?)` | Full inbound pipeline (below) |
| `processStatusUpdate(waMessageId, status)` | Delivery receipt UPDATE (`status`, `status_at` only) |
| `resolveLeadByPhone(normalizedPhone)` | Latest non-archived lead by phone |
| `getOrCreateConversation(leadId, waId, phone)` | SELECT → INSERT → re-SELECT (race-safe) |
| `insertInboundMessage(conversationId, leadId, message, mediaUrl?)` | Sanitized insert, inbound row |

**`processInboundMessage` — pipeline in order:**

1. **Normalize phone** — `normalizeToE164(phone)`; fallback `+` prefix if normalize throws.
2. **Dedup guard** — SELECT `whatsapp_messages` WHERE `wa_message_id = message.id`; if exists, **return** (idempotent).
3. **Resolve lead** — `resolveLeadByPhone(normalizedPhone)`.
4. **Create lead if missing** — `createLeadFromWhatsApp(waId, normalizedPhone, senderName)` from `lead-ingestion.ts`; re-fetch lead row. **Then fire `notifyLeadAssigned(...)` (awaited, not void)** — agent + founder WhatsApp, in-app notification, and SLA timers for the brand-new lead. Awaited because this code already runs inside the route's `after()`; a bare `void` would detach the send and Vercel would freeze the lambda before Gupshup is reached. The agent name is fetched (one query, non-fatal) to populate the founder alert.
5. **Get or create conversation** — `getOrCreateConversation(leadId, waId, normalizedPhone)`.
6. **Resolve media URL** — if image/video/document/audio, `getMediaDownloadUrl` (non-fatal on failure).
7. **Insert inbound message** — `insertInboundMessage` (`sanitizeText` on text/caption; inbound rows insert `status: null`).
8. **Update conversation** — `last_message_at = now()` on `whatsapp_conversations`.
9. **Realtime** — implicit via `supabase_realtime` publication (no explicit broadcast call).

**`processStatusUpdate`:** adminClient `.update({ status, status_at })` WHERE `wa_message_id = ?`. Checks the returned `count` — logs a warning when no row matched (unknown `wa_message_id`). Only allowed mutation on `whatsapp_messages`. Satisfies A-11 as a **system** webhook write.

**`getOrCreateConversation` — why three steps, not one UPSERT:**

1. SELECT by `lead_id` (hot path).
2. INSERT new row (concurrent webhooks may race on `lead_id` UNIQUE; the 409 on duplicate is expected and ignored).
3. Re-SELECT by `lead_id` — winner and loser both read the existing row.

PostgREST insert does not expose `ON CONFLICT DO NOTHING` cleanly; re-SELECT is the recovery path.

**`createLeadFromWhatsApp`:** Lives in `src/lib/services/lead-ingestion.ts`. Inserts lead with `source: 'whatsapp'` (indexed flat column) and `attribution: { platform: 'whatsapp' }` (JSONB bag), default domain, round-robin assign, `lead_created` + optional `agent_assigned` activities. Returns `{ leadId, assignedTo, assignedAt, domain }`. Called from step 4 when phone has no active lead. Both `source` and `attribution` must always be set together — `source` is what `WHERE source = 'whatsapp'` queries hit; `attribution` is the platform-specific extras bag.

**Gupshup path note:** Active webhook returns `200` for `message-event` **without** calling `processStatusUpdate`. Delivery status persistence runs on the **Meta** branch today. Gupshup delivery receipts are acknowledged but not persisted unless the handler is extended.

---

#### 4d. `lead-assignment-notify.ts` — assignment side-effect orchestrator

**SERVER ONLY.** Single entry point for everything that must happen when a lead is assigned, from any of the four assignment paths (lead webhook, WhatsApp inbound, `assignLead`, `createManualLead`). Callers perform **no** direct WhatsApp / in-app / SLA calls of their own.

**`notifyLeadAssigned(input)` fires four side-effects, in order:**

1. **Agent WhatsApp** — `sendLeadAssignmentNotification`, only when `assignedTo` is set. **Awaited.**
2. **Founder WhatsApp** — `sendFounderLeadNotification(domain, agentName ?? 'Unassigned', ...)`, always on new leads, suppressed when `isDuplicate`. **Awaited.** (1 + 2 run in parallel via `Promise.allSettled` so one failure never aborts the other.)
3. **In-app notification** — `createNotification({ type: 'lead_assigned' })`, only when `assignedTo` is set AND `assignedTo !== actorId` (suppresses self-notify). Fire-and-forget (`.catch(() => {})`).
4. **SLA timers** — `scheduleSlaTimersForLead(...)` (dynamic import of `@/lib/actions/sla`), only when `scheduleSla` is true AND `assignedTo` is set. Non-fatal on failure.

**Why the WhatsApp sends are awaited (Vercel):** on serverless, the lambda is frozen the instant the response flushes. A `void fetch().catch()` here would orphan the send mid-flight and `logNotification` would never run (no log row). Callers MUST run `notifyLeadAssigned` inside `after()` (Next 16) so the response returns immediately while Vercel keeps the lambda alive until the awaited sends settle. The WhatsApp ingestion path is the one exception that uses a plain `await` — it is already inside the whatsapp route's `after()`.

**Input shape (`LeadAssignedNotifyInput`):** `leadId`, `assignedTo`, `agentName`, `leadName`, `leadPhone`, `domain`, `isNew`, `isDuplicate`, `actorId?`, `scheduleSla`, `leadStatus?` (default `'new'`), `assignedAt?` (default now).

Full call-site rules in `src/lib/actions/CLAUDE.md` § "Founder WhatsApp alert".

---

### 6. Server Actions — `whatsapp.ts`

All mutations run Zod first and return `ActionResult` unless noted.

| Action | Schema / validation | Auth | Service / writes | Return |
| --- | --- | --- | --- | --- |
| `sendWhatsAppMessage` | Inline `SendMessageSchema` (uuid + content 1–4096, `sanitizeText` transform) | `getCurrentProfile()` | `getConversation` → `sendTextMessage` → **session-client** insert outbound row → update `last_message_at` | `ActionResult<WhatsAppMessage>` |
| `markConversationAsRead` | `ConversationIdSchema` | Profile required | `markConversationRead()` | `ActionResult<null>` |
| `resolveConversation` | `ConversationIdSchema` | Profile + role ∈ `manager, admin, founder` | Session update `status = resolved` | `ActionResult<null>` |
| `reopenConversation` | `ConversationIdSchema` | Same manager+ guard | Session update `status = open` | `ActionResult<null>` |
| `getConversationsAction` | `WhatsAppListFilterSchema` | Profile required | `getConversations()` | `{ conversations, nextCursor }` |
| `getMessagesAction` | UUID parse on id | Profile required | `getMessages()` | `WhatsAppMessage[]` |
| `getConversationByLeadIdAction` | UUID parse on `leadId` | Profile required | `getConversationByLeadId()` | `{ data: WhatsAppConversation \| null, error }` — **null data is not an error** (no conversation yet) |
| `initiateWhatsAppConversationAction` | UUID parse on `leadId` | Profile required | See below | `ActionResult<{ conversation, message }>` |
| `searchConversationsAction` | `WhatsAppSearchFilterSchema` | Profile required | `searchConversations()` | `WhatsAppConversation[]` |

**`initiateWhatsAppConversationAction(leadId)` — agent-initiated conversation:**

1. UUID validate; load lead via **session client** (RLS access check — returns null if caller lacks access). Reject if no phone.
2. **Idempotency:** if a conversation already exists (`getConversationByLeadId`), return it with a synthetic `init-placeholder-*` message so the card can transition; the card then loads real messages via Realtime.
3. Insert the conversation via **adminClient** (no app-user INSERT policy). On UNIQUE conflict (race), re-fetch the existing row.
4. Send the `lead_initiation` Gupshup template via `sendLeadInitiationMessage(phone, leadName, agentName)`. **Throws on failure** → action returns a user-facing error (conversation row already created; lead receives messages when they reply).
5. Insert the outbound `template` message row (adminClient) with content `Hello {leadName}, this is {agentName} from Indulge Global.` and update `last_message_at`.

`agentName` resolves to the lead's assignee full name, falling back to the caller's name.

**Role allow-lists:** `resolveConversation` / `reopenConversation` duplicate `['manager', 'admin', 'founder']` inline — UI uses `MANAGER_ROLES`; keep in sync.

---

### 8. `/whatsapp` Page Architecture

#### 8a. Page component (`page.tsx`)

Server component:

1. `getCurrentProfile()` — guest → redirect `/dashboard`; unauthenticated → `/login`.
2. `parseWhatsAppPeriodFromSearchParams(searchParams)` for `period`, `customFrom`, `customTo`.
3. `Promise.all`:
   - `getConversations({ limit: WHATSAPP_CONVERSATIONS_PAGE_SIZE (20), period, customFrom, customTo })`
   - `getUnreadCount()`

Passes to `WhatsAppShell`: `initialConversations` (conversations array), `unreadCount`, `callerProfile` (`{ id, full_name, avatar_url, role }`).

No `Suspense` boundary on page — `loading.tsx` handles the route-level skeleton.

#### 8b. Layout contract

- **Not** the standard `p-8` list-page layout. Shell is `flex min-h-0 flex-1 overflow-hidden` inside the dashboard paper card (`height: calc(100dvh - 24px)` on parent).
- **Left rail (320px):** `paddingTop` / `paddingLeft` `var(--space-8)` — title row with `mb-6`, then conversation list.
- **Right panel:** `flex: 1`, `background: var(--theme-paper-subtle)`, starts at top of paper card. Contact header inside `ConversationPanel` supplies top breathing room (`padding: var(--space-8) var(--space-8) var(--space-5)`).

#### 8c. `WhatsAppShell`

**Owns:** conversation list state, `activeConversationId`, `activeMessages`, cursor pagination, period refetch on URL change, unread badge display, Realtime on `whatsapp_conversations`.

**Realtime channel:** `wa-conversations-${callerProfile.id}-${mountId}` where `mountId = useId()`. StrictMode-safe; cleanup via `supabase.removeChannel(channel)`.

**Events:** `INSERT` → prepend; `UPDATE` → merge row and re-sort by `last_message_at` DESC (fallback `created_at`).

**Pagination:** `handleLoadMore` → `getConversationsAction({ cursor, limit: 20, ...period })`. **Select conversation:** `getMessagesAction(id)` → sets `activeMessages`.

#### 8d. `ConversationList`

- **SearchBar:** `size="sm"`, placeholder "Search conversations…", **300ms debounce** → `searchConversationsAction({ query, ...period })`.
- **Period filter:** `WhatsAppConversationPeriodFilter` in card header (URL-driven).
- **Load more:** `IntersectionObserver` on sentinel (`threshold: 0.5`) — P-05 (no scroll listener). Disabled during search results.
- **End state:** "That's everything." when `!hasMore && list length >= WHATSAPP_CONVERSATIONS_PAGE_SIZE` and not searching.
- **Skeleton:** `loading.tsx` mirrors the rail (title shimmer, search card, 7 staggered row shimmers).
- **Row pattern:** Bordered card (`--shadow-1`, `--radius-lg`), uppercase "Conversations" label.

#### 8e. `ConversationRow`

**Renders:** `Avatar` (sm) with optional unread dot (10px accent, top-right), lead name (ellipsis), trailing mono timestamp or "Resolved" in success colour.

**Active/hover state:** `Avatar` `selected={isActive || hovered}` — **accent ring on avatar**, not a row background fill and **not** a left-border strip. Name → semibold on hover; trailing time → accent (unless resolved). Row background stays transparent.

**Motion:** `opacity 0→1`, `x -8→0`, stagger delay prop (max 280ms).

#### 8f. `ConversationPanel`

**Zones:**

1. **Header** — Avatar, Playfair italic name, mono phone, resolved pill, Resolve/Reopen (`Button`) when `MANAGER_ROLES.includes(role)`.
2. **Message list** — `var(--theme-paper-subtle)`, date separators (Today / Yesterday / formatted), `MessageBubble` per message, auto-scroll bottom on `messages` change.
3. **Composer** — floating paper card with textarea + Send; resolved → italic banner "This conversation is resolved. Reopen to send messages."

**Realtime:** `wa-messages-${conversation.id}-${mountId}` on `whatsapp_messages` filtered by `conversation_id`. `INSERT` — dedupe `seenIds`; outbound echo replaces oldest optimistic row when `sender_id === caller`; else append. `UPDATE` — merge `status` / `status_at` (delivery ticks).

**`markConversationRead`:** `markConversationAsRead` action on `conversation.id` change (panel open).

**Optimistic send:** Local row with `optimistic-*` id, `wa_message_id: null`; on success replace with server row; on error remove + `toast.danger`.

**Char warning:** Shows `draft.length / 4096` when length **> 3000** (`WARN_CHARS`); hard cap 4096 on input.

#### 8g. `MessageBubble`

| Aspect | Inbound | Outbound |
| --- | --- | --- |
| Alignment | `flex-start` | `flex-end` |
| Surface | `var(--theme-paper)` + paper border | `var(--theme-accent-surface)` + accent-tinted border |
| Sender row | Avatar xs + name (lead) | — |
| Bot label | — | "Elaya" above bubble when `is_bot` |

**Delivery icons (outbound only):** `sent` → `Check` tertiary; `delivered` → `CheckCheck` tertiary; `read` → `CheckCheck` accent; `failed` → `X` danger.

**Media:** `message_type` ∈ `image|video|document|audio` → `MediaPlaceholder` with icon + label + optional "View" link.

#### 8h. `EmptyConversationState`

Right-pane default when no conversation is selected. Motion `opacity 0→1`, `y 8→0`, `ENTER_DURATION`, `EASE_OUT_EXPO`. Heading (Playfair italic) "Select a conversation."; subtext "Choose from the list to view the full thread."

---

### 8i. Lead dossier card — `LeadWhatsAppCard`

**File:** `src/components/leads/LeadWhatsAppCard.tsx` (`'use client'`). Embedded chat thread on `/leads/[id]`, placed between the 2-col grid and `LeadNotesSection`.

**Props:** `leadId`, `leadPhone`, `leadName`, `callerProfile: { id, role }`, `initialConversation: WhatsAppConversation | null`, `initialMessages: WhatsAppMessage[]`.

**States:**

- **No phone:** Playfair italic "No phone number on file." — no composer.
- **No conversation (phone present):** renders a "Start Conversation" `Button` → `initiateWhatsAppConversationAction(leadId)`. On success: `setConversation(data.conversation)` + `setMessages([data.message])`.
- **Resolved:** composer replaced by italic banner.

**Realtime:** channel `wa-messages-${conversationId}-${mountId}`, gated on **state** `conversation?.id` (not the prop) — auto-subscribes after initiation with no extra wiring. `seenIds` seeded from `initialMessages`; `optimisticIds` tracks pending sends; cleanup via `supabase.removeChannel(channel)`.

**Invariant:** imports ONLY from `lib/actions/whatsapp.ts` — never `whatsapp-service.ts` (server-client restriction).

**Dossier page wiring** (`src/app/(dashboard)/leads/[id]/page.tsx`): fetches the conversation via `getConversationByLeadId` and its messages on the server, passing both as `initialConversation` / `initialMessages`.

---

### 9. Realtime — Both Channels

| Channel | Pattern | Table | Events | Owner | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Conversations | `wa-conversations-${userId}-${mountId}` | `whatsapp_conversations` | `INSERT` prepend; `UPDATE` merge + re-sort | `WhatsAppShell` | `removeChannel` on unmount |
| Messages | `wa-messages-${conversationId}-${mountId}` | `whatsapp_messages` (filter `conversation_id=eq.${id}`) | `INSERT` append/replace optimistic; `UPDATE` status | `ConversationPanel` and `LeadWhatsAppCard` | `removeChannel` on unmount / conversation change |

`mountId` from `useId()` is mandatory for React StrictMode double-mount safety (P-06).

---

### 10. Access Control Summary

| Role | Conversation list | Can send | Can initiate (dossier) | Can resolve/reopen |
| --- | --- | --- | --- | --- |
| **Agent** | Leads assigned to self (`can_access_wa_conversation`) | Yes, if accessible | Yes, if accessible | No |
| **Manager** | All leads in domain | Yes | Yes | Yes |
| **Admin** | All conversations | Yes | Yes | Yes |
| **Founder** | All conversations | Yes | Yes | Yes |
| **Guest** | Redirected away from `/whatsapp` | — | — | — |

| Capability | Enforcement layer |
| --- | --- |
| List/message visibility | RLS + `can_access_wa_conversation(lead_id)` on conversations/messages |
| Outbound INSERT (inbox) | RLS policy `wa_messages_outbound_insert` + action loads conversation via session client |
| Conversation creation (initiate) | Session-client lead SELECT (RLS access gate) → adminClient INSERT |
| Resolve/reopen | **Component** `MANAGER_ROLES` hides buttons; **action** checks `manager \| admin \| founder` |
| Inbound webhook writes | Service-role only (`whatsapp-ingestion`) |
| Template notifications | `whatsapp-api` adminClient; no user-facing permission |

---

### 11. Known Invariants (must never be violated)

1. **`whatsapp_messages` is append-only** for all authenticated roles. No DELETE policy. No UPDATE policy for app users. The **only** UPDATE is `status` + `status_at` via **`adminClient`** in `processStatusUpdate` (delivery receipts) — a narrow A-11 system exception.

2. **`wa_message_id` uniqueness uses a partial unique index** `WHERE wa_message_id IS NOT NULL`, not a column UNIQUE constraint — so multiple `NULL` rows (optimistic outbound) do not conflict.

3. **Webhook handlers must return `200`** for accepted/ignored events so providers do not retry. Use `401`/`400` only for auth/parse failures.

4. **`logNotification` stores last-4 phone digits only** — never full numbers. It runs in a `finally` block (exactly one row per send attempt) and is **awaited** so the row is durable before the lambda can freeze.

5. **Lead-assignment WhatsApp sends route through `notifyLeadAssigned`**, never via bare `void fn()`. The orchestrator awaits the Gupshup sends; callers wrap it in `after()` (except WhatsApp ingestion, already inside the route's `after()`, which uses plain `await`). A bare `void` send is silently lost when the Vercel lambda freezes.

6. **`can_access_wa_conversation` is coupled to `leads` RLS semantics** — if lead visibility rules change, update the function and retest all `wa_*` policies.

7. **Webhook async work runs inside Vercel `after()`** with `maxDuration = 60` so the HTTP response returns immediately while ingestion + the new-lead notification chain complete on the same invocation.

8. **Client components must not import `whatsapp-api.ts` or `whatsapp-ingestion.ts`** — server-only secrets and adminClient. Use `src/lib/actions/whatsapp.ts` wrappers.

9. **Keyset pagination on nullable sort columns requires a composite cursor** — `getConversations` uses a single-column `last_message_at` cursor today; safe for period-filtered lists (which exclude null timestamps) but not guaranteed for unfiltered lists with never-messaged conversations. Adopt the four-branch `.or()` pattern (reference: `getPersonalTasks`) if that edge case matters.

10. **Realtime teardown uses `supabase.removeChannel(channel)`** — never `channel.unsubscribe()` alone on the singleton browser client.

11. **Inbound message inserts use `adminClient`** in `whatsapp-ingestion.ts`; inbox outbound inserts use the **session client** (`wa_messages_outbound_insert` RLS); initiation inserts use **adminClient** (creates the parent conversation too).

12. **Do not conflate the service files** — session+RLS (`whatsapp-service`), HTTP+templates (`whatsapp-api`), admin+pipeline (`whatsapp-ingestion`), assignment orchestrator (`lead-assignment-notify`).

13. **Bot columns and `is_bot` UI are not an implemented chatbot** — no autonomous replies; planned only.

14. **Gupshup `message-event` is ack-only today** — delivery status persistence runs on the Meta webhook path unless the Gupshup handler is extended to call `processStatusUpdate`.

15. **`whatsapp_notification_logs.type` is a 4-value CHECK** (`agent_assignment`, `founder_alert`, `sla_breach`, `lead_initiation`) since migration 0067 — extend with a new migration before logging any new type.

---

### File index (implementation)

| Area | Path |
| --- | --- |
| Inbox page | `src/app/(dashboard)/whatsapp/page.tsx`, `loading.tsx` |
| Inbox UI | `src/components/whatsapp/*.tsx` |
| Dossier card | `src/components/leads/LeadWhatsAppCard.tsx` |
| Actions | `src/lib/actions/whatsapp.ts` |
| Services | `whatsapp-service.ts`, `whatsapp-api.ts`, `whatsapp-ingestion.ts`, `lead-assignment-notify.ts` |
| Lead bridge | `src/lib/services/lead-ingestion.ts` → `createLeadFromWhatsApp` |
| Validations | `src/lib/validations/whatsapp-schema.ts` |
| Constants | `src/lib/constants/whatsapp.ts`, `whatsapp-period.ts` |
| Types | `src/lib/types/whatsapp.ts` |
| Webhook | `src/app/api/webhooks/whatsapp/route.ts` |
| Migrations | `0032`–`0038`, `0041`, `0067` (log types), `0085` (unread fix), `0088` (RLS hoist) |
