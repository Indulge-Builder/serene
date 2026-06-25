# Elaya subsystem — CLAUDE.md

> The Elaya AI subsystem (foundation 2026-06-12). This file is the command layer for
> `src/lib/elaya/**`. The full narrative + diagrams live in `docs/modules/elaya.md`; the
> rule IDs (R/A/S/Q/P/D-…) resolve in `docs/rules/The_Rules.md`. Don't duplicate the module
> doc here — this is "where things live + the non-negotiables".

## File map

```text
provider.ts            ← the ONE provider-neutral complete() contract
adapters/anthropic.ts  ← the ONLY file allowed to import @anthropic-ai/sdk
elaya-data.ts          ← THE single data seam every READ tool fetches through (parity rule, below)
registry.ts (tools/)   ← the 11 READ-only tools + THE single executeTool dispatch (read ∪ write)
                          + TOOLSET_BY_ROLE + getToolDefinitionsForPrincipal. READ tools are now
                          role-gated too (Phase 4): a tool's optional `roles` set = the hard gate
                          (readToolsForRole), so a manager never sees get_budget, an agent never sees
                          the oversight tools. 7 all-staff reads + get_escalations/get_domain_health/
                          get_campaigns (manager+) + get_budget (admin/founder)
tools/write-registry.ts← ALL write tools + executeProposedAction (resolver-only executor)
principal.ts           ← verified profile → role + persona + permitted toolset
persona.ts             ← system prompt (sets expectations; NEVER the enforcement mechanism). Folds the
                          per-user persona prefs + learned memory in via buildPersonaPromptBlock (STYLE
                          ONLY — never a permission). Persona vocab: constants/elaya-persona.ts
memory.ts              ← (Jarvis Phase 3) the learned-memory summarizer (bounded Haiku, reuses
                          provider+PII) + maybeUpdateLearnedMemory (throttled post-turn writer, called
                          by the SSE route + WhatsApp gate, non-fatal) + retrieveMemoryContext (the
                          notes-section seam, embedding-ready). learned lives in user_context.context.learned
pii.ts                 ← maskPii() — THE PII gateway every tool result passes before a model sees it
confirmation.ts        ← classifyConfirmation() — pure English+Hinglish affirmation gate
brain.ts               ← the tool loop + the confirmation RESOLVER pre-step (the ONLY place a
                          state-change executes)
```

## The channel-parity rule (Phase 1 — structural, non-negotiable)

> Anything Elaya can do in-app she can do on WhatsApp, by construction. Full design:
> `docs/architecture/elaya-jarvis-architecture.md`.

Identity is already channel-agnostic: both entry points resolve a verified `ElayaPrincipal`
(in-app: session→`getCurrentProfile`; WhatsApp: phone→`getActiveProfileByPhone`). The brain never
knows the channel. The ONLY thing that ever broke parity was data services that derive scope from
`auth.uid()` inside SQL — NULL in the sessionless WhatsApp webhook, so they returned blank there.

**The rule:** every Elaya READ goes through **`elaya-data.ts`**. Each function there (a) takes the
`ElayaPrincipal`, (b) uses the **admin client**, (c) scopes by the principal's role/userId/domain
**in code** — never `auth.uid()`. So a read works identically on both channels. **A tool calls
`elayaData.*` ONLY — never a `*-service.ts` function directly.** Reaching past the seam can
re-introduce a session dependency that blanks on WhatsApp; do not do it.

- **Why admin client is correct (not "less secure"):** identity is the verified principal and
  scoping is enforced in code. RLS/`auth.uid()` can't run sessionlessly, so the access decision MUST
  live in code — the `searchLeadsForElaya` / `getGiaTasksForUser` precedent.
- **The per-resource GATE stays in the tool** (`canAccessLead` / `canMutateTask`, Q-13) — the data
  layer fetches scoped data; the tool re-checks the specific resource before a write. PII masking
  stays at the `executeTool` seam.
- **Self-scoped services get a `*ForElaya` / `*ForUser` admin twin** that takes explicit identity
  (migration 0149: `get_group_task_summaries_for_user`, `get_agent_today_pulse_for_user`,
  `get_agent_roster_performance_for_elaya` — Q-13 revoked tier, service-role only). The ORIGINAL
  self-scoped functions are untouched (the in-app UI pages still call them). Shared mappers are
  extracted so the twin and the original never drift (R-01).
- **Adding a new Elaya read:** add a function to `elaya-data.ts` (principal + filters → shaped
  result), reuse a principal-first service or add a `*ForElaya` twin; the tool calls it. Never let a
  tool reach a service directly.

## The write-tool tiers (structural, not prompt-driven)

Two risk tiers, split in code — never by the prompt:

