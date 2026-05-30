# Campaigns Page — CLAUDE.md

## Architecture

```
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
              calls getCampaignMetrics(role, callerDomain, filters)
              maps to <CampaignCard> list
              empty state: Playfair italic

campaigns/[id]/page.tsx              ← Server component
  │  id = encodeURIComponent(utm_campaign) — decoded with decodeURIComponent
  │  calls getLeadsByRoleCached with { campaign: decodedName }
  │  renders <LeadsTable> (existing component — zero changes needed)
```

---

## Campaign ID Encoding Contract

`utm_campaign` values may contain spaces but **never** a literal `+` character.

- **List page → detail page:** `campaign.campaign_name.replace(/\s+/g, '+')` — spaces become `+`, nothing else is encoded.
- **Detail page → leads query:** `params.id.replace(/\+/g, ' ')` — exact inverse, `+` decoded back to spaces.
- **Never** use `encodeURIComponent` / `decodeURIComponent` for campaign names. The `+` convention keeps the address bar readable (`TG_House_Meta+Leads_Goa+Resort` vs `TG_House_Meta%20Leads_Goa%20Resort`).
- **`+` must never appear in a utm_campaign name.** If it does, the `+` decodes as a space, the DB lookup finds the wrong campaign, and the leads list is empty with no error. Verify all real campaign keys contain no `+` before adding new ones.
- **Defensive `%2B` decode.** `campaigns/[id]/page.tsx` strips `%2B` (case-insensitive) before the `+→space` swap. This handles double-encoded links from address-bar pastes or external referrers. Without this, the heading would render `%2B` literally.

---

## Detail Page Title — Beautification Rule

`campaigns/[id]/page.tsx` renders **two** derived values from `params.id`:

- `campaignName` — the un-beautified key used for **all** DB lookups. Spaces only; `+` and `%2B` decoded to spaces. Never modified beyond that.
- `campaignTitle` — display-only. Built by `campaignName.split(/[_\s]+/).filter(Boolean).join(' · ')`. Used only in the H1.

**Rule:** never pass `campaignTitle` to a service function or RPC. The DB stores raw `utm_campaign` keys (with underscores) and the lookup must match exactly. If a future feature needs the beautified form anywhere other than the H1, derive it locally — do not thread it through service-layer arguments.

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

The domain filter control (`<select>`) is absent from the DOM entirely for manager role
(`showDomainFilter = role === 'admin' || role === 'founder'`).

---

## URL Param Keys

| Filter    | URL param   | Type              |
|-----------|-------------|-------------------|
| domain    | `domain`    | AppDomain string  |
| date from | `date_from` | ISO date string   |
| date to   | `date_to`   | ISO date string   |
| page      | `page`      | integer (detail page only) |

Campaign filter changes do not need a page param — the list page has no pagination.
The detail page uses `page` for lead pagination (passed through `LeadsPagination`).

---

## date_to End-of-Day Rule

Same as leads: when `date_to` is present, the service appends `T23:59:59.999Z` before
calling the RPC. This is done in `getCampaignMetrics()`, not in the component or page.

---

## Detail Page Architecture (campaigns/[id]/page.tsx)

```
[id]/page.tsx                        ← Server component
  │  decodes id with decodeURIComponent → notFound() on throw (Q-10)
  │  campaignName used identically for BOTH the metrics RPC and leads query
  │  so metrics and table rows always cover the same set of leads
  │
  ├── <Suspense fallback={<CampaignMetricsStripSkeleton />}>
  │     <CampaignMetricsAsync />     ← async server component
  │           Promise.all([
  │             getCampaignDetailMetrics(campaignName, { date_from, date_to }),
  │             getCampaignAgentDistribution(campaignName, { date_from, date_to }),
  │           ])
  │           → <CampaignMetricsStrip metrics={...} distribution={...} />
  │
  └── <Suspense fallback={<LeadsTableSkeleton />}>
        <CampaignLeadsAsync />       ← async server component
              getLeadsByRoleCached with { campaign: campaignName }
              → <LeadsTable> + <LeadsPagination>
```

**Two independent Suspense boundaries.** Metrics and table stream separately.
A slow table does not block the stat cards from appearing, and vice versa.

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
const [metrics, distribution] = await Promise.all([
  getCampaignDetailMetrics(campaignName, { date_from, date_to }),
  getCampaignAgentDistribution(campaignName, { date_from, date_to }),
]);
```

Never sequential awaits. Both RPCs run in parallel inside `CampaignMetricsAsync`.
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

| Role     | Access                              |
|----------|-------------------------------------|
| agent    | redirect → /dashboard              |
| guest    | redirect → /dashboard              |
| manager  | domain pre-locked to their domain   |
| admin    | all domains, domain filter visible  |
| founder  | all domains, domain filter visible  |

Sidebar "Campaigns" link is rendered for manager, admin, founder only.
`isManager = profile.role === 'manager' || isPrivileged` (Sidebar.tsx).
