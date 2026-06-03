# WhatsApp Page — Full Intelligence Document

Last verified: 2026-06-01

---

## 1. Module Overview

The WhatsApp module gives Indulge agents and managers a shared inbox inside Eia: every lead phone number maps to one conversation thread, messages sync in real time, and agents reply without leaving the dashboard. It sits in the Gia domain because conversations are keyed to `leads` and inherit the same assignment and domain rules as the lead list.

**Two surfaces:**

| Surface | Route / file | Role |
| --- | --- | --- |
| **Inbox UI** | `/whatsapp` — `src/app/(dashboard)/whatsapp/page.tsx` | Authenticated users browse conversations, read threads, send outbound text, resolve/reopen (manager+). |
| **Inbound pipeline** | `POST /api/webhooks/whatsapp` — `src/app/api/webhooks/whatsapp/route.ts` | Gupshup (active) or Meta (dormant) webhooks authenticate, acknowledge fast, and process messages asynchronously. |

**AI chatbot:** Planned, not built. Columns `bot_active`, `bot_paused_by`, and `bot_paused_at` exist on `whatsapp_conversations` (defaults: `bot_active = true`). No application code reads or writes them for bot behaviour. `MessageBubble` shows a “Lia” label when `is_bot = true`, but nothing in the pipeline sets `is_bot` on outbound messages today.

**BSP:** Gupshup v1 for outbound text and template notifications. Meta Cloud API helpers remain in `whatsapp-api.ts` for a future switch; they are not called on the active Gupshup path except `getMediaDownloadUrl` during inbound media handling (requires Meta credentials when media arrives).

---

## 2. Data Model

### 2a. `whatsapp_conversations`

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

**RLS** (migration 0032, policies recreated in 0041):

| Policy | Operation | Rule |
| --- | --- | --- |
| `wa_conversations_agent_select` | SELECT | `get_user_role() = 'agent'` AND `can_access_wa_conversation(lead_id)` |
| `wa_conversations_manager_select` | SELECT | `get_user_role() = 'manager'` AND `can_access_wa_conversation(lead_id)` |
| `wa_conversations_admin_founder_select` | SELECT | `get_user_role() IN ('admin', 'founder')` |
| `wa_conversations_update` | UPDATE | Agent/manager with `can_access_wa_conversation(lead_id)`, or admin/founder |

No INSERT policy for app users — conversation rows are created by **service-role** (`whatsapp-ingestion.ts`) or implicitly when the first message path runs.

**Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations`.

---

### 2b. `whatsapp_messages`

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
| `status` | `text` | YES | `'sent'` | CHECK: `sent`, `delivered`, `read`, `failed` (outbound) |
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

A column-level `UNIQUE` constraint would treat each `NULL` as distinct in PostgreSQL but still block multiple explicit NULLs in some client patterns and confuses optimistic outbound rows: the composer inserts outbound rows with `wa_message_id` from Gupshup after send, but optimistic UI rows use `wa_message_id: null` until confirmed. Multiple concurrent optimistic rows may carry `NULL` `wa_message_id` without conflicting. Inbound rows always set `wa_message_id` from the provider for dedup.

**RLS:**

| Policy | Operation | Conditions |
| --- | --- | --- |
| `wa_messages_agent_select` | SELECT | Agent + `can_access_wa_conversation(lead_id)` |
| `wa_messages_manager_select` | SELECT | Manager + `can_access_wa_conversation(lead_id)` |
| `wa_messages_admin_founder_select` | SELECT | Admin/founder |
| `wa_messages_outbound_insert` (0037) | INSERT | `direction = 'outbound'` AND `sender_type = 'agent'` AND `sender_id = auth.uid()` AND `can_access_wa_conversation(lead_id)` AND role IN (`agent`, `manager`, `admin`, `founder`) |

**Inbound INSERT:** No policy for regular users — only **service-role** via `whatsapp-ingestion.ts` (`insertInboundMessage`).

**Realtime:** Enabled on `whatsapp_messages`.

---

### 2c. `whatsapp_conversation_reads`

Per-agent read cursor for unread badge logic (not in original Gia spec — deliberate addition).

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `conversation_id` | `uuid` | NO | — | FK → `whatsapp_conversations` |
| `agent_id` | `uuid` | NO | — | FK → `profiles` |
| `last_read_at` | `timestamptz` | NO | `now()` | |

**UNIQUE:** `(conversation_id, agent_id)` — one read row per agent per conversation.

**RLS:** Agents only — SELECT/INSERT/UPDATE where `agent_id = auth.uid()`. Managers/admins have no policies here (global unread badge uses RPC, not per-row reads for those roles).

**Unread derivation:** `get_wa_unread_count()` LEFT JOINs `whatsapp_conversation_reads wcr` ON `wcr.conversation_id = wc.id AND wcr.agent_id = auth.uid()`. A conversation counts as unread when `status = 'open'` AND (`wcr.last_read_at IS NULL` OR `wc.last_message_at > wcr.last_read_at`) AND access check passes.

`markConversationRead()` UPSERTs `{ conversation_id, last_read_at }` with `onConflict: 'conversation_id,agent_id'`; `agent_id` is implied by RLS on INSERT/UPDATE.

---

### 2d. `whatsapp_notification_logs`

Audit log for **template** sends only (not agent-composed inbox messages).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `type` | `text` | CHECK: `'agent_assignment' \| 'founder_alert'` |
| `lead_id` | `uuid` | Nullable FK |
| `recipient_id` | `uuid` | Nullable FK → profiles |
| `recipient_phone` | `text` | **Last 4 digits only** |
| `agent_name` | `text` | Optional |
| `lead_name` | `text` | Optional |
| `lead_phone` | `text` | **Last 4 digits only** when set |
| `domain` | `text` | `app_domain` after migration 0041 |
| `gupshup_status` | `int` | HTTP status |
| `gupshup_body` | `text` | Truncated to 2000 chars in app |
| `delivered` | `boolean` | `res.ok` |
| `created_at` | `timestamptz` | |

**Who writes:** Internal `logNotification()` in `whatsapp-api.ts` only (adminClient). Never throws to caller.

**RLS:** SELECT for admin/founder only.

---

## 3. Database RPCs and Helpers

### 3a. `can_access_wa_conversation(p_lead_id uuid)`

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

**Migrations/policies that depend on it:** All `whatsapp_conversations` and `whatsapp_messages` SELECT/UPDATE policies; `get_wa_unread_count()` (see caveat below).

**Coupling warning:** Access is defined by querying `leads` with the same rules as lead RLS. If lead assignment or domain policies change, **review and update this function** — conversation and message visibility will drift otherwise.

**Why recreated in 0041:** Migration 0041 changed `leads.domain` and related columns from `text` to `app_domain`. The original function used `l.domain = get_user_domain()::text`. After both sides are `app_domain`, the `::text` cast was removed: `l.domain = get_user_domain()`.

---

### 3b. `get_wa_unread_count()`

- **Migration:** `20260530000036_rpc_get_wa_unread_count.sql`
- **Signature:** `get_wa_unread_count()` → `integer`
- **Security:** `STABLE SECURITY DEFINER`, `GRANT EXECUTE TO authenticated`

**Logic:**

```sql
SELECT COUNT(*)::integer
FROM whatsapp_conversations wc
LEFT JOIN whatsapp_conversation_reads wcr
  ON wcr.conversation_id = wc.id AND wcr.agent_id = auth.uid()
WHERE wc.status = 'open'
  AND (wcr.last_read_at IS NULL OR wc.last_message_at > wcr.last_read_at)
  AND can_access_wa_conversation(wc.id)  -- note: parameter is conversation id in migration file
