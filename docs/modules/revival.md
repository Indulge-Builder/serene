# Lead Revival

> **Purpose:** recover dormant-but-warm leads that silently died. A thin layer over the
> existing follow-up engine + Elaya provider + lead-mutation cores — **not** a new stack.
> **Audience:** engineers. · **Source-of-truth scope:** revival architecture + contracts.
> **Status:** Phase R1 (silence detection → AI suppression gate → confident auto-revive vs.
> human review). Shipped 2026-06-14. · **Last verified:** 2026-07-02 (full-tree audit; held up end to end).

## What it is

Silence detection finds leads that have gone quiet past a per-status threshold. A cheap LLM gate
(the Elaya `routing`/Haiku provider) reads the lead's recent notes and returns one of **three
verdicts** + reasoning. **The gate is suppression-biased against `revive`, but it must COMMIT on
dead leads (`dismiss`) instead of draining them into `unsure` and clogging review.**

- **`revive`** (the high bar — a genuine warm signal that died from neglect) → a normal assigned
  follow-up task badged **"Revived"**, created through the **exact E2/E3 auto-task path**
  (`createLeadTaskCore`), so it inherits cache invalidation, activity logging, SLA rails, and the
  Trigger.dev reminder identically. The candidate row is `actioned`. (Cap-overflow revivals fall to
  the review tab as an **open** candidate — never dropped.)
