# Error Log — Page Spec

> **Purpose:** spec for `/error-log` — the admin/founder view of failed lead-ingestion payloads.
> **Audience:** engineers. · **Source-of-truth scope:** this route. The raw-payload pipeline and retention policy live in `../integrations/lead-ingestion.md`.
> **Last verified:** 2026-07-02 (full-tree audit) against `src/app/(dashboard)/error-log/page.tsx` + `src/components/error-log/ErrorLogTable.tsx`.

## 1. Purpose

A read-only audit surface over `lead_raw_payloads` rows whose `ingestion_error` is set —
every webhook payload that failed auth, validation, or insert, with the original payload
preserved for debugging/replay.

## 2. Who sees it

Admin and founder only — the page redirects all other roles to `/dashboard` (mirroring the
table's RLS); unauthenticated → `/login`. The route is not in the Sidebar's main nav.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `getErroredPayloads()` in `leads-service.ts` — selects every `lead_raw_payloads` row where `ingestion_error IS NOT NULL`, ordered `received_at DESC`. **Returns `[]` on any error** (it short-circuits to `return []` when the query errors or returns no data) — it swallows failures, never throws. |
| Table | `lead_raw_payloads` (immutable, admin/founder SELECT — `../architecture/database.md`). RLS provenance: table + base SELECT policy + append-only-at-policy-level in `20260527000004_lead_raw_payloads.sql`; the `ingestion_error` column in `20260527000005_lead_raw_payloads_error.sql` (changelog "Migration 0005"); the policy InitPlan-hoist in `20260608000088_rls_initplan_hoist.sql`. |

## 4. Components

The page (`src/app/(dashboard)/error-log/page.tsx`) is a server component that `await`s
`getErroredPayloads()` **before** rendering, then composes:

- **Header** — `AlertTriangle` icon tile + `type-page-title` h1 (with `page-title-dot`) + a
  subtitle paragraph: *"Every webhook payload that failed ingestion is recorded here. Use the
  raw payload viewer to diagnose the problem."*
- **Stats strip** — four inline `StatCard`s (a display-only component defined locally in
  `page.tsx`, **not** the shared `ui/StatTile`): Total errors (danger) · Unauthorised (warning,
  `ingestion_error === 'unauthorized'`) · DB failures (danger, `startsWith('db_insert_failed')`)
  · Validation (neutral, `validation_failed`). Counts derived from the resolved `rows`.
- **`ErrorLogTable`** (`src/components/error-log/ErrorLogTable.tsx`, `'use client'`) — receives
  the already-resolved `rows` array as a prop. Owns a **client-side filter bar** (a text
  `SearchBar` matching id/source/error/lead_id, a Source `<select>` whose options derive from
  the data, and a live filtered count) above a **5-column table**: Received · Source · Error ·
  Lead linked · Payload. Each `ErrorRow` categorises `ingestion_error` into a pill
  (Unauthorized / Server misconfiguration / Validation failed / DB insert failed / Backfill
  failed) with a danger/warning variant, prints the raw error string for
  `db_insert_failed`/`backfill_failed`, truncates `lead_id` to 8 chars (`—` when unlinked), and
  exposes an expandable inline JSON viewer (`PayloadCell` — "View payload" toggle → `<pre>`).

`ErrorLogTableSkeleton` (`src/components/error-log/`) exists but is **effectively dead in this
flow** — see States/Loading below.

## 5. States

- **Loading:** there is no real loading state. Although the page wraps the table in
  `<Suspense fallback={<ErrorLogTableSkeleton />}>`, the data is `await`ed at the top of the
  server component and the child receives a plain (non-async) `rows` array, so the boundary
  never suspends and the skeleton never renders. The skeleton is kept for future use but is
  not on the live path.
- **Empty:** two distinct branches inside `ErrorLogTable` (both serif-italic per V-09). When
  there are **no errors at all** (`rows.length === 0`): a green `CheckCircle2` + *"All clear —
  no ingestion errors."* + *"Every payload received so far has been ingested successfully."*
  When errors exist but the search/source filter excludes all of them: an `AlertTriangle` +
  *"No errors match your filters."* + *"Try clearing the search or changing the source filter."*
- **Error:** **no inline error UI exists.** `getErroredPayloads()` returns `[]` on failure, so a
  service error is indistinguishable from the "All clear" empty state (zero rows). The page
  never throws and never redirects on a data error.

## 6. Invariants

Rows are append-only and never deleted — `lead_raw_payloads` carries SELECT-only RLS for
admin/founder and no UPDATE/DELETE policy (Rule 08), so the error log is a durable audit record.
Full payloads may contain PII — this page is therefore role-gated to the two audit roles and
must never widen.

## 7. Open items

No replay/re-ingest action exists yet — failed payloads are fixed manually. There is also no
distinct error/failure state in the UI (a service read failure renders as "All clear"); add a
genuine error branch if `getErroredPayloads()` is ever changed to surface failures.

## 8. Out of scope

The 2026-06-17 "Engine health check (ops)" work (`scripts/engine-health-check.sql` +
`docs/operations/engine-health-check.md`) is unrelated to this route — it is an ops query +
runbook + one-time data cleanup, with no app-code, schema, or `/error-log` change. This spec
deliberately does not cover it.
