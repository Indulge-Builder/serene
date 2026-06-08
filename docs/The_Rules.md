# The Rules

## Eia — Non-Negotiable Codebase Laws

> These rules cannot be broken under any circumstances.
> Not for speed. Not for deadlines. Not because it seems harmless.
> If a rule needs to change, it gets a Decision Log entry first.
> A rule changed without a log entry is not a rule change — it is a violation.

---

## Section 1 — Architecture

| # | Rule |
| --- | --- |
| A-01 | Authorization reads **only** from `public.profiles`. JWT claims are never trusted for permission decisions. |
| A-02 | Server Actions are the **only** path from components to DB mutations. No direct Supabase writes from client components. |
| A-03 | All DB queries go through service functions in `lib/services/`. No raw Supabase calls in components or actions. |
| A-04 | `components/ui/` imports types only — never functions, actions, hooks, or services from feature code. |
| A-05 | Feature folders own their code. `features/finance/` never imports from `features/concierge/`. Cross-feature data flows through `lib/` only. |
| A-06 | UI components are display-only. Zero business logic. Zero DB calls. Zero decisions. |
| A-07 | One table, one responsibility. No mixing domains in one table. |
| A-08 | Every new table has `ALTER TABLE x ENABLE ROW LEVEL SECURITY` in its migration. No exceptions. |
| A-09 | Two-layer security always. RLS enforces at DB level. Server action enforces at code level. Never rely on one layer alone. |
| A-10 | All `SECURITY DEFINER` functions must have `SET search_path = public`. |
| A-11 | Log and activity tables are **append-only**. No `UPDATE` or `DELETE`. Ever. |
| A-12 | All async work exceeding 3 seconds or requiring retry logic runs in Trigger.dev. Never in route handlers. |
| A-13 | Every dashboard route is protected at three layers: `src/proxy.ts` (Next.js 16 proxy — session refresh, replaces `middleware.ts`), the `(dashboard)/layout.tsx` server guard, and `canAccessRoute()` domain gating via `DOMAIN_ROUTE_MAP`. No authenticated page renders without a verified session. There is **no** `src/middleware.ts` — never recreate it. |
| A-16 | **Outward network sends that must complete (WhatsApp/Gupshup, any external `fetch`) use `after()` from `next/server` with an `await`-ed send inside — never `void fetch().catch()`.** On Vercel the lambda is frozen the instant the response/action-return is flushed, orphaning any in-flight `void` promise (silent, intermittent data loss — no error, no log row). Routes carrying network sends in `after()` export `maxDuration`. Reference: `notifyLeadAssigned`, `src/app/api/webhooks/leads/route.ts`. |
| A-14 | Never edit a migration that has already run in production. Write a new one. |
| A-15 | `'use client'` components must never import value symbols from `lib/services/`. Service modules import the server Supabase client (`next/headers`), which hard-errors in the client bundle. Client components that need lazy or paginated data must call a Server Action in `lib/actions/` instead. `import type` from services is safe — type imports are erased at compile time. |

---

## Section 2 — Security