- **`dismiss`** (confident junk — an agent already recorded a disqualifier: not-a-prospect,
  doesn't-need-us, affordability-dead, only-wanted-details, standing-unreachable-wall) → a candidate
  row written **`status = 'dismissed'` at creation**. It is the audit/training log; the review tab
  filters `status='open'`, so a dismissed candidate **NEVER surfaces for a human**. No task, no
  review. This is the verdict added 2026-06-14 so confident junk stops clogging `unsure`.
- **`unsure`** (the genuinely ambiguous middle — warm-but-stalled, soft signal, disconnected-unclear,
  too thin to judge) → an **open** candidate in the **review tab**, where a manager or the lead's
  agent decides manually. A warm lead is NEVER auto-dismissed — it goes to `unsure`.

A malformed/throwing gate response **fails closed to `unsure`** — a glitch never auto-revives AND
never auto-dismisses; it goes to a human. (`dismiss` is the gate VERDICT; `dismissed` is the
candidate STATUS the verdict writes — distinct values.)

**Revival is a LAYER over leads. It NEVER mutates the lead's own `status` or columns.** The lead
keeps its terminal/dormant status; revival adds a task + a candidate ledger row only.

**Judge-once:** the silence finder anti-joins leads that already hold a candidate of **any** status
(open/actioned/dismissed) — a judged lead is never re-judged, so a `dismissed` lead doesn't re-enter
the pool nightly, get re-dismissed, and pile up duplicate rows + burn a gate call. Since **migration
0128** this anti-join runs **in SQL** (`get_silent_leads_for_revival` — a bounded `NOT EXISTS`,
scope-param/EXECUTE-revoked, admin-client only); the prior Node version SELECTed every candidate
`lead_id` into a JS Set and inflated the leads LIMIT by its size — both growing unbounded with the
ledger. Semantics are byte-identical.

## The hard reuse contracts (sign-off invariants — never weaken)

1. **Revive task = the E2 path, wholesale.** Both the auto-revive (sweep) and the manual Revive
   button call `createLeadTaskCore` (`lib/services/lead-mutations.ts`) — the SAME core the Elaya
   `create_lead_task` write tool and the SLA cadence ticks use. New = a `module='gia'` follow-up
   task tagged `revived` (via `task_gia_meta.call_outcome = 'revived'` marker + the "Revived"
   badge), plus a `revival_candidates` ledger row. **No new task-creation logic.**
2. **Note-AI gate = the Elaya provider/PII layer, reused.** `resolveLlmForJob('routing')` →
   `adapter.complete()` with a system prompt + one user message + **no tools** → parse the JSON
   verdict (`revive`/`dismiss`/`unsure`). Notes pass through `maskPii(notes, await getPiiMaskingDepth())`
   before the model (D-01, foundation invariant 5). **No second LLM integration, no new provider call.**
   The parser honours only the three exact verdict strings; anything else collapses to `unsure`
   (the safe middle — never auto-revive, never auto-dismiss on a garbled verdict). The
   `judgeNotesForRevival(blob, status, maskingDepth)` core is extracted from the DB-reading
   `judgeLeadForRevival` so the judgment can be re-tested on arbitrary notes — see the calibration
   eval below.
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
| `verdict` text | `'revive'` \| `'unsure'` \| `'dismiss'` (CHECK) — the gate's three-way call. NOTE: `dismiss` is the VERDICT; `dismissed` is the STATUS it writes |
| `ai_reasoning` text | the gate's reasoning (shown beside the candidate in review) |
| `status` text | `'open'` \| `'actioned'` \| `'dismissed'` (CHECK), default `'open'`. A `dismiss` verdict writes `status='dismissed'` at creation (resolved-once, system, `resolved_by` null) |
| `suggested_revive_at` timestamptz | the gate's suggested timing (nullable; only set for `revive`) |
| `trigger_status` text | the lead status that tripped silence (`touched`/`in_discussion`/`nurturing`) |
| `created_at` timestamptz | |
| `resolved_at` / `resolved_by` | set on the flip to `actioned`/`dismissed` (system writes stamp `resolved_at`, `resolved_by` null; a human review fills `resolved_by`) |

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
      is older than silence_days AND have NO revival_candidate of ANY status (judge-once anti-join)
      — Cold excluded; terminal (won/lost) excluded; archived excluded
   3. per candidate lead: read recent notes (getLeadNotesFull) → maskPii → routing gate
      → { verdict, reasoning, suggested_revive_at }
        • 'dismiss' (confident junk)  → INSERT candidate status='dismissed' (audit log; NOT review)
        • 'unsure' (ambiguous middle) → INSERT candidate status='open' (review tab)
        • 'revive' + under the agent's daily cap
                                      → createLeadTaskCore (Revived task) + INSERT candidate 'actioned'
        • 'revive' + cap reached      → INSERT candidate status='open' (overflow → review,
                                        never dropped, never auto-tasked)
```

- **Daily cap (25/agent, editable):** counted from `revival_candidates` rows that became
  `actioned` (auto-task, `resolved_by IS NULL`) for the agent since IST midnight, via the
  **denormalised `assigned_to` column** (`countAutoRevivesToday` — a native `.eq('assigned_to', …)`
  filter, never a leads embed). The per-run budget is seeded once per agent then decremented
  locally, so a single run also respects the cap. Cap reached → overflow to `open` (review), per
  sign-off decision.
- **Three-verdict suppression:** the gate's system prompt makes `dismiss` the home for confident
  junk an agent already disqualified (not-a-prospect, doesn't-need-us, affordability-dead,
  only-wanted-details, standing-unreachable-wall) — these stop draining into `unsure` and clogging
  review. `unsure` is reserved for the ambiguous middle (warm-but-stalled, soft-signal,
  disconnected-unclear). A warm lead is NEVER auto-dismissed. A malformed/throwing response fails
  closed to `unsure` (never auto-revive AND never auto-dismiss).
- **The judge-once guard + the daily cap both hold:** step 2's anti-join is on a candidate of ANY
  status, so a judged lead (open/actioned/dismissed) is never re-judged — no duplicate dismissals,
  no wasted gate call. The partial UNIQUE `(lead_id) WHERE status='open'` is the DB backstop for the
  one-open race. The cap throttles auto-tasks.
- **`dismiss` never leaks into review:** all three review reads (`getRevivalCandidateLeads`,
  `getOpenCandidatesForCaller`, `getOpenCandidateForLead`) filter `.eq('status','open')`; a
  `dismissed` candidate is never `open`, so it is structurally excluded from every review surface.

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
default `silence_days`/`daily_cap`, `REVIVAL_TASK_MARKER = 'revived'`, `REVIVED_TASK_TITLE`, the
gate verdict vocabulary `REVIVAL_VERDICTS` (`'revive'`/`'unsure'`/`'dismiss'`), and
`REVIVAL_CANDIDATE_STATUSES` (`open`/`actioned`/`dismissed`). Pure data, no DB deps.

## Calibration eval — the regression check (`scripts/test-revival-gate.ts`)

`scripts/test-revival-gate.ts` runs a hardcoded set of example notes through the REAL gate + REAL
routing model (no mock) via the extracted `judgeNotesForRevival` core. It is the regression check for
the verdict behaviour — run it after any prompt/parser change. (Needs a `server-only` shim to load
the gate module under plain `tsx` — the run block is in the script header.)

**2026-06-14 calibration — the three-verdict change moved the distribution off "11 unsure":**

| # | Lead (note shape) | Verdict | Why |
| --- | --- | --- | --- |
| 1 | Repeat NR, no conversation ever | **dismiss** | standing unreachable wall, no engagement |
| 2 | School teacher, doesn't recall ad | **dismiss** | no recollection / no buying signal |
| 3 | Own network, doesn't need us | **dismiss** | explicit "doesn't need our services" |
| 4 | Kartik — warm, then "on hold" | **unsure** | real interest + life-event delay — NOT auto-dismissed |
| 5 | Betul — affordability-dead | **dismiss** | "4L not affordable", soft "when rich" is not intent |
| 6 | Call not connecting | **dismiss** | unreachable, no conversation ever |
| 7 | Vivek — "will get back", vague | **unsure** | soft commitment, no timeline |
| 8 | Ratlam — "onboard in 3-4 months" | **revive** | explicit future intent with a window (the revive bar held) |
| 9 | Girijatmak — "reach out when ready" | **unsure** | disconnected, unclear |
| 10 | Nitika — incoming calls barred | **dismiss** | standing wall, no engagement |
| 11 | Richa — NR, sent video/brochure | **unsure** | effort made, no response yet |
| 12 | Sayan — "only wanted details, not a Prospect" | **dismiss** | explicit agent disqualifier |

**Distribution: 7 dismiss · 4 unsure · 1 revive** (was 1 revive · 11 unsure before). The piles
separated: confident junk → `dismiss`, the warm-but-stalled Kartik stayed `unsure` (no
over-correction), Ratlam still `revive` (the revive bar did not shift). Read the eval for *whether
the piles separate*, not for an exact per-lead prediction.
