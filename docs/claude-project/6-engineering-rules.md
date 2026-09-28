# Serene: Engineering Rules and Conventions (Claude Project digest)

> **Purpose:** the engineering constitution in one read: Reuse First and the canonical-helper registry, the A/S/D/P/V/Q rules with their IDs, the rules for working across schemas, and the conventions a code change must obey.
> **Audience:** a Claude Project chat that cannot read the repo, and the engineers who use it.
> **Source-of-truth scope:** a digest. The law is `docs/rules/The_Rules.md` (rules plus the Decision Log). The root `CLAUDE.md` carries the 12-rule command layer, the Never-Do list and the File Locations registry (R-02 makes that registry law); upload it beside this pack. Migration conventions: `docs/architecture/migrations.md`. Design law: `4-design-essentials.md`.
> **Last verified:** digested 2026-09-26 from `The_Rules.md`, `migrations.md`, `database.md`, `auth-and-rbac.md`, `trigger-dev.md` and `deployment.md` as refreshed that day; the helper names in the registry below were spot-checked in `src/` the same day.

## What a machine enforces (not just review)

- **`pnpm build` = `node scripts/check-tokens.mjs && next build`.** The token guard fails the
  build on any `var(--…)` no sheet defines. It bit hard in September: a token defined only in
  another session's uncommitted file (`--neu-shadow-shell`) failed every production build for three
  days (2026-09-21 to 09-24) and nothing pushed went live. The space scale skips 9: `var(--space-9)`
  does not exist.
- **ESLint 9 flat config** (`pnpm lint`, deliberately not in the build), correctness only. Errors:
  a bare `import { motion } from 'framer-motion'` (A-17), `window.confirm` / `alert`, any
  `@supabase/*` import outside `src/lib/supabase/` (Rule 05; type imports allowed),
  `@anthropic-ai/sdk` outside the Anthropic adapter, and (since 2026-09-17) an unscoped
  `.from('<table>')` on a table moved to `gia` or `member`. It cannot see an embed inside a select
  string: after a schema move, sweep those by hand.
- **`pnpm check:ui`** = the token guard, the control baseline (`pnpm audit:ui -- --check` rejects
  new native controls with local styling) and the component contract tests.
- **TypeScript strict**, `pnpm tsc --noEmit` at zero errors. `src/lib/types/database.ts` is
  generated across `public, gia, member, sia, freshdesk` (never `elaya_read`) with a hand-written
  tail of derived types that a regen must keep byte-identical.

## Section 0: Reuse First (the most-broken law here)

The common mistake in this codebase is not a bad pattern, it is **a second copy of a good one**.
Search by behaviour, not by filename ("who can I assign this to", not `getAssignableUsers`).

- **R-01** One behaviour, one implementation, one home. Near-equivalent exists → extend it.
- **R-02** The registry is law by reference: anything marked "THE x" in the root `CLAUDE.md`
  File Locations table or `src/lib/CLAUDE.md` / `src/components/CLAUDE.md` is the only allowed
  implementation.
- **R-03** Never copy-paste a module as the start of a "new" one. Extend it with a prop, option or
  parameter (an additive optional prop beats a fork: `Carousel hideControls`, `Table previewRows`).
- **R-04** Deleted forks stay deleted (the IST math forks, `chart-tokens.ts`, the dashboard
  `*ForDomainAction` twins, the arc `Spinner`, `RouteVeil`, `ComboboxDropdown`).

### The canonical helper registry (selected; the full list is the root `CLAUDE.md`)

#### Guards, gates and access predicates

| Behaviour | Canonical |
| --- | --- |
| Session and role check in an action | `requireProfile(roles?)`, `lib/actions/_auth.ts` (A-18); `actorFromProfile(profile)` maps to the `MutationActor` every core takes |
| Zod parse → user copy | `parseActionInput(schema, input)`, `lib/actions/_validation.ts`; shared fragments `uuidField` / `emailField` in `lib/validations/fields.ts` |
| May this person use Elaya at all? | `hasElayaAccess(profile)`, `lib/utils/route-access.ts` (`ELAYA_DOMAINS`: concierge + the Gia domains, plus admin, founder, the tech workbench; mirrored in Python by `has_elaya_access`) |
| May they see this member / its money / the vault? | `canAccessMember`, `canSeeMemberFinance`, `canUseMemberVault` in `lib/elaya/access.ts` |
| May they see this Sia group or Freshdesk ticket? | `getSiaViewerScope()` + `canViewSiaGroup()` + `pinnedGroupFilter()`, `lib/services/sia-access.ts`. Never a bare role check on `/sia` or `/freshdesk`, never a group id trusted from the browser |
| May this principal see this lead? | `canAccessLead`, `lib/elaya/access.ts` |
| Vendor pages / vendor writes | `hasVendorAccess` / `hasVendorActionAccess` (`requireVendorAccess()` in every vendor action) |
| Route reachability | `canAccessRoute(profile, pathname)` over `DOMAIN_ROUTE_MAP` (reachability only; the page gate decides) |
| Safe post-login redirect | `safeReturnPath(value)`, `lib/utils/return-path.ts` |