| # | Rule |
| --- | --- |
| S-01 | Every Server Action validates input with a Zod schema **before** touching the DB. First line. No exceptions. |
| S-02 | All user-supplied text passes through `sanitizeText()` before any DB write. Lives in `lib/utils/sanitize.ts`. |
| S-03 | All phone numbers stored as E.164. `normalizeToE164()` called on every phone field before any DB write. Lives in `lib/utils/phone.ts`. |
| S-04 | Never spread a raw request body or client-supplied object into a DB insert. Always whitelist fields via Zod schema. |
| S-05 | Never expose raw Postgres errors, stack traces, or Zod validation details to the UI. Log server-side with a `[module-action]`-prefixed `console.warn`/`console.error`; return a safe, human-readable message to the user. (Sentry is not yet wired — when it lands, server logging routes there. Do not assume a Sentry client exists today.) |
| S-06 | Never trust client-supplied IDs without verifying ownership. Always confirm the requesting user has access to the record. |
| S-07 | Sequential integer IDs are never exposed in URLs. UUIDs only. |
| S-08 | Sensitive data never appears in URL query parameters. |
| S-09 | Auth error messages never reveal whether an email address exists in the system. |
| S-10 | Session tokens, auth codes, and secrets are never written to any log. |
| S-11 | `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and any variable ending in `_KEY`, `_SECRET`, or `_TOKEN` are server-only. Never in client code. Prefix with `NEXT_PUBLIC_` only if the value is genuinely public. |
| S-12 | Every webhook endpoint validates its auth credential before processing the payload — reject before reading the body. Current credentials: `/api/webhooks/leads` = Bearer token; `/api/webhooks/whatsapp` = `x-gupshup-secret` header. (The whatsapp route still returns 200 on auth-pass-but-bad-payload so Meta/Gupshup do not retry — see whatsapp invariants.) |
| S-13 | No `dangerouslySetInnerHTML` anywhere. |
| S-14 | Users cannot update their own `role` or `domain`. These fields are server-controlled only. |
| S-15 | No single role can both perform a sensitive action and audit that same action. `admin` and `founder` have distinct, non-overlapping privileges. |
| S-16 | Sensitive privileged operations — role changes, domain changes, profile deactivation — require a second actor to confirm. No one approves their own privilege changes. |
| S-17 | All public-facing routes and webhook endpoints are rate-limited. |

---

## Section 3 — Data & Privacy

| # | Rule |
| --- | --- |
| D-01 | No raw PII ever reaches Claude, Gemini, or any external AI model. Data is pseudonymized before leaving the vault. Pseudonymization is reversible only by a vault function — never client-side. |
| D-02 | No hard deletes on leads, profiles, notes, or activity logs. Soft-delete with `archived_at` or `deleted_at` timestamps. |
| D-03 | Every lead status change, assignment, reassignment, note addition, domain/role change, and failed authentication attempt is logged to the relevant `*_activities` table. |
| D-04 | Full PII never appears in log messages or Sentry error context. Use record IDs in logs, never names or phone numbers. |
| D-05 | AI prompt contents containing client data are never logged. |
| D-06 | No session tokens or auth codes written to any log or error tracker. |

---

## Section 4 — Performance

| # | Rule |
| --- | --- |
| P-01 | Data fetching is Server-Components-first. Client widgets that need lazy/paginated/refreshable data fetch via a Server Action inside `useEffect` (the Q-15 pattern) — never a bare `useEffect` fetch against Supabase, and never React Query (not a dependency; do not add it). |
| P-02 | No API routes except `/api/webhooks/` (leads, whatsapp) and the auth callback. All data mutations go through Server Actions. |
| P-03 | Any list that can exceed ~100 rows is bounded server-side — `.range()` pagination (leads = 50/page) or a cursor RPC (`get_personal_tasks`). Never `SELECT *` the full table into the DOM. (`Table.tsx` dev-warns above 100 unvirtualised rows; a virtualization library is a future option, not a current dependency.) |
| P-04 | Images in scroll containers use `loading="lazy"`. |
| P-05 | No scroll event listeners for UI logic. Use `IntersectionObserver`. |
| P-06 | Supabase Realtime subscriptions always include a filter and a mount-scoped `useId()` nonce in the channel name (Q-14). Never subscribe to a full table. Always clean up on unmount. |
| P-07 | No stray debug `console.log` left in shipped code. Permitted: deliberate `[module-action]`-prefixed `console.warn`/`console.error` for non-fatal server-side failures (Redis del, notification sends, ingestion errors) — this is the codified logging pattern until Sentry is wired. Never log PII (D-04). |
| P-08 | Every `redis.del` in a Server Action is `await`-ed inside a `try/catch` that logs a `[module-action]` warning, **before** `revalidatePath`/`revalidateTag`. A `void redis.del().catch()` races the cache revalidation and can evict a fresh entry. Lead rows are dual-keyed (`leadRowSlug` + `leadRowId`) — delete both when `slug` is non-null. Reference: `updateLeadStatus`, `addLeadCallNote`. |

---

## Section 5 — Design

| # | Rule |
| --- | --- |
| V-01 | Every colour is a CSS variable from `src/styles/design-tokens.css`. No hardcoded hex values in components. `text-gray-500` is a violation. `bg-white` is a violation. |
| V-02 | `--theme-accent-fg` on buttons and accent fills — never `--theme-text-inverse`. They are different tokens for different surfaces. |
| V-03 | No animation over 500ms except `liaBreathe` (3s, ambient). |
| V-04 | No `font-bold`. `--weight-semibold` (600) is the maximum weight in Eia. |
| V-05 | No `z-index` values outside the `--z-*` token scale defined in `design-tokens.css`. |
| V-06 | No `backdrop-filter` / blur except on three sanctioned surfaces: TopBar (sticky), mobile sidebar overlay, command palette overlay (palette is a forward contract — not yet built). Never on cards, dropdowns, or modals. |
| V-07 | No mixing radius values within a single component. One radius per component. |
| V-08 | No skeleton shown for less than 150ms. Fast skeletons that flash look more broken than no skeleton. |
| V-09 | Empty states always use Playfair italic heading. Never "No data available." |
| V-10 | Micro labels are always: `text-[10px] font-medium uppercase tracking-[0.12em] text-[--theme-text-tertiary]`. Never deviate. |
| V-11 | Never use a coloured border on one edge of a card, row, or column (`borderLeft`/`borderTop`/`borderRight`/`borderBottom` accent strips) as a category/status indicator. Use pills, dots, icons, or semantic badges instead. |
| V-12 | Never pass a CSS variable directly to a Recharts `fill`/`stroke` prop — SVG attributes do not resolve `var(--…)` reliably. Use `getChartTokens()` / `useChartTokens()` (`src/lib/utils/chart-tokens.ts`), which resolves vars to computed hex via `getComputedStyle` and re-resolves on `data-theme` change. Exception: `BAR_COLORS` in `ManagerLeadStatusWidget` (Decision Log 2026-06-04). |

---

## Section 6 — Code Quality

| # | Rule |
| --- | --- |
| Q-01 | No `any` type anywhere. TypeScript strict mode is non-negotiable. |
| Q-02 | No magic strings. Domain names, role names, and status values live in `lib/constants/` as typed enums. |
| Q-03 | Server Actions return `{ data, error }`. Never throw. Never return void. Components handle both branches explicitly. |
| Q-04 | Error messages shown to users come from `lib/validations/form-errors.ts`. Never raw Zod messages. Never "Invalid input." |
| Q-05 | No npm package added without justification documented in `docs/changelog.md`. |
| Q-06a | Every meaningful change — feature, fix, migration, new package, refactor — must have an entry in `docs/changelog.md` before or alongside the code that implements it. `The_Changelog.md` has been deleted; `docs/changelog.md` is the single source of truth. |
| Q-06 | No production deployment without the security checklist passing. |
| Q-07 | **Drag-to-reorder always uses `@dnd-kit`.** It is the established library. Do not reach for `react-beautiful-dnd`, `dnd-kit` forks, or hand-rolled pointer listeners. This applies to task lists, priority ordering, dashboard widget arrangement, and any future sortable surface. |
| Q-08 | **Column preference hooks follow the `useLeadColumnPreferences` pattern exactly.** If any other table gets a column picker (tasks, clients, finance), replicate the same hook signature and localStorage key convention: `eia:[module]:columns:${userId}:v1`. Do not invent a different shape or key format. Consistency is what makes the behaviour predictable and the codebase searchable. |
| Q-09 | **PostgreSQL `COUNT(*)` returns `bigint`. Always cast to `Number()` in the service layer before returning typed values.** If a number from an RPC ever reaches a component without being cast, and the cast in the service is later removed, `BigInt` serialisation silently breaks JSON (`TypeError: Do not know how to serialize a BigInt`). In the service, always do `Number(row.some_count)`. In components, format counts through `formatCompact()` or `formatCount()` from `lib/utils/numbers.ts` — never `.toString()` on a raw RPC field. |
| Q-10 | **`decodeURIComponent` in route handlers must be wrapped in `try/catch → notFound()`.** A malformed percent-sequence (e.g. `/campaigns/%GG`) throws a `URIError` at the server boundary, producing a 500 instead of a 404. Every `[id]` segment that will be decoded must be guarded: `try { name = decodeURIComponent(id) } catch { notFound() }`. |
| Q-11 | **Every `switch` over a union type must be exhaustive. No `default` branch.** Use `assertNever(x)` from `src/lib/utils/assert-never.ts` as the final return. TypeScript will error at build time if any case is unhandled. A `default` branch absorbs missing cases silently — it is a violation. Applies to: `NotificationType`, `LeadStatus`, `CallOutcome`, `TaskType`, `ToastType`, and any future union enum. |
| Q-12 | **Before creating any component, hook, util, or service function, search the codebase for an existing equivalent first. Search by behaviour, not by name — "date picker" not just "DatePicker", "format duration" not just "formatDuration".** If an equivalent exists: extend it or compose it. If a near-equivalent exists: refactor it to cover both cases. Creating a duplicate is a violation regardless of whether the names differ. Applies to: components, hooks, utils, service functions, constants, Zod schemas. |
| Q-13 | **SECURITY DEFINER functions must never accept a caller-supplied scope parameter (domain, user_id, role).** The function runs as postgres, bypassing RLS. Domain scoping must be replicated inside the function body using `get_user_role()` and `get_user_domain()` — never trusted from the caller. Reference: `get_group_task_summaries` (migration 0020 rewrite). |
| Q-14 | **Supabase Realtime channel names must include a mount-scoped nonce (`useId()`).** Pattern: `` `table-${id}-${mountId}` ``. React 18 Strict Mode double-mounts effects — without the nonce, the second mount reuses the already-subscribed channel object and throws "cannot add callbacks after subscribe()". `useId()` produces a stable mount-scoped string that is unique per mount even in Strict Mode. |
| Q-15 | **Initial data fetch in a widget or client component must live in `useEffect`, never as a render-phase guard.** `startTransition` is a side effect and cannot be called during the render phase. Pattern: `useEffect(() => { let cancelled = false; startTransition(async () => { const r = await action(); if (!cancelled && r.data) setState(r.data); }); return () => { cancelled = true; }; }, []);` The `cancelled` flag guards against `setState` on an unmounted component. |
| Q-16 | **`unstable_cache` keys must include every dimension that scopes the query.** For domain-scoped queries: always include `domain`. For user-scoped queries: always include `userId`. Omitting any dimension allows cross-user or cross-domain cache hits. Reference: `getGroupTasks` in `tasks-service.ts` (key includes `domain`). |
| Q-17 | **Two domain registries — never mix them.** `APP_DOMAINS` + `DOMAIN_LABELS` in `lib/constants/domains.ts` is the full platform enum (user management, profiles, authorization). `GIA_DOMAINS` is the Gia module subset (leads, campaigns, dashboard Gia widgets, performance domain pickers). Canonical Gia display names: **Onboarding**, **Indulge House**, **Indulge Shop**, **Indulge Legacy** — all via `DOMAIN_LABELS` only. Never hardcode domain tab labels, never add local `DOMAIN_SHORT` / `FEATURED_DOMAINS` maps. To add a Gia domain later, append to `GIA_DOMAINS` and `DOMAIN_LABELS` in one file. |

---

## Section 7 — File & Naming Conventions

```text
Components:   PascalCase.tsx        → TaskCard.tsx, LeadDetail.tsx
Actions:      kebab-case.ts         → personal-tasks.ts, leads.ts
Services:     kebab-case.ts         → leads-service.ts, tasks-service.ts
Hooks:        camelCase.ts (use*)   → useGroupTasks.ts, useLeadStatus.ts
Utils:        kebab-case.ts         → sanitize.ts, dates.ts, phone.ts
Validations:  kebab-case.ts         → lead-schema.ts, task-schema.ts
Constants:    kebab-case.ts         → domains.ts, roles.ts, statuses.ts
Pages:        page.tsx              → Next.js convention, always
Layouts:      layout.tsx            → Next.js convention, always
```

---

## Section 8 — The Absolute Never-Do List

These patterns do not exist in this codebase. Not under pressure, not temporarily, not "just for now."

```text
NEVER  hardcode a colour value in a component
NEVER  use text-gray-* or bg-gray-* or bg-white — use tokens
NEVER  write useEffect for data fetching
NEVER  call Supabase directly from a client component for mutations
NEVER  use JWT claims for authorization decisions
NEVER  skip RLS on a new table
NEVER  mix module concerns in one table
NEVER  import one feature module into another
NEVER  put business logic in a UI component
NEVER  use dangerouslySetInnerHTML
NEVER  expose sequential integer IDs in URLs
NEVER  spread raw client input into a DB insert
NEVER  let a Zod default error message reach the user
NEVER  clear a form field on validation error
NEVER  do background work in an API route handler
NEVER  send raw PII to any external AI model
NEVER  log names, phone numbers, or PII — use IDs
NEVER  write console.log in production code
NEVER  edit a migration that has already run in production
NEVER  use z-index values outside the --z-* scale
NEVER  animate layout properties (width, height, padding, margin)
NEVER  use backdrop-blur outside the three sanctioned surfaces
NEVER  use a coloured border on one edge of a card, row, or column as a category/status indicator (borderLeft/borderTop/borderRight/borderBottom accent strips) — use pills, dots, icons, or semantic badges instead
NEVER  use font-bold (700) — semibold (600) is the ceiling
NEVER  show a skeleton for less than 150ms
NEVER  add a package without a changelog entry in docs/changelog.md
NEVER  merge a meaningful change without a docs/changelog.md entry
NEVER  use anything other than @dnd-kit for drag-to-reorder (Q-07)
NEVER  invent a different localStorage key format for column preferences — always eia:[module]:columns:${userId}:v1 (Q-08)
NEVER  use a raw RPC bigint field directly in a component — cast to Number() in the service, format with formatCompact()/formatCount() in the component (Q-09)
NEVER  call decodeURIComponent in a route handler without a try/catch → notFound() guard (Q-10)
NEVER  use a default branch in a switch over a union type — use assertNever() from lib/utils/assert-never.ts (Q-11)
NEVER  create a component, hook, util, or service without first searching the codebase for an existing equivalent — search by behaviour, not filename (Q-12)
NEVER  accept a caller-supplied domain/role/userId parameter in a SECURITY DEFINER function — replicate the access check inside the function body (Q-13)
NEVER  use a bare table name as a Realtime channel name — always append a mount-scoped useId() nonce (Q-14)
NEVER  call startTransition during the render phase — always inside useEffect (Q-15)
NEVER  omit the domain from an unstable_cache key when the underlying query is domain-scoped (Q-16)
NEVER  hardcode Gia domain names or duplicate domain lists outside lib/constants/domains.ts — use GIA_DOMAINS + DOMAIN_LABELS (Q-17)
NEVER  use APP_DOMAINS in Gia UI pickers (leads, campaigns, performance, dashboard widgets) — use GIA_DOMAINS (Q-17)
NEVER  import a value symbol from lib/services/ inside a 'use client' component — it pulls next/headers into the client bundle and hard-errors; call a Server Action instead (A-15)
NEVER  pass --theme-accent or any CSS variable directly to a Recharts fill/stroke prop — use useChartTokens() via getComputedStyle
NEVER  use text-gray-* or bg-gray-* or bg-white in Tailwind — use CSS variable tokens
NEVER  place backdrop-filter/blur on anything other than TopBar, mobile sidebar overlay, or command palette
NEVER  fire an outward network send (WhatsApp/Gupshup, external fetch) as void fn().catch() in a route or action — use after() from next/server with an awaited send inside (A-16)
NEVER  void redis.del().catch() before revalidatePath — await it in try/catch first; delete both lead cache keys when slug is non-null (P-08)
NEVER  recreate src/middleware.ts — the proxy is src/proxy.ts (Next.js 16) (A-13)
NEVER  add React Query / @tanstack — it is not a dependency; fetch via Server Actions in useEffect (P-01, Q-15)
NEVER  assume Sentry exists — server logging is [module]-prefixed console.warn/error until Sentry is wired (P-07)
NEVER  pass a CSS variable to a Recharts fill/stroke prop — use useChartTokens()/getChartTokens() (V-12)
NEVER  use a coloured one-edge border as a category/status indicator — use pills, dots, icons, badges (V-11)
```

---

## Decision Log

When a rule must change or an exception must be granted, it is logged here.
A rule changed without a log entry is not a rule change. It is a violation.

| Date       | Rule  | Old | New                                                                  | Why                                                                                                | Who                     |
| ---------- | ----- | --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
| 2026-05-26 | —     | —   | Initial rules established                                            | Foundation build                                                                                   | —                       |
| 2026-05-28 | Q-11  | —   | assertNever + no default branch                                      | Exhaustive switches; build-time safety                                                             | —                       |
| 2026-05-29 | Q-12  | —   | Mandatory codebase search before creating                            | Prevents duplicates; 33 patterns already replaced                                                  | —                       |
| 2026-05-29 | Q-13  | —   | SECURITY DEFINER scope via function body                             | Caller-supplied domain bypasses RLS entirely                                                       | —                       |
| 2026-05-29 | Q-14  | —   | Realtime channel nonce (useId)                                       | Strict Mode double-mount channel collision                                                         | —                       |
| 2026-05-29 | Q-15  | —   | startTransition in useEffect only                                    | startTransition is a side effect, not render-safe                                                  | —                       |
| 2026-05-29 | Q-16  | —   | unstable_cache key must include domain                               | Prevents cross-domain cache hits                                                                   | —                       |
| 2026-05-31 | Q-17  | —   | APP_DOMAINS vs GIA_DOMAINS split                                     | Gia uses four sales domains; user mgmt keeps full enum                                             | —                       |
| 2026-05-31 | A-15  | —   | Client components must never import value symbols from lib/services/ | Service modules pull next/headers → hard client bundle error; identified during tasks module build | —                       |
| 2026-06-01 | —     | —   | Lead source lives on `leads.utm_source` only                         | `form_data.manual_source` retired; use `LEAD_SOURCES` + `getLeadSourceLabel()`                     | —                       |
| 2026-06-01 | —     | —   | Gia `task_type` vocabulary                                           | `call`, `whatsapp_message`, `other` only in UI and new writes                                      | Migration 0057 backfill |
| 2026-06-04 | Rule 01 | CSS vars only | **Exception: `BAR_COLORS` in `ManagerLeadStatusWidget.tsx`** — hardcoded hex is intentional. These are data-visualisation fills for stacked bar segments where each status must be instantly distinguishable at small widths. The `--status-*-text` CSS tokens are all muted tones that look identical in a 10px-tall bar, defeating the purpose. Any future pipeline bar chart that needs per-status segment fills must use this same map rather than recreating it. | — |
| 2026-06-04 | —     | —   | Dashboard global date filter: Lead Pipeline + Campaign Performance + Lead Volume filter by `leads.created_at` (intake/cohort date) — not `status_changed_at`. Pipeline/Campaign snapshots are now date-scoped cohort views, not all-time counts. Default range: This Week (IST). My Tasks and Recent Activity always show live data and are never date-filtered. | Managers asked "which leads came in this week" not "which leads changed status"; cohort semantics are correct for intake analytics; matches Critical Date-Field Rule for intake windows | — |
| 2026-06-03 | —     | —   | Attribution refactor (migration 0065): 7 flat ad columns → `source`, `medium`, `utm_campaign` + `attribution jsonb`. `utm_source → source`, `utm_medium → medium`; `platform`/`campaign_id`/`ad_name`/`utm_content` folded into `attribution` JSONB. `updateLeadSource` replaces `updateLeadUtmSource`. | Flat per-platform columns don't scale; JSONB bag absorbs new platforms while `source` stays flat+indexed for analytics. | — |
| 2026-06-03 | A-13  | —   | Domain-scoped route authorization: `canAccessRoute()` + `DOMAIN_ROUTE_MAP` + `(dashboard)/layout.tsx` server guard + Sidebar nav filter. Admin/founder bypass; `/dashboard` + `/profile` always allowed. | Non-Gia domains could navigate to `/leads` with no data. Defense-in-depth — neither gate trusts the other. | — |
| 2026-06-03 | —     | —   | `leads.city` promoted from `personal_details` JSONB to a dedicated `text` column (migration 0066), backfilled; `city` key removed from JSONB. `updateLeadCity` action. | Top-level column is indexable and queryable; JSONB is for enrichment that needs no index. | — |
| 2026-06-05 | —     | —   | `public.deals` promoted to a first-class table (migrations 0072–0074), reversing the 2026-05-31 "deals = won leads" decision. `lead_id` nullable (walk-ins); `won_at` immutable; `client_id` reserved. `recordDeal` inserts a deals row before `updateLeadStatus('won')`. `get_deals_summary` rewritten over `public.deals`. | One lead has exactly one terminal `won` and cannot hold repeat/renewal deals; walk-in sales have no lead lifecycle. | — |
| 2026-06-08 | A-16  | —   | Outward network sends use `after()` + awaited send, never `void fetch().catch()`. | Vercel freezes the lambda on response flush, orphaning in-flight `void` promises — silent intermittent WhatsApp notification loss (no error, no log row). | — |
| 2026-06-08 | P-08  | —   | `redis.del` in actions is `await`-ed in try/catch before `revalidatePath`; lead rows dual-keyed (`leadRowSlug` + `leadRowId`). | `void redis.del().catch()` races revalidation and can evict a fresh cache entry, extending the stale-serving window. | — |
| 2026-06-08 | P-07/S-05 | "Use Sentry only" | Server logging is `[module]`-prefixed `console.warn`/`console.error` until Sentry is wired; no Sentry dependency exists today. | Doc named a tool that isn't installed; the real, enforced pattern is structured console logging. | — |
| 2026-06-08 | P-01/P-03 | React Query / virtual rendering | P-01 → Server Components + Server-Action-in-`useEffect`; P-03 → server-side `.range()`/cursor pagination. | Neither React Query nor a virtualization library is a dependency; the doc described tools the codebase never adopted. | — |
