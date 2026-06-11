# Campaigns — Page Spec

> **Purpose:** spec for `/campaigns` (analytics command center) and `/campaigns/[id]` (single-campaign drill-down).
> **Audience:** engineers. · **Source-of-truth scope:** both campaign routes, the three campaign RPCs, campaign components. Ad-creative assets: `ad-creatives.md`; lead schema: `../architecture/database.md`.
> **Last verified:** 2026-06-09 full pass; 2026-06-11 restructure.

## 1. Purpose

Campaigns are **not** rows in a table — a "campaign" is a distinct non-null `leads.utm_campaign`
value. Every metric (list aggregates, detail strip, agent distribution, leads table) derives
from grouping/filtering `leads` on that column (`archived_at IS NULL` everywhere). The list
shows one card per `(utm_campaign, domain)` pair; the detail page drills into one campaign with
an optional ad-creative carousel.

## 2. Who sees it

manager / admin / founder only — agent and guest are redirected to `/dashboard` on both routes
before any fetch; the Sidebar additionally hides the link. Managers are domain-locked
(page + service force `callerDomain`); admin/founder get an optional domain filter.
Full matrix: Deep dive §8.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| RPCs | `get_campaign_metrics` (0014), `get_campaign_detail_metrics` (0015/0087), `get_campaign_agent_distribution` (0015) — SECURITY DEFINER; client EXECUTE revoked (0102); always live, **no Redis** |
| Service | campaign functions live in `leads-service.ts` (campaign data derives from `leads` — logged decision); detail leads table via `getLeadsByRoleCached` |
| Decoration | `beautifyCampaignTitle()` (`lib/utils/campaigns.ts`) — the only title decorator |
| Creatives | `getAdCreativesForCampaigns` batch map on the list; carousel on detail — home: `ad-creatives.md` |

## 4. Components

`CampaignCard` (card-list reference implementation) · `CampaignFilters` (composes
`<FilterBar>`) · `CampaignMetricsStrip` (composes `StatTile variant="card"`) ·
`AgentDistributionBar` (non-semantic `--domain-*` palette — design decision 2026-06-11) ·
`AdCreativeCarousel` · detail leads table reusing the leads-table pattern.

## 5. States

- **Loading:** `campaigns/loading.tsx` (PageSkeletons); detail metrics behind Suspense.
- **Empty:** `<EmptyState>` (no campaigns in range / no leads in campaign).
- **Error:** malformed `[id]` decode → `notFound()` (Q-10 guard); RPC errors degrade with logged warnings.

## 6. Invariants

Deep dive §9 — campaign identity is the exact `utm_campaign` string (never the beautified
title); `decodeURIComponent` always guarded; manager domain forced server-side; ≤3 colours
per chart (V-rules).

## 7. Open items

None recorded.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document.

### 1. Module Overview

#### What campaigns are in this system

Campaigns are not rows in a dedicated table. A “campaign” is a distinct non-null value of `leads.utm_campaign` — the UTM campaign string captured at lead ingestion. All list metrics, detail metrics, agent distribution, and the detail-page leads table are derived by grouping or filtering `leads` on that column (with `archived_at IS NULL` everywhere).

#### Two routes and their purposes

| Route | Purpose |
| ----- | ------- |
| `/campaigns` | Command-center list: one card per `(utm_campaign, domain)` pair with aggregate status/outcome counts; filters by domain (admin/founder), date range, and client-side search on campaign name after the RPC. |
| `/campaigns/[id]` | Single-campaign drill-down: stat strip + optional agent distribution bar + paginated leads table scoped to that exact `utm_campaign` value. Optional ad-creative carousel when videos exist in `ad_creatives`. |

#### Access gate

- `agent` and `guest`: `redirect('/dashboard')` on both routes (after `getCurrentProfile()`; unauthenticated users go to `/login`).
- `manager`, `admin`, `founder`: allowed.

#### Sidebar