#### Data access and mutation seams

| Behaviour | Canonical |
| --- | --- |
| A query on a table outside `public` | `giaDb()` / `memberDb()` / `handsDb()` in `lib/supabase/schemas.ts`; `freshdeskDb()` in `freshdesk-sync.ts` (`sia` has no helper yet) |
| Lead ↔ task read across `public` and `gia` | `getTaskIdsForLead()` / `getGiaLinksForTasks()` / `isLeadTask()`, `lib/services/gia-task-links.ts` |
| Revoked-tier RPC | `callAdminRpc`; `callAdminRpcChecked` when "the search died" must differ from "found nothing"; `callAdminRpcAll` to page past the 1,000-row cap (`services/rpc-helpers.ts`) |
| Redis cache-aside | `withRedisCache(key, ttl, fetchFn, normalize?)`, `services/cache-helpers.ts` |
| Lead cache invalidation | `invalidateLeadCaches(site, lead, scope)`, `services/lead-cache.ts` (P-08) |
| Any lead mutation | the cores in `services/lead-mutations.ts` (`addLeadNoteCore`, `addLeadCallNoteCore`, `createLeadTaskCore`, `updateLeadStatusCore`, `assignLeadCore`, `recordDealCore`, `reviveLeadCore`) |
| Task, vendor, member, ticket writes | the cores in `task-mutations.ts` (+ `canMutateTask`), `vendor-mutations.ts`, `member-mutations.ts`, `ticket-mutations.ts` (over `sia.create_ticket` / `apply_ticket_change`, never a direct write). Actions AND Elaya tools call the same core |
| Creating a Serene account | `createStaffAccountCore()`, `services/staff-account-mutations.ts`; never `auth.admin.createUser` elsewhere |
| Activity feed emit | `emitActivityEvent` / `emitLeadActivityEvent` (lead and deal cores emit; task rows derive inside `emitTaskEvent`) |
| Typed boundary for untyped rows | `mapRows<TRow, TOut>()`, `lib/utils/rows.ts` (Q-18); `WithAuthor` / `WithAssignee` / `WithActor` |
| Assignable users | `getAssignableUsers()` / `getAssignableUsersAction()` + `AssignableUser` |
| Global domain scope | `resolveDomainParam(searchParams, cookieStore, role)`, `utils/domain-scope.ts` |
| Notification fan-out and gate | `createNotification()` (in-app row + push, optional `notificationKey`); `resolveChannels` / `isChannelEnabled` / `filterRecipientsByPref` (absence = ON, fails open) |
| Trigger.dev cancel | `cancelRunsByTag(tag)`, `lib/trigger/cancel-runs.ts` (outside `src/trigger` on purpose) |
| Model calls | `resolveLlmForJob(tier)` + `complete()` in `lib/elaya/`; `maskPii()` on every result; `openVault()` (`member-profiler.ts`) for member chat |

#### Utilities

| Behaviour | Canonical |
| --- | --- |
| IST boundaries | `lib/utils/ist.ts` (never re-fork UTC+5:30) |
| Dates, counts, currency | `utils/dates.ts` (`formatDate`, ISO text ↔ Date helpers), `utils/numbers.ts` (`formatCount`, `formatCompact`, `formatCurrency`, `formatCurrencyCompact`) |
| Sanitize, phone | `sanitizeText()` (never on a password), `normalizeToE164()` |
| Campaign key | `normalizeCampaignKey()` (names are displayed raw) |
| Initials, colour hash | `getInitials()`, `hashString()` |
| Webhook guards | `readJsonBody()`, `createRateLimiter()`, `safeSecretCompare()` in `utils/webhook.ts` |
| Model text out | `markdownToWhatsApp()` (WhatsApp), `<ChatMarkdown>` (in-app) |
| Bounded parallel work | `mapWithConcurrency()`, `utils/concurrency.ts` (never a hand-rolled pool or p-limit) |
| CSV | `rowsToCsv()` server-side (`utils/csv.ts`); `utils/export.ts` is browser-only |
| Vault crypto | `encryptSecret` / `decryptSecret`, `utils/vault-crypto.ts` (never log a plaintext) |
| Motion values | `lib/constants/motion.ts` (V-13) |
| String enums | `defineEnum()` |

