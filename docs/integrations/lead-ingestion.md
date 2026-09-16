# Lead Ingestion (Pabbly / Meta webhook)

> **Purpose:** the inbound form-lead pipeline — webhook contract, source adapters, domain resolution, dedup, round-robin assignment, raw-payload policy.
> **Audience:** engineers. · **Source-of-truth scope:** Pipeline A (form/webhook leads). The WhatsApp-origin pipeline (Pipeline B) lives in `whatsapp-gupshup.md`; the lead lifecycle after ingestion lives in `../modules/gia.md`; notification dispatch lives in `whatsapp-gupshup.md` § Orchestrator.
> **Last verified:** 2026-08-31 against `src/app/api/webhooks/leads/route.ts`, `src/lib/services/lead-ingestion.ts`, `src/lib/leads/adapters.ts`, `src/lib/services/lead-enquiries-service.ts`, `src/lib/constants/campaign-domain-map.ts`, `src/lib/utils/phone.ts`.

---

## 1. Webhook contract

**Endpoint:** `POST /api/webhooks/leads?source=meta|google|website|shop_app`
**Route:** `src/app/api/webhooks/leads/route.ts` — exports `maxDuration = 60` (headroom for the
`after()` notification sends).

Order of operations (the order matters — it is an auditability decision):

1. Resolve the `source` query param (unknown values default to `website` with a warn; validated
   against `LEAD_SOURCES`).
2. **Rate limit before reading the body** — `createRateLimiter({ windowMs: 60_000, max: 100 })`
   per IP, in-memory per worker (`src/lib/utils/webhook.ts`).
3. Parse JSON via the shared guard (`readJsonBody` — 400 on parse failure; never hand-roll the
   try/catch in a webhook route).
4. **Log the raw payload to `lead_raw_payloads` *before* the auth check** so auth failures are
   auditable. `sanitizeRawPayload` strips sensitive envelope keys (`res2` — the Meta page access
   token).
5. Bearer-token check, timing-safe via `safeSecretCompare`. The secret is picked **per
   sender**, not per endpoint: `SHOP_APP_WEBHOOK_SECRET` when `source=shop_app`,
   `PABBLY_WEBHOOK_SECRET` otherwise. They are separate so a leak on one sender can be
   rotated without breaking the other. On failure, mark the raw row
   `ingestion_error: 'unauthorized'`, return 401.
6. `ingestLead(rawPayload, source, rawPayloadId)`.
7. On success: `after(notifyLeadAssigned({ … }))` then return `201 { leadId }` — Pabbly is
   acked immediately; Vercel keeps the lambda alive until the awaited Gupshup sends settle
   (A-16). Dispatch details: `whatsapp-gupshup.md` §4.

## 2. Source adapters — `src/lib/leads/adapters.ts`

| Adapter | Handles | Reads |
| ------- | ------- | ----- |
| `adaptMeta` | Meta lead ads (via Pabbly) | unwraps the Pabbly `raw_data` envelope, then reads `res3.field_data` exclusively (array, or JSON string via `parseFieldDataString`); no other fallback for contact fields |
| `adaptGoogle` | Google Ads lead forms | `raw_google_fields` |
| `adaptWebsite` | Website forms | flat key-value payload |
| `adaptShopApp` | Indulge Shop app enquiries | flat server-built payload; product and enquiry fields become a typed `product_enquiry` |

All produce a typed `NormalizedLeadPayload`. `sanitizeText()` on every text field (S-02).
The adapter's phone normalisation is best-effort and never rejects; the hard identity check
happens later, inside `ingestLead()` (see §3 step 3).

`adaptMeta` specifics: `medium` ← `res3.platform` (`fb`/`ig`/`msg`/`an`; display labels via
`getMetaMediumLabel()` in `lib/constants/lead-sources.ts`); ad metadata lands in the
`attribution` JSONB, not in columns: `attribution.platform` is hardcoded to `'meta'`, plus
`campaign_id`, `ad_name`, and `adset_name` when present. `utm_campaign` ← `res3.campaign_name`.
There is no `utm_content` field, and `source` is never set by the adapter; it comes from the
webhook `?source=` param only (the old `utm_source` column was renamed to `source` in
migration 0065). Every non-standard `field_data` answer lands in `form_data` automatically.

### The shop app adapter