- Label: **Campaigns**
- Icon: `TrendingUp` (`lucide-react`)
- Section: **Analytics** (below core nav; Performance is the sibling item above/beside it in the same section)
- Visibility: rendered only when `isManager` is true (`profile.role === 'manager' \|\| profile.role === 'admin' \|\| profile.role === 'founder'`). Agents and guests see Performance only; Campaigns is filtered out of `ANALYTICS_NAV`.

---

### 2. Data Model

There is **no `campaigns` table**. All campaign analytics read from `public.leads`.

#### Indexes on `leads` (migration `20260528000014_campaign_analytics.sql`)

| Index | Columns | Partial condition |
| ----- | ------- | ------------------- |
| `idx_leads_campaign_domain` | `(utm_campaign, domain)` | `WHERE archived_at IS NULL AND utm_campaign IS NOT NULL` |
| `idx_leads_campaign_status` | `(utm_campaign, status)` | `WHERE archived_at IS NULL AND utm_campaign IS NOT NULL` |

These support grouped campaign queries and status-filtered aggregates without scanning archived or campaign-less rows.

#### `ad_creatives` (migration `20260528000012_ad_creatives.sql`, multi-video migration `20260601000058_ad_creatives_multi_video.sql`)

- **Join model:** string match only — no FK from `leads`. Lookup key is `campaign_key`, not `leads.id`.
- **`campaign_key` normalisation:** DB CHECK `campaign_key = lower(trim(campaign_key))`. Application lookups use `campaignName.toLowerCase().trim()` (same rule in `getAdCreativesForCampaign`, `getAdCreativesForCampaigns`, and list-page map keys).
- **Connection to campaigns:** `campaign_key` is the normalised form of the raw `utm_campaign` string. A lead’s `utm_campaign` value (spaces/underscores as stored) is normalised at query time to find matching creative rows.
- **Multi-video (migration 0058):** `ad_creatives_campaign_key_key` UNIQUE dropped. Many rows may share one `campaign_key`; each row is one video. Queries order `created_at DESC` (newest first). List page batch-fetches via `getAdCreativesForCampaigns` (single `.in('campaign_key', uniqueKeys)` query — no N+1); detail page uses `getAdCreativesForCampaign`. Surfaces: `CampaignPreviewModal`, `CampaignAdCard`, lead dossier `CampaignVideoModal` (via `AdCreativeCarousel`).
- **Storage RLS (migration `20260608000092_fix_ad_creatives_storage_rls.sql`, 2026-06-08):** the `ad-creatives` Storage bucket now restricts INSERT/DELETE to `admin`/`founder` only (`ad_creatives_storage_insert` / `ad_creatives_storage_delete`, role read from `public.profiles`), replacing the older permissive "Ad Creative Modal insert/delete" policies. SELECT is unchanged — public bucket read so campaign + lead-dossier video surfaces can stream without an extra policy. This mirrors the `ad_creatives` table RLS from migration 0012.
- **No Redis layer:** the ad-creative read functions in `ad-creatives-service.ts` are plain Supabase queries. There is no `redis.get`/`setex` and no `campaign:ad-creative:*` key. Freshness is `revalidatePath('/campaigns')` + `revalidatePath('/admin/ad-creatives')` on `upsertAdCreative` / `deleteAdCreative`.

---

### 3. Database RPCs

#### 3a. `get_campaign_metrics` (migration `20260528000014`, fixed `20260530000044`)

##### List RPC parameters

| Parameter | Type (post-0044) | Default | Role |
| --------- | ---------------- | ------- | ---- |
| `p_domain` | `app_domain` | `NULL` | When set, only leads in that domain. `NULL` = all domains (admin/founder path). |
| `p_date_from` | `timestamptz` | `NULL` | Lower bound on `leads.created_at` (inclusive). |
| `p_date_to` | `timestamptz` | `NULL` | Upper bound on `leads.created_at` (inclusive). |

There is **no `p_role` parameter**. Role-based access is enforced in the Next.js page and in `getCampaignMetrics()` before the RPC is called.

##### Returns one row per `(utm_campaign, domain)`

