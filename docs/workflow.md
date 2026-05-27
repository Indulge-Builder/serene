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

- Zod validation on normalized payload first — correct.
- Domain resolution: explicit `data.domain` takes precedence, then campaign prefix mapping.
- **Bug 1 fixed:** `DEFAULT_LEAD_DOMAIN` is now `'concierge'` (was `'indulge_concierge'`).
- Uses `createAdminClient()` for the DB insert and activity logs — correct (webhook has no session).
- Logs `lead_created` activity unconditionally and `agent_assigned` activity only when an agent is found — correct.
- `assigned_at` is set to `null` when no agent is found — correct.

---

### Stage 4 — Round-robin assignment `getNextRoundRobinAgent`

**Status: Clean (both bugs fixed).**

- **Bug 2 fixed:** Now uses `createAdminClient()` — not `createClient()`. Webhook context has no `auth.uid()`, so the anon client would return empty arrays from every RLS-protected query silently.
- **Bug 3 fixed (via Bug 1):** Domain values `'concierge'`, `'shop'`, `'legacy'`, `'house'`, `'b2b'` now match `profiles.domain` exactly.
- Logic: fetches active agents → filters by `agent_routing_config.is_active = true` → queries recent leads only for eligible agents → sorts by oldest `assigned_at` (nulls first) → returns top agent. Algorithm is correct.

---

### Stage 5 — Lead DB insert

**Status: Clean.**

- Admin client used — bypasses RLS correctly.
- All fields explicitly mapped — no implicit nulls.
- `form_data` stored as-is (immutable after insert per spec).

---

### Stage 6 — Server actions `src/lib/actions/leads.ts`

**Status: Clean.**

- All actions start with Zod validation — Rule 02 satisfied.
- Auth check via `getCallerProfile()` before any DB work — Rule 09 satisfied.
- Access verification done via `createClient()` (RLS-bound anon) — correct for user-session actions.
- All mutations use `createAdminClient()` — correct (bypasses the INSERT/UPDATE RLS gaps).
- `addLeadCallNote`: auto-advances `new → touched` on first call — correct per spec.
- `updateLeadStatus`: nurturing side effect creates a task + `task_gia_meta` row — correct.
- `assignLead`: clears `private_scratchpad` on reassign — correct per spec.
- All actions return `{ data, error }`, never throw — Rule 10 satisfied.

---

### Stage 7 — Access control in pages and components

**Status: Clean.**

- Dossier page and `StatusActionPanel` both perform the same access-gate logic: agent = own leads only, manager = domain match, admin/founder = all. Two-layer enforcement (page + action).
- `lead.domain` (typed `string`) compared against `profile.domain` (typed `AppDomain`) via `===` — works correctly at runtime now that the values are consistent.

---

### Stage 8 — Domain value consistency

**Status: Clean after fix.**

| Where                       | Value (before)      | Value (after)           |
| --------------------------- | ------------------- | ----------------------- |
| `CAMPAIGN_DOMAIN_MAP`       | `indulge_concierge` | `concierge`             |
| `DEFAULT_LEAD_DOMAIN`       | `indulge_concierge` | `concierge`             |
| `profiles.domain` (DB enum) | `concierge`         | `concierge` (unchanged) |
| `AppDomain` type            | `concierge`         | `concierge` (unchanged) |

All five campaign prefix → domain mappings (`TG_Global`, `TG_Shop`, `TG_Legacy`, `TG_House`, `TG_B2B`) now resolve to values that exist in the `app_domain` enum.

---

The pipeline is clean end-to-end. Incoming leads will now resolve the correct domain, find eligible agents in the correct pool, and assign correctly via round-robin.
