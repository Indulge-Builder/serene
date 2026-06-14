# WhatsApp

> **Purpose:** A dual-pipeline inbound channel — a staff number routes to **Elaya**, any other number
> routes to **lead ingestion** — plus conversation persistence and outbound sends via the Gupshup BSP.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## Entry points & data flow

- **Webhook** — `POST /api/webhooks/whatsapp/route.ts`. `GET` answers the hub challenge. `POST` detects the
  BSP format (Gupshup v2 active; Meta v3 dormant), then, **inside `after()`**:
  1. **Routing gate first** — `tryHandleElayaWhatsAppMessage(phone, message)` (`elaya-whatsapp.ts`):
     `normalizeWaPhone` → `getActiveProfileByPhone`. Match → full Elaya brain turn + one
     `sendElayaWhatsAppReply`; returns `true` on **every** path (success or failure) so a staff message
     never falls through. No match → continue to the lead pipeline.
  2. **Lead pipeline** — `processInboundMessage(phone, content)` (`whatsapp-ingestion.ts`): resolve lead by
     phone (or create) → upsert conversation → insert message → activity log.
  3. **Status receipts** — `processStatusUpdate(waMessageId, status)` (idempotent, an A-11 carve-out).
- **Reads** — `getConversations(period, cursor)` (cursor = `last_message_at`); per-caller unread via
  `attachUnreadCounts` (RLS-scoped).
- **Outbound (admin)** — `sendTextMessage` / `sendTemplateMessage` / `sendMediaMessage`
  (`whatsapp-api.ts` → Gupshup `/wa/api/v1/msg`).

---

## Canonical helpers

- `normalizeWaPhone()` — the shared inbound normalizer; both the Elaya gate and the lead pipeline call it,
  so both resolve the same string.
- `parseWebhookPayload()` (flattens the Gupshup envelope), `getWhatsAppPeriodRange()` (IST windows via
  `lib/utils/whatsapp-period.ts`), `sanitizeText()`, `markdownToWhatsApp()` (model markdown → WhatsApp-native).

---

## Key tables

| Table | Holds |
|---|---|
| `whatsapp_conversations` | `wa_id`, `lead_id`, `last_message_at`, `status` |
| `whatsapp_messages` | `conversation_id`, `sender_id`, `content`, `message_type`, `status`, `wa_message_id` |
| `whatsapp_conversation_reads` | per-agent `last_read_at` (RLS-scoped, for unread detection) |
| `whatsapp_notification_logs` | every template-send attempt (append-only audit) |

(Elaya staff messages write only to `elaya_*`, never these tables.)

---

## Invariants / gotchas

- **Routing gate is mandatory** — every inbound message passes through `tryHandleElayaWhatsAppMessage`
  before the lead pipeline; a staff-number match returns `true` on all paths.
- **Phone-collision guard** — if a staff number also matches an active lead, the profile wins (warn-logged).
- **Voice notes** — Gupshup audio carries a direct CDN URL; the gate transcribes (in-memory, see
  [voice-dictation.md](voice-dictation.md)) before cap/brain/persist; empty/non-speech → a no-speech reply, no model call.
- **`after()` is mandatory for outward sends** — Gupshup sends are `await`-ed inside `after()` (Vercel
  freeze rule). `maxDuration = 60s` covers the brain turn + notifications.
- **Rate limit 300/60s** (3× leads) — Gupshup posts up to 3 delivery receipts per outbound message.
- **Unread is per-caller** — a conversation is unread when `status='open'` AND (no read row OR
  `last_message_at > last_read_at`).

---

## File map

| File | Role |
|---|---|
| `src/app/api/webhooks/whatsapp/route.ts` | Dual-BSP dispatcher: hub challenge, routing gate, lead/Elaya/status branches |
| `src/lib/services/elaya-whatsapp.ts` | Staff routing gate; voice transcription; `sendElayaWhatsAppReply` |
| `src/lib/services/whatsapp-ingestion.ts` | Lead pipeline: parse, inbound message, lead resolve, conversation upsert |
| `src/lib/services/whatsapp-service.ts` | UI reads: conversations, messages, unread counts |
| `src/lib/services/whatsapp-api.ts` | Gupshup HTTP client: send text/template/media, signature verify |
| `src/lib/actions/whatsapp.ts` | `sendWhatsAppMessage`, mark-read, resolve, list/message reads |
| `src/components/whatsapp/ConversationPanel.tsx` | Chat panel (messages + composer + dictation) |
| `src/components/whatsapp/ConversationList.tsx` | Conversation list, period filter, unread dots |
| `src/components/whatsapp/WhatsAppShell.tsx` | Page shell, list + panel split |
