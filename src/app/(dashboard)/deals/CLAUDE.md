# Deals Page — CLAUDE.md

## Domain → type → category rule (source of truth: `DOMAIN_DEAL_CONFIG`)

A deal's `deal_type` is **derived from its Gia domain — never free-picked** (decision-log
2026-06-15). The single source is `DOMAIN_DEAL_CONFIG` in `src/lib/constants/deal-types.ts`
(the `DOMAIN_INTERESTS` pattern):

| Domain | `deal_type` | `deal_category` |
| --- | --- | --- |
| `onboarding` | `membership` (needs a `deal_duration`) | none (null) |
| `shop` | `retail` | **required** — watch / bag / event / jewellery / small_luxury / accessories / other |
| `house` | `sale` | none (null) |
| `legacy` | `sale` | none (null) |

`DOMAIN_DEAL_CONFIG` drives **all four layers** — never re-hardcode the type/category lists:

- **Form** (`NewDealModal`, `WonDealModal`): auto-sets the type from the chosen/lead domain (shown
  read-only), shows the category picker only when `categories ≠ null` (shop), the duration chips
  only for membership.
- **Action** (`resolveDealShapeForDomain` in `lib/actions/deals.ts`): derives the type server-side
  and cross-validates the form's extras against it. **A client-sent `deal_type` is ignored** —
  `recordDeal` derives from the lead's domain, `createWalkInDeal` from the server-forced deal
  domain. The Zod schemas no longer carry a `deal_type` field.
- **Filter** (`DealsFilters`): the Category dropdown reads `DEAL_CATEGORY_OPTIONS`; the Type
  dropdown reads `DEAL_TYPE_OPTIONS`.
- **DB** (migration 0122): `deals_deal_type_check` (`membership`/`retail`/`sale`),
  `deals_deal_category_check` (value whitelist), `deals_retail_category_check` (`retail ⇒ category
  NOT NULL`, `non-retail ⇒ category NULL`). The CHECKs are the backstop; the action returns clean
  copy first.

**Adding a Gia domain or retail category = one `{ id, label }` / config line + one CHECK-extending
migration.** Never fork the mapping.

---

## Architecture: Three-Component Split

