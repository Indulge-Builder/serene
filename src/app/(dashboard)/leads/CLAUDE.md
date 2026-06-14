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

**Filter-change skeleton (2026-06-12):** the boundary is keyed —
`<Suspense key={JSON.stringify(filters)} …>`. Filter/search/page/sort navigations run
inside `startTransition` (useUrlFilters), and a transition holds the old table with zero
pending feedback for an unkeyed boundary; the changed key makes React treat the subtree
as new content, so `LeadsTableSkeleton` re-shows while the new rows fetch. Same pattern
on `/deals` and `/campaigns`. Never remove the key, and never widen it beyond the parsed
`filters` object (keying on raw `searchParams` would remount on unrelated params).

---

## Lead dossier (`leads/[id]/page.tsx`) — streamed (perf audit 2026-06-11 item B)

Thin server orchestrator. **The page blocks only on wave 1:** `Promise.all(getCurrentProfile(), getLeadBySlug(id) ?? getLeadById(id))`. The header, `StatusActionPanel`, `PersonalDetailsCard`, `DynamicFormResponses`, and `LeadNotesInput` need only wave 1 and paint immediately. Everything else is a self-fetching async server component (direct child of its own `<Suspense>`, all in `src/components/leads/`):

| Boundary | Child | Fetches | Fallback |
| -------- | ----- | ------- | -------- |
| Info card | `LeadInfoCardAsync` | ad creatives (when `utm_campaign`) + reassign agents (when `canReassign`) in `Promise.all` | `DossierCardSkeleton` |
| Deal card | `LeadDealCardAsync` | `getLeadDeal(lead.id)`; renders nothing when null | `null` — no skeleton, most leads have no deal |
| Tasks | `LeadTasksAsync` | `getAllLeadTasks` (not `getNextLeadTask`; `LeadDossierTasksAsync` retired) | `LeadTasksCardSkeleton` |
| WhatsApp | `LeadWhatsAppCardAsync` | conversation → messages **serially inside the boundary** — never re-hoist `getMessages` into a page-level wave | `DossierCardSkeleton` |
| Interest card | `ServiceInterestCardAsync` | `getCasesForLead` + `getHooksForCategories` in `Promise.all` (Call Intelligence; top of right column, **always mounted** — 2026-06-12: empty interests/matches render the search-first view, never nothing) | `DossierCardSkeleton` |
| Notes timeline | `LeadNotesSectionAsync` | `getLeadNotesFull(lead.id)` | `DossierCardSkeleton` |
| Journey + activity log | `LeadActivitiesAsync` | `getLeadActivitiesFull(lead.id)` **once** for both sections — never split into two boundaries (same data, double query) | two `DossierCardSkeleton`s mirroring its margins |

**Do not regress:** never add a page-level `Promise.all` of dossier section data back into `page.tsx` — section data belongs inside the section's async child. All fetches key on `lead.id` (UUID), never the URL param (may be a slug).

**`leads/[id]/loading.tsx`** is the dossier-shaped navigation skeleton (back-link header, status strip, two-column cards) composed from `Shimmer` + `DossierCardSkeleton` — without it, navigation showed the parent *list* skeleton (wrong shape).

**Closed-deal card:** `LeadDealCardAsync` renders `<LeadDealCard deal={deal} />` (links to `/deals`) only for won leads with a `public.deals` row. See `src/components/leads/CLAUDE.md` § LeadDealCard.

**Access gates** at page level mirror action-level checks (`canEdit`, `canReassign`, `canEditDomain`, notes) — computed in wave 1 and passed to the async children as props; children never call `getCurrentProfile()` themselves.

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
  search:            string | null;   // server-side ILIKE on leads.search_text (generated column)
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

`getLeadsByRole` applies search as a single ILIKE on the **generated column
`leads.search_text`** (migration 0098 — `first_name + last_name + email + city + phone`,
kept in sync by Postgres):

```typescript
query = query.filter("search_text", "ilike", `%${term}%`);
```

- Applied after role constraints, before `.range()`.
- `term` is trimmed and lowercased in the service — never trust raw client input.
- Searches across ALL pages — not just the current page.
- Served by `idx_leads_search_trgm` (pg_trgm GIN, partial on `archived_at IS NULL`).
- The same column backs `getLeadsForExport`, `searchLeadsForTask`, and the
  `get_leads_status_counts` RPC — **never reintroduce a per-column `.or()` ILIKE
  chain**: it bypasses the index and lets the table drift from the count pills.
