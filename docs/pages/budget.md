# Budget — Page Spec

> **Purpose:** spec for `/budget` — Meta ad spend vs lead/deal outcomes per campaign, fed exclusively by CSV uploads into our own DB.
> **Audience:** engineers. · **Source-of-truth scope:** the budget route, `ad_spend_daily`, the spend parser/upload pipeline, `get_budget_summary`.
> **Last verified:** 2026-06-12 (initial build — migrations 0104/0106).

## 1. Purpose

Answer "what did a lead/deal cost us, per campaign?" from our own database. Meta
daily-breakdown CSV exports are ingested into `ad_spend_daily`; the page joins spend
to lead counts and deals on the shared campaign key. **The page never calls a Meta
API** — if spend looks stale, a new export needs uploading.

## 2. Who sees it

manager (read) · admin/founder (read + upload) · agent/guest → `redirect('/dashboard')`.
`/budget` is in `DOMAIN_ROUTE_MAP` for the four Gia domains + `marketing`; admin/founder
bypass the map. Sidebar: Analytics section, manager+.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Table | `ad_spend_daily` (migration 0104) — day grain, `UNIQUE(campaign_key, spend_date, source)`, RLS manager+ read / admin+founder write |
| RPC | `get_budget_summary(p_date_from, p_date_to)` (0106) — spend per campaign LEFT-joined to lead counts (`created_at` cohort) and deals (count/revenue by `won_at` via `deals.lead_id`); EXECUTE revoked (Q-13), admin-client only |
| Service | `src/lib/services/ad-spend-service.ts` — `getBudgetSummary` (CPL/CPD computed here, `null` at zero denominators), `getExistingSpendKeys` (inserted-vs-updated counting). **No Redis** — always live, like `/campaigns` |
| Parser | `src/lib/utils/ad-spend-parse.ts` — CLIENT-SIDE ONLY (dynamic `xlsx`, same rule as `export.ts`) |
| Action | `src/lib/actions/ad-spend.ts` — `uploadAdSpendAction` (Zod → `requireProfile(['admin','founder'])` → upsert) |
| Period system | Same IST presets as `/performance` via reused `PerformanceFilters` (URL `?period/from/to`) |

## 4. The campaign-key invariant (do not regress)

`campaign_key` is **always** `normalizeCampaignKey()` (lowercase + trim) from
`src/lib/utils/campaigns.ts` — the same function `upsertAdCreative` uses, enforced by
identical CHECK constraints on `ad_creatives` (0012) and `ad_spend_daily` (0104), and
matched in SQL as `lower(trim(leads.utm_campaign))`. A forked normaliser silently
orphans spend from leads — this is failure mode #2 of the original brief.

## 5. The grain guard (the single most important line)

`parseMetaSpendFile` rejects the **entire file** when any row has
`Reporting starts !== Reporting ends`, with an instructional message to re-export with
*Breakdown → By time → Day*. A range-grain file ingested once would permanently
double-count against later daily uploads. Never soften this to a per-row skip.

Other parser behaviour: column whitelist (Reporting starts/ends, Campaign name,
Results, Amount spent (INR), Impressions, Reach, Link clicks — everything else
discarded); zero-spend inactive rows skipped (counted, reported in the toast);
duplicate (campaign, day) rows merged before upsert.

## 6. Upload flow

`AdSpendUploadButton` (admin/founder only, page header CTA) → `next/dynamic`
`AdSpendUploadModal` behind `useMountOnFirstOpen` → file picker → client parse →
preview (row count, date range, skipped count) → `uploadAdSpendAction` →
`{ inserted, updated, skipped }` success toast → `router.refresh()`.

**Idempotency:** the action upserts on `(campaign_key, spend_date, source)` — re-uploading
the same export changes zero values; the summary reports those rows as `updated`.

## 7. Page anatomy

Canonical list-page layout: title row (+ upload CTA) → `PerformanceFilters` strip →
`Suspense`-wrapped `BudgetAsync`:

- **Totals strip** — `StatTile variant="cell"` row: Total Spend, Leads, Cost/Lead,
  Deals Closed, Cost/Deal, Revenue. CPL/CPD render "—" when the denominator is 0.
- **Per-campaign table** — `Table<T>` (sanctioned read-only RPC grid): campaign
  (`beautifyCampaignTitle`), spend, results, impressions, link clicks, leads, CPL,
  deals, CPD, revenue. Rows are spend-driven — campaigns with leads but no spend live
  on `/campaigns`, not here.
- **Empty:** `EmptyState` hero (Wallet icon) — copy differs for uploaders vs readers.

## 8. Invariants

1. Spend rows are spend-driven; the join to leads/deals is LEFT — a campaign with
   spend and zero leads must still appear (that's the signal).
2. `spend_date` is an IST calendar date; the RPC converts the timestamptz period
   bounds via `AT TIME ZONE 'Asia/Kolkata'` so spend and lead windows describe the
   same IST days.
3. CPL/CPD are `null` (→ "—") at zero denominators — never ₹0.
4. No Redis namespace; freshness is `revalidatePath('/budget')` on upload + always-live reads.
5. Parser stays client-side only (xlsx bundle rule) — never import it from an action/service.
