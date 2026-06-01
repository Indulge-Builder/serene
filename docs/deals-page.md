# Deals Page — Full Intelligence Document

Last verified: 2026-06-01

---

## 1. Module Overview

**What deals are:** A deal is a won lead that has commercial data captured. The deals list includes only rows where `status = 'won'` **and** `deal_amount IS NOT NULL`. Leads marked won without going through `recordDeal` (no amount written) do not appear on `/deals`.

**No separate `deals` table:** Deal fields (`deal_amount`, `deal_type`, `deal_duration`) live on `public.leads` (migration `20260531000049_leads_deal_duration.sql`). Decision log (The_Blueprint.md, 2026-05-31): deal data is always tied to a single lead lifecycle; a separate table would add join complexity with no benefit at current scale. Aggregates use the `get_deals_summary` RPC over `leads`.

**Route:** Single primary nav page at `/deals` — `src/app/(dashboard)/deals/page.tsx`.

**Sidebar:** `Trophy` icon (`lucide-react`), label **Deals**, in `MAIN_NAV` immediately below **Leads** (`src/components/layout/Sidebar.tsx`). Shown to every authenticated role that receives the main nav (same block as Dashboard, Leads, Tasks, WhatsApp). The page itself only gates unauthenticated users (`redirect('/login')`); unlike `/leads`, it does not redirect `guest` at the page level.

**Relationship to the lead dossier:** `/deals` is **read-only**. Won-deal capture happens on the lead dossier via `StatusActionPanel` → `WonDealModal` → `recordDeal` in `src/lib/actions/leads.ts`. That flow writes deal columns then sets status to `won`. The deals page never creates or edits deals.

---

## 2. Data Model — Deal Fields on `leads`

Migration `20260531000049_leads_deal_duration.sql` adds three columns:

| Column | Type | Nullable | Constraints |
| --- | --- | --- | --- |
| `deal_amount` | `numeric(12, 2)` | Yes | No CHECK; must be non-null for a row to appear on `/deals` |
| `deal_type` | `text` | Yes | `leads_deal_type_check`: `'membership'` \| `'retail'` |
| `deal_duration` | `text` | Yes | `leads_deal_duration_check`: `NULL` OR `'3_months'` \| `'6_months'` \| `'1_year'` |

**Business rules:**

- **Membership:** `deal_duration` required at capture time (Zod + UI); stored on the lead; `deal_amount` required.
- **Retail:** `deal_duration` cleared to `NULL` on write (`recordDeal` sets `deal_duration` to null when `deal_type !== 'membership'`).
- **Won date for filtering and display:** `status_changed_at` — the timestamp updated when status changes to `won` inside `update_lead_status`. **Not** `created_at`. Users filter and read “Won on” by close date. Caveat: `status_changed_at` updates on every status transition; today `won` is terminal, so it marks the won moment. If re-win paths are ever added, this field would reflect the latest won transition unless a dedicated `won_at` column is introduced.

**Constants:** `src/lib/constants/deal-types.ts`

| Export | Values / purpose |
| --- | --- |
| `DEAL_TYPES` | `'membership'`, `'retail'` |
| `DealType` | Union of `DEAL_TYPES` |
| `DEAL_TYPE_LABELS` | `membership` → “Membership”, `retail` → “Retail” |
| `DEAL_DURATIONS` | `'3_months'`, `'6_months'`, `'1_year'` |
| `DealDuration` | Union of `DEAL_DURATIONS` |
| `DEAL_DURATION_LABELS` | `3_months` → “3 Months”, `6_months` → “6 Months”, `1_year` → “1 Year” |

---

## 3. Won-Deal Capture Flow (lead dossier → `leads` table)

Architecturally in the leads module; documented here because it is the **only** write path that populates deal data the deals page reads.

### 3a. StatusActionPanel — Won button

**File:** `src/components/leads/StatusActionPanel.tsx`

**Visibility:** `canAct` must be true (agent assigned to lead, manager in lead’s domain, or admin/founder). The **Won** button renders only when `lead.status === 'in_discussion'`. It does not appear for `new`, `touched`, `nurturing`, `won`, `lost`, or `junk` (except other actions like Revive on junk).

**`fireDeal(deal)`:** Does **not** call `recordDeal` directly. It runs inside `startTransition`, calls `recordDeal({ leadId, deal_type, deal_duration, deal_amount })`, handles errors on the modal, closes on success, and `router.refresh()`. Opening the flow is `onClick={() => setActiveModal('won')}`, which mounts `WonDealModal` with `onConfirm={fireDeal}`.