| Column | Type | Meaning |
| ------ | ---- | ------- |
| `campaign_name` | `text` | `utm_campaign` value |
| `domain` | `text` | `leads.domain` cast to text in SELECT (`domain::text` after 0044) |
| `total_leads` | `bigint` | Count of non-archived leads in group |
| `status_new` | `bigint` | `COUNT(*) FILTER (WHERE status = 'new')` |
| `status_touched` | `bigint` | `FILTER (WHERE status = 'touched')` |
| `status_in_discussion` | `bigint` | `FILTER (WHERE status = 'in_discussion')` |
| `status_won` | `bigint` | `FILTER (WHERE status = 'won')` |
| `status_nurturing` | `bigint` | `FILTER (WHERE status = 'nurturing')` |
| `status_lost` | `bigint` | `FILTER (WHERE status = 'lost')` |
| `status_junk` | `bigint` | `FILTER (WHERE status = 'junk')` |
| `outcome_rnr` | `bigint` | `FILTER (WHERE last_call_outcome = 'rnr')` |
| `outcome_switched_off` | `bigint` | `FILTER (WHERE last_call_outcome = 'switched_off')` |
| `outcome_converted` | `bigint` | `FILTER (WHERE last_call_outcome = 'converted')` |

##### Aggregate technique

Single `SELECT … FROM leads … GROUP BY utm_campaign, domain` with `COUNT(*) FILTER (WHERE …)` for every metric column. **N campaigns still equal one round trip** — never one query per campaign.

##### Security

`LANGUAGE sql STABLE SECURITY DEFINER` with `SET search_path = public`. Allows admin/founder cross-domain reads; managers must pass their domain as `p_domain` from the service layer.

##### Domain type fix (migration 0044)

- **Failure:** PostgreSQL error `42883` (undefined function / operator) on `/campaigns` after migration 0041 promoted `leads.domain` to enum `app_domain` while `get_campaign_metrics` still declared `p_domain text` and compared `domain = p_domain` (`app_domain` vs `text` — no `=` operator).
- **Fix:** `p_domain` changed to `app_domain`; `domain::text` in the SELECT list preserves `RETURNS TABLE (domain text)`; old overload `get_campaign_metrics(text, timestamptz, timestamptz)` dropped to avoid ambiguous calls.

##### Manager domain constraint

Not inside the RPC. `getCampaignMetrics()` sets `effectiveDomain = callerDomain` when `role === 'manager'` and passes that as `p_domain`. The list page also ignores the `domain` URL param for managers (`parseFilters` always uses `callerDomain`).

---

#### 3b. `get_campaign_detail_metrics` (migration `20260528000015`, first-touch key fixed `20260608000087`)

##### Detail RPC parameters

| Parameter | Type | Default |
| --------- | ---- | ------- |
| `p_campaign` | `text` | required |
| `p_date_from` | `timestamptz` | `NULL` |
| `p_date_to` | `timestamptz` | `NULL` |

##### Detail RPC returns

Single row per matching campaign; empty set if no leads. Same status/outcome bigint columns as the list RPC (without `domain`), plus:

| Column | Type | Meaning |
| ------ | ---- | ------- |
| `avg_hours_to_first_touch` | `double precision` | `AVG(EXTRACT(EPOCH FROM (ft.first_touched_at - l.created_at)) / 3600.0)` |

##### avg_hours_to_first_touch computation

For each lead, a `LEFT JOIN LATERAL` subquery selects `MIN(la.created_at)` from `lead_activities` where `action_type = 'status_changed'` and **`details->>'new_status' = 'touched'`**. The average is taken across leads in the campaign/date filter. Leads never touched contribute NULL to the average (PostgreSQL `AVG` ignores NULLs).

> **Migration 0087 key fix (2026-06-08):** the lateral join originally matched `details->>'to' = 'touched'`, but `update_lead_status` writes the activity payload as `jsonb_build_object('old_status', …, 'new_status', p_status)` — there is no `to` key. The old predicate matched **zero** rows, so `avg_hours_to_first_touch` was always NULL (rendering as `—` / "no data" on every campaign). `20260608000087_fix_campaign_first_touch_key.sql` `CREATE OR REPLACE`s the RPC to match `details->>'new_status' = 'touched'`. Any future change to the `status_changed` activity payload shape must keep this predicate in sync.

