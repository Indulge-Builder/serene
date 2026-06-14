# Leads

> **Purpose:** Lead lifecycle from webhook ingestion → round-robin assignment → dossier → the four
> mutation cores (note, status, assign, task), with dual-key Redis caching and SLA-timer integration.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## Entry points & data flow

1. **Ingestion** — `POST /api/webhooks/leads?source=meta|google|website`: rate-limit → log raw payload
   immediately → bearer-token check → `ingestLead()` (`lead-ingestion.ts`): adapter normalize → Zod →
   dedup by phone identity → `getNextRoundRobinAgent(domain)` → INSERT + `extractServiceInterests`. Then,
   **inside `after()`**, `notifyLeadAssigned()` (agent + founder WhatsApp, in-app notify, SLA schedule).
2. **Round-robin** — `getNextRoundRobinAgent(domain)`: reads `agent_routing_config` (active), advances the
   per-domain cursor in `agent_rotation_state`, returns the next agent UUID or null.
3. **Dossier read** — `getLeadBySlug(slug)` / `getLeadById(id)`: dual-key cache (`leadRowSlug` +
   `leadRowId`, 120s), joins assignee.
4. **The four mutation cores** (`lead-mutations.ts`) — each wraps one RPC + invalidation:
   - `addLeadNoteCore` → `add_lead_plain_note` RPC → invalidate notes + activities.
   - `updateLeadStatusCore` → `update_lead_status` RPC → terminal (won/lost/junk) cancels SLA timers, else reschedules.
   - `assignLeadCore` → `assign_lead` RPC → returns a `notifyLeadAssigned` input → invalidate row + lists.
   - `createLeadTaskCore` → `create_lead_gia_task` RPC → schedule Trigger.dev reminder → invalidate dashboard task cache.
   - (`reviveLeadCore` — see [lead-revival.md](lead-revival.md) — wraps `createLeadTaskCore` + markers.)
5. **Action wrappers** (`actions/leads.ts`) — `requireProfile()` → access check → core → `await
   invalidateLeadCaches(...)` → `revalidatePath()` → `after(notifyLeadAssigned)`. `addLeadCallNote` also
   auto-advances new→touched and arms the cadence tick **after** the SLA schedule settles.

---

## Canonical helpers (reuse, never fork)

- `invalidateLeadCaches(site, { leadId, slug, domain }, scope)` — the only lead cache-invalidation path.
- The four cores in `lead-mutations.ts` — both `actions/leads.ts` AND Elaya write tools call the same core.
- `getNextRoundRobinAgent(domain)`, `getAssignableUsers({ domain?, agentsOnly? })`,
  `notifyLeadAssigned(input)`, `extractServiceInterests(formData, domain)`.

---

## Key tables

| Table | Holds |
|---|---|
| `leads` | core row: `slug`, name, `phone` (dedup key), `domain`, `assigned_to`, `status`, `call_count`, `last_call_outcome`, `last_activity_at`, `status_changed_at`, `source`/`medium`/`utm_campaign`, `attribution` jsonb (write-once), `city`, `service_interests` text[], `form_data` jsonb (immutable), `personal_details` jsonb, `previous_lead_id` (returning-prospect chain), `archived_at` |
| `lead_notes` | append-only; `lead_id`, `author_id`, `content` (sanitized) |
| `lead_activities` | append-only audit trail; `action_type`, `details` jsonb |
| `lead_raw_payloads` | webhook audit; raw `payload`, `ingestion_error`, backfilled `lead_id` |
| `agent_routing_config` | round-robin filter: `agent_id`, `is_active`, shift fields |
| `agent_rotation_state` | one row per domain; round-robin cursor |

---

## Invariants / gotchas

- **Dual-key cache.** A lead row lives under both `leadRowSlug(slug)` and `leadRowId(leadId)`. Deleting one
  is a silent no-op on dossier reloads — `invalidateLeadCaches` always does both.
- **Await before revalidate** (P-08) — all Redis dels settle before `revalidatePath`.
- **Dedup by phone identity** — active statuses dedup; terminal statuses allow a new lead with a
  `previous_lead_id` chain. Webhook dedup returns the existing lead, no re-assignment.
- **Cadence ordering** — in `addLeadCallNote`, `armCadenceForOutcome` must run AFTER the schedule/refresh
  settle, or the cancel-all sweep kills the freshly-armed tick.
- **Append-only logs** — `lead_notes` / `lead_activities` have no UPDATE/DELETE (Rule 08).
- **Attribution snapshot is write-once** — captured at INSERT, never updated.

---

## File map (spine)

| File | Role |
|---|---|
| `src/lib/services/leads-service.ts` | Lead queries: row, list, search, round-robin, campaign metrics |
| `src/lib/services/lead-mutations.ts` | The 4 mutation cores (+ revive) |
| `src/lib/services/lead-cache.ts` | `invalidateLeadCaches` — dual-key + scope-flag invalidation |
| `src/lib/services/lead-ingestion.ts` | Webhook adapter, dedup, round-robin, INSERT pipeline |
| `src/lib/leads/adapters.ts` | Per-source payload → normalized lead adapters |
| `src/lib/services/agent-routing-service.ts` | Routing-config queries (active/shift) |
| `src/lib/services/lead-assignment-notify.ts` | `notifyLeadAssigned` — post-assignment side-effects |
| `src/lib/actions/leads.ts` | Session actions: call note, note, status, assign, manual lead, task, export, search |
| `src/app/api/webhooks/leads/route.ts` | Webhook POST: rate-limit, log, token, ingest, notify |
| `src/components/leads/LeadsTable.tsx` | Paginated table; status/agent/date filters; column picker |
| `src/components/leads/CalledModal.tsx` | Call-note form (outcome, dictation) → `addLeadCallNote` |
| `src/components/leads/LeadNotesInput.tsx` | Plain-note composer (dictation) → `addLeadNote` |
| `src/components/leads/LeadInfoCard.tsx` | Dossier identity card |
