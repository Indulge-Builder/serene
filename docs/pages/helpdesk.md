# Helpdesk — Page Spec

> **Purpose:** spec for `/helpdesk` — Call Intelligence "Surface B", the searchable delivery-history library agents consult mid-call.
> **Audience:** engineers. · **Source-of-truth scope:** this route only. The full feature (taxonomy, schema, retrieval, the dossier "Surface A") lives in `../modules/call-intelligence.md` — this is a thin route spec that points there for depth.
> **Last verified:** 2026-07-02 (full-tree audit) against `src/app/(dashboard)/helpdesk/page.tsx`.

## 1. Purpose

The team-wide searchable reference of past service deliveries (`service_cases`) and
conversation hooks (`conversation_hooks`) for one Gia domain. An agent searches by
keyword, city, or service and opens a case to see everything saved on it — proof points
to use live on a call. It is the full-library counterpart to the dossier interest card
("Surface A"); the feature contract is `../modules/call-intelligence.md` §6–§9.

## 2. Who sees it

All authenticated roles — `/helpdesk` is in `ALWAYS_ALLOWED_PREFIXES`
(`src/lib/constants/route-permissions.ts`), so no domain-route gate applies; unauthenticated
→ `/login`.

The **write path** (the `+ Suggestion` CTA and the in-modal Edit button) is admin/founder
only: the page computes `canEdit = role === 'admin' || 'founder'` once and threads it down.
`canEdit` is cosmetic — the gate is the server (`requireProfile(['admin','founder'])` in
`upsertServiceCaseAction` + the `service_cases` UPDATE RLS, migration 0110).

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `getHelpdeskLibrary(domain)` in `intelligence-service.ts` — the FULL `{ cases, hooks }` library for the domain, Redis cache-aside (`REDIS_KEYS.helpdeskCases(domain)`, 1-hour TTL) → Supabase fallthrough; partial reads never cached; Redis failure degrades to a live read |
| Domain scope | `resolveDomainParam(searchParams, cookieStore, role)` — admin/founder pick the shelf via the global `DomainSelector` (`?domain=` → `serene-domain` cookie); others read their own Gia shelf, falling back to `DEFAULT_GIA_DOMAIN` |
| Tables | `service_cases` + `conversation_hooks` (migration 0110; all-authenticated SELECT, admin/founder-only writes) |

The RSC fetches the full domain-scoped library **once** per page mount and hands it to
`<HelpdeskSearch>` as `initialData`. **All filtering is client-side** — synchronous JS on
that array, zero server round-trips per keystroke. Never add a per-keystroke server search.

## 4. Components

- `HelpdeskSearch` (`components/intelligence/HelpdeskSearch.tsx`) — `'use client'`; owns query +
  category state and the entire filter pipeline (`caseMatchesQuery` from `lib/utils/case-search.ts`).
  Composes `<FilterBar>` (search + single-select `CategoryPill` row).
- `CaseListRow` → `CaseDetailModal` (the row → full-detail modal; modal loads on intent).
- `CategoryPill` (filter button), `HookList` (category talking points, shown when a category is active).
- `AddSuggestionButton` (`components/intelligence/AddSuggestionButton.tsx`) — the admin/founder
  `+ Suggestion` header CTA; loads `AddSuggestionModal` (the one create-OR-edit form) on intent.
- Standard list-page header (title + dot, CTA top-right) per the page-layout contract.

## 5. States

- **Loading:** none server-side beyond the RSC fetch — the page streams the seeded library; the
  library arrives whole, no Suspense skeleton for the list.
- **Empty / no match:** inline serif-italic `<EmptyState>` ("Nothing matches. Try a different keyword.").
- **Error:** a failed library read degrades to an empty `{ cases, hooks }` (the service logs and
  returns empty arrays); the page never throws.

## 6. Invariants

- Filtering is **always client-side** on the full seeded library — never a per-keystroke server
  query (spec §6/§9). At >500 cases, swap the `includes()` filter for fuse.js, never a server query.
- `canEdit` is a cosmetic hide only; the write path is server-gated in two layers and must never
  be weakened because the button is hidden.
- The library is **domain-scoped** — admin/founder narrowing rides the global selector so the page,
  the Add button, and the Suggestion modal all target the SAME shelf.

## 7. Open items

Full module roadmap (embeddings/HNSW retrieval Phase 2, customer-facing surfaces) lives in
`../modules/call-intelligence.md`. This route is feature-complete for Phase 1.