```

**Returns:** Integer count; `COUNT(*)` never returns NULL — service layer coalesces to `0` on RPC error.

**Call sites:**

- `getUnreadCount()` in `whatsapp-service.ts` → `supabase.rpc('get_wa_unread_count')`
- `page.tsx` `Promise.all` with initial conversations — badge in `WhatsAppShell` header

**Implementation note:** The function parameter is named `p_lead_id` but migration 0036 passes `wc.id` (conversation id). Correct gate is `can_access_wa_conversation(wc.lead_id)`. If unread badge reads zero unexpectedly, verify this argument in a follow-up migration.

Per-row unread dots in `ConversationRow` use optional `conversation.unread_count` on the type; list queries do not populate that field today — header badge uses RPC only.

---

## 4. The Three Service Files — Responsibilities and Boundaries

These three files are **not** interchangeable. Trust model, Supabase client, and error contracts differ.

| File | Client | RLS | Throws to caller? | Import from `'use client'`? |
| --- | --- | --- | --- | --- |
| `whatsapp-service.ts` | Session (`createClient()` server) | **Yes** — access enforced by DB | Returns empty/null on error | **No** — use actions |
| `whatsapp-api.ts` | None (HTTP) + admin for logs | Bypass for logs only | **Never** on send helpers | **Never** |
| `whatsapp-ingestion.ts` | **adminClient** throughout | Bypass | Logs errors; inbound dedup exits silently | **Never** |

---

### 4a. `whatsapp-service.ts` — session client, UI queries

**Rule:** No manual domain/role checks — RLS + `can_access_wa_conversation` decide visibility. No `adminClient`.

Until `database.ts` includes WhatsApp tables, all queries cast supabase to `any` (same pattern as new RPCs).

| Export | Parameters | Returns | Query pattern |
| --- | --- | --- | --- |
| `getConversations` | `{ limit?, cursor?, period?, customFrom?, customTo? }` | `{ conversations, nextCursor }` | Join `leads!inner` for name/phone; `order last_message_at DESC nullsFirst: false`; optional period on `last_message_at`; cursor: `.lt('last_message_at', cursor)` when cursor set |
| `getConversation` | `conversationId: string` | `WhatsAppConversation \| null` | Single row + lead join |
| `getMessages` | `conversationId`, `{ limit?, before? }` | `WhatsAppMessage[]` | ASC `created_at`; profile join for sender; `before` → `.lt('created_at', before)` (older page) |
| `getUnreadCount` | none | `number` | `rpc('get_wa_unread_count')`; **0 on error**, never null |
| `markConversationRead` | `conversationId` | `void` | UPSERT `whatsapp_conversation_reads` on `(conversation_id, agent_id)` |
| `searchConversations` | `query`, optional period filters | `WhatsAppConversation[]` | `sanitizeText` + trim; ILIKE on `leads.first_name`, `leads.last_name`, `phone`; max **20**; same period helper |

**Pagination cursor (`getConversations`):**

- Sort: `last_message_at DESC`, `nullsFirst: false` (null timestamps sort last).
- Cursor value: ISO string of the **last row’s** `last_message_at` from the previous page.
- Continuation: `.lt('last_message_at', cursor)`.

**Composite cursor rule (nullable sort columns):** Keyset pagination with a single `.gt('col', cursor)` or `.lt('col', cursor)` **silently drops rows where `col IS NULL`** because `NULL` comparisons are unknown in SQL. The platform rule (see `src/lib/CLAUDE.md`) requires a composite cursor `{ last_message_at, id }` with a four-branch `.or()` when the sort column is nullable. `getConversations` today uses a **single-column** cursor on `last_message_at`. Period-filtered lists call `.not('last_message_at', 'is', null)` first, which avoids null cursor rows in filtered mode. Unfiltered lists with conversations that never received a message (`last_message_at IS NULL`) may not paginate correctly — if that edge case matters, adopt the composite pattern from `getPersonalTasks`.

**`getMessages` cursor:** Uses non-null `created_at` (NOT NULL column) — single-column `before` is safe.

---

### 4b. `whatsapp-api.ts` — SERVER ONLY, Gupshup/Meta HTTP

**Startup guard** (module load throws if missing):

- `GUPSHUP_API_KEY`
- `GUPSHUP_APP_NAME`
- `GUPSHUP_PARTNER_NUMBER`
- `GUPSHUP_WEBHOOK_SECRET`

Optional (Meta dormant): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.

| Export | Purpose |
| --- | --- |
| `sendTextMessage(to, text)` | Gupshup `POST https://api.gupshup.io/wa/api/v1/msg`, `application/x-www-form-urlencoded`, header `apikey` (not Bearer). Returns `MetaApiResponse` shape. |
| `sendTemplateMessage` | Meta Graph API — dormant |
| `sendMediaMessage` | Meta — dormant |
| `uploadMedia` | Meta — dormant |
| `getMediaDownloadUrl(mediaId)` | Meta media URL fetch — used by ingestion for inbound media |
| `verifyMetaSignature(rawBody, signatureHeader)` | HMAC-SHA256 vs `WHATSAPP_WEBHOOK_SECRET`; **`timingSafeEqual`** on equal-length buffers; header format `sha256=<hex>` |
| `sendLeadAssignmentNotification(agentId, leadName, leadPhone, domain?)` | Gupshup template message to agent’s profile phone |
| `sendFounderLeadNotification(domain, agentName, leadName, leadPhone)` | Template to all founders with phones |
| `sendSlaAgentNotification(agentId, leadName, leadPhone, status, lastUpdatedAt)` | SLA agent template |
| `sendSlaManagerNotification(recipientIds[], leadName, leadPhone, agentName, status, lastUpdatedAt)` | SLA manager template per recipient |
| `WEBHOOK_VERIFY_TOKEN` | Re-export for GET challenge |
| `BUSINESS_ACCOUNT_ID` | Re-export |

**`logNotification(entry)`** (internal): Inserts into `whatsapp_notification_logs` via adminClient. `recipient_phone` and `lead_phone` stored as **`.slice(-4)` only**. `gupshup_body` truncated to 2000 chars. Wrapped in try/catch — **never throws**.

