# Campaigns Page — CLAUDE.md

## Architecture

```text
campaigns/page.tsx                   ← Server component (thin orchestrator)
  │  access-gate: agent + guest → redirect /dashboard
  │  parses searchParams → CampaignFilters
  │  manager: domain always locked to caller's own domain
  │
  ├── <CampaignFilters />             ← Client component — URL read/write only
  │     Domain filter hidden for manager role (pre-locked)
  │
  └── <Suspense fallback={<CampaignListSkeleton />}>
        <CampaignListAsync />         ← Async server component
              Promise.all([
                getCampaignMetrics(role, callerDomain, filters),
                hasRange ? getBudgetSummary(date_from, date_to) : []  ← spend
              ])
              maps spend onto campaigns by normalised key → <CampaignCard> list
              (spend/cost cells; "—" when no range or no spend)
              empty state: Playfair italic

campaigns/[id]/page.tsx              ← Server component
  │  id = encodeURIComponent(utm_campaign) — decoded with decodeURIComponent
  │  calls getLeadsByRoleCached with { campaign: decodedName }
  │  renders <LeadsTable> (existing component — zero changes needed)
```

---

## Campaign ID Encoding Contract

`utm_campaign` values may contain spaces but **never** a literal `+` character.

- **List page → detail page:** `encodeURIComponent(campaign.campaign_name)` (in `CampaignCard` — the only href builder).
- **Detail page → leads query:** `decodeURIComponent(params.id)`, wrapped in try/catch (a hand-typed bad `%` escape falls back to the raw param). Exact, lossless inverse.
- **Use `encodeURIComponent` / `decodeURIComponent` — never the old `+`→space scheme.** Real `utm_campaign` keys contain literal `+` (Meta "Advantage+" campaigns) and `/` (e.g. `TG_Global_9/Jan…`). The previous `\s+`→`+` / `+`→`\s` pair corrupted both: the literal `+` decoded to a space, the normalised lookup key stopped matching, and the detail page silently found **nothing** — no ad-creative video, an empty leads table, AND empty metrics (fixed 2026-06-20; the corruption was confirmed against live data — `TG_Global_Advantage+_14th May` had 38 leads + 2 creatives that the corrupted key missed entirely). `encodeURIComponent` round-trips `+`, `/`, and spaces losslessly, so no character is forbidden in a campaign key anymore.
- **The address bar shows `%20`/`%2B` instead of `+`** — that is the correct trade-off for a key that round-trips. Do not "restore readability" by reviving the `+` scheme; it re-introduces the silent-corruption bug.

---

## Detail Page Title — Beautification Rule

`campaigns/[id]/page.tsx` renders **two** derived values from `params.id`:

- `campaignName` — the un-beautified key used for **all** DB lookups. `decodeURIComponent(params.id)` (try/catch → raw param fallback). Never modified beyond that.
- `campaignTitle` — display-only. Derived by `beautifyCampaignTitle(campaignName)` from `src/lib/utils/campaigns.ts`. Used only in the H1 and modal title.

**Rule:** never pass `campaignTitle` to a service function or RPC. The DB stores raw `utm_campaign` keys (with underscores) and the lookup must match exactly. `beautifyCampaignTitle` is the single source of truth — never inline the split/join logic in a component.

---

## Ad Creative Components

### Multiple videos per campaign

As of migration 0058, `ad_creatives.campaign_key` is **not** UNIQUE — a campaign may have many ad videos (one row per video). All three video surfaces show an `AdCreativeCarousel`. Videos are ordered **newest first** (`created_at DESC`).

### AdCreativePlayer

`src/components/campaigns/AdCreativePlayer.tsx` — `'use client'`

Props: `videoUrl: string`, `thumbnailUrl: string | null`