### 3b. WonDealModal

**File:** `src/components/leads/WonDealModal.tsx` — composes `src/components/ui/modal.tsx` (`maxWidth="max-w-md"`).

**Two-step flow:**

1. **Step `type`:** Choose Membership or Retail (`DEAL_TYPES` cards). Next disabled until a type is selected.
2. **Step `details`:** Recap chip + **duration** (membership only: 3M / 6M / 1Y chips from `DEAL_DURATIONS`) + **deal amount** (₹ prefix, `inputMode="decimal"`, commas allowed). Submit runs client validation then `onConfirm`.

**Atomic write order (server):** `recordDeal` updates `deal_type`, `deal_duration`, and `deal_amount` on the lead **first**, then calls `updateLeadStatus({ leadId, status: 'won' })`. Rationale: `won` is the terminal lifecycle event; deal commercial fields must exist before that transition so `/deals` queries (`deal_amount IS NOT NULL` + `status = 'won'`) are consistent and the summary RPC never sees a won lead missing amount. If the deal update fails, status is not changed.

**UI pending copy:** “Recording deal and closing lead…” while `isPending`.

### 3c. `recordDeal` action

**File:** `src/lib/actions/leads.ts`

**Schema:** `RecordDealSchema` in `src/lib/validations/lead-schema.ts`

| Field | Rules |
| --- | --- |
| `leadId` | UUID |
| `deal_type` | `'membership'` \| `'retail'` |
| `deal_duration` | `'3_months'` \| `'6_months'` \| `'1_year'`, nullable, optional |
| `deal_amount` | number, positive, max `100_000_000` |

**Refine:** If `deal_type === 'membership'`, `deal_duration` must be non-null (“Please select a membership duration.”).

**Auth / access:** `getCurrentProfile()`; lead fetched with session client; access same as other lead mutations — agent (assigned), manager (domain match), admin, founder.

**DB order:**

1. `createAdminClient().from('leads').update({ deal_type, deal_duration: membership ? duration : null, deal_amount })`
2. `return updateLeadStatus({ leadId, status: 'won' })`

**Side effects from `updateLeadStatus('won')` (not duplicated in `recordDeal`):**

- `update_lead_status` RPC: lead status update, `status_changed_at`, activity log, nurturing task rules as applicable.
- In-app notifications: `lead_won` to active managers/admins/founders in the lead’s domain.
- SLA: `cancelSlaTimersForLead` (`won` ∈ `TERMINAL_SLA_STATUSES`).
- No separate WhatsApp send in `updateLeadStatus` for won; assignment paths use `sendLeadAssignmentNotification` elsewhere.

Returns `{ data: { leadId }, error: null }` from `updateLeadStatus` on success.

---

## 4. Database RPCs

### 4a. `get_deals_summary` (migrations 0052, 0053)

**Files:**

- `supabase/migrations/20260531000052_get_deals_summary.sql` — initial RPC (superseded signature).
- `supabase/migrations/20260531000053_get_deals_summary_manager_domain_fix.sql` — current signature.

**Current signature (0053):**

```sql
get_deals_summary(
  p_role           text,
  p_caller_domain  text,
  p_filter_domain  text DEFAULT NULL,
  p_agent_id       uuid DEFAULT NULL,
  p_deal_type      text DEFAULT NULL,
  p_date_from      timestamptz DEFAULT NULL,
  p_date_to        timestamptz DEFAULT NULL
)
```

**Returns one row:**

| Field | Type | Meaning |
| --- | --- | --- |
| `total_deals` | `int` | Count of matching won deals |
| `total_revenue` | `numeric` | `SUM(deal_amount)` |
| `membership_count` | `int` | Rows with `deal_type = 'membership'` |
| `retail_count` | `int` | Rows with `deal_type = 'retail'` |

**Structural WHERE (always):** `archived_at IS NULL`, `status = 'won'`, `deal_amount IS NOT NULL`.

**Security:** `STABLE SECURITY DEFINER SET search_path = public` — bypasses RLS; role gates are explicit in SQL. `GRANT EXECUTE` to `authenticated`.

**Date filters:** `status_changed_at >= p_date_from` and `<= p_date_to` — **not** `created_at`.

### The `p_caller_domain` / `p_filter_domain` split (migration 0053)

**What went wrong in 0052:** A single `p_domain` parameter served two roles:

