# The Rules

> **Purpose:** the engineering constitution — every coded non-negotiable rule (R/A/S/D/P/V/Q) plus the rule-change Decision Log.
> **Audience:** engineers and coding agents. · **Source-of-truth scope:** ALL engineering rules. Design law lives in `../design/DESIGN-DNA.md`; the §5 V-rules below are the coded subset enforced in reviews. New *design* decisions are logged in `../design/decision-log.md`; rule changes and architecture decisions are logged here.
> **Last verified:** 2026-06-11 (full sweep against the live codebase — every rule below describes something that exists, or is explicitly marked a forward contract). Repeat-offender table re-verified 2026-06-20 against `src/lib/actions/dashboard.ts` (`effectiveWidgetDomain()`; `resolveWidgetScope()` never existed).

## Serene — Non-Negotiable Codebase Laws

> These rules cannot be broken under any circumstances.
> Not for speed. Not for deadlines. Not because it seems harmless.
> If a rule needs to change, it gets a Decision Log entry first.
> A rule changed without a log entry is not a rule change — it is a violation.

---

## Section 0 — Reuse First (the DRY law)

> This section is first because the most common violation in this codebase is not a bad pattern —
> **it is a second copy of a good one.** Read this before writing anything.

| # | Rule |
| --- | --- |
| R-01 | **One behaviour, one implementation, one home.** Before creating any component, hook, util, service function, constant, or Zod schema, search the codebase **by behaviour, not by name** — "date picker" not `DatePicker`, "who can I assign this to" not `getAssignableUsers`, "confirm before delete" not `ConfirmDialog`. Equivalent exists → import and compose it. Near-equivalent exists → extend it to cover both cases. A duplicate is a violation regardless of how different the names are. *(Formerly Q-12.)* |
| R-02 | **The registry is law by reference.** The "File Locations" table in root `CLAUDE.md` and the registries in `src/lib/CLAUDE.md` / `src/components/CLAUDE.md` are part of these rules. Anything marked "THE x" there is the **only** implementation of that concept allowed to exist. |
| R-03 | **Never copy-paste an existing module as the starting point for a "new" one.** A pasted-and-tweaked component/service/action is the same violation as ignoring the original — it forks the behaviour and both copies drift. Extend the original with a prop, option, or parameter; if it can't absorb the new case, refactor it so it can — in the same PR. |
| R-04 | **Deleted forks stay deleted.** When the changelog records a consolidation (assignable-users forks, IST date-math forks, the `chart-tokens.ts` stub, the dashboard `*ForDomainAction` twins), re-introducing a parallel version is a violation, not a judgement call. |

### The repeat-offender table

If your diff contains a new implementation of anything below, the diff is wrong. This is the
most-duplicated subset — the full registry (R-02) is always the real check.

| About to build… | It already exists — use |
| --- | --- |
| Session/role check in a server action | `requireProfile(roles?)` — `lib/actions/_auth.ts` (A-18) |
| "Who can I assign this to?" list | `getAssignableUsers()` / `getAssignableUsersAction()` + `AssignableUser` type |
| Lead Redis invalidation | `invalidateLeadCaches()` — `lib/services/lead-cache.ts` (P-08) |
| Confirm dialog | `<ConfirmDialog>` — never `window.confirm`, never a hand-rolled backdrop+panel |
| List-page filter bar | `<FilterBar>` (+ `useUrlFilters` when URL-driven) |
| Anchored dropdown / floating panel | `usePortalAnchor()` + `<FloatingPanel>` |
| Expand/collapse of variable-height content | `<CollapseReveal>` — `components/ui/CollapseReveal.tsx`; never `height: 0↔'auto'` |
| Empty state | `<EmptyState>` — hero and inline variants |
| `loading.tsx` scaffold | `PageSkeletons` blocks (`PageHeaderSkeleton`, `FilterBarSkeleton`, `SkeletonCard`, `Shimmer`) |
| Labelled stat tile | `<StatTile variant="card"\|"cell">` |
| Task-form fields (priority chips, due presets, type radios) | `TaskFormFields` exports |
| Dashboard widget data lifecycle | `useWidgetData()` (+ `effectiveWidgetDomain()` — `lib/actions/dashboard.ts` — for manager-vs-picker scope) |
| Heavy-modal mount latch | `useMountOnFirstOpen()` |
| Debounce | `useDebounce()` |
| IST day/week/month boundary math | `lib/utils/ist.ts` — never re-fork UTC+5:30 arithmetic |
| Date / count / currency formatting | `lib/utils/dates.ts`, `lib/utils/numbers.ts` |
| Initials or deterministic colour pick | `getInitials()` / `hashString()` — `lib/utils/strings.ts` |
| Text sanitize / phone normalize | `sanitizeText()` / `normalizeToE164()` (S-02, S-03) |
| Chart colours from theme tokens | `useChartTokens()` / `resolveColorMap()` — `components/ui/charts/useChartTokens.ts` |
| Cartesian chart container + prop defaults | `ChartFrame` + `cartesianDefaults()` — `CartesianChartFrame.tsx` |
| Motion duration / easing / spring | `lib/constants/motion.ts` + `--duration-*` / `--ease-*` tokens (V-13) |
| Simple string enum (values/labels/options/zodEnum) | `defineEnum()` — `lib/constants/define-enum.ts` |
| Typed boundary for untyped query rows | `mapRows<TRow, TOut>()` — `lib/utils/rows.ts` (Q-18); joined-profile shapes via `WithAuthor`/`WithAssignee`/`WithActor` |
| Webhook JSON parse / rate limit / secret compare | `readJsonBody()` / `createRateLimiter()` / `safeSecretCompare()` — `lib/utils/webhook.ts` |
| CSV/XLSX export | `lib/utils/export.ts` — client-side only, never imported by actions/services |

---

## Section 1 — Architecture