Reusable single-video primitive. Native `<video autoPlay muted playsInline controls>`. Ref-based `.play()` after mount; `NotAllowedError` caught silently. **Unmount cleanup calls `video.pause()` only — it must NOT set `video.src = ''`.** Clearing the src blanks the element under React Strict Mode's mount→unmount→remount cycle (the JSX src prop is unchanged on remount, so React never re-applies it → black box). `pause()` is sufficient to stop audio bleed. Container: `background: var(--theme-canvas)`, `aspect-ratio: 9/16`, `max-height: 480px`, `object-fit: contain`.

### AdCreativeCarousel

`src/components/campaigns/AdCreativeCarousel.tsx` — `'use client'`

Props: `creatives: AdCreative[]`, `showMeta?: boolean`

Looping single-video carousel. Renders one `AdCreativePlayer` at a time with `key={current.id}` (clean remount per video → each autoplays). Prev/next arrows wrap around; **hidden entirely when `creatives.length === 1`**. Dot indicators + "n / total" counter. With `showMeta`, shows the current video's `ad_name` + `notes` beneath. Returns `null` on empty array. Shared by `CampaignPreviewModal`, `CampaignAdPanel`, and the lead dossier's `CampaignVideoModal`.

### CampaignPreviewModal

`src/components/campaigns/CampaignPreviewModal.tsx` — `'use client'`

Props: `campaign: CampaignMetrics`, `adCreatives: AdCreative[]`, `open: boolean`, `onClose: () => void`

Composes `ui/modal.tsx` with `maxWidth="max-w-3xl"`. Two-column grid when `adCreatives.length > 0` (`40% carousel | 60% info`), single-column when empty. Info column: `beautifyCampaignTitle` output, domain badge, 6 metric cells in a `2×3` grid. Per-video ad_name/notes live in the carousel (`showMeta`), not the info column. Footer: "Open Campaign →" → `router.push` then `onClose`; "Close" → `onClose`. Navigation always lives in the modal footer — never in `CampaignCard.onClick`.

### CampaignAdPanel

`src/components/campaigns/CampaignAdPanel.tsx` — `'use client'` (replaced the old `CampaignAdCard`, deleted 2026-06-20).

Props: `adCreatives: AdCreative[]`, `campaignKey: string` (normalised), `canUpload: boolean`.

THE left-column ad-creative panel on the detail page. Composes `SectionCard` ("AD CREATIVE" + "N ads" count when > 1). Framer Motion entrance: `opacity 0→1, y 8→0, 350ms ease-out-expo`. Three states:

- **Has creatives** → the looping `AdCreativeCarousel` (`showMeta`, `align="center"`).
- **No creatives + `canUpload`** → an **add-a-video tile** (same 9:16 footprint as the player, dashed border, Plus icon). Clicking it opens the **same `AdCreativeFormModal`** the `/admin/ad-creatives` page uses (R-01 — never a second uploader), with this campaign **pre-selected + locked** via `defaultCampaignKey`. A saved upload prepends to local state (newest-first) — no refetch.
- **No creatives + `!canUpload`** → the tile without the Plus, "No video yet." serif-italic copy.

**The card frame ALWAYS renders** (unlike the old `CampaignAdCard`, which returned `null` when empty) — the detail page puts it in the left column of the video↔metrics row, so it must hold its place whether or not a video exists. `AdCreativeFormModal` is `next/dynamic` (perf G-1) and mounted only after first open.

`canUpload` is `role === 'admin' || 'founder'` (set in `[id]/page.tsx`) — the SAME gate `upsertAdCreative` enforces server-side; managers view the page but never see the Plus.

---

## Batch Ad Creative Fetch Rule

`getAdCreativesForCampaigns(campaignNames[])` in `src/lib/services/ad-creatives-service.ts` performs a **single** `WHERE campaign_key = ANY(normalised_keys)` query and returns `Map<campaignKey, AdCreative[]>` (each array newest-first).

**Rule:** call this once in `CampaignListAsync` after `getCampaignMetrics` resolves. Never call `getAdCreativesForCampaign` per-card (N+1). The map lookup in `CampaignListAsync` uses the same `toLowerCase().trim()` normalisation as the DB `campaign_key` column.

---

## Spend + Cost-per-Lead join (page-layer, one batched fetch)

