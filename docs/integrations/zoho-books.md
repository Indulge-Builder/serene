# Zoho Books

> **Purpose:** how Serene reads Zoho Books (the company's ledger), and the one home for the `/books` page. Covers the API client, the call budget, caching, the two reads, who calls them, and the member finance page's Zoho cards.
> **Audience:** engineers, and the founder for the credentials and the daily allowance.
> **Source-of-truth scope:** `src/lib/services/zoho-api.ts`, `src/lib/services/zoho-service.ts`, `src/lib/constants/zoho.ts`, `src/lib/types/zoho.ts`, `src/lib/actions/books.ts`, `src/components/books/`, `src/app/(dashboard)/books/`, `src/components/members/MemberZohoCards.tsx`. The member finance page as a whole lives in [../pages/members.md](../pages/members.md).
> **Last verified:** 2026-09-26 against the files above, `src/app/(dashboard)/members/[id]/finance/page.tsx`, `src/lib/elaya/elaya-data.ts` (the books and member-finance reads), `src/lib/services/elaya-briefing.ts`, `src/lib/constants/route-permissions.ts`, `src/components/layout/Sidebar.tsx`, `.env.example`.

Zoho Books is the company's ledger: invoices, payments, bills, bank accounts, the profit and
loss. Serene reads it live. It writes ONE thing, since 2026-09-29 (migration 0250, Decision Log): the
reimbursement invoice a finance person confirmed on a Freshdesk ticket (create, mark sent, apply
the member's credit), in `finance-mutations.ts` and nowhere else. Nothing from Zoho is copied into
Postgres; balances live in Redis for a few minutes at most, and Zoho stays the truth.

Four things read it:

| Reader | What it gets | Gate |
| --- | --- | --- |
| `/books` (this doc, below) | the organisation-wide picture | admin and founder only |
| `/members/[id]/finance` (the Zoho cards, below) | one member's balances, invoices, payments, credit notes | whoever can see the member, minus guests and the Joker head (`canSeeMemberFinance`) |
| Elaya: `get_books_overview`, `get_member_finance`, the money part of `get_member_360` | the same two reads, trimmed | same gates as the pages. Tool contracts: [../modules/elaya.md](../modules/elaya.md) |
| The twice-daily founders' brief | the overview, filtered to the brief's window | runs from Trigger.dev. See [../modules/elaya-analyst.md](../modules/elaya-analyst.md) |

## How Zoho sends data

- **API version:** Books REST API v3. Every path is `https://<api domain>/books/v3/...` and
  every call carries `organization_id`. The downloaded OpenAPI specs sit in `zoho books-api/`
  at the repo root (44 files, one per module). The folder is git-ignored.
- **Data centre:** the organisation lives in India. Tokens come from `accounts.zoho.in` and the
  API domain the token response names is `https://www.zohoapis.in`. The `.com` host answers
  `invalid_member` for our credentials, which is how you tell.
- **Auth:** OAuth 2, refresh-token flow. `ZOHO_REFRESH_TOKEN` (long lived) is exchanged for an
  access token that lives one hour. Scope on the live token: `ZohoBooks.fullaccess.all`.
  Serene only reads.
- **Lists:** `page` + `per_page` (max 200) and `page_context.has_more_page`; no totals. Filters
  are query params (`customer_id`, `status`, `date_start`, `date_end`, `sort_column`).
- **Money:** `total`, `balance`, `amount` are numbers in INR. The invoice dashboard alone
  returns strings with Indian grouping ("26,17,885.15"); `zbAmount()` parses them.
- **Reports:** `/reports/profitandloss`, `/reports/balancesheet`, `/reports/aragingsummary`,
  `/reports/cashflow`, `/reports/salesbycustomer` all answer for this organisation even though
  the downloaded specs do not list them. Serene reads the P&L and the AR aging summary.
  `reportTotal()` finds a labelled total anywhere in the report tree (the labels on the live
  report: "Total Operating Income", "Total Operating Expense", "Net Profit/Loss").
- **Banking queue:** `/banktransactions?account_id=…&filter_by=Status.Uncategorized` lists the
  bank-feed lines nobody has matched or categorised yet (added 2026-09-24).
- **Queendom:** contacts and invoices carry a custom field `cf_queendon` (sic), the queendom
  name as finance records it. The member finance page shows it as "Queendom (Zoho)".
- **Organisation facts** (read live 2026-09-15): PRICETIME TECHNOLOGIES PRIVATE LIMITED, INR,
  financial year from 1 April.

## The client (`zoho-api.ts`)

`zoho-api.ts` is the only file that talks to Zoho. It imports `server-only`, and only
`zoho-service.ts` calls it.

- **Token.** The access token is kept in Redis (`zoho:books:token:v1`, 3,540 s) and in a module
  memo, and is refreshed a minute before it expires. Only one refresh runs at a time: a page
  fires a dozen reads at once and Zoho throttles token calls. A 401 forces one refresh and a
  retry.
- **Rate limits.** A 429 waits 1.5 s, then 3 s, and retries (three attempts in all).
- **Budget.** Every read carries a `ZbBudget`: at most `ZOHO_RUN_MAX_CALLS` (25) calls, and
  never below `ZOHO_DAILY_RESERVE` (500) of the day's allowance, read from each response's
  `x-rate-limit-remaining`. The allowance is `x-rate-limit-limit: 10000` a day for the
  organisation, about 100 a minute, **shared with the member app's server**, which is why the
  reserve exists. A read that would break either limit throws `ZbBudgetExhausted`.
- **Not configured.** `isZohoConfigured()` needs all four credentials. Without them the service
  reads return `null` and the pages say "Zoho Books is not connected."

## What Serene reads (`zoho-service.ts`)

| Read | Calls | Cache | Invalidation |
| --- | --- | --- | --- |
| `getBooksOverview()` | 12 to 16 in parallel: organisation, invoice dashboard, AR aging, bank accounts, open bills, overdue bills, this month's payments (1 to 5 pages), overdue invoices, latest invoices, latest payments, P&L this month, P&L financial year to date. Then the Banking queue: one call per active bank or credit-card account, at most 8 (`ZOHO_UNCATEGORISED_MAX_ACCOUNTS`). All inside the 25-call budget | Redis 5 minutes, `zoho:books:overview:v1` | `invalidateBooksOverview()` (the Refresh button) |
| `getMemberFinance(zohoCustomerId)` | 4 in parallel, on a budget of 8: the contact, invoices, customer payments, credit notes (first page of each, up to 200 rows) | Redis 1 minute, `zoho:books:client:<customer id>:v1` (the key kept the old word) | `invalidateMemberFinance(id)` (the member finance Refresh) |

Both go through `withRedisCache` (`cache-helpers.ts`), so a Redis failure falls through to
Zoho instead of failing the page. Five minutes on the overview keeps a busy day well under the
allowance.

What the overview returns (`BooksOverview` in `types/zoho.ts`): receivables (total due,
overdue, due today, due in 30 days, average days to get paid, aging buckets), payables (open
and overdue bills), cash (bank, card and clearing balances plus every active account), this
month (invoiced = P&L operating income, received = payments recorded, spent = operating
expenses), financial year to date (income, expenses, net profit), the uncategorised bank feed
(count, inflow, outflow, by account; `null` when it could not be read), up to 50 overdue
invoices oldest first, the 25 latest invoices and payments, and how many calls it spent and
how many remain today.

The uncategorised feed is read for Elaya and the brief. The `/books` page does not show it
today.

What the member read returns (`MemberFinance`): the Zoho contact (or `null` if that call
failed; the rest still loads), invoices, payments, credit notes, and totals. Outstanding and
unused credits come from the contact record when it loaded, otherwise they are summed from the
lists. Invoiced sums every invoice that is not void or draft; paid sums the payments.

## The `/books` page

### Purpose

The organisation's money on one page, read live from Zoho: what we are owed and how old it
is, this month and the financial year, what we owe and the cash we hold, the overdue invoices,
the latest invoices and payments, and every account. Rows link out to Zoho Books.

### Who sees it

Admin and founder only. The page has a literal role check (`canSee` in `books/page.tsx`), not
the shared elevated-page helper, because the tech workbench reaches every other page but not
this one (`WORKBENCH_BLOCKED_PREFIXES = ['/books']` in `route-permissions.ts`). It is in the
founder's nav list (`FOUNDER_NAV_PREFIXES`) and in the sidebar's admin section. The Refresh
action is `requireProfile(['admin', 'founder'])`.

### Data sources

| Layer | Item |
| --- | --- |
| Service | `getBooksOverview()` (5-minute Redis copy), `zohoOrgId()` for the web links |
| Action | `refreshBooksOverviewAction()` in `actions/books.ts`: drops the Redis copy, `revalidatePath('/books')` |
| Constants | `ZOHO_BOOKS_PATH`, `ZOHO_INVOICE_STATUS` (label and tone per status), `zohoBooksWebUrl()` |

### Components

| Component | What it shows |
| --- | --- |
| `BooksOverviewStrip` (`components/books/BooksOverview.tsx`) | three sections of `StatTile`s: "Money owed to us" (receivable, overdue with its share, due today, due in 30 days, days to get paid) plus the Aging `StatStrip` (the oldest bucket's share in danger ink); "This month and the year" (invoiced, received, spent this month, income and net profit FY to date); "Money we owe, and cash" (bills open, bills overdue, banks, cards, clearing). A `MetaLine` underneath: when it was read, the organisation, the currency, API calls left today |
| `ZohoInvoicesTable` (`ZohoTables.tsx`) | overdue invoices (preview 15, "50+" when the list is full) and latest invoices (preview 12) |
| `ZohoPaymentsTable` | latest payments (preview 12): number, customer, date, mode, the invoices it paid or "advance" |
| `BooksBankAccounts` | every active account, largest balance first, with its type icon; a negative balance in danger ink |
| `RefreshBooksButton` | the Refresh action, then `router.refresh()` |
| `ZohoStatusPill` | an invoice or credit-note status as a pill |

Money tiles use `formatCurrencyCompact` (₹28.1L, ₹1.2Cr); tables and the account list keep
the full figure. `ZohoTables` is a client component because `Table<T>` takes render functions;
the rows arrive as plain data from the server page.

### States

- **Loading:** `books/loading.tsx` (`BooksSkeleton`), also the Suspense fallback.
- **Not connected:** a framed `EmptyState`, "Zoho Books is not connected.", naming the four env
  vars.
- **Zoho failed:** a framed `EmptyState`, "Zoho did not answer.", with a hint to try Refresh; the
  error is logged as `[books/page] Zoho read failed`.
- **Empty lists:** inline empty states ("Nothing overdue.", "No invoices.", "No payments.").

### Invariants

- Never a write to Zoho, from any file.
- Nothing from Zoho lands in Postgres; the only copies are the Redis TTLs above.
- One read never spends more than 25 calls, and no read spends below 500 of the day.

## The member finance page's Zoho cards

`/members/[id]/finance` first shows what Serene holds (the membership tiles and the money
events), then, when the member has a `zoho_customer_id`, streams in `MemberZohoCards` behind a
Suspense skeleton (`MemberZohoSkeleton`). The page itself, its gate and the Joker head rule are
in [../pages/members.md](../pages/members.md).

`MemberZohoCards` shows:

- four tiles: Outstanding, Invoiced (count, all time), Paid (count), Unused credits;
- the Zoho customer record: name and company, the id behind `RevealId`, "Open in Zoho", status
  when not active, email and phone (primary contact person first), billing address, GST,
  payment terms, the `cf_queendon` queendom, customer since, Zoho notes; with when it was read
  and a Refresh button;
- the invoices (preview 20), payments (preview 15) and credit notes tables, without the
  customer column.

`refreshMemberFinanceAction` (`actions/books.ts`): Zod (member id + a 5 to 30 digit customer
id) → `requireProfile()` → `canAccessMember` → `canSeeMemberFinance` → drop that customer's
Redis copy → `revalidatePath` of the finance page.

If Zoho fails the card says "Zoho did not answer." with a Refresh button; if the credentials
are missing it says "Zoho Books is not connected."

## Credentials

| Variable | Purpose |
| --- | --- |
| `ZOHO_CLIENT_ID` | OAuth client |
| `ZOHO_CLIENT_SECRET` | OAuth client secret |
| `ZOHO_REFRESH_TOKEN` | the long-lived refresh token |
| `ZOHO_ORGANIZATION_ID` | the Books organisation; also used in the web links |
| `ZOHO_ACCOUNTS_HOST` (optional) | overrides the accounts host, default `accounts.zoho.in` |

In `.env.local` since 2026-09-15 and listed in `.env.example`. They are needed wherever a
Zoho read runs: the app (Vercel) for the pages and Elaya's tools, and Trigger.dev for the
brief. TODO: verify the four are set in the Trigger.dev environment.

## Files

| File | Role |
| --- | --- |
| `src/lib/constants/zoho.ts` | the vocabulary: path, budget numbers, cache TTLs and keys, invoice status tones, the web-app link |
| `src/lib/types/zoho.ts` | the API shapes read (`ZbInvoice`, `ZbPayment`, `ZbContact`, `ZbBankTransaction`, …) and the two page shapes (`BooksOverview`, `MemberFinance`) |
| `src/lib/services/zoho-api.ts` | THE client: token, budget, `zbGet`, typed reads, `zbAmount`, `reportTotal` |
| `src/lib/services/zoho-service.ts` | THE two reads and their cache invalidation |
| `src/lib/actions/books.ts` | the two Refresh actions (overview, one member) |
| `src/components/books/` | `BooksOverview` (strip + accounts), `ZohoTables` (invoices, payments, credit notes), `ZohoStatusPill`, `RefreshBooksButton` |
| `src/app/(dashboard)/books/` | the page and its loading skeleton |
| `src/components/members/MemberZohoCards.tsx`, `MemberZohoSkeleton.tsx`, `RefreshMemberFinanceButton.tsx` | the live part of the member finance page |

## Open items

- The member read takes the first page (200 rows) of invoices, payments and credit notes. A
  member with more than 200 invoices would show a partial "all time" total. None is near that
  today, but the tile does not say so.
- The uncategorised bank feed is on the overview but not on the `/books` page.
- `zoho-service.ts` and `zoho-api.ts` import `server-only`, and `elaya-briefing.ts` imports
  `zoho-service` at the top of the module. That is fine on Trigger.dev: its build replaces
  `server-only` with an empty module (the SLA, reminder and revival tasks have always had it in
  their import chains). The `server-only` rule only bites laptop `tsx` scripts. Without the Zoho
  env vars on the worker, the brief simply leaves out its money section.
- `zoho:books:client:<id>:v1` still carries the old word "client" in the key. Harmless; change
  it only together with a cache flush.
