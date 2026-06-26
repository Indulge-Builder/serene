# Serene — Engineering Rules & Conventions (Claude Project digest)

> Digest of `docs/rules/The_Rules.md` (the engineering constitution) + the code-adjacent `CLAUDE.md`
> files (`src/lib/`, `src/lib/actions/`, `src/lib/services/`, `src/components/`,
> `supabase/migrations/`, `src/app/`). The root `CLAUDE.md` carries the 12-rule command-layer summary
> and the Never-Do list; this file is the fuller constitution with rule IDs preserved. When a code
> change is in question, these are the laws it must satisfy.

## Section 0 — Reuse First (the DRY law; the #1 violation in this codebase)

The most common mistake here is not a bad pattern — it's a **second copy of a good one**. Always
search by **behaviour**, not filename ("date picker", not `DatePicker`; "who can I assign this to",
not `getAssignableUsers`).

- **R-01** One behaviour → one implementation → one home. Search before creating anything.
- **R-02** The registry is law by reference. The "THE x" entries in the `CLAUDE.md` files and the root
  File-Locations table are the **only** implementations allowed.
- **R-03** Never copy-paste a module as the starting point for a "new" one — extend the original.
- **R-04** Deleted forks stay deleted. Re-introducing a consolidated parallel version is a violation.

### Canonical shared-helper registry (use these; never fork them)

| Behaviour | Canonical | Note |
|-----------|-----------|------|
| Session/role guard | `requireProfile(roles?)` — `lib/actions/_auth.ts` | A-18; both no-session and wrong-role return one `unauthorized` |
| Assignable-users list | `getAssignableUsers()` / `getAssignableUsersAction()` | "who can I assign this to" |
| Lead Redis invalidation | `invalidateLeadCaches(site, lead, scope)` — `lib/services/lead-cache.ts` | P-08; dual-key, awaited before revalidate |
| Confirm dialog | `<ConfirmDialog>` | never `window.confirm`, never hand-rolled |
| List-page filter bar | `<FilterBar>` + `useUrlFilters` | extend, never fork |
| Anchored dropdown/panel | `usePortalAnchor()` + `<FloatingPanel>` | the portal-escape fix |
| Expand/collapse | `<CollapseReveal>` (grid-template-rows 0fr↔1fr) | never animate `height: 0↔auto` |
| Empty state | `<EmptyState>` | Playfair italic; never "No data available" |
| Loading scaffold | `PageSkeletons` exports | compose, never re-inline |
| Labelled stat tile | `<StatTile variant="card"\|"cell">` | |
| Task-form fields | `TaskFormFields` (priority chips, due presets, type radios) | all create-task modals compose these |
| Dashboard widget data | `useWidgetData()` + `effectiveWidgetDomain()` | manager pinned to own domain |
| Heavy-modal mount latch | `useMountOnFirstOpen(open)` | lazy chunk, exit animation preserved |
| Debounce | `useDebounce()` | |
| Viewport/media query | `useMediaQuery` + `MQ` — `hooks/useMediaQuery.ts` | never raw matchMedia/innerWidth (V-14) |
| IST day/week/month math | `lib/utils/ist.ts` | never re-fork UTC+5:30 |
| Date/count/currency format | `lib/utils/dates.ts`, `numbers.ts` (`formatDate`, `formatCount`, `formatCompact`, `formatCurrency`) | never `.toString()` on raw values |
| Initials / colour pick | `getInitials()` / `hashString()` — `lib/utils/strings.ts` | |
| Text sanitize | `sanitizeText()` — `lib/utils/sanitize.ts` | S-02; every user text before DB write |
| Phone normalize | `normalizeToE164()` / `normalizeWaPhone()` — `lib/utils/phone.ts` | S-03; all phones stored E.164 |
| Chart colour resolve | `useChartTokens()` / `resolveColorMap()` | V-12; never pass a CSS var to a Recharts fill/stroke |
| Cartesian chart frame | `ChartFrame` + `cartesianDefaults()` | composes for Area/Line/Bar |
| Motion timing | `lib/constants/motion.ts` (`ENTER_DURATION`, `EXIT_DURATION`, `PAGE_DURATION`, `EASE_OUT_EXPO`, `SPRING_CONFIG`) | V-13; never inline a bezier/spring |
| String-enum factory | `defineEnum()` — `lib/constants/define-enum.ts` | Q-02; derives values/labels/options/zodEnum so they can't drift |
| Typed row boundary | `mapRows<TRow, TOut>()` — `lib/utils/rows.ts` | Q-18; no new `as Record<string, unknown>` casts |
| Joined-profile shapes | `WithAuthor<T>` / `WithAssignee<T>` / `WithActor<T>` — `lib/types` | never a fresh intersection |
| Webhook JSON / rate-limit / secret | `readJsonBody()` / `createRateLimiter()` / `safeSecretCompare()` — `lib/utils/webhook.ts` | validate credential BEFORE reading body |
| CSV/XLSX export | `lib/utils/export.ts` | client-side only; never imported by actions/services |
| Voice dictation cluster | `<DictationButton>` | all four voice surfaces compose it |
| Notification fan-out | `createNotification()` | the chokepoint: in-app row + push, both or neither |
| Web Push sender | `dispatchPush()` | non-fatal; dead-endpoint prune mandatory |
| Transcription | `transcribeAudio()` — `transcription-service.ts` | the SOLE Deepgram call, server-only |
| Template WhatsApp sends | `sendGupshupTemplate()` | one fetch, one log-row-per-attempt, for all 7 templates |
| Lead-assignment notify | `notifyLeadAssigned()` | the single entry for all 4 assignment paths, inside `after()` |
| Lead core mutations | `*Core()` in `lead-mutations.ts` | actions AND Elaya tools reuse |
| Task core mutations | `*Core()` + `canMutateTask` + `isAssigneeActive` in `task-mutations.ts` | |
| Domain-scope resolver | `resolveDomainParam(searchParams, cookieStore, role)` — `lib/utils/domain-scope.ts` | the ONE global selector |

