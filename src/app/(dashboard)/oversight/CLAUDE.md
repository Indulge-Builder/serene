# Oversight Page — CLAUDE.md

> Full spec: `docs/oversight.md`. This file is the code-adjacent contract. The task model
> it reads is `docs/pages/tasks.md`; the event stream + RPCs are migration
> `20260624000144_oversight_task_events`.

## Route

`/oversight` — a manager/admin/founder READ surface over task data + one append-only event
stream. Three tiers, one `card → open` grammar at each.

- `agent` / `guest` → **redirect `/dashboard`** (no oversight surface).
- `manager` → lands on **Tier 2** for their own domain (Tier 1 redirects them); clamped to their
  own team at every tier.
- `admin` / `founder` → land on **Tier 1**; drill 1 → 2 → 3 across all teams.

| Tier | Route | One aggregation query |
| --- | --- | --- |
| 1 Teams | `oversight/page.tsx` | `getTeamTaskOverview` → `get_team_task_overview` |
| 2 Team detail | `oversight/[domain]/page.tsx` | `getTeamAgentBreakdown` → `get_team_agent_breakdown` |
| 3 Agent detail | `oversight/[domain]/[agentId]/page.tsx` | `getAgentTasksOversight` → `get_agent_tasks_oversight` |

Each tier page is a thin RSC orchestrator: `getCurrentProfile()` → role/clamp gate → `<Suspense>`
over an async subtree that runs the **one** tier query (+ the rail seed) and renders the cards/list.
The skeleton is `OversightSkeleton` (composes `PageSkeletons`). `loading.tsx` is not needed — the
Suspense boundary owns the fallback.

## The three non-negotiables (sign-off)

1. **One aggregation query per tier.** Never add a per-card or per-agent DB call. Tier-1 cards,
   Tier-2 agent cards, and the Tier-3 metric tiles are all rendered from a single RPC result. The
   Tier-3 metric counts are **derived in the service mapper** from the returned task rows
   (`deriveMetrics`), not a second query.
2. **No oversight reader is `auth.uid()`-scoped.** Every reader takes an explicit caller
   `{role, domain}` + target. `getPersonalTasks` / `get_group_task_summaries` are `auth.uid()`-bound
   and **silently return empty / the caller's own rows** when one user reads another's load — they
   **cannot** back oversight and are not reused. This is the self-scope trap (`docs/oversight.md` §8).
3. **The live rail reads `task_events`, never a remarks stream.** A status change made with **no
   remark** still emits a `status_changed` event and lands on the rail (proven 2026-06-24). Never
   re-point the rail at `task_remarks`.

## Server-side scope clamp (the security spine)

The manager `tasks` SELECT **RLS is role-only — no domain predicate** (a manager can read every
team's tasks at the DB level). Oversight isolation is therefore enforced in **two** layers, NOT
RLS alone:

1. **The page** (the trust boundary — the RSC pages call `oversight-service` directly) —
   `getCurrentProfile()` → agent/guest `redirect('/dashboard')`; a manager hitting another
   domain's URL is `redirect()`ed to their own team (never another team's data); the Tier-3 page
   `notFound()`s when the agent's domain ≠ the URL domain. All service args are session-derived.