The Indulge Shop app is a React Native client with a NestJS API on EC2. It posts to us
directly, with no Pabbly in between. Pabbly only exists for Meta, which will not POST to an
arbitrary URL.

It is a first-party sender, so the payload is flat and server-built. The client cannot forge
identity: phone, name and product are all resolved from the authenticated member on their
side before the webhook fires. Phone arrives as verified E.164, because a phone OTP is the
only way to have an account there at all.

Two things make this adapter different from `adaptWebsite`:

1. It builds a typed `product_enquiry` on `NormalizedLeadPayload`. Product data does not go
   into `form_data`, because one lead accumulates many enquiries over time and `form_data`
   is written once at INSERT and never updated (the migration 0096 contract).
2. It carries an `external_id`, which is the shop's own Mongo lead id. Their delivery loop
   retries three times automatically and any number of times manually, always with the same
   id, so this is the value that makes redelivery safe.

`member_city` is deliberately written into `form_data.city` rather than given its own route,
so it rides the `form_data.city` to `leads.city` lift that already runs in step 6.

`safeHttpUrl()` accepts http and https only. These values end up as `href` and `src` on the
dossier card, and both `new URL()` and Zod's `.url()` accept `javascript:` without complaint.

## 3. Inside `ingestLead()` (`src/lib/services/lead-ingestion.ts`)

1. Zod validation of the normalized payload (`leadPayloadSchema`, passthrough) — 422 +
   `ingestion_error` on failure.
2. **Domain resolution** — priority: explicit `domain` field → campaign-prefix map → default.
   `CAMPAIGN_DOMAIN_MAP` (prefix → domain): `TG_Global→onboarding`, `TG_Shop→shop`,
   `TG_Legacy→legacy`, `TG_House→house`, `TG_B2B→business`. Then a **Gia-only coercion**: any
   resolved domain that fails `isGiaDomain()` (including `business` from the map, and any free-form
   payload domain) is coerced to `DEFAULT_GIA_DOMAIN` (`'onboarding'`) with a console warn.
   A `TG_B2B` lead therefore lands in `onboarding`, not `business`.
   *(No Sentry call exists — an unmatched prefix falls through with a console warn at most;
   the old "logged to Sentry" claim was drift.)*
3. **Phone canonicalization:** `canonicalizePhone(data.phone)` (`lib/utils/phone.ts`, the
   shared phone-identity normalizer across the webhook, WhatsApp, and manual paths): E.164 when
   parseable, else digits-only. An **empty result is rejected** with 422 +
   `ingestion_error: 'empty_phone'`; phone is the required dedup key, so a blank-phone lead is
   never inserted. A non-empty unparseable phone is kept (digits-only), never rejected.
4. **Phone dedup** via the `get_active_lead_by_phone()` RPC:
   - Active lead (new/touched/in_discussion/nurturing) → log a `duplicate_submission`
     activity on the existing lead, return success with `is_duplicate: true`,
     `assigned_to: null`. No new row.
   - Terminal lead (won/lost/junk) → create a **new** lead with `previous_lead_id` linking the
     history chain.
5. **Round-robin assignment** — `getNextRoundRobinAgent(domain)` →
   `get_next_round_robin_agent()` (migration 0007): SECURITY DEFINER,
   `SELECT FOR UPDATE SKIP LOCKED`, race-free under concurrent webhooks, O(agents).
   Pool: active agents in the lead's domain with `agent_routing_config.is_active = true`.
   An empty pool leaves the lead unassigned (founder alert still fires — see
   `whatsapp-gupshup.md` §10).
6. INSERT the lead (`status='new'`, `status_changed_at=now()`, attribution snapshot written
   once — `{}` minimum, never SQL NULL; migration 0096 contract). Two best-effort captures ride
   the INSERT: `form_data.city` is lifted into `leads.city` (and removed from `form_data`), and
   `extractServiceInterests(form_data, domain)` fills `leads.service_interests` (unknown values
   dropped, never rejected). **Dedup-race backstop (migration 0137):** a 23505 from the
   active-phone partial UNIQUE index means a concurrent insert won the race; the error is
   caught, the existing active lead is re-read and returned with `is_duplicate: true` instead
   of failing the request.
7. Backfill `lead_id` onto the raw-payload row; INSERT `lead_created` + `agent_assigned`
   activities. Both inserts are error-checked; a failed `lead_created` insert also marks the
   raw row `ingestion_error: 'activity_insert_failed'`.
