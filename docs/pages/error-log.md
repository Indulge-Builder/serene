# Error Log — Page Spec

> **Purpose:** spec for `/error-log` — the admin/founder view of failed lead-ingestion payloads.
> **Audience:** engineers. · **Source-of-truth scope:** this route. The raw-payload pipeline and retention policy live in `../integrations/lead-ingestion.md`.
> **Last verified:** 2026-06-11 against `src/app/(dashboard)/error-log/page.tsx`.

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
| Service | `getErroredPayloads()` in `leads-service.ts` |
| Table | `lead_raw_payloads` (immutable, admin/founder SELECT — `../architecture/database.md`) |

## 4. Components

`ErrorLogTable` + `ErrorLogTableSkeleton` (`src/components/error-log/`), `AlertTriangle`
header icon; page-level `<Suspense>`.

## 5. States

- **Loading:** `ErrorLogTableSkeleton` behind Suspense.
- **Empty:** empty-state copy in `ErrorLogTable` (serif-italic per V-09).
- **Error:** service errors render an inline message; the page never throws.

## 6. Invariants

Rows are append-only and never deleted (the error log is an audit record); full payloads may
contain PII — this page is therefore role-gated to the two audit roles and must never widen.

## 7. Open items

No replay/re-ingest action exists yet — failed payloads are fixed manually.
