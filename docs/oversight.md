# Oversight — Page Spec

> **Purpose:** spec for `/oversight` (manager/admin/founder work-in-progress drill) and its two
> dynamic detail tiers. A READ surface over existing task data + one new append-only event stream
> (`task_events`). Schema rows live in `../architecture/database.md`; the task model it reads is
> `./tasks.md`; component contracts live code-adjacent in `src/app/(dashboard)/oversight/CLAUDE.md`.
> **Last verified:** 2026-06-24 (initial build).

## 1. Purpose

`/oversight` answers one question for a manager or founder: **what is my team / every team doing
right now, and where is work stuck?** It is a three-tier drill into work-in-progress, with the
same *card → open* grammar at every tier:

- **Tier 1 — Teams** (founder/admin only): one card per `app_domain` that has an agent roster.
  Each card shows open / overdue / completed task counts + agent count + a live "present agents"
  pulse. Click a card → Tier 2 for that domain.
- **Tier 2 — Team detail** (managers land here, clamped to their own domain): per-agent cards for
  that team + the team's group tasks + a live activity rail. Click an agent → Tier 3.
- **Tier 3 — Agent detail**: that agent's personal + group tasks + their task metrics
  (open / in-review / overdue / completed) + a live rail scoped to that agent.

It is **a layer over tasks** — it never mutates a task, a lead, or any row. The only thing the
build writes is one `task_events` append per task mutation, emitted from the existing mutation
cores (never from the UI).

## 2. Who sees it

| Role | Landing tier | Scope |
| --- | --- | --- |
| `agent` / `guest` | — | **No access.** The page redirects to `/dashboard`; the nav item is hidden. |
| `manager` | **Tier 2**, pinned to their own `domain` | Cannot reach Tier 1; cannot read another team at any tier (server-clamped, not merely hidden). |
| `admin` / `founder` | **Tier 1** | Drills 1 → 2 → 3 across every team. |

Three enforcement layers, exactly as every dashboard route (A-13):

1. `/oversight` added to the GIA-domain slice of `DOMAIN_ROUTE_MAP` so a manager passes
   `canAccessRoute`; admin/founder bypass it. Agents in a Gia domain would pass `canAccessRoute`
   for the prefix, so **the page itself redirects `agent`/`guest` to `/dashboard`** (role gate,
   like `/campaigns`/`/budget`). The Sidebar item rides the existing `isManager` gate.
2. The `(dashboard)/layout.tsx` `canAccessRoute` guard (defence in depth).
3. **The action/service layer is the real authority** — see §6 (Manager domain clamp).

## 3. Tiers & navigation

Routes (one page, two dynamic children — mirrors leads/campaigns detail routing):

| Tier | Route | Reads |
| --- | --- | --- |
| 1 Teams | `/oversight` | `getTeamTaskOverview()` → `get_team_task_overview()` |
| 2 Team detail | `/oversight/[domain]` | `getTeamAgentBreakdown(domain)` → `get_team_agent_breakdown(p_domain)` |
| 3 Agent detail | `/oversight/[domain]/[agentId]` | `getAgentTasksOversight(agentId)` → `get_agent_tasks_oversight(p_agent, p_role, p_domain)` |

- **Manager** hitting `/oversight` is redirected to `/oversight/<their-domain>` (they have no Tier 1).
- `[domain]` is validated against `APP_DOMAINS` (`isAppDomain`); an unknown/illegal value →
  `notFound()`. `decodeURIComponent` on the param is wrapped `try/catch → notFound()` (Q-10).
- `[agentId]` is a uuid; a non-uuid or an agent the caller may not see → `notFound()`.
- Tier 2 and Tier 3 carry a `<BackButton href=… label=…>` inline-left of the `<h1>` (detail-page
  header contract); Tier 1 shows the page-title dot (it is the primary nav landing).
- Card → drill is a plain `<Link>` (`/oversight/<domain>`, `/oversight/<domain>/<agentId>`).
  **One aggregation query per tier** — never a per-card or per-agent DB call.