| # | Rule |
| --- | --- |
| A-01 | Authorization reads **only** from `public.profiles`. JWT claims are never trusted for permission decisions. (The proxy's `getClaims()` call is session presence + refresh only — never an authorization input; `getCurrentProfile()` keeps the authoritative `getUser()`.) |
| A-02 | Server Actions are the **only** path from components to DB mutations. No direct Supabase writes from client components. |
| A-03 | All DB queries go through service functions in `lib/services/`. No raw Supabase calls in components or actions. |
| A-04 | `components/ui/` imports types only — never functions, actions, hooks, or services from feature code. |
| A-05 | Feature folders own their code. A component in `components/leads/` never imports from `components/tasks/`. Cross-feature data flows through `lib/` only. |
| A-06 | UI components are display-only. Zero business logic. Zero DB calls. Zero decisions. |
| A-07 | One table, one responsibility. No mixing domains in one table. |
| A-08 | Every new table has `ALTER TABLE x ENABLE ROW LEVEL SECURITY` in its migration. No exceptions. |
| A-09 | Two-layer security always. RLS enforces at DB level. Server action enforces at code level. Never rely on one layer alone. |
| A-10 | All `SECURITY DEFINER` functions must have `SET search_path = public`. |
| A-11 | Log and activity tables are **append-only**. No `UPDATE` or `DELETE`. The two documented narrow exceptions — `task_remarks` suppression flags (admin/founder) and WhatsApp delivery-receipt status — live in their CLAUDE.md files; a new exception requires a Decision Log entry first. |
| A-12 | Async work exceeding 3 seconds or requiring retry runs in Trigger.dev. Post-response side-effects that fit the lambda budget (notification sends) use `after()` per A-16. Nothing heavier ever lives in a route handler or server action. |
| A-13 | Every dashboard route is protected at three layers: `src/proxy.ts` (Next.js 16 proxy — session refresh, replaces `middleware.ts`), the `(dashboard)/layout.tsx` server guard, and `canAccessRoute()` domain gating via `DOMAIN_ROUTE_MAP`. No authenticated page renders without a verified session. There is **no** `src/middleware.ts` — never recreate it. |
| A-14 | Never edit a migration that has already run in production. Write a new one. |
| A-15 | `'use client'` components must never import value symbols from `lib/services/`. Service modules import the server Supabase client (`next/headers`), which hard-errors in the client bundle. Client components that need lazy or paginated data call a Server Action in `lib/actions/` instead. `import type` from services is safe — type imports are erased at compile time. |
| A-16 | **Outward network sends that must complete (WhatsApp/Gupshup, any external `fetch`) use `after()` from `next/server` with an `await`-ed send inside — never `void fetch().catch()`.** On Vercel the lambda is frozen the instant the response/action-return is flushed, orphaning any in-flight `void` promise (silent, intermittent data loss — no error, no log row). Routes carrying network sends in `after()` export `maxDuration`. Lead-assignment side-effects always route through `notifyLeadAssigned()`. Reference: `src/app/api/webhooks/leads/route.ts`. |
| A-17 | Framer Motion is always `import { m as motion } from 'framer-motion'` — never the bare `{ motion }` namespace. The root layout's `<MotionProvider>` (LazyMotion strict + async domMax) throws in dev on the full namespace; the alias keeps every JSX site identical while shipping the slim `m` core. `<MotionProvider>` is mounted exactly once, in the root layout — never a second time. It also owns `<MotionConfig reducedMotion="user">`, so Framer animations respect reduced motion globally; CSS keyframes still gate via the `prefers-reduced-motion` media query. |
| A-18 | Every session-based Server Action begins with `requireProfile(roles?)` from `lib/actions/_auth.ts` — never a hand-rolled `getCurrentProfile()` + role-`includes` block. Both failure modes return the unified `formErrors.unauthorized`. Per-resource checks (lead access, task mutability, manager-domain) stay in the action after the guard. The documented exceptions (`sla.ts` under Trigger.dev, `loginAction`'s `is_active` read, the four parallel-fetch tasks actions) live in `lib/actions/CLAUDE.md` — do not add new ones without a Decision Log entry. |

---

## Section 2 — Security

| # | Rule |
| --- | --- |
| S-01 | Every Server Action validates input with a Zod schema **before** touching the DB. First line. No exceptions. |
| S-02 | All user-supplied text passes through `sanitizeText()` before any DB write. Lives in `lib/utils/sanitize.ts`. |
| S-03 | All phone numbers stored as E.164. `normalizeToE164()` called on every phone field before any DB write. Lives in `lib/utils/phone.ts`. |
| S-04 | Never spread a raw request body or client-supplied object into a DB insert. Always whitelist fields via Zod schema. |
| S-05 | Never expose raw Postgres errors, stack traces, or Zod validation details to the UI. Log server-side with a `[module-action]`-prefixed `console.warn`/`console.error`; return a safe, human-readable message. (Sentry is not wired — do not assume a Sentry client exists.) |
| S-06 | Never trust client-supplied IDs without verifying ownership. Always confirm the requesting user has access to the record. |
| S-07 | Sequential integer IDs are never exposed in URLs. UUIDs (or slugs) only. |
| S-08 | Sensitive data never appears in URL query parameters. |
| S-09 | Auth error messages never reveal whether an email address exists in the system. (Same principle inside the app: `requireProfile` returns one unified `unauthorized` message for both no-session and wrong-role.) |
| S-10 | Session tokens, auth codes, and secrets are never written to any log. |
| S-11 | `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and any variable ending in `_KEY`, `_SECRET`, or `_TOKEN` are server-only. Never in client code. Prefix with `NEXT_PUBLIC_` only if the value is genuinely public. |
| S-12 | Every webhook endpoint validates its auth credential before processing the payload — reject before reading the body. Current credentials: `/api/webhooks/leads` = Bearer token; `/api/webhooks/whatsapp` = `x-gupshup-secret` header. (The whatsapp route still returns 200 on auth-pass-but-bad-payload so Meta/Gupshup do not retry.) |
| S-13 | No `dangerouslySetInnerHTML` anywhere. |
| S-14 | Users cannot update their own `role` or `domain`. These fields are server-controlled only — privileged updates go through the admin/founder-gated authorization action. |
| S-15 | **Separation of duties — forward contract.** Target posture: no single role both performs a sensitive action and audits it. Today admin and founder share most gates; the enforced subset is S-14 + `requireProfile` role-gating + append-only activity logs. Do not silently widen the role arrays in privileged actions; full separation lands with the clients/HR-grade surfaces. |
| S-16 | **Second-actor approval — forward contract.** Role changes, domain changes, and deactivation are admin/founder-gated server actions today; the two-actor confirmation flow is not yet built. Until it is, never ship UI that lets a user approve a privilege change on their own account. |
| S-17 | Webhook endpoints are rate-limited via `createRateLimiter()` and compare secrets timing-safe via `safeSecretCompare()` — both in `lib/utils/webhook.ts` (audit F-4). Any new public-facing route ships with both from day one. Never write a bespoke limiter or a `===` secret compare. |

---

## Section 3 — Data & Privacy

| # | Rule |
| --- | --- |
| D-01 | No raw PII ever reaches Claude, Gemini, or any external AI model. Data is pseudonymized before leaving the vault; pseudonymization is reversible only by a vault function — never client-side. **Forward contract that binds the Elaya build (vision: Elaya v1):** nothing today sends data to an external model, and no AI integration ships before the vault exists. |
| D-02 | No hard deletes on leads, profiles, notes, or activity logs. Soft-delete with `archived_at` or `deleted_at` timestamps. |
| D-03 | Every lead status change, assignment, reassignment, note addition, domain/role change, and failed authentication attempt is logged to the relevant `*_activities` table. |
| D-04 | Full PII never appears in log messages or error-tracker context. Use record IDs in logs, never names or phone numbers. (WhatsApp notification logs store last-4 phone digits only. The one deliberate raw-PII store, `lead_raw_payloads`, is a logged decision — see Decision Log 2026-06-11/F-5.) |
| D-05 | AI prompt contents containing client data are never logged. |
| D-06 | No session tokens or auth codes written to any log or error tracker. |

---

## Section 4 — Performance

| # | Rule |
| --- | --- |
| P-01 | Data fetching is Server-Components-first. Client widgets that need lazy/paginated/refreshable data fetch via a Server Action inside `useEffect` (the Q-15 pattern) — never a bare `useEffect` fetch against Supabase, and never React Query (not a dependency; do not add it). |
| P-02 | No API routes except `/api/webhooks/leads`, `/api/webhooks/whatsapp`, `/api/auth/callback`, and `/api/elaya/chat` (the Elaya SSE streaming endpoint — Server Actions cannot stream; session-authenticated + rate-limited, Decision Log 2026-06-12). All data mutations go through Server Actions. |
| P-03 | Any list that can exceed ~100 rows is bounded server-side — `.range()` pagination (leads = 50/page) or a cursor RPC (`get_personal_tasks`). Never `SELECT *` the full table into the DOM. Keyset cursors over nullable sort columns must be composite (see `src/lib/CLAUDE.md`). |
| P-04 | Images in scroll containers use `loading="lazy"`. |
| P-05 | No scroll event listeners for UI logic. Use `IntersectionObserver`. |
| P-06 | Supabase Realtime subscriptions always include a filter and a mount-scoped `useId()` nonce in the channel name (Q-14). Never subscribe to a full table. Cleanup is always `supabase.removeChannel(channel)` — `channel.unsubscribe()` alone leaks the channel in the singleton client's registry. |
| P-07 | No stray debug `console.log` in shipped code. Permitted: deliberate `[module-action]`-prefixed `console.warn`/`console.error` for non-fatal server-side failures — this is the codified logging pattern until Sentry is wired. Never log PII (D-04). |
| P-08 | Every `redis.del` in a Server Action is `await`-ed inside a `try/catch` that logs a `[module-action]` warning, **before** `revalidatePath`/`revalidateTag` — a `void redis.del().catch()` races revalidation and can evict a fresh entry. **For lead actions this is structural:** call `invalidateLeadCaches(site, lead, scope)` from `lib/services/lead-cache.ts` (it owns the dual-key `leadRowSlug`+`leadRowId` invariant and the await convention) — never hand-assemble a `redis.del` block. Dashboard volume keys are TTL-only by design. |
| P-09 | `unstable_cache` closures cannot touch `cookies()`/`headers()` — and `createClient()` from `lib/supabase/server.ts` calls `cookies()` internally, so **any service function using the session client can never be wrapped in `unstable_cache`.** Per-request memoisation uses React `cache()` instead. Where `unstable_cache` is legal, keys follow Q-16 and revalidation is `revalidateTag(tag, { expire: 0 })` (Next.js 16 two-arg form). Reference: `getAgentPerformanceSummary` (React `cache()`), `getGroupTasks` (`unstable_cache`). |

---

## Section 5 — Design

> Full design law: `../design/DESIGN-DNA.md`. This table is the coded subset (V-rules) enforced in reviews — one home per rule; do not restate DNA prose here.

| # | Rule |
| --- | --- |
| V-01 | Every colour is a CSS variable from `src/styles/design-tokens.css`. No hardcoded hex values in components. `text-gray-500` is a violation. `bg-white` is a violation. **The narrow data-visualisation exceptions are listed in the block below. They are the only ones.** |
| V-02 | `--theme-accent-fg` on buttons and accent fills — never `--theme-text-inverse`. They are different tokens for different surfaces. White-on-saturated-semantic fills use the `--color-{success,warning,danger}-fg` family. |
| V-03 | Component animation ceiling is **500ms** (`--duration-page` / `PAGE_DURATION`). Exactly three surfaces may exceed it: `liaBreathe` (3s ambient), the DNA §14.3 route-level progress bar, and DNA §16.7 chart draw animations — nothing else inherits their licence. |
| V-04 | No `font-bold`. `--weight-semibold` (600) is the maximum weight in Serene. |
| V-05 | No `z-index` values outside the `--z-*` token scale defined in `design-tokens.css`. |
| V-06 | No `backdrop-filter` / blur except on three sanctioned surfaces: TopBar (sticky), mobile sidebar overlay, command palette overlay (palette is a forward contract — not yet built). Never on cards, dropdowns, or modals. |
| V-07 | No mixing radius values within a single component. One radius per component. |
| V-08 | No skeleton shown for less than 150ms. Fast skeletons that flash look more broken than no skeleton. |
| V-09 | Empty states always use the Playfair italic heading via `<EmptyState>`. Never "No data available." Never a hand-rolled italic style object. |
| V-10 | Micro labels are always: `text-[10px] font-medium uppercase tracking-[0.12em] text-[--theme-text-tertiary]`. Never deviate. |
| V-11 | Never use a coloured border on one edge of a card, row, or column (`borderLeft`/`borderTop`/`borderRight`/`borderBottom` accent strips) as a category/status indicator. Use pills, dots, icons, or semantic badges instead. |
| V-12 | Never pass a CSS variable directly to a Recharts `fill`/`stroke` prop — SVG attributes do not resolve `var(--…)` reliably. Resolve vars to computed hex via **`useChartTokens()` (chart series/grid/axis tokens) or `resolveColorMap()` (any `Record<string, var(--…)>` map) — both in `src/components/ui/charts/useChartTokens.ts`.** Both re-resolve on `data-theme` change. (`src/lib/utils/chart-tokens.ts` was a dead stub and is deleted — never recreate it.) |
| V-13 | Motion values come from the system, never inline: durations/easings/springs import from `lib/constants/motion.ts` (`EASE_OUT_EXPO`, `SPRING_CONFIG`, `PAGE_DURATION`, …) in Framer code and use `--duration-*`/`--ease-*` tokens in CSS. A re-declared inline bezier array or one-off spring config is a violation. Icon hover gestures use the `.serene-icon-*-hover` family / Button `iconMotion` prop — never a new one-off keyframe per call site. |
| V-14 | **Responsiveness is a standing contract** (decision-log D-1…D-5, 2026-06-12; per-surface record in `docs/audits/2026-06-responsive-audit.md` — both binding, not duplicated here). Code-level invariants: breakpoints are the Tailwind v4 defaults (= DNA §2.7) — no arbitrary pixel breakpoints in components; client-JS viewport branches go through `useMediaQuery` + `MQ` from `src/hooks/useMediaQuery.ts` — never raw `matchMedia` or a `window.innerWidth` snapshot — and only when *behaviour* differs (purely presentational → CSS `md:` toggles). Responsive behaviour lives in shared primitives (`.serene-shell*`, `.serene-dossier-grid` + `--340`, `.serene-board`, `.serene-touch`, FilterBar, the table card-stack, Dialog's bottom-sheet-`<md`); page-level responsive classes are for page chrome only (the `p-4 sm:p-6 lg:p-8` ladder). Responsive column counts live in classes **only** — an inline `gridTemplateColumns` silently overrides every `md:`/`lg:` variant at every width (the campaign-strip bug, F2). Full-height surfaces use `dvh`, never `vh`. Persisted layouts (column prefs, dashboard layout, workspace view) never drive the narrow rendering. |

---

### Sanctioned hardcoded-colour exceptions

V-01 forbids hardcoded hex **in the general case**. There is exactly one exception, a pre-paint data-visualisation fallback where the rendering surface cannot resolve `var(--…)` in time. A new hardcoded colour anywhere else — a button, a label, an inline style, a one-off badge — is a violation. Do not grow this list without a Decision Log entry.

| Exception | Location | Why it is allowed |
| --- | --- | --- |
| **`FALLBACK` palette** — chart series/grid/axis defaults | `useChartTokens.ts` | Pre-paint fallback (Earth theme) used only until `getComputedStyle` resolves the real theme vars, preventing a flash of unstyled chart. Live render always uses the resolved theme tokens; the hex is the SSR/first-frame safety net, never the steady state. |
| **`BAR_COLORS` — *retired exception* (2026-06-11)** | `ManagerLeadStatusWidget.tsx` | Formerly a sanctioned hex map (Decision Log 2026-06-04). The justification was factually wrong — the segments are plain HTML `div`s where `var(--…)` resolves natively. The saturated tier now lives in the token map as `--status-{name}-solid` (`design-tokens.css`). Any per-status pipeline bar uses the `--status-*-solid` family — never raw hex. |
| **`LEAD_STATUS_COLORS` are `var(--…)`, not hex — *not* an exception** | `lib/constants/lead-statuses.ts` | Listed only to prevent confusion: lead-status pill colours are **theme tokens** (`--status-*-text/light/border`), resolved through `resolveColorMap()` at the chart boundary. Theme-invariant by design (psychological anchors) but still tokens. Never replace them with raw hex. |

**The token for "white text on a saturated semantic fill" is the `--color-{success,warning,danger}-fg` family** (defined since 2026-06-11 — the old `var(--color-danger-fg, #fff)` token-with-fallback form is retired). The `-text` tier (`--color-danger-text` etc.) is the label colour on a `-light` fill only — never use it on (or as) a saturated fill, and never use `--theme-text-inverse` for this job (`Button.tsx`'s danger/success hover is the only grandfathered site). A bare `color: "#ffffff"` is a V-01 violation — use the `-fg` token.

---

## Section 6 — Code Quality

| # | Rule |
| --- | --- |
| Q-01 | No `any` type anywhere. TypeScript strict mode is non-negotiable. (One documented carve-out: an `.rpc()` call whose function isn't in the generated types yet — cast with the eslint-disable comment per `src/lib/CLAUDE.md`, then regenerate types.) |
| Q-02 | No magic strings. Domain names, role names, and status values live in `lib/constants/` as typed enums. Simple string enums are built with `defineEnum()` so values/labels/options/zodEnum cannot drift. |
| Q-03 | Server Actions return `{ data, error }`. Never throw. Never return void. Components handle both branches explicitly. |
| Q-04 | Error messages shown to users come from `lib/validations/form-errors.ts`. Never raw Zod messages. Never "Invalid input." |
| Q-05 | No npm package added without justification documented in `docs/changelog.md`. |
| Q-06a | Every meaningful change — feature, fix, migration, new package, refactor — gets an entry in `docs/changelog.md` before or alongside the code. `docs/changelog.md` is the single source of truth (`The_Changelog.md` is deleted). |
| Q-06 | No production deployment without the deploy checklist in `docs/operations/deployment.md` passing. Migration deploy-order warnings recorded in the changelog (e.g. 0102: code before migration) are binding. |
| Q-07 | **Drag-to-reorder always uses `@dnd-kit`.** Never `react-beautiful-dnd`, forks, or hand-rolled pointer listeners. Applies to task lists, priority ordering, dashboard widget arrangement, and any future sortable surface. |
| Q-08 | **Column preference hooks follow the `useLeadColumnPreferences` pattern exactly.** Same hook signature, same localStorage key convention: `serene:[module]:columns:${userId}:v1`. Column IDs are stable localStorage keys — never rename after shipping. |
| Q-09 | **PostgreSQL `COUNT(*)` returns `bigint`. Always cast with `Number()` in the service layer.** In components, format counts through `formatCompact()`/`formatCount()` from `lib/utils/numbers.ts` — never `.toString()` on a raw RPC field. An uncast `BigInt` silently breaks JSON serialisation. |
| Q-10 | **`decodeURIComponent` in route handlers must be wrapped in `try/catch → notFound()`.** A malformed percent-sequence (`/campaigns/%GG`) throws `URIError` at the server boundary — a 500 where a 404 belongs. |
| Q-11 | **Every `switch` over a union type is exhaustive. No `default` branch.** `assertNever(x)` from `lib/utils/assert-never.ts` as the final return; the compiler then errors on any unhandled case. Applies to `NotificationType`, `LeadStatus`, `CallOutcome`, `TaskType`, `ToastType`, and every future union. |
| Q-12 | **Promoted to Section 0 (R-01–R-04).** The reuse law, the registry, and the repeat-offender table live there. The ID is retained so existing references (CLAUDE.md, changelog, audits) still resolve. |
| Q-13 | **SECURITY DEFINER RPCs follow the two-tier scoping model (audit F-1, migration 0102).** Tier 1 — *self-scoped*: derives scope from `auth.uid()` / `get_user_role()` / `get_user_domain()` inside the body; keeps `GRANT EXECUTE TO authenticated`; called on the session client (`get_agent_performance`, `get_leads_status_counts`). Tier 2 — *revoked*: takes scope params; `EXECUTE` REVOKEd from `PUBLIC, anon, authenticated`; called only via `createAdminClient()` with **session-derived** args — the calling action/page is the trust boundary (`get_dashboard_summary`). **A scope-param RPC with a live `authenticated` GRANT is a violation.** |
| Q-14 | **Supabase Realtime channel names include a mount-scoped nonce (`useId()`).** Pattern: `` `table-${id}-${mountId}` ``. Strict Mode double-mounts effects — without the nonce the second mount reuses the subscribed channel and throws. |
| Q-15 | **Initial data fetch in a client component lives in `useEffect`, never as a render-phase guard.** `startTransition` is a side effect and cannot run during render. Use the cancelled-flag pattern; the flag guards `setState` on an unmounted component. |
| Q-16 | **`unstable_cache` keys include every dimension that scopes the query** — domain for domain-scoped, userId for user-scoped. Omitting one allows cross-user/cross-domain cache hits. See P-09 for the `cookies()` constraint and the `{ expire: 0 }` revalidation form. Reference: `getGroupTasks`. |
| Q-17 | **Two domain registries — never mix them.** `APP_DOMAINS` + `DOMAIN_LABELS` (`lib/constants/domains.ts`) is the full platform enum (user management, profiles, authorization). `GIA_DOMAINS` is the Gia subset (leads, campaigns, dashboard Gia widgets, performance pickers). Display names always via `DOMAIN_LABELS`. Never hardcode domain labels, never add local `DOMAIN_SHORT`/`FEATURED_DOMAINS` maps. To add a Gia domain, append to `GIA_DOMAINS` + `DOMAIN_LABELS` in one file. |
| Q-18 | **Untyped query results (joined selects, RPCs not yet in the generated types) cross into typed code only via `mapRows<TRow, TOut>()` from `lib/utils/rows.ts`.** No new `as Record<string, unknown>` row casts in services — the four legacy casts are grandfathered and that count only goes down. "Row + joined profile" shapes use `WithAuthor<T>`/`WithAssignee<T>`/`WithActor<T>` from `lib/types`, never a fresh intersection. |

---

## Section 7 — File & Naming Conventions

```text
Components:   PascalCase.tsx        → LeadsTable.tsx, CampaignCard.tsx
Actions:      kebab-case.ts         → leads.ts, agent-routing.ts
              _-prefix = internal non-endpoint helper (no "use server") → _auth.ts
Services:     kebab-case.ts         → leads-service.ts, lead-cache.ts
Hooks:        camelCase.ts (use*)   → useWidgetData.ts, useUrlFilters.ts
Utils:        kebab-case.ts         → sanitize.ts, ist.ts, rows.ts
Validations:  kebab-case.ts         → lead-schema.ts, task-schemas.ts
Constants:    kebab-case.ts         → domains.ts, lead-statuses.ts, motion.ts
Pages:        page.tsx              → Next.js convention, always
Layouts:      layout.tsx            → Next.js convention, always
```

---

## Section 8 — The Absolute Never-Do List

These patterns do not exist in this codebase. Not under pressure, not temporarily, not "just for now."

```text
─ Reuse (Section 0) ─
NEVER  create a component, hook, util, service, constant, or schema without first
       searching the codebase by behaviour — not filename (R-01)
NEVER  copy-paste an existing module as the starting point for a "new" one —
       extend or compose the original (R-03)
NEVER  re-add a fork the changelog records as consolidated (R-04)
NEVER  hand-roll a confirm dialog or use window.confirm — <ConfirmDialog>
NEVER  re-implement anything in the Section 0 repeat-offender table

─ Architecture & server ─
NEVER  call Supabase directly from a client component for mutations (A-02)
NEVER  fetch Supabase directly in useEffect — the only sanctioned client fetch is
       a Server Action inside useEffect (P-01, Q-15)
NEVER  import a value symbol from lib/services/ in a 'use client' component (A-15)
NEVER  import { motion } from 'framer-motion' — always { m as motion } (A-17)
NEVER  hand-roll a session/role check in a server action — requireProfile() (A-18)
NEVER  use JWT claims for authorization decisions (A-01)
NEVER  recreate src/middleware.ts — the proxy is src/proxy.ts (A-13)
NEVER  fire an outward network send as void fn().catch() — after() + awaited send (A-16)
NEVER  put work needing >3s or retries in a route handler or action — Trigger.dev (A-12)
NEVER  put business logic in a UI component (A-06)
NEVER  import one feature folder into another (A-05)
NEVER  mix module concerns in one table (A-07)
NEVER  edit a migration that has already run in production (A-14)
NEVER  skip RLS on a new table (A-08)
NEVER  UPDATE or DELETE rows in append-only log/activity tables (A-11)

─ Security & data ─
NEVER  spread raw client input into a DB insert (S-04)
NEVER  use dangerouslySetInnerHTML (S-13)
NEVER  expose sequential integer IDs in URLs (S-07)
NEVER  leave a scope-param SECURITY DEFINER RPC with a live authenticated GRANT (Q-13)
NEVER  ship a public route without createRateLimiter() + safeSecretCompare() (S-17)
NEVER  send raw PII to any external AI model (D-01)
NEVER  log names, phone numbers, or PII — use record IDs (D-04)
NEVER  write stray console.log — [module]-prefixed warn/error only (P-07)
NEVER  assume Sentry exists — it is not wired (P-07, S-05)

─ Caching & async ─
NEVER  void redis.del().catch() before revalidatePath — await in try/catch first;
       lead actions go through invalidateLeadCaches() (P-08)
NEVER  wrap a session-client service function in unstable_cache — React cache() (P-09)
NEVER  omit a scoping dimension (domain, userId) from an unstable_cache key (Q-16)
NEVER  use a bare table name as a Realtime channel — useId() nonce in the name,
       removeChannel() on cleanup (Q-14, P-06)
NEVER  call startTransition during the render phase — inside useEffect only (Q-15)
NEVER  add React Query / @tanstack — not a dependency; Server Actions in useEffect (P-01)

─ Design ─
NEVER  hardcode a colour value — tokens only; text-gray-*, bg-gray-*, bg-white
       are violations (V-01)
NEVER  pass a CSS variable to a Recharts fill/stroke — resolve via useChartTokens()/
       resolveColorMap(); the deleted lib/utils/chart-tokens.ts stub stays deleted (V-12)
NEVER  animate width, height, padding, or margin — transform/opacity only;
       expand/collapse composes <CollapseReveal> (grid-template-rows 0fr↔1fr + fade)
       — the former height 0↔auto exception is retired (Decision Log 2026-06-11)
NEVER  re-declare a motion duration, easing, or spring inline — motion.ts / tokens (V-13)
NEVER  use z-index values outside the --z-* scale (V-05)
NEVER  use backdrop-blur outside TopBar, mobile sidebar overlay, command palette (V-06)
NEVER  use font-bold (700) — semibold (600) is the ceiling (V-04)
NEVER  use a coloured one-edge border as a category/status indicator —
       pills, dots, icons, badges (V-11)
NEVER  show a skeleton for less than 150ms (V-08)
NEVER  use "No data available" — <EmptyState> with the Playfair italic heading (V-09)
NEVER  branch layout on raw matchMedia or window.innerWidth — useMediaQuery + MQ;
       CSS md: toggles when purely presentational (V-14)
NEVER  combine an inline gridTemplateColumns with responsive grid-cols-* classes —
       the inline style wins at every width and kills the md:/lg: variants (V-14)
NEVER  use vh for a full-height surface — dvh (V-14, DNA R-01)
NEVER  let a persisted layout (column prefs, dashboard layout, workspace view)
       drive the <md rendering (V-14, D-2)
NEVER  fork a new responsive shell/grid class — extend .serene-shell*/.serene-dossier-grid/
       .serene-board or add a variant, per D-5 (V-14)

─ Quality ─
NEVER  let a Zod default error message reach the user (Q-04)
NEVER  clear a form field on validation error
NEVER  use anything other than @dnd-kit for drag-to-reorder (Q-07)
NEVER  invent a new localStorage key format for column prefs —
       serene:[module]:columns:${userId}:v1 (Q-08)
NEVER  use a raw RPC bigint in a component — Number() in the service,
       formatCount()/formatCompact() in the component (Q-09)
NEVER  call decodeURIComponent in a route handler without try/catch → notFound() (Q-10)
NEVER  use a default branch in a switch over a union type — assertNever() (Q-11)
NEVER  add a new `as Record<string, unknown>` cast in a service — mapRows() (Q-18)
NEVER  hardcode Gia domain labels or duplicate domain lists —
       GIA_DOMAINS + DOMAIN_LABELS (Q-17)
NEVER  add a package or merge a meaningful change without a docs/changelog.md
       entry (Q-05, Q-06a)
```

---

## Decision Log

When a rule must change or an exception must be granted, it is logged here.
A rule changed without a log entry is not a rule change. It is a violation.

| Date | Rule | Old | New | Why | Who |
| --- | --- | --- | --- | --- | --- |
| 2026-05-26 | — | — | Initial rules established | Foundation build | — |
| 2026-05-28 | Q-11 | — | assertNever + no default branch | Exhaustive switches; build-time safety | — |
| 2026-05-29 | Q-12 | — | Mandatory codebase search before creating | Prevents duplicates; 33 patterns already replaced | — |
| 2026-05-29 | Q-13 | — | SECURITY DEFINER scope via function body | Caller-supplied domain bypasses RLS entirely | — |
| 2026-05-29 | Q-14 | — | Realtime channel nonce (useId) | Strict Mode double-mount channel collision | — |
| 2026-05-29 | Q-15 | — | startTransition in useEffect only | startTransition is a side effect, not render-safe | — |
| 2026-05-29 | Q-16 | — | unstable_cache key must include domain | Prevents cross-domain cache hits | — |
| 2026-05-31 | Q-17 | — | APP_DOMAINS vs GIA_DOMAINS split | Gia uses four sales domains; user mgmt keeps full enum | — |
| 2026-05-31 | A-15 | — | Client components must never import value symbols from lib/services/ | Service modules pull next/headers → hard client bundle error; identified during tasks module build | — |
| 2026-06-01 | — | — | Lead source lives on `leads.utm_source` only | `form_data.manual_source` retired; use `LEAD_SOURCES` + `getLeadSourceLabel()` | — |
| 2026-06-01 | — | — | Gia `task_type` vocabulary | `call`, `whatsapp_message`, `other` only in UI and new writes | Migration 0057 backfill |
| 2026-06-04 | Rule 01 | CSS vars only | **Exception: `BAR_COLORS` in `ManagerLeadStatusWidget.tsx`** — hardcoded hex is intentional. These are data-visualisation fills for stacked bar segments where each status must be instantly distinguishable at small widths. The `--status-*-text` CSS tokens are all muted tones that look identical in a 10px-tall bar, defeating the purpose. Any future pipeline bar chart that needs per-status segment fills must use this same map rather than recreating it. | — | — |
| 2026-06-04 | — | — | Dashboard global date filter: Lead Pipeline + Campaign Performance + Lead Volume filter by `leads.created_at` (intake/cohort date) — not `status_changed_at`. Pipeline/Campaign snapshots are now date-scoped cohort views, not all-time counts. Default range: This Week (IST). My Tasks and Recent Activity always show live data and are never date-filtered. | Managers asked "which leads came in this week" not "which leads changed status"; cohort semantics are correct for intake analytics; matches Critical Date-Field Rule for intake windows | — |
| 2026-06-03 | — | — | Attribution refactor (migration 0065): 7 flat ad columns → `source`, `medium`, `utm_campaign` + `attribution jsonb`. `utm_source → source`, `utm_medium → medium`; `platform`/`campaign_id`/`ad_name`/`utm_content` folded into `attribution` JSONB. `updateLeadSource` replaces `updateLeadUtmSource`. | Flat per-platform columns don't scale; JSONB bag absorbs new platforms while `source` stays flat+indexed for analytics. | — |
| 2026-06-03 | A-13 | — | Domain-scoped route authorization: `canAccessRoute()` + `DOMAIN_ROUTE_MAP` + `(dashboard)/layout.tsx` server guard + Sidebar nav filter. Admin/founder bypass; `/dashboard` + `/profile` always allowed. | Non-Gia domains could navigate to `/leads` with no data. Defense-in-depth — neither gate trusts the other. | — |
| 2026-06-03 | — | — | `leads.city` promoted from `personal_details` JSONB to a dedicated `text` column (migration 0066), backfilled; `city` key removed from JSONB. `updateLeadCity` action. | Top-level column is indexable and queryable; JSONB is for enrichment that needs no index. | — |
| 2026-06-05 | — | — | `public.deals` promoted to a first-class table (migrations 0072–0074), reversing the 2026-05-31 "deals = won leads" decision. `lead_id` nullable (walk-ins); `won_at` immutable; `client_id` reserved. `recordDeal` inserts a deals row before `updateLeadStatus('won')`. `get_deals_summary` rewritten over `public.deals`. | One lead has exactly one terminal `won` and cannot hold repeat/renewal deals; walk-in sales have no lead lifecycle. | — |
| 2026-06-08 | A-16 | — | Outward network sends use `after()` + awaited send, never `void fetch().catch()`. | Vercel freezes the lambda on response flush, orphaning in-flight `void` promises — silent intermittent WhatsApp notification loss (no error, no log row). | — |
| 2026-06-08 | P-08 | — | `redis.del` in actions is `await`-ed in try/catch before `revalidatePath`; lead rows dual-keyed (`leadRowSlug` + `leadRowId`). | `void redis.del().catch()` races revalidation and can evict a fresh cache entry, extending the stale-serving window. | — |
| 2026-06-08 | P-07/S-05 | "Use Sentry only" | Server logging is `[module]`-prefixed `console.warn`/`console.error` until Sentry is wired; no Sentry dependency exists today. | Doc named a tool that isn't installed; the real, enforced pattern is structured console logging. | — |
| 2026-06-08 | P-01/P-03 | React Query / virtual rendering | P-01 → Server Components + Server-Action-in-`useEffect`; P-03 → server-side `.range()`/cursor pagination. | Neither React Query nor a virtualization library is a dependency; the doc described tools the codebase never adopted. | — |
| 2026-06-09 | V-01/V-12 | Single buried exception (`BAR_COLORS` only); V-12 pointed at `lib/utils/chart-tokens.ts` | Consolidated **three** sanctioned hardcoded-colour exceptions into one discoverable block (`BAR_COLORS`, `useChartTokens` `FALLBACK`, plus the clarification that `LEAD_STATUS_COLORS` are tokens not hex). V-12 now points at the live `components/ui/charts/useChartTokens.ts` (`useChartTokens()` + `resolveColorMap()`); the `lib/utils/chart-tokens.ts` stub is flagged dead. `SubTaskModal` `#ffffff` flagged as a known violation, not an exception. | Audited the codebase against the rules: the real hardcoded-colour surface area was wider than documented and V-12's referenced file was a `Not implemented` stub. New devs/AI need the exceptions explicit, not folded into one log line. | — |
| 2026-06-11 | Rule 01 | `BAR_COLORS` hex exception (2026-06-04) | **Superseded.** Saturated per-status fills are now tokens: `--status-{name}-solid` ×7 in `design-tokens.css` (same hex values — zero visual change). `ManagerLeadStatusWidget` references the tokens. | The 2026-06-04 justification was factually wrong: the segments are HTML `div`s, not SVG — `var(--…)` resolves natively. The design need (distinct saturated fills at small widths) was a token gap, not a hex licence. Design audit H-01. | — |
| 2026-06-11 | — | — | New semantic tier `--color-{success,warning,danger}-fg: #ffffff` — THE label colour on saturated semantic fills. Adopted in `ConfirmDialog`, `SubTaskModal` (delete button bg also fixed `--color-danger-text` → `--color-danger`), `StatusActionPanel` (success + revive confirm), `WonDealModal` (success CTAs + radio dot). `--theme-text-inverse` and `-text` tokens are no longer valid for this job (Button.tsx hover drift stays grandfathered). | Two call sites had independently invented `var(--color-danger-fg, #fff)` — the concept wanted to exist; the revive button had a real contrast failure (`-text` amber on saturated amber). Design audit H-03 / L-03 / M-08. | — |
| 2026-06-11 | — | — | **Overlay contract:** full-screen modal backdrops use `color-mix(in srgb, var(--theme-canvas) 72%, transparent)` (Dialog's theme-tinted formula — adopted in SubTaskModal); lighter panel/sheet backdrops use `--overlay-bg-light` (adopted in NotificationPanel mobile backdrop, z `--z-raised`); image scrims use the new `--overlay-scrim` (rgba 0,0,0,0.52 — adopted in ProfileAvatarSection). | Five different darkening strategies existed for the same job, two hardcoded. Design audit M-02 / L-06 / DOC-02. | — |
| 2026-06-11 | V-01/V-03 | — | Agent-distribution segment palette switched from semantic cycle (`accent → info → success → warning → danger`) to non-semantic `--domain-*` mid-tones. Semantic colours are reserved for data with good/bad meaning. | Agent #5 rendering in danger red was a false signal; agents are categorical data like domains. Design audit M-09. | — |
| 2026-06-11 | — | — | `--shadow-gold-shimmer` scoped to `[data-theme="earth"]` with a `none` default on `:root` (was defined for all themes, contradicting DNA §2). | Earth-only token leaking to all themes; zero consumers today, `none` default keeps any future non-Earth consumer valid. Design audit L-04. | — |
| 2026-06-11 | M (layout-property) | "NEVER animate width, height, padding, or margin" — no exceptions | **Scoped exception: `AnimatePresence` collapse/expand of variable-height sections may animate `height: 0 ↔ 'auto'`** when all three hold: (a) the animated element carries `overflow: hidden`, (b) duration ≤ 250 ms (`EXIT_DURATION`), (c) it is paired with an opacity fade. Everything else stays transform-only — progress/distribution fills are `scaleX` on a full-width inner element with `transformOrigin: 'left center'` (ProgressBar, EffortGrid, SubTaskModal checklist fill; AgentDistributionBar = static flex-basis segments + one container `scaleX`). | `height: 0 → 'auto'` is the one pattern Framer cannot express via transform; the codebase had accreted unsanctioned copies (GroupTasksTab, MyTasksCalendarView, SubTaskModal — all now compliant). Legacy unmounted `PersonalTasksTab.tsx` deleted (also clears L-02). Design audit M-03 / M-04. | — |
| 2026-06-11 | §10.1 #05 | "No animation above 500 ms except liaBreathe" vs DNA §14.3 (800 ms route-progress crawl) and §16.7 (600–800 ms chart draws) — internal contradiction | **Ceiling confirmed at 500 ms (`--duration-page` / `PAGE_DURATION` in `motion.ts`) for all component animation.** Exactly two spec'd surfaces may exceed it: the §14.3 route-level progress bar phase model and §16.7 Recharts draw animations — nothing else inherits their licence. The four 0.9 s in-panel perf refetch bars and the two 0.6 s fills re-timed to `PAGE_DURATION`. Inline spring/easing constants swept onto `motion.ts`. | In-panel refetch bars are component animation, not the route progress bar — they need no exception, just re-timing; the DNA contradiction needed one written resolution. Design audit M-05 / L-01 / DOC-06. | — |
| 2026-06-11 | S (data retention) | — (undocumented) | **`lead_raw_payloads` PII retention recorded as a deliberate decision (security audit F-5):** the immutable ingestion log intentionally stores the **faithful raw webhook envelope**, including lead PII (name/phone/email). `sanitizeRawPayload()` (`lead-ingestion.ts`) strips exactly one Pabbly-internal envelope key (`res2`) — it is an envelope cleaner, **not** a PII scrubber, and must never silently become one: a redacted log defeats the table's audit/replay purpose. Containment relied on instead of redaction: RLS SELECT is admin/founder-only, writes are admin-client-only from the webhook pipeline, the table is append-only. | PII living in a second place beyond `leads` must be a decision, not an oversight (audit F-5). A retention/soft-delete window is deliberately deferred to the clients module, when data-lifecycle requirements land and the window can be set against real compliance needs instead of guessed. | — |
| 2026-06-11 | Q-12 → §0 | Q-12 was one row buried mid-file in the code-quality table; duplication kept happening — agents copy-pasted already-built components/services despite the rule | **Reuse promoted to Section 0:** the law (R-01), registry-by-reference (R-02), no copy-paste forks (R-03), deleted forks stay deleted (R-04), plus the repeat-offender table naming the most-duplicated helpers. Q-12 retained as a pointer so existing references resolve. | A process instruction ("search first") without a lookup table was not stopping duplication — the #1 recurring violation in the codebase. The fix is making reuse the first section read and naming the exact canonical implementations. | — |
| 2026-06-11 | Q-13 | "Never accept a caller-supplied scope parameter in a SECURITY DEFINER function" (absolute) | Rewritten to the **two-tier model**: self-scoped (auth.uid()-derived, `authenticated` GRANT, session client) or revoked (scope params, EXECUTE REVOKEd — migration 0102 — admin client with session-derived args). A scope-param RPC with a live `authenticated` GRANT is the violation. | Security-audit F-1 closure sanctioned 11 scope-param RPCs via REVOKE; the absolute form no longer described the shipped (and correct) posture. | — |
| 2026-06-11 | A-17, A-18, P-09, Q-18, V-13 | Conventions enforced in review but living only in CLAUDE.md files | Codified: `m as motion` import (A-17), `requireProfile()` guard (A-18), React `cache()` vs `unstable_cache`+`cookies()` (P-09), `mapRows` typed boundary with the 4 grandfathered casts (Q-18), motion constants from `motion.ts`/tokens (V-13). | These are structural, already-shipped conventions with real failure modes (dev throw, auth drift, runtime cache error, BigInt/type drift, easing drift). The constitution must contain them, not just the command layer. | — |
| 2026-06-11 | §8 never-list | "NEVER write useEffect for data fetching" and "NEVER do background work in an API route handler" stated absolutely; 4 lines duplicated | Reworded: the sanctioned client fetch **is** a Server Action inside `useEffect` (P-01/Q-15) — the prohibition is on direct Supabase fetches; post-response `after()` work is sanctioned (A-16) — the prohibition is on fire-and-forget and on >3s/retry work outside Trigger.dev (A-12). List deduped and grouped by theme. | Two never-lines contradicted the codified patterns — an agent obeying the list verbatim was steered away from the correct implementation. A constitution that contradicts itself trains readers to ignore it. | — |
| 2026-06-11 | S-15, S-16, D-01 | Stated as live rules | Marked **forward contracts** with the currently-enforced subset named: S-15/S-16 → S-14 + `requireProfile` gating + append-only logs today, two-actor flow later; D-01 → binds the Elaya build (vision), nothing sends data to external models today. | Aspirational rules stated as fact erode trust in the enforced ones. The doc now distinguishes law from target posture explicitly. | — |
| 2026-06-11 | S-17, A-05, A-11, A-12, Q-06, §7 | Aspirational rate limiting; fictional `features/` paths; absolute append-only claim; "security checklist" with no home; invented filename examples | S-17 names the shipped `createRateLimiter()`/`safeSecretCompare()` (audit F-4); A-05 uses real `components/<feature>/` paths; A-11 names its two documented exceptions; A-12 cross-references the A-16 `after()` carve-out; Q-06 points at the deploy checklist in `operations/deployment.md` + binding deploy-order notes; §7 examples are real files (`useWidgetData.ts`, `task-schemas.ts`, `_auth.ts` convention). | Full verification sweep against the 2026-06-11 codebase — every rule now describes something that exists or is explicitly marked forward. | — |
| 2026-06-11 | M (layout-property) | Scoped exception: `AnimatePresence` height 0↔auto collapse (logged earlier today) | **Exception retired the same day:** `<CollapseReveal>` (`components/ui/CollapseReveal.tsx`) is THE expand/collapse primitive — `grid-template-rows 0fr↔1fr` + opacity, no `height` keyword. The five height-animation sites compose it; zero height/width animations remain anywhere. Never-Do list and Section 0 now point at the primitive. Also from the same design-engineering pass: `MotionConfig reducedMotion="user"` is global in `MotionProvider` (A-17); the dead `--transition-layout` token is deleted. | The grid-template-rows technique expresses collapse without animating a layout property at all — a retired exception is stronger than a scoped one. Design-engineering audit, 2026-06-11. | — |
| 2026-06-12 | V-14 | Responsiveness lived only in DNA §9 (law) + decision-log D-1…D-5 (implementation contract) — the constitution had no rule | Codified V-14 + five Never-Do lines: `useMediaQuery`/`MQ` for JS viewport branches (never raw `matchMedia`/`innerWidth`); responsive behaviour in shared primitives (`.serene-shell*`, `.serene-dossier-grid`+`--340`, `.serene-board`, `.serene-touch`, FilterBar, table card-stack, Dialog bottom-sheet `<md`), page classes for chrome only; column counts in classes only (inline `gridTemplateColumns` kills `md:`/`lg:` variants — the F2 campaign-strip bug); `dvh` never `vh`; persisted layouts never drive narrow rendering. | Responsive rollout F1–F5 closed (`docs/audits/2026-06-responsive-audit.md`); without a constitution rule the contract would erode one inline style at a time. | — |
| 2026-06-12 | P-02 | API routes limited to the two webhooks + the auth callback | **Adds `/api/elaya/chat`** — the one Elaya SSE streaming endpoint (Elaya foundation build). Session-authenticated via `getCurrentProfile()` (A-01), burst-rate-limited via `createRateLimiter()` (S-17), Zod-first (S-01), daily message cap enforced server-side before any model call. Every non-streaming Elaya operation stays on services/actions. | Server Actions cannot stream token deltas; chat requires SSE. A new route per future AI surface is NOT implied — streaming AI responses share this endpoint family, everything else uses actions. | — |
| 2026-06-12 | D-01 | "No AI integration ships before the vault exists" (forward contract) | **Elaya foundation ships with the PII gateway as the interim D-01 mechanism:** every tool result passes `maskPii()` (`lib/elaya/pii.ts`) before serialization to the model — light mode default (phones keep last 4 digits, emails keep first char + domain), depth configurable via the `elaya_settings.pii_masking_depth` row. The vault (reversible pseudonymisation) remains the target posture and mounts at the same gateway when it lands. | The foundation must exist for any AI feature to ship; the gateway gives D-01 a real enforcement point on day one instead of an unenforced promise, and concentrates the future vault integration in one module. | — |
