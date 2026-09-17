# Zoho Books

> **Audience:** engineers, and the founder for the credentials and the daily allowance.

Zoho Books is the company's ledger: invoices, payments, bills, bank accounts, the profit and
loss. Serene reads it live and never writes to it. Two pages read it: `/books` (the whole
organisation, admin and founder) and `/members/[id]/finance` (one member, by the Zoho
customer id on the member spine).

## How Zoho sends data

- **API version:** Books REST API v3. Every path is `https://<api domain>/books/v3/...` and
  every call carries `organization_id`. The OpenAPI specs live in `zoho books-api/` at the
  repo root (44 files, one per module; not committed to the app).
- **Data centre:** the organisation lives in India. Tokens come from `accounts.zoho.in` and
  the API domain the token response names is `https://www.zohoapis.in`. The `.com` host
  answers `invalid_member` for our credentials, which is how you tell.
- **Auth:** OAuth 2, refresh-token flow. `ZOHO_REFRESH_TOKEN` (long lived) is exchanged for an
  access token that lives one hour. `zoho-api.ts` keeps the access token in Redis and a module
  memo, refreshes it a minute before expiry, and refreshes once more on a 401. Scope on the
  live token: `ZohoBooks.fullaccess.all`. Serene only reads.
- **Allowance:** `x-rate-limit-limit: 10000` a day for the organisation (shared with the
  member app's server), about 100 a minute. Every read runs against a `ZbBudget`: at most
  `ZOHO_RUN_MAX_CALLS` (25) per read and never below `ZOHO_DAILY_RESERVE` (500) of the day.
- **Lists:** `page` + `per_page` (max 200) and `page_context.has_more_page`; no totals. Filters
  are query params (`customer_id`, `status`, `date_start`, `date_end`, `sort_column`).
- **Money:** `total`, `balance`, `amount` are numbers in INR. The invoice dashboard alone
  returns strings with Indian grouping ("26,17,885.15"); `zbAmount()` parses them.
- **Reports:** `/reports/profitandloss`, `/reports/balancesheet`, `/reports/aragingsummary`,
  `/reports/cashflow`, `/reports/salesbycustomer` all answer for this organisation even though
  the downloaded specs do not include them. `reportTotal()` finds a labelled total in the tree
  (the labels on the live report: "Total Operating Income", "Total Operating Expense", "Net
  Profit/Loss").
- **Queendom:** contacts and invoices carry a custom field `cf_queendon` (sic), the queendom
  name as finance records it.

## What Serene reads

| Read | Calls | Cache | Used by |
| --- | --- | --- | --- |
| `getBooksOverview()` | ~14: organisation, invoice dashboard, AR aging, bank accounts, open + overdue bills, this month's payments (up to 5 pages), overdue invoices, latest invoices, latest payments, P&L this month, P&L financial year to date | Redis 5 minutes (`zoho:books:overview:v1`); Refresh drops it | `/books` |
| `getMemberFinance(zohoCustomerId)` | 4: contact, invoices, payments, credit notes | Redis 1 minute per customer | `/members/[id]/finance` |

Nothing from Zoho is copied into Postgres. The plan's rule stands: balances are never cached
beyond a short TTL, Zoho is the truth.

## The pages

`/books`: receivables (total due, overdue, due today, due in 30 days, days to get paid, the
aging strip), this month and the financial year (invoiced, received, spent, income, net
profit), payables and cash (open and overdue bills, bank / card / clearing balances), the
overdue invoices oldest first, the latest invoices and payments, every account with its books
balance. Rows link to Zoho Books. Refresh asks Zoho again.

`/members/[id]/finance`: after the membership tiles Serene holds, the live part: outstanding,
invoiced, paid, unused credits; the Zoho customer record (name, email, phone, billing address,
GST, terms, queendom, notes); the invoices, payments and credit notes.

## Credentials

`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORGANIZATION_ID` in
`.env.local` (in place 2026-09-15) and on Vercel before the deploy. Optional
`ZOHO_ACCOUNTS_HOST` overrides the accounts host (default `accounts.zoho.in`).

## Files

| File | Role |
| --- | --- |
| `src/lib/constants/zoho.ts` | the vocabulary: paths, budget numbers, cache TTLs and keys, invoice status tones, the web-app link |
| `src/lib/types/zoho.ts` | the API shapes read and the two page shapes |
| `src/lib/services/zoho-api.ts` | THE member: token, budget, `zbGet`, typed reads, `zbAmount`, `reportTotal` |
| `src/lib/services/zoho-service.ts` | THE two page reads and their cache invalidation |
| `src/lib/actions/books.ts` | Refresh (overview, one member) |
| `src/components/books/` | `BooksOverview` (strip + accounts), `ZohoTables` (invoices, payments, credit notes), `ZohoStatusPill`, `RefreshBooksButton` |
| `src/app/(dashboard)/books/` | the page |
| `src/components/members/MemberZohoCards.tsx` | the live part of the member finance page |