## 4. The `task_events` stream (net-new)

A single append-only event table is the spine of every "live" surface. It exists because the
oversight readers are point-in-time aggregates; the rail needs a push feed, and a remarks stream
cannot back it (a status change with no remark writes no remark row — see §8 sign-off).

### 4a. `task_events` table (migration `…000144`)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `task_id` | uuid | FK → `tasks(id)` **ON DELETE CASCADE** |
| `domain` | `app_domain` **NOT NULL** | The task's derived domain **at emit time** (see §4c) |
| `actor_id` | uuid NULL | Who caused the event (FK → `profiles`); NULL for system/cron |
| `subject_id` | uuid NULL | The task's `assigned_to` **at emit time** (FK → `profiles`) — the agent the event belongs to on Tier 3 |
| `event_type` | `task_event_type` enum NOT NULL | `created` \| `status_changed` \| `reassigned` \| `remark_added` \| `overdue` |
| `task_title` | text NULL | Denormalised snapshot (the rail renders without joining `tasks`, and survives a task delete that cascades the row away before the rail reads — though CASCADE means a deleted task takes its events; the snapshot is for join-free reads) |
| `meta` | jsonb NOT NULL DEFAULT `'{}'` | Event-specific payload: `{ from, to }` for status/reassign, `{ priority }` etc. |
| `created_at` | timestamptz NOT NULL DEFAULT `now()` | |

**Indexes:**
- `idx_task_events_domain_created` on `(domain, created_at DESC)` — Tier 2 team rail.
- `idx_task_events_subject_created` on `(subject_id, created_at DESC)` — Tier 3 agent rail.

**RLS (append-only, A-08/A-11):**
- `ALTER TABLE task_events ENABLE ROW LEVEL SECURITY`.
- **SELECT** policy `task_events_select` → `get_user_role() IN ('manager','admin','founder')`.
  (Domain narrowing is additive in the readers/Realtime filter — RLS gives manager+ row read; the
  service/Realtime filter clamps which rows. The session-client Realtime subscription is bounded by
  this SELECT policy AND the `filter=` clause.)
- **No INSERT / UPDATE / DELETE policy — ever.** Writes are admin-client only, from the mutation
  cores (service-role bypasses RLS). This is the A-11 append-only contract; there is no suppression
  carve-out (unlike `task_remarks`).
- `ALTER PUBLICATION supabase_realtime ADD TABLE task_events` — **Realtime ENABLED**.

### 4b. Emit points — the cores, never the UI

One append per existing mutation **core** (`src/lib/services/task-mutations.ts`) + the overdue job.
The cores already own the context-free side-effects (reminder, notify, Redis); the event append
joins them there so **both** the session-action caller and the Elaya write tool emit identically
(R-01). Never emit from an action, a page, or a component.

| Core / job | `event_type` | `meta` |
| --- | --- | --- |
| `createPersonalTaskCore`, `createSubtaskCore` | `created` | `{ priority, task_type }` |
| `updateTaskStatusCore` (+ `updateTaskCore` when status changes) | `status_changed` | `{ from, to }` |
| `updateTaskCore` when `assigned_to` changes | `reassigned` | `{ from, to }` |
| `add_task_remark_with_status` path (`addTaskRemarkAction`) | `remark_added` | `{ status_change? }` |
| `checkTaskOverdueTask` (Trigger.dev, on the once-only `overdue_at` stamp) | `overdue` | `{ due_at }` |

The append is **best-effort and non-fatal** — wrapped in try/catch-warn (`[task-events]` prefix),
identical posture to the awaited Redis dels around it. A failed event insert never fails the
mutation. It is `await`-ed (so a Trigger.dev/`after()` lambda stays alive until it lands), but its
failure is swallowed.

