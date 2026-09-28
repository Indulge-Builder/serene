# Error Log: Page Spec

> **Purpose:** spec for `/error-log`, the admin/founder view of lead-ingestion payloads that failed.
> **Audience:** engineers. · **Source-of-truth scope:** this route. The raw-payload pipeline and the retention policy live in `../integrations/lead-ingestion.md`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/error-log/{page,loading}.tsx`, `src/components/error-log/{ErrorLogTable,ErrorLogTableSkeleton}.tsx`, `getErroredPayloads` in `src/lib/services/leads-service.ts`, `src/lib/utils/route-access.ts`, and migrations 0004, 0005, 0088, 0210.

## 1. Purpose

A read-only audit list of `gia.lead_raw_payloads` rows whose `ingestion_error` is set: every
webhook payload that failed auth, validation or insert, with the original payload kept for
diagnosis and replay.

## 2. Who sees it

- **Page gate:** `hasElevatedPageAccess` (admin, founder, or a member of the tech workbench);
  anyone else goes to `/dashboard`, no session to `/login`. The page comment still says "only admin
  and founder".
- **The tech workbench sees an empty page.** `/error-log` is in no domain's route map, so only
  admin, founder and the workbench reach it. But the read uses the session client and the table's
  SELECT policy is admin/founder only, so a tech account always gets zero rows and the "All clear"
  state.
- **Not in the sidebar.** No nav section lists `/error-log`; it is reached by URL. (It is in the
  Sidebar's `MOBILE_TRIGGER_PATHS`, the pages that show the floating mobile drawer trigger.)
- No `PageControls` bell in the header.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `getErroredPayloads()` in `leads-service.ts`: every `lead_raw_payloads` row with `ingestion_error IS NOT NULL`, newest `received_at` first, through `giaDb()` on the session client. It returns `[]` on any error or no data; it never throws |
| Table | `gia.lead_raw_payloads` (moved from `public` by 0210): immutable, admin/founder SELECT. Provenance: the table and its SELECT policy in `20260527000004_lead_raw_payloads.sql`, the `ingestion_error` column in `20260527000005_lead_raw_payloads_error.sql`, the InitPlan hoist in 0088, the schema move in `20260917000210_gia_schema.sql` |

## 4. Components

The page (`src/app/(dashboard)/error-log/page.tsx`, metadata title "Error log") awaits
`getErroredPayloads()` and renders:

- **Header:** an `AlertTriangle` icon tile, the `type-page-title` h1 with the page-title dot, and a
  subtitle ("Every webhook payload that failed ingestion is recorded here…").
- **Stat strip:** four local `StatCard`s (defined in `page.tsx`, not the shared `ui/StatTile`):
  Total errors, Unauthorised (`ingestion_error === 'unauthorized'`), DB failures
  (`startsWith('db_insert_failed')`), Validation (`validation_failed`), counted from the rows.
- **`ErrorLogTable`** (client): a filter bar (a `SearchBar` over id, source, error and lead id; a
  Source `FormSelect` built from the data; a live count) above a five-column table: Received,
  Source, Error, Lead linked, Payload. Each error is shown as a pill (Unauthorized, Server
  misconfiguration, Validation failed, DB insert failed, Backfill failed), with the raw string for
  the insert and backfill failures, the lead id cut to 8 characters (or a dash when unlinked), and
  an expandable JSON viewer ("View payload").

## 5. States

- **Loading:** `error-log/loading.tsx` (added 2026-09-16) draws the icon header, a stat strip and
  `ErrorLogTableSkeleton` while the page's awaited read runs. It shows three stat placeholders
  against the page's four cards. The page also wraps the table in a Suspense with the same
  skeleton, but that boundary never suspends (the data is already resolved).
- **Empty:** two `<EmptyState variant="hero">` branches inside the table, both with the Serene mark
  (no icon): with no errors at all, the all-clear state ("All clear", "Every payload received so
  far has been ingested successfully."); with errors hidden by the filters, "No errors match your
  filters." / "Try clearing the search or changing the source filter.".
- **Error:** there is no error state. A failed read returns `[]` and shows the all-clear state.

## 6. Invariants

`lead_raw_payloads` rows are append-only and never deleted: admin/founder SELECT only, no UPDATE
or DELETE policy (Rule 08), so the log is a durable audit record. Payloads can hold personal data,
so the rows must stay limited to the two audit roles.

## 7. Open items

- No replay or re-ingest action; failed payloads are fixed by hand.
- A read failure looks the same as "All clear". Add a real error branch if the service ever
  surfaces failures.
- The page gate admits the tech workbench, which then sees an empty log (RLS). Either keep the page
  admin/founder only (a literal check, as `/books` does) or accept the empty view.
- The loading skeleton has three stat placeholders; the page has four cards.

## 8. Out of scope

The "Engine health check" runbook (`scripts/engine-health-check.sql`,
`../operations/engine-health-check.md`) is an ops query with no app code, schema or `/error-log`
change.
