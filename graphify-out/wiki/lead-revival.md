# Lead Revival (Phase R1)

> **Purpose:** Auto-revive silent leads via a nightly note-AI judgment, with everything uncertain or
> over-cap routed to a human review tab. A layer *over* leads — it **never** mutates the leads row.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md). Migration: `0119`. Full contract: `docs/modules/revival.md`.

---

## The daily sweep (`src/trigger/lead-revival.ts` → `sweepRevivalCandidatesTask`)

The project's **first scheduled cron task**. Runs **07:30 IST** (shift-open), `maxDuration` 300s.

1. **Read policies** — `getActiveRevivalPolicies()` (admin client, read per sweep, never cached). Three
   rows, one per trigger status: `touched`, `in_discussion`, `nurturing`. **Cold is NOT a trigger.**
   Each row: `silence_days` (seed 60/60/90), `daily_cap_per_agent` (seed 25), `active`.
2. **Find silent leads per status** — `findSilentLeadsForStatus(status, silenceDays)`: leads in that
   status whose `status_changed_at` (fallback `last_activity_at`) is older than the threshold; anti-joined
   against open `revival_candidates`; excludes archived + unassigned; bounded at 200/status, oldest first.
3. **Judge each lead** — `judgeLeadForRevival({ leadId, triggerStatus })` (the note-AI gate, below).
4. **Branch on verdict:**
   - **`unsure` (or any gate error)** → `insertRevivalCandidate({ status: 'open', verdict: 'unsure' })`
     → lands in the **review tab**.
   - **`revive` + under cap** → `countAutoRevivesToday(agentId)` (fails CLOSED to Infinity on error) →
     `reviveLeadCore(...)` → `insertRevivalCandidate({ status: 'actioned', resolved_by: null })` →
     decrement the local per-agent cap tracker.
   - **`revive` + cap reached** → `insertRevivalCandidate({ status: 'open' })` (overflow → review, never dropped).

Idempotent: daily cron + the one-open guard + a partial UNIQUE index make re-runs safe.

---

## The suppression gate (`src/lib/services/revival-gate.ts` → `judgeLeadForRevival`)

One structured LLM call, **reusing the Elaya stack** — no new SDK import, no tools.

1. `getLeadNotesFull(leadId)` → `buildRevivalNotesBlob` (≤12 notes, ≤6000 chars).
2. `maskPii(blob, depth)` (the Elaya PII layer, D-01).
3. `resolveLlmForJob('routing')` (Haiku-tier) → single-shot JSON. The **suppression bias lives in the
   inline system prompt**: own-network / "only wanted details" / affordability-dead / pure-NR / explicit
   rejection / empty notes → `unsure`. Real warm signal + neglect, or a soft/timing objection → `revive`.
4. `parseGateVerdict` — tolerant parse (strips code fences, extracts first `{…}`); **trusts only the
   exact string `"revive"`** — everything else becomes `unsure`.
5. **Fails CLOSED to `unsure`** on empty notes, malformed parse, or any throw (`FALLBACK_UNSURE`). A
   glitch never auto-revives.

---

## The revive path (`reviveLeadCore` in `src/lib/services/lead-mutations.ts`)

**Invariant: revival NEVER touches the leads row** (no status change, no column write). It is a
task-only side-effect.

1. `createLeadTaskCore(...)` — the **E2 path verbatim** (same `create_lead_gia_task` RPC, same cache
   invalidation, same Trigger.dev reminder, same SLA side-effects).
2. Two best-effort marker writes (failure is non-fatal, never orphans the revive):
   `tasks.title = "Revived…"` and `task_gia_meta.call_outcome = 'revived'` — the **"Revived" badge key**.

Two callers, identical core: `reviveLeadAction` (manual, session caller via `ReviveLeadButton`) and the
sweep task (auto, admin context).

---

## The review surface

- **Predicate:** `/leads?revival=true` → `getOpenCandidatesForCaller(sessionClient)` (RLS-scoped: agent
  sees own, manager sees domain) → `Map<leadId, OpenCandidateLite>`, reusing `LeadsTable`.
- **`RevivalReviewBanner`** above the table: per-candidate reasoning + suggested date + Revive / "Not now".
- **`RevivalDossierAction`** on the dossier (async, `<Suspense fallback={null}>`): renders only when an
  open candidate exists for that lead.
- **Resolve-once flip:** `reviveLeadAction` → core + `markCandidateResolved(id, 'actioned', caller)`;
  `dismissRevivalCandidateAction` → `markCandidateResolved(id, 'dismissed', caller)`. The UPDATE is
  `WHERE status = 'open'` — idempotent; a second call is a no-op.

---

## Tables (migration 0119)

| Table | Holds |
|---|---|
| `revival_candidates` | ledger: `lead_id`, `assigned_to` (denormalised, for daily-cap count), `verdict` (revive/unsure), `ai_reasoning`, `trigger_status`, `status` (open/actioned/dismissed), `resolved_at/by`, `suggested_revive_at`. Partial UNIQUE `(lead_id) WHERE status='open'` = the one-open guard. |
| `revival_policies` | config: `trigger_status` PK, `silence_days`, `daily_cap_per_agent`, `active`. Read per sweep. |

---

## Invariants / gotchas

- **Never mutates the leads row** — the single most important invariant. Status changes go through
  `updateLeadStatus`, never revival.
- **One open candidate per lead** — enforced by the partial UNIQUE index; insert race → 23505 swallowed,
  existing row stands.
- **Daily cap is per-agent-per-day at IST midnight** — `countAutoRevivesToday` uses `toISTMidnight()`,
  native `.eq('assigned_to')` (NOT a leads embed — `head:true` would drop it), plus a local per-run tracker.
- **Gate fails closed** — only the exact verdict `"revive"` produces a task; all uncertainty → review.
- **Cold is not a trigger status** — `REVIVAL_TRIGGER_STATUSES = ['touched','in_discussion','nurturing']`.
- **No second LLM integration** — reuses `resolveLlmForJob('routing')` + `maskPii` wholesale (R-01).
- **Review predicate uses the SESSION client** (RLS), not admin.

---

## File map

| File | Role |
|---|---|
| `src/trigger/lead-revival.ts` | Daily sweep: policies → silence → judge → cap → revive/review |
| `src/lib/services/revival-service.ts` | Candidates ledger + silence finder + policy reads (admin) |
| `src/lib/services/revival-gate.ts` | Note-AI judgment gate, routing-tier LLM, masking, fail-closed |
| `src/lib/services/lead-mutations.ts` | `reviveLeadCore` (wraps `createLeadTaskCore` + markers) |
| `src/lib/actions/revival.ts` | `reviveLeadAction`, dismiss, policy update |
| `src/lib/constants/revival.ts` | Trigger statuses, seed defaults, task markers, gate tuning |
| `src/lib/validations/revival-schema.ts` | Zod schemas for revive/dismiss/policy update |
| `src/lib/types/revival.ts` | Hand-declared row types |
| `src/components/leads/ReviveLeadButton.tsx` | One revive action, two mounts (review + dossier) |
| `src/components/leads/RevivalReviewBanner.tsx` | Review-tab banner above reused `LeadsTable` |
| `src/components/leads/RevivalDossierAction.tsx` | Dossier inline candidate card (async, conditional) |
| `src/components/settings/RevivalPoliciesPanel.tsx` | Settings editor: silence days / cap / active per status |
