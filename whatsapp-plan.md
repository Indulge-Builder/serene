Here is the complete map. Every file, every function, every migration — planned precisely before a prompt is written.

---

## What We Are Building

**6 new files in `lib/`** · **1 webhook route** · **1 Trigger.dev job** · **3 migrations** · **0 new pages yet** (page comes in the next phase — foundation first)

---

## Migrations

Three migrations, run in order. Each has a single responsibility.

---

### `supabase/migrations/0016_whatsapp_conversations.sql`

Creates the `whatsapp_conversations` table exactly as specced in The_Gia.md §14.2, plus the three bot columns from §14.6 (add them now — altering under live data is expensive).

**Columns:**
`id` · `lead_id` (FK → leads, UNIQUE) · `wa_id` (UNIQUE, E.164 without `+`) · `phone` (E.164 with `+`) · `status` (`open | resolved`, default `open`) · `last_message_at` · `bot_active` (boolean, default `true`) · `bot_paused_by` (FK → profiles, nullable) · `bot_paused_at` · `created_at` · `updated_at`

**Indexes:**
`idx_wa_conversations_lead_id` · `idx_wa_conversations_last_message` (partial on `status = 'open'`, `last_message_at DESC`)

**RLS:** Enabled. Policies mirror `leads` table exactly — agent sees conversations for leads assigned to them, manager sees all in domain, admin/founder see all.

**Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_conversations`

---

### `supabase/migrations/0017_whatsapp_messages.sql`

Creates the `whatsapp_messages` table (append-only — same rule as `lead_activities` and `lead_notes`).

**Columns:**
`id` · `conversation_id` (FK → whatsapp_conversations) · `lead_id` (FK → leads) · `direction` (`inbound | outbound`) · `sender_type` (`lead | agent | bot`) · `sender_id` (FK → profiles, nullable) · `wa_message_id` (UNIQUE — the dedup key) · `message_type` (`text | image | video | document | audio | template`) · `content` · `media_url` · `media_mime_type` · `status` (`sent | delivered | read | failed`) · `status_at` · `is_bot` (boolean, default `false`) · `created_at`

**Indexes:**
`idx_wa_messages_conversation_id` (on `conversation_id, created_at ASC`) · `idx_wa_messages_lead_id` (on `lead_id, created_at DESC`) · `idx_wa_messages_wa_message_id` (for dedup lookups on webhook)

**RLS:** Enabled. Same domain-scoping as conversations.

**Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages`

---

### `supabase/migrations/0018_whatsapp_reads.sql`

**This table is not in The_Gia.md yet — it is a gap.** Without it, unread badge counts cannot be computed correctly. Without it the WhatsApp page cannot know which conversations an agent has seen.

Creates `whatsapp_conversation_reads`.

**Columns:**
`id` · `conversation_id` (FK → whatsapp_conversations) · `agent_id` (FK → profiles) · `last_read_at` · `UNIQUE(conversation_id, agent_id)`

**Index:** `idx_wa_reads_agent_id` on `(agent_id)`

**RLS:** Enabled. Agent can only read and upsert their own rows.

---

## `lib/types/whatsapp.ts`

Single file. All WhatsApp types live here and nowhere else. Two categories:

**Meta Cloud API payload types** — exactly what Meta sends to the webhook:

- `MetaWebhookPayload` — top-level envelope
- `MetaWebhookEntry` · `MetaWebhookChange` · `MetaWebhookValue`
- `MetaContact` — display name and wa_id from the contacts array
- `MetaInboundMessage` — typed union covering `text`, `image`, `video`, `document`, `audio` variants
- `MetaStatusUpdate` — delivery receipt payload
- `MetaApiResponse` — what Meta returns when you send a message (includes `messages[0].id` — the wa_message_id for your outbound row)

**App types** — what the application works with internally:

- `WhatsAppConversation` — full conversation row with joined lead fields and optional `unread_count`
- `WhatsAppMessage` — full message row with optional joined sender profile
- `SendMessageInput` — input shape for the send action

