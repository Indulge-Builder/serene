# Elaya subsystem — CLAUDE.md

> The Elaya AI subsystem (foundation 2026-06-12). This file is the command layer for
> `src/lib/elaya/**`. The full narrative + diagrams live in `docs/modules/elaya.md`; the
> rule IDs (R/A/S/Q/P/D-…) resolve in `docs/rules/The_Rules.md`. Don't duplicate the module
> doc here — this is "where things live + the non-negotiables".

## File map

```text
provider.ts            ← the ONE provider-neutral complete() contract
                          (optional `effort` low/medium/high: the Claude 5 models think by default and the
                          thinking counts against maxTokens, so a single structured judgement passes `low` and a
                          real allowance; the Anthropic adapter leaves it off for Haiku, which rejects it)
adapters/anthropic.ts  ← the ONLY file allowed to import @anthropic-ai/sdk
elaya-data.ts          ← THE single data seam every READ tool fetches through (parity rule, below)
registry.ts (tools/)   ← the 12 READ-only tools + THE single executeTool dispatch (read ∪ write)
                          + TOOLSET_BY_ROLE + getToolDefinitionsForPrincipal. READ tools are now
                          role-gated too (Phase 4): a tool's optional `roles` set = the hard gate
                          (readToolsForRole), so a manager never sees get_budget, an agent never sees
                          the oversight tools. 8 all-staff reads (incl. find_teammate — the name→userId
                          STAFF lookup for task assignment, so "create a task for <person>" resolves a
                          TEAMMATE via elayaData.findTeammates → searchTeammatesForElaya (ADMIN client +
                          code scope, ALL domains — NOT getAssignableUsers, whose session client blanks
                          on the WhatsApp webhook; the parity rule), never search_leads) +
                          get_escalations/get_domain_health/get_campaigns (manager+) + get_budget (admin/founder)
tools/write-registry.ts← ALL write tools + executeProposedAction (resolver-only executor)
principal.ts           ← identity → principal. ElayaPrincipal is a DISCRIMINATED UNION: StaffPrincipal
                          (verified profile → role + the role-gated read∪write toolset) | CustomerPrincipal
                          (FEATURE 2 — the LEAD identity, NOT a profile, + the HARD-CAPPED CUSTOMER_TOOLSET).
                          resolveStaffPrincipal / resolveCustomerPrincipal(lead). The staff brain/persona/
                          tools take StaffPrincipal specifically (so the customer path can't reach staff code).
persona.ts             ← STAFF system prompt (sets expectations; NEVER the enforcement mechanism). Folds the
                          per-user persona prefs + learned memory in via buildPersonaPromptBlock (STYLE
                          ONLY — never a permission) + the user's free-form NOTES via buildNotesPromptBlock
                          (Feature 3 — CONTEXT to remember, never permission; '' = zero bytes when none, so
                          a no-notes user keeps the shared cache prefix). Persona vocab: constants/elaya-persona.ts
customer-persona.ts    ← (FEATURE 2) the CUSTOMER system prompt — the psychology-trained concierge
                          salesperson voice + hard guardrails (KB-only facts, ₹ only, no AI/Serene reveal,
                          no other-customer/internal talk). Voice + expectations only — never permission.
customer-brain.ts      ← (FEATURE 2) runCustomerTurn — a SEPARATE, simpler tool loop for the outward
                          customer channel (NO confirmation resolver, NO staff persona/memory, NO
                          elaya_actions). Shares only the provider contract + the customer toolset. Surfaces
                          the media get_company_material fetched so the orchestrator sends the actual files.
tools/customer-registry.ts ← (FEATURE 2) THE customer toolset + dispatch. CUSTOMER_TOOLSET = exactly two
                          lead-scoped tools (get_company_material read-only KB; note_customer_interest writes
                          ONLY principal.leadId's service_interests). executeCustomerTool refuses anything
                          outside it — the Golden Rule's hard edge. NO staff tool / executeTool / CRM read is
                          reachable from a customer turn, by construction.
memory.ts              ← (Jarvis Phase 3) the learned-memory summarizer (bounded Haiku, reuses
                          provider+PII) + maybeUpdateLearnedMemory (throttled post-turn writer, called
                          by the SSE route + WhatsApp gate, non-fatal). (retrieveMemoryContext was
                          removed 2026-07-02 — zero callers; the brain reads getUserPersona +
                          getNotesForElaya directly, and a future embeddings retrieval layer starts
                          from those call sites.) learned lives in user_context.context.learned;
                          notes live in elaya_notes (0152)
access.ts              ← canAccessLead — THE shared per-lead access gate (a SECURITY predicate;
                          one implementation for BOTH tool registries, dry-audit D6) + the
                          leadDisplayName/statusLabel model-facing label helpers (D15)
pii.ts                 ← maskPii() — THE PII gateway every tool result passes before a model sees it
confirmation.ts        ← classifyConfirmation() — pure English+Hinglish affirmation gate
brain.ts               ← the tool loop + the confirmation RESOLVER pre-step (the ONLY place a
                          state-change executes)
sse.ts                 ← ElayaSseEvent + readElayaSseStream() — THE Elaya SSE frame vocabulary and
                          byte-stream → event reader (meta/delta/tool/done/error). Runtime-neutral;
                          pumped by the browser transport (components/elaya/elaya-stream.ts) AND
                          python-brain.ts. Never re-parse `data:`/`\n\n` frames inline.
python-brain.ts        ← (Step 3, channel tranche 2026-08-31; in-app proxy 2026-09-03) THE Node →
                          Python-brain transport, two entry points over ONE fetch/mapping core:
                          openPythonBrainStream() (pre-flight → typed rejection BEFORE any frame, or
                          the live SSE byte stream + release()) and runPythonBrainTurn() (open + pump
                          to completion) + isPythonBrainConfigured(). Bearer BRAIN_API_SECRET to
                          ELAYA_BRAIN_URL/v1/elaya/chat (https:// REQUIRED in production — the
                          CloudFront front on the Fargate ALB; http:// is refused), the same SSE wire
                          via sse.ts, rejections typed (cap 429 / duplicate 409 / unauthorized 401-403 /
                          not_found 404 = unowned conversation id / unavailable). Passes ONLY a
                          verified profile id. Two callers: services/elaya-whatsapp.ts (whole-turn
                          pump when `brain_whatsapp` says python) and /api/elaya/chat (frame proxy
                          when `brain_in_app` says python). Never a second brain client.
```