1. Manager role-gate: `l.domain = p_domain` (must be server-verified caller domain).
2. Admin/founder optional slice: `l.domain = p_domain` (user URL filter).

A caller passing a tampered `p_domain` on a manager request could theoretically satisfy the manager gate with a filter value instead of the profile domain.

**Fix in 0053:**

| Parameter | Source | Used for |
| --- | --- | --- |
| `p_caller_domain` | `profile.domain` from server (`getDealsSummary` always passes verified `domain` arg) | Manager gate only: `l.domain = p_caller_domain::app_domain` |
| `p_filter_domain` | `filters.domain` from URL (admin/founder); `null` for manager | Optional slice: `l.domain = p_filter_domain` when role is admin/founder and param non-null |

Manager SQL **never reads** `p_filter_domain` for scoping. Service layer: `rpcFilterDomain = null` when `role === 'manager'` or `role === 'agent'`.

**Why it matters:** Managers cannot widen or redirect domain scope via query string; only `p_caller_domain` from the server enforces their boundary.

### 4b. `getDealsByRole` (service — no list RPC)

**File:** `src/lib/services/deals-service.ts`

**Query:** `leads` with join `assignee:profiles!leads_assigned_to_fkey(full_name)`.

**Structural constraints (always, before filters):**

- `archived_at IS NULL`
- `status = 'won'`
- `deal_amount IS NOT NULL`
- Order: `status_changed_at` DESC

**Role scoping (first, cannot be overridden by URL):**

| Role | Constraint |
| --- | --- |
| `agent` | `assigned_to = userId`; `DealFilters.agent_id` ignored |
| `manager` | `domain = domain` (caller’s `AppDomain` arg); optional `filters.agent_id` |
| `admin` / `founder` | No mandatory domain; optional `filters.domain` (Gia domain via `isGiaDomain`) and `filters.agent_id` |

**Optional filters:** `deal_type`, `date_from` / `date_to` on **`status_changed_at`** (`date_to` → end-of-day `T23:59:59.999Z` in service), `search` (trimmed lowercased ILIKE on first_name, last_name, phone, email).

**Returns:** `{ deals: DealWithAssignee[], totalCount: number }`.

**Count:** `{ count: 'exact', head: false }` on the **same** query builder after all constraints — never a second `COUNT(*)` query.

**Pagination:** `.range(offset, offset + pageSize - 1)` always applied; default `pageSize` 50, `page` min 1.

**Client:** Session Supabase client (`createClient()`); RLS applies in addition to explicit role filters.

---

## 5. Types

### `DealFilters`

**Defined in:** `src/lib/types/database.ts`

```typescript
export type DealFilters = {
  search:    string | null
  domain:    AppDomain | null   // admin/founder; parseGiaDomainParam() on page
  deal_type: string | null      // 'membership' | 'retail'
  agent_id:  string | null
  date_from: string | null      // ISO date → status_changed_at
  date_to:   string | null
  page:      number
  pageSize:  number
}
```

**No `status` field:** All deals are won by definition. `status = 'won'` is applied inside `getDealsByRole` / RPC, not via URL. A `status` param on `DealFilters` would be meaningless and could break the mental model that this page is a won-deal register, not a general lead list.

### `DealWithAssignee`

**Defined in:** `src/lib/services/deals-service.ts` as `export type DealWithAssignee = LeadWithAssignee` (full lead row + `assignee: { full_name } | null` from join).

Includes `id`, `slug`, names, phone, email, `domain`, `deal_amount`, `deal_type`, `deal_duration`, `status_changed_at`, `assigned_to`, etc.

### `DealsResult`

```typescript
export type DealsResult = {
  deals:      DealWithAssignee[]
  totalCount: number
}
```

### `DealsSummary`

```typescript
export type DealsSummary = {
  total_deals:      number
  total_revenue:    number
  membership_count: number
  retail_count:     number
}
```

Mirrors `get_deals_summary` return row; numeric coercion in `getDealsSummary` service.

---

## 6. Service — `deals-service.ts`

### `getDealsByRole(role, userId, domain, filters?)`

- **Returns:** `Promise<DealsResult>`
- **Pattern:** Single PostgREST select with count, role gates, filters, range.
- **Client:** `createClient()` (server session).
- **Called by:** `DealsAsync` only.

### `getDealsSummary(role, userId, domain, filters)`