```
deals/page.tsx                  ← Server component (thin orchestrator)
  │  reads searchParams
  │  calls getLeadFilterOptions() ONCE for agent dropdown
  │  resolves caller role + profile
  │  renders AddDealButton (client, holds modal state)
  │
  ├── <AddDealButton />          ← Client component — New Deal button + NewDealModal
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

## Source table (post-migration 0072)

`getDealsByRole` and `getDealsSummary` read from `public.deals`, NOT `leads`.

Every row in `public.deals` is a closed deal. There is no `status = 'won'` gate — the table
only contains deals. The structural WHERE collapses to `archived_at IS NULL`.

**Walk-in deals:** `lead_id = null`. These are direct sales with no lead lifecycle.
`client_id` is also `null` for now — reserved for the future clients module.

---

## Three Invariants — Never Violate

1. **`getDealsByRole` returns `{ deals: DealWithRelations[], totalCount: number }` — never `Deal[]` alone.**
   `totalCount` from `{ count: 'exact', head: false }` on the same query builder that has all role
   constraints and filters applied — never a second query.

2. **`DealFilters` has no `status` field.**
   Every row in `public.deals` is a deal. No status gate is ever needed.

3. **Agent role gate (`assigned_to = uid`) is the first constraint in `getDealsByRole`.**
   Applied before `DealFilters`. A crafted `?agent_id=<other-uuid>` URL param cannot surface
   another agent's deals — the role constraint wins unconditionally.

---

## DealWithRelations Type

Defined in `src/lib/types/database.ts`. Replaces the old `DealWithAssignee` alias.

```typescript
export type DealWithRelations = Deal & {
  lead:     { slug: string | null } | null   // null for walk-in deals
  assignee: { full_name: string } | null
}
```

**Never import `DealWithAssignee` — it no longer exists. Use `DealWithRelations`.**

---

## DealFilters Type

Defined in `src/lib/types/database.ts`.

```typescript
export type DealFilters = {
  search:        string | null
  domain:        AppDomain | null   // admin/founder only; parseGiaDomainParam() validates
  deal_type:     string | null      // 'membership' | 'retail' | 'sale'
  deal_category: string | null      // retail product category; surfaced when domain=shop
  agent_id:      string | null
  date_from:     string | null
  date_to:       string | null
  page:          number
  pageSize:      number
}
```

**No `status` field — see invariant 2 above.** `deal_category` is only meaningful inside the
`shop` slice (the sole category-bearing `deal_type`); `DealsFilters` surfaces its dropdown only when
the active domain filter is `shop`, and clears it atomically on any domain change.

---

## getDealsSummary RPC Contract

Current signature (migration 0074):
`get_deals_summary(p_role, p_caller_domain, p_filter_domain, p_agent_id, p_deal_type, p_date_from, p_date_to)`

- Source table: `public.deals` (was `leads` in 0052/0053)
- SECURITY DEFINER — RLS bypassed; role gate enforced explicitly in WHERE clause
- Must apply the same role+filter constraints as `getDealsByRole`
- Date range applied to `won_at` (was `status_changed_at` on leads)
- Returns exactly one row: `total_deals, total_revenue, membership_count, retail_count`

**Two-domain parameter split — do not collapse back into one:**

| Param | Source | Used for |
| --- | --- | --- |
| `p_caller_domain` | `profile.domain` (server-verified) | Manager role-gate: `d.domain = p_caller_domain` |
| `p_filter_domain` | `filters.domain` (user-supplied, null for manager) | Admin/founder domain slice only |

---

## Date Range Rule

Date filters apply to `won_at` (the timestamp the deal was recorded), NOT `created_at` or
`status_changed_at`. `won_at` is immutable after insert.

The `date_to` end-of-day transform (`T23:59:59.999Z`) is applied in `getDealsByRole` and
mirrored in `getDealsSummary` — never in components.

---

## DealCard — Walk-in vs Lead-sourced

**Lead-sourced deal** (`lead_id IS NOT NULL`):
- Rendered as a `<Link href="/leads/${lead.slug ?? lead_id}">` card.
- `slug` comes from the joined `lead` field (`lead.slug`). Fallback to `lead_id` for old rows.

**Walk-in deal** (`lead_id IS NULL`):
- Rendered as a non-link `<div>` card (no dossier to link to).
- Shows a "Walk-in" pill (info colour — never a coloured edge border per Never-Do list).
- Contact name/phone come from `deal.contact_name` and `deal.contact_phone`.

**Both display `won_at` for the "Won {date}" line.** Never use `status_changed_at`.

---

## New Deal Flow

`AddDealButton` (client) opens `NewDealModal` (two-step: Contact → Details).
`NewDealModal` calls `createWalkInDeal` from `src/lib/actions/deals.ts`.
On success: `router.refresh()` — no manual cache invalidation needed.

**Domain/assignee enforcement (server-side, mirrors createManualLead):**
- Agent: domain = caller.domain, assigned_to = caller.id (always forced server-side)
- Manager: domain = caller.domain; assigned_to may be any active agent in their domain
- Admin/founder: may pick any Gia domain and any agent in that domain

**`deal_type` is derived from the resolved domain — never sent by the client.** The Details step
shows the type read-only and surfaces the type-dependent extra: a product-category `<select>` for
shop (retail), duration chips for onboarding (membership), nothing for house/legacy (sale). The
action re-derives the type from the server-forced domain via `resolveDealShapeForDomain` and ignores
any client-supplied type — see the "Domain → type → category rule" section at the top.

**Walk-in deals never touch leads, SLA timers, or activity logs.**
They insert a single `deals` row and nothing else.

---

## Agent Filter Security

`getDealsByRole` enforces `assigned_to = auth.uid()` for the `agent` role **before** applying
`DealFilters.agent_id`. URL param `?agent_id=<other-uuid>` returns no other agent's deals — the
role constraint wins unconditionally.

`page.tsx` sets `agent_id: null` in `parseFilters` when `role === 'agent'` as a defence-in-depth
measure, but the service-layer guard is the authoritative one.

---

## URL Param Keys

| Filter        | URL param       | Type              |
|---------------|-----------------|-------------------|
| search        | `search`        | string (debounced 500ms) |
| domain        | `domain`        | AppDomain (admin/founder only) |
| deal_type     | `deal_type`     | 'membership' \| 'retail' \| 'sale' |
| deal_category | `deal_category` | retail category (shown only when `domain=shop`; cleared on domain change) |
| agent_id      | `agent_id`      | UUID string (manager+ only) |
| date from | `date_from` | ISO date string (applied to won_at) |
| date to   | `date_to`   | ISO date string (applied to won_at) |
| page      | `page`      | integer (default 1) |

Every filter/search change deletes the `page` param via `buildFilterParams(..., { resetKeys: ['page'] })`.

---

## Actions

| Action | File | Description |
| --- | --- | --- |
| `recordDeal` | `lib/actions/deals.ts` | Lead → deal path. Derives `deal_type` from the **lead's** domain (`resolveDealShapeForDomain`), inserts `deals` row, then delegates `updateLeadStatus('won')` for all side-effects. |
| `createWalkInDeal` | `lib/actions/deals.ts` | Walk-in / direct sales. No lead involved. `lead_id = null`. Derives `deal_type` from the server-forced deal domain. |
| `listAgentsForDealDomain` | `lib/actions/deals.ts` | Read action for NewDealModal assignee picker. |

**`resolveDealShapeForDomain(domain, {deal_duration, deal_category})`** (`lib/actions/deals.ts`) is
THE domain → `{type, duration, category}` resolver shared by both write actions. The type is derived
from `DOMAIN_DEAL_CONFIG`; the form's extras are cross-validated against it (membership ⇒ duration,
retail ⇒ valid category, sale ⇒ neither). A client-sent `deal_type` is never read.

`recordDeal` is also re-exported from `lib/actions/leads.ts` for back-compat with `StatusActionPanel`.

---

## What is OUT OF SCOPE (do not build)

- The `clients` table — `client_id` column exists, FK deferred.
- Any `renews_deal_id` / renewal chain — renewals are flat rows under a (future) client.
- Making deal-insert + lead-status-flip a single transaction — two-step "insert first, flip second" is intentional for now.
