# Budget — Page Spec

> **Purpose:** spec for `/budget` — Meta ad spend vs lead/deal outcomes per campaign, **plus** a
> per-account recharge ledger (recharged · spent · balance), both fed exclusively from our own DB.
> **Audience:** engineers. · **Source-of-truth scope:** the budget route, `ad_spend_daily`,
> the spend parser/upload pipeline, `get_budget_summary`, `ad_account_recharges`, and the
> account-attribution + report builder.
> **Last verified:** 2026-07-02 (admin/founder-only gate 2026-06-25 + `BudgetFilterBar`; recharge ledger 0139 + campaign-account backfill 0141).
> **Route invariants:** `src/app/(dashboard)/budget/CLAUDE.md` (the authoritative file map). This page spec is the single doc home for `/budget`.

## 1. Purpose

`/budget` answers two questions from our own database, never a live Meta API call:

1. **"What did a lead/deal cost us, per campaign?"** Meta daily-breakdown CSV/XLSX exports are
   ingested into `ad_spend_daily`; the page joins spend to lead counts and deals on the shared
   campaign key. If spend looks stale, a new export needs uploading.
2. **"How much have we sent each Meta ad account, and what's the balance?"** A finance ledger
   (`ad_account_recharges`) records money sent to each account; the per-account report joins it to
   spend by **deriving** the account from each campaign key. **Balance = recharged − spent, INR-only.**

The two planes share one date range and one page but are otherwise independent — spend is uploaded,
recharges are hand-entered, and account attribution is the only thing that ties them together.

## 2. Who sees it

**Admin/founder only** (read + upload spend + add recharge). Everyone else, including managers,
gets `redirect('/dashboard')`. Restricted 2026-06-25; managers previously had read access. The
dashboard Campaign Budget widget was gated to admin/founder the same day.

The page gates with a **direct role check** in `page.tsx`
(`['admin','founder'].includes(profile.role)` → else `redirect('/dashboard')`). It does
**not** reference `DOMAIN_ROUTE_MAP` — that map governs the layout/sidebar guard, not this page's own
redirect (`route-permissions.ts` notes "/budget is admin/founder ONLY"). Both header CTAs
(`AddRechargeButton`, `AdSpendUploadButton`) render behind `canUpload`
(`role === 'admin' || 'founder'`), which now covers every user who can reach the page.
Sidebar: Analytics section, admin/founder.

The RLS layer is unchanged: both tables (`ad_spend_daily`, `ad_account_recharges`) still grant
manager+ SELECT and admin/founder write at the DB layer. The page redirect is now the stricter of
the two layers (A-09), and no manager-facing surface reads these tables.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Spend table | `ad_spend_daily` (migration 0104) — day grain, `UNIQUE(campaign_key, spend_date, source)`, RLS manager+ read / admin+founder write. **No account column** — account is derived (§4b). |
| Recharge table | `ad_account_recharges` (migration 0139) — finance ledger, mirrors `ad_spend_daily`'s table/RLS/trigger pattern. `ad_account` `CHECK IN ('april','gmr','dubai')` (SQL mirror of `AD_ACCOUNT_KEY_VALUES`), `amount numeric(12,2) CHECK (amount > 0)`, `currency` (default `'INR'`), `recharged_at date`, `done_by → profiles`, free-text `method`/`note` with a `no_card_pan` CHECK. RLS manager+ read, admin/founder write/update/**delete** (hard DELETE permitted — recharges are an editable money figure, mirrors `ad_spend_daily`). |
| RPC | `get_budget_summary(p_date_from, p_date_to)` (0106) — spend per campaign LEFT-joined to lead counts (`created_at` cohort) and deals (count/revenue by `won_at` via `deals.lead_id`); EXECUTE revoked (Q-13), admin-client only. |
| Service | `src/lib/services/ad-spend-service.ts` — `getBudgetSummary` (CPL/CPD computed here, `null` at zero denominators), `getExistingSpendKeys` (inserted-vs-updated counting, **hard-filtered to `.eq('source','meta_csv')`** — the count is scoped to Meta-CSV rows), `getAccountRecharges(from,to)` (date-portion window, joins recharger name), and `buildAccountReport(campaignRows, recharges)` (**pure, no IO** — the per-account report). **No Redis** — always live, like `/campaigns`. |
| Attribution | `src/lib/constants/ad-accounts.ts` — `AD_ACCOUNTS` (the 3 live accounts), `resolveAccountFromCampaign(key)`, `UNATTRIBUTED_ACCOUNT_KEY`, `accountLabel()`. See §4b. |
| Parser | `src/lib/utils/ad-spend-parse.ts` — `parseMetaSpendFile`, CLIENT-SIDE ONLY (dynamic `xlsx`, same rule as `export.ts`). See §5. |
| Spend action | `src/lib/actions/ad-spend.ts` — `uploadAdSpendAction` (Zod → `requireProfile(['admin','founder'])` → re-sanitize + `normalizeCampaignKey()` → upsert). |
| Recharge action | `src/lib/actions/recharge.ts` — `createRechargeAction` (Zod `createRechargeSchema` → `requireProfile(['admin','founder'])` → re-`sanitizeText` labels → insert → `revalidatePath('/budget')`). |
| Period system | Shared with `/performance` via `BudgetFilterBar` (`src/app/(dashboard)/budget/BudgetFilterBar.tsx`), which renders the reused `PerformanceFilters` with **search enabled** (`showSearch`, "Search campaigns…") plus the Accounts\|Campaigns `TabSelector` in its `tabSlot`. Tab state lives in `BudgetTabProvider` (`budget-tab-context.tsx`, default `'accounts'`); `BudgetWorkspace` reads it via `useBudgetTab()`. **URL params are `date_from` / `date_to`** (read in `page.tsx`, fed to `resolvePerformanceDateParams`; default = This Month). There is **no** `?period` param on this page. |