The emit helper lives in `src/lib/services/task-events.ts` (`emitTaskEvent(...)`) — a single
admin-client INSERT taking an explicit `{ taskId, domain, actorId, subjectId, eventType, taskTitle,
meta }`. The **caller resolves the domain** (the cores are context-free and must not run a derived-
domain query themselves — same invariant as `hasGiaMeta`); see §4c.

### 4c. Derived domain (the load-bearing join)

`tasks` has **no `domain` column**. The event's `domain` (and Tier 1/2 aggregation) derives it:

- **Group subtask** (`group_id` is not null) → `task_groups.domain`.
- **Personal task** (lead follow-up or plain) → the **assignee's `profiles.domain`**
  (`tasks.assigned_to → profiles.domain`). A lead follow-up's lead also has a domain, but the
  oversight surface is about *who is doing the work*, so the **assignee's** domain is the canonical
  axis at every tier — this is deliberate and keeps a reassigned-across-domains task counted under
  the agent now responsible for it.

In the **cores** (emit time) the caller passes the resolved `domain` + `subjectId` (the new
`assigned_to`) into `emitTaskEvent`. In the **RPCs** (read time) the aggregation joins both paths
(a `COALESCE(tg.domain, assignee.domain)` shape) so personal and group tasks land in the same
per-domain bucket — see §5. Counts join both paths or they miss/double.

> **Cross-team reassignment legitimately makes a task's events span domains.** If a task created
> in `onboarding` is reassigned to a `shop` agent, its `created` event carries `domain=onboarding`
> and its `reassigned`/later events carry `domain=shop`. **This is correct — do not "fix" it.** The
> Tier-2 rail for `shop` shows the reassign + subsequent events; `onboarding`'s rail shows the
> creation. The task's *current* domain (and thus which team's counts it sits in) is the assignee's
> domain now, which the point-in-time RPCs compute live.

## 5. The three oversight RPCs (net-new, SECURITY DEFINER, revoked)

All three are **`STABLE SECURITY DEFINER SET search_path = public`**, take **caller-supplied scope
params**, and therefore **`REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`** + `GRANT … TO
service_role` (Q-13 Tier-2 "revoked" — migration 0102 pattern). They are called **only via the
admin client** from the service layer, with **session-derived args**; the calling action/page is
the trust boundary. They are gated **manager+** at the action layer, and **domain-clamped in SQL**
(a manager arg is forced to their own domain *before* the call — §6).

### 5a. `get_team_task_overview(p_role text, p_domain app_domain)` → Tier 1

One row per `app_domain` that has ≥1 active agent (enumerated from `profiles`, not a hardcoded
domain list — so the roster drives the cards). Per row:
`domain`, `agent_count` (active agents in domain), `open_count`, `overdue_count`,
`completed_count`, `in_review_count`.

- Task → domain via the §4c COALESCE(group domain, assignee domain) join.
- `open_count` = status in (`to_do`,`in_progress`,`in_review`); `overdue_count` =
  `overdue_at IS NOT NULL AND status NOT IN ('completed','cancelled','error')`;
  `completed_count` = status `completed` (bounded to a recent window — `completed_at >= now() -
  interval '30 days'` — so it reads as "recently completed", not all-time, and stays cheap).
