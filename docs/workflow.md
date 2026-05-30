## Full Lead Pipeline Audit

### Stage 1 — Webhook entry `POST /api/webhooks/leads`

**Status: Clean.**

- Rate limiting on IP before anything else — correct.
- Bearer token validated before body is read — correct (Rule S-12).
- Source query param defaults to `'website'` — correct.
- Returns 201 with `leadId` on success — correct.

---

### Stage 2 — Source adapter `src/lib/leads/adapters.ts`

**Status: Clean.**

- All three adapters (meta, google, website) produce a typed `NormalizedLeadPayload`.
- Phone normalisation wrapped in try/catch — stores raw on failure rather than rejecting (good defensive fallback for webhooks).
- `sanitizeText()` applied to all text fields — correct.
- `splitName()` handles full_name → first/last correctly.
- Legacy field formats (Meta's `raw_meta_fields`, Google's `raw_google_fields`) are handled.

---

### Stage 3 — Lead ingestion `src/lib/services/lead-ingestion.ts`

**Status: Clean.**

- Raw payload logged as step 1 (non-fatal — logging failure never blocks a lead).
- Zod validation on normalized payload first — correct.
- Domain resolution: explicit `data.domain` takes precedence, then campaign prefix mapping.
- `DEFAULT_LEAD_DOMAIN` is `'concierge'` (not `'indulge_concierge'` — this was fixed).
- Uses `createAdminClient()` for the DB insert and activity logs — correct (webhook has no session).
- Logs `lead_created` activity unconditionally and `agent_assigned` activity only when an agent is found — correct.
- `assigned_at` is set to `null` when no agent is found — correct.
- Dedup by phone: active lead → `duplicate_submission` activity, return existing `leadId`. Terminal lead → new lead with `previous_lead_id` FK.

---

### Stage 4 — Round-robin assignment `get_next_round_robin_agent()`

**Status: Clean — atomic DB function.**

- DB-level `SELECT FOR UPDATE SKIP LOCKED` on `agent_routing_config` — race-free under concurrent webhooks.
- O(agents) not O(leads) — `MAX(assigned_at) GROUP BY` subquery.
- Domain values `'concierge'`, `'shop'`, `'legacy'`, `'house'`, `'b2b'` match `profiles.domain` enum exactly (was `'indulge_concierge'` — fixed).
- Two-step fallback for agents without a routing config row.

---

### Stage 5 — Lead DB insert

**Status: Clean.**

- Admin client used — bypasses RLS correctly.
- All fields explicitly mapped — no implicit nulls.
- `form_data` stored as-is (immutable after insert per spec).
- `status_changed_at` and `last_activity_at` set on insert (migration 0027).

---

### Stage 6 — Server actions `src/lib/actions/leads.ts`

**Status: Clean.**

- All actions start with Zod validation — Rule S-01 satisfied.
- Auth check via `getCurrentProfile()` (canonical import from `profiles-service.ts`, not a local duplicate) before any DB work — Rule A-09 satisfied.
- Access verification done via `createClient()` (RLS-bound anon) — correct for user-session actions.
- All mutations use `createAdminClient()` — correct.
- `addLeadCallNote`: delegates to `add_lead_call_note` RPC (single transaction — 9 sequential awaits collapsed). SLA side-effects (timer scheduling) remain in action layer.
- `updateLeadStatus`: delegates to `update_lead_status` RPC (single transaction — 5 sequential awaits collapsed). Won notifications and SLA side-effects remain in action layer.
- `assignLead`: pre-update `SELECT status, domain` before the UPDATE; no post-update SELECT (zero extra round-trips). Clears `private_scratchpad` on reassign — correct per spec.
- All actions return `{ data, error }`, never throw — Rule Q-03 satisfied.

---

### Stage 7 — Access control in pages and components

**Status: Clean.**

- Dossier page and `StatusActionPanel` both enforce: agent = own leads only, manager = domain match, admin/founder = all. Two-layer enforcement (page + action).
- `lead.domain` (typed `string`) compared against `profile.domain` (typed `AppDomain`) via `===` — works correctly at runtime because domain values are consistent.

---

### Stage 8 — Domain value consistency

**Status: Clean.**

| Where | Value |
| ---- | ----- |
| `CAMPAIGN_DOMAIN_MAP` | `concierge`, `shop`, `legacy`, `house`, `b2b` |
| `DEFAULT_LEAD_DOMAIN` | `concierge` |
| `profiles.domain` (DB enum) | `concierge` (unchanged) |
| `AppDomain` type | `concierge` (unchanged) |

All five campaign prefix → domain mappings (`TG_Global`, `TG_Shop`, `TG_Legacy`, `TG_House`, `TG_B2B`) resolve to values that exist in the `app_domain` enum.

---

### Stage 9 — SLA Engine hook points

**Status: Clean.**

- `assignLead` + `createManualLead`: after assignment, updates `status_changed_at` + `last_activity_at`, then schedules SLA-01 timers (fire-and-forget, non-blocking).
- `updateLeadStatus`: after status write, cancels existing timers; terminal status (`won`, `lost`, `junk`) → cancel only; non-terminal → cancel then reschedule for new status.
- `addLeadCallNote`: after note write, updates `last_activity_at`; if auto-advanced `new → touched` → full SLA reset; otherwise → refreshes SLA-02/03 timers only (SLA-01 never reset by activity).
- Stale-fire guard: `fireLeadSlaTask` re-reads lead status from DB on execution; exits cleanly with `outcome: 'stale_fire'` if status has changed.
- Idempotency key: `lead-sla-${leadId}-${ruleCode}` — Trigger.dev deduplicates DELAYED runs. Double-scheduling is structurally impossible.

---

### Stage 10 — Lead list and filters

**Status: Clean.**

- Suspense-split architecture: `LeadsFilters` (stable, client) + `LeadsTableAsync` (Suspense child, server).
- `getLeadsByRole` returns `{ leads: Lead[], totalCount: number }` — never `Lead[]` alone.
- `totalCount` from `{ count: 'exact', head: false }` on the same query builder that has all constraints applied — one round trip, never two.
- Every URL param push that changes a filter deletes the `page` param (enforced in `buildParams()`).
- Server-side search: `.or(first_name.ilike, last_name.ilike, phone.ilike, email.ilike)` — 500ms debounce in `LeadsFilters`, `idx_leads_phone_text` index.
- Column visibility: `useLeadColumnPreferences(userId)` — localStorage key `eia:leads:columns:${userId}:v1`; 11 columns; `status` and `name` locked.

---

The pipeline is clean end-to-end. All known bugs from the original audit have been resolved. The SLA Engine, atomic round-robin, lead dedup, column picker, server-side search, and RPC consolidations are all in production state.