Each `CampaignCard` shows **Spend** and **Cost/Lead** for the active range. The data is **not** a
new query — it reuses `getBudgetSummary(from, to)` from `ad-spend-service.ts` (the `/budget` source),
joined at the page layer in `CampaignListAsync`.

- **One fetch, in the same `Promise.all` as the metrics.** `CampaignListAsync` calls
  `getBudgetSummary` **once** alongside `getCampaignMetrics`, then maps the returned
  `BudgetCampaignRow[]` into a `Map<campaignKey, row>`. The card lookup uses
  `campaign.campaign_name.toLowerCase().trim()` — the **same** normalisation as the ad-creatives map
  and the DB `ad_spend_daily.campaign_key` column. **Never a per-card `getBudgetSummary` call** (that
  is the N+1 bug for this feature — same class as the batch-ad-creative rule).
- **One resolved range drives BOTH RPCs.** `getBudgetSummary` and `get_campaign_metrics` receive the
  **identical** `filters.date_from`/`date_to`. If they diverged, a row's cost (spend ÷ leads) and its
  lead counts would describe different windows. Resolve the range once (the filter bar's preset writes
  `date_from`/`date_to`); pass it unchanged to both. This is the same discipline as the leads
  count-RPC pairing.
- **No range → no fetch.** `hasRange = Boolean(filters.date_from && filters.date_to)`. When false,
  `getBudgetSummary` is **skipped** (it requires both bounds, and an unscoped cost figure would mix
  all-time spend with windowed lead counts). The card then receives `null` for both fields.
- **`—`, never ₹0.** `totalSpend`/`costPerLead` are passed as `number | null`. `null` (no range, or no
  spend row for this campaign) → `CostCell` renders `—` in tertiary. `costPerLead` is already nulled
  upstream by `getBudgetSummary` when `leadCount === 0`, so spend-but-no-leads also shows `—` for cost
  while Spend still shows the figure. **Never render ₹0** — that is the costPerLead null contract,
  identical to `/budget`'s `BudgetTable`.
- **No Redis** — `getBudgetSummary` is always-live (admin client), like the campaign RPCs.

`CampaignCard` props: `totalSpend?: number | null`, `costPerLead?: number | null`. `CostCell` is the
in-file micro-label-over-value cell (mono value, `formatCurrency(Math.round(v))`). The cost zone sits
between the identity zone and the status pills, separated by a structural `--theme-paper-border`
divider (a neutral zone divider — NOT a semantic single-edge accent strip, which is forbidden).

## No Redis on campaign reads

**The campaign pages do NOT use Redis.** All campaign reads are plain Supabase queries (RPC or table):

- `getCampaignMetrics`, `getCampaignDetailMetrics`, `getCampaignAgentDistribution` (`leads-service.ts`) call their RPCs directly — no `redis.get`/`setex`, no cache-aside wrapper. (The last `redis.` call in `leads-service.ts` is in the lead-list/dossier functions, well above the campaign functions.)
- `getAdCreativesForCampaign` / `getAdCreativesForCampaigns` (`ad-creatives-service.ts`) are plain Supabase queries too. `getAdCreativesForCampaigns` is a single batched `.in('campaign_key', uniqueKeys)` query (no N+1).

There is **no `REDIS_KEYS.campaign.*` namespace and no `campaign:*` key schema** in `src/lib/constants/redis-keys.ts`. Do not document a campaign Redis layer (key patterns, TTLs, invalidation) unless one is actually added to the code first.

**Freshness model:** campaign metric RPCs are uncached (always live). Ad-creative reads are refreshed by `revalidatePath('/campaigns')` + `revalidatePath('/admin/ad-creatives')` in `upsertAdCreative` / `deleteAdCreative`.

---

## get_campaign_metrics RPC

Lives in: `supabase/migrations/20260528000014_campaign_analytics.sql`
Called from: `src/lib/services/leads-service.ts → getCampaignMetrics()`

**One RPC call. One round trip. Always.**

