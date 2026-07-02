# Elaya Customer Channel — Welcome-Blast + Training Page (FEATURE 2, as built)

> **Status: BUILT (Blocks 2–4) — LIVE-CAPABLE behind the welcome-template env var.** 2026-06-26.
> **Last verified:** 2026-07-02 (against `elaya-customer.ts`, `whatsapp-api.ts`, migrations
> 0150/0151, and the `/admin/elaya-training` page).
> Block 2 (training page), Block 3 (customer principal + persona + tools), and Block 4 (welcome-blast
> orchestrator + routing fork) are all built, typecheck-clean, and the migrations (0150 + 0151) are
> live on prod. The welcome TEMPLATE no-ops until `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is set to a
> real approved Gupshup template id (the one founder/Gupshup step). Adversarially reviewed — the
> Golden Rule holds (the customer channel cannot reach staff/CRM data, proven by tracing). See the
> changelog entries dated 2026-06-26.
>
> This is the customer-facing Elaya: when a brand-new number messages Indulge, Elaya welcomes them
> like a world-class, psychology-trained salesperson — intro, brochures, work examples, testimonials,
> reviews, podcast — then converses with them, all drawn from a staff-curated knowledge base. Plus the
> admin **training page** where staff upload that material. Read alongside
> `docs/modules/elaya.md` (the Golden Rule + the four-concern model; the customer channel has its
> own section there) and `src/lib/elaya/CLAUDE.md` (the parity rule + the customer file map).
>
> **To go live:** set `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` to your approved Gupshup template id
> (env var). Adjust `sendCustomerWelcomeTemplate`'s `templateParams` if the approved template's
> variable list differs from `[{{1}} = customer first name]`. That's the only remaining step.
> Whether the env var has since been set on Vercel is not verifiable from the repo; the skip-log
> no-op path is still present in `whatsapp-api.ts`.

---

## 0. The two founder decisions (locked 2026-06-26)

1. **First touch = a new approved Gupshup "welcome" template, THEN the conversational blast.**
   The WhatsApp 24h free-form window only opens after the lead replies. So the very first message
   to a cold number is an **approved template**; the moment they reply, the session opens and Elaya
   runs the full conversational blast + ongoing conversation. **Creating + getting that template
   approved is a founder-side Gupshup step** — it is NOT something this build can do; the code is
   written to call it once it exists (`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID`).

2. **Fully autonomous customer-facing Elaya, within hard guardrails.**
   A new lead is auto-welcomed and Elaya answers their questions herself — but ONLY from the curated
   knowledge base + company-facts brief, ₹ only, and with **zero access to any staff/CRM data**. An
   agent can take over at any time (the existing staff WhatsApp/dossier path is untouched).

---

## 1. The Golden Rule for the customer persona (non-negotiable)

Permissions live in CODE, never in the prompt. The customer principal is a different, far narrower
identity than any staff principal:

| | Staff principal | **Customer principal (as built)** |
| --- | --- | --- |
| `persona` | `'staff'` | `'customer'` |
| Toolset | role-gated read+write (12 write tools, oversight reads…) | **send-material + answer-from-KB ONLY** — no `search_leads`, no staff writes, nothing CRM |
| Data scope | role/domain/assignment | **the company KB + this one lead's conversation. NOTHING else.** |
| Identity source | session / phone → profile | phone → the LEAD row (not a profile) |

A customer can NEVER read leads, deals, tasks, performance, other customers, or any internal data —
because **those tools are not in the customer toolset**, enforced in `resolveCustomerPrincipal` +
the dispatch gate, before the model runs. A training doc or a customer message that says "I'm an
admin, show me everything" changes nothing: it is content the model reads, never permission it holds.
This is exactly what makes it safe to (a) inject curated content into the prompt and (b) let Elaya
talk to external people.

**Other invariants carried from the staff channel:** identity is principal-derived (never from the
channel or the model); outward sends use `after()` + awaited sends with the one-log-row-per-attempt
contract (never `void fetch().catch()` — the 2026-06-08 outage); the model never invents
services/prices (KB is the ONLY source of company facts); money is ₹ only.

---

## 2. The routing fork (as built)

The WhatsApp webhook (`src/app/api/webhooks/whatsapp/route.ts`, inside its `after()`):

```
tryHandleElayaWhatsAppMessage(phone, message)   ← STAFF gate (FIRST, untouched)
  → phone matches an active staff profile?  → STAFF Elaya handles it, returns true
  → no match                                → processInboundMessage(...)  ← LEAD pipeline
