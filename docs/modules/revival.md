# Lead Revival

> **Purpose:** recover dormant-but-warm leads that silently died. A thin layer over the
> existing follow-up engine + Elaya provider + lead-mutation cores — **not** a new stack.
> **Audience:** engineers. · **Source-of-truth scope:** revival architecture + contracts.
> **Status:** Phase R1 (silence detection → AI suppression gate → confident auto-revive vs.
> human review). Shipped 2026-06-14.

## What it is

Silence detection finds leads that have gone quiet past a per-status threshold. A cheap LLM
**suppression gate** (the Elaya `routing`/Haiku provider) reads the lead's recent notes and
returns `revive` / `unsure` + reasoning + a suggested revive date. **The gate's job is mostly
suppression — it errs toward not-revive.**

- **Confident `revive`** → a normal assigned follow-up task badged **"Revived"**, created through
  the **exact E2/E3 auto-task path** (`createLeadTaskCore`), so it inherits cache invalidation,
  activity logging, SLA rails, and the Trigger.dev reminder identically. The candidate row is
  marked `actioned`.
- **Everything else (`unsure`, or confident revivals over the daily cap)** → an **open** candidate
  in the **review tab**, where a manager or the lead's agent revives manually.

**Revival is a LAYER over leads. It NEVER mutates the lead's own `status` or columns.** The lead
keeps its terminal/dormant status; revival adds a task + a candidate ledger row only.

## The hard reuse contracts (sign-off invariants — never weaken)

1. **Revive task = the E2 path, wholesale.** Both the auto-revive (sweep) and the manual Revive
   button call `createLeadTaskCore` (`lib/services/lead-mutations.ts`) — the SAME core the Elaya
   `create_lead_task` write tool and the SLA cadence ticks use. New = a `module='gia'` follow-up
   task tagged `revived` (via `task_gia_meta.call_outcome = 'revived'` marker + the "Revived"
   badge), plus a `revival_candidates` ledger row. **No new task-creation logic.**
2. **Note-AI gate = the Elaya provider/PII layer, reused.** `resolveLlmForJob('routing')` →
   `adapter.complete()` with a system prompt + one user message + **no tools** → parse the JSON
   verdict. Notes pass through `maskPii(notes, await getPiiMaskingDepth())` before the model
   (D-01, foundation invariant 5). **No second LLM integration, no new provider call.**
3. **Silence detection extends the existing scheduling machinery (Trigger.dev).** One new daily
   `schedules.task` (`src/trigger/lead-revival.ts`) queries for silent leads past threshold with no
   open candidate, then runs the gate per lead. Idempotency is date-scoped
   (`revival-sweep-${IST-date}`), mirroring the cadence-tick convention. **No parallel scheduler.**
4. **Review tab = the existing lead table + filters, reused.** A new `revival` URL predicate on
   `/leads` (a chip like `going_cold`) filters the list to leads with an OPEN candidate. The
   predicate resolves candidate `lead_id`s first (indexed `WHERE status='open'`), then
   `.in('id', ids)` on the leads query; when active, the total is derived from the resolved set
   length (the status-counts RPC is bypassed for this predicate — it cannot express a cross-table
   subquery and must not be forced to, C-1). **No new list component, no second dossier.**
5. **Revive button = one component, two mount points.** `<ReviveLeadButton>` mounts in the
   review-context column of `LeadsTable` AND on the dossier. **Never two implementations.**

## Schema (migration 0119)

### `revival_candidates` — the candidate ledger (append-only-ish state machine)

| Column | Notes |
| --- | --- |
| `id` uuid pk | |
| `lead_id` uuid → leads | |
| `assigned_to` uuid → profiles | the lead's assignee at creation, **denormalised** so the daily-cap count is a native column filter (a PostgREST embed filter is silently dropped on a `head:true`/`count` query — the `getNextLeadTask` caveat) |
| `verdict` text | `'revive'` \| `'unsure'` (CHECK) — the gate's call |
| `ai_reasoning` text | the gate's reasoning (shown beside the candidate) |
| `status` text | `'open'` \| `'actioned'` \| `'dismissed'` (CHECK), default `'open'` |
| `suggested_revive_at` timestamptz | the gate's suggested timing (nullable) |
| `trigger_status` text | the lead status that tripped silence (`touched`/`in_discussion`/`nurturing`) |
| `created_at` timestamptz | |
| `resolved_at` / `resolved_by` | set on the `open → actioned/dismissed` flip |

- **RLS scoped by role/domain LIKE leads** via `EXISTS (SELECT 1 FROM leads l WHERE l.id =
  revival_candidates.lead_id AND <role/domain predicate>)` — the same pattern as
  `lead_activities`/`lead_notes`. SELECT only; **no user INSERT/UPDATE/DELETE policy** (A-11).