**Fire-and-forget contract:** `sendLeadAssignmentNotification`, `sendFounderLeadNotification`, `sendSlaAgentNotification`, `sendSlaManagerNotification` catch all errors internally. Callers use `void fn(...)` from `leads.ts`, `sla.ts`, and lead webhook — lead actions must succeed even if WhatsApp fails.

**`sendTextMessage`:** Can throw on HTTP failure — `sendWhatsAppMessage` action catches and surfaces to UI.

**Import restriction:** File reads secrets at module load and uses `createAdminClient`. Importing in a client bundle would expose env expectations and pull server-only code — **hard failure**. Client components must use `sendWhatsAppMessage` action instead.

---

### 4c. `whatsapp-ingestion.ts` — SERVER ONLY, adminClient inbound pipeline

All writes bypass RLS. Idempotent on `wa_message_id` for inbound messages.

| Export | One-line description |
| --- | --- |
| `parseWebhookPayload(body)` | Flattens Meta `entry[].changes[]` into `{ type: 'message' \| 'status', data, waId, phone }[]` |
| `processInboundMessage(waId, phone, message, senderName?)` | Full 9-step inbound pipeline (below) |
| `processStatusUpdate(waMessageId, status)` | Delivery receipt UPDATE (`status`, `status_at` only) |
| `resolveLeadByPhone(normalizedPhone)` | Latest non-archived lead by phone |
| `getOrCreateConversation(leadId, waId, phone)` | SELECT → INSERT → re-SELECT (race-safe) |
| `insertInboundMessage(conversationId, leadId, message, mediaUrl?)` | Sanitized insert, inbound row |

**`processInboundMessage` — 9 steps in order:**

1. **Normalize phone** — `normalizeToE164(phone)`; fallback `+` prefix if normalize throws.
2. **Dedup guard** — SELECT `whatsapp_messages` WHERE `wa_message_id = message.id`; if exists, **return** (idempotent).
3. **Resolve lead** — `resolveLeadByPhone(normalizedPhone)`.
4. **Create lead if missing** — `createLeadFromWhatsApp(waId, normalizedPhone, senderName)` from `lead-ingestion.ts`; re-fetch lead row.
5. **Get or create conversation** — `getOrCreateConversation(leadId, waId, normalizedPhone)`.
6. **Resolve media URL** — if image/video/document/audio, `getMediaDownloadUrl` (non-fatal on failure).
7. **Insert inbound message** — `insertInboundMessage` (`sanitizeText` on text/caption).
8. **Update conversation** — `last_message_at = now()` on `whatsapp_conversations`.
9. **Realtime** — implicit via `supabase_realtime` publication (no explicit broadcast call).

**`processStatusUpdate`:** adminClient `.update({ status, status_at })` WHERE `wa_message_id = ?`. Only allowed mutation on `whatsapp_messages`. Satisfies A-11 as a **system** webhook write.

**`getOrCreateConversation` — why three steps, not one UPSERT:**

1. SELECT by `lead_id` (hot path).
2. INSERT new row (concurrent webhooks may race on `lead_id` UNIQUE).
3. Re-SELECT by `lead_id` — winner and loser both read the existing row; 409 on duplicate insert is expected and ignored.

PostgREST insert does not expose `ON CONFLICT DO NOTHING` cleanly; re-SELECT is the recovery path.

**`createLeadFromWhatsApp`:** Lives in `src/lib/services/lead-ingestion.ts`. Inserts lead with `source: 'whatsapp'` (indexed flat column) and `attribution: { platform: 'whatsapp' }` (JSONB bag), default domain, round-robin assign, `lead_created` + optional `agent_assigned` activities. Called from step 4 when phone has no active lead. Both fields must always be set together — `source` is what `WHERE source = 'whatsapp'` queries hit; `attribution` is the platform-specific extras bag.

**Gupshup path note:** Active webhook returns `200` for `message-event` **without** calling `processStatusUpdate`. Delivery status updates run on the **Meta** branch today. Gupshup delivery receipts are acknowledged but not persisted unless the handler is extended.

---

## 5. The Webhook Route — `/api/webhooks/whatsapp`

**File:** `src/app/api/webhooks/whatsapp/route.ts`

### Auth

- **Gupshup:** Header `x-gupshup-secret` compared to `GUPSHUP_WEBHOOK_SECRET` via `verifyGupshupSecret()` — `timingSafeEqual` on equal-length UTF-8 buffers. Checked **after** `await req.text()` (body needed for JSON). Invalid → `401`.
- **Meta (dormant):** `x-hub-signature-256` → `verifyMetaSignature(rawBody, signature)`.

