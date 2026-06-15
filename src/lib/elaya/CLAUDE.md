# Elaya subsystem — CLAUDE.md

> The Elaya AI subsystem (foundation 2026-06-12). This file is the command layer for
> `src/lib/elaya/**`. The full narrative + diagrams live in `docs/modules/elaya.md`; the
> rule IDs (R/A/S/Q/P/D-…) resolve in `docs/rules/The_Rules.md`. Don't duplicate the module
> doc here — this is "where things live + the non-negotiables".

## File map

```text
provider.ts            ← the ONE provider-neutral complete() contract
adapters/anthropic.ts  ← the ONLY file allowed to import @anthropic-ai/sdk
registry.ts (tools/)   ← the 6 READ-only tools + THE single executeTool dispatch (read ∪ write)
                          + TOOLSET_BY_ROLE + getToolDefinitionsForPrincipal
tools/write-registry.ts← ALL write tools + executeProposedAction (resolver-only executor)
principal.ts           ← verified profile → role + persona + permitted toolset
persona.ts             ← system prompt (sets expectations; NEVER the enforcement mechanism)
pii.ts                 ← maskPii() — THE PII gateway every tool result passes before a model sees it
confirmation.ts        ← classifyConfirmation() — pure English+Hinglish affirmation gate
brain.ts               ← the tool loop + the confirmation RESOLVER pre-step (the ONLY place a
                          state-change executes)
```

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

## The 9 write tools

| Tool | Tier | Roles | Wraps (core) |
| --- | --- | --- | --- |
| `add_lead_note` | inline | all staff | `addLeadNoteCore` |
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