## 4a. The campaign-key invariant (do not regress)

`campaign_key` is **always** `normalizeCampaignKey()` (lowercase + trim) from
`src/lib/utils/campaigns.ts` — the same function `upsertAdCreative` uses, enforced by
identical CHECK constraints on `ad_creatives` (0012) and `ad_spend_daily` (0104), and
matched in SQL as `lower(trim(leads.utm_campaign))`. A forked normaliser silently
orphans spend from leads — this is failure mode #2 of the original brief.

## 4b. Account attribution (the real-money invariant)

The ad account is **derived from the campaign key, never stored on spend** (`ad_spend_daily` has no
account column — exactly like domain). Convention: `TG_<Domain>_<Account>_<Type>_<Date>`, normalised
lowercase. The account is the **third `_`-delimited segment (index 2)** — the index-2 twin of
`resolveDomainFromCampaign` (which keys off the index-1 domain segment):

```text
tg_global_april_lead gen_17 june
└0─┘ └─1──┘ └─2─┘  …
              ▲ account
```

`resolveAccountFromCampaign(key)` splits on `_`, matches index 2 against `AD_ACCOUNTS`
(`april` / `gmr` / `dubai`), and falls back to the visible **`'unattributed'`** bucket on any miss
(too few segments, unknown token, null). It never throws and never guesses a real account.

**Non-negotiables (this is finance data):**

- An unknown / missing / malformed account segment → **Unattributed**, rendered **visibly**
  (warning-tinted block + "rename to attribute" hint). NEVER merged into another account, NEVER
  silently dropped. Unattributed showing up is what makes the post-rename pass self-auditing.
- `AD_ACCOUNTS` is the single source for the 3 live accounts + Meta account ids; the DB CHECK on
  `ad_account_recharges.ad_account` mirrors `AD_ACCOUNT_KEY_VALUES`. The live entries
  (`lib/constants/ad-accounts.ts`; the `metaAccountId` is documentation-only, attribution is by
  `key`):

  | key | display name | Meta account id |
  | --- | --- | --- |
  | `april` | Indulge Global April 2023 | 1364122324409409 |
  | `gmr` | Indulge GMR | 1300197968477104 |
  | `dubai` | Indulge Global Dubai | 944666504816724 |

  **Pending:** "Indulge New Gen": the Meta account does not exist yet, so it stays a commented
  placeholder in `ad-accounts.ts` (key + id TBD). Adding it = one `AD_ACCOUNTS` line + a
  CHECK-extending migration. No other change.
- Existing campaign names were renamed **in place** to carry the account segment by the
  **2026-06-24 backfill (migration 0141)**, so index-2 parsing is now correct for live + archived
  leads. Non-Meta traffic (Organic, Google ads, remarketing) intentionally keeps no account segment
  → shown as Unattributed (the honest result), never given a fake account.

## 5. The grain guard (the single most important parser line)

`parseMetaSpendFile` rejects the **entire file** when any row has
`Reporting starts !== Reporting ends`, with an instructional message to re-export with
*Breakdown → By time → Day*. A range-grain file ingested once would permanently
double-count against later daily uploads. Never soften this to a per-row skip.

Other parser behaviour: column whitelist (Reporting starts/ends, Campaign name,
Results, Amount spent (INR), Impressions, Reach, Link clicks — everything else
discarded); zero-spend inactive rows skipped (counted, reported in the toast);
duplicate (campaign, day) rows merged before upsert. A file of all-zero rows is rejected
("nothing to import").

## 6. Header actions

Both CTAs are admin/founder-only, both load-on-intent (`next/dynamic` + `useMountOnFirstOpen`,
keeping their bundles out of the initial `/budget` chunk).

**Upload Spend** — `AdSpendUploadButton` → `AdSpendUploadModal` → file picker → client parse
(`parseMetaSpendFile`) → preview (row count, date range, skipped count) → `uploadAdSpendAction` →
`{ inserted, updated, skipped }` toast → `router.refresh()`.

- **Idempotency:** the action upserts on `(campaign_key, spend_date, source)` — re-uploading the
  same export changes zero values; the summary reports those rows as `updated`. An overlapping
  weekly range is safe: matching days are updated in place, never double-counted. So a weekly
  upload cadence is fully supported (a multi-day daily-breakdown export over any range lands as
  one row per day), and the upload modal copy says this plainly.