Presence of `x-gupshup-secret` (even empty) routes to Gupshup branch (`!== null`).

### GET

Returns Meta hub challenge when `hub.mode=subscribe` and `hub.verify_token === WEBHOOK_VERIFY_TOKEN`. Otherwise plain `200` / `OK` — supports URL verification without challenge params.

### POST — dual-format parser

| BSP | Detection | Processing |
| --- | --- | --- |
| Gupshup v2 | `x-gupshup-secret` header present | Parse JSON; see below |
| Meta v3 | No Gupshup header; Meta signature | `parseWebhookPayload` + loop |

**Gupshup `type === 'message'`:** Maps `payload.id` → message id, `+${payload.source}` → phone, builds synthetic `MetaInboundMessage` text envelope, runs `processInboundMessage` inside `after(async () => { ... })`.

**Gupshup `type === 'message-event'`:** `200` immediately — **no** `processStatusUpdate` (ack only).

**Gupshup `type === 'billing-event'`:** `200`, no processing.

**Unknown Gupshup types:** `200`, no processing.

**Meta path:** `after()` runs messages → `processInboundMessage`, statuses → `processStatusUpdate`.

### Always return 200 (success path)

For processed or intentionally ignored events, respond **`200`** with `{ status: 'ok' }`. Non-2xx causes Meta/Gupshup to **retry** the webhook, risking duplicate processing (mitigated for messages by `wa_message_id` dedup, but still noisy). Auth failures correctly return `401`; malformed JSON `400`.

### Vercel `after()` — rationale

```ts
after(async () => { /* processInboundMessage / Meta loop */ });
return NextResponse.json({ status: 'ok' }, { status: 200 });
```

Serverless handlers **terminate when the response is sent**. Without `after()`, in-flight `await` DB work could be frozen mid-flight. `after()` schedules continuation on the same invocation so ingestion completes **after** the fast `200` ack — matching provider timeout expectations while keeping writes reliable.

### `processInboundMessage` — 9 steps (Gupshup + Meta)

Executed inside `after()` on the active path:

1. Normalize phone to E.164 (`normalizeToE164`, with `+` fallback).
2. Dedup: if `wa_message_id` already exists, exit silently.
3. Resolve lead by phone (`resolveLeadByPhone`).
4. If no lead: `createLeadFromWhatsApp(waId, phone, senderName)` then re-fetch lead.
5. `getOrCreateConversation(leadId, waId, phone)` — SELECT → INSERT → re-SELECT.
6. Resolve media download URL for non-text types (non-fatal on failure).
7. `insertInboundMessage` — sanitized content, inbound row via adminClient.
8. UPDATE `whatsapp_conversations.last_message_at`.
9. Realtime broadcast via `supabase_realtime` (no explicit publish call).

### Proxy exclusion — `src/proxy.ts`

```ts
if (request.nextUrl.pathname.startsWith("/api/webhooks")) {
  return NextResponse.next({ request });
}
```

Webhook POSTs have **no session cookie**. Skipping `updateSession()` avoids Supabase auth refresh side effects and wasted work. Matcher also excludes `api/webhooks` from the global proxy pattern.

---

## 6. Server Actions — `whatsapp.ts`

All return `ActionResult` shape for mutations unless noted. Zod runs first on mutations.

| Action | Schema | Auth | Service / writes | Return | Kind |
| --- | --- | --- | --- | --- | --- |
| `sendWhatsAppMessage` | Inline `SendMessageSchema` (uuid + content 1–4096, `sanitizeText` transform) | `getCurrentProfile()` | `getConversation` → `sendTextMessage` → session insert outbound row → update `last_message_at` | `ActionResult<WhatsAppMessage>` | Mutation |
| `markConversationAsRead` | `ConversationIdSchema` | Profile required | `markConversationRead()` | `{ data: null, error }` | Mutation |
| `resolveConversation` | `ConversationIdSchema` | Profile + role ∈ `manager`, `admin`, `founder` | Session update `status = resolved` | `{ data: null, error }` | Mutation |
| `reopenConversation` | `ConversationIdSchema` | Same manager+ guard | Session update `status = open` | `{ data: null, error }` | Mutation |
| `getConversationsAction` | `WhatsAppListFilterSchema` | Profile required | `getConversations()` | `{ conversations, nextCursor }` | Read wrapper |
| `getMessagesAction` | UUID parse on id | Profile required | `getMessages()` | `WhatsAppMessage[]` | Read wrapper |
| `searchConversationsAction` | `WhatsAppSearchFilterSchema` | Profile required | `searchConversations()` | `WhatsAppConversation[]` | Read wrapper |

