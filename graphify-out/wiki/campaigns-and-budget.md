# Campaigns, Ad Creatives & Budget

> **Purpose:** Campaign metadata + ad-video inventory; daily ad-spend ingestion from Meta Ads exports
> (CSV/XLSX); budget summary and CPL/CPD math.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## Entry points & data flow

- **Ad creatives** — `getAdCreativesForCampaign(name)` / `getAdCreativesForCampaigns(names)` (batch, single
  `.in()` query → `Map<key, AdCreative[]>`) / `getAllAdCreatives()`. Input normalized via `normalizeCampaignKey`.
  One campaign may have many videos (migration 0058 dropped the UNIQUE on `campaign_key`).
- **Budget summary** — `getBudgetSummary(from, to)` → RPC `get_budget_summary` (admin client; the
  role-gated page is the trust boundary). CPL/CPD computed in the mapper (null at zero denominators).
- **Ad-spend upload** — `uploadAdSpendAction(rows)`: rows come from the **client-side** parser
  (`lib/utils/ad-spend-parse.ts`) → Zod → re-`normalizeCampaignKey` server-side → upsert on
  `(campaign_key, spend_date, source)` (idempotent — re-upload changes nothing).

---

## Canonical helpers

- `normalizeCampaignKey(raw)` — lowercase+trim; the `ad_creatives` + `ad_spend_daily` CHECKs and every
  `lower(trim(utm_campaign))` join depend on it. **Never re-inline `.toLowerCase().trim()`.**
- `beautifyCampaignTitle(raw)` — display-only decorator; its output is **never** used in a DB query.
- `parseMetaSpendFile()` (`ad-spend-parse.ts`) — CLIENT-ONLY (dynamic `xlsx`); owns the **grain guard**:
  every row must have `Reporting_starts === Reporting_ends` (day-grain only); a range-grain export is
  rejected **wholesale**, never partial-ingested.

---

## Key tables

| Table | Holds |
|---|---|
| `ad_creatives` | `campaign_key`, `url`, `title` — many videos per campaign |
| `ad_spend_daily` | `(campaign_key, spend_date, source)` day-grain: `spend`, `results`, `impressions`, `reach`, `link_clicks` |
| `domain_targets` | reused for CPL/CPD goal cards |

---

## Invariants / gotchas

- **Campaign-key normalization is invariant** — baked into DB CHECKs; every campaign write calls `normalizeCampaignKey`.
- **No Redis cache-aside** here — freshness via `revalidatePath('/campaigns')` + `revalidatePath('/admin/ad-creatives')`.
- **The budget RPC is admin-client** — `get_budget_summary` has EXECUTE revoked from `authenticated`
  (Q-13); the service calls it with session-derived scope args only.
- **The parser is client-only** — `xlsx` is dynamically imported to keep it out of the server bundle (same
  rule as `export.ts`); parsed rows ship to the server for re-sanitize + upsert.
- **Grain guard is mandatory and total** — partial ingest of a range-grain file is never allowed.

---

## File map

| File | Role |
|---|---|
| `src/lib/services/ad-creatives-service.ts` | Campaign creative queries (single/batch/all) |
| `src/lib/services/ad-spend-service.ts` | `getBudgetSummary` RPC wrapper + CPL/CPD mapper; `getExistingSpendKeys` |
| `src/lib/actions/ad-creatives.ts` | `upsertAdCreative`, `deleteAdCreative` (admin/founder) |
| `src/lib/actions/ad-spend.ts` | `uploadAdSpendAction` (Zod, re-normalize, upsert) |
| `src/lib/utils/campaigns.ts` | `normalizeCampaignKey`, `beautifyCampaignTitle` (pure) |
| `src/lib/utils/ad-spend-parse.ts` | CLIENT-ONLY Meta CSV/XLSX parser + grain guard |
| `src/components/campaigns/CampaignCard.tsx` | Campaign metadata + metrics strip |
| `src/components/budget/AdSpendUploadModal.tsx` | Upload form, inserted/updated summary |
| `src/components/budget/BudgetTable.tsx` | Daily spend rows, CPL/CPD columns |