- **Returns:** `Promise<DealsSummary>` (zeros on error/empty).
- **Pattern:** `.rpc('get_deals_summary', { p_role, p_caller_domain, p_filter_domain, p_agent_id, p_deal_type, p_date_from, p_date_to })` with `p_agent_id = userId` for agents.
- **Client:** Session client (`as any` for RPC typing).
- **Called by:** `DealsAsync` in parallel with `getDealsByRole`.

**Pre-mortem:** RPC filter params must mirror `getDealsByRole` or the summary strip disagrees with the card list.

---

## 7. Page Architecture

### 7a. `page.tsx` (thin orchestrator)

**Fetches once:** `getLeadFilterOptions(profile.role, profile.domain, null)` — reuses leads filter infrastructure for the **agent** dropdown (`agents: { id, full_name }[]`). Not re-fetched inside `DealsFilters`.

**`parseFilters(searchParams, role, callerDomain)`:**

- Builds `DealFilters` from URL.
- **No status param** — type has no status field; nothing to strip (status is never parsed from URL).
- **Manager domain:** `domain: null` in filters; manager scope uses `profile.domain` passed to `DealsAsync` / service, not URL `domain`.
- **Agent:** `agent_id: null` in filters (defence in depth; service enforces `assigned_to = userId`).
- **Admin/founder domain:** `parseGiaDomainParam(getString('domain'))`.
- `pageSize`: constant `50`; `page` from URL, default `1`.

**Flags:** `showDomainFilter = admin || founder`; `showAgentFilter = role !== 'agent'`.

**Tree:**

```text
<main>
  <h1>Deals + page-title-dot</h1>
  <DealsFilters role showDomainFilter showAgentFilter agents />
  <Suspense fallback={<DealsSkeleton />}>
    <DealsAsync role userId domain filters pageSize />
  </Suspense>
</main>
```

### 7b. `DealsFilters`

**File:** `src/components/deals/DealsFilters.tsx` — `'use client'`.

| Control | URL param | Notes |
| --- | --- | --- |
| Search | `search` | `SearchBar`; **500ms** debounce; resets page |
| Deal type | `deal_type` | Single-select `FilterDropdown`; `DEAL_TYPE_LABELS` |
| Domain | `domain` | Admin/founder only; clears `agent_id` on change |
| Agent | `agent_id` | Manager+ only; options from page-level `agents` |
| Date range | `date_from`, `date_to` | `DatePicker`; applied to **won date** (`status_changed_at`) |

**`buildFilterParams`:** All pushes use `{ resetKeys: ['page'] }` so filter/search changes return to page 1.

**`useTransition`:** Every `router.push` from filters.

**Clear:** Shown when `activeCount > 0` (search, domain, deal_type, agent, either date). Clears URL to `pathname` only and local search state.

### 7c. `DealsAsync`

**Parallel fetch:**

```typescript
Promise.all([
  getDealsByRole(role, userId, domain, filters),
  getDealsSummary(role, userId, domain, filters),
])
```

Same `filters` object keeps strip and list aligned.

**Renders:**

1. `DealsSummaryStrip`
2. Empty Playfair italic: “Nothing matches these filters.” vs “No deals recorded yet.”
3. `DealCard` list (`gap: space-3`)
4. `LeadsPagination` when `totalCount > pageSize` (50)

### 7d. `DealCard`

**Three zones (left → centre → right):**

- **Left:** Playfair italic full name; mono phone; domain `status-pill` via `DOMAIN_LABELS`.
- **Centre:** Deal type chip (membership accent surface); duration chip if membership + `deal_duration`.
- **Right:** Playfair accent `formatCurrency(deal_amount)`; “Won {formatDate(status_changed_at, 'dd MMM yyyy')}”; assignee `full_name`.

**Link:** `href={/leads/${deal.slug ?? deal.id}}` — dossier route, **never** `/deals/[id]`. `slug ?? id` because slugs were backfilled in migrations 0045–0046; pre-migration or edge rows may have `slug: null`; UUID always works.

**Motion:** `motion.div` — `opacity 0→1`, `y 4→0`, 250ms, `EASE_OUT_EXPO`, stagger `Math.min(index * 80, 320) ms`. Link hover: `translateY(-1px)`, `--shadow-2`.

### 7e. `DealsSummaryStrip`

Four cells in a horizontal paper strip: **Total Deals**, **Total Revenue**, **Memberships**, **Retail**.

- Counts: `formatCount`
- Revenue: `formatCurrency` (INR `en-IN` default)
- Values: Playfair, `--theme-accent`; labels: `label-micro`