---

## `lib/constants/whatsapp.ts`

```
WHATSAPP_API_VERSION        'v21.0'  (latest stable as of now)
WHATSAPP_API_BASE           `https://graph.facebook.com/${VERSION}`

WHATSAPP_MESSAGE_TYPES      readonly tuple — all valid message type strings
WHATSAPP_CONVERSATION_STATUS  { OPEN, RESOLVED }
WHATSAPP_SENDER_TYPE        { LEAD, AGENT, BOT }
WHATSAPP_DIRECTION          { INBOUND, OUTBOUND }
WHATSAPP_MESSAGE_STATUS     { SENT, DELIVERED, READ, FAILED }

WHATSAPP_NOTIFICATION_TEMPLATES
  LEAD_ASSIGNED_AGENT:   'eia_lead_assigned'
  LEAD_ASSIGNED_MANAGER: 'eia_lead_assigned_manager'

WHATSAPP_MESSAGES_PAGE_SIZE   30  (messages per load in chat window)
WHATSAPP_CONVERSATIONS_PAGE_SIZE  20
```

No hardcoded strings anywhere else in the codebase for these values.

---

## `lib/validations/whatsapp-schema.ts`

- `MetaWebhookPayloadSchema` — Zod, validates the full Meta webhook body before processing
- `MetaStatusUpdateSchema` — validates delivery receipt payload shape
- `SendMessageSchema` — validates `sendWhatsAppMessage` server action input (`conversationId: uuid`, `content: string min 1 max 4096`)
- `ResolveConversationSchema` — validates `resolveConversation` input

---

## `lib/services/whatsapp-api.ts`

**Pure Meta Cloud API HTTP client. No DB. No auth check. No Supabase.** Takes env vars directly. Called by the ingestion service and by server actions — never by components.

| Function                                                                                                       | Purpose                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `sendTextMessage(to: string, text: string)`                                                                    | POST to `/messages`, type `text`. Returns `MetaApiResponse`              |
| `sendTemplateMessage(to: string, templateName: string, languageCode: string, components: TemplateComponent[])` | POST to `/messages`, type `template`. Used for agent notifications       |
| `sendMediaMessage(to: string, type: MediaType, mediaId: string, caption?: string)`                             | POST to `/messages` for image/video/document/audio                       |
| `uploadMedia(buffer: Buffer, mimeType: string, filename: string)`                                              | POST to `/media`. Returns `media_id` string                              |
| `getMediaDownloadUrl(mediaId: string)`                                                                         | GET `/mediaId`. Returns the temporary download URL for storing in our DB |

**Error handling:** Meta returns `200` even for some failures — the error lives in `response.error`. This function must check `response.error` explicitly and throw a typed `WhatsAppApiError`. Never surface raw Meta error objects to callers.

---

## `lib/services/whatsapp-ingestion.ts`

**Server-only. Admin client only. Never called from the UI.** This is the inbound processing brain.

| Function                                                                                                   | Purpose                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifyMetaSignature(rawBody: string, signatureHeader: string): boolean`                                   | HMAC-SHA256 check against `WHATSAPP_WEBHOOK_SECRET`. Synchronous. First call in the webhook handler                                                                                                 |
| `parseWebhookPayload(body: MetaWebhookPayload): ParsedWebhookEvent[]`                                      | Extracts flat list of `{ type: 'message' \| 'status', data }` events from the nested Meta payload. Handles arrays at every level                                                                    |
| `processInboundMessage(waId: string, phone: string, message: MetaInboundMessage): Promise<void>`           | The main inbound flow — see below                                                                                                                                                                   |
| `processStatusUpdate(waMessageId: string, status: string): Promise<void>`                                  | Updates `status` + `status_at` on existing outbound message row. The only allowed UPDATE on `whatsapp_messages`                                                                                     |
| `resolveLeadByPhone(normalizedPhone: string): Promise<Lead \| null>`                                       | SELECT from `leads` WHERE `phone = $1` LIMIT 1. Reuses admin client. Dedup key                                                                                                                      |
| `createLeadFromWhatsApp(phone: string, waId: string): Promise<Lead>`                                       | INSERT into `leads` with `source = 'whatsapp'`, `domain = 'concierge'` (default), `status = 'new'`, `first_name = phone` (temporary). Logs `lead_created` activity. Triggers round-robin assignment |
| `getOrCreateConversation(leadId: string, waId: string, phone: string): Promise<WhatsAppConversation>`      | SELECT then INSERT ON CONFLICT DO NOTHING. Returns existing or newly created row                                                                                                                    |
| `insertInboundMessage(conversationId: string, leadId: string, message: MetaInboundMessage): Promise<void>` | Checks `wa_message_id` uniqueness first. If exists → no-op (dedup guard). If not → INSERT into `whatsapp_messages`. Then UPDATE `whatsapp_conversations.last_message_at`                            |