Resolve/reopen duplicate role allow-lists inline (`['manager', 'admin', 'founder']`) — UI uses `MANAGER_ROLES` constant; keep in sync.

---

## 7. Notification Templates

All sends use Gupshup `POST https://api.gupshup.io/wa/api/v1/template/msg` with `apikey` header. Each attempt logged via `logNotification()`.

| Event | Recipient | Template ID constant | Parameters (count + order) |
| --- | --- | --- | --- |
| Lead assigned to agent | Assigned agent’s profile phone | `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID` (`193e330d-e7ee-48e0-9cd4-f3808b50fc80`) | 1: lead name, 2: lead number (`leadPhone` or `'not provided'`) |
| New lead → founders | Each founder with phone | `GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID` (`d5828042-fbfc-4e6d-a9d9-e72185d7d0c1`) | 4: `domain`, `agentName`, `leadName`, `leadPhone` |
| SLA breach → agent | Assigned agent | `GUPSHUP_SLA_AGENT_TEMPLATE_ID` (`54d5dd55-a1fa-482b-8823-49e9b9e22745`) | 4: `leadName`, `leadPhone`, `status`, `lastUpdatedAt` |
| SLA breach → managers | Manager profile phones | `GUPSHUP_SLA_MANAGER_TEMPLATE_ID` (`682fd320-3b04-45da-8b1a-9a390770fac8`) | 5: `leadName`, `leadPhone`, `agentName`, `status`, `lastUpdatedAt` |

**`logNotification` fields:** `type` (`agent_assignment` \| `founder_alert`), optional `lead_id`, `recipient_id`, **`recipient_phone` (last 4 only)**, optional names/domain, `gupshup_status`, `gupshup_body`, `delivered`.

**Privacy:** Full phone numbers are never stored in `whatsapp_notification_logs` — only `.slice(-4)` for `recipient_phone` and `lead_phone`.

**Call sites:** `assignLead` / `createManualLead` / lead webhook (assignment + founder); `fireSlaBreachAction` path in `sla.ts` (agent + manager templates). SLA manager log rows reuse `type: 'founder_alert'` in code today.

---

## 8. `/whatsapp` Page Architecture

### 8a. Page component (`page.tsx`)

Server component:

1. `getCurrentProfile()` — guest → redirect `/dashboard`; unauthenticated → `/login`.
2. `parseWhatsAppPeriodFromSearchParams(searchParams)` for `period`, `customFrom`, `customTo`.
3. `Promise.all`:
   - `getConversations({ limit: WHATSAPP_CONVERSATIONS_PAGE_SIZE (20), period, customFrom, customTo })`
   - `getUnreadCount()`

Passes to `WhatsAppShell`:

- `initialConversations` — `conversations` array only
- `unreadCount` — number for header badge
- `callerProfile` — `{ id, full_name, avatar_url, role }`

No `Suspense` boundary on page — `loading.tsx` handles route-level skeleton.

### 8b. Layout contract

- **Not** the standard `p-8` list-page layout. Shell is `flex min-h-0 flex-1 overflow-hidden` inside the dashboard paper card (`height: calc(100dvh - 24px)` on parent).
- **Left rail (320px):** `paddingTop` / `paddingLeft` `var(--space-8)` — title row with `mb-6`, then conversation list. Matches list-page inset for title/search only.
- **Right panel:** `flex: 1`, `background: var(--theme-paper-subtle)`, **starts at top of paper card** (not below the left rail’s title). Contact header inside `ConversationPanel` supplies top breathing room: `padding: var(--space-8) var(--space-8) var(--space-5)`.

### 8c. `WhatsAppShell`

**Owns:** conversation list state, `activeConversationId`, `activeMessages`, cursor pagination, period refetch on URL change, unread badge display, Realtime on `whatsapp_conversations`.

**Realtime channel:** `wa-conversations-${callerProfile.id}-${mountId}` where `mountId = useId()`.

**StrictMode:** `useId()` suffix ensures second mount gets a fresh channel name; cleanup uses `supabase.removeChannel(channel)` (not `unsubscribe()` alone).

**Events:**

- `INSERT` → prepend conversation to state
- `UPDATE` → merge row and re-sort by `last_message_at` DESC (fallback `created_at`)

**Pagination:** `handleLoadMore` → `getConversationsAction({ cursor, limit: 20, ...period })`.

**Select conversation:** `getMessagesAction(id)` → sets `activeMessages`.

### 8d. `ConversationList`