- **Scope clamp:** `p_role = 'manager'` → only the row for `p_domain` (the action already forced
  `p_domain` to the manager's domain). admin/founder → all domains with a roster. Even though the
  action clamps, the RPC re-applies the `WHERE` so a mis-call can't widen.
- Counts cast `Number()` in the service (Q-09); bigints never reach the component raw.

### 5b. `get_team_agent_breakdown(p_role text, p_caller_domain app_domain, p_domain app_domain)` → Tier 2

One row per active agent **whose `profiles.domain = p_domain`**, plus that agent's task tallies
(`open_count`, `overdue_count`, `completed_count`, `in_review_count`) computed over tasks where the
agent is `assigned_to`. Returns `agent_id`, `full_name`, `avatar_url`, `role`, the four counts.

- **Manager clamp in SQL:** `p_caller_domain` is the caller's own domain; when `p_role='manager'`
  the function ignores `p_domain` and uses `p_caller_domain` (a manager passing another domain gets
  **their own team**, never the requested one — and the action rejects the mismatch outright, §6).
  admin/founder use `p_domain`.
- The team's **group tasks** are read separately by the existing `getGroupTasks`-style path? No —
  group tasks for the team come from a small second selection inside the same RPC is avoided to keep
  "one aggregation query per tier". Instead Tier 2's group-task list is **the same per-agent
  aggregation's companion**: the page reads the agent breakdown (the one Tier-2 aggregation) and the
  group-task rail comes from the **`task_events` Realtime feed + the seed** (no extra task query).
  *(If a literal group-task list is later wanted, it composes the existing `getGroupTasks` reader —
  never a new query.)*

### 5c. `get_agent_tasks_oversight(p_agent uuid, p_role text, p_caller_domain app_domain)` → Tier 3

The agent's task rows (personal + group) + the tier's metric tallies, in **one** query: a
`RETURNS TABLE` of the task rows (id, title, status, priority, due_at, completed_at, overdue_at,
task_category, module, group_id, plus the lead identity columns when it is a lead follow-up via the
`task_gia_meta` LEFT JOIN — meta-presence, never a category check) **scoped to `assigned_to =
p_agent`**. The metric counts (open/in-review/overdue/completed) are derived in the **service
mapper** from the returned rows (one query → counts + list), so no second aggregation call.

- **Manager clamp in SQL:** when `p_role='manager'`, the function adds
  `AND (SELECT domain FROM profiles WHERE id = p_agent) = p_caller_domain` — a manager can only read
  an agent **in their own domain**; an out-of-domain `p_agent` returns **zero rows** (and the action
  rejects it first, §6). admin/founder skip the clamp.
- Order: active (`to_do`,`in_progress`,`in_review`) first, then `due_at ASC NULLS LAST`,
  `created_at ASC` (mirrors `get_gia_tasks`).

## 6. Server-side scope clamp (the security spine)

> **The manager tasks SELECT RLS policy is role-only — no domain clamp.** RLS lets a manager read
> every team's tasks. Oversight must **not** rely on RLS for team isolation. The clamp lives in the
> action layer + re-asserted in SQL.

`src/lib/actions/oversight.ts` — every action begins with `requireProfile(['manager','admin',
'founder'])` (A-18). Then, **before** calling the service/RPC:

- **`getTeamAgentBreakdownAction(domain)`** and **`getAgentTasksOversightAction(agentId)`**: if the
  caller is a **manager**, the action resolves the *requested* scope and **rejects** when it does not
  match the manager's own domain:
  - For `[domain]`: `if (role === 'manager' && domain !== caller.domain) return formErrors.unauthorized`.
    A manager requesting another team is **denied at the action**, not merely served their own.
  - For `[agentId]`: the action looks up the agent's domain (one `profiles` read) and rejects when it
    is not the manager's domain → `formErrors.unauthorized`.
- admin/founder pass through with the requested scope.
- The service then calls the RPC via the **admin client** with **session-derived** args
  (`p_role = caller.role`, `p_caller_domain = caller.domain`, and the validated target). The RPC's
  own SQL clamp (§5) is the third layer — a programming mistake in the action still can't widen a
  manager beyond their domain.

The Tier-3 page (`/oversight/[domain]/[agentId]`) and Tier-2 page (`/oversight/[domain]`) call these
actions/services in their RSC; a denied result renders `notFound()` (never a partial/other team's
data).

## 7. Live rail (Realtime over `task_events`)

The "live pulse / activity rail" is a Supabase Realtime subscription on `task_events`, seeded from a
read then merged on INSERT (P-06/Q-14):

- **Tier 2 rail** (`OversightTeamRail`): channel `oversight-team-${domain}-${mountId}`
  (`mountId = useId()`), `filter: domain=eq.${domain}`. Seeds from `getTeamEventsAction(domain,
  limit)` (a bounded `task_events` read, newest-first) then prepends INSERTs.
- **Tier 3 rail** (`OversightAgentRail`): channel `oversight-agent-${agentId}-${mountId}`,
  `filter: subject_id=eq.${agentId}`. Seeds from `getAgentEventsAction(agentId, limit)`.
- Teardown is always `supabase.removeChannel(channel)` (never `unsubscribe()` alone).
- The subscription is the session client — RLS SELECT (manager+) double-enforces; the manager
  action having clamped which `domain`/`agentId` the page renders means a manager's rail only ever
  subscribes to their own team's filter (an out-of-domain page `notFound()`s before the rail mounts).
- The rail is **display-only** for events; clicking a lead-task event may link to `/leads/[slug]`
  (relative), but the rail never mutates anything.

**Tier 1 "live pulse"** is the present-agent count, not an event feed: the RSC reads
`listLivePresence()` (usage-service — the only live presence reader, P-presence) once, builds a
`Map<domain, count of present userIds whose role is agent>`, and overlays it on each team card. Tier
2 agent cards likewise overlay an "online now" dot from the same `listLivePresence()` set (the
`presence` heartbeat reader — reused, never re-implemented).

## 8. Sign-off criteria (binding)

**Must:**
- Manager sees only their own team at every tier (Tier 1 unreachable; Tier 2 pinned; Tier 3 only
  own-domain agents). A manager passing another `domain`/`agentId` is **denied at the action**, not
  merely hidden.
- Founder drills 1 → 2 → 3 across all teams.
- Tier 3 renders an agent's tasks **read by a different user** (the oversight readers are NOT
  `auth.uid()`-scoped — they take an explicit `p_agent`).