- Multi-word names match ("john doe" spans the first/last name boundary in the
  concatenated column — the old per-column OR could never match it).

---

## Search Placement Rule

Search lives in **`LeadsFilters.tsx`** only. It is debounced **350ms** and stored as the `search` URL param.

**`LeadsTable.tsx` contains zero filtering, searching, or sorting logic.** It receives pre-filtered rows from the server via props and renders them directly. There is no `useState` for search, no `useMemo` filter, no `.filter()`, no `.sort()` on the `leads` array inside `LeadsTable`. The component is display-only.

If you find yourself adding a filter or search inside `LeadsTable.tsx`, stop. That logic belongs in the service layer (`getLeadsByRole`) surfaced through `LeadsFilters` and URL params.

---

## date_from IST midnight fix (service layer)

`getLeadsByRole` (and `getLeadsForExport`) transform
a bare `YYYY-MM-DD` `date_from` to `YYYY-MM-DDT00:00:00+05:30` before the `.gte()` query. Without
this, PostgREST treats the bare date as UTC midnight — 5.5 hours into the IST calendar day, excluding
leads created before 05:30 IST. The transform guards against strings that already contain `T`.

---

## getLeadsByRole Return Shape

`getLeadsByRole` returns `Promise<LeadsResult>` — **never `Lead[]` alone**:

```typescript
export type LeadsResult = {
  leads:        LeadListItemWithAssignee[];
  totalCount:   number;
  statusCounts: Partial<Record<LeadStatus, number>>;
};
```

**Every call site destructures all three fields (or passes them through):**

```typescript
const { leads, totalCount, statusCounts } = await getLeadsByRoleCached(role, userId, domain, filters);
```

`statusCounts` is produced by the `get_leads_status_counts` RPC, called in `Promise.all` alongside the paginated query. It reflects the **full filtered dataset** — not just the current page slice. On RPC error it is `{}` (empty object). `LeadsTable` receives it as a prop and uses `statusCounts[status] ?? 0` as the **only** source of truth for toolbar pill counts. Zero reads from `leads[]` for count display.

**Param-sync rule:** the RPC params in `getLeadsByRole` (`p_agent_id`, `p_date_from`, `p_date_to`, `p_campaign`, `p_search`, `p_source`, `p_outcomes`, `p_statuses`, `p_domain`, `p_going_cold`) must stay in sync with the filter chain applied to the paginated query. `getLeadsByRole` hoists every filter value (`dateFrom`, `dateTo`, `searchTerm`, `goingColdThreshold`, `domainSlice`) into one block used by **both** sides so the bounds cannot drift. When a new filter is added to `LeadFilters`, update both the paginated query and the RPC call simultaneously — and migration the RPC.

---

## Single-Scan Count Rule (perf audit C-1)

`totalCount` is the **sum of the `get_leads_status_counts` rows** — the RPC scans the
filter predicate exactly once and both the pills and the total derive from it. The
paginated query selects rows only:

```typescript
// in Promise.all with the RPC:
let query = supabase.from('leads').select('id, slug, …')  // NO count option
// totalCount accumulated while reducing the RPC rows into statusCounts
```

- **Never re-add `{ count: 'exact' }` to the paginated query** — it forces a second
  full scan of the matching set on every page/filter change (the pre-C-1 behaviour).
- **Never issue a separate `SELECT COUNT(*)`** — different query scope, wrong number.
- On RPC error, `totalCount` degrades to `offset + data.length` (a floor): the pager
  hides rather than lies, pills go empty, and a `[leads-service]` warning is logged.
- This only stays correct while the RPC predicate mirrors the query predicate —
  see the param-sync rule above.

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

Search input in `LeadsFilters` debounces **350ms** before pushing to URL params.
Implementation: `useDebounce` hook at `src/hooks/useDebounce.ts` — the canonical debounce utility. Do not recreate it inline or add an alternative.