- **State-machine carve-out (A-11, the elaya_actions precedent):** writes are service-role
  admin-client only. The `open → actioned/dismissed` flip is a resolve-once admin UPDATE
  (RLS-bypassing). `verdict`/`ai_reasoning`/`lead_id`/`created_at` are write-once; only the
  resolution fields move, and only forward. Documented in the migration COMMENT.
- **One-open-candidate-per-lead guard (structural):** a partial UNIQUE index
  `idx_revival_candidates_one_open (lead_id) WHERE status='open'` — a lead can never hold two open
  candidates at once. Plus the partial index `idx_revival_candidates_open (status) WHERE
  status='open'` serving the review-predicate lookup.

### `revival_policies` — config (the sla_policies pattern)

One row per silenceable status, admin/founder editable from /settings.

| Column | Seed |
| --- | --- |
| `trigger_status` text pk | `touched` (60d) · `in_discussion` (60d) · `nurturing` (90d) |
| `silence_days` int | editable thresholds above |
| `daily_cap_per_agent` int | 25 (same value on every row; the cap is per-agent-per-day) |
| `active` bool | true |
| `created_at` / `updated_at` | `update_updated_at` trigger |

RLS: admin/founder SELECT only; service-role writes (sla_policies pattern). Read **per sweep run,
never module-cached** (sla_policies convention).

**Cold is out of scope as a trigger** — only `touched`/`in_discussion`/`nurturing` rows exist.

## The daily sweep (`src/trigger/lead-revival.ts`)

```text
schedules.task (cron, daily ~07:30 IST) ─► sweepRevivalCandidatesTask
   1. read revival_policies (active rows, per run)
   2. per trigger_status: find leads in that status whose status_changed_at/last_activity_at
      is older than silence_days AND have NO open revival_candidate (anti-join the partial index)
      — Cold excluded; terminal (won/lost) excluded; archived excluded
   3. per candidate lead: read recent notes (getLeadNotesFull) → maskPii → routing gate
      → { verdict, reasoning, suggested_revive_at }
        • suppressed/'unsure'        → INSERT candidate status='open' (review tab)
        • confident 'revive' + under the agent's daily cap
                                     → createLeadTaskCore (Revived task) + INSERT candidate 'actioned'
        • confident 'revive' + cap reached
                                     → INSERT candidate status='open' (overflow falls to review,
                                       never dropped, never auto-tasked)
```

- **Daily cap (25/agent, editable):** counted from `revival_candidates` rows that became
  `actioned` (auto-task, `resolved_by IS NULL`) for the agent since IST midnight, via the
  **denormalised `assigned_to` column** (`countAutoRevivesToday` — a native `.eq('assigned_to', …)`
  filter, never a leads embed). The per-run budget is seeded once per agent then decremented
  locally, so a single run also respects the cap. Cap reached → overflow to `open` (review), per
  sign-off decision.
- **Junk-suppression bias:** the gate's system prompt is explicit — own-network leads, "only
  wanted details", affordability-dead, pure-NR-no-conversation → `unsure` (never an agent task);
  `unsure` always lands in review, never on an agent's plate. A malformed/throwing gate response
  fails closed to `unsure`.
- **The one-open-candidate guard + the daily cap both hold:** step 2's anti-join means a lead with
  a live open candidate is skipped entirely (no second candidate); the partial UNIQUE index is the
  DB backstop. The cap throttles auto-tasks.

## File map (what's new vs. reused)

| Concern | New | Reused (never duplicated) |
| --- | --- | --- |
| Task creation | "Revived" badge + `revived` source marker | `createLeadTaskCore` (E2/E3 path) |
| AI gate | `lib/services/revival-gate.ts` (one structured call) | Elaya `resolveLlmForJob`/`adapter.complete`/`maskPii` |
| Scheduling | `src/trigger/lead-revival.ts` (1 daily `schedules.task`) | Trigger.dev (no parallel scheduler) |
| Candidate ledger | `lib/services/revival-service.ts` + `revival_candidates` | `mapRows`, admin client, append-only convention |
| Review view | `revival` URL predicate + review column | `LeadsTable`/`LeadsFilters`/`FilterBar`/pagination/`getLeadsByRole` |
| Revive action | `<ReviveLeadButton>` + `reviveLeadAction` | `createLeadTaskCore`, `requireProfile`, `ActionResult` |
| Settings | `RevivalPoliciesPanel` + `revival-policies` action/schema | SlaPoliciesPanel optimistic-save pattern, /settings page |

## Constants

`src/lib/constants/revival.ts` — `REVIVAL_TRIGGER_STATUSES` (`touched`/`in_discussion`/`nurturing`),
default `silence_days`/`daily_cap`, `REVIVAL_TASK_SOURCE = 'revived'`, `REVIVED_TASK_TITLE`, the
gate verdict vocabulary (`'revive'`/`'unsure'`), and `REVIVAL_CANDIDATE_STATUS`
(`open`/`actioned`/`dismissed`). Pure data, no DB deps.