## Section 1 — Architecture (A-rules)

- **A-01** Authorization reads **only** from `public.profiles`. JWT claims never trusted.
- **A-02** Server Actions are the only client→DB mutation path.
- **A-03** All DB queries go through `lib/services/`. No raw Supabase in components or actions.
- **A-04** `components/ui/` imports types only — never functions/actions/hooks/services from features.
- **A-05** No cross-feature imports. Cross-feature data flows through `lib/` only.
- **A-06** UI components are display-only. Zero business logic, zero DB calls, zero decisions.
- **A-07** One table, one responsibility.
- **A-08** Every new table enables RLS in its migration.
- **A-09** Two-layer security always (RLS at the DB **and** the server action). Never rely on one.
- **A-10** Every `SECURITY DEFINER` function has `SET search_path = public`.
- **A-11** Log/activity tables are append-only. **Two documented exceptions:** WhatsApp delivery-receipt
  status, and `task_remarks` suppression flags (admin/founder). New exceptions need a Decision Log entry.
- **A-12** Async work >3s or needing retry → Trigger.dev. Sub-3s post-response → `after()`. Nothing
  heavier in route handlers/actions.
- **A-13** Dashboard protected at three layers (proxy → layout guard → `canAccessRoute` over
  `DOMAIN_ROUTE_MAP`). There is **no** `src/middleware.ts` — the proxy is `src/proxy.ts`.
- **A-14** Never edit a migration that has already run in production. Write a new one.
- **A-15** `'use client'` components never `import` a value symbol from `lib/services/` (it pulls
  `next/headers` into the client bundle and hard-errors). Call a Server Action instead. `import type`
  is safe.
- **A-16** Outward network sends that must complete use `after()` + an awaited send — never
  `void fetch().catch()` (Vercel freezes the lambda on response flush → silent loss; the 2026-06-08
  outage). Routes carrying sends export `maxDuration`.
- **A-17** Framer Motion is always `import { m as motion } from 'framer-motion'`. `<MotionProvider>`
  (LazyMotion strict + async domMax + `MotionConfig reducedMotion="user"`) is mounted once in the root
  layout; the bare namespace throws.
- **A-18** Every session-based Server Action begins with `requireProfile(roles?)`. **Exceptions:**
  `sla.ts` (Trigger.dev, no session), `loginAction` (`is_active` read), four `tasks.ts` actions
  (parallel-fetch optimization).

## Section 2 — Security (S-rules)

- **S-01** Every Server Action validates input with Zod **before** touching the DB. First line.
- **S-02** All user text passes `sanitizeText()` before any DB write.
- **S-03** All phones stored E.164 via `normalizeToE164()`.
- **S-04** Never spread a raw request body into an insert — whitelist via Zod.
- **S-05** Never expose raw Postgres/Zod errors to the UI. Log server-side with a `[module-action]`
  prefix (Sentry is NOT wired).
- **S-06** Never trust a client-supplied ID without verifying ownership/access.
- **S-07** No sequential integer IDs in URLs — UUIDs/slugs only.
- **S-08** No sensitive data in URL query params.
- **S-09** Auth errors never reveal whether an email exists; in-app, `requireProfile` returns one
  unified `unauthorized`.
