# Lead Ingestion (Pabbly / Meta webhook)

> **Purpose:** the inbound form-lead pipeline — webhook contract, source adapters, domain resolution, dedup, round-robin assignment, raw-payload policy.
> **Audience:** engineers. · **Source-of-truth scope:** Pipeline A (form/webhook leads). The WhatsApp-origin pipeline (Pipeline B) lives in `whatsapp-gupshup.md`; the lead lifecycle after ingestion lives in `../modules/gia.md`; notification dispatch lives in `whatsapp-gupshup.md` § Orchestrator.
> **Last verified:** 2026-07-02 against `src/app/api/webhooks/leads/route.ts`, `src/lib/services/lead-ingestion.ts`, `src/lib/leads/adapters.ts`, `src/lib/constants/campaign-domain-map.ts`, `src/lib/utils/phone.ts`.

---

## 1. Webhook contract

**Endpoint:** `POST /api/webhooks/leads?source=meta|google|website`
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
5. Bearer-token check (`PABBLY_WEBHOOK_SECRET`, timing-safe via `safeSecretCompare`) — on
   failure, mark the raw row `ingestion_error: 'unauthorized'`, return 401.
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

## 3. Inside `ingestLead()` (`src/lib/services/lead-ingestion.ts`)

1. Zod validation of the normalized payload (`leadPayloadSchema`, passthrough) — 422 +
   `ingestion_error` on failure.
2. **Domain resolution** — priority: explicit `domain` field → campaign-prefix map → default.
   `CAMPAIGN_DOMAIN_MAP` (prefix → domain): `TG_Global→onboarding`, `TG_Shop→shop`,
   `TG_Legacy→legacy`, `TG_House→house`, `TG_B2B→b2b`. Then a **Gia-only coercion**: any
   resolved domain that fails `isGiaDomain()` (including `b2b` from the map, and any free-form
   payload domain) is coerced to `DEFAULT_GIA_DOMAIN` (`'onboarding'`) with a console warn.
   A `TG_B2B` lead therefore lands in `onboarding`, not `b2b`.
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
