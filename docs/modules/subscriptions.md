# Subscriptions & Bills Tracker

> **Purpose:** where Finance and Tech track recurring bills, memberships and prepaid (top-up)
> accounts: when each is due, what actually left the account in INR, where the invoices are, and the
> login for the account.
> **Audience:** engineers.
> **Source-of-truth scope:** the subscriptions data model, access, status math, password encryption,
> and the `/subscriptions` page.
> **Last verified:** 2026-09-26 against migrations 0163 to 0168 (and the 0202 `business` rename),
> `src/lib/actions/subscriptions.ts`, `src/lib/services/subscriptions-service.ts`,
> `src/lib/utils/subscription-status.ts`, `src/lib/constants/subscription-constants.ts`,
> `src/components/subscriptions/`, `src/app/(dashboard)/subscriptions/page.tsx`,
> `src/lib/constants/route-permissions.ts` and Elaya's `get_subscriptions`.

## What it is

One page, `/subscriptions`, over five tables and a private storage bucket. A subscription is one
account of a service: a billing type (`monthly`, `yearly`, `top_up`, `other`), a currency (`INR`,
`USD`, `EUR`), an amount, one or more departments, an optional login and password, and an optional
**tool** that groups several accounts of the same service (three Claude accounts under one "Claude").
Payments and top-ups are logged against it with the INR that actually left the account.