##### Division-by-zero

This RPC returns **counts only** — no precomputed rates. Rate division happens in `CampaignMetricsStrip.tsx` (see §6c). The RPC itself has no rate fields to guard.

---

#### 3c. `get_campaign_agent_distribution` (migration `20260528000015`)

##### Agent distribution RPC parameters

| Parameter | Type | Default |
| --------- | ---- | ------- |
| `p_campaign` | `text` | required |
| `p_date_from` | `timestamptz` | `NULL` |
| `p_date_to` | `timestamptz` | `NULL` |

##### Agent distribution RPC returns

`AgentDistributionRow` shape:

| Field | SQL type | Meaning |
| ----- | -------- | ------- |
| `agent_id` | `uuid` | `leads.assigned_to` |
| `full_name` | `text` | from `profiles` join |
| `lead_count` | `bigint` | `COUNT(*)` per agent |

##### Query pattern

One query: `FROM leads l JOIN profiles p ON p.id = l.assigned_to`, `WHERE utm_campaign = p_campaign` and date filters, `GROUP BY l.assigned_to, p.full_name`, `ORDER BY lead_count DESC`. Rows with `assigned_to IS NULL` are excluded. **Never N+1** (no per-agent queries).

##### When AgentDistributionBar hides

- Parent `CampaignMetricsStrip`: bar wrapper renders only when `distribution.length > 1`.
- `AgentDistributionBar` itself also returns `null` when `distribution.length <= 1` **or** `total === 0`.

A single assigned agent means no comparative distribution — bar is omitted by design.

---

### 4. Services (inside `leads-service.ts`)

All three functions use `createClient()` from `src/lib/supabase/server.ts` and cast `.rpc()` through `unknown` (custom RPCs are not in generated `Database` types).

#### `getCampaignMetrics(role, callerDomain, filters)`

- **Parameters:** `role: UserRole`, `callerDomain: AppDomain`, `filters: CampaignFilters`
- **Returns:** `Promise<CampaignMetrics[]>`
- **Manager domain:** `effectiveDomain = role === 'manager' ? callerDomain : (filters.domain ?? null)` passed as `p_domain`.
- **`date_to`:** stripped to date then suffixed `T23:59:59.999Z` before RPC (end-of-day rule).
- **bigint → `Number()`:** applied to `total_leads`, all status fields, all outcome fields when mapping RPC rows to `CampaignMetrics`.
- **Search:** after RPC, optional client-side filter on `campaign_name` (trimmed, case-insensitive substring) when `filters.search` is set — not in SQL.
- **Error behaviour:** `if (error || !data) return []` — empty list, no throw.

#### `getCampaignDetailMetrics(campaignName, filters)`

- **Parameters:** `campaignName: string`, `filters: Pick<CampaignFilters, 'date_from' | 'date_to'>`
- **Returns:** `Promise<CampaignDetailMetrics | null>`
- **`date_to`:** same end-of-day transform as list metrics.
- **bigint → `Number()`:** all count fields; `avg_hours_to_first_touch` → `Number()` when not null.
- **Error behaviour:** `return null` on error, missing data, or empty array — detail page metrics strip renders nothing; leads table empty state still possible.

#### `getCampaignAgentDistribution(campaignName, filters)`

- **Parameters:** same date pick as detail metrics
- **Returns:** `Promise<AgentDistributionRow[]>`
- **bigint → `Number()`:** `lead_count` via `Number(row.lead_count)`.
- **Error behaviour:** `return []` on error — strip may omit bar; no throw.

---

### 5. The `/campaigns` List Page

#### 5a. `page.tsx`

- **Access gate:** `agent` / `guest` → `redirect('/dashboard')`; no profile → `redirect('/login')`.
- **Manager domain pre-lock:** `parseFilters()` sets `domain: callerDomain` when `role === 'manager'`; URL `domain` param is ignored. That `CampaignFilters` object is passed to `CampaignListAsync` → `getCampaignMetrics`.
- **Domain filter UI:** `showDomainFilter = role === 'admin' || role === 'founder'`.
- **Component tree:**