**`processInboundMessage` full flow:**

1. `verifyMetaSignature` — already done by webhook, but ingestion double-checks if called directly
2. `normalizeToE164(waId)` — reuse existing util
3. Check `whatsapp_messages.wa_message_id` — dedup guard, return immediately if exists
4. `resolveLeadByPhone` — find existing lead
5. If no lead → `createLeadFromWhatsApp` (triggers round-robin assignment + Trigger.dev notification job)
6. `getOrCreateConversation`
7. If `message_type` is `image/video/document` → `getMediaDownloadUrl(mediaId)` to store usable URL
8. `insertInboundMessage`
9. Broadcast Supabase Realtime event on `whatsapp_messages` channel

---

## `lib/services/whatsapp-service.ts`

**UI-facing queries. Uses the user's session client (`createClient()`). RLS handles access automatically.**

| Function                                                                                       | Purpose                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `getConversations(options: { limit, cursor }): Promise<{ conversations, nextCursor }>`         | Paginated list sorted by `last_message_at DESC`. Joins lead name. Cursor-based pagination                                          |
| `getConversation(conversationId: string): Promise<WhatsAppConversation \| null>`               | Single conversation with lead details                                                                                              |
| `getMessages(conversationId: string, options: { limit, before? }): Promise<WhatsAppMessage[]>` | Cursor-based, oldest-first within result set. Joins sender profile for agent/bot messages                                          |
| `getUnreadCount(): Promise<number>`                                                            | COUNT of conversations where `last_message_at > whatsapp_conversation_reads.last_read_at` for calling user. Used for sidebar badge |
| `markConversationRead(conversationId: string): Promise<void>`                                  | UPSERT into `whatsapp_conversation_reads`. Called when conversation is opened                                                      |
| `searchConversations(query: string): Promise<WhatsAppConversation[]>`                          | Search by lead name or phone. Used for the search bar on the WhatsApp page                                                         |

---

## `lib/actions/whatsapp.ts`

**Server actions. All follow the same pattern: Zod validate → `getCallerProfile()` → access check → call service/API → return `{ data, error }`.**

