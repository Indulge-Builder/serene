# Elaya Customer Channel — Welcome-Blast + Training Page (FEATURE 2 design)

> **Status: BUILT (Blocks 2–4) — LIVE-CAPABLE behind the welcome-template env var.** 2026-06-26.
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
> `docs/architecture/elaya-jarvis-architecture.md` (the Golden Rule), `src/lib/elaya/CLAUDE.md` (the
> parity rule), and `docs/the-next-phase.md` §5.
>
> **To go live:** set `GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID` to your approved Gupshup template id
> (env var). Adjust `sendCustomerWelcomeTemplate`'s `templateParams` if the approved template's
> variable list differs from `[{{1}} = customer first name]`. That's the only remaining step.

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

| | Staff principal | **Customer principal (this build)** |
| --- | --- | --- |
| `persona` | `'staff'` | `'customer'` |
| Toolset | role-gated read+write (11 write tools, oversight reads…) | **send-material + answer-from-KB ONLY** — no `search_leads`, no writes, nothing CRM |
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

## 2. The routing fork (where the customer channel hooks in)

Today the WhatsApp webhook (`src/app/api/webhooks/whatsapp/route.ts`, inside its `after()`):

```
tryHandleElayaWhatsAppMessage(phone, message)   ← STAFF gate (FIRST, untouched)
  → phone matches an active staff profile?  → STAFF Elaya handles it, returns true
  → no match                                → processInboundMessage(...)  ← LEAD pipeline
```

`processInboundMessage` (`whatsapp-ingestion.ts`) is where an unknown number becomes a lead via
`createLeadFromWhatsApp` — and it already distinguishes the **brand-new** case: the `!alreadyExisted`
block (it just minted the lead) vs a returning/duplicate number.

**The hook:** the customer-Elaya layer is ADDITIVE inside `processInboundMessage`, never replacing
the lead pipeline:

- **New number, first-ever message** (`!alreadyExisted`, lead just created): after lead creation +
  round-robin + the existing founder/agent notifications all fire as today, schedule the
  **welcome-blast** (the approved template) — once.
- **The lead replies** (a subsequent inbound on a lead whose welcome already fired, session now
  open): route to the **customer Elaya turn** (conversational, KB-grounded) instead of just
  recording the message.