```text
<main>
  <h1>Campaigns.</h1>
  <CampaignFiltersBar role showDomainFilter />   ← stable (client)
  <Suspense fallback={<CampaignListSkeleton />}>
    <CampaignListAsync role callerDomain filters />
  </Suspense>
</main>
```

#### 5b. `CampaignFilters`

- **Controls:** Sliders icon + active-count badge; `SearchBar` (debounced **500ms** → URL `search`); `FilterDropdown` **Domain** (single-select, `GIA_DOMAIN_FILTER_ITEMS`) only when `showDomainFilter`; **Date range** (`DatePicker` From / To via `dateFromUrlParam` / `dateToUrlParam`); **Clear filters** when `activeCount > 0`.
- **Clear:** resets pathname with no query string; also clears local search input state.
- **Navigation:** every URL update uses `useTransition` + `router.push` via `buildFilterParams` from `lib/utils/filter-params.ts`.
- **Active count:** search + domain + date_from + date_to (each present counts as 1).

#### 5c. `CampaignListAsync`

- **Fetches:** `getCampaignMetrics(role, callerDomain, filters)` then `getAdCreativesForCampaigns(campaigns.map(c => c.campaign_name))` — one batch query, never per-card.
- **Passes to cards:** `campaign`, `index`, `adCreatives` from map key `campaign_name.toLowerCase().trim()`.
- **Empty state:** Playfair italic — *"No campaigns match these filters."* (inline `<p>`, tertiary colour, no separate empty-state component).

#### 5d. `CampaignCard`

- **Left zone:** raw `campaign.campaign_name` + `DomainBadge` (`DOMAIN_LABELS`).
- **Right zone — seven metric pills in order:** total, won, in discussion, nurturing, lost, junk, RNR (variants: accent, success, info, warning, danger, neutral, neutral).
- **`MetricPill`:** count displayed via `formatCompact(count)` — never raw integer in the pill.
- **Hover:** `box-shadow: var(--shadow-2)` and `transform: translateY(-1px)` on mouse enter; reset to `--shadow-1` / `translateY(0)` on leave. Focus uses `--shadow-focus`.
- **Click behaviour:** opens `CampaignPreviewModal` (does not navigate directly). **Detail navigation** is in the modal footer: `router.push(\`/campaigns/${encodedName}\`)` then `onClose`.
- **URL encoding contract (critical):**

```ts
const encodedName = campaign.campaign_name.replace(/\s+/g, '+');
router.push(`/campaigns/${encodedName}`);
```

- Spaces become `+` only — **not** `encodeURIComponent` (which would produce `%20` and hurt address-bar readability, e.g. `TG_House_Meta+Leads` vs `TG_House_Meta%20Leads`).
- **`+` must never appear in a real `utm_campaign` value** — it decodes as space and breaks the DB match silently.
- Underscores and other characters pass through unchanged in the path segment.

- **Framer Motion entrance:** `opacity 0→1`, `y 4→0`, duration **250ms**, delay `Math.min(index * 80, 320) / 1000` seconds, ease `[0.16, 1, 0.3, 1]` (ease-out-expo family, design-dna §11.4).

#### 5e. `CampaignListSkeleton`

- **Row count:** 5
- **Shape per row:** left block (160×14 name bar + 80×18 domain pill) + right row of **7** pill-shaped skeletons (varying widths 52–60px)
- **Stagger:** `animationDelay` 0, 80, 160, 240, 320 ms per row (§11.4)

---

### 6. The `/campaigns/[id]` Detail Page

#### 6a. URL contract

- **`[id]` route param:** raw path segment as stored in the URL — spaces appear as `+` from list navigation.
- **Decode (once at top of page):**

```ts
const campaignName = id.replace(/%2B/gi, ' ').replace(/\+/g, ' ');
```