- **SearchBar:** `size="sm"`, `variant="default"`, placeholder “Search conversations…”, **300ms debounce** → `searchConversationsAction({ query, ...period })`.
- **Period filter:** `WhatsAppConversationPeriodFilter` in card header (URL-driven).
- **Load more:** `IntersectionObserver` on sentinel (`threshold: 0.5`) — **P-05** (no scroll listener). Calls `onLoadMore` when visible and `hasMore && !isLoadingMore`. Disabled during search results.
- **End state:** “That's everything.” when `!hasMore && list length >= WHATSAPP_CONVERSATIONS_PAGE_SIZE` and not searching.
- **Skeleton:** `loading.tsx` mirrors rail: title shimmer, search card, 7 row shimmers with stagger — not a separate component file.
- **Row pattern:** Bordered card (`--shadow-1`, `--radius-lg`), uppercase “Conversations” label — aligned with Performance agent roster / settings card lists.

### 8e. `ConversationRow`

**Renders:** `Avatar` (sm) with optional unread dot (10px accent, top-right), lead name (ellipsis), trailing mono timestamp or “Resolved” in success colour.

**Active state:** `Avatar` `selected={isActive || hovered}` — **accent ring on avatar**, not row background fill and **not** a left border strip. Matches Performance agent roster selection grammar.

**Hover:** Same accent ring via `hovered` state; name → semibold; trailing time → accent colour (unless resolved). Row `background` stays **transparent**.

**Motion:** `opacity 0→1`, `x -8→0`, stagger delay prop (max 280ms).

### 8f. `ConversationPanel`

**Zones:**

1. **Header** — Avatar, Playfair italic name, mono phone, resolved pill, Resolve/Reopen (`Button`) when `MANAGER_ROLES.includes(role)`.
2. **Message list** — `var(--theme-paper-subtle)`, date separators (Today / Yesterday / formatted), `MessageBubble` per message, auto-scroll bottom on `messages` change.
3. **Composer** — floating paper card with textarea + Send; resolved → italic banner “This conversation is resolved. Reopen to send messages.”

**Realtime:** `wa-messages-${conversation.id}-${mountId}` on `whatsapp_messages` filtered by `conversation_id`.

- `INSERT` — dedupe `seenIds`; outbound echo replaces oldest optimistic row when `sender_id === caller` and `optimisticIds` non-empty; else append.
- `UPDATE` — merge `status` / `status_at` (delivery ticks).

**`markConversationRead`:** `markConversationAsRead` action on `conversation.id` change (panel open).

**Optimistic send:** Local row with `optimistic-*` id, `wa_message_id: null`; on success replace with server row; on error remove + `toast.danger`.

**Char warning:** Shows `draft.length / 4096` when length **> 3000** (`WARN_CHARS`); hard cap 4096 on input.

### 8g. `MessageBubble`

| Aspect | Inbound | Outbound |
| --- | --- | --- |
| Alignment | `flex-start` | `flex-end` |
| Surface | `var(--theme-paper)` + paper border | `var(--theme-accent-surface)` + accent-tinted border |
| Sender row | Avatar xs + name (lead) | — |
| Bot label | — | “Lia” above bubble when `is_bot` |

**Delivery icons (outbound only):** `sent` → single `Check` tertiary; `delivered` → `CheckCheck` tertiary; `read` → `CheckCheck` accent; `failed` → `X` danger.

**Media:** `message_type` ∈ `image|video|document|audio` → `MediaPlaceholder` with icon + label + optional “View” link.

### 8h. `EmptyConversationState`

**When:** No `activeConversation` selected (right pane default).

**Motion:** `opacity 0→1`, `y 8→0`, `ENTER_DURATION`, `EASE_OUT_EXPO`.

**Copy:**

- Heading (Playfair italic): **“Select a conversation.”**
- Subtext: **“Choose from the list to view the full thread.”**

---

## 9. Realtime — Both Channels

| Channel | Pattern | Table | Events | Owner | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Conversations | `wa-conversations-${userId}-${mountId}` | `whatsapp_conversations` | `INSERT` prepend; `UPDATE` merge + re-sort | `WhatsAppShell` | `supabase.removeChannel(channel)` on unmount |
| Messages | `wa-messages-${conversationId}-${mountId}` | `whatsapp_messages` (filter `conversation_id=eq.${id}`) | `INSERT` append/replace optimistic; `UPDATE` status | `ConversationPanel` | `removeChannel` on unmount / conversation change |

`mountId` from `useId()` is mandatory for React StrictMode double-mount safety (P-06).

---

## 10. Access Control Summary