**UI primitives** (the design files list the rest): `ConfirmDialog` (never `window.confirm`),
`toast.undo` (reversible deletes), `FilterBar` + `useUrlFilters`, `usePortalAnchor` +
`FloatingPanel`, `CollapseReveal`, `MotionRow`, `EmptyState`, `PageSkeletons`, `Pagination`,
`Checkbox` / `DatePicker` / `FormSelect` (never a native checkbox, date, month or select),
`Field` family, `Button` / `SelectionButton`, `CardHeader`, `StatTile` / `StatStrip` / `MetaLine`,
`RevealId`, `InlineEdit`, `SplitWorkspace` + `ConversationRailRow`, `DictationButton`,
`useWidgetData`, `useMediaQuery` + `MQ`, `useMountOnFirstOpen`, `useDebounce`, `Await`,
`useChartTokens` / `resolveColorMap`, `ChartFrame` + `cartesianDefaults`, `streamElayaChat`.

## Working across schemas (the 2026-09-17 lessons, now rules)

- Tables live in a schema per business (`gia`, `member`, `sia`, `freshdesk` beside `public`; see
  `7-data-model.md`). Code reaches a moved table only through its helper; eslint refuses an
  unscoped `.from()` on one.
- **PostgREST cannot embed across schemas** (PGRST200, and the page quietly renders empty). A moved
  table that needs a staff name embeds the `profiles` view in its own schema (`gia.profiles`,
  `member.profiles`); public code that needs a lead link reads through `gia-task-links.ts`. Never
  add a `task_gia_meta` embed onto a `public.tasks` query.
- **Functions stay in `public`** with `gia, member` appended to their search path (A-10), so
  `.rpc()` calls never change on a move.
- **Exposing a schema restates the whole list.** `pgrst.db_schemas` is replaced, not appended, and
  today must hold `public, graphql_public, sia, freshdesk, gia, member`. Migration 0245 nearly
  shipped a list without `gia` and `member` (caught in review, fixed in 9f486fc).
- **A move and its build are one release.** Twice on 2026-09-17 the SQL went out before the code
  and pages broke for minutes; the Python brain (its own client, `backend/app/core/supa.py`
  `_MOVED_TABLES`) broke for about two and a half hours. Every reader moves together: Vercel, the
  Trigger.dev bundle, the Python brain, scripts. Count rows before and after with
  `scripts/db/row-counts.ts`.

## Section 1: Architecture (A)

- **A-01** Authorization reads only `public.profiles`. `getClaims()` (the proxy and, since
  2026-09-16, `getCurrentProfile()`) is identity only; the profiles SELECT after it is the check.
- **A-02** Server Actions are the only client → DB mutation path. **A-03** All queries in
  `lib/services/`. **A-04** `components/ui/` imports types only. **A-05** No cross-feature imports.
  **A-06** Components are display-only. **A-07** One table, one responsibility.