- **Not** `decodeURIComponent` for the campaign key — the `+` convention is intentional.
- **Defensive `%2B`:** stripped before `+`→space so double-encoded links do not show literal `%2B` in the UI or break lookups.
- **`campaignTitle`:** `beautifyCampaignTitle(campaignName)` — **display only** (H1). Never passed to services or RPCs.
- **Single source of truth:** `campaignName` is computed once and passed identically to `CampaignMetricsAsync`, `getAdCreativesForCampaign`, and `LeadFilters.campaign` inside `CampaignLeadsAsync`. Do not decode `params.id` again in child components.

#### 6b. `page.tsx` structure

- **Two independent `Suspense` boundaries:** metrics (`CampaignMetricsStripSkeleton` → `CampaignMetricsAsync`) and leads (`LeadsTableSkeleton` → `CampaignLeadsAsync`) so slow table queries do not block stat cards and vice versa.
- **`CampaignMetricsAsync`:** `Promise.all([getCampaignDetailMetrics(...), getCampaignAgentDistribution(...)])` — parallel, never sequential.
- **Leads table:** `getLeadsByRoleCached(role, userId, domain, filters)` where `filters.campaign = campaignName` plus `date_from`, `date_to`, `page`, `pageSize: 50`; other filter fields null.
- **Ad creatives:** `getAdCreativesForCampaign(campaignName)` awaited outside Suspense (small read); `CampaignAdCard` between header and metrics.

#### 6c. `CampaignMetricsStrip`

- **Server component** — no `'use client'`; zero DB calls; props only.

| Card label | Field(s) | Formatting |
| ---------- | -------- | ---------- |
| Total Leads | `total_leads` | `formatCompact` |
| Won | `won` | `formatCompact`; sub: conversion rate |
| Active Pipeline | `in_discussion + nurturing` | `formatCompact`; sub: static copy |
| Junk Rate | `junk / total_leads` | primary: `formatPercent(junk / total)` when `total_leads > 0`, else `"—"`; sub: junk rate helper |
| RNR | `rnr` | `formatCompact`; sub: RNR share of total |
| Avg. First Touch | `avg_hours_to_first_touch` | `<1h`, `Nh`, or `—`; sub: qualitative label |

**Division-by-zero guards** (all use `total_leads` as denominator):

| Helper | Fields | When `total_leads === 0` |
| ------ | ------ | ------------------------ |
| `conversionRateSub(won, total)` | Won conversion | sub text `"—"` |
| `junkRateSub(junk, total)` | Junk rate sub-label | `"—"` |
| `rnrRateSub(rnr, total)` | RNR as share of total | `"—"` |
| Junk Rate primary value | `junk / total` | card value `"—"` (never calls `formatPercent` with zero denominator) |

`formatPercent` is only invoked after the guard passes.

#### 6d. `AgentDistributionBar`

- **Client component** (`'use client'`).
- **Stacked bar:** height **8px**, `borderRadius: var(--radius-full)`, `overflow: hidden`, track `var(--theme-paper-subtle)`.
- **Segments:** `motion.div` per agent with `layoutId={dist-seg-${agent_id}}`, `initial={{ width: 0 }}`, `animate={{ width: '${pct}%' }}`, transition 500ms + stagger `i * 0.05`, ease `[0.16, 1, 0.3, 1]`.
- **Legend:** 8px colour dot (`SEGMENT_COLORS` cycle: accent, info, success, warning, danger) + `full_name` + `formatCompact(lead_count)`.
- **Hidden when:** `distribution.length <= 1` or `total === 0`.

##### Width animation exception

Project rule V-19 forbids **CSS** `transition` on layout properties (`width`, `height`, `padding`, `margin`) because they trigger main-thread layout and jank — the “never animate width” rule. Here, Framer Motion animates **percentage width on flex children inside a fixed-height flex row** — compositor-friendly segment growth on mount, coordinated with `layoutId` for shared-layout stability. This is not a card or table column resizing; it is a one-time data visualization entrance. **Do not copy this pattern to general UI chrome** — only this distribution bar uses width animation in the codebase.

#### 6e. `CampaignMetricsStripSkeleton`

- **6** stat-card placeholders in a responsive grid (`repeat(2)` → `md:grid-cols-3` → `lg:grid-cols-6`).
- **Stagger:** delays 0, 80, 160, 240, 320, 320 ms on inner `.skeleton` blocks (§11.4).

