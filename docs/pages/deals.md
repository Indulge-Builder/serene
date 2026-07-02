# Deals — Page Spec

> **Purpose:** spec for `/deals` — every closed commercial transaction (lead-won and walk-in), list + summary strip + New Deal write path.
> **Audience:** engineers. · **Source-of-truth scope:** the deals page, `deals-service.ts`, `deals.ts` actions, `get_deals_summary`. Table schema: `../architecture/database.md` § deals; the dossier's Won flow UI: `lead-dossier.md`.
> **Last verified:** 2026-07-02 (This Month default landing + `?dates=all` escape hatch, `revalidatePath('/deals','page')` on both write actions, `recordDealCore` refactor + `resolveDealShapeForDomain` move to `constants/deal-types.ts`, `SourcePill` on `DealCard`, Elaya `log_deal` as the third creation path; earlier: post 0122 domain-derived `deal_type`, `deal_created` notification, summary-strip domain scoping).

## 1. Purpose

A deal is a closed commercial transaction — every `public.deals` row is one by definition (no
`status='won'` gate). First-class table since migration 0072 (reverses the 2026-05-31
"deals = won leads" model; Decision Log in `../rules/The_Rules.md`). Three creation paths:
**lead → deal** (`recordDeal` from the dossier's Won flow; it runs the shared `recordDealCore`,
which inserts the deal then flips Won via `updateLeadStatusCore` for all side-effects),
**walk-in** (`createWalkInDeal`, `lead_id = null`, no lead-row lifecycle, via `AddDealButton`
on the page), and **Elaya `log_deal`** (a propose→confirm write tool that runs the SAME
`recordDealCore`; the shape is validated at propose time and it executes only in
`executeProposedAction`). The walk-in path fans out a `deal_created` notification to the
domain's managers/admins/founders (the lead → deal path does not; its `lead_won` flip already
notifies the same recipients). The walk-in path never touches the `leads` row, SLA timers, or
activity logs.

## 2. Who sees it

Agents: own `assigned_to` deals. Managers: domain. Admin/founder: all (+ domain filter).
Walk-in creation: agents self-assigned in own domain; managers any agent in own domain;
admin/founder any Gia domain. Full matrix + the intentional no-write-RLS-policy note
(migration 0094): Deep dive §10.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `deals-service.ts` — `getDealsByRole` (joins `lead(slug)` + assignee), `getDealsSummary` (RPC wrapper), `getLeadDeal(leadId)` (dossier card) |
| RPC | `get_deals_summary` (0052/0053/0074) — totals/revenue/membership/retail; `p_caller_domain` vs `p_filter_domain` split |
| Actions | `deals.ts` — `recordDeal`, `createWalkInDeal` (domain-locked server-side for agents), `listAgentsForDealDomain` |
| Shared write body | `recordDealCore` in `services/lead-mutations.ts`: the ONE deal-insert + Won-flip body; `recordDeal` and Elaya's `log_deal` both call it (R-01) |
| Validation | `deal-schema.ts`; constants `deal-types.ts` (`defineEnum` + `resolveDealShapeForDomain`) |

## 4. Components

`page.tsx` + Suspense async child · `DealsFilters` (composes `<FilterBar>` + `useUrlFilters`) ·
`DealsSummaryStrip` (composes `StatTile variant="cell"`) · `DealCard` (card-list mode,
motion.div) · `AddDealButton` (`MotionButton`) + `NewDealModal` (on-intent dynamic) ·
`LeadDealCard` is the dossier's distinct display component — not this list's `DealCard`.

## 5. States

- **Loading:** `deals/loading.tsx` (PageSkeletons composition).
- **Empty:** `<EmptyState>` serif-italic (no deals yet / no matches).
- **Error:** `{ error }` branches → inline message bars; summary strip degrades to zeros with a logged warning.

## 6. Invariants

Deep dive §11 — `won_at` immutable; `lead_id` nullable only for walk-ins; membership requires
duration; deal writes admin-client-only; revenue always reads `public.deals` (never the
dropped `leads.deal_*`).

## 7. Open items

`client_id` is a reserved column — FK lands with the future clients module (post-won flow).

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document.

### 1. Module Overview

**What deals are:** A deal is a closed commercial transaction. Every row in `public.deals` is a
deal. There is no `status = 'won'` gate — the table contains only deals by definition.

**`public.deals` is a first-class table** (migration 0072, 2026-06-05). This reverses the
2026-05-31 decision that stored deal data on `public.leads`. Reason: one lead has one terminal
`won` and cannot hold repeat/renewal deals; walk-in sales (direct purchases without a CRM lead
lifecycle) cannot be represented at all in the old model. Decision Log: `../rules/The_Rules.md` (2026-06-05 entry).