`FilterDraft` no longer contains `search`. Search lives in a separate `searchInput` state + `debouncedSearch` derived value; the `useEffect` keyed on `debouncedSearch` guards against the mount no-op and the `clearAll` no-op via an equality check against the live URL param before pushing.

- When search changes, `buildParams` deletes `page` → resets to page 1 automatically.
- `clearAll` calls `setSearchInput("")` immediately so the input clears without waiting 350ms.
- `SearchBar` (`src/components/ui/SearchBar.tsx`) renders the search input — do not re-implement the input inline.

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

## Invariant 28 — LeadsTable.tsx has no client-side sort

`LeadsTable.tsx` must never `.sort()` or reorder the `leads` array — rows render in server order only. Sort is driven by:

1. `LeadFilters.sort_order` (`'asc' | 'desc'`, default `'desc'`) — parsed from `sort_order` URL param in `leads/page.tsx`
2. `getLeadsByRole` — applies `.order('created_at', { ascending: filters.sort_order === 'asc' })`
3. `LeadsTable.tsx` toolbar — "Newest first" / "Oldest first" toggle left of Columns; reads `sort_order` from URL and commits immediately on click (not part of `LeadsFilters` draft/Apply)

Column-header click sort is not implemented and must not be added without a spec change.

---

## URL Param Keys

| Filter          | URL param    | Type                                    |
|-----------------|--------------|-----------------------------------------|
| search          | `search`     | string (debounced 350ms)                |
| status          | `status`     | comma-separated values                  |
| outcome         | `outcome`    | comma-separated values                  |
| source          | `source`     | single string                           |
| campaign        | `campaign`   | single string                           |
| agent           | `agent_id`   | UUID string                             |
| date from       | `date_from`  | ISO date string                         |
| date to         | `date_to`    | ISO date string                         |
| going cold      | `going_cold` | `'true'` only (omitted = off)           |
| revival         | `revival`    | `'true'` only — the revival review view |
| sort order      | `sort_order` | `'asc'` only (omitted = `'desc'`)       |
| page            | `page`       | integer (default 1)                     |

---

## Going Cold filter

**URL param:** `going_cold=true`

**Threshold constant:** `COLD_LEAD_THRESHOLD_DAYS = 5` in `src/lib/constants/leads.ts`.

**Service logic:** `last_activity_at < (now - 5 days)` AND `status NOT IN ('won','lost','junk')`. Applied in `getLeadsByRole` and `getLeadsForExport` after the search filter, before `.range()`.

**NULL `last_activity_at` leads are intentionally excluded** by PostgreSQL `<` semantics — NULL is never less than a timestamp. Those leads (never updated since backfill) are handled by SLA-01A.

**Immediate-commit:** clicking the chip in `LeadsTable` toolbar fires `router.push` directly — does NOT go through draft → Apply. On activate, also clears `status` and `outcome` from the URL (going cold is logically incompatible with status/outcome filtering). On deactivate, removes `going_cold` from URL only.

**Placement:** left side of `LeadsTable` toolbar (first control), before status summary pills. Not in `LeadsFilters`.

**`committedCount` badge:** `going_cold=true` counts as +1 in `LeadsFilters`, same as any other active filter.

**`clearAll()`:** removes `going_cold` because it pushes `pathname` with no params.

**Empty state:** `goingCold=true` prop on `LeadsTable` triggers heading "No cold leads." / sub "All leads have had recent activity." — takes priority over the generic `hasActiveFilters` empty state.

---

## Revival review view (`?revival=true`)

The lead-revival review tab is the leads list filtered to leads holding an OPEN
`revival_candidate` (Lead Revival R1, `docs/modules/revival.md`).

- **`revival` is a `LeadFilters` flag** (`database.ts`), parsed in `parseFilters` like `going_cold`.
- **Own service path:** `getLeadsByRole` short-circuits to `getRevivalCandidateLeads` when
  `filters.revival` is set — it resolves the visible open-candidate `lead_id`s on the SESSION
  client (RLS scopes by role/domain, like `going_cold` relies on RLS), pages over that id set,
  then `.in('id', ids)` the leads with the **identical column subset + assignee join + ordering**
  as the main query. `LeadsTable` renders unchanged.