| Action                                           | What it does                                                                                                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sendWhatsAppMessage(input: SendMessageInput)`   | Validate → auth check → verify agent has access to this conversation → call `whatsapp-api.ts sendTextMessage()` → INSERT outbound message row → UPDATE `last_message_at` → if `bot_active = true` on conversation, set `bot_active = false` (agent takeover) |
| `markConversationAsRead(conversationId: string)` | UPSERT `whatsapp_conversation_reads` for calling user                                                                                                                                                                                                        |
| `resolveConversation(conversationId: string)`    | UPDATE `whatsapp_conversations.status = 'resolved'`. Manager/admin/founder only — agent cannot resolve                                                                                                                                                       |
| `reopenConversation(conversationId: string)`     | UPDATE `status = 'open'`. Manager/admin/founder only                                                                                                                                                                                                         |

---

## `app/api/webhooks/whatsapp/route.ts`

Two HTTP methods on one route.

**`GET` handler — Meta hub challenge:**
Reads `hub.mode`, `hub.verify_token`, `hub.challenge` from query params. If `hub.verify_token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN` → return `hub.challenge` as plain text with 200. Else 403. This is how Meta confirms your webhook URL during setup.

**`POST` handler — inbound events:**

1. Read raw body as text (needed for HMAC verification — must be the raw bytes, not parsed JSON)
2. `verifyMetaSignature(rawBody, req.headers['x-hub-signature-256'])` — reject 401 immediately if invalid
3. Parse JSON
4. Validate with `MetaWebhookPayloadSchema` — reject 400 if invalid shape
5. `parseWebhookPayload()` → flat event list
6. **Return `200` immediately** — do not wait for processing (Rule A-12: async work goes to Trigger.dev)
7. After response is flushed: call `processInboundMessage()` or `processStatusUpdate()` per event using `waitUntil()` (Vercel Edge runtime) or enqueue to Trigger.dev for heavy cases

**Critical:** Step 6 must happen before step 7. Meta marks your webhook as failed if it doesn't receive 200 within 5 seconds. Processing is non-blocking.

---

## `src/trigger/whatsapp-notify-lead-assigned.ts`

One Trigger.dev job. Fires when a lead is assigned (hooked into `assignLead()` in `lib/actions/leads.ts` — add the `.trigger()` call there).

**Payload:**

```
leadId, leadName, leadPhone, eiaLeadUrl
assignedAgentId, managerIds[]
```

**Job steps:**

1. Fetch assigned agent profile → get `profiles.phone`
2. Guard: if `phone` is null → log warning to console (Trigger.dev logs), skip agent notification, continue
3. `sendTemplateMessage(agentPhone, LEAD_ASSIGNED_AGENT, [agentName, leadName, leadPhone, eiaLeadUrl])`
4. For each managerId → fetch profile → get `phone`
5. Guard: same null check
6. `sendTemplateMessage(managerPhone, LEAD_ASSIGNED_MANAGER, [managerName, agentName, leadName, leadPhone, eiaLeadUrl])`
7. Log success/failure per recipient — do not throw on individual failure (one agent's missing number should not fail the whole job)

---

## What Gets Touched in Existing Files

| Existing file                                                 | Change                                                                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/actions/leads.ts` → `assignLead()`                       | Add `.trigger()` call to `whatsapp-notify-lead-assigned` after successful assignment                                                                                |
| `lib/services/lead-ingestion.ts` → `createLeadFromWhatsApp()` | Will call this from the new ingestion service — confirm the function signature is compatible                                                                        |
| `.env.local` + `.env.example`                                 | Add 5 new env vars: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_WEBHOOK_SECRET` |

---

## Complete File Map

```
supabase/migrations/
├── 0016_whatsapp_conversations.sql     NEW
├── 0017_whatsapp_messages.sql          NEW
└── 0018_whatsapp_reads.sql             NEW

src/lib/
├── types/
│   └── whatsapp.ts                     NEW
├── constants/
│   └── whatsapp.ts                     NEW
├── validations/
│   └── whatsapp-schema.ts              NEW
├── services/
│   ├── whatsapp-api.ts                 NEW  ← Meta HTTP client
│   ├── whatsapp-ingestion.ts           NEW  ← inbound processing
│   └── whatsapp-service.ts             NEW  ← UI queries
└── actions/
    ├── whatsapp.ts                     NEW
    └── leads.ts                        MODIFY ← add trigger call in assignLead()

src/app/api/webhooks/whatsapp/
└── route.ts                            NEW

src/trigger/
└── whatsapp-notify-lead-assigned.ts    NEW
```

**11 files. 3 modified. Zero UI components yet** — those come in the next phase when we build the WhatsApp page. This phase is pure foundation: data, ingestion, outbound API, notifications. Everything the page needs will already exist as a service function before the first component is written.

---

Confirm this plan is locked and I'll generate the Cursor prompt for Phase WA-1 (migrations) to start the build.