### 7f. `DealsSkeleton`

- Summary strip: 4 cells, 80px height, skeleton bars.
- **5** card row skeletons, `animationDelay` **0 / 80 / 160 / 240 / 320** ms (`Math.min(i * 80, 320)`).

---

## 8. Reuse

### `LeadsPagination`

**Reuse decision:** Pagination UX is identical to the leads list (URL `page` param, prev/next, disabled `pointer-events: none`). Rather than fork a deals-specific component, `/deals` imports `src/components/leads/LeadsPagination.tsx`.

**Props passed from `DealsAsync`:**

```typescript
<LeadsPagination
  page={filters.page ?? 1}
  pageSize={pageSize}      // 50
  totalCount={totalCount}
/>
```

**Note:** Footer copy still says “lead(s)” (`Showing X–Y of Z lead(s)`). Functionally correct for pagination math; copy is shared with leads.

**Absent from DOM when:** `totalCount <= pageSize` (no pagination for ≤50 deals).

---

## 9. Access Control Summary

| Action | agent | manager | admin | founder |
| --- | --- | --- | --- | --- |
| View deals list | Own assigned won deals only | Domain won deals | All (optional domain filter) | All (optional domain filter) |
| View summary strip | Same scope as list | Same | Same | Same |
| Filter by domain (URL) | — | — (locked to profile domain in service/RPC) | Yes | Yes |
| Filter by agent (URL) | — (hidden; `agent_id` forced null on page) | Yes | Yes | Yes |
| Capture deal (dossier) | If assigned | If lead in domain | Yes | Yes |

RLS on `leads` still applies to the session client list query. RPC summary uses explicit SQL role gates with server-verified `p_caller_domain`.

---

## 10. Known Invariants (must never be violated)

1. **`DealFilters` has no `status` field** — all rows are won; `status = 'won'` is structural in service/RPC, not a URL filter.

2. **`getDealsByRole` returns `{ deals, totalCount }`** — never a bare array. Every call site destructures both.

3. **Date range filters use `status_changed_at`** — never `created_at` — in both `getDealsByRole` and `get_deals_summary`.

4. **Agent role constraint wins over URL `agent_id`** — `assigned_to = auth.uid()` applied first; crafted `?agent_id=` cannot show another agent’s deals.

5. **`DealCard` links to `/leads/${slug ?? id}`** — never `/deals/[id]`; slug fallback mandatory.

6. **`p_caller_domain` is server-verified only** — always `profile.domain` from the orchestrator; never from URL. **`p_filter_domain`** is the optional admin/founder slice. Manager gate uses only `p_caller_domain`.

7. **`totalCount` from the same query builder as the list** — `{ count: 'exact', head: false }`; no second COUNT query.

8. **Manager domain locked in service/RPC** — not via URL `domain` on `DealFilters` (`parseFilters` sets `domain: null` for managers).

9. **Summary RPC filters must mirror list filters** — or strip totals disagree with visible cards.

10. **`recordDeal` writes deal columns before `updateLeadStatus('won')`** — deal amount must exist before terminal won transition for list eligibility.

11. **Deals page display requires `deal_amount IS NOT NULL`** — won leads without `recordDeal` do not appear.

12. **Filter/search navigation resets page** — `buildFilterParams(..., { resetKeys: ['page'] })` on every `DealsFilters` push.

---

## File index

| Area | Path |
| --- | --- |
| Route orchestrator | `src/app/(dashboard)/deals/page.tsx` |
| Async content | `src/app/(dashboard)/deals/DealsAsync.tsx` |
| Skeleton | `src/app/(dashboard)/deals/DealsSkeleton.tsx` |
| Authority | `src/app/(dashboard)/deals/CLAUDE.md` |
| Filters / cards / strip | `src/components/deals/*.tsx` |
| Won capture | `src/components/leads/StatusActionPanel.tsx`, `WonDealModal.tsx` |
| Service | `src/lib/services/deals-service.ts` |
| Actions / schema | `src/lib/actions/leads.ts` (`recordDeal`), `src/lib/validations/lead-schema.ts` |
| Types | `src/lib/types/database.ts` (`DealFilters`) |
| Constants | `src/lib/constants/deal-types.ts` |
| Migrations | `20260531000049_*`, `20260531000052_*`, `20260531000053_*` |
| Pagination reuse | `src/components/leads/LeadsPagination.tsx` |
