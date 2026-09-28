# Helpdesk — Page Spec

> **Purpose:** spec for `/helpdesk`, Call Intelligence "Surface B": the searchable library of past deliveries and talking points agents consult mid-call.
> **Audience:** engineers.
> **Source-of-truth scope:** this route only. The feature (taxonomy, tables, reads, the dossier's "Surface A", the Elaya tool, content rules) lives in `../modules/call-intelligence.md`; this is a thin route spec that points there for depth.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/helpdesk/{page,loading}.tsx`, `src/components/intelligence/HelpdeskSearch.tsx`, `src/lib/services/intelligence-service.ts`, `src/lib/actions/intelligence.ts` and `src/lib/constants/route-permissions.ts`.

## 1. Purpose

The team-wide searchable reference of past service deliveries (`gia.service_cases`) and
conversation hooks (`gia.conversation_hooks`) for one Gia domain. An agent searches by keyword,
city or service and opens a case to see everything saved on it: proof to use live on a call. It
is the full-library counterpart of the dossier interest card; the feature contract is
`../modules/call-intelligence.md` §5 and §6.

## 2. Who sees it

Every signed-in person can reach it: `/helpdesk` is in `ALWAYS_ALLOWED_PREFIXES`
(`src/lib/constants/route-permissions.ts`), so no domain route gate applies; signed out →
`/login`. It is **hidden from the concierge sidebar** (`DOMAIN_NAV_HIDDEN.concierge`, 2026-09-18:
a sales library is noise on the concierge floor) but still reachable there by URL. Founders do not
see it in their curated sidebar either.

The **write path** (the "+ Suggestion" button and the Edit button inside a case) is admin/founder
only: the page computes `canEdit = role === 'admin' || 'founder'` once and threads it down.
`canEdit` is cosmetic; the gate is the server (`requireProfile(['admin','founder'])` in
`upsertServiceCaseAction`, plus the `service_cases` write RLS from migration 0110).

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `getHelpdeskLibrary(domain)` in `intelligence-service.ts`: the whole `{ cases, hooks }` library for one domain. Redis cache-aside (`helpdesk:cases:{domain}`, 1 hour) → the `gia` tables; only a complete read is cached; a Redis failure falls through to a live read. The page uses the session client |
| Domain | `resolveDomainParam(searchParams, cookieStore, role)`: admin/founder pick the shelf with the global domain selector (`?domain=` → the `serene-domain` cookie); everyone else reads their own Gia domain, or `DEFAULT_GIA_DOMAIN` (onboarding) when they are not in one |
| Tables | `gia.service_cases` + `gia.conversation_hooks` (0110, moved to `gia` by 0210): all authenticated read, admin/founder write |
| Write | `upsertServiceCaseAction` (create or update; awaits the Redis delete, then `revalidatePath('/helpdesk')`) |

The page fetches the library **once** per load and hands it to `<HelpdeskSearch>`. **All
filtering is in the browser**: synchronous `caseMatchesQuery` over that array, zero server round
trips per keystroke. `?category=` preselects a category (the dossier card's footer link uses it).

## 4. Components

- `HelpdeskSearch` (`components/intelligence/HelpdeskSearch.tsx`, `'use client'`): owns the query
  and category state and the whole filter pipeline. Composes the shared `<FilterBar>` (search + a
  single-select `CategoryPill` row) in the paper strip.
- `CaseListRow` → `CaseDetailModal` (a row opens the full case; the modal loads on intent).
- `HookList`: the category's talking points, shown when a category is active.
- `AddSuggestionButton` ("+ Suggestion", admin/founder) → `AddSuggestionModal`, THE one create-or-edit
  form (also opened by Edit in `CaseDetailModal`).
- The standard list-page header (title with the page-title dot, the CTA and the bell at top right).

Component contracts: `src/components/intelligence/CLAUDE.md`.

## 5. States

- **Loading:** `helpdesk/loading.tsx` while the page reads the library; after that the library
  is in memory, so searching never shows a spinner.
- **Empty:** one `<EmptyState framed>` with the Helpdesk (`BookOpen`) icon: "The library is still
  being written." when the domain has no cases at all (it names Elaya, who uses these cases), or
  "Nothing matches." when a search or category finds nothing.
- **Error:** a failed read degrades to empty arrays (logged); the page never throws.

## 6. Invariants

- Filtering is **always client-side** on the loaded library, never a per-keystroke server query.
  Past roughly 500 cases, move to a fuzzy client filter before any server search.
- `canEdit` hides buttons only; the write path is server-gated twice and must never be weakened
  because the button is hidden.
- The library is **domain-scoped**. Admin/founder narrowing rides the global selector, so the
  page, the "+ Suggestion" button and the form all target the SAME shelf.

## 7. Open items

- Only the onboarding library was seeded (150 cases, 2026-06-12); house, shop and legacy depend on
  the team adding cases. TODO: verify current counts per domain.
- No delete in the UI and no UI for hooks. Roadmap (semantic search): `../modules/call-intelligence.md` §9.
