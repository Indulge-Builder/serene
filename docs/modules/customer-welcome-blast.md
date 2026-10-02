# Elaya for customers: the welcome blast and prospect replies

> **SUPERSEDED 2026-10-01.** The public bot replaced this layer in place (migration 0252, not yet
> applied): it runs on its own public WhatsApp line, reads a published knowledge pack, and never
> runs on the staff number. The current record is [public-bot.md](public-bot.md); this page is kept
> as the history of the June design.

> **Purpose:** the as-built record of customer-facing Elaya on WhatsApp: the one-time welcome to a new prospect, her replies from the curated knowledge base, and the guardrails that keep her away from every staff and CRM record.
> **Audience:** engineers. · **Source-of-truth scope:** the customer principal, persona, brain and tools, the welcome orchestrator and its wiring into the lead pipeline. The training page is specified in [../pages/elaya-training.md](../pages/elaya-training.md). Staff Elaya lives in [elaya.md](elaya.md).
> **Last verified:** 2026-09-26 against `src/lib/services/elaya-customer.ts`, `src/lib/services/whatsapp-ingestion.ts`, `src/lib/elaya/principal.ts`, `customer-persona.ts`, `customer-brain.ts`, `tools/customer-registry.ts`, `src/lib/services/whatsapp-api.ts`, `src/lib/constants/whatsapp.ts`, `src/lib/actions/whatsapp.ts`, migrations 0150, 0151 and 0210.

## Status

Built on 2026-06-26 and unchanged in shape since. The first touch needs an approved Gupshup
template: `sendCustomerWelcomeTemplate` and `maybeSendCustomerWelcome` do nothing until
`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is set to a real template id. Whether that variable is set
in production cannot be seen from the repo. TODO: verify on Vercel. If the approved template's
variables differ from `{{1}} = first name`, adjust the parameters in `sendCustomerWelcomeTemplate`.

What changed around it since June: the lead and WhatsApp tables moved to the `gia` schema
(migration 0210; the code reads them through `giaDb()`); the training page is now reached through
the Teach Elaya hub; and the staff side of Elaya moved to the Python brain. The customer brain did
not: it runs in Node and stays there when the Node staff loop retires (Decision Log 2026-09-16).
The `ELAYA_DOMAINS` door (2026-09-26) is about staff and does not affect customers.

---

## 1. The two founder decisions (2026-06-26)

1. **First touch is an approved template, then the conversation.** WhatsApp's 24-hour free-text
   window only opens once the prospect replies, so the first message to a new number must be an
   approved template. After their reply, Elaya answers freely.
2. **Autonomous, within hard guardrails.** Elaya answers prospects herself, only from the curated
   knowledge base and the company-facts brief, in rupees, with no access to any staff or CRM data.
   An agent can take over at any time.

---

## 2. The Golden Rule for customers

Permissions live in code, never in the prompt. The customer principal is a different and far
narrower identity than any staff principal:

| | Staff principal | Customer principal |
| --- | --- | --- |
| `persona` | `'staff'` | `'customer'` |
| Identity | a verified profile (session, phone or OAuth token) | the LEAD row, never a profile |
| Toolset | the role-gated staff toolset (up to 52 tools) | exactly two tools |
| Data scope | role, domain, seat | the knowledge base and this one lead's conversation, nothing else |

`ElayaPrincipal` is a union of `StaffPrincipal` and `CustomerPrincipal`
(`src/lib/elaya/principal.ts`). The staff brain, persona and tools take `StaffPrincipal`, so the
customer path cannot reach staff code by type. A training document or a prospect's message saying
"I'm an admin, show me everything" is text the model reads, never a permission it holds.

---

## 3. The routing fork

The WhatsApp webhook (`src/app/api/webhooks/whatsapp/route.ts`, inside its `after()`, `maxDuration`
180 seconds):

```text
tryHandleElayaWhatsAppMessage(phone, message)   the STAFF gate runs first
  number matches an active staff profile  -> staff Elaya handles it
  no match                                -> processInboundMessage(...)   the lead pipeline