2. **The RPC** — every function force-clamps a manager to `p_caller_domain` in SQL (Tier 1: only
   their domain row; Tier 2: their team's agents; Tier 3: an out-of-domain `p_agent` → zero rows).

The three RPCs are **scope-param SECURITY DEFINER → EXECUTE REVOKEd from authenticated** (Q-13
Tier-2, migration 0102 pattern). They are called **only via the admin client** from
`oversight-service.ts` with **session-derived args** — the page is the trust boundary.

> **History (2026-07-02):** `lib/actions/oversight.ts` (5 client-callable wrapper actions carrying
> the same manager clamp) was DELETED — zero callers from day one; the pages always fetched via
> the service directly, so the actions were scaffolding for a client-refresh path that never
> shipped. If client-side refresh ever lands, recreate them with the clamp described above (git
> history has the full implementation).

## Derived domain (the load-bearing join)

`tasks` has no `domain` column. Both the event emit and the tier aggregations derive it:

- **Group subtask** (`group_id` not null) → `task_groups.domain`.
- **Personal / lead-follow-up task** → the **assignee's `profiles.domain`**.

The RPCs join both via `COALESCE(task_groups.domain, assignee.domain)`; the emit layer derives it
via `resolveTaskDomain` (`lib/services/task-events.ts`) — the **single home** for the derivation
(R-01). The oversight axis is always **work-ownership** (the assignee's domain), so a task
reassigned across teams counts under the agent now responsible for it.

> **Cross-team reassignment legitimately makes a task's events span domains** — its `created` event
> carries the old team's domain, its `reassigned`/later events the new team's. **Correct — do not
> "fix" it.** The point-in-time RPCs compute the current team live; the rail shows each team the
> events that happened while the task was theirs.

## `task_events` — the append-only stream

`task_events` (migration `…000144`) is written in **exactly one place**:
`emitTaskEvent` (`lib/services/task-events.ts`), called from the task-mutation **cores**
(`task-mutations.ts`: `createPersonalTaskCore`/`createSubtaskCore` → `created`,
`updateTaskStatusCore` → `status_changed`, `updateTaskCore` → `reassigned`/`status_changed`), the
`addTaskRemarkAction` (`remark_added` — its status change rides the RPC, so only this event tells the
rail), and `checkTaskOverdueTask` (Trigger.dev → `overdue`, once, after the once-only `overdue_at`
stamp). **Never emit from a page, a component, or an action body** other than the documented remark
emit — the cores own it so the Elaya write tools inherit it (R-01).

The emit is **best-effort, non-fatal** (try/catch-warn `[task-events]`), `await`-ed inside the core
so a Trigger.dev/`after()` lambda outlives it, but its failure never fails the mutation. A null
derived domain skips the insert (never a NULL-domain row).

**RLS:** manager+ SELECT; **NO INSERT/UPDATE/DELETE policy — ever** (A-11; writes are admin-client
only). Realtime ENABLED. Indexes `(domain, created_at DESC)` and `(subject_id, created_at DESC)` back
the two rail filters.

## The live rail (Realtime)

`OversightRail.tsx` is **ONE rail body, two thin wrappers** (`OversightTeamRail`,
`OversightAgentRail` — R-01). It seeds from a bounded `task_events` read (passed in as a prop from
the RSC) and subscribes to Realtime `INSERT`s on `task_events`:

- Tier 2: channel `oversight-team-${domain}-${mountId}`, filter `domain=eq.${domain}`.
- Tier 3: channel `oversight-agent-${agentId}-${mountId}`, filter `subject_id=eq.${agentId}`.
- `mountId = useId()` (Strict-Mode nonce, Q-14); teardown `supabase.removeChannel(channel)` (P-06);
  always filtered, never the whole table. The session client's manager+ SELECT RLS double-enforces;
  the page already clamped which domain/agent renders, so a manager's rail only filters their team.

**Tier-1 "live pulse"** is NOT an event feed — it is the **present-agent count** from
`listLivePresence()` (`usage-service.ts`, the only live presence reader, reused) overlaid per domain.
Tier-2 agent cards overlay an "online now" dot from the same set.

## Files

```text
src/app/(dashboard)/oversight/
  page.tsx                          ← Tier 1 (founder/admin; manager → redirect to own team)
  [domain]/page.tsx                 ← Tier 2 (team detail; manager clamp)
  [domain]/[agentId]/page.tsx       ← Tier 3 (agent detail; manager clamp + agent∈team check)
  OversightSkeleton.tsx             ← shared Suspense fallback (composes PageSkeletons)
  CLAUDE.md                         ← this file

src/components/oversight/
  TeamOverviewGrid.tsx              ← Tier 1 cards (Link → /oversight/<domain>)
  AgentBreakdownGrid.tsx            ← Tier 2 agent cards (Link → /oversight/<domain>/<agentId>)
  OversightStatRow.tsx              ← the open/overdue/completed count triple (every tier)
  AgentOversightMetricsRow.tsx      ← Tier 3 metric tiles (StatTile variant="card")
  AgentTaskList.tsx                 ← Tier 3 task list (lead-task rows link to the dossier)
  OversightRail.tsx                 ← the live rail core + Team/Agent wrappers (Realtime)

src/lib/services/oversight-service.ts ← the 3 readers + 2 rail seeds (admin client, mapper counts)
src/lib/services/task-events.ts       ← emitTaskEvent + resolveTaskDomain (THE emit + domain home)
src/lib/types/oversight.ts            ← hand-declared row/result types (interim until type regen)
```

## Reuse notes (R-01)

- Cards reuse the dashboard card-link hover (`.serene-activity-card` in `globals.css`) + inline rest
  chrome — **never** a forked `.serene-oversight-card`. The only oversight-specific CSS is the
  `serene-oversight-pulse` presence-dot keyframe.
- `OversightStatRow` is a **distinct anatomy** (a labelled count triple with semantic emphasis — the
  Overdue cell warns when > 0), which `StatTile` cannot express (accent-mono only). It is not a
  StatTile fork; the Tier-3 tiles DO compose `StatTile variant="card"`.
- `AgentTaskList` reads status colours from `lib/constants/task-constants` (`TASK_STATUS`) — the
  shared `lib/` path — never an import from `components/tasks/` (A-05).
- Counts via `formatCount` (`lib/utils/numbers`); due via `formatTaskDueAt`; relative time via
  `formatRelativeTime` (`lib/utils/dates`).

## Adding a domain / route plumbing

`/oversight` is in the GIA-domain slice of `DOMAIN_ROUTE_MAP` (so a manager passes `canAccessRoute`)
and rides the `isManager` gate in `ANALYTICS_NAV` (Sidebar) — manager+ only, directly below
Performance. Agents are blocked by the page redirect + the role gate, not the route map (a Gia agent
would pass the prefix check). To surface a new app_domain's team card, nothing changes here — Tier 1
enumerates domains from the **agent roster** (`profiles` grouped by domain), so a domain gets a card
the moment it has an active agent.