**Status:** built by Ethan (PR #2), reviewed and merged 2026-08-21, live on production since then.
The overview filters and per-tool spend followed on 2026-08-22, the calendar was rebuilt on
2026-09-25. There are no reminders, no notifications and nothing running in the background.

## Access

| Layer | Rule |
| --- | --- |
| Route | `/subscriptions` is in `DOMAIN_ROUTE_MAP` for the `finance` and `tech` domains. Admin and founder reach every route; the founder's sidebar lists it (`FOUNDER_NAV_PREFIXES`). |
| RLS (SELECT) | admin/founder, or `get_user_domain()` in `finance` / `tech`, on `subscriptions`, `subscription_tools` and the invoice bucket. `subscription_payments` and `subscription_topups` mirror the parent through `EXISTS`. |
| Actions | Every action runs `requireProfile()` then `canManageSubscriptions()` (the same rule in code) and writes on the admin client. No table has a user write policy. |
| Reveal trail | `subscription_password_reveals` is readable by admin and founder only. |

The `departments` array is for filtering and reporting, not security: everyone in the audience sees
every subscription. **Decided 2026-08-21 (founder):** access stays centralized, admin/founder plus
finance and tech, and they see everything. This is the permanent model, not a placeholder.

Anyone signed in may upload into the invoice bucket under their own `{uid}/` folder (the insert
policy only checks the folder); only the audience above can read from it.

## Data model (migrations 0163 to 0168)

| Object | Migration | Notes |
| --- | --- | --- |
| `subscriptions` | 0163 | `name`, `departments text[]` (CHECK mirrors `APP_DOMAINS`; `b2b` became `business` in 0202), `type`, `currency`, `amount`, `due_day` / `due_date` (a CHECK enforces the shape: monthly and other take `due_day` 1 to 31, yearly takes `due_date`, top_up takes neither), `login`, `password` (encrypted, see below), `notes`, `is_archived` (soft delete), `tool_id`, `created_by`, timestamps. |
| `subscription-invoices` bucket | 0163 | Private. Rows store the path, never a URL; reads mint a one-hour signed URL on the admin client. No update or delete policy (write-once). |
| `subscription_payments` | 0164 | Append-only. `due_date` (the cycle it settles), `paid_at`, `rate` (original currency), `paid_amount_inr` (typed by hand), `invoice_path`, `notes`. |
| `subscription_topups` | 0165 | Append-only. `topped_up_at`, `amount` + `currency` per top-up, `paid_amount_inr`, `invoice_path`, `notes`. |
| password encryption | 0166 | pgcrypto + a Vault key. See below. |
| `subscription_password_reveals` | 0167 | Append-only: who revealed which password, when. |
| `subscription_tools` + `subscriptions.tool_id` | 0168 | One tool, many accounts. `name_key = lower(trim(name))` is unique. Tools are created on the fly from the Tool field on the form (`resolveToolId`, insert-if-missing). `tool_id` is nullable, so a standalone bill needs no tool. |

`database.ts` includes all five tables (regenerated 2026-08-22); rows are narrowed once per query to
the types in `src/lib/types/subscription.ts`.

## Status is computed, never stored

`src/lib/utils/subscription-status.ts`, anchored to the IST calendar through `utils/ist.ts`:

- `currentDueDateISO`: monthly and other use `due_day` in the current IST month; yearly uses the
  stored month and day in the current IST year (clamped, never before the first stored cycle), so a
  yearly bill rolls over each year.
- `computeSubscriptionStatus`: **Upcoming**, **Due today**, **Overdue** (with the day count) or
  **Paid** (a payment exists for the current cycle, matched by year-month for monthly and by year for
  yearly). A top-up has no due status and shows a dash.
- `occurrenceInMonthISO` and `statusForOccurrenceISO`: the same rules projected into any month, used
  by the calendar. A cycle before the subscription was created is never shown as overdue.
- `paymentLateness`: "Paid N days late" or "On time" in the history.

## Currency rule

Amounts are never converted. The original-currency amount and the hand-typed `paid_amount_inr` are
stored and shown side by side. Every spend figure uses the INR column only. The calendar's month
totals are kept per currency.

## Password encryption and the reveal audit

- **At rest (0166):** a `BEFORE INSERT OR UPDATE` trigger (`encrypt_subscriptions_password`) encrypts
  with pgcrypto `pgp_sym_encrypt` and a 256-bit key kept in Supabase Vault
  (`subscription_password_key`), generated when the migration ran. The key never appears in a file.
  On update it re-encrypts only when the value changed. The encrypt and decrypt functions are
  service-role only.
- **Reads:** the password is never part of a list or detail payload (`password: null`, plus a
  `hasPassword` flag). The form's password field is tri-state: blank on edit keeps the stored value,
  blank on create means none, a value sets or replaces it.
- **Reveal:** only `revealSubscriptionPasswordAction` returns the plaintext, when someone clicks the
  eye in the history modal. It writes a `subscription_password_reveals` row first and **fails
  closed**: no audit row, no password. Anyone in the audience may reveal.
- **Who looked:** admin and founder see "Password viewed by" in the history modal (the five most
  recent, then a count of earlier ones), read by `getPasswordReveals()` on the session client so RLS
  hides it from everyone else.

`login` stays plain text (a username).

## The page

`/subscriptions?view=list|calendar|overview` (default `list`). The header has the title, **Export**
and **Add Subscription**. One filter strip serves every view, with the List / Calendar / Overview
switcher (`SubscriptionViewTabs`) at its front.

- **Add Subscription** (`AddSubscriptionButton`) is a two-item menu. **New** opens
  `AddEditSubscriptionModal` (fields change with the type; departments are a multi-select; an
  optional Tool field suggests tools already in use). **Renewal** opens `RenewalPickerModal`, a search
  over active subscriptions; picking one opens `RecordPaymentModal`, or `LogTopupModal` for a top-up.
  Both take the original-currency amount and the INR paid as two separate fields, the dates, an
  optional invoice upload and notes.
- **List** (`SubscriptionsTable` + `SubscriptionFilters`): a dense table on desktop, cards on a
  phone. Columns: Name (the tool shows under it when it differs), Departments, Type, Amount, INR Paid
  (latest), Due, Status. Filters: search (matches the subscription name or its tool's name),
  Department, Type, Status, and the Active / Archived tab, all in the URL. A row opens the history;
  the row menu has View history, Edit, and Archive (with a confirm) or Unarchive. Recording a payment
  lives only in the Renewal flow.
- **Calendar** (`SubscriptionCalendar`): the month grid with a dot on each due day and this week's
  count in its footer; beside it the month in four numbers (overdue, due today, upcoming, paid, each
  with its total per currency) and one card of due dates (a date tile, the bill, its amount, its
  status for that cycle). Recurring bills are projected into whichever month is shown; clicking a day
  narrows the list; clicking a bill opens its history. Top-ups never appear. No filters.
- **Overview** (`SpendingOverview` + `OverviewFilters`): INR tiles (spent this month, this year,
  active count; with a date range, spent in range and payments in range), donuts by billing type and
  by department, a By Tool ranked list (top 8 then "+N more"; bills without a tool rank under their
  own name), and a 12-month spend chart. Filters: department and a date range through the shared
  `FilterBar`. A department filter counts only that department's equal share of a shared bill. A
  date range changes the tiles and breakdowns; the 12-month chart always shows the trailing 12 IST
  months.
- **History** (`SubscriptionHistoryModal`): the summary with the password reveal, the reveal trail
  for admin and founder, and every payment and top-up with lateness and a link to its invoice.
- **Export** (`SubscriptionExportButton`): a monthly report as CSV or Excel with Subscription Name,
  Department, Type, Currency, Original Amount, INR Paid Amount, Due Date, Paid Date. The data comes
  from `getSubscriptionMonthlyReportAction`; the file is built in the browser (`buildCSV`,
  `buildSingleSheetXLSX` in `utils/export.ts`).

Data comes from `subscriptions-service.ts` on the session client, so RLS scopes it. No Redis;
every write calls `revalidatePath('/subscriptions')`.

## Elaya

`get_subscriptions` (2026-09-19) lets Elaya read the tracker. It is defined in the Node registry and
runs on the Python brain through the bridge. The check in `elaya-data.ts` (`maySeeSubscriptions`)
repeats the RLS rule, and the tool never returns a login or a password. Since 2026-09-26 the finance
domain has no Elaya at all (`ELAYA_DOMAINS`), so in practice the tool answers admin, founder and the
tech domain. See [elaya.md](elaya.md).

## File map

```text
supabase/migrations/2026082100016{3..8}_*.sql      tables, bucket, RLS, encryption, reveal audit, tools
src/lib/constants/subscription-constants.ts        types, currencies, statuses, departments, invoice rules, resolveSubscriptionShape
src/lib/types/subscription.ts                      row types
src/lib/utils/subscription-status.ts               status, cycles, calendar projection, lateness (IST)
src/lib/validations/subscription-schema.ts         Zod (password tri-state, form-errors copy)
src/lib/services/subscriptions-service.ts          list (+ getSubscriptionsForElaya), detail, reveal trail, overview, monthly report
src/lib/actions/subscriptions.ts                   create, update, archive, payment, top-up, invoice signing, reveal, renewal list, report
src/components/subscriptions/                      16 components + form-styles.ts
src/app/(dashboard)/subscriptions/{page,loading}.tsx
```

## Not built

- Renewal reminders (due soon, overdue) and any WhatsApp or push notification.
- A "bills due this week" dashboard widget.
- Automatic currency conversion (deliberately never).