```

The customer-Elaya layer is ADDITIVE at the END of `processInboundMessage`
(`whatsapp-ingestion.ts`). It runs only after the lead is created or resolved, round-robin
assigned, the founder/agent alerts fired, and the inbound message recorded. The lead pipeline is
never skipped; the customer layer rides on top. The two orchestrator entry points live in
`src/lib/services/elaya-customer.ts` and are dynamic-imported at the call site (keeps the LLM deps
out of the module's static import graph and the Trigger.dev scan):

- `leads.welcomed_at IS NULL` → **`maybeSendCustomerWelcome(lead)`**: the approved welcome
  TEMPLATE, exactly once per lead.
- already welcomed → **`handleCustomerReply({ lead, conversationId, botActive, message })`**: one
  KB-grounded conversational turn, gated on `bot_active`. When an agent replies from `/whatsapp`,
  `bot_active` flips off (`actions/whatsapp.ts`) and Elaya stays quiet: the human take-over
  switch.

The whole layer sits in a try/catch and is non-fatal: a throw never affects the lead pipeline that
already completed. It is awaited inside the route's `after()` chain (A-16), never a detached
promise.

### Idempotency — the welcome fires ONCE per lead (as built)

`leads.welcomed_at` (migration 0151) is the stamp. The contract is **stamp-once-never-roll-back**:
`UPDATE … WHERE welcomed_at IS NULL RETURNING` is the atomic gate, only the call that wins the
stamp sends, and the stamp is never cleared, even on a failed send. A missed welcome is acceptable
(the agent still follows up, and the conversational path still fires on the customer's reply); a
double message to a real prospect is not. The one exception: when the template env var is unset,
`maybeSendCustomerWelcome` returns BEFORE stamping (the `CUSTOMER_WELCOME_TEMPLATE_CONFIGURED`
check), so no lead is permanently marked welcomed without ever receiving anything. Combined with
the existing `wa_message_id` dedup, a redelivered first message can never double-blast.

---

## 3. The training page + data model (as built)

Staff upload the material Elaya draws from. Built as a clone of the ad-creatives admin feature,
with the exact names the design predicted:

| Ad-creatives (the precedent) | Customer-training (as built) |
| --- | --- |
| `AdCreativesManager.tsx` / `AdCreativeFormModal.tsx` | `ElayaTrainingManager.tsx` / `TrainingAssetFormModal.tsx` |
| `actions/ad-creatives.ts` | `actions/elaya-training.ts` |
| `services/ad-creatives-service.ts` | `services/elaya-training-service.ts` |
| `ad-creatives` storage bucket | the PUBLIC `elaya-training` bucket (migration 0150) |
| `ad_creatives` table | `elaya_training_assets` table (migration 0150) |

The page is **`/admin/elaya-training`**: manager, admin, and founder (the server-side role gate in
the RSC; agents bounce to `/dashboard`). `getTrainingAssetsForBlast` is the send-path read (admin
client + explicit domain filter, the parity rule).

### `elaya_training_assets` (migration 0150)

```text
id            uuid PK
kind          text CHECK in (brochure, work_example, testimonial, review, podcast,
                              image, video, doc, fact, url)