The function returns conditional aggregate counts using `COUNT(*) FILTER (WHERE ...)`.
This means N campaigns = 1 DB call, not N calls. Any change that re-introduces N+1 is a bug.

The service maps RPC column names (`status_new`, `status_won`, etc.) to the clean
`CampaignMetrics` shape (`new`, `won`, etc.) — components always use the clean shape.

---

## Domain-Lock Rule (Manager)

A manager MUST never see cross-domain campaign data.

This is enforced at two layers:

1. **`campaigns/page.tsx`**: `parseFilters` ignores `domain` URL param for managers — always uses `callerDomain`.
2. **`getCampaignMetrics` service**: `role === 'manager'` → `effectiveDomain = callerDomain` — ignores `filters.domain`.

Neither layer trusts the other. Both apply the constraint.

The domain filter (`FilterDropdown` + `GIA_DOMAIN_FILTER_ITEMS`) is absent from the DOM for manager role
(`showDomainFilter = role === 'admin' || role === 'founder'`). URL param validated via `parseGiaDomainParam()`.

Filter bar shares `lib/utils/filter-params.ts` (`buildFilterParams`, `dateFromUrlParam`, `dateToUrlParam`) with leads — same layout as leads filter strip (sliders icon, active count, `SearchBar`, domain, DatePicker range, clear). Search debounced 500ms; applied in `getCampaignMetrics` after the RPC (filters `campaign_name`, case-insensitive).

---

## URL Param Keys

| Filter    | URL param   | Type                                                      |
| --------- | ----------- | --------------------------------------------------------- |
| domain    | `domain`    | AppDomain string                                          |
| search    | `search`    | substring match on `campaign_name` (trimmed in service)   |
| date from | `date_from` | ISO date string                                           |
| date to   | `date_to`   | ISO date string                                           |
| page      | `page`      | integer (detail page only)                                |

Campaign filter changes do not need a page param — the list page has no pagination.
The detail page uses `page` for lead pagination (passed through `LeadsPagination`).

---

## date_to End-of-Day Rule

Same as leads: when `date_to` is present, the service appends `T23:59:59.999Z` before
calling the RPC. This is done in `getCampaignMetrics()`, not in the component or page.

---

## Detail Page Architecture (campaigns/[id]/page.tsx)

```text
[id]/page.tsx                        ← Server component
  │  decodes id with decodeURIComponent (try/catch → raw param fallback)
  │  resolves the window: URL date_from+date_to (both) ELSE the `this_month`
  │    preset (resolveDateRangePreset) — the page default, so spend always shows
  │  campaignName + the SAME date_from/date_to feed metrics, leads, AND spend
  │  so all three always cover the same set of leads / one window
  │
  ├── VIDEO ↔ METRICS ROW (grid lg:[320px_1fr]; stacks <lg)
  │   ├── <CampaignAdPanel adCreatives campaignKey canUpload />   ← LEFT, instant
  │   │     creatives awaited up-front; carousel OR add-a-video tile (Plus →
  │   │     AdCreativeFormModal, admin/founder only). Card frame ALWAYS renders.
  │   └── <Suspense fallback={<CampaignMetricsStripSkeleton />}>  ← RIGHT, streams
  │         <CampaignMetricsAsync />     ← async server component
  │               Promise.all([
  │                 getCampaignDetailMetrics(campaignName, { date_from, date_to }),
  │                 getCampaignAgentDistribution(campaignName, { date_from, date_to }),
  │                 getBudgetSummary(date_from, date_to),   ← spend, SAME window
  │               ])
  │               spend matched on normalizeCampaignKey(campaignName) → totalSpend
  │               → <CampaignMetricsStrip metrics distribution totalSpend />
  │                 (8 tiles, 2×4 in the right column; "—" never ₹0)
  │
  └── <Suspense fallback={<LeadsTableSkeleton />}>
        <CampaignLeadsAsync />       ← async server component, FULL WIDTH below
              getLeadsByRoleCached with { campaign: campaignName }
              → <LeadsTable> + <LeadsPagination>
```

