# Leads Page — CLAUDE.md

## Architecture: Three-Component Split

The leads page is split into three responsibilities to enable Suspense-based streaming.
When a filter changes, only `LeadsTableAsync` re-renders. The filter bar stays stable.

```text
leads/page.tsx                  ← Server component (thin orchestrator)
  │  reads searchParams
  │  calls getLeadFilterOptions() ONCE — not on every filter change
  │  resolves caller role + profile
  │
  ├── <LeadsFilters />           ← Client component — never re-fetches
  │     receives: options (campaigns[], agents[]), role, showAgentFilter
  │     owns: URL param read/write via useRouter + useSearchParams
  │
  └── <Suspense fallback={<LeadsTableSkeleton />}>
        <LeadsTableAsync />      ← Async server component — re-renders on filter change
              receives: role, userId, domain, filters (LeadFilters)
              calls: getLeadsByRole() with filters applied
              renders: <LeadsTable leads={...} userId={...} hasActiveFilters={...} />
```

**Critical:** `LeadsTableAsync` MUST be the direct child of `<Suspense>`.
If it is a sibling of the skeleton, the boundary does nothing.

---

## Lead dossier (`leads/[id]/page.tsx`)

Thin server orchestrator. Parallel fetch: lead (slug then UUID fallback), notes, activities, assignee, agents, `getAdCreativesForCampaign(utm_campaign)` when present.

**Tasks column:** `<Suspense fallback={<LeadTasksCardSkeleton />}><LeadTasksAsync leadId={lead.id} /></Suspense>` — calls `getAllLeadTasks` (not `getNextLeadTask`). `LeadDossierTasksAsync` is retired.

**Ad creatives:** pass `adCreatives[]` to `LeadInfoCard` + `CampaignVideoModal`. Service: `getAdCreativesForCampaign` (plural array, migration 0058 multi-video).

**Access gates** at page level mirror action-level checks (`canEdit`, `canReassign`, `canEditDomain`, scratchpad, notes).

---

## LeadFilters Type

Defined in: `src/lib/types/database.ts` (not a separate types file — this is the established pattern).

```typescript
export type LeadFilters = {
  status:            LeadStatus[] | null;
  last_call_outcome: CallOutcome[] | null;
  domain:            AppDomain | null;  // admin/founder only; must pass isGiaDomain() — URL via parseGiaDomainParam()
  agent_id:          string | null;
  source:            string | null;
  campaign:          string | null;
  date_from:         string | null;
  date_to:           string | null;
  search:            string | null;   // server-side ilike across name/phone/email
  page:              number;          // default 1
  pageSize:          number;          // default 30, fixed — not user-configurable
};
```

**Domain filter:** URL param `domain`. Items from `GIA_DOMAIN_FILTER_ITEMS` in `lib/constants/domains.ts`. Visible only when `showDomainFilter` (admin/founder). Managers are locked to `profile.domain` — URL param ignored. Changing domain clears `agent_id` and `campaign` (scoped options refetch at page level).

`.range()` is always applied in `getLeadsByRole` regardless of filter presence.
An unfiltered first load fetches exactly `pageSize` (30) rows — never the full table.

URL param key for search: `search`. Trimmed in the service before query — never trust raw input.

---

## Server-Side Search

`getLeadsByRole` applies search via a single `.or()` call chained onto the existing query builder:

```typescript
query = query.or(
  `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`
);
```

- Applied after role constraints, before `.range()`.
- `term` is trimmed and lowercased in the service — never trust raw client input.
- Searches across ALL pages — not just the current page.
- Supported by `idx_leads_phone_text` partial index (`text_pattern_ops`) on phone.

---

## Search Placement Rule

Search lives in **`LeadsFilters.tsx`** only. It is debounced 500ms and stored as the `search` URL param.

**`LeadsTable.tsx` contains zero filtering, searching, or sorting logic.** It receives pre-filtered rows from the server via props and renders them directly. There is no `useState` for search, no `useMemo` filter, no `.filter()`, no `.sort()` on the `leads` array inside `LeadsTable`. The component is display-only.

If you find yourself adding a filter or search inside `LeadsTable.tsx`, stop. That logic belongs in the service layer (`getLeadsByRole`) surfaced through `LeadsFilters` and URL params.

---

## getLeadsByRole Return Shape

`getLeadsByRole` returns `Promise<LeadsResult>` — **never `Lead[]` alone**:

```typescript
export type LeadsResult = {
  leads:      LeadWithAssignee[];  // Lead + assignee: { full_name } from profiles join
  totalCount: number;
};
```

**Every call site destructures both fields:**