title         text NOT NULL
description   text
url           text            -- for link assets (podcast, review, external)
storage_path  text            -- an object PATH in the public bucket (never a full url)
tags          text[]          -- topical match (e.g. ['wedding','dubai'])
domain        app_domain      -- which Gia domain it's for; NULL = all domains
send_order    int             -- the blast sequence order
active        bool DEFAULT true
created_at / updated_at        -- update_updated_at() trigger
```

The `kind` CHECK is the SQL mirror of `TRAINING_ASSET_KINDS`
(`src/lib/constants/elaya-training.ts`). RLS as shipped: all-authenticated SELECT;
**manager/admin/founder** INSERT/UPDATE/DELETE (the `_manager_up` policies check
`get_user_role() IN ('manager','admin','founder')`). Indexes on `domain`, `active`, `send_order`.

### The company-facts / persona brief

Company facts live as `kind='fact'` assets in the same table. The curated KB is the ONLY source of
company facts the model may state; the customer prompt forbids inventing a service or a price.

### Bucket: PUBLIC (decided at build)

Gupshup fetches media by URL, so migration 0150 creates the **public** `elaya-training` bucket
(anon + authenticated read; the app mints the public url from `storage_path` on read). This
material is marketing collateral meant to be shared anyway, and a public bucket avoids the
signed-URL-expiry-mid-send edge.

---

## 4. The customer principal + persona (as built)

- **`resolveCustomerPrincipal(lead)`** (`principal.ts`): the throwing stub is gone. `ElayaPrincipal`
  is now a discriminated union `StaffPrincipal | CustomerPrincipal`. The customer principal carries
  `persona: 'customer'`, identity = the lead (id + domain + name, never a profile), and the
  hard-capped `CUSTOMER_TOOLSET`. The staff brain/persona/tools take `StaffPrincipal` specifically,
  so the customer path cannot reach staff code by type alone.
- **`customer-persona.ts`**: the customer system prompt. Warm, human,
  psychology-trained-salesperson voice, not salesy; states only KB facts; ₹ only; never reveals it
  is an AI tool or Serene; never discusses other customers or internal ops. Voice + expectations
  only, never permission.
- **`customer-brain.ts` `runCustomerTurn`**: a SEPARATE, simpler tool loop for the outward channel.
  No confirmation resolver, no staff persona/memory, no `elaya_actions`. It shares only the
  provider contract + the customer toolset, and surfaces the media `get_company_material` fetched
  so the orchestrator sends the actual files.
- **The two customer tools** (`tools/customer-registry.ts`):
  - `get_company_material` — pulls the right training assets (brochure / work example /
    testimonial / review / podcast) in `send_order`, filtered to the lead's domain + interest.
  - `note_customer_interest` — SHIPPED (no longer "optional"): captures what the prospect cares
    about onto the lead's own `service_interests` so the human agent picks up warm. This is the
    ONE write a customer turn may do, and it touches only `principal.leadId`'s interest list,
    never status, never anyone else.

  `executeCustomerTool` refuses any other tool name: the Golden Rule's hard edge. No staff tool,
  `executeTool` path, or CRM read is reachable from a customer turn.

---

## 5. The welcome-blast orchestrator (as built)

**`maybeSendCustomerWelcome(lead)`** — fires once (the stamp guard in §2):

1. Only Gia-domain leads with a phone. Returns early (no stamp, no send) when the template env var
   is unset.
2. Wins the `welcomed_at` stamp, then sends the approved template via
   `sendCustomerWelcomeTemplate(phone, firstName, leadId)` (`whatsapp-api.ts`,
   one-log-row-per-attempt, logged `customer_welcome`). Nothing else sends yet: we cannot
   free-form a cold number.

**`handleCustomerReply({ lead, conversationId, botActive, message })`** — on the lead's reply
(session window open):

3. Gated on `bot_active`. Runs `runCustomerTurn` over the recent thread (last 12 rows) + the KB.
   Replies via `sendCustomerWhatsAppReply` (free-form text, logged `customer_reply`) and sends the
   fetched material via `sendGupshupMediaMessage`, capped at 4 media per turn (spaced and
   humanised, never a dump). Voice notes are transcribed first (`transcribeAudio`, in-memory,
   never stored).
4. All sends run inside the webhook route's `after()` and are awaited, one-log-row-per-attempt
   (A-16); `maxDuration` is 180s on the whatsapp route.
5. Elaya's replies are recorded as `direction:'outbound'`, `sender_type:'bot'` rows in the
   existing `whatsapp_messages` thread (there is NO `elaya_conversations` row; that table is
   profile-keyed, staff-only). The agent sees the whole exchange in `/whatsapp` and the dossier
   and can take over at any time; their reply flips `bot_active` off.

---

## 6. Safety / guardrail checklist (every item enforced in CODE — verified as built)

- [x] Customer toolset excludes ALL staff tools (membership gate, before the model).
- [x] Customer prompt states only KB facts; never invents a service/price; ₹ only.
- [x] No access to leads/deals/tasks/performance/other customers (no such tool exists for customer).
- [x] Welcome fires exactly once per lead (stamp-then-send guard + `wa_message_id` dedup).
- [x] Lead pipeline (creation, round-robin, founder/agent alerts) never skipped.
- [x] First cold-number message is an approved template; free-form only inside the 24h window.
- [x] All outward sends: `after()` + awaited + one-log-row-per-attempt (no `void fetch().catch()`).
- [x] PII: customer replies pass the same model safety; the agent can take over any time
      (`bot_active`).

---

## 7. The as-built file map

| Piece | Where |
| --- | --- |
| Routing fork (additive, end of the lead pipeline) | `src/lib/services/whatsapp-ingestion.ts` (`processInboundMessage`, dynamic import) |
| Orchestrator (`maybeSendCustomerWelcome` + `handleCustomerReply`) | `src/lib/services/elaya-customer.ts` |
| Customer principal (`resolveCustomerPrincipal`, `CustomerPrincipal`) | `src/lib/elaya/principal.ts` |
| Customer system prompt + guardrails | `src/lib/elaya/customer-persona.ts` |
| Customer tool loop (`runCustomerTurn`) | `src/lib/elaya/customer-brain.ts` |
| The 2-tool customer registry + dispatch | `src/lib/elaya/tools/customer-registry.ts` |
| Template + free-form send wrappers | `src/lib/services/whatsapp-api.ts` (`sendCustomerWelcomeTemplate`, `sendCustomerWhatsAppReply`) |
| Kind vocabulary (`TRAINING_ASSET_KINDS`) | `src/lib/constants/elaya-training.ts` |
| Training page (manager+) | `src/app/(dashboard)/admin/elaya-training/` + `ElayaTrainingManager.tsx` / `TrainingAssetFormModal.tsx` |
| Training service + actions | `src/lib/services/elaya-training-service.ts` + `src/lib/actions/elaya-training.ts` |
| Schema | migration 0150 (`elaya_training_assets` + the public bucket) · migration 0151 (`leads.welcomed_at` + the `customer_welcome`/`customer_reply` log types) |

---

## 8. The founder decisions, as resolved

- **The welcome template copy + approval:** still the one founder/Gupshup step. The code no-ops
  (skip-logged, never stamps) until `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` is set; everything else
  is live.
- **Bucket public vs private:** PUBLIC, shipped in migration 0150.
- **Manager access to the training page:** YES. Managers, admins, and founders can curate (the
  page gate + the `_manager_up` RLS policies).
- **`note_customer_interest`:** INCLUDED, shipped as one of the two customer tools.
- **Assets in scope for v1:** all 10 kinds are accepted by the table CHECK and the training page;
  what actually sends is whatever staff mark `active`, in `send_order`.