**Three creation paths:**

1. **Lead → deal** (`recordDeal`): Agent marks a lead won via `StatusActionPanel` → `WonDealModal`.
   The action delegates to the shared `recordDealCore` (`services/lead-mutations.ts`), which
   inserts a `deals` row with `lead_id` set, then flips Won via `updateLeadStatusCore` for all
   side-effects (notifications, SLA cancel, Redis). Revalidation stays in the action.
2. **Walk-in deal** (`createWalkInDeal`): Standalone deal with `lead_id = null`. No lead-row
   lifecycle (no status flip, no SLA, no activity log). It **does** fan out a `deal_created`
   notification to the domain's managers/admins/founders (see §4c). Created via the New Deal button
   on `/deals`.
3. **Elaya `log_deal`** (2026-06-26): a STATE-CHANGING, propose-only write tool
   (`src/lib/elaya/tools/write-registry.ts`). `run()` never mutates; the deal shape (`deal_type`
   derived from the lead's domain) is validated at propose time, and the write executes only in
   `executeProposedAction`'s `log_deal` branch, via the same `recordDealCore` (R-01).

**Route:** Single primary nav page at `/deals` — `src/app/(dashboard)/deals/page.tsx`.

**Sidebar:** `Trophy` icon (`lucide-react`), label **Deals**, in `MAIN_NAV` immediately below
**Leads** (`src/components/layout/Sidebar.tsx`).

**`/deals` is no longer read-only.** The New Deal button (`AddDealButton`) is always visible
to authenticated non-guest roles and opens `NewDealModal` for walk-in deal creation.

---

### 2. Data Model — `public.deals` Table (migration 0072)

```sql
CREATE TABLE public.deals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  client_id     uuid NULL,        -- FK deferred to clients module; always null for now
  contact_name  text NOT NULL,
  contact_phone text NOT NULL,    -- E.164, normalised before insert
  contact_email text NULL,
  domain        app_domain NOT NULL,
  deal_amount   numeric(12,2) NOT NULL CHECK (deal_amount > 0 AND deal_amount <= 100000000),
  deal_type     text NOT NULL CHECK (deal_type IN ('membership','retail','sale')),       -- 'sale' added migration 0122
  deal_duration text NULL CHECK (deal_duration IS NULL OR deal_duration IN ('3_months','6_months','1_year')),
  deal_category text NULL CHECK (deal_category IS NULL OR deal_category IN ('watch','bag','event','jewellery','small_luxury','accessories','other')),  -- migration 0122
  assigned_to   uuid NULL REFERENCES public.profiles(id),
  source        text NULL CHECK (source IS NULL OR source IN ('meta','google','website','whatsapp','referral','ypo','events')),  -- migration 0075
  won_at        timestamptz NOT NULL DEFAULT now(),  -- defaults to now(); walk-ins may supply a past Deal Date. Immutable after insert.
  archived_at   timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deals_membership_duration_check
    CHECK (deal_type <> 'membership' OR deal_duration IS NOT NULL),
  CONSTRAINT deals_retail_category_check                                                 -- migration 0122
    CHECK ((deal_type = 'retail' AND deal_category IS NOT NULL)
        OR (deal_type <> 'retail' AND deal_category IS NULL))
);
```

**Domain → type → category rule (migration 0122, decision-log 2026-06-15):** `deal_type` is
**derived from the deal's Gia domain — never free-picked** (`DOMAIN_DEAL_CONFIG` in
`src/lib/constants/deal-types.ts`): `onboarding → membership`, `shop → retail` (+ a required
`deal_category`), `house`/`legacy` → `sale`. The type is set server-side in `recordDeal` (from the
lead's domain) and `createWalkInDeal` (from the server-forced deal domain) via
`resolveDealShapeForDomain`; a client-sent `deal_type` is ignored. The `deals_retail_category_check`
couples `retail ⇔ category`. The category filter on `/deals` surfaces only inside the `shop` slice.

**Key column rules:**

- `lead_id` is **nullable**. Walk-in deals have `lead_id = null`. Lead-sourced deals have it set.
  On `ON DELETE SET NULL` — deleting a lead nullifies the FK but preserves the deal row.
- `client_id` is **always null** until the clients module is built. Column exists as the future FK hook.
- `won_at` is **immutable** after insert, but no longer always `now()`. Lead-sourced deals
  (`recordDeal`) set it to insert time. Walk-in deals (`createWalkInDeal`) may supply a
  user-picked **Deal Date** (`NewDealModal` → `DatePicker`, capped at today); it falls back to
  `now()` when omitted. Once written it is never UPDATEd. This fixes the `status_changed_at`
  caveat where re-transitions could overwrite the date.
- `source` (migration 0075) mirrors `leads.source`. Nullable. Lead-sourced deals leave it null
  (the lead already carries the source); walk-ins may set it from the optional Source picker.
  Same CHECK vocabulary as `LEAD_SOURCE_ENUM`.
- `domain` lives **on the deal**, not derived from the lead. Walk-ins require it directly.
- `contact_name/phone/email` are copied from the lead at insert time (lead-sourced) or provided
  directly (walk-in). They are the future client join key.

**Business rules (same as before):**

- Membership: `deal_duration` required; enforced by DB CHECK + Zod + UI.
- Retail: `deal_duration` always `NULL` on write.

**Constants:** `src/lib/constants/deal-types.ts` — `DEAL_TYPES`, `DEAL_TYPE_LABELS`,
`DEAL_DURATIONS`, `DEAL_DURATION_LABELS`, `DealType`, `DealDuration`.

---

### 3. Won-Deal Capture Flow (lead dossier → `deals` table)

#### 3a. StatusActionPanel — Won button

**File:** `src/components/leads/StatusActionPanel.tsx`

Unchanged from before: the Won button renders when `lead.status === 'in_discussion'`, `canAct`
is true. Clicking opens `WonDealModal`.

#### 3b. WonDealModal

**File:** `src/components/leads/WonDealModal.tsx`. Takes the lead's `domain` prop and **derives the
deal type from it** (`DOMAIN_DEAL_CONFIG`) — the type is shown read-only, no picker. Single-step
(2026-06-15; the old "type → details" step was removed now that the type is derived): the recap +
the type-dependent extra (Product Category for shop/retail, Duration chips for onboarding/membership,
nothing for house/legacy/sale) + Amount. `onConfirm` passes `{ deal_duration, deal_category,
deal_amount }` (no `deal_type`) to `recordDeal` from `src/lib/actions/leads.ts` (re-export from
`deals.ts`), which re-derives the type from the lead's domain.

#### 3c. `recordDeal` action

**Canonical file:** `src/lib/actions/deals.ts`
**Re-exported from:** `src/lib/actions/leads.ts` (back-compat for `StatusActionPanel`)

**Schema:** `RecordDealSchema` in `src/lib/validations/deal-schema.ts`
(also re-exported from `lead-schema.ts` for back-compat).

| Field | Rules |
| --- | --- |
| `leadId` | UUID |
| `deal_duration` | `'3_months'` \| `'6_months'` \| `'1_year'`, nullable, optional (membership) |
| `deal_category` | retail product category, nullable, optional (shop) |
| `deal_amount` | number, positive, max `100_000_000` |

> **No `deal_type` field (2026-06-15).** The type is derived from the lead's domain via
> `resolveDealShapeForDomain` (moved 2026-06-26 from `actions/deals.ts` to
> `src/lib/constants/deal-types.ts`, alongside the `DealShape` types), never sent by the client.
> The schema carries only the type-dependent extras (`deal_duration` for membership,
> `deal_category` for retail); the core picks the right one for the resolved domain.

**Order (refactored 2026-06-26 around `recordDealCore`):**

The write body lives in **`recordDealCore`** (`src/lib/services/lead-mutations.ts`), the SAME
context-free core Elaya's `log_deal` tool runs (R-01). The action keeps the request-context
shell: Zod → `requireProfile` → `hasAccess` (agent assigned / manager domain / admin / founder)
→ fetch lead contact data → core → `revalidatePath`.

Inside the core:

1. **Derive `deal_type` from `lead.domain`** (`resolveDealShapeForDomain`); reject non-Gia domains.
2. Insert the `deals` row (`lead_id`, `contact_*`, `domain`, `deal_type`, `deal_duration`,
   `deal_category`, `deal_amount`, `assigned_to`, `won_at: now()`) via the admin client. This
   **must succeed before the status flip**; the insert-before-flip guarantee lives in the core.
3. Flip Won via `updateLeadStatusCore`: `update_lead_status` RPC, `lead_won` notifications to
   managers/admins/founders, `cancelSlaTimersForLead`, Redis invalidation.

Back in the action: `revalidatePath('/deals', 'page')` + `revalidatePath('/leads')` +
`revalidatePath('/leads/${slug ?? leadId}')`. The `'page'` type matters: the deals page
redirects cold landings to a param-bearing URL (`?date_from=…&date_to=…`), and a pathless
`revalidatePath('/deals')` leaves that variant stale.

**Atomicity note:** Two-step is intentional. A future SECURITY DEFINER RPC could make this a
single transaction — noted, not built.

---

### 4. Walk-In Deal Creation Flow

#### 4a. AddDealButton

**File:** `src/components/deals/AddDealButton.tsx` — `'use client'`.
Thin wrapper holding `useState(open)`. Renders a `Button` with `iconLeft={Plus}`.
Opens `NewDealModal`.

#### 4b. NewDealModal

**File:** `src/components/deals/NewDealModal.tsx` — `'use client'`.
Composes `src/components/ui/modal.tsx` (`maxWidth="max-w-md"`).

**Two-step flow:**

All four pickers are the themed `FilterDropdown` (`multi={false}`), never a native `<select>`
(2026-06-17 — off-palette native selects were replaced for accent focus rings + themed panels;
purely the picker chrome, same values committed).

1. **Contact:** Name, Phone (E.164), Email (optional), Domain picker (`FilterDropdown`, `GIA_DOMAINS`
   — admin/founder only; agent and manager locked to own domain), Assign to (manager+ —
   `FilterDropdown` pre-loaded via `listAgentsForDealDomain`; agent shows read-only self chip).
2. **Deal:** Deal **type is shown read-only** ("set by {domain}") — it is derived from the chosen
   domain (`DOMAIN_DEAL_CONFIG`), not picked. The type-dependent extra surfaces accordingly:
   **Product Category** (`FilterDropdown`) for shop (retail), **Duration** chips for onboarding
   (membership), nothing for house/legacy (sale). Plus a side-by-side **Deal Date** (`DatePicker`,
   `maxDate={new Date()}` — defaults to today, allows back-dating a past sale) + **Source**
   (`FilterDropdown` from `LEAD_SOURCE_OPTIONS`, optional), and Amount (₹ prefix, decimal).

**Domain/assignee enforcement (server-side):**
- Agent: `domain = caller.domain`, `assigned_to = caller.id` — always forced server-side.
- Manager: `domain = caller.domain`; `assigned_to` may be any agent in their domain (verified).
- Admin/founder: any Gia domain; assignee verified in chosen domain.
- **`deal_type` is derived from the resolved domain** (`resolveDealShapeForDomain`) — a client-sent
  type is ignored. `CreateWalkInDealSchema` carries no `deal_type` field, only the extras
  (`deal_duration`, `deal_category`), which are cross-validated against the domain's type.

**Calls:** `createWalkInDeal` from `src/lib/actions/deals.ts` via `useTransition`.
On success the modal **closes first, then** calls `router.refresh()` (fixed 2026-06-26; the
refresh was previously abandoned on modal teardown). Server-side, the action calls
`revalidatePath('/deals', 'page')` (fixed 2026-06-25; a bare-path revalidation missed the
param-bearing This-Month URL the page redirects to), so the new deal shows on the next render.

#### 4c. `createWalkInDeal` action

**File:** `src/lib/actions/deals.ts`
**Schema:** `CreateWalkInDealSchema` in `src/lib/validations/deal-schema.ts`

Inserts a single `deals` row with `lead_id = null`, `client_id = null`. No `leads`-row side-effects
(no `updateLeadStatus`, no SLA, no activity log). `contact_phone` normalised to E.164 via
`normalizeToE164()` (throws on invalid — caught, returns error). `source` is written from the
optional picker (or null); `won_at` is the supplied Deal Date (`data.won_at`) or `now()` when
omitted. `CreateWalkInDealSchema` validates `source` against `LEAD_SOURCE_ENUM` and `won_at` as an
optional ISO datetime.

**`deal_created` notification (2026-06-16).** After a successful insert, `createWalkInDeal` fires a
`deal_created` in-app + push notification fan-out to the active managers/admins/founders in the
deal's domain via the local `notifyDealCreated` helper (mirrors the `lead_won` fan-out). The send is
wrapped in `after()` from `next/server` (A-16 — never a bare `void`) and is non-fatal (a deal write
never fails on a notification error). It carries `notificationKey: 'deal_created'` so Seam A honours
each recipient's per-user mute (migration `0133` — see §12 File Index). The lead → deal path
(`recordDeal`) deliberately does **not** fire it — its `lead_won` flip already reaches the same
recipients, and firing both would double-notify the single event.

---

### 5. Database — `get_deals_summary` RPC

#### Migration history

| Migration | Change |
| --- | --- |
| 0052 | Initial RPC over `leads` table |
| 0053 | Manager domain fix — `p_caller_domain` / `p_filter_domain` split |
| 0074 | **Rewritten over `public.deals`** — structural WHERE → `archived_at IS NULL`; date filters on `won_at` |

#### Current signature (migration 0074)

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
| `total_deals` | `int` | Count of matching deals |
| `total_revenue` | `numeric` | `SUM(deal_amount)` |
| `membership_count` | `int` | Rows with `deal_type = 'membership'` |
| `retail_count` | `int` | Rows with `deal_type = 'retail'` |

**Structural WHERE:** `archived_at IS NULL` only. No `status` or `deal_amount IS NOT NULL` gate —
every row in `public.deals` is a deal by definition.

**Security:** `STABLE SECURITY DEFINER SET search_path = public`. Role gates explicit in SQL
body. `GRANT EXECUTE` to `authenticated`.

**Date filters:** `won_at >= p_date_from` and `<= p_date_to` — **not** `created_at` or
`status_changed_at`.

#### The `p_caller_domain` / `p_filter_domain` split (preserved from migration 0053)

| Parameter | Source | Used for |
| --- | --- | --- |
| `p_caller_domain` | `profile.domain` (server-verified) | Manager gate: `d.domain = p_caller_domain::app_domain` |
| `p_filter_domain` | `filters.domain` from URL (admin/founder); `null` for manager | Optional admin/founder domain slice |

Manager SQL never reads `p_filter_domain` for scoping — only `p_caller_domain` enforces the
boundary. A tampered `filter_domain` in the URL cannot widen a manager's scope.

---

### 6. Types

#### `Deal`

**Defined in:** `src/lib/types/database.ts`

First-class row type for `public.deals`. Key fields: `id`, `lead_id` (nullable), `client_id`
(nullable), `contact_name`, `contact_phone`, `contact_email`, `domain`, `deal_amount`,
`deal_type` (typed union), `deal_duration` (typed union or null), `assigned_to`,
`source` (`string | null` — migration 0075), `won_at`, `archived_at`, `created_at`, `updated_at`.

#### `DealWithRelations`

**Defined in:** `src/lib/types/database.ts`

```typescript
export type DealWithRelations = Deal & {
  lead:     { slug: string | null } | null  // null for walk-in deals
  assignee: { full_name: string } | null
}
```

**Replaces `DealWithAssignee`** (which was an alias for `LeadWithAssignee`). The `lead` join is
nullable — walk-ins have no lead row to join. `DealWithAssignee` no longer exists; do not import it.

#### `DealFilters`

**Defined in:** `src/lib/types/database.ts`

```typescript
export type DealFilters = {
  search:        string | null
  domain:        AppDomain | null   // admin/founder; parseGiaDomainParam() on page
  deal_type:     string | null      // 'membership' | 'retail' | 'sale'
  deal_category: string | null      // retail category; DealsFilters surfaces it only when domain=shop
  agent_id:      string | null
  date_from:     string | null      // ISO date → won_at
  date_to:       string | null      // ISO date → won_at
  page:          number
  pageSize:      number
}
```

**No `status` field** — every row in `public.deals` is a deal. Status was never a filter; now
it's structurally impossible to add one.

#### `DealsResult`

```typescript
export type DealsResult = {
  deals:      DealWithRelations[]
  totalCount: number
}
```

#### `DealsSummary`

```typescript
export type DealsSummary = {
  total_deals:      number
  total_revenue:    number
  membership_count: number
  retail_count:     number
}
```

---

### 7. Service — `deals-service.ts`

#### `getDealsByRole(role, userId, domain, filters?)`

- **Returns:** `Promise<DealsResult>`
- **Source:** `public.deals` (NOT `leads`)
- **Join:** `lead:leads!deals_lead_id_fkey(slug)` + `assignee:profiles!deals_assigned_to_fkey(full_name)`
- **Structural:** `archived_at IS NULL`, order `won_at DESC`
- **Role gates (applied first, cannot be overridden):**

| Role | Constraint |
| --- | --- |
| `agent` | `assigned_to = userId`; `DealFilters.agent_id` ignored |
| `manager` | `domain = domain` (caller's verified `AppDomain`); optional `filters.agent_id` |
| `admin` / `founder` | No mandatory domain; optional `filters.domain` (Gia only) and `filters.agent_id` |

- **Optional filters:** `deal_type`, `date_from`/`date_to` on `won_at` (`date_to` → `T23:59:59.999Z`
  in service), `search` ILIKE on `contact_name`, `contact_phone`, `contact_email`.
- **Count:** `{ count: 'exact', head: false }` on the same query — never a second `COUNT(*)`.
- **Pagination:** `.range(offset, offset + pageSize - 1)` always applied. Default `pageSize` 50, `page` min 1.
- **Client:** Session client (`createClient()`); RLS still applies.
- **Type cast:** `data as unknown as DealWithRelations[]` — `deals` table not yet in generated types.

#### `getDealsSummary(role, userId, domain, filters)`

- **Returns:** `Promise<DealsSummary>` (zeros on error/empty).
- **Pattern:** `.rpc('get_deals_summary', { p_role, p_caller_domain, p_filter_domain, p_agent_id, p_deal_type, p_date_from, p_date_to })`.
- `p_caller_domain` always = server-verified `domain` arg; never from `filters`.
- `p_filter_domain` = `null` for agent/manager; `filters.domain` (Gia only) for admin/founder.
- `p_agent_id` = `userId` for agents; `filters.agent_id ?? null` for others.
- **Called by:** `DealsAsync` in parallel with `getDealsByRole`.

**Pre-mortem invariant:** RPC params must mirror `getDealsByRole` constraints or the summary
strip disagrees with the card list.

#### `getLeadDeal(leadId)`

- **Returns:** `Promise<Deal | null>` — the single non-archived `public.deals` row for a lead, or `null`.
- **Query:** `SELECT * FROM deals WHERE lead_id = $1 AND archived_at IS NULL LIMIT 1` (`.maybeSingle()`).
- **Client:** Session client (`createClient()`); RLS applies — an agent who doesn't own the deal gets `null` (correct, not a bug).
- **Type cast:** `data as unknown as Deal` — `deals` not yet in generated types.
- **Never throws** — returns `null` on empty result or any Supabase error.
- **Called by:** the lead dossier (`/leads/[id]`) to render `LeadDealCard`. Not used by `/deals`.

---

### 8. Page Architecture

#### 8a. `page.tsx` (thin orchestrator)

**Fetches once:** `getLeadFilterOptions(profile.role, profile.domain, null)` for agent dropdown.

**Renders:**

```text
<main>
  <h1>Deals + page-title-dot</h1>   [left]   <AddDealButton />   [right]
  <DealsFilters role showDomainFilter showAgentFilter agents />
  <Suspense fallback={<DealsSkeleton />}>
    <DealsAsync role userId domain filters pageSize />
  </Suspense>
</main>
```

**`parseFilters`:** Same as before — no status field; manager `domain: null`; agent `agent_id: null`.
Now `date_from`/`date_to` are conceptually applied to `won_at` (was `status_changed_at`).
`parseFilters` ignores the `dates` param; it is a page-level marker only.

**This Month default (2026-06-24):** a cold landing on `/deals` (no `date_from`, no `date_to`,
no `dates` param) `redirect()`s to `/deals?date_from=…&date_to=…` resolving
`resolveDateRangePreset('this_month')`, so the URL stays the single source of truth and the
filter bar's Range trigger reads "This Month". `?dates=all` is the escape hatch the Clear action
lands on (both date params null, `dates=all` present) so clearing is not re-defaulted back to a
month.

#### 8b. `DealsFilters`

**File:** `src/components/deals/DealsFilters.tsx` — `'use client'`.

| Control | URL param | Notes |
| --- | --- | --- |
| Search | `search` | 350ms debounce (`useUrlFilters` default); resets page |
| Deal type | `deal_type` | Single-select `FilterDropdown` (`membership`/`retail`/`sale`) |
| Category | `deal_category` | Single-select `FilterDropdown`; **shown only when `domain=shop`** (the retail slice); cleared atomically on any domain change |
| Domain | `domain` | Admin/founder only; change clears `agent_id` + `deal_category` |
| Agent | `agent_id` | Manager+ only |
| Date range | `date_from`, `date_to` | Applied to `won_at` (previously `status_changed_at`). Setting a date or preset also clears the `dates` marker; the panel's Clear pushes `{ date_from: null, date_to: null, dates: 'all' }` so the page does not re-default to This Month |

#### 8c. `DealsAsync`

Parallel fetch of `getDealsByRole` + `getDealsSummary`. Renders `DealsSummaryStrip`, card list,
`LeadsPagination`. Empty state: "Nothing matches these filters." vs "No deals recorded yet."

#### 8d. `DealCard`

**Two rendering modes based on `lead_id`:**

**Lead-sourced deal** (`lead_id IS NOT NULL`):
- Rendered as `<Link href="/leads/${deal.lead?.slug ?? deal.lead_id}">`.
- `slug` from the joined `lead` field. Falls back to `lead_id` (UUID) for old rows.

**Walk-in deal** (`lead_id IS NULL`):
- Rendered as a non-link `<motion.div>` card — no dossier to navigate to.
- Shows a **"Walk-in" pill** (info colour — `var(--color-info-light)` + `var(--color-info-text)`).
  Never a coloured edge border (Never-Do list).

**Both modes:**
- Left zone: `contact_name` (Playfair italic), `contact_phone` (mono), domain badge + Source pill + Walk-in pill (each if applicable). The **`SourcePill`** (2026-06-24, local to `DealCard.tsx`) renders when `deal.source` is set (paper-subtle chrome, label via `getLeadSourceLabel()`) in both mobile and desktop layouts.
- Centre zone: deal type chip + duration chip.
- Right zone: `formatCurrency(deal_amount)` (mono, accent), `"Won {formatDate(won_at, 'dd MMM yyyy')}"`, `assignee.full_name`.

**Key change from pre-0072:** Uses `won_at` instead of `status_changed_at`. Uses `contact_name`
instead of joined `first_name + last_name`. Uses `contact_phone` instead of joined `phone`.

#### 8e. `DealsSummaryStrip`, `DealsSkeleton`

**Domain-conditional cells (2026-06-20).** The strip composes `StatTile variant="cell"` and takes a
`domain?: AppDomain | null` prop. **Total Deals** and **Total Revenue** always render. The
**Memberships** cell shows only when the scoped domain's derived `deal_type` is `membership` (or the
all-domains/`null` view); **Retail** only when it is `retail` (or `null`). So an all-domains view
shows all 4 cells, while a domain-pinned manager/agent (e.g. `house` → `sale`) sees just the two
always-on cells — there is no `sale_count`. The effective scope is resolved in `DealsAsync` as
`summaryDomain` (admin/founder → `filters.domain`; manager/agent → their own profile `domain`,
because `resolveDomainParam` returns `null` for them and `filters.domain` alone would wrongly widen
to both type cells). Pure display change — `getDealsSummary` still returns all four counts.

`DealsSkeleton`: summary strip + 5 staggered card rows.

---

### 9. Validation Schemas — `deal-schema.ts`

**File:** `src/lib/validations/deal-schema.ts` (canonical — new file)

| Schema | Used by |
| --- | --- |
| `RecordDealSchema` | `recordDeal` action; also re-exported from `lead-schema.ts` for `StatusActionPanel` back-compat |
| `CreateWalkInDealSchema` | `createWalkInDeal` action; `NewDealModal` client-side validation |

`RecordDealSchema` is identical to the old one in `lead-schema.ts`. `lead-schema.ts` now
re-exports it — no call sites need to change.

---

### 10. Access Control Summary

| Action | agent | manager | admin | founder |
| --- | --- | --- | --- | --- |
| View deals list | Own `assigned_to` deals only | Domain deals | All (optional domain filter) | All (optional domain filter) |
| View summary strip | Same scope as list | Same | Same | Same |
| Filter by domain | — | — (locked to profile domain) | Yes | Yes |
| Filter by agent | — (hidden; `agent_id` forced null on page) | Yes | Yes | Yes |
| Capture deal (dossier Won flow) | If assigned to lead | If lead in domain | Yes | Yes |
| Create walk-in deal | Own domain, assigned to self | Own domain, any agent | Any Gia domain | Any Gia domain |

RLS on `public.deals` still applies to the session client list query (three SELECT policies:
agent → `assigned_to = auth.uid()`, manager → `domain = get_user_domain()`, admin/founder → all).
RPC summary uses explicit SQL role gates with server-verified `p_caller_domain`.

**Write-policy gap is intentional (migration 0094):** `public.deals` has **no INSERT, UPDATE, or
DELETE RLS policy**. All writes go through `recordDeal` / `createWalkInDeal` using the admin
(service-role) client, which bypasses RLS. The application-layer access checks in those actions
are the security equivalent. `COMMENT ON TABLE public.deals` documents this. Never add a
user-scoped INSERT/DELETE policy for deals.

---

### 11. Known Invariants (must never be violated)

1. **`DealFilters` has no `status` field** — every row in `public.deals` is a deal by definition.

2. **`getDealsByRole` returns `{ deals: DealWithRelations[], totalCount: number }`** — never a bare array.

3. **Date range filters use `won_at`** — never `created_at` or `status_changed_at` — in both
   `getDealsByRole` and `get_deals_summary`.

4. **Agent role constraint wins over URL `agent_id`** — `assigned_to = auth.uid()` applied first.

5. **Walk-in `DealCard` is a non-link `<div>`** — never a `<Link>`; "Walk-in" pill not a coloured edge border.

6. **Lead-sourced `DealCard` links to `/leads/${lead.slug ?? lead_id}`** — never `/deals/[id]`; slug fallback mandatory.

7. **`p_caller_domain` is server-verified only** — always `profile.domain`; never from URL.

8. **`totalCount` from the same query builder as the list** — `{ count: 'exact', head: false }`; no second `COUNT(*)`.

9. **Manager domain locked in service/RPC** — not via URL; `parseFilters` sets `domain: null` for managers.

10. **Summary RPC filters must mirror list filters** — or strip totals disagree with visible cards.

11. **`recordDeal` inserts a `deals` row before `updateLeadStatus('won')`** — if insert fails, status is NOT flipped.

12. **`createWalkInDeal` has no `leads`-row side-effects** — no `updateLeadStatus`, no SLA, no
    activity log. It DOES fan out one `deal_created` notification to the deal's domain
    managers/admins/founders (after-wrapped, non-fatal, `notificationKey: 'deal_created'`). The
    lead → deal path does not fire it (its `lead_won` flip already notifies the same recipients).

13. **`client_id` is always null** — FK deferred to clients module. Never populate it from application code until the clients migration runs.

14. **`won_at` is immutable after insert** — never issue an UPDATE on this column.

15. **Filter/search navigation resets page** — `buildFilterParams(..., { resetKeys: ['page'] })` on every push.

16. **`public.deals` has no INSERT/UPDATE/DELETE RLS policy** — the gap is intentional (migration 0094). All writes use the admin client in the action layer. Never add a user-scoped write policy.

17. **`won_at` on a walk-in may be back-dated** — `createWalkInDeal` accepts an optional `won_at` (the Deal Date, capped at today in the UI). It still defaults to `now()` and is still immutable after insert. Lead-sourced deals always use insert time.

18. **`leads.deal_amount` / `deal_type` / `deal_duration` no longer exist** — dropped in migration 0097. Deal data lives only on `public.deals`. Never read deal fields off a `leads` row.

---

### 12. File Index

| Area | Path |
| --- | --- |
| Route orchestrator | `src/app/(dashboard)/deals/page.tsx` |
| Async content | `src/app/(dashboard)/deals/DealsAsync.tsx` |
| Skeleton | `src/app/(dashboard)/deals/DealsSkeleton.tsx` |
| Authority | `src/app/(dashboard)/deals/CLAUDE.md` |
| Filters | `src/components/deals/DealsFilters.tsx` |
| Deal card | `src/components/deals/DealCard.tsx` |
| Summary strip | `src/components/deals/DealsSummaryStrip.tsx` |
| New Deal button | `src/components/deals/AddDealButton.tsx` |
| New Deal modal | `src/components/deals/NewDealModal.tsx` |
| Won capture | `src/components/leads/StatusActionPanel.tsx`, `WonDealModal.tsx` |
| Service | `src/lib/services/deals-service.ts` |
| Shared write body | `src/lib/services/lead-mutations.ts` (`recordDealCore`, called by `recordDeal` AND Elaya `log_deal`) |
| Elaya write tool | `src/lib/elaya/tools/write-registry.ts` (`log_deal`, propose-only; executes via `executeProposedAction`) |
| Actions | `src/lib/actions/deals.ts` (`recordDeal`, `createWalkInDeal`, `listAgentsForDealDomain`) |
| Back-compat re-export | `src/lib/actions/leads.ts` (`recordDeal` re-export) |
| Schemas | `src/lib/validations/deal-schema.ts` (`RecordDealSchema`, `CreateWalkInDealSchema`) |
| Back-compat re-export | `src/lib/validations/lead-schema.ts` (`RecordDealSchema` re-export) |
| Types | `src/lib/types/database.ts` (`Deal`, `DealWithRelations`, `DealFilters`) |
| Constants | `src/lib/constants/deal-types.ts` (incl. `resolveDealShapeForDomain` + `DealShape` types, moved here from `actions/deals.ts` 2026-06-26) |
| Migrations | `0072` (table), `0073` (backfill), `0074` (`get_deals_summary` rewrite over deals), `0075` (add `source` column), `0076` (`get_domain_health_metrics` revenue → deals), `0094` (intentional INSERT/DELETE policy gap), `0097` (drop dead `leads.deal_*` columns), `0122` (`deal_category` + domain-derived `deal_type` CHECKs: `'sale'`, `deals_deal_category_check`, `deals_retail_category_check`), `0133` (notification preferences — defines the `deal_created` category the walk-in fan-out gates on; see §4c) |
| Pagination reuse | `src/components/leads/LeadsPagination.tsx` |