```typescript
const { leads, totalCount } = await getLeadsByRole(role, userId, domain, filters);
```

Never destructure only `leads` and discard `totalCount`. If you don't need pagination at a call site, pass `totalCount` through anyway — it may be needed by a child component.

---

## Single-Query Count Rule

`totalCount` is obtained via `{ count: 'exact', head: false }` on the **same query builder** that has all role constraints, filters, and search applied — in one round trip:

```typescript
let query = supabase
  .from('leads')
  .select('*', { count: 'exact', head: false })
  // ... role constraints, filters, search, .range() applied to this same query
  ;

const { data, error, count } = await query;
// count === filtered result count, not the full table
```

**A separate `SELECT COUNT(*)` is a bug** — it will return the wrong number when any filter is active, because it runs against a different query scope.

If you see two Supabase calls for leads in the same `getLeadsByRole` execution, that is a violation. One query. Always.

---

## LeadsPagination Render Condition

`LeadsPagination` is rendered inside `LeadsTableAsync`, below `LeadsTable`:

```typescript
{totalCount > pageSize && (
  <LeadsPagination page={page} pageSize={pageSize} totalCount={totalCount} />
)}
```

When `totalCount <= 30`, pagination is **absent from the DOM entirely**. One page of results needs no controls.

`pageSize` is fixed at **30**. There is no page size selector. Do not add one. (Invariant #6 — was 50 before 2026-06-01 Redis cache-aside work.)

---

## Debounce Rule

Search input in `LeadsFilters` debounces **500ms** before pushing to URL params.
Implementation: `useEffect` + `setTimeout`/`clearTimeout`. No library.

```typescript
useEffect(() => {
  const timer = setTimeout(() => { ... push to URL ... }, 500);
  return () => clearTimeout(timer);
}, [searchInput]);
```

- When search changes, `buildParams` deletes `page` → resets to page 1 automatically.
- When clear X is clicked, `search=null` and `page` deletion happen in the same `router.push`.

**Never push search on every keystroke** — every push triggers a `LeadsTableAsync` re-render.

---

## Page Reset Rule

Every URL param push that changes a filter or search value must include deletion of the `page` param. This is enforced in `buildParams`:

```typescript
function buildParams(current, updates) {
  ...
  next.delete('page');  // resets to page 1 on every filter/search change
  return next;
}
```

`clearAll()` calls `router.push(pathname)` with no params — implicitly page 1.

**Never push filter changes that bypass `buildParams`.** All filter and search navigation goes through `push(updates)` → `buildParams()`. If a future filter calls `router.push` directly with a hand-built URL string, it will skip the page reset and leave the user on whatever page they were on — which may return zero rows silently.

The only exception is `clearAll()`, which pushes `pathname` with no params at all — that also resets page to 1.

---

## showAgentFilter Prop Contract

`LeadsFilters` receives `showAgentFilter: boolean`.

- `true`  → agent dropdown is rendered (manager / admin / founder)
- `false` → agent dropdown is **absent from the DOM entirely** — not hidden with CSS, not rendered at all

This is enforced in `page.tsx`:

```typescript
const showAgentFilter = profile.role !== 'agent';
```

Never set `showAgentFilter={true}` for agent-role users.

---

## date_to End-of-Day Rule

When `filters.date_to` is present, the service transforms it to end-of-day **before querying**:

```typescript
const endOfDay = filters.date_to.replace(/T.*$/, 'T23:59:59.999Z');
query = query.lte('created_at', endOfDay);
```

This means selecting May 28 as `date_to` includes leads created at 23:59 on May 28.
This transform happens in `leads-service.ts` — never in a component.

---

## getLeadFilterOptions Call Location

`getLeadFilterOptions(role, domain)` is called **once** in `leads/page.tsx`.
It returns `{ campaigns: string[], agents: Profile[] }`.

These are passed as stable props to `<LeadsFilters options={filterOptions} />`.

**Never call `getLeadFilterOptions` inside `LeadsTableAsync` or any filter component.**
If you do, campaigns and agents re-fetch on every filter interaction.

---

## Agent Filter Security

`getLeadsByRole` enforces `assigned_to = auth.uid()` for the `agent` role
**before** applying `LeadFilters.agent_id`. A crafted URL with `?agent_id=<other-uuid>`
returns no other agent's leads — the role constraint wins unconditionally.

This is the service's responsibility, not the component's.

---

## URL Param Keys

| Filter          | URL param   | Type                    |
|-----------------|-------------|-------------------------|
| search          | `search`    | string (debounced 500ms)|
| status          | `status`    | comma-separated values  |
| outcome         | `outcome`   | comma-separated values  |
| source          | `source`    | single string           |
| campaign        | `campaign`  | single string           |
| agent           | `agent_id`  | UUID string             |
| date from       | `date_from` | ISO date string         |
| date to         | `date_to`   | ISO date string         |
| page            | `page`      | integer (default 1)     |

---

## Migration

`supabase/migrations/20260528000010_lead_filter_indexes.sql`

Three partial indexes on `leads` (all `WHERE archived_at IS NULL`):

- `idx_leads_utm_source`
- `idx_leads_utm_campaign`
- `idx_leads_last_call_outcome`

---

## Redis cache invalidation — lead dossier keys

Key builders (all in `src/lib/constants/redis-keys.ts`, flat on `REDIS_KEYS`):

| Key                                  | TTL  | Invalidation                                          |
| ------------------------------------ | ---- | ----------------------------------------------------- |
| `REDIS_KEYS.leadRowId(leadId)`       | 120s | Explicit `await redis.del` on mutation                |
| `REDIS_KEYS.leadRowSlug(slug)`       | 120s | Explicit `await redis.del` on mutation (slug known)   |
| `REDIS_KEYS.leadNotes(leadId)`       | 120s | Explicit `await redis.del` on mutation                |
| `REDIS_KEYS.leadActivities(leadId)`  | 120s | Explicit `await redis.del` on mutation                |
| `REDIS_KEYS.leadList(…)`             | 30s  | TTL-only (list pages accept 30s staleness)            |
| `REDIS_KEYS.leadFilterOptions(…)`    | 300s | TTL-only (campaigns/agents change infrequently)       |

**Per-mutation del matrix** (`src/lib/actions/leads.ts`):

| Action              | row | notes | activities |
| ------------------- | --- | ----- | ---------- |
| `updateLeadStatus`  | ✓   | —     | ✓          |
| `addLeadCallNote`   | ✓   | ✓     | ✓          |
| `addLeadNote`       | —   | ✓     | ✓          |

All three use `try { await Promise.all([…]) } catch (e) { console.warn(…) }` — awaited so the
next dossier load within the 120s window never reads stale data. Redis failure logs a warn and
never propagates an error to the caller.

**Dashboard keys are TTL-only — never explicitly deleted from leads actions.** `dashboardLeadStatus`,
`dashboardLeadVolume`, `dashboardCampaigns` use their own TTLs (60–120s). This is intentional.

---

## Lead Slug — URL identifier (2026-05-30)

`leads.slug` is a human-readable, immutable URL identifier. Format: `priya-sharma-9182`
(lowercase name parts + last 4 digits of E.164 phone, non-alphanumeric chars stripped).

**Migration:** `20260530000045_lead_slug.sql`

**Contract:**

- Generated by `generate_lead_slug()` DB function on INSERT via `trg_lead_slug` trigger.
- Back-filled on all existing rows in the migration.
- **Immutable after insert.** Phone or name changes never update the slug — avoids broken bookmarks.
- Enforced unique by `idx_leads_slug` partial index (`WHERE slug IS NOT NULL`).
- `phone IS NULL` rows get no slug (phone required for the last-4 suffix).

**`getLeadBySlug(slug)`** — single query `WHERE slug = $1 AND archived_at IS NULL`.
Never use `LIKE` or prefix scan on slug. The partial index only accelerates exact equality.

**Dossier page lookup:** `leads/[id]/page.tsx` calls `getLeadBySlug(id)` first, then falls back
to `getLeadById(id)` for any UUID-based links (rows without a slug during the backfill window).

**LeadsTable href:** `lead.slug ?? lead.id` — fallback covers rows inserted during the backfill
gap between migration run and next app deploy.

**Collision:** the UNIQUE constraint is the guard. In practice impossible — phone is already a
dedup key so no two active leads share the same phone (and thus the same slug suffix).

---

## Lead Dossier — FK Joins + Relationship Types (2026-05-28)

`database.ts` `Relationships` arrays are now populated for all four dossier tables:

- `lead_notes` — `lead_notes_author_id_fkey` → profiles, `lead_notes_lead_id_fkey` → leads
- `lead_activities` — `lead_activities_actor_id_fkey` → profiles, `lead_activities_lead_id_fkey` → leads
- `tasks` — `tasks_assigned_to_fkey` → profiles, `tasks_created_by_fkey` → profiles
- `task_gia_meta` — `task_gia_meta_lead_id_fkey` → leads, `task_gia_meta_task_id_fkey` → tasks (isOneToOne: true)

**Join pattern:** always use the FK constraint name as the disambiguator in `.select()`:

```text
'*, author:profiles!lead_notes_author_id_fkey(full_name)'
'*, actor:profiles!lead_activities_actor_id_fkey(full_name)'
'task_id, task:tasks!task_gia_meta_task_id_fkey(*)'
```

**Type shapes after the refactor:**

- `LeadNoteWithAuthor` — `author: { full_name: string }` (was `author_name: string`)
- `LeadActivityWithActor` — `actor: { full_name: string } | null` (was `actor_name: string | null`)

**`getProfileNameMap` has been deleted** — it was dead code after the join refactor.

**Round trip count:**

- `getLeadNotesFull` — 1 query (was 2)
- `getLeadActivitiesFull` — 1 query (was 2)
- `getNextLeadTask` — 1 query (was 2)

**`getNextLeadTask` join direction:** starts from `tasks` (not `task_gia_meta`), uses `!inner` on `task_gia_meta` to filter by `lead_id`. This is intentional — PostgREST / Supabase JS client silently drops dot-notation filters on joined tables (e.g. `.eq('tasks.status', ...)` when starting from `task_gia_meta`). Always filter on native columns of the root table. Use `!inner` when the join must be non-optional.

---

## Prefetch-on-hover — LeadsTable

Each `LeadRow` `<tr>` element calls `router.prefetch('/leads/${lead.slug ?? lead.id}')` inside `onMouseEnter`. The href shape is identical to the `onClick` push — same slug fallback, same prefix. Next.js deduplicates repeated `prefetch` calls internally; no debounce is needed. Uses the single `useRouter()` instance already at the top of `LeadRow`. Never create a new `useRouter()` call per row.

---

## Short single-select pickers inside modals — RadioGroup pattern

`RadioGroup variant='default'` is the correct component for single-select with 5–6 labelled options
inside a `Modal`. **Do not use `FilterDropdown` inside a modal body.** `FilterDropdown` renders an
absolutely-positioned portal panel that clips against `overflow: hidden` on the modal body scroll
container, causing the dropdown to appear under the modal chrome or get cut off entirely.

`RadioGroup` has no portal dependency, no z-index conflicts, and is semantically correct for
mutually exclusive choices. Reference implementation: `ReasonModal` inside `StatusActionPanel.tsx`.

---

## Optimistic status updates — StatusActionPanel

`StatusActionPanel` uses `useOptimistic(lead.status)` to show the new status immediately when a button is clicked, before the server action resolves.

**Pattern — every status-changing path:**

```ts
startTransition(async () => {
  setOptimisticStatus(newStatus);          // updates UI immediately
  const result = await someStatusAction(…);
  if (result.error) throw new Error(result.error);  // triggers automatic revert
  closeModal();
  router.refresh();
});
```

`useOptimistic` reverts `optimisticStatus` back to `lead.status` only when the enclosing `startTransition` throws. Our actions return `{ data, error }` and never throw — so every error path must `throw new Error(result.error)` explicitly.

**CalledModal auto-advance path:** The "Called" button `onClick` in `StatusActionPanel` checks `lead.status === 'new'` (server truth, not `optimisticStatus`) and, if true, fires its own `startTransition` that calls `setOptimisticStatus('touched')` before opening the modal. `CalledModal` is unaware of the advance — it has no `initialStatus` or callback props. The `add_lead_call_note` RPC always auto-advances `new → touched`; that invariant is what makes the pre-emptive optimistic set safe. Using `lead.status` (not `optimisticStatus`) for the guard prevents a double-advance race if the component re-renders mid-transition.

**JSX rule:** every `lead.status` reference in rendered output must be `optimisticStatus`. Handler-level checks (e.g. `if (lead.status === 'new')` inside a callback) use the server truth `lead.status` — not `optimisticStatus`.

**`isPending` from `useTransition`** remains the correct disabled/loading signal for buttons. Do not add a separate `isLoading` state.

---

## AddLeadModal — Agent Fetch Guard

`AddLeadModal` receives `initialDomain: AppDomain` (always `callerProfile.domain`, passed from `AddLeadButton`).

The `watchedDomain` effect guards against redundant refetches:

```typescript
if (watchedDomain === initialDomain) {
  setAgents(initialAgents);
  return;
}
```

**Invariants:**

- `listAgentsForDomain` is only called when the selected domain differs from `initialDomain`.
- When the user changes domain back to `initialDomain`, the guard fires and restores `initialAgents` without a network call.
- `initialDomain` and `initialAgents` are never added to the `useEffect` dependency array — they are stable props for the lifetime of the modal.
- Agent role: effect still returns immediately on `canChangeDomain === false` (checked first, before the guard).