| Role | Conversation list | Can send | Can resolve/reopen |
| --- | --- | --- | --- |
| **Agent** | Leads assigned to self (`can_access_wa_conversation`) | Yes, if conversation accessible | No |
| **Manager** | All leads in domain | Yes | Yes |
| **Admin** | All conversations | Yes | Yes |
| **Founder** | All conversations | Yes | Yes |
| **Guest** | Redirected away from `/whatsapp` | — | — |

| Capability | Enforcement layer |
| --- | --- |
| List/message visibility | RLS + `can_access_wa_conversation(lead_id)` on conversations/messages |
| Outbound INSERT | RLS policy `wa_messages_outbound_insert` + action loads conversation via session client |
| Resolve/reopen | **Component** `MANAGER_ROLES` hides buttons; **action** checks `manager \| admin \| founder` |
| Inbound webhook writes | Service-role only (`whatsapp-ingestion`) |
| Template notifications | `whatsapp-api` adminClient; no user-facing permission |

---

## 11. Known Invariants (must never be violated)

1. **`whatsapp_messages` is append-only** for all authenticated roles. No DELETE policy. No UPDATE policy for app users. The **only** UPDATE is `status` + `status_at` via **`adminClient`** in `processStatusUpdate` (delivery receipts) — a narrow A-11 system exception, not a user edit.

2. **`wa_message_id` uniqueness uses a partial unique index** `WHERE wa_message_id IS NOT NULL`, not a column UNIQUE constraint — so multiple rows with `NULL` `wa_message_id` (optimistic outbound) do not conflict.

3. **Webhook handlers must return `200`** for accepted/ignored events so providers do not retry unnecessarily. Use `401`/`400` only for auth/parse failures.

4. **`logNotification` stores last-4 phone digits only** — never full `recipient_phone` or `lead_phone` in `whatsapp_notification_logs`.

5. **Template send functions are fire-and-forget** — `sendLeadAssignmentNotification`, `sendFounderLeadNotification`, `sendSlaAgentNotification`, `sendSlaManagerNotification` must never throw to callers; lead/SLA actions succeed even when WhatsApp fails.

6. **`can_access_wa_conversation` is coupled to `leads` RLS semantics** — if lead visibility rules change, update the function and retest all `wa_*` policies.

7. **Webhook async work must run inside Vercel `after()`** so the HTTP response can return immediately while DB ingestion continues on the same invocation; without it, serverless may tear down before writes complete.

8. **Client components must not import `whatsapp-api.ts` or `whatsapp-ingestion.ts`** — server-only secrets and adminClient. Use `src/lib/actions/whatsapp.ts` wrappers for reads and `sendWhatsAppMessage` for sends.

9. **Keyset pagination on nullable sort columns requires a composite cursor** — never rely on `.lt('last_message_at', cursor)` alone if NULL `last_message_at` rows must appear across pages; use the four-branch `.or()` pattern documented in `src/lib/CLAUDE.md` (reference: `getPersonalTasks`).

10. **Realtime teardown uses `supabase.removeChannel(channel)`** — never `channel.unsubscribe()` alone on the singleton browser client.

11. **Inbound message inserts use `adminClient`** in `whatsapp-ingestion.ts`; outbound agent inserts use **session client** satisfying `wa_messages_outbound_insert` RLS.

12. **Do not conflate the three service files** — session+RLS (`whatsapp-service`), HTTP+fire-and-forget templates (`whatsapp-api`), admin+pipeline (`whatsapp-ingestion`).

13. **Bot columns and `is_bot` UI are not an implemented chatbot** — no autonomous replies; planned only.

14. **Gupshup `message-event` is ack-only today** — delivery status persistence runs on the Meta webhook path unless Gupshup handler is extended to call `processStatusUpdate`.

---

## File index (implementation)

| Area | Path |
| --- | --- |
| Page | `src/app/(dashboard)/whatsapp/page.tsx`, `loading.tsx` |
| Shell UI | `src/components/whatsapp/*.tsx` |
| Actions | `src/lib/actions/whatsapp.ts` |
| Services | `src/lib/services/whatsapp-service.ts`, `whatsapp-api.ts`, `whatsapp-ingestion.ts` |
| Lead bridge | `src/lib/services/lead-ingestion.ts` → `createLeadFromWhatsApp` |
| Validations | `src/lib/validations/whatsapp-schema.ts` |
| Constants | `src/lib/constants/whatsapp.ts`, `whatsapp-period.ts` |
| Types | `src/lib/types/whatsapp.ts` |
| Webhook | `src/app/api/webhooks/whatsapp/route.ts` |
| Migrations | `20260530000032` – `38`, `41` (see `supabase/migrations/CLAUDE.md`) |
