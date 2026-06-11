# Lead Ingestion (Pabbly / Meta webhook)

> **Purpose:** the inbound form-lead pipeline — webhook contract, source adapters, domain resolution, dedup, round-robin assignment, raw-payload policy.
> **Audience:** engineers. · **Source-of-truth scope:** Pipeline A (form/webhook leads). The WhatsApp-origin pipeline (Pipeline B) lives in `whatsapp-gupshup.md`; the lead lifecycle after ingestion lives in `../modules/gia.md`; notification dispatch lives in `whatsapp-gupshup.md` § Orchestrator.
> **Last verified:** 2026-06-11 against `src/app/api/webhooks/leads/route.ts`, `src/lib/services/lead-ingestion.ts`, `src/lib/leads/adapters.ts`, `src/lib/constants/campaign-domain-map.ts`.

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

| Adapter | Handles | Priority order |
| ------- | ------- | -------------- |
| `adaptMeta` | Meta lead ads (via Pabbly) | (1) native `field_data[{name,values}]` → (2) Pabbly `raw_meta_fields` → (3) flat top-level keys |
| `adaptGoogle` | Google Ads lead forms | `raw_google_fields` |
| `adaptWebsite` | Website forms | flat key-value payload |

All produce a typed `NormalizedLeadPayload`. `sanitizeText()` on every text field (S-02).
Phone normalisation is wrapped in try/catch and stores the raw value on failure — a webhook
lead is never rejected for an unparseable phone.

`adaptMeta` specifics: `utm_medium` ← `res3.platform` (`fb`/`ig`/`msg`/`an` — labels via
`getMetaMediumLabel()`); `utm_content` ← `res3.adset_name`; **`utm_source` is never hardcoded
to `'meta'`** — only set if the raw payload carries it.

## 3. Inside `ingestLead()` (`src/lib/services/lead-ingestion.ts`)

1. Zod validation of the normalized payload (`leadPayloadSchema`, passthrough) — 422 +
   `ingestion_error` on failure.
2. **Domain resolution** — priority: explicit `domain` field → campaign-prefix map → default.
   `CAMPAIGN_DOMAIN_MAP` (prefix → domain): `TG_Global→onboarding`, `TG_Shop→shop`,
   `TG_Legacy→legacy`, `TG_House→house`, `TG_B2B→b2b`. `DEFAULT_LEAD_DOMAIN = 'onboarding'`.
   *(No Sentry call exists — an unmatched prefix falls through with a console warn at most;
   the old "logged to Sentry" claim was drift.)*
3. **Phone dedup** via the `get_active_lead_by_phone()` RPC:
   - Active lead (new/touched/in_discussion/nurturing) → log a `duplicate_submission`
     activity on the existing lead, return success with `is_duplicate: true`,
     `assigned_to: null`. No new row.
   - Terminal lead (won/lost/junk) → create a **new** lead with `previous_lead_id` linking the
     history chain.
4. **Round-robin assignment** — `getNextRoundRobinAgent(domain)` →
   `get_next_round_robin_agent()` (migration 0007): SECURITY DEFINER,
   `SELECT FOR UPDATE SKIP LOCKED`, race-free under concurrent webhooks, O(agents).
   Pool: active agents in the lead's domain with `agent_routing_config.is_active = true`.
   An empty pool leaves the lead unassigned (founder alert still fires — see
   `whatsapp-gupshup.md` §10).
5. INSERT the lead (`status='new'`, `status_changed_at=now()`, attribution snapshot written
   once — `{}` minimum, never SQL NULL; migration 0096 contract); backfill `lead_id` onto the
   raw-payload row; INSERT `lead_created` + `agent_assigned` activities.
6. Return `IngestionResult`: `{ success, leadId, rawPayloadId, assigned_to, agent_name,
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