- **The status-counts RPC is bypassed for this predicate** — it cannot express the cross-table
  subquery, and forcing it would drift the count pills from the predicate (C-1). `totalCount`
  derives from the resolved id-set length; `statusCounts` is `{}` (status pills are meaningless
  for a candidate view scattered across touched/in_discussion/nurturing).
- **The Redis list cache is bypassed** — a low-volume, freshness-sensitive review surface.
- **`RevivalReviewBanner`** (rendered by `LeadsTableAsync` above the table when `revival`) surfaces
  the AI reasoning + the shared `<ReviveLeadButton>` per candidate — a table cell can't hold the
  reasoning. It is the reasoning/action surface, **not a second lead list.**
- There is no `?revival=true` toolbar chip — the view is reached from the dossier / a saved link;
  add a chip the same way as `going_cold` (in `LeadsTable`'s toolbar) if a UI entry point is wanted.

---

## Migration

`supabase/migrations/20260528000010_lead_filter_indexes.sql`

Three partial indexes on `leads` (all `WHERE archived_at IS NULL`):

- `idx_leads_source` (was `idx_leads_utm_source` before attribution refactor — migration 0065)
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

- `getAssignableUsersAction(domain)` is only called when the selected domain differs from `initialDomain`.
- When the user changes domain back to `initialDomain`, the guard fires and restores `initialAgents` without a network call.
- `initialDomain` and `initialAgents` are never added to the `useEffect` dependency array — they are stable props for the lifetime of the modal.
- Agent role: effect still returns immediately on `canChangeDomain === false` (checked first, before the guard).

---

## Export System

### exportLeadsAction (`lib/actions/leads.ts`)

```typescript
exportLeadsAction(input: {
  filters:     LeadFiltersSchema shape,
  selectedIds?: string[],   // UUIDs — bypasses filter logic, still enforces role constraints
}) → Promise<ActionResult<ExportPayload>>

ExportPayload = {
  leads:      LeadExportItem[];
  activities: LeadActivityWithActor[];
  notes:      LeadNoteWithAuthor[];
  totalCount: number;
}
```

Hard limit: returns `{ data: null, error: 'Export exceeds 5,000 leads.' }` when `totalCount > 5000`.
Never imports `xlsx`. Returns plain JSON — file building is entirely client-side.

### getLeadsForExport (`lib/services/leads-service.ts`)

Mirrors `getLeadsByRole` filter and role-constraint logic exactly, but with **no `.range()` call** and a `.limit(5000)` cap. A separate function — **never modify `getLeadsByRole` to skip `.range()`**. Invariant 18 (`getLeadsByRole` always paginates) stays intact.

### export.ts (`lib/utils/export.ts`) — CLIENT-SIDE ONLY

Never import from server actions or service files. Three entry points:

- `buildLeadsCSV(leads)` — CSV string, UTF-8, lead sheet only
- `buildXLSXWorkbook(leads, activities, notes)` — dynamically imports `xlsx`; returns `ArrayBuffer`; three sheets: Leads, Activities, Notes
- `triggerBrowserDownload(filename, content, mimeType)` — Blob + `URL.createObjectURL` + programmatic `<a>` click

### Checkbox selection

`LeadsTable.tsx` owns `selectedLeadIds: Set<string>` state. The checkbox column is a fixed first column — **not in the `lead-columns.ts` registry**, never appears in the column picker.

Header checkbox is indeterminate when some (not all) rows are selected. Row checkbox `onClick` stops propagation to prevent row navigation.

`selectedLeadIds` is cleared in a `useEffect` keyed on the `leads` prop — clears automatically on page navigation and filter changes.

`LeadsSelectionToolbar` is shown via `AnimatePresence` when `selectedLeadIds.size > 0`. It receives `selectedIds: string[]` and calls `exportLeadsAction({ filters: {}, selectedIds })` — the empty `filters` object is intentional; role constraints still apply server-side.

### ExportButton placement

`ExportButton` lives in the **`LeadsTable` toolbar** — right of the Columns picker, alongside the sort-order toggle. It is always visible (not conditional on filter state). Receives the resolved `filters: LeadFilters` prop from `LeadsTableAsync`. Opens `ExportModal` which shows format toggle (CSV / XLSX) before triggering the action.

Never use `MotionButton` for `ExportButton` — it is a table-toolbar utility button, not a primary CTA.