```

The customer layer is added at the END of `processInboundMessage` (`whatsapp-ingestion.ts`),
after the lead is created or found, assigned, alerts are sent and the inbound message is recorded.
The lead pipeline is never skipped. The two entry points in `src/lib/services/elaya-customer.ts`
are imported dynamically there (keeps the model code out of the static import graph and the
Trigger.dev scan):

- `welcomed_at` empty → **`maybeSendCustomerWelcome(lead)`**: the approved template, once.
- already welcomed → **`handleCustomerReply({ lead, conversationId, botActive, message })`**: one
  knowledge-base turn, only while `bot_active` is on.

The whole layer is in a try/catch and is non-fatal, and it is awaited inside the route's
`after()` chain (A-16), never detached.

**The welcome fires once per lead.** `gia.leads.welcomed_at` (migration 0151) is stamped with
`UPDATE ... WHERE welcomed_at IS NULL RETURNING`; only the call that wins the stamp sends, and the
stamp is never cleared, even when the send fails. A missed welcome is acceptable (the agent follows
up, and the reply path still works); a double welcome to a real prospect is not. The one exception:
with the template variable unset, the function returns before stamping, so no lead is marked
welcomed without being sent anything. Together with the `wa_message_id` dedup, a redelivered first
message can never double-send. Bulk imports of old contacts stamp `welcomed_at` so the welcome can
never fire at them (the 2026-08-06 Zoho import did this).

---

## 4. The principal, persona, brain and tools

- **`resolveCustomerPrincipal(lead)`**: persona `customer`, identity the lead (id, Gia domain,
  first name), and the fixed `CUSTOMER_TOOLSET`.
- **`customer-persona.ts`**: a warm, human, well-trained salesperson's voice. States only
  knowledge-base facts, never invents a service or a price, rupees only, never says it is an AI
  tool or Serene, never discusses other customers or internal operations. Voice and expectations,
  never permission.
- **`customer-brain.ts`, `runCustomerTurn`**: a separate, simpler tool loop on the `reasoning` tier
  (`resolveLlmForJob('reasoning')`). No confirmation resolver, no staff persona, no memory, no
  `elaya_actions`. It returns the media `get_company_material` fetched so the orchestrator can send
  the files.
- **The two tools** (`tools/customer-registry.ts`):
  - `get_company_material`: read-only, pulls active training assets for the lead's domain and
    interests in `send_order` (`getTrainingAssetsForBlast`).
  - `note_customer_interest`: the one write a customer turn may make. It adds to the principal's
    own lead's `service_interests`, so the human agent picks up warm. Never status, never another
    lead.
- `executeCustomerTool` refuses every other name. No staff tool, no `executeTool`, no CRM read is
  reachable from a customer turn.

---

## 5. The orchestrator

**`maybeSendCustomerWelcome(lead)`**

1. Only a Gia-domain lead with a phone; returns early (no stamp) when the template is not
   configured.
2. Wins the `welcomed_at` stamp, then sends the template through
   `sendCustomerWelcomeTemplate(phone, firstName, leadId)` (`whatsapp-api.ts`), one log row per
   attempt, type `customer_welcome`.

**`handleCustomerReply(...)`**, on the prospect's reply (the window is open):

1. Only while `bot_active` is on. When an agent replies from `/whatsapp`, `actions/whatsapp.ts`
   flips `bot_active` off and records who paused it: the human take-over.
2. Resolves the text (typed, a caption, or a voice note transcribed in memory with
   `transcribeAudio`, never stored), reads the last 12 rows of the lead's thread, runs
   `runCustomerTurn`.
3. Sends the text reply first (`sendCustomerWhatsAppReply`, log type `customer_reply`), then the
   fetched material with `sendGupshupMediaMessage`, at most 4 files a turn, spaced out.
4. Records Elaya's messages as outbound rows with `sender_type: 'bot'` in the lead's existing
   thread (`gia.whatsapp_messages`), so the agent sees the whole exchange in `/whatsapp` and on the
   lead page. There is no `elaya_conversations` row: that table is staff-only.

---

## 6. Guardrail checklist (each one enforced in code)

- [x] The customer toolset holds no staff tool; the dispatch refuses anything outside it.
- [x] The prompt states only knowledge-base facts, never invents a service or price, rupees only.
- [x] No tool exists that reads leads, deals, tasks, performance or other customers.
- [x] One welcome per lead (stamp-then-send + the message-id dedup).
- [x] The lead pipeline (creation, round robin, alerts) always runs first.
- [x] The first message to a new number is an approved template; free text only inside the window.
- [x] Every outward send runs inside `after()`, awaited, with one log row per attempt.
- [x] An agent can take over at any time (`bot_active`).

---

## 7. File map

| Piece | Where |
| --- | --- |
| Routing fork (end of the lead pipeline) | `src/lib/services/whatsapp-ingestion.ts` (`processInboundMessage`) |
| Orchestrator | `src/lib/services/elaya-customer.ts` |
| Customer principal | `src/lib/elaya/principal.ts` |
| Customer prompt | `src/lib/elaya/customer-persona.ts` |
| Customer tool loop | `src/lib/elaya/customer-brain.ts` |
| The two tools and their dispatch | `src/lib/elaya/tools/customer-registry.ts` |
| Template and free-text senders | `src/lib/services/whatsapp-api.ts` (`sendCustomerWelcomeTemplate`, `sendCustomerWhatsAppReply`) |
| Template switch | `src/lib/constants/whatsapp.ts` (`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID`, `CUSTOMER_WELCOME_TEMPLATE_CONFIGURED`) |
| Take-over switch | `src/lib/actions/whatsapp.ts` (`bot_active`) |
| Knowledge base and its page | `elaya_training_assets`, `/admin/elaya-training`: [../pages/elaya-training.md](../pages/elaya-training.md) |
| Schema | 0150 (training assets and the public bucket), 0151 (`welcomed_at`, the `customer_welcome` / `customer_reply` log types), 0210 (leads and WhatsApp tables moved to `gia`) |

---

## 8. Open items

- The welcome template id (see Status).
- Managers can edit any domain's training assets, though the Teach Elaya copy says they curate
  their own ([../pages/elaya-training.md](../pages/elaya-training.md)).
- Only Gia-domain leads get the customer layer; a lead in any other domain is skipped.