**Add Recharge** — `AddRechargeButton` → `AddRechargeModal` (composes the shared `Modal`) → account
dropdown (`AD_ACCOUNTS`) + amount + currency (INR/USD) + recharge date + `method`/`note` labels →
`createRechargeAction` → toast → `router.refresh()`.

- **PII guard (defence in depth):** `method`/`note` are free-text payment-method **labels**
  ('NEFT', 'Razorpay', 'Card') — never card data. Three guards: Zod (`recharge-schema.ts`) rejects
  any 13–19-digit run (a card PAN, separator-tolerant); the action re-`sanitizeText`s; the DB CHECK
  `ad_account_recharges_no_card_pan` rejects a PAN structurally.

## 7. Page anatomy

Canonical list-page layout: title row (+ Add Recharge + Upload Spend CTAs) → `BudgetFilterBar`
strip (search + Range/Dates + the Accounts|Campaigns `TabSelector` in its `tabSlot`) →
`Suspense`-wrapped `BudgetAsync`. The whole strip + content sits inside `BudgetTabProvider`
(`budget-tab-context.tsx`) so the tab switcher in the bar and the content switch in
`BudgetWorkspace` share one client state across the Suspense boundary. `BudgetAsync` fetches
`getBudgetSummary` and `getAccountRecharges` in parallel, then:

- **Empty state** — `BudgetEmptyState` (wraps `EmptyState` with the Wallet icon) renders **only**
  when there is NO spend AND NO recharge (`rows.length === 0 && recharges.length === 0`). A recharge
  with no spend still shows the report (the account has a balance). Copy differs for uploaders vs
  readers.
- **Totals strip** — one shared card of `StatTile variant="cell"`: Total Spend, Leads, Cost/Lead,
  Deals Closed, Cost/Deal, Revenue. Currency cells use `formatCurrencyCompact`; counts use
  `formatCompact`/`formatCount`. CPL/CPD render "—" when the denominator is 0 (never ₹0).
- **Attribution caption**: under the totals strip, `BudgetAsync` renders an italic caption stating
  that leads, deals and revenue are attributed to Meta campaigns only; referral, Google and walk-in
  deals are excluded.
- **`BudgetWorkspace`** (client; reads the active tab from `useBudgetTab()`, the `TabSelector`
  itself lives in `BudgetFilterBar`; default **Accounts**). Campaign search (`?search=`) filters
  client-side: the Campaigns-tab rows and each account block's expandable campaign list only.
  Account totals and the recharge history are deliberately never search-filtered (recharges are
  not campaign-scoped). The two tabs:
  - **Accounts** — `AccountReportSection`: one block per account (Recharged · Spent · Balance via
    `StatTile` cells; balance renders in `--color-danger` when negative/overspent) expandable to its
    campaign rows (reuses `BudgetTable`), an "Unattributed" block (warning border, "rename to
    attribute" hint) only when a campaign fails to resolve, and a grand-total Meta-spend +
    recharged line. Below it: a **Recharge History** section with `RechargeHistoryTable` (`Table<T>`:
    Date, Account, Amount, Method, Note, By). A non-INR footnote shows when `report.hasNonInr`.
  - **Campaigns** — `BudgetTable` (`Table<T>`, sanctioned read-only RPC grid): campaign (raw key, no
    decoration), spend, results, impressions, link clicks, leads, CPL, deals, CPD, revenue. Rows are
    spend-driven — campaigns with leads but no spend live on `/campaigns`, not here.

## 8. Invariants

1. **Spend rows are spend-driven;** the join to leads/deals is LEFT — a campaign with spend and zero
   leads must still appear (that's the signal).
2. **`spend_date` is an IST calendar date;** the RPC converts the timestamptz period bounds via
   `AT TIME ZONE 'Asia/Kolkata'` so spend and lead windows describe the same IST days.
3. **CPL/CPD are `null` (→ "—") at zero denominators** — never ₹0. Computed in the service mapper,
   never in SQL.
4. **Account is derived, never stored** — `resolveAccountFromCampaign` over the campaign key
   (index-2 segment). An unresolved key falls into a **visible** Unattributed bucket; never merged,
   never dropped.
5. **Balance = INR recharged − INR spent, INR-ONLY.** Non-INR recharges are summed per currency into
   `block.nonInr` (display-only, excluded from `recharged`/`balance`); `report.hasNonInr` drives a
   footnote. Every live account gets a block even at zero activity (stable grid); Unattributed
   appears only when it has spend or a (mis-keyed) recharge.
6. **No Redis namespace;** freshness is `revalidatePath('/budget')` on upload/recharge + always-live
   reads.
7. **Parser stays client-side only** (xlsx bundle rule) — never import it from an action/service.
8. **`method`/`note` are labels, never card data** — Zod + action `sanitizeText` + DB
   `no_card_pan` CHECK (§6).