- **S-10** Tokens/auth codes/secrets never logged.
- **S-11** `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `*_KEY`/`*_SECRET`/`*_TOKEN` are
  server-only. `NEXT_PUBLIC_` only if genuinely public.
- **S-12** Every webhook validates its credential **before** reading the body.
- **S-13** No `dangerouslySetInnerHTML` anywhere.
- **S-14** Users cannot update their own `role`/`domain` (server-controlled).
- **S-15 / S-16** Forward contracts: separation of duties + second-actor approval for privilege
  changes (admin/founder-gated + audited today; never ship self-approval UI).
- **S-17** Webhook routes are rate-limited (`createRateLimiter`) and compare secrets timing-safe
  (`safeSecretCompare`).

## Section 3 — Data & Privacy (D-rules)

- **D-01** No raw PII reaches an external AI model. **Interim (Elaya):** every tool result passes
  `maskPii()` before serialization.
- **D-02** No hard deletes on leads/profiles/notes/activity — soft-delete with `archived_at`/`deleted_at`.
- **D-03** Every status change, assignment, note, role/domain change, and failed auth is logged.
- **D-04** Full PII never in log messages — record IDs only. (WhatsApp notification logs keep last-4
  phone digits; `lead_raw_payloads` is the one deliberate raw-PII store, a logged decision.)
- **D-05** AI prompt contents containing client data are never logged.
- **D-06** No session tokens/auth codes in any log.

## Section 4 — Performance (P-rules)

- **P-01** Server-Components-first. Client widgets fetch via a Server Action inside `useEffect` — never
  bare Supabase in `useEffect`, never React Query.
- **P-02** No API routes except the two webhooks, `/api/auth/callback`, `/api/elaya/chat` (SSE), and
  `/api/manifest` (PWA carve-out). All mutations are Server Actions.
- **P-03** Any list >~100 rows is bounded server-side (`.range()` / cursor RPC). Keyset cursors over
  nullable columns must be composite.
- **P-04** Images in scroll containers use `loading="lazy"`.
- **P-05** No scroll listeners for UI logic — `IntersectionObserver`.
- **P-06** Realtime subscriptions always include a filter + a mount-scoped `useId()` nonce; cleanup is
  `supabase.removeChannel(channel)` (unsubscribe alone leaks).
- **P-07** No stray `console.log`. Permitted: `[module-action]`-prefixed `warn`/`error` for non-fatal
  server failures.
- **P-08** Every `redis.del` in an action is awaited in try/catch (logged warn) **before**
  `revalidatePath`/`revalidateTag`. Lead actions use `invalidateLeadCaches` (structural). Dashboard
  volume keys are TTL-only by design.
- **P-09** `unstable_cache` closures cannot touch `cookies()`/`headers()` — a service using the session
  client can't be wrapped; use React `cache()` instead.

## Section 5 — Design & Visual (V-rules)

- **V-01** Every colour is a CSS var from `design-tokens.css`. (Sanctioned exceptions: the chart
  `FALLBACK` palette pre-paint, and `--status-{name}-solid` fills.)
- **V-02** `--theme-accent-fg` on buttons/accent fills — never `--theme-text-inverse`.
- **V-03** Animation ceiling 500ms; only liaBreathe (3s) + route progress + chart draws exceed it.
- **V-04** No `font-bold` (700); `--weight-semibold` (600) is the max.
- **V-05** No z-index outside the `--z-*` scale.
- **V-06** No backdrop-blur except TopBar, mobile sidebar overlay, command palette.
- **V-07** No mixed radii within one component.
- **V-08** No skeleton under 150ms.
- **V-09** Empty states are Playfair-italic via `<EmptyState>`.
- **V-10** Micro labels are exactly `text-[10px] font-medium uppercase tracking-[0.12em]
  text-[--theme-text-tertiary]`.
- **V-11** No one-edge coloured border as a category/status indicator — pills/dots/icons/badges.
- **V-12** Never pass a CSS var to a Recharts `fill`/`stroke` — resolve via `useChartTokens()`.
- **V-13** Motion values come from `motion.ts` / `--duration-*`/`--ease-*` tokens — no inline beziers.
- **V-14** Responsiveness: Tailwind-default breakpoints; client-JS branches via `useMediaQuery`+`MQ`
  only when behaviour differs; responsive shells live in shared primitives; never combine inline
  `gridTemplateColumns` with responsive grid classes; full-height surfaces use `dvh`; persisted layouts
  never drive the narrow rendering.

## Section 6 — Code Quality (Q-rules)

- **Q-01** No `any` (one carve-out: an `.rpc()` not yet in generated types — cast + disable comment,
  then regenerate `database.ts`).
- **Q-02** No magic strings — domain/role/status values are typed enums via `defineEnum()`.
- **Q-03** Server Actions return `{ data, error }`. Never throw, never void. Components handle both.
- **Q-04** User-facing errors come from `lib/validations/form-errors.ts` — never raw Zod, never
  "Invalid input." Never clear a form field on validation error.
- **Q-05** No npm package without a `docs/changelog.md` justification.
- **Q-06 / Q-06a** Every meaningful change gets a `docs/changelog.md` entry (single source of truth);
  no deploy without the deploy checklist passing (migration deploy-order warnings are binding).
- **Q-07** Drag-to-reorder always uses `@dnd-kit` — never react-beautiful-dnd or hand-rolled listeners.
- **Q-08** Column-pref hooks follow `useLeadColumnPreferences` exactly: key `serene:[module]:columns:${userId}:v1`.
- **Q-09** `COUNT(*)` returns `bigint` — cast with `Number()` in the service; format via
  `formatCount`/`formatCompact` in components.
- **Q-10** `decodeURIComponent` in route handlers is wrapped in `try/catch → notFound()`.
- **Q-11** Every `switch` over a union is exhaustive with `assertNever(x)` — no `default` branch.
- **Q-12** (promoted to R-01.)
- **Q-13** SECURITY DEFINER RPCs are two-tier: *self-scoped* (derive scope from `auth.uid()`, keep
  `authenticated` grant) vs *revoked* (scope params, EXECUTE revoked, admin-client only with
  session-derived args). A scope-param RPC with a live `authenticated` grant is a violation.
- **Q-14** Realtime channel names include a `useId()` nonce: `table-${id}-${mountId}`.
- **Q-15** Initial data fetch in a client component lives in `useEffect`, never a render-phase guard
  (`startTransition` is a side effect).
- **Q-16** `unstable_cache` keys include every scoping dimension (domain, userId). Revalidate via
  `revalidateTag(tag, { expire: 0 })` (Next.js 16 two-arg form).
- **Q-17** Two domain registries — `APP_DOMAINS` + `DOMAIN_LABELS` (full platform enum) vs
  `GIA_DOMAINS` (the four Gia sales domains). Never mix; labels always via `DOMAIN_LABELS`.
- **Q-18** Untyped query results cross into typed code only via `mapRows<TRow,TOut>()`; joined-profile
  shapes use `WithAuthor`/`WithAssignee`/`WithActor`.

## File & naming conventions

```text
Components   PascalCase.tsx     Actions   kebab-case.ts (_-prefix = internal helper, e.g. _auth.ts)
Services     kebab-case.ts      Hooks     camelCase.ts (use*)        Utils  kebab-case.ts
Validations  kebab-case.ts      Constants kebab-case.ts              Pages/Layouts  page.tsx/layout.tsx
```

## Notable code-adjacent conventions (not numbered, still binding)

- **Browser Supabase client is a singleton;** Realtime teardown **must** call `removeChannel` (not
  `unsubscribe` alone).
- **Composite cursor** for keyset pagination over a nullable sort column (encode the nullable column +
  a stable tiebreaker, e.g. `{ completed_at, id }`).
- **Lead follow-up tasks** (since 0138) are a `personal` task + a `task_gia_meta` link row (the meta
  row IS the link); `create_lead_gia_task` is the single writer of both.
- **`cold_lead_cutoff()`** (STABLE SQL, `now() - 5 days`) is the one source of the cold threshold,
  mirroring `COLD_LEAD_THRESHOLD_DAYS`.
- **Template-send core (`sendGupshupTemplate`)** owns the fetch, the delivered check, and the
  one-log-row-per-attempt `finally { await logNotification }` — the log must be durable before the
  lambda can freeze; fire-and-forget wrappers don't throw unless `throwOnError` (only
  `sendLeadInitiationMessage`).
- **Heavy modals** load via `next/dynamic` at module scope (`ssr:false`) + `useMountOnFirstOpen` when
  permanently mounted (preserves the exit animation); type exports stay `import type`.
- **List rows** `LeadRow`/`GroupRow`/`CalendarTaskRow` are `memo()`-ised — keep their props
  primitive/stable; don't blanket-memo other components.
- **`SectionCard`** wraps every section on a detail page — never inline the chrome.
- **The SW (`public/sw.js`)** never caches RSC payloads, Server Action responses, or navigation
  responses — network-first; only the static shell + icons are cached.

## Decision Log highlights (engineering)

Deals promoted to a first-class table (0072–0074). `after()` + awaited send, never
`void fetch().catch()` (2026-06-08). `redis.del` awaited before `revalidatePath` (P-08). Two-tier RPC
scoping (Q-13, 0102). `/api/elaya/chat` SSE carve-out + the Elaya `maskPii` interim D-01 (2026-06-12).
Responsiveness codified (V-14, 2026-06-12). Deal `deal_type` domain-derived (2026-06-15). Task events +
the 3 oversight RPCs (0144, 2026-06-24). Lead phone canonical-key + active-phone UNIQUE index (0137).
The full log with rationale is in `docs/rules/The_Rules.md`.