8. **Cache invalidation:** awaited `invalidateLeadCaches('ingestLead', { leadId, domain },
   { lists: true, dashboard: true })`, so the assigned agent sees the lead immediately instead
   of after the 30s list TTL. Redis failure is non-fatal (the helper warns).
9. Return `IngestionResult`: `{ success, leadId, rawPayloadId, assigned_to, agent_name,
   domain, lead_name, lead_phone, is_duplicate }`.

Notifications and SLA scheduling are **not** done here — the route's
`after(notifyLeadAssigned(...))` owns all four assignment side-effects.

## 3b. Product enquiries and the two dedup models (migration 0180)

This is the part worth understanding before touching anything in this pipeline.

The shop de-duplicates on (member, product, enquiry type). We de-duplicate on **phone**.
Those two models disagree in exactly the case a marketplace encourages: one member asking
about three different pieces. Their side is right to send three webhooks. Our phone dedup is
right to refuse to create three leads for one human.

The resolution is **one lead per person, many enquiries hanging off it**. Every enquiry is
appended to `lead_product_enquiries`, whether it created the lead or arrived against an
existing one. Before this table the second and third products were dropped into a
`duplicate_submission` activity that recorded only source, campaign, domain and raw payload
id, so an agent would ring up about a handbag while the member waited to hear about a watch.

Splitting into separate leads was considered and rejected: it would mean three agents, three
SLA timers, and one person counted three times in the pipeline.

**What each case does:**

| Case | Lead | Enquiry row | Activity | Notification |
| ---- | ---- | ----------- | -------- | ------------ |
| New person | created | written | `lead_created` + `agent_assigned` | agent WhatsApp + founder alert + SLA timers |
| Known person, new product | none, phone dedup holds | written | `duplicate_submission` carrying `product_name` and `enquiry_type` | in-app only, naming the product. No WhatsApp |
| Redelivery of a known enquiry | none | none, 23505 on `external_lead_id` | none | none, and the route returns 200 |

A redelivery has to be completely silent. The shop retries three times automatically with
1s, 4s and 9s backoff, plus unlimited manual retries from its admin panel. Without the guard
one enquiry would ping the assigned agent on every attempt.

The repeat-enquiry notification is in-app only by decision. A WhatsApp per product would
train agents to ignore the channel, and the agent already got a WhatsApp when the lead first
arrived. It rides `notifyLeadAssigned`'s optional `repeatEnquiry` input rather than a second
notification path.

**A shop payload with no external id or no product name is rejected 422**
(`ingestion_error: 'missing_product_enquiry'`). This is deliberate and loud. An enquiry with
no external id cannot be de-duplicated, and one with no product name gives the dossier card
nothing to show, so the lead would be a phone number nobody can act on. The sender writes to
its own database before delivering, so nothing is lost: the raw row is already logged and
the failure shows on /error-log where it can be fixed and re-driven.

**Product columns are a snapshot, never a reference.** The shop hard-deletes listings and
enriches at delivery time, so a lead redelivered after a deletion arrives with a null image
and a URL that 404s. The dossier card renders from the stored columns and never re-fetches
the shop URL. A dead link is honest. An empty card is not.

### Rate limiting note for the shop

The limiter is 100 requests per minute per IP, in-memory per worker. The shop runs a single
EC2 box behind a fixed Elastic IP, so all of its traffic counts as one client. Normal
enquiry volume is nowhere near the cap. The risk is their recovery sweep re-driving a
backlog of failed deliveries, which must be paced at roughly 60 per minute with a cap per
run.

## 4. Raw payload policy (security-audit F-5 — the recorded decision)

`lead_raw_payloads` retains the **full original payload including lead PII** (name, phone,
email), immutably, with admin/founder-only SELECT. `sanitizeRawPayload` strips only secret
envelope keys (`res2`), not PII. **This is deliberate:** the raw log exists to debug and replay
failed/disputed ingestions, which requires the original payload; access is restricted to the
two audit roles; rows are never updated or deleted. Revisit if a data-retention policy with
TTL/erasure obligations lands.

## 5. Failure surface

Failed ingestions set `ingestion_error` on the raw-payload row and are visible on
`/error-log` (`../pages/error-log.md`, admin/founder). The raw row is written before auth and
before validation, so every rejected request leaves a trace.