- **LOW-RISK — execute INLINE in `run()`**, then `insertExecutedAction` (one terminal `executed`
  row). Lead: `add_lead_note`, `create_lead_task`. Task: `create_personal_task`,
  `create_group_task`, `update_task_status`, `update_task`.
- **STATE-CHANGING — propose only.** `run()` does NOT mutate: it `supersedePriorProposals` +
  `insertProposedAction` (with a before-snapshot) and returns "awaiting confirmation". The mutation
  lands ONLY in the brain resolver (`executeProposedAction`) on an affirmative human reply. Lead:
  `update_lead_status`, `reassign_lead`. Task: `delete_task`.

`STATE_CHANGING` (the set in `write-registry.ts`) and the per-tool `run()` shape are what make
"execute a state-change in its proposal turn" structurally impossible — a state tool's `run()` has
**no branch that reaches a core**.

## The 10 write tools

| Tool | Tier | Roles | Wraps (core) |
| --- | --- | --- | --- |
| `add_lead_note` | inline | all staff | `addLeadNoteCore` |
| `log_call` | inline | all staff | `addLeadCallNoteCore` (sets outcome, new→touched, arms SLA cadence — NOT a plain note) |
| `create_lead_task` | inline | all staff | `createLeadTaskCore` |
| `update_lead_status` | propose | all staff | `updateLeadStatusCore` |
| `reassign_lead` | propose | manager+ | `assignLeadCore` |
| `create_personal_task` | inline | all staff (assign-another: manager+) | `createPersonalTaskCore` |
| `create_group_task` | inline | all staff | `createGroupTaskCore` |
| `update_task_status` | inline | all staff | `updateTaskStatusCore` |
| `update_task` | inline | all staff | `updateTaskCore` |
| `delete_task` | **propose** | all staff | `deleteTaskCore` (resolver only) |

## Non-negotiables (extend the foundation invariants — never weaken)

```text
NEVER add a mutating tool to the READ registry (tools/registry.ts). Write tools live in
      write-registry.ts; the SINGLE executeTool dispatch consults both.

NEVER pass model-supplied identity to a core. Build MutationActor (actorFromPrincipal) and
      CallerProfile (callerFromPrincipal) from the PRINCIPAL — derived from the verified
      profile, never request/model output (A-01).

NEVER re-query a table from a tool. Every write tool wraps a shared mutation core
      (lead-mutations.ts / task-mutations.ts), so it inherits cache/SLA/notify/reminder
      identically (R-01). canMutateTask / canAccessLead is the per-resource GATE the tool
      runs BEFORE the core (Q-13) — the core stays ungated.

NEVER gate a task tool tighter than staff EXCEPT delete_task's confirmation step. create_group_task
      is all-staff (a group is a container; subtasks carry assignees) — it must NOT inherit
      reassign_lead's MANAGER_UP gate. Assigning a personal task to ANOTHER user is manager+
      (the assignee policy, checked in the tool — the core trusts it).

NEVER pass an un-normalized dueAt to a task/lead core. Run normalizeDueAtToIstInstant at the tool
      boundary (R-01). Zoneless = IST, always.

NEVER let a state tool's run() reach a mutation core. Propose only; the resolver executes.

NEVER trust deleteTaskCore's ok:true as proof a row existed — a zero-row delete returns ok:true.
      executeProposedTaskDelete re-fetches by taskId FIRST and says "already removed" if gone.

NEVER let lead/note/task text become the confirmation. classifyConfirmation reads the human's
      latest USER-role message ONLY. A proposal's human label is CODE-derived from the DB row.
```

## The PII gateway (`pii.ts`)

Every tool result passes `maskPii(result, depth)` before serialization into a model request
(`executeTool`). Phone numbers keep last 4 digits; emails are masked per depth. **An exact-UUID
string leaf is skipped** — a UUID is an opaque identifier, not PII, and the phone regex would
otherwise corrupt a surfaced id (the handle `get_my_tasks` gives the model to target task writes).
Never remove the UUID guard without moving id surfacing off the string-mask path.

## When adding a write tool

1. Pick the tier. Inline → call the core in `run()` + `insertExecutedAction`. State-changing →
   add the name to `STATE_CHANGING`, `insertProposedAction` in `run()`, and a branch in the
   resolver (`executeProposedAction` / a sibling executor).
2. Wrap an existing core (R-01). If none exists, add it to the right `*-mutations.ts` first.
3. Gate with the principal-derived caller BEFORE the core (Q-13).
4. Normalize any `dueAt` (IST).
5. Add the tool to `ALL_WRITE_TOOLS`; `writeToolsForRole` → `TOOLSET_BY_ROLE` wires it to roles
   automatically (set `roles` on the tool).
6. Add the `action_type` to `ElayaActionType` and (if a new target shape) widen
   `ElayaActionPayload.target`.
7. Log it in `docs/changelog.md` + update `docs/modules/elaya.md`.