- **A-08** RLS on every new table (partitions too). **A-09** Two layers: RLS and the action. Where
  data is read on the admin client (Sia `wag_*`, `freshdesk`, the member vault, Elaya's reads) the
  code gate is the boundary and RLS stays deny-by-default (Decision Log 2026-09-18).
- **A-10** Every SECURITY DEFINER function pins a `search_path` starting with `public`
  (`public, gia, member` where the body names a moved table).
- **A-11** Log and ledger tables are append-only. Named exceptions: `task_remarks` suppression
  flags, WhatsApp delivery receipts, the state-machine ledgers `elaya_actions` and
  `revival_candidates` (resolve-once admin UPDATE), `suggestions` status, and on
  `vendor_engagements`: `closeEngagementCore` (resolve-once), `refineEngagement` (fills NULLs only)
  and the `merge_vendors` fold (the one DELETE). `task_events`, `activity_events`, the subscription
  history and reveal tables, `draft_reviews`, `mcp_tool_calls`, `elaya_query_log` have no write
  policy at all. A new exception needs a Decision Log row first.
- **A-12** Work over 3 s or needing retry → Trigger.dev; short post-response sends → `after()`.
- **A-13** Three route layers: `src/proxy.ts` (there is no `src/middleware.ts`), the dashboard
  layout guard, `canAccessRoute()`. Since 2026-09-26 `/elaya` is no longer always-allowed: it asks
  `hasElayaAccess()`.
- **A-14** Never edit a migration that ran in production.
- **A-15** A `'use client'` file never imports a value from `lib/services/` (call an action).
- **A-16** Outward sends that must complete use `after()` with an awaited send, never
  `void fetch().catch()` (Vercel freezes the lambda on response). Routes with sends export
  `maxDuration`.
- **A-17** `import { m as motion } from 'framer-motion'`; `<MotionProvider>` mounted once.
- **A-18** Every session-based action starts with `requireProfile(roles?)`. Exceptions: `sla.ts`
  (Trigger.dev, no session), `loginAction` (the `is_active` read) and the parallel-fetch
  `tasks.ts` actions (`The_Rules.md` and `auth-and-rbac.md` name three:
  `updateTaskStatusAction`, `updateTaskAction`, `updateChecklistAction`; the root `CLAUDE.md` still
  says four).

## Section 2: Security (S)

- **S-01** Zod first, every action. **S-02** `sanitizeText()` on user text (never on a credential).
  **S-03** Phones E.164. **S-04** Never spread a raw body into an insert. **S-05** No raw DB or Zod
  errors in the UI; `[module-action]` console logs (Sentry is not wired). **S-06** Verify ownership
  of every client-supplied id. **S-07** No sequential ids in URLs. **S-08** Nothing sensitive in a
  query string. **S-09** One unified `unauthorized`. **S-10** Never log secrets. **S-11**
  `*_KEY` / `*_SECRET` / `*_TOKEN` are server-only.
- **S-12** Webhooks validate their credential before processing: leads = Bearer per sender
  (`PABBLY_WEBHOOK_SECRET`, `SHOP_APP_WEBHOOK_SECRET`); WhatsApp = `x-gupshup-secret`; Freshdesk =
  `x-freshdesk-webhook-secret`; the bridge = `BRAIN_API_SECRET` bearer; `/api/mcp` = a Supabase
  OAuth access token. Known departures: the leads route logs the raw payload before the bearer
  check on purpose (no Decision Log row yet), and the WhatsApp route reads the body before its
  secret compare.
- **S-13** No `dangerouslySetInnerHTML`. **S-14** Nobody changes their own role, domain, and since
  0243 their own `sia_role` or `queendom_id` (RLS pins all four). **S-15 / S-16** Separation of
  duties and second-actor approval are forward contracts. **S-17** Public routes ship with
  `createRateLimiter()` and `safeSecretCompare()`.
- **Stored secrets:** subscription passwords are pgcrypto ciphertext under a Vault key with an
  append-only reveal audit written first (fail closed). The member vault is AES-256-GCM in the app
  (key only in `MEMBER_VAULT_KEY`, member id as authenticated data, reveal trail written before
  the secret leaves); the table has no policy for signed-in users.

## Section 3: Data and privacy (D)

- **D-01** No raw PII reaches an external model. As built: every Elaya tool result passes
  `maskPii()` (depth from `elaya_settings.pii_masking_depth`). Since 2026-09-18 a partial vault is
  live for member chat: `openVault()` gives each group code names (`sia.codenames`), masks, and
  refuses the reading if a real name leaks; the profiler, ticket drafts, intake and the member
  judgement all use it. Sanctioned exceptions: raw audio to Deepgram (2026-06-12), and images or
  PDFs shown to the vendor extractor (2026-09-17; text is still masked, phones swapped for
  placeholders first).
- **D-02** Soft delete on leads, profiles, notes, activity. **D-03** Status, assignment, notes,
  role/domain changes and failed auth are logged. **D-04** No PII in logs (WhatsApp logs keep the
  last four digits; `lead_raw_payloads` is the one deliberate raw store). **D-05** Prompts with
  client data are never logged. **D-06** No tokens in logs.
- **DPDP:** the statutory machinery (consent records, WhatsApp opt-out, breach workflow, DSR,
  erasure) is still missing; obligations bite around May 2027. Any new PII design needs a consent
  and retention answer.

## Section 4: Performance (P)

- **P-01** Server Components first; a client widget fetches through a Server Action inside
  `useEffect`. No React Query.
- **P-02** Exactly nine API routes: `/api/webhooks/leads`, `/api/webhooks/whatsapp`,
  `/api/webhooks/freshdesk`, `/api/auth/callback`, `/api/elaya/chat` (SSE), `/api/elaya/bridge`
  (the Python brain's write and read bridge), `/api/manifest`, `/api/mcp` and
  `/.well-known/oauth-protected-resource`. Everything else is a Server Action.
- **P-03** Lists over about 100 rows are bounded server-side; composite keyset cursors over
  nullable columns. PostgREST also caps every response at 1,000 rows silently: page with a stable
  `ORDER BY`, return vocabularies as one array row, or count in SQL.
- **P-04** Lazy images. **P-05** `IntersectionObserver`, not scroll listeners. **P-06** Realtime
  with a filter, a `useId()` nonce, and `removeChannel()` on cleanup. **P-07** No stray
  `console.log`. **P-08** Every `redis.del` awaited in try/catch before `revalidatePath`
  (lead actions via `invalidateLeadCaches`). **P-09** Never wrap a session-client service in
  `unstable_cache` (there are zero call sites today); use React `cache()`.

## Section 5: Design (V), the coded subset

V-01 tokens only (sanctioned hex: the chart `FALLBACK` palette, the `SeedMandala` stops as token
fallbacks, the `NEU_CANVAS_*` manifest mirrors, `app/global-error.tsx`) · V-02 `--theme-accent-fg`
on accent fills · V-03 500 ms ceiling (ambient loops, chart draws, the boot are the exceptions) ·
V-04 no weight 700 · V-05 `--z-*` only · V-06 blur only on the mobile drawer backdrop, the command
palette scrim and the condensing page header (the TopBar is gone) · V-07 one radius per component
· V-08 skeleton at least 150 ms · V-09 empty states compose `<EmptyState>` (one anatomy since
2026-09-25) · V-10 the micro-label recipe · V-11 no single-edge coloured border as a signal · V-12
never a CSS var into a Recharts `fill` / `stroke` · V-13 motion values from `motion.ts` · V-14
responsiveness in shared primitives, `useMediaQuery` + `MQ`, `dvh`, persisted layouts never drive
the phone view. Full design law: `4-design-essentials.md`.

## Section 6: Code quality (Q)

- **Q-01** No `any` (one carve-out: an `.rpc()` not yet in the generated types, until the regen).
- **Q-02** No magic strings; `defineEnum()` for simple enums.
- **Q-03** Actions return `{ data, error }`; never throw or return void.
- **Q-04** User errors from `lib/validations/form-errors.ts`; never clear a field on error.
- **Q-05 / Q-06a** Every package and meaningful change gets a `docs/changelog.md` entry.
  **Q-06** No deploy without the checklist in `docs/operations/deployment.md`.
- **Q-07** Drag-to-reorder uses `@dnd-kit`. **Q-08** Column prefs follow
  `useLeadColumnPreferences` (`serene:[module]:columns:${userId}:v1`).
- **Q-09** `COUNT(*)` is bigint: `Number()` in the service. **Q-10** `decodeURIComponent` in a
  route is try/catch → `notFound()`. **Q-11** Exhaustive switches with `assertNever`, no default.
- **Q-13** Two-tier SECURITY DEFINER RPCs (self-scoped keep the grant; scope-param ones are
  revoked and admin-client only). **Q-14** Realtime channel names carry a `useId()` nonce.
  **Q-15** Client initial fetch in `useEffect`. **Q-16** Cache keys carry every scoping dimension
  (domain, user, role). **Q-17** `APP_DOMAINS` vs `GIA_DOMAINS` (onboarding, house, shop, legacy),
  labels via `DOMAIN_LABELS`. **Q-18** Untyped rows cross via `mapRows()`; model-reply shape guards
  and typed JSONB reads are out of scope; `intake-service.ts` casting the `intake_stats` RPC result
  directly is an open question.

## Conventions that are binding but not numbered

- **`server-only` and scripts.** The Trigger.dev build replaces the `server-only` package with an
  empty module, so tasks whose import chains reach it deploy and run fine. The "no `server-only`
  chain" note on some services (the profiler, member assessment, ticket draft core, draft reviews,
  intake lessons, memory service, pulse service, `ticket-vendor.ts`) exists only so a laptop `tsx`
  bench or pilot script can import them; plain `tsx` throws on `server-only`.
- **Trigger.dev tasks import services with a dynamic `import()` inside `run()`**, and no module
  may throw on a missing env var at load: read env on first use.
- **Switches are settings rows read per run.** "OFF unless true" or "ON unless false"; a policy
  edit reaches runs already waiting. Never cache a policy in module scope.
- **Model-calling services** use the provider tiers (`routing`, `reasoning`, `heavy`), mask first,
  fail closed (a failed reading never moves a bookmark), write a `sia.extraction_runs` row per call
  over member data, and in the newer writers ask for plain-text replies parsed by field, never JSON.
- **Arming or cancelling a run must log its error.** A bare `.catch(() => {})` hid a wrong
  Trigger.dev key for weeks (2026-09-21).
- **Migrations:** pick the number last (check `main` and `supabase migration list`); write the
  header (why, what, checked against what); rehearse off production; `supabase db push --dry-run`
  then push (a push applies every pending file, including other sessions' uncommitted ones);
  verify against the catalog; regenerate types; record in the changelog, `supabase/migrations/
  CLAUDE.md` and the index. A CHECK mirroring a TS vocabulary is restated in full with a stable
  name. A changed function signature is DROP then CREATE with the old overload removed. Compare
  enums to enums (`leads.domain` is `app_domain`). Additive SQL ships before code; a rename or move
  ships with it.
- **Proving a deploy:** read the real exit code (never a pipe's), check the running task and
  revision, confirm Vercel Production carries your SHA, count real Trigger.dev runs after an env
  change.
- **Several sessions share one working tree.** Stage by path, never commit another session's
  files, filter type errors to your own files.
- Browser Supabase client is a singleton. `SectionCard` / `CardHeader` wrap detail cards. Heavy
  modals load via `next/dynamic` + `useMountOnFirstOpen`. List rows `LeadRow` / `GroupRow` /
  `CalendarTaskRow` are `memo()`-ised. The service worker never caches RSC, action or navigation
  responses.

## File and naming conventions

```text
Components   PascalCase.tsx     Actions   kebab-case.ts (_-prefix = internal helper, e.g. _auth.ts)
Services     kebab-case.ts      Hooks     camelCase.ts (use*)        Utils  kebab-case.ts
Validations  kebab-case.ts      Constants kebab-case.ts              Pages/Layouts  page.tsx / layout.tsx
```

## Decision Log highlights (engineering, newest first)

- **2026-09-26** Elaya is on only for `ELAYA_DOMAINS` (concierge + Gia) plus admin, founder, the
  tech workbench, behind one predicate at every door. Nobody changes their own seat (0243).
- **2026-09-21** The MCP audience is the `mcp_audience` settings row (founder + admin fallback); the
  analyst export cap is 5,000 rows for `export_rows` only.
- **2026-09-19** `/api/mcp` added; a model may write SQL for founders and admins only, through one
  door (`elaya_reader` over `elaya_read` views, read-only, logged). The vendor merge fold is the
  ledger's one DELETE.
- **2026-09-18** For admin-client data the code gate is the boundary (`getSiaViewerScope`).
- **2026-09-17** Tables in a schema per business; functions stay in `public`; a move ships with its
  build. Images to the vendor extractor go unmasked. Vendor cores gained a provenance argument.
- **2026-09-16** The Node thinking loop is frozen, retirement targeted 2026-10-16 ("Python
  thinks, Node mutates"). `getCurrentProfile()` uses `getClaims()` for identity.
- **2026-09-12 to 09-24** The bridge serves bridged reads (vendors, members, tickets, Sia,
  Freshdesk, Books, the analyst door, pulse, subscriptions, activity, lead WhatsApp) as well as
  every write.
- **2026-09-15** `/api/webhooks/freshdesk` added.
- **2026-08-30** `/api/elaya/bridge` added.
- **2026-07-02** ESLint added, correctness only, out of the build; `Dialog` portaled.
- **Earlier:** deals first-class (0072), `after()` + awaited send (2026-06-08), P-08, the two-tier
  RPC model (0102), the `/api/elaya/chat` SSE carve-out and `maskPii` (2026-06-12), V-14
  responsiveness, the neumorphic restyle as a revertible token layer (2026-07-03).
