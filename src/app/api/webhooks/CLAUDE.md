# Webhooks CLAUDE.md

## Route contract (every webhook route)

- **JSON parse guard:** body parsing goes through `readJsonBody(request)` or — when the
  route reads `req.text()` first for an HMAC signature — `parseJsonBody(rawBody)`, both
  from `src/lib/utils/webhook.ts`. Never hand-roll the try/catch-400 block (dry-audit M-8).
- **Rate limit before body read (security-audit F-4 / S-17):** every POST handler creates its
  own module-scope `createRateLimiter({ windowMs, max })` from `src/lib/utils/webhook.ts` and
  checks `isRateLimited(getClientIp(request))` → 429 **before** `req.text()`/`readJsonBody()`.
  Per-route instances keep the windows isolated. Caps: leads 100/60s; whatsapp 300/60s
  (Gupshup delivery receipts are up to 3 POSTs per outbound message, so legit traffic is burstier).
- **Secret compares are timing-safe:** every secret/token equality goes through
  `safeSecretCompare()` from `src/lib/utils/webhook.ts` (`timingSafeEqual` + length guard).
  Never `===`/`!==` a webhook secret. (Meta HMAC verification stays in
  `verifyMetaSignature` — it compares digests, not the raw secret.)
- **Outward sends:** any route whose post-response work performs network sends must
  `export const maxDuration = 60` and run the work inside `after()` with the sends
  `await`-ed — see the root CLAUDE.md `after()` Pattern Note (2026-06-08 outage).
- A future webhook (call-intelligence) composes all four rules from day one.

## Active BSP: Gupshup v1

### Inbound routing gate — staff → Elaya, unknown → lead pipeline (2026-06-12)

Every inbound message event (BOTH the Gupshup and dormant Meta branches) passes through
`tryHandleElayaWhatsAppMessage(phone, message)` from `src/lib/services/elaya-whatsapp.ts`
**before** `processInboundMessage`:

- The sender number is normalized via `normalizeWaPhone()` (`src/lib/utils/phone.ts`) — THE
  shared inbound-WhatsApp normalizer; the lead pipeline uses the same function, so both sides
  of the gate always resolve the same string. Never fork a second normalization.
- Number matches an **active** `profiles` row (`getActiveProfileByPhone`) → Elaya staff
  channel: full brain turn to completion inside the route's existing `after()` (the 200 ack is
  NEVER blocked on LLM latency; `maxDuration = 60` covers the turn), single reply via
  `sendElayaWhatsAppReply` (audit row `type 'elaya_reply'`, migration 0117). Once a profile
  matches, the gate returns `true` on **every** downstream path including failures — a staff
  message must never fall through and mint a lead row.
- **Voice notes (E4a, 2026-06-14):** the Gupshup `message` branch inspects `payload.type` — an
  `audio` payload carries a direct, time-limited CDN url (`inner.url` + `inner.contentType`), NOT a
  Meta media-id, so it builds a `type: 'audio'` `MetaInboundMessage` (`getMediaDownloadUrl` is
  Meta-only and stays unused). The Elaya gate transcribes it via the shared
  `transcription-service` (`transcribeWhatsAppAudio` → `transcribeAudio`) and runs the SAME brain
  turn a typed message would — voice is an input transform only. Empty/non-speech → graceful nudge
  (no cap burn, no model call); download/transcription failure → handled + `REPLY_UNAVAILABLE`. A
  voice note counts as one capped message. The lead pipeline never sees a staff voice note.
- No match → `processInboundMessage` runs unchanged (lead pipeline byte-identical).
- Collision (a staff number that also exists on an active lead row): profile wins; a
  `[elaya-whatsapp] phone collision` warn is logged with both ids.
- The Elaya branch writes ONLY `elaya_messages` (+ the notification-log audit row) — never
  `whatsapp_conversations` / `whatsapp_messages` / `leads`. Reply failures are logged, never
  retried.

### Auth — `src/app/api/webhooks/whatsapp/route.ts`

Inbound requests are authenticated via the `x-gupshup-secret` header checked with `safeSecretCompare()` from `src/lib/utils/webhook.ts` (timing-safe). The secret value is read from `GUPSHUP_WEBHOOK_SECRET`.

- Presence of `x-gupshup-secret` header routes the request through the Gupshup path.
- Absence routes through the dormant Meta v3 path (kept for future use).
- Never use a plain `===` string compare for the secret — always `safeSecretCompare()` (it wraps `timingSafeEqual` with the equal-length buffer check).

### Inbound format — dual-format parser

The POST handler detects the BSP by header, then branches:

| BSP | Detection | Shape |
| --- | --- | --- |
| Gupshup v2 | `x-gupshup-secret` header present | `{ type: 'message', payload: { id, source, payload: { text } } }` |
| Meta v3 | no `x-gupshup-secret`, `x-hub-signature-256` present | `{ object: 'whatsapp_business_account', entry: [...] }` |

**Gupshup v2 fields:**
- `messageId` → `body.payload.id`
- `phone` → `+${body.payload.source}` (source has no `+` prefix — always add it)
- `waId` → `body.payload.source` (no prefix)
- text content → `body.payload.payload.text`

**Inbound type mapping — `buildGupshupMessage(innerType, inner, messageId, waId)`** (in the route).
Gupshup's `body.payload.type` is mapped to a typed `MetaInboundMessage` before the routing gate so
BOTH the Elaya gate and the lead pipeline see the real type. **Never re-flatten media to text.**

| Gupshup `inner` type | → MetaInboundMessage | Media source |
| --- | --- | --- |
| `text` | `text` (body = `inner.text`) | — (preserved byte-identically) |
| `image` / `video` / `audio` | same type | direct CDN url `inner.url` + `inner.contentType` + `inner.caption` |
| `file` | `document` | same (Gupshup calls it `file`, Meta calls it `document`) |
| sticker/location/contact/reaction/button_reply/list_reply, or a media type with no `url` | `text` with a **label** (`[Location]`, `[Contact card]`, … or `[Unsupported message]`) | — (never stored blank) |

- Gupshup media carries a **direct, time-limited CDN url** (not a Meta media-id), so the media
  object sets `url`; `getMediaDownloadUrl` (Meta media-id fetch) only runs on the dormant Meta path.
  **CDN urls expire**, so `processInboundMessage` step 6 calls `storeInboundMedia`
  (`src/lib/services/whatsapp-media.ts`) to download the bytes and re-host them in the private
  `whatsapp-media` bucket (migration 0141), storing the durable **path** in `media_url` (reads mint
  signed urls via `signMediaPath`). On download/upload failure it falls back to the raw CDN url.
- The blank-bubble guard is also in the UI: `MessageBubble` renders an "Unsupported message"
  placeholder for any non-media message whose `content` is blank (defence in depth).
- **Elaya impact: none.** The gate's own `message.type` switch handles `text`/`audio` (reads body /
  transcribes) and replies "text only" for everything else; the mapper only changed which branch a
  staff-sent media message takes (now the real `else` branch instead of the empty-content guard).

**Silent 200 types (no processing):**
- `body.type === 'message-event'` — delivery receipts
- `body.type === 'billing-event'` — billing pings

### Outbound — `src/lib/services/whatsapp-api.ts`

`sendTextMessage` posts to `https://api.gupshup.io/wa/api/v1/msg` as `application/x-www-form-urlencoded` with `apikey` header (not Bearer). Returns `MetaApiResponse` shape so all callers are unchanged.

Required env vars: `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`. Server throws at startup if any are missing.

Meta env vars (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`) are optional — dormant functions compile but are not called.