## The channel-parity rule (Phase 1 — structural, non-negotiable)

> Anything Elaya can do in-app she can do on WhatsApp, by construction. Full as-built record:
> `docs/modules/elaya.md` (the "Jarvis" build section).

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
  `update_lead_status`, `reassign_lead`, `log_deal` (money + a Won flip). Task: `delete_task`.
  `log_deal` validates the deal SHAPE (domain → membership-needs-duration / retail-needs-category)
  at propose time so the model can ask for the missing piece BEFORE the proposal; the resolved
  shape (not raw model input) is what the resolver re-runs.

`STATE_CHANGING` (the set in `write-registry.ts`) and the per-tool `run()` shape are what make
"execute a state-change in its proposal turn" structurally impossible — a state tool's `run()` has
**no branch that reaches a core**.

## The 12 write tools

| Tool | Tier | Roles | Wraps (core) |
| --- | --- | --- | --- |
| `add_lead_note` | inline | all staff | `addLeadNoteCore` |
| `log_call` | inline | all staff | `addLeadCallNoteCore` (sets outcome, new→touched, arms SLA cadence — NOT a plain note) |
| `create_lead_task` | inline | all staff | `createLeadTaskCore` |
| `update_lead_status` | propose | all staff | `updateLeadStatusCore` |
| `reassign_lead` | propose | manager+ | `assignLeadCore` |
| `log_deal` | **propose** | all staff | `recordDealCore` (resolver only) — inserts the deal (type DERIVED from the lead's domain) + flips the lead to Won via `updateLeadStatusCore`. The SAME core the `recordDeal` action runs. |
| `create_personal_task` | inline | all staff (assign-another: manager+) | `createPersonalTaskCore` |
| `create_group_task` | inline | all staff | `createGroupTaskCore` |
| `create_subtask` | inline | all staff | `createSubtaskCore` — adds ONE assigned subtask to a group. The other half of the team-task workflow: `create_group_task` (container) → `create_subtask` once PER person (each resolved via `find_teammate`). Access gate = `getVisibleGroupById` (the principal must be in the group; admin/founder see all). A single task row has ONE assignee — multiple people = multiple subtasks. |
| `update_task_status` | inline | all staff | `updateTaskStatusCore` |
| `update_task` | inline | all staff | `updateTaskCore` |
| `delete_task` | **propose** | all staff | `deleteTaskCore` (resolver only) |

**Task assignment fires a WhatsApp ping to the ASSIGNEE.** `createPersonalTaskCore` (assigned to
another) + `createSubtaskCore` both AWAIT `sendTaskAssignedNotification` (whatsapp-api.ts) beside
their existing `createNotification` (in-app + push). Awaited inside the core, never a detached
`.catch()` (A-16 — every caller keeps the lambda alive). Template id hardcoded in `whatsapp.ts`
(`GUPSHUP_TASK_ASSIGNED_TEMPLATE_ID`, the 12-id convention); gated by the existing `task_assigned`
control-plane key (0133); logged `task_assigned` (0153).

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

## Ticket tools (Sia, 2026-09-15)

| Tool | Tier | Roles | What it wraps |
| --- | --- | --- | --- |
| `list_tickets` | read (bridged) | all staff | `elayaData.listTicketsFor` → `listTicketsForElaya` (admin client; scope = the principal's queendom from the profile, admin/founder every queendom; never model-supplied) |
| `get_ticket` | read (bridged) | all staff | `elayaData.getTicketFor` → `getTicketByRefForElaya` + `canAccessMember` on the ticket's queendom; returns `allowedMoves` from the state machine |
| `get_member_overview` | read (bridged) | all staff | `elayaData.findMembersFor` / `getMemberBriefFor` (admin client on `members` + `getSiaGroupForMember`; every row filtered by `canAccessMember` with the principal's queendom). Name or id in; several matches → `candidates` (the model asks, never picks); none → "not found" (never describe a member not returned). Hands back the `member_id` the two tools below need |
| `get_member_recent_messages` | read (bridged) | all staff | `elayaData.getMemberMessagesFor` → `getSiaMessages` on the member's mapped group (one 60-message page, oldest→newest, text capped 500 chars, `before` pages back); each row labelled member / staff / other via `getSiaSenderRoles`. RAW data, no profile layer: the description binds the model to answer only from these rows and cite dates; empty → "no messages on record" |
| `search_member_history` | read (bridged) | all staff | `elayaData.searchMemberHistoryFor(principal, memberId, query, related[])` → a TOPIC search over three places at once: the profiler's one-line conversation summaries (`member_events`), the saved facts, and the messages (`searchSiaMessages` with `anyOf` = any of the words). The tool makes the MODEL supply `related` (synonyms, implied things, Hinglish spellings): it does the understanding, the database does the finding. Ranked by whole-word matches; filler words ignored. Empty → try once with other words, then "nothing on record", never a guess. Embeddings are NOT built (no provider chosen) |
| `get_member_profile` | read (bridged) | all staff | `elayaData.getMemberProfileFor` → the queendom gate (`getMemberBriefFor`) THEN `getMemberDetailAsAdmin` — the SAME dossier read the member page renders, on the admin client because WhatsApp turns have no session. Trimmed to a bounded shape: current facts grouped by facet (most confident first, capped 80, each with sources + confidence + date), people, the serving team, health score + reasons, open/recent Freshdesk requests, what is coming up, relations, the latest observations. What Serene KNOWS, as opposed to what was said. Empty facet = nothing on record |
| `get_member_finance` | read (bridged) | all staff except guest (`canSeeMemberFinance` — the one place to narrow money to a role) | `elayaData.getMemberFinanceFor` → the queendom gate → `getMemberFinance(zoho_customer_id)` (live Zoho, 1-minute Redis copy): totals, unpaid invoices, latest invoices and payments. No Zoho link → says so; Zoho silent → says so; never an estimate |
| `add_ticket_note` | write, inline | all staff | `addTicketNoteCore`; an `executed` ledger row with an `ElayaTicketTarget` |
| `move_ticket_status` | write, propose-only | all staff | checks `canTransition` at propose time; the resolver (`executeProposedTicketMove`) re-gates, checks the status is unchanged, runs `moveTicketStatusCore` |

Both brains: the Python registry carries the names (`BRIDGED_READ_TOOL_NAMES`, `WRITE_TOOL_NAMES`) and a `tickets` specialist; the definitions come from the bridge.
