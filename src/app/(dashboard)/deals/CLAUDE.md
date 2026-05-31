# Deals Page — CLAUDE.md

## Architecture: Three-Component Split

```
deals/page.tsx                  ← Server component (thin orchestrator)
  │  reads searchParams
  │  calls getLeadFilterOptions() ONCE for agent dropdown
  │  resolves caller role + profile
  │
  ├── <DealsFilters />           ← Client component — never re-fetches
  │     receives: role, showDomainFilter, showAgentFilter, agents[]
  │     owns: URL param read/write
  │
  └── <Suspense fallback={<DealsSkeleton />}>
        <DealsAsync />           ← Async server component — re-renders on filter change
              receives: role, userId, domain, filters (DealFilters), pageSize
              calls: getDealsByRole() + getDealsSummary() in Promise.all
              renders: <DealsSummaryStrip> above <DealCard> list
```

---

## Three Invariants — Never Violate

1. **`getDealsByRole` returns `{ deals: DealWithAssignee[], totalCount: number }` — never `Deal[]` alone.**
   `totalCount` from `{ count: 'exact', head: false }` on the same query builder that has all role
   constraints and filters applied — never a second query.

2. **`DealFilters` has no `status` field.**
   `status = 'won'` is a structural constraint in `getDealsByRole` — applied before any filter,
   never exposed as a URL param. Any code that passes `status` through `DealFilters` is a bug.

3. **Agent role gate (`assigned_to = uid`) is the first constraint in `getDealsByRole`.**
   Applied before `DealFilters`. A crafted `?agent_id=<other-uuid>` URL param cannot surface
   another agent's deals — the role constraint wins unconditionally.

---

## DealFilters Type

Defined in `src/lib/types/database.ts`.

```typescript
export type DealFilters = {
  search:    string | null
  domain:    AppDomain | null   // admin/founder only; parseGiaDomainParam() validates
  deal_type: string | null      // 'membership' | 'retail'
  agent_id:  string | null
  date_from: string | null
  date_to:   string | null
  page:      number
  pageSize:  number
}
```

**No `status` field — see invariant 2 above.**

---

## getDealsSummary RPC Contract

Current signature (migration 0053):
`get_deals_summary(p_role, p_caller_domain, p_filter_domain, p_agent_id, p_deal_type, p_date_from, p_date_to)`

- Lives in: `supabase/migrations/20260531000053_get_deals_summary_manager_domain_fix.sql`
  (replaces 0052 which used a single `p_domain` for both purposes)
- SECURITY DEFINER — RLS bypassed; role gate enforced explicitly in WHERE clause
- Must apply the same role+filter constraints as `getDealsByRole`
- Date range applied to `status_changed_at` (when deal was won) — NOT `created_at`
- Returns exactly one row: `total_deals, total_revenue, membership_count, retail_count`

**Two-domain parameter split — do not collapse back into one:**

| Param | Source | Used for |
| --- | --- | --- |
| `p_caller_domain` | `profile.domain` (server-verified) | Manager role-gate: `l.domain = p_caller_domain` |
| `p_filter_domain` | `filters.domain` (user-supplied, null for manager) | Admin/founder domain slice only |

The manager role-gate in SQL is `l.domain = p_caller_domain::app_domain` — it never reads
`p_filter_domain`. This makes it structurally impossible for a tampered filter input to redirect a
manager's domain scope, even if the service layer were ever misused.

The service (`getDealsSummary`) always passes `p_caller_domain = domain` (the `AppDomain` arg
from the server-verified profile) and `p_filter_domain = null` when `role === 'manager'`.

**Pre-mortem rule:** If `getDealsSummary` scans without the same filters as the list query,
the summary strip will show a different total than the visible cards. The RPC params must
mirror the list query constraints exactly.

---

## Date Range Rule

Date filters in Deals apply to `status_changed_at` (the timestamp when the lead was marked won),
NOT `created_at`. This is intentional — users filter by when the deal closed.

The `date_to` end-of-day transform (`T23:59:59.999Z`) is applied in `getDealsByRole` and
mirrored in `getDealsSummary` — never in components.

**`status_changed_at` caveat:** `status_changed_at` is updated on every status transition. Today
`won` is terminal so it reliably marks the single won moment. If junk-revival (junk →
in_discussion → won) is ever extended to allow a re-win on the same lead, `status_changed_at`
will reflect the *most recent* won transition, not the original. The "Won on" date in `DealCard`
and the date-range filter will both shift. This is not a problem today, but revisit if re-win
paths are ever introduced — the correct fix at that point is a dedicated `won_at` column set
once and never updated.

---

## Agent Filter Security

`getDealsByRole` enforces `assigned_to = auth.uid()` for the `agent` role **before** applying
`DealFilters.agent_id`. URL param `?agent_id=<other-uuid>` returns no other agent's deals — the
role constraint wins unconditionally.

`page.tsx` sets `agent_id: null` in `parseFilters` when `role === 'agent'` as a defence-in-depth
measure, but the service-layer guard is the authoritative one.

---

## DealCard URL Contract

`DealCard` links to `/leads/${deal.slug ?? deal.id}`. The slug fallback is mandatory — older leads
(inserted before the slug migration) may have `slug: null`. Never assume slug is populated.

---

## URL Param Keys

| Filter    | URL param   | Type              |
|-----------|-------------|-------------------|
| search    | `search`    | string (debounced 500ms) |
| domain    | `domain`    | AppDomain (admin/founder only) |
| deal_type | `deal_type` | 'membership' \| 'retail' |
| agent_id  | `agent_id`  | UUID string (manager+ only) |
| date from | `date_from` | ISO date string (applied to status_changed_at) |
| date to   | `date_to`   | ISO date string (applied to status_changed_at) |
| page      | `page`      | integer (default 1) |

Every filter/search change deletes the `page` param via `buildFilterParams(..., { resetKeys: ['page'] })`.
