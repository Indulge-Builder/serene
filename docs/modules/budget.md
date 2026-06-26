# Module — Budget (`/budget`)

Finance view of Meta advertising: **what we spent per campaign** and **what we
recharged per ad account**, with cost-per-lead / cost-per-deal outcomes and a
per-account balance. **Admin/founder only** — the `/budget` page redirects
managers to `/dashboard`, the dashboard Campaign-Budget widget is admin/founder-
only, and `/budget` is out of `DOMAIN_ROUTE_MAP` for managers (restricted
2026-06-25; managers previously had read access). The underlying table RLS is
unchanged — `ad_spend_daily`/`ad_account_recharges` still grant manager+ SELECT
at the DB layer — but no manager-facing surface reads them. Admin/founder upload
spend and add recharges.

## Two data planes

| Plane | Source of truth | Read path | Account |
| --- | --- | --- | --- |
| Campaign spend | `ad_spend_daily` (day grain, Meta CSV upload) | `get_budget_summary(from,to)` RPC → `getBudgetSummary` | **derived** from campaign key |
| Account recharges | `ad_account_recharges` (finance ledger) | `getAccountRecharges(from,to)` | **stored** (`ad_account`) |

`buildAccountReport(campaignRows, recharges)` joins them: spend is bucketed by
`resolveAccountFromCampaign`, recharges by their stored `ad_account`, and
`balance = INR recharged − INR spent` per account.

## Account derivation

Campaign keys follow `TG_<Domain>_<Account>_<Type>_<Date>` (normalised
lowercase). The account is the **third `_` segment (index 2)**.
`resolveAccountFromCampaign` (`lib/constants/ad-accounts.ts`) matches index 2
against `AD_ACCOUNTS`; any miss → the visible **Unattributed** bucket (never a
wrong account, never a silent drop).

`AD_ACCOUNTS` (live):

| key | display name | Meta account id |
| --- | --- | --- |
| `april` | Indulge Global April 2023 | 1364122324409409 |
| `gmr` | Indulge GMR | 1300197968477104 |
| `dubai` | Indulge Global Dubai | 944666504816724 |

**Pending:** "Indulge New Gen" — account not yet created (key + id TBD). Adding
it = one `AD_ACCOUNTS` entry + a CHECK-extending migration. No other change.

> Context: `ad_spend_daily` is empty today; existing campaign names predate this
> convention and will be renamed after this ships. Index-2 parsing is therefore
> correct for every row that will ever land in the table.

## Schema — `ad_account_recharges` (migration 0139)

One row per recharge. Mirrors `ad_spend_daily`'s table/RLS/trigger pattern.

- `ad_account text` — CHECK in (`april`,`gmr`,`dubai`) (SQL mirror of
  `AD_ACCOUNT_KEY_VALUES`; extend with New Gen later).
- `amount numeric(12,2)` CHECK `> 0`; `currency text DEFAULT 'INR'`;
  `recharged_at date`; `done_by uuid → profiles`; `platform DEFAULT 'meta'`.
- `method text` / `note text` — free-text labels, **card-PAN-rejecting CHECK**
  (`ad_account_recharges_no_card_pan`: no 13–19 digit run, separator-tolerant).
- Indexes `(recharged_at DESC)`, `(ad_account)`; `update_updated_at()` trigger.
- **RLS:** manager+ SELECT; admin/founder INSERT/UPDATE/DELETE. Hard DELETE is
  permitted (mirrors `ad_spend_daily`) — a recharge is an editable finance
  figure, not an append-only event; a fat-fingered amount must be correctable.

## Finance failure modes guarded

- **Currency cross-contamination** — `balance`/`recharged` count INR only;
  non-INR recharges are summed per currency into `nonInr` (display-only) and a
  page footnote appears when any exist.
- **Account misattribution** — unresolved campaigns land in Unattributed,
  rendered visibly. The post-ship campaign-rename pass is self-auditing.
- **PII** — `method` is a label. Zod + re-sanitize + DB CHECK all reject card
  numbers; none persist.

## Upload — weekly cadence (copy clarified, no logic change)

The Meta CSV/XLSX parser (`ad-spend-parse.ts`, client-side only) keeps its
**grain guard**: a row whose reporting-start ≠ reporting-end (a date-RANGE
export) rejects the entire file. But a multi-day **daily-breakdown** export
(Breakdown → By time → Day) over any range uploads in one go as one row per day,
and re-uploading an overlapping range is idempotent (matching days updated in
place on the `(campaign_key, spend_date, source)` key, never double-counted). So
weekly cadence is fully supported — the upload modal copy now says this plainly.

## Page layout

`/budget` header: `Add Recharge` + `Upload Spend` (admin/founder), shared
`PerformanceFilters` date range. Below the totals strip, a client `BudgetWorkspace`
with two tabs:

- **Accounts** — `AccountReportSection`: one block per account
  (recharged · spent · balance via `StatTile`; balance red when negative), each
  expandable to its campaign rows (reuses `BudgetTable`); an Unattributed block
  when any campaign fails to resolve; a grand-total Meta spend + recharged line.
  Below it, the `RechargeHistoryTable` (`Table<T>`).
- **Campaigns** — the original full per-campaign grid.

## File map

See `src/app/(dashboard)/budget/CLAUDE.md` for the authoritative file map and
reuse invariants.