- **Staff gate stays FIRST and untouched.** A staff number is diverted before any of this. The lead
  pipeline (lead creation, assignment, notifications, dossier, the agent's own WhatsApp view) is
  never skipped — the customer layer rides on top.

```
NEW unknown number
  → (staff gate: no match)
  → processInboundMessage
      → createLeadFromWhatsApp  (lead + round-robin + founder/agent alerts — UNCHANGED)
      → after(): sendCustomerWelcome(lead)   ← approved TEMPLATE, once, idempotent

LEAD replies (session window now open)
  → (staff gate: no match)
  → processInboundMessage
      → resolveLeadByPhone (exists) + record the inbound message  (UNCHANGED)
      → after(): runCustomerElayaTurn(lead, message)   ← KB-grounded free-form reply(ies)
```

### Idempotency — the welcome fires ONCE per lead

A redelivery or a fast second inbound must NOT re-blast. The welcome-sent state is tracked on the
lead (a `welcomed_at timestamptz` column, or a dedicated `elaya_customer_state` row). The send path
is **stamp-then-send under a guard** (`UPDATE … WHERE welcomed_at IS NULL RETURNING` — only the call
that wins the stamp sends), mirroring the exactly-once `markTaskOverdueOnce` / `overdue_at` pattern.
Combined with the existing `wa_message_id` dedup, a redelivered first message can never double-blast.

---

## 3. The training page + data model (where staff "train her")

Staff (admin/founder; manager optional) upload the material Elaya draws from. **Clone the
ad-creatives admin feature** (it already does upload-to-bucket + manage-rows + RLS-gated writes):

| Ad-creatives (the precedent) | Customer-training (clone) |
| --- | --- |
| `AdCreativesManager.tsx` / `AdCreativeFormModal.tsx` | `ElayaTrainingManager.tsx` / `TrainingAssetFormModal.tsx` |
| `actions/ad-creatives.ts` | `actions/elaya-training.ts` |
| `services/ad-creatives-service.ts` | `services/elaya-training-service.ts` |
| `ad-creatives` storage bucket (migrations 0012/0058/0092) | a new bucket (private vs public — see below) |
| `ad_creatives` table | `elaya_training_assets` table (new migration) |

### `elaya_training_assets` (new table — mirrors the 0012 ad_creatives RLS exactly)

```text
id            uuid PK
kind          text CHECK in (brochure, work_example, testimonial, review, podcast,
                              image, video, doc, fact, url)
title         text NOT NULL
description   text
url           text            -- for link assets (podcast, review, external)
storage_path  text            -- for uploaded media (image/video/PDF) in the bucket
tags          text[]          -- topical match (e.g. ['wedding','dubai'])
domain        app_domain      -- which Gia domain it's for; NULL = all domains
send_order    int             -- the blast sequence order
active        bool DEFAULT true
created_at / updated_at        -- update_updated_at() trigger
```

RLS (mirror 0012): all-authenticated SELECT (the send path reads via admin client anyway);
admin/founder INSERT/UPDATE/DELETE. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` (A-08). One CHECK on
`kind`, the SQL mirror of a `TRAINING_ASSET_KINDS` constant in `lib/constants/`.

### The company-facts / persona brief

A single editable **text blob** (the company story + services + tone brief) the customer system
prompt is built from. Either a `kind='fact'` set in the same table, or one `elaya_settings`-style
key. This is the ONLY source of company facts the model may state — the prompt instructs it to never
invent a service or a price.

### Bucket: PUBLIC vs PRIVATE — the Gupshup constraint

Gupshup sends media **by URL** (`sendGupshupMediaMessage(to, type, url, caption?, filename?)`) — the
URL must be fetchable by Gupshup for the send duration. Two valid options:

- **Public bucket** (like `ad-creatives`) — simplest; the asset URL is directly fetchable. Fine if
  the material is marketing collateral meant to be shared anyway (brochures, work examples).
- **Private bucket + signed URL** (like `whatsapp-media` 0141 — `signMediaPath` mints a 1-hour
  signed URL) — if any asset shouldn't be world-readable.

**Recommendation:** public bucket — this material is literally what we send to prospects, so it's
already meant to be shared, and it avoids the signed-URL-expiry-mid-send edge. (Decide at build.)

---

## 4. The customer principal + persona (Block 1 of the build)

- **`resolveCustomerPrincipal(lead)`** — replace the throwing stub in `principal.ts`. Returns a
  principal with `persona: 'customer'`, identity = the lead (id + domain + name), and a **hard-capped
  customer toolset** (the two customer tools below — NO staff tools). The toolset is the gate; the
  dispatch `executeTool` membership check already refuses anything outside it.
- **Customer system prompt** — built from the company-facts brief + the relevant training KB
  (filtered by the lead's domain + interests). A separate `persona.ts` branch (or a sibling builder)
  — warm, human, psychology-trained-salesperson voice, NOT salesy; states only KB facts; ₹ only;
  never reveals it's an AI tool/Serene; never discusses other customers or internal ops.
- **Two customer tools** (read-only-ish, KB-scoped):
  - `get_company_material(topic?/interest?)` — pull the right training assets (brochure / work
    example / testimonial / review / podcast) to send, in `send_order`, filtered to the lead's
    domain + interest.
  - *(optional)* `note_customer_interest(interest)` — capture what the prospect cares about onto the
    lead (writes `service_interests` via the existing `extractServiceInterests` path) so the human
    agent picks up warm. This is the ONE write a customer turn may do, and it touches only THIS
    lead's own interest list — never status, never anyone else.

---

## 5. The welcome-blast orchestrator (Block 2)

`sendCustomerWelcome(lead)` — fires once (the idempotency guard in §2):

1. **First message = the approved template** (`GUPSHUP_CUSTOMER_WELCOME_TEMPLATE_ID`, a new
   `whatsapp-api.ts` wrapper over `sendGupshupTemplate`, one-log-row-per-attempt). Warm welcome +
   one light question to invite a reply (which opens the session).
2. Stamp `welcomed_at`. Nothing else sends yet — we cannot free-form a cold number.

`runCustomerElayaTurn(lead, message)` — on the lead's reply (session open):

3. The conversational blast: Elaya introduces the company, then sends the material **spaced and
   humanised, not dumped** — intro → brochure → work examples → testimonials → review/podcast — via
   `sendGupshupMediaMessage` (media) + `sendElayaWhatsAppReply`-style free-form text, pulling assets
   in `send_order` through `get_company_material`. Adapts to what the lead says (it's a conversation,
   not a script).
4. All sends are **awaited inside `after()`** with the one-log-row-per-attempt contract (A-16);
   `maxDuration` already 180s on the whatsapp route.
5. Ongoing replies stay in the customer persona, answering from the KB, within the 24h window. If
   the window has closed, fall back to the approved template for the re-open.

---

## 6. Safety / guardrail checklist (every item enforced in CODE)

- [ ] Customer toolset excludes ALL staff tools (membership gate, before the model).
- [ ] Customer prompt states only KB facts; never invents a service/price; ₹ only.
- [ ] No access to leads/deals/tasks/performance/other customers (no such tool exists for customer).
- [ ] Welcome fires exactly once per lead (stamp-then-send guard + `wa_message_id` dedup).
- [ ] Lead pipeline (creation, round-robin, founder/agent alerts) never skipped.
- [ ] First cold-number message is an approved template; free-form only inside the 24h window.
- [ ] All outward sends: `after()` + awaited + one-log-row-per-attempt (no `void fetch().catch()`).
- [ ] PII: customer replies pass the same model safety; the agent can take over any time.

---

## 7. Suggested build order (each step independently reviewable)

1. **This design doc + founder sign-off** + confirm the Gupshup welcome-template story (the
   approval is founder-side). ← you are here.
2. **Training data model + admin page** (the ad-creatives clone) — staff upload/manage assets + write
   the company-facts brief. Useful on its own, lowest risk, no outward sends.
3. **Customer principal + persona** — `resolveCustomerPrincipal` returns a real, hard-capped customer
   principal; the customer system prompt is built from the brief + KB; the Golden Rule enforced in
   code.
4. **The welcome-blast orchestrator** — template-first, then conversational, idempotent, `after()` +
   awaited sends.
5. **The ongoing customer conversation** — subsequent replies route to the customer Elaya within the
   24h window; template re-open after.

---

## 8. Open decisions for the founder

- **The welcome template copy + approval** (founder + Gupshup). Blocks step 4, not 2/3.
- **Bucket public vs private** (§3) — recommended public.
- **Manager access to the training page?** (admin/founder only, or +manager.)
- **`note_customer_interest`** (§4) — include the one KB-write tool, or keep the customer turn
  strictly read-only for v1?
- **Which assets are in-scope for v1** (brochure + work examples + testimonials first; podcast/review
  later)?