**Video left, metrics right.** The video panel renders immediately (creatives are
awaited up-front in the page); the metrics stream into the **right column** via their
own Suspense boundary, so a slow RPC never blocks the video. Below `lg` the row stacks.
The leads table is a **separate** Suspense boundary, full width below the row.

**Spend reuses the list-page source (R-01).** `getBudgetSummary` is the SAME
`/budget` function the list cards use — no new query, no new RPC. It runs in the
metrics `Promise.all` (NOT the leads boundary) and is matched on the normalised
campaign key. `totalSpend` is `null` when no spend row exists for the window →
the Amount Spent / Cost-per-Lead tiles render `—`, never ₹0 (the same null
contract as the list-page `CostCell`).

**Default window = `this_month`.** Unlike the list page (which skips spend when
no range is set), the detail page defaults to the `this_month` preset so Amount
Spent always shows a real figure. A picked range (both bounds present) overrides
it; the Range filter's presets write the same `date_from`/`date_to`. Resolve via
`resolveDateRangePreset('this_month')` — never re-fork the IST month-boundary math.

---

## New RPCs (migration 20260528000015)

### get_campaign_detail_metrics(p_campaign, p_date_from, p_date_to)

Returns a single row for one campaign. Adds `avg_hours_to_first_touch` via a
lateral join to `lead_activities` for the earliest `status_changed → touched` event
per lead. Never recomputes what the list-page RPC already returns.

Called from: `getCampaignDetailMetrics(campaignName, { date_from, date_to })`

### get_campaign_agent_distribution(p_campaign, p_date_from, p_date_to)

Returns one row per assigned agent: `(agent_id, full_name, lead_count)`.
Single `GROUP BY assigned_to` — never one query per agent (N+1 is a bug).
Unassigned leads (`assigned_to IS NULL`) are excluded.

Called from: `getCampaignAgentDistribution(campaignName, { date_from, date_to })`

---

## Promise.all Contract (detail page)

```typescript
const [metrics, distribution, spendRows] = await Promise.all([
  getCampaignDetailMetrics(campaignName, { date_from, date_to }),
  getCampaignAgentDistribution(campaignName, { date_from, date_to }),
  getBudgetSummary(date_from, date_to),                       // spend, same window
]);
```

Never sequential awaits. All three reads run in parallel inside `CampaignMetricsAsync`.
The leads query runs in a **separate** async component (`CampaignLeadsAsync`) under
its own Suspense boundary — it does not participate in the same Promise.all.

---

## Division-by-Zero Guard Contract

All rate fields divide by `total_leads`. When `total_leads === 0`:

- Conversion rate → "—"
- Junk rate value → "—"
- RNR rate sub-label → "—"

This is enforced in `CampaignMetricsStrip.tsx` via the helper functions
`conversionRateSub`, `junkRateSub`, `rnrRateSub` — all check `total === 0` first.
Never reach `formatPercent` with a denominator of zero.

---

## Agent Distribution Bar Rule

`AgentDistributionBar` renders only when `distribution.length > 1`.
A single agent means no meaningful distribution to show.
The bar uses Framer Motion `layoutId` + `animate={{ width }}` on each segment —
never a CSS `transition: width` (Rule V-19: never animate layout properties).

---

## Access Control

| Role    | Access                             |
| ------- | ---------------------------------- |
| agent   | redirect → /dashboard              |
| guest   | redirect → /dashboard              |
| manager | domain pre-locked to their domain  |
| admin   | all domains, domain filter visible |
| founder | all domains, domain filter visible |

Sidebar "Campaigns" link is rendered for manager, admin, founder only.
`isManager = profile.role === 'manager' || isPrivileged` (Sidebar.tsx).

---

## Ad creative uploads (admin)

Manage videos at `/admin/ad-creatives` — see `src/app/(dashboard)/admin/ad-creatives/CLAUDE.md`.
List/detail pages only **read** via `getAdCreativesForCampaigns` (batch) or `getAdCreativesForCampaign` (dossier).