#### 6f. Leads table reuse (explicit reuse decision)

**Decision:** the campaign detail page does **not** implement a campaign-specific table. It reuses the leads module table stack unchanged.

| Component | Props passed from `CampaignLeadsAsync` |
| --------- | -------------------------------------- |
| `LeadsTable` | `leads`, `userId={profile.id}`, `filters={filters}`, `hasActiveFilters={!!campaignName}` |
| `LeadsPagination` | `page`, `pageSize={50}`, `totalCount` — rendered only when `totalCount > pageSize` |

`LeadsTable` **does** receive the full `filters` object — it is a **required** prop on `LeadsTable` (`filters: LeadFilters`), so the campaign detail page passes the same `LeadFilters` it built on the page (with `campaign = campaignName` and all other filter fields `null`). Filtering is still entirely server-side via `getLeadsByRoleCached` — `LeadsTable` does not re-filter. It forwards `filters` to its `<ExportButton filters={filters} />` so a CSV/XLSX export from the campaign table carries the exact same scope as the rendered rows. `pageSize`/`page` are read off `filters` inside `CampaignLeadsAsync` (`filters.pageSize ?? 50`, `filters.page ?? 1`). Column picker, status pills, and row rendering behave exactly as on `/leads`.

**Not built:** `CampaignLeadsTable`, campaign-specific columns, or duplicate pagination logic.

---

### 7. Types

#### `CampaignMetrics`

```ts
{
  campaign_name:  string
  domain:         AppDomain
  total_leads:    number
  new:            number
  touched:        number
  in_discussion:  number
  won:            number
  nurturing:      number
  lost:           number
  junk:           number
  rnr:            number
  switched_off:   number
  converted:      number
}
```

Service maps RPC `status_*` / `outcome_*` columns to the short keys above.

#### `CampaignDetailMetrics`

`CampaignMetrics & { avg_hours_to_first_touch: number | null }`

Detail RPC omits `domain`; service sets `domain: '' as AppDomain` as unused placeholder.

#### `CampaignFilters`

```ts
{
  date_from: string | null
  date_to:   string | null
  domain:    AppDomain | null
  search:    string | null
}
```

No `page` on list filters. Detail page lead pagination uses `LeadFilters.page` / `pageSize` separately.

#### `AgentDistributionRow`

```ts
{
  agent_id:   string
  full_name:  string
  lead_count: number
}
```

---

### 8. Access Control Summary

| Role | `/campaigns` | `/campaigns/[id]` |
| ---- | ------------ | ----------------- |
| agent | redirect `/dashboard` | redirect `/dashboard` |
| guest | redirect `/dashboard` | redirect `/dashboard` |
| manager | allowed; domain locked to `profile.domain` (page + service) | allowed; leads/metrics scoped by RLS + `getLeadsByRole` role rules on underlying `leads` |
| admin | allowed; optional `domain` URL filter | allowed; all domains unless lead query constraints apply |
| founder | same as admin | same as admin |

#### Enforcement layers

| Layer | What it does |
| ----- | ------------ |
| Page redirect | `campaigns/page.tsx` and `campaigns/[id]/page.tsx` block agent/guest before any data fetch. |
| `getCampaignMetrics` | Manager `p_domain` forced to `callerDomain`. |
| `leads` RLS | Applies to `getLeadsByRoleCached` on detail page (agent sees assigned leads only, manager domain, etc.). |
| RPC `SECURITY DEFINER` | Bypasses RLS for aggregate reads; trust boundary is caller-supplied `p_domain` / `p_campaign` from server code, not the browser. |

Sidebar hides the Campaigns link from agent/guest (UI); direct URL still hits page redirect.

---

### 9. Known Invariants (must never be violated)

1. **`campaignName` decoded once** at the top of `campaigns/[id]/page.tsx` and used identically for `getCampaignDetailMetrics`, `getCampaignAgentDistribution`, `getAdCreativesForCampaign`, and `filters.campaign` in `getLeadsByRoleCached`.