- The live rail updates on a **status change made with no remark written** — proving it reads
  `task_events`, not a remarks stream.
- **One aggregation query per tier.**

**Must-not:**
- Any oversight reader scoped by `auth.uid()` (would silently return empty when one user reads
  another's load — the self-scope trap; `getPersonalTasks`/`get_group_task_summaries` **cannot** back
  oversight and are not reused).
- Any per-card / per-agent DB call.
- Any hardcoded hex (tokens only).
- A manager passing another domain and receiving data.
- Any DELETE / UPDATE policy on `task_events`.

**Note (not a bug):** a cross-team reassignment legitimately makes a task's events span domains
(§4c). Correct — do not "fix."

## 9. Reuse ledger (R-01)

Built net-new only where nothing exists; everything else composes:

| Need | Reused |
| --- | --- |
| Metric formatting | `formatCount`/`formatCompact` (`lib/utils/numbers.ts`) |
| Stat tiles / cards | `StatTile` (`variant='card'`/`'cell'`), the list-page card grammar |
| Empty states | `<EmptyState>` (hero + inline) |
| Loading scaffold | `PageSkeletons` (`Shimmer`, `skeletonStagger`, `PageHeaderSkeleton`) |
| Tabs (if any) | `TabSelector` flat props |
| Domain enum/labels/icons | `APP_DOMAINS`/`DOMAIN_LABELS`/`DOMAIN_ICONS`/`ALL_DOMAINS_ICON` |
| Assignee shape | `AssignableUser` (`lib/types`) |
| Present-now reader | `listLivePresence()` (`usage-service.ts`) — the only live presence reader |
| Emit points | the existing `task-mutations.ts` cores + `checkTaskOverdueTask` |
| Domain scope param | mirrors `resolveDomainParam`'s param/role discipline (oversight clamps in the action) |
| Back affordance | `<BackButton>` |
| Session guard | `requireProfile(['manager','admin','founder'])` |
| RPC scoping model | `get_gia_tasks` (shape) + the 0102 REVOKE/admin-client pattern |

**Net-new only:** `task_events` table + `task_event_type` enum; the three oversight RPCs; the
`/oversight` route tree + its components; `oversight-service.ts`, `oversight.ts` actions,
`task-events.ts` emit helper; the `/oversight` route-permission entry + nav slot.
