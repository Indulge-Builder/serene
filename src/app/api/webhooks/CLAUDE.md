# Webhooks CLAUDE.md

## Active BSP: Gupshup v1

### Auth — `src/app/api/webhooks/whatsapp/route.ts`

Inbound requests are authenticated via the `x-gupshup-secret` header checked with `timingSafeEqual` (Node `crypto`). The secret value is read from `GUPSHUP_WEBHOOK_SECRET`.

- Presence of `x-gupshup-secret` header routes the request through the Gupshup path.
- Absence routes through the dormant Meta v3 path (kept for future use).
- Never use a plain `===` string compare for the secret — always `timingSafeEqual` with equal-length buffer check.

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

**Silent 200 types (no processing):**
- `body.type === 'message-event'` — delivery receipts
- `body.type === 'billing-event'` — billing pings

### Outbound — `src/lib/services/whatsapp-api.ts`

`sendTextMessage` posts to `https://api.gupshup.io/wa/api/v1/msg` as `application/x-www-form-urlencoded` with `apikey` header (not Bearer). Returns `MetaApiResponse` shape so all callers are unchanged.

Required env vars: `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`. Server throws at startup if any are missing.

Meta env vars (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`) are optional — dormant functions compile but are not called.