2. **bigint → `Number()`** on every numeric field returned from all three campaign RPCs in `leads-service.ts` before they reach components (Q-09).

3. **Division-by-zero:** when `total_leads === 0`, conversion sub-label, junk rate sub-label, RNR sub-label, and Junk Rate primary value must show `"—"` — never call `formatPercent` with a zero denominator (`CampaignMetricsStrip` helpers).

4. **Manager domain** enforced in `getCampaignMetrics` (`effectiveDomain = callerDomain`) and in `parseFilters` on the list page — both layers, neither trusts the other.

5. **Agent distribution bar** hidden when `distribution.length <= 1` (and bar component also bails when `total === 0`).

6. **No campaigns table** — all metrics derive from `leads.utm_campaign` (and `ad_creatives` for video assets only).

7. **Campaign URL encoding uses `+` for spaces, not `%20`** — `campaign.campaign_name.replace(/\s+/g, '+')` on navigate; inverse `replace(/\+/g, ' ')` on read; never `encodeURIComponent` / `decodeURIComponent` for the campaign key.

8. **One RPC for list aggregates** — `get_campaign_metrics` must stay a single grouped query; per-campaign queries from the list page are a bug.

9. **Detail metrics RPCs in parallel** — `Promise.all` for detail + distribution inside `CampaignMetricsAsync`; never sequential awaits.

10. **Agent distribution: single GROUP BY** — `get_campaign_agent_distribution` must not become N+1 per agent.

11. **`date_to` end-of-day** — append `T23:59:59.999Z` in service functions before RPC, not in components.

12. **Batch ad creatives on list** — `getAdCreativesForCampaigns` once in `CampaignListAsync`; never `getAdCreativesForCampaign` per card.

13. **`beautifyCampaignTitle` / `campaignTitle` never in DB calls** — raw `utm_campaign` string only for lookups.

14. **Leads table reuse** — detail page uses `LeadsTable` + `LeadsPagination`; do not fork a campaign-only table. `filters` is passed through to `LeadsTable` (required prop; powers the table's `ExportButton` scope) but filtering itself stays server-side in `getLeadsByRoleCached`.

15. **`get_campaign_metrics` N campaigns = 1 round trip** — conditional `COUNT(*) FILTER` aggregates only.

16. **`avg_hours_to_first_touch` activity key** — the `get_campaign_detail_metrics` lateral join must match `lead_activities.details->>'new_status' = 'touched'` (migration 0087), **not** `details->>'to'`. The `status_changed` activity payload is `jsonb_build_object('old_status', …, 'new_status', …)` — there is no `to` key. Re-introducing `'to'` silently zeroes the metric.

---

### Campaign components inventory (`src/components/campaigns/`)

| File | Role |
| ---- | ---- |
| `CampaignFilters.tsx` | List filter bar (client, URL-only) |
| `CampaignListAsync.tsx` | List data + cards (async server) |
| `CampaignListSkeleton.tsx` | List Suspense fallback |
| `CampaignCard.tsx` | List row card + preview trigger |
| `CampaignPreviewModal.tsx` | Preview + navigate to detail |
| `CampaignMetricsStrip.tsx` | Detail stat cards (server) |
| `CampaignMetricsStripSkeleton.tsx` | Detail metrics Suspense fallback |
| `AgentDistributionBar.tsx` | Stacked agent bar (client) |
| `CampaignAdCard.tsx` | Detail ad carousel section |
| `AdCreativeCarousel.tsx` | Multi-video carousel |
| `AdCreativePlayer.tsx` | Single native video player |

---

### Number utilities used

**`formatCompact`** (`lib/utils/numbers.ts`): null/undefined → `"—"`; &lt;1K exact; 1K–9.9K one decimal K; 10K–999K integer K; 1M+ one decimal M. Used on pills, stat cards, legend counts.

**`formatPercent`** (`lib/utils/numbers.ts`): ratio 0–1 → percentage string (e.g. `0.742` → `"74.2%"`); null → `"—"`. Used only after zero-denominator guards on Won conversion, Junk rate, and RNR share.
