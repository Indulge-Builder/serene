# Serene — CLAUDE.md

## Read this before writing a single line of code

This file is the command layer. It tells you the non-negotiables,
where everything lives, and what to never do.
The engineering constitution (the rule IDs cited below) is `docs/rules/The_Rules.md` —
its Section 0 "Reuse First" (R-01–R-04 + the repeat-offender table) is the law this
file's registry serves.
The full design reference is in `docs/design/DESIGN-DNA.md`.
The full token values are in `src/styles/design-tokens.css`.

---

## What Serene Is

A luxury internal operating system for Indulge team members.
Two-layer shell: dark canvas + floating paper content area.
Five themes: Earth (default), Air, Water, Fire, Cosmos.
One AI presence: Elaya — she is not a chatbot, she is a compass.

---

## The Surface Contract

Every text colour decision flows from this table.
Memorise it. Never deviate from it.

| Surface                                     | Text token               |
| ------------------------------------------- | ------------------------ |
| `--theme-paper` (content area)              | `--theme-text-primary`   |
| `--theme-paper-subtle` (inset areas)        | `--theme-text-primary`   |
| `--theme-canvas` (dark shell)               | `--theme-canvas-text`    |
| `--theme-accent` fills (buttons, badges)    | `--theme-accent-fg`      |
| `--color-success/danger/warning/info` fills | matching `*-text` token  |
| Secondary labels on paper                   | `--theme-text-secondary` |
| Placeholders, timestamps, muted             | `--theme-text-tertiary`  |
| Sidebar nav inactive                        | `--theme-sidebar-text`   |
| Sidebar nav active                          | `--theme-sidebar-active` |

**Never use `--theme-text-inverse` on accent fills. Use `--theme-accent-fg`.**
They are different tokens for different surfaces.

---

## File Locations — Find Before You Build

```text
src/lib/supabase/client.ts          ← browser Supabase client (only place)
src/lib/supabase/server.ts          ← server Supabase client (only place)
src/lib/supabase/middleware.ts      ← session refresh helper (only place)
src/proxy.ts                        ← Next.js 16 proxy (replaces middleware.ts)
src/lib/actions/                    ← ALL server actions live here
src/lib/actions/_auth.ts            ← requireProfile(roles?) — THE session/role guard every session-based action starts with (Rule 09 / A-18); never hand-roll getCurrentProfile()+role checks. Exceptions table: src/lib/actions/CLAUDE.md (sla.ts, loginAction, 4 parallel-fetch tasks actions)
src/lib/services/                   ← ALL DB queries live here
src/lib/services/lead-cache.ts      ← invalidateLeadCaches(site, lead, scope) — THE lead Redis-invalidation helper (dual-key row del, list version INCRs, dashboard slots); never hand-roll redis.del blocks in lead actions (P-08)
src/lib/validations/                ← ALL Zod schemas live here
src/lib/constants/                  ← domain names, role names, status enums
src/lib/constants/motion.ts        ← shared Framer Motion constants (ENTER_DURATION, EASE_OUT_EXPO, SPRING_CONFIG, PAGE_DURATION, etc.) — import here, never re-declare a duration/easing/spring inline (V-13)
src/components/layout/MotionProvider.tsx ← <MotionProvider> — LazyMotion strict + async domMax + MotionConfig reducedMotion="user" (app-wide reduced motion); mounted once in the root layout. THE framer import convention everywhere (A-17): `import { m as motion } from 'framer-motion'` — never the bare { motion } namespace (strict mode throws)
src/lib/utils/sanitize.ts           ← sanitizeText() — the only sanitizer
src/lib/utils/phone.ts              ← normalizeToE164() — the only normalizer
src/lib/utils/dates.ts              ← formatDate() — the only date formatter
src/lib/utils/numbers.ts            ← formatCount(), formatCurrency() etc.
src/lib/utils/export.ts             ← buildCSV(), buildLeadsCSV(), buildXLSXWorkbook(), triggerBrowserDownload() — CLIENT-SIDE ONLY; never import from server actions or services
src/components/ui/charts/useChartTokens.ts ← useChartTokens() + resolveColorMap() — the Recharts colour bridge (resolves var(--…)→hex, re-resolves on theme change). NOTE: the old src/lib/utils/chart-tokens.ts stub is DELETED — never recreate it.
src/lib/utils/strings.ts            ← getInitials() + hashString() — the ONLY initials derivation and deterministic colour-pick hash; never re-implement inline
src/lib/services/profiles-service.ts ← getAssignableUsers({ domain?, agentsOnly? }) — THE assignable-users query; client wrapper getAssignableUsersAction(domain?) in lib/actions/profiles.ts; canonical AssignableUser type in lib/types — never re-declare a Pick<Profile,…> assignee shape or fork another agents/users list
src/lib/utils/ist.ts                ← THE canonical IST (UTC+5:30) date math — IST_OFFSET_MS, toISTMidnight(), toISTEndOfDay(), getISTMondayStart(), getISTMonthStart(), getISTPrevMonthRange(), toIst(), istToUtc(). date-range.ts / whatsapp-period.ts / performance-service.ts / sla.ts all import from here; never re-fork IST boundary math
src/lib/utils/campaigns.ts          ← beautifyCampaignTitle() — the only campaign-title decorator | normalizeCampaignKey() — THE campaign-key normalisation (lowercase+trim; ad_creatives + ad_spend_daily CHECKs and every lower(trim(utm_campaign)) join depend on it — never re-inline)
src/lib/utils/ad-spend-parse.ts     ← parseMetaSpendFile() — THE Meta daily-breakdown CSV/XLSX parser; CLIENT-SIDE ONLY (dynamic xlsx, same rule as export.ts); owns the range-grain whole-file rejection — never soften it to a per-row skip
src/lib/services/ad-spend-service.ts ← getBudgetSummary() (get_budget_summary RPC, admin client, NO Redis) + getExistingSpendKeys() — ALL /budget spend queries live here
src/lib/services/domain-targets-service.ts ← getDomainTargets() / upsertDomainTarget() — THE domain_targets access (founder monthly deals-closed targets)
src/lib/utils/webhook.ts            ← readJsonBody()/parseJsonBody() — THE webhook JSON parse guard; createRateLimiter()+getClientIp() — THE rate limiter (S-17); safeSecretCompare() — THE timing-safe secret compare; never hand-roll any of the three in a route
src/lib/utils/rows.ts               ← mapRows<TRow, TOut>(data, fn) — THE typed boundary for untyped query results (joined selects, untyped RPCs); never add a new `as Record<string, unknown>` row cast in a service (Q-18)
src/lib/constants/define-enum.ts    ← defineEnum([{ id, label }]) — THE factory for simple string-enum constants (derives values/labels/options/zodEnum from one array); richer config tables (TASK_PRIORITY, lead-status badges) stay hand-written
src/lib/constants/themes.ts         ← THE theme vocabulary (THEME_KEYS/ThemeKey/isThemeKey) + THEME_COOKIE 'serene-theme' + persistThemeCookie() — the SSR theme mirror; the root layout reads the cookie to stamp data-theme on <html> server-side (zero-flash), ThemeInitializer/ThemeSelector keep it in sync with profiles.theme
src/lib/constants/app-icons.ts      ← THE PWA home-screen icon vocabulary (ICON_KEYS/IconKey/isIconKey/ICON_OPTIONS/ICON_ENUM/DEFAULT_ICON via defineEnum — built like themes.ts) + iconSrc(value) (THE only key→/icon-N.webp path resolver; validates against ICON_KEYS, falls back to DEFAULT_ICON — NEVER interpolate a raw param into an icon path) + APP_ICON_COOKIE 'serene-app-icon' + persistAppIconCookie() (the SSR manifest mirror — the root layout reads it to point <link rel=manifest> at /api/manifest?icon=<saved> + apple-touch-icon; IconInitializer/IconSelector keep it in sync with profiles.app_icon). One square /public/icon-N.webp per key (covers manifest 192/512 + maskable + apple); adding an option = one { id,label } line + a CHECK migration. Mirrors profiles.theme end-to-end; rides the existing updateProfile action (NO new persist action)
src/components/ui/StatTile.tsx      ← <StatTile label value sub? variant="card"|"cell"> — THE labelled stat tile (campaign metric cards + deals summary cells); performance MetricCard deliberately stays bespoke
src/lib/utils/scroll.ts             ← scrollToBottom(el), lockBodyScroll() → unlock fn (re-entrant; mobile drawer/sheets)
src/lib/utils/whatsapp-format.ts    ← markdownToWhatsApp() — THE markdown → WhatsApp-native text converter (**x**→*x*, *x*→_x_, headings→bold line, md bullets→"- ", links→text (url)); every model-authored WhatsApp reply passes through it before sending (elaya-whatsapp.ts)
src/components/ui/ChatMarkdown.tsx  ← <ChatMarkdown content> — THE markdown-lite renderer for model-authored chat text in-app (bold/italic/lists/links/code as React elements; no dangerouslySetInnerHTML, no dependency, SSE-safe). The in-app mirror of whatsapp-format.ts; used by ElayaMessageBubble — never re-parse model markdown inline
src/lib/services/transcription-service.ts ← transcribeAudio() — THE Deepgram call site (server-only; Nova-3 multilingual for Hinglish). Audio transcribed in-memory and discarded — never stored. Client entry: transcribeAudioAction (lib/actions/transcription.ts); mic capture: src/hooks/useAudioRecorder.ts — THE recording hook (codec negotiation, 2-min auto-stop, mic-track release); never re-implement MediaRecorder plumbing inline
src/components/ui/DictationButton.tsx ← <DictationButton> — THE voice-dictation cluster (record → transcribe → onTranscript(text) as an editable draft; never auto-sends). Wraps useAudioRecorder + transcribeAudioAction + the mic/stop/cancel buttons + m:ss counter + Transcribing… spinner ONCE. variant="composer" (32px pill, mounts as a <MessageBar leadingSlot> — Elaya + WhatsApp composers) or "inline" (28px bordered, form footer/label row — LeadNotesInput + CalledModal). onError(message) so each consumer keeps its surface (toast vs inline); onBusyChange(busy) for footer submit gating. Renders null when MediaRecorder unsupported. ALL four voice surfaces compose this — never re-inline a mic/transcribe cluster
src/lib/constants/interests.ts      ← SERVICE_CATEGORY_* (defineEnum) + DOMAIN_INTERESTS + getDomainInterests() — THE per-domain leads.service_interests vocabulary (text[], NEVER an enum; unknown values dropped at ingestion via extractServiceInterests, never rejected)
src/lib/services/intelligence-service.ts ← Call Intelligence reads — getHelpdeskLibrary(domain) (Redis 1hr {cases,hooks} envelope; key REDIS_KEYS.helpdeskCases + REDIS_TTL.HELPDESK_CASES live in redis-keys.ts ONLY), getCasesForLead()/getHooksForCategories() (dossier card, ≤6 rows, deliberately un-cached). Tables service_cases + conversation_hooks (migration 0110: all-authenticated read, admin/founder write RLS). Writes ONLY via lib/actions/intelligence.ts — every write awaits the helpdesk-key del (P-08 convention) before revalidatePath('/helpdesk'). Helpdesk filtering is CLIENT-SIDE on the full library — never add a per-keystroke server search
src/components/intelligence/        ← CaseCard (dossier preview), CaseListRow + CaseDetailModal (/helpdesk list row → full-detail modal), CategoryTag (THE static category pill — card/row/modal), CategoryPill (filter button), HookList, HelpdeskSearch, category-icons.ts — shared Call Intelligence components; /helpdesk and the dossier ServiceInterestCard both compose these
src/lib/elaya/                      ← THE Elaya AI subsystem (foundation 2026-06-12). provider.ts — the ONE provider-neutral complete() contract; adapters/anthropic.ts — the ONLY file allowed to import @anthropic-ai/sdk (Gemini/OpenAI land as sibling adapters, zero brain changes); registry.ts — llm_providers config row → adapter, read per turn (model switch = DB edit, no deploy); principal.ts — verified profile → role+persona+permitted toolset (customer persona stubbed); pii.ts — maskPii(), THE PII gateway every tool result passes before reaching a model (depth via elaya_settings); persona.ts — system prompt; brain.ts — the tool-calling loop + (E3) the confirmation RESOLVER pre-step (the ONLY place a state-change executes — runs on a prior-turn proposal + an affirmative human reply); tools/registry.ts — the 6 read-only tools + THE single executeTool dispatch (read ∪ write); tools/write-registry.ts — (E3) the 4 write tools (add_lead_note/create_lead_task execute inline; update_lead_status/reassign_lead propose-only) + executeProposedAction (resolver-only); confirmation.ts — classifyConfirmation(), the pure English+Hinglish affirmation gate (default 'other' = cancel; never trusts the model). Tools wrap existing lib/services functions / lead-mutations cores — NEVER a direct table query, NEVER model-supplied identity args
src/lib/services/lead-mutations.ts  ← (E3) THE shared context-free body of the 4 action-shaped lead writes (addLeadNoteCore/createLeadTaskCore/updateLeadStatusCore/assignLeadCore) + reviveLeadCore (Lead Revival R1: wraps createLeadTaskCore = the E2 path + a "Revived" marker; NEVER touches the leads row) — wraps the existing RPC + invalidateLeadCaches (P-08) + SLA + notify; both leads.ts actions and Elaya write tools call the SAME core (R-01). revalidatePath/after() stay in the caller. Never re-implement a lead mutation outside a core
src/lib/services/revival-service.ts ← (Lead Revival R1) THE revival_candidates + revival_policies access (admin client). Silence finder + daily-cap count (native assigned_to filter, never a leads embed — head:true drops it) + the open→actioned/dismissed resolve-once flip (A-11 carve-out) + the review-predicate read (getOpenCandidatesForCaller, session-client RLS). Revival NEVER writes the leads row
src/lib/services/revival-gate.ts    ← (Lead Revival R1) THE note-AI gate: ONE structured THREE-verdict call (revive/dismiss/unsure) reusing the Elaya provider/PII layer (resolveLlmForJob('routing') + maskPii, NO tools, NO new SDK import). judgeNotesForRevival() = the model core (re-testable via scripts/test-revival-gate.ts); judgeLeadForRevival() = the DB-read wrapper. Prompt sends confident junk → dismiss (audit log, never review), ambiguous → unsure, warm-with-window → revive; warm leads NEVER auto-dismissed. Fails CLOSED to 'unsure' — never auto-revive AND never auto-dismiss on a bad verdict
src/trigger/lead-revival.ts          ← (Lead Revival R1) sweepRevivalCandidatesTask — THE daily silence-detection schedules.task (07:30 IST; the project's first cron task). Reads revival_policies → finds silent leads w/ no open candidate → note-AI gate → confident revive under cap → reviveLeadCore (Revived task); unsure/overflow → open candidate (review). NOT a parallel scheduler
src/lib/services/elaya-actions-service.ts ← (E3) THE elaya_actions ledger access (admin client) — insert executed/proposed, getLatestProposedAction (resolver read), markActionResolved (proposed→executed/failed/dismissed, admin-client UPDATE, no user policy), supersedePriorProposals (one live proposal per conversation). Trust + rollback ledger; before/after snapshots
src/lib/services/elaya-service.ts   ← Elaya conversation/message DB access — 24h session expiry (server-side, ONE active session per user across channels), append-only message inserts, IST daily-cap count (shared across channels)
src/lib/services/elaya-whatsapp.ts  ← tryHandleElayaWhatsAppMessage() — THE WhatsApp staff routing gate + Elaya WhatsApp turn (called by the whatsapp webhook before processInboundMessage; profile match → brain to completion + one sendElayaWhatsAppReply; no match → lead pipeline untouched; never writes lead-pipeline tables)
src/lib/services/llm-providers-service.ts ← llm_providers + elaya_settings reads — per request, never module-cached (sla_policies pattern)
src/lib/constants/notification-categories.ts ← THE per-user notification control catalog (migration 0133): one entry per category = (event × recipient-role-that-differs), with `channels` (the checkboxes the UI renders) + `roles` (which users see the row). THE single source the UI, the SQL CHECK, and the gate key on. `lead_initiation`/`elaya_reply` are TRANSACTIONAL — deliberately ABSENT, never muteable. Adding a category = one entry here + a CHECK-extending migration.
src/lib/services/notification-prefs-service.ts ← THE notification control GATE (migration 0133, SERVER ONLY, admin client — cross-user fan-out read like dispatchPush). resolveChannels/isChannelEnabled (Seam B single-recipient), filterRecipientsByPref(ids, key, channel) (Seam B fan-out — ONE batched .in query), getNotificationPrefs (React cache() per-request memo), getMyNotificationPrefs (session /profile seed). **Absence = ON, fails OPEN** (missing/malformed/thrown → send). Seam A = createNotification's optional `notificationKey` (gates in-app + push together); Seam B = the 6 broadcast whatsapp-api.ts wrappers. Owner edits via actions/notification-prefs.ts (session client). NEVER gate lead_initiation/elaya_reply.
src/lib/services/dashboard-service.ts ← ALL dashboard widget queries (never extend leads-service.ts)
src/lib/actions/dashboard.ts         ← ALL dashboard server actions (widget data refresh)
src/lib/constants/dashboard-widgets.ts ← widget registry (pure data, no component refs)
src/hooks/useWidgetData.ts            ← useWidgetData({ seed, fetcher, autoFetch?, deps? }) — THE dashboard-widget data lifecycle (RSC seed → skip mount fetch, deps-driven auto-fetch, refetch for refresh, apply for cohort sync); never hand-roll seed/loaded/fetch-effect state in a widget
src/lib/utils/domain-scope.ts         ← resolveDomainParam(searchParams, cookieStore, role) — THE single global-domain-scope resolver (admin/founder → ?domain= param ?? serene-domain cookie ?? null; manager/agent → always null). ONE selector for the whole app: dashboard + leads + deals + campaigns all read it; the dashboard RSC threads the result into the cohort widgets as a `scopeDomain` prop (there are NO per-widget domain tabs — removed 2026-06-17, default view = all-domains aggregated). Dashboard widget refresh actions still re-pin managers server-side via effectiveWidgetDomain() (actions/dashboard.ts). NOT a security boundary — founder narrowing is an additive WHERE, never an RLS change. (The old src/lib/utils/widget-scope.ts is DELETED — never recreate it.)
src/lib/constants/route-permissions.ts ← ALWAYS_ALLOWED_PREFIXES + DOMAIN_ROUTE_MAP (domain → permitted route prefixes)
src/lib/constants/domain-colors.ts    ← DOMAIN_LINE_COLORS record, one entry per AppDomain; values are var(--domain-*) strings resolved via resolveColorMap() before Recharts use
src/lib/utils/route-access.ts         ← canAccessRoute(profile, pathname) — pure function, safe in 'use client' components
src/hooks/useDebounce.ts              ← useDebounce<T>(value, delay) — the ONLY debounce utility; never recreate inline
src/hooks/useMediaQuery.ts            ← useMediaQuery(query) + MQ.{mobile,tabletDown,touch} — THE viewport/media-condition hook (responsive audit 2026-06, D-1); never raw matchMedia or a window.innerWidth snapshot for layout in a component; prefer CSS md: classes when purely presentational. Breakpoints = Tailwind v4 defaults = DNA §2.7; --bp-* tokens are documentation-only (CSS vars can't appear in @media preludes). Responsive shell classes (.serene-shell*, .serene-sidebar*, .serene-dossier-grid + --340 variant (340px identity sidebars: /profile, /admin/users/[id], NewUserClient), .serene-board (group-task board: snap-scroll rail <lg, 5 columns lg+), .serene-touch) live in globals.css "RESPONSIVE SHELL"
src/hooks/useMountOnFirstOpen.ts      ← useMountOnFirstOpen(open) — THE mount latch for next/dynamic modals whose call site keeps them mounted (Dialog owns the exit animation internally); see src/components/CLAUDE.md "Heavy modal loading rule"; never re-implement inline
src/hooks/usePortalAnchor.ts          ← usePortalAnchor() — THE floating-panel anchoring mechanism (portal positioning, flip, outside-close, visualViewport); pair with <FloatingPanel>; never re-implement inline
src/components/ui/FloatingPanel.tsx   ← <FloatingPanel> — anchored dropdown-panel portal + chrome; driven by usePortalAnchor
src/components/ui/CollapseReveal.tsx  ← <CollapseReveal> — THE expand/collapse reveal (grid-template-rows 0fr↔1fr + fade); never animate height: 0↔"auto"; render inside <AnimatePresence> at the call site
src/components/ui/DateRangeFields.tsx ← <DateRangeFields> — the canonical From → To date-range panel body for filter bars (the "Dates" panel)
src/components/ui/DateRangePresetList.tsx ← <DateRangePresetList> — THE quick-range preset panel body (the "Range" panel: Today…Last 3 Months); presets + IST-anchored resolver in src/lib/constants/date-range-presets.ts
src/components/ui/FilterBar.tsx       ← <FilterBar> — THE shared list-page filter-bar shell (sliders icon + count badge, SearchBar (hideSearch to omit), children dropdowns, Range trigger+panel, Clear, trailing slot); immediate-commit only — the Apply/draft model was removed 2026-06-12, never reintroduce it. Below md every bar auto-collapses to the single-row scroll layout — FilterDropdown children must pass menuPortal. Composed by ALL filter bars: Leads, Deals, Campaigns, Tasks, Performance, admin UsersTable, settings AgentSettingsTable; never fork a new filter-bar chrome
src/hooks/useUrlFilters.ts            ← useUrlFilters({ resetKeys? }) — THE URL-param filter plumbing (debounced search→URL push, push(updates), pushDebounced(updates) batched commit, clearAll) for URL-driven filter bars; client-state bars (TasksFilters) pass state straight to <FilterBar>. Same file: useMultiSelectUrlParam(url, key) — THE optimistic multi-select param (instant checkbox echo, toggle bursts → one router.push)
src/components/ui/ConfirmDialog.tsx   ← <ConfirmDialog> — THE standalone confirm dialog; owns the --z-overlay/--z-modal contract + body portal; never window.confirm
src/components/ui/EmptyState.tsx      ← <EmptyState> — THE canonical empty state (hero icon-tile variant + inline serif-italic variant); makes "Playfair italic heading, never 'No data available'" structural; never hand-roll the italic style object
src/components/ui/PageSkeletons.tsx   ← PageHeaderSkeleton / FilterBarSkeleton / SkeletonCard / Shimmer / skeletonStagger — THE shared loading.tsx scaffold blocks (page header, paper filter strip, card chrome); loading files compose these, only bespoke interiors stay inline
src/components/ui/charts/CartesianChartFrame.tsx ← ChartFrame + cartesianDefaults(tokens) + CARTESIAN_MARGIN — shared paper container + grid/axis/tooltip/legend prop defaults for Area/Line/Bar (Pie/Donut/Butterfly exempt); never re-inline these prop blocks in a chart wrapper
src/components/ui/TaskFormFields.tsx  ← FieldLabel / FieldError / FormChip / PriorityChipRow (chip + dot variants) / DueDateField + resolveDueAt (IST presets) / TaskTypeField — THE shared task-creation form fields; all four create-task modals compose these — never re-express a priority chip, due-preset chip, or task-type radio list inline
src/hooks/useDashboardLayout.ts       ← localStorage layout hook (key: serene:dashboard:layout:${userId}:v1)
src/components/dashboard/            ← DashboardCanvas, DashboardWidgetSlot, WidgetSkeleton, widgets/
src/components/ui/                  ← shadcn primitives, zero feature imports
src/components/ui/elaya-glyph.tsx     ← Elaya's custom SVG mark (always breathing)
src/styles/design-tokens.css        ← ALL CSS variables, all themes
src/app/globals.css                 ← `.layout-shell` (the mounted flat dashboard shell) + `.layout-canvas` (atmosphere class — mounted on the auth shell only, never the dashboard shell) + Tailwind @theme isolation block
docs/design/DESIGN-DNA.md          ← full design reference
docs/changelog.md                   ← SINGLE SOURCE OF TRUTH for all changes (mandatory)
```

---

## The 12 Rules (Non-Negotiable)

```text
01  Every colour is a CSS variable. No hex values in components. Ever.

02  Every Server Action begins with Zod validation. First line. No exceptions.

03  No raw Supabase calls in components or actions.
    All queries go through lib/services/.

04  No component imports from another feature folder.
    Cross-feature data flows through lib/ only.

05  One Supabase client per context. Never instantiate elsewhere.

06  sanitizeText() on every user text before DB write.
    normalizeToE164() on every phone field before DB write.

07  Every new table has RLS enabled in its migration.

08  Log and activity tables are append-only. No UPDATE or DELETE. Ever.

09  Authorization reads only from public.profiles. JWT claims never trusted.

10  Server Actions return { data, error }. Never throw. Never void.
    Components handle both branches explicitly.

11  Async work over 3 seconds or needing retry → Trigger.dev.
    Post-response sends → after() (see Pattern Notes). Nothing heavier in route handlers.

12  Every meaningful change — feature, fix, migration, new package, refactor —
    gets an entry in docs/changelog.md before or alongside the code.
    docs/changelog.md is the single source of truth. The_Changelog.md is deleted.

```

These 12 are the command-layer summary. The full constitution — Section 0 "Reuse First"
(R-rules) plus the A/S/D/P/V/Q tables and the Decision Log — is `docs/rules/The_Rules.md`.

---

## The Never-Do List

```text
NEVER  hardcode a colour value in a component
NEVER  use text-gray-* or bg-gray-* or bg-white — use tokens
NEVER  use z-index values not in the --z-* scale
NEVER  animate width, height, padding, or margin — only transform and opacity
       (expand/collapse composes <CollapseReveal> — grid-template-rows, never height 0↔auto)
NEVER  put backdrop-filter/blur on cards, dropdowns, or modals
       (sanctioned only on: TopBar, mobile sidebar overlay, command palette)
NEVER  use font-bold (700) — --weight-semibold (600) is the maximum
NEVER  create a component that both fetches data and renders UI
NEVER  duplicate a component, hook, util, or service that already exists — extend it instead;
       copy-pasting an existing module as the base for a "new" one is the same violation
       (The_Rules §0, R-01–R-04 — check the repeat-offender table there)
NEVER  let a Zod default error message reach the user interface
NEVER  clear a form field on validation error
NEVER  use "No data available" as empty state copy
NEVER  use more than 3 colours in a single chart
NEVER  show a skeleton for less than 150ms
NEVER  add backdrop-blur outside the three sanctioned surfaces
NEVER  use a coloured border on one edge of a card, row, or column as a category/status indicator (borderLeft/borderTop/borderRight/borderBottom accent strips) — use pills, dots, icons, or semantic badges instead
NEVER  add a package or meaningful change without a docs/changelog.md entry
NEVER  write to The_Changelog.md — it has been deleted; docs/changelog.md is the only changelog
NEVER  import a value symbol from lib/services/ in a 'use client' component — it pulls next/headers into the client bundle and hard-errors; use a Server Action in lib/actions/ instead (A-15)
NEVER  hand-roll a session/role check in a server action — requireProfile(roles?) from lib/actions/_auth.ts (A-18)
NEVER  hand-roll a confirm dialog or use window.confirm — compose <ConfirmDialog>
NEVER  import { motion } from 'framer-motion' — always import { m as motion }. The root layout's <MotionProvider> (LazyMotion strict + async domMax features) throws in dev on the full namespace; the alias keeps every motion.div JSX site identical while shipping the slim m core (A-17; perf audit G-2)
NEVER  fire an outward network send (WhatsApp/Gupshup, any external fetch that must complete) as bare void fn().catch() in a route or server action — Vercel freezes the lambda on response flush and orphans it. Use after() from next/server and await the send inside. See Pattern Notes (A-16).
```

---

## Component Quick Reference

Before building anything, ask:

1. Does this already exist in `src/components/ui/` or the File Locations table above?
   (The_Rules §0 — search by behaviour, not name)
2. Can I compose it from the 12 core components?
3. Am I about to hardcode anything that should be a token?

**The 12 Core Components:**
Button, Input, Badge/Pill, Card, Avatar, Modal,
Table, Toggle, Dropdown/Select, Search Bar, Message Bar, Skeleton

**Auth-specific primitives:**
`PasswordStrengthBar` (`src/components/ui/PasswordStrengthBar.tsx`) — props: `password: string`; renders 4-segment bar with danger→warning→info→success colours; returns null when empty. Used on `/update-password` and `/profile`.

**Icon library:** `lucide-react` exclusively.
Default size: `w-4 h-4`, stroke: `1.5`.
Sidebar nav: `w-[15px] h-[15px]` (intentional exception).

**Page title dot:** Every primary navigation page `<h1>` ends with `<span className="page-title-dot">.</span>`.
This produces a slow accent-coloured blink (2.4s ease-in-out, `serene-page-dot-blink` keyframe).
Use `className="type-page-title"` on the `<h1>` and the dot class on the trailing span.
The dot is **only** on primary nav pages (the top-level `<h1>` the user lands on from the sidebar).
Detail pages (leads/[id], campaigns/[id], admin/users/[id]) are exempt — they show a back link instead.

**Empty states:** Always Playfair italic heading. Never "No data available."
Compose `<EmptyState>` from `src/components/ui/EmptyState.tsx` — never hand-roll the italic style object.

**Form errors:** Always from `lib/validations/form-errors.ts`.
Never raw Zod messages. Never "Invalid input."

---

## Standard Page Layout Contract

### The Lead List Layout is the canonical template for all primary nav list pages

Every list page (leads, users, settings, campaigns, tasks, etc.) follows this exact structure:

```tsx
<main className="flex-1 p-8">
  {/* Row 1 — Page header */}
  <div className="flex items-center justify-between gap-4 mb-6">
    <h1 className="type-page-title m-0">Title<span className="page-title-dot">.</span></h1>
    <ActionButton />          {/* primary CTA — always top-right */}
  </div>

  {/* Row 2 — Filter bar */}
  <div className="px-5 py-4 mb-4 rounded-md border border-(--theme-paper-border) bg-(--theme-paper) shadow-(--shadow-1)">
    <FiltersComponent />      {/* search + filters relevant to this page */}
  </div>

  {/* Row 3 — Content (table or card list) */}
  <Suspense fallback={<ContentSkeleton />}>
    <ContentAsync />
  </Suspense>
</main>
```

**Rules (non-negotiable):**

- The title row is always `flex items-center justify-between` — title left, action right.
- The filter bar is always a rounded bordered `--theme-paper` strip with `--shadow-1`, `mb-4`.
- The content area follows immediately below the filter bar. No extra wrappers.
- `Suspense` with a skeleton is mandatory for any async content component.

### Two content display modes

**Dense table** (high-volume pages: `/leads`, any page that can exceed 100 rows)

- Use the `<Table>` component or the leads table pattern.
- Filter bar runs server-side (URL params). Table is display-only.
- Column visibility + drag-to-reorder via `useLeadColumnPreferences` pattern (Q-08).

**Card list** (low-volume pages: `/admin/users`, `/settings`, `/campaigns`)

- Each row is a `motion.div` card with `--shadow-1` at rest → `--shadow-2` on hover.
- Cards animate in with staggered `opacity 0→1, y 4→0` at 250ms, `EASE_OUT_EXPO`.
- On hover: `translateY(-1px)` + `--shadow-2`. On leave: reset. Transition via CSS `transition` prop.
- Cards never exceed 500ms total entrance stagger (`Math.min(index * 80, 320)`).
- Framer Motion `motion.div` — transform and opacity only (never width/height/padding).

**Reference implementations:**

- Dense table: `src/components/leads/LeadsTable.tsx` + `src/app/(dashboard)/leads/page.tsx`
- Card list: `src/components/campaigns/CampaignCard.tsx` + `src/components/admin/UsersTable.tsx`

---

## Elaya Quick Reference

```text
Elaya is not a chatbot. She is a presence.
Her glyph ALWAYS breathes when she is present (liaBreathe animation).
A static glyph = Elaya is not present.

Four surfaces: Panel, Conversation, Inline Suggestion, Action Proposal.
Inline suggestions always have a 400ms delay. Never instant.
Proposal cards always have exactly two actions: Approve and Dismiss.
Elaya never shows a number badge. One dot or nothing.
Elaya's colour is always --theme-accent. She belongs to the theme.

Cross-domain insights are always labelled with the source domain.
Elaya never silently crosses domain boundaries.
```

---

## Theme Quick Reference

```text
data-theme="earth"   → champagne gold accent (#c9a553), warm canvas (#0d0c0a) + grain + radial washes
data-theme="air"     → slate blue accent (#54769e), blue-black canvas
data-theme="water"   → deep teal accent (#1e7d72), teal-black canvas
data-theme="fire"    → ember sienna accent (#c25022), brown-black canvas
data-theme="cosmos"  → nebula amethyst accent (#7a5fc0), violet-black canvas

Default (no attribute) = Earth.
Theme attribute goes on the <html> element.
--theme-accent-fg on Earth is #201808 (warm ink on gold).
--theme-accent-fg on all other themes is #ffffff.
```

---

## Folder Structure

```text
serene/
├── CLAUDE.md                        ← this file
├── .cursorrules                     ← identical to this file
├── .env.local                       ← never committed
├── .env.example                     ← always committed
│
├── docs/                            ← full tree + reading orders: docs/README.md
│   ├── README.md                    ← the documentation index (start here)
│   ├── 00-for-the-board.md          ← plain-English product explanation
│   ├── 01-vision.md                 ← roadmap + per-module "done"
│   ├── changelog.md                 ← ALL changes logged here (single source of truth)
│   ├── architecture/                ← overview · database(+.sql) · auth-and-rbac · caching · migrations
│   ├── design/                      ← DESIGN-DNA (law) · design-system · decision-log
│   ├── rules/The_Rules.md           ← the constitution: §0 Reuse First (R-rules) + A/S/D/P/V/Q + Decision Log
│   ├── pages/                       ← one spec per route (16 files)
│   ├── modules/                     ← gia · elaya · sia · elaya · call-intelligence
│   ├── integrations/                ← lead-ingestion · whatsapp-gupshup · trigger-dev · upstash-redis
│   ├── operations/                  ← environments · deployment
│   ├── audits/                      ← dated audit reports (design, security)
│   └── _archive/                    ← pre-restructure originals (never cite)
│
├── src/
│   ├── app/
│   │   ├── CLAUDE.md                ← App Router rules. Routes, pages, auth gate.
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── forgot-password/
│   │   │   └── update-password/
│   │   ├── (dashboard)/             ← all authenticated pages
│   │   ├── api/
│   │   │   ├── webhooks/            ← inbound webhooks (leads, whatsapp)
│   │   │   ├── auth/callback/       ← the auth callback
│   │   │   ├── elaya/chat/          ← Elaya SSE streaming (sanctioned P-02 exception, Decision Log 2026-06-12).
│   │   │   └── manifest/             ← dynamic per-icon Web App Manifest (sanctioned PWA P-02 carve-out — static JSON, the dynamic twin of app/manifest.ts; ?icon= validated via isIconKey). No other API routes (P-02).
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                 ← redirects to /login or /dashboard
│   │
│   ├── components/
│   │   ├── CLAUDE.md                ← component rules. display-only. token usage.
│   │   ├── ui/                      ← shadcn primitives. zero feature imports.
│   │   └── layout/                  ← Sidebar, TopBar
│   │
│   ├── lib/
│   │   ├── CLAUDE.md                ← action patterns. util rules. type conventions.
│   │   ├── supabase/
│   │   │   ├── client.ts            ← browser client (only place)
│   │   │   ├── server.ts            ← server client (only place)
│   │   │   ├── admin.ts             ← service-role client (only place)
│   │   │   └── middleware.ts        ← session refresh helper (only place)
│   │   ├── actions/                 ← all server actions
│   │   ├── services/                ← all DB queries
│   │   ├── validations/             ← all Zod schemas + form-errors.ts
│   │   ├── constants/               ← typed enums: domains, roles, statuses
│   │   ├── utils/
│   │   │   ├── sanitize.ts          ← sanitizeText()
│   │   │   ├── phone.ts             ← normalizeToE164()
│   │   │   ├── dates.ts             ← formatDate(), toUTC()
│   │   │   ├── numbers.ts           ← formatCount(), formatCurrency()
│   │   │   ├── scroll.ts            ← scrollToBottom(), lockBodyScroll()
│   │   │   ├── ist.ts               ← canonical IST date math (offset, day/month boundaries)
│   │   │   └── strings.ts           ← getInitials(), hashString()
│   │   └── types/
│   │       ├── database.ts          ← auto-generated from Supabase
│   │       └── index.ts             ← shared types
│   │
│   ├── hooks/                       ← ALL shared hooks (useWidgetData, useUrlFilters, useDebounce,
│   │                                   usePortalAnchor, useMountOnFirstOpen, useLeadColumnPreferences, …)
│   │                                   — registry rows in File Locations above
│   │
│   ├── styles/
│   │   └── design-tokens.css        ← ALL CSS variables, all five themes
│   │
│   └── proxy.ts                     ← Next.js 16 proxy (session refresh; replaces middleware.ts — there is NO src/middleware.ts)
│
└── supabase/
    ├── migrations/
    │   └── CLAUDE.md                ← migration rules. RLS checklist. never edit after run.
    └── config.toml
```

---

## Phase Status

> **Full build history lives in `docs/changelog.md` (chronological, single source of truth); the migration index is `docs/architecture/migrations.md`; the forward roadmap is `docs/01-vision.md`. This section is a pointer, not a duplicate — do not re-expand the per-feature history here.** When you ship something meaningful, add it to `docs/changelog.md`, not to this file.

| Phase / Module | Status | Headline |
| --- | --- | --- |
| 0–2 Foundation | ✅ | Design tokens, auth, `profiles`, `get_user_role()`/`get_user_domain()`, admin user mgmt, agent routing |
| 3–4 Gia leads | ✅ | Ingestion (Meta/Pabbly), round-robin, lead list + dossier, full lifecycle |
| 5 Profile/Theme | ✅ | Profile page, 5 themes, zero-flash theme script |
| 6 Primitives | ✅ | Modal primitive, Suspense-split filters, column picker, Add Lead |
| 7 Dashboard | ✅ | Bento grid (5 widgets), `useDashboardLayout`, RSC consolidation |
| 8–10 Performance/Campaigns | ✅ | Performance (agent/manager/founder), Campaign analytics, benchmarks, SLA engine, Settings |
| OS Tasks | ✅ | `task_groups`, `task_remarks`, `SubTaskModal`, group workspace, tags, checklist, Gia tab |
| WhatsApp | ✅ | Gupshup v1, conversations/messages, `/whatsapp`, 4 notification templates |
| Deals | ✅ | `public.deals` first-class table (0072–0074), walk-in creation |
| Attribution refactor | ✅ | `source`/`medium`/`attribution jsonb` (0065); `leads.city` column (0066) |
| Domain route authorization | ✅ | `canAccessRoute` + `DOMAIN_ROUTE_MAP` + layout guard + Sidebar filter |
| Elaya foundation | ✅ | Migration 0116 (`elaya_*`, `user_context`, `llm_providers`, `elaya_settings`), provider abstraction (Anthropic adapter), principal resolver, PII gateway, 6 read-only tools, `/elaya` SSE chat |
| Elaya WhatsApp staff channel | ✅ | Routing gate on the whatsapp webhook (staff number → same brain/tools/cap, one reply; unknown number → lead pipeline untouched), `elaya_reply` audit rows (0117) |
| Lead Revival (Phase R1) | ✅ | Migration 0119 (`revival_candidates` ledger + `revival_policies` config). Daily Trigger.dev `schedules.task` sweep → note-AI suppression gate (Elaya `routing` provider, reused) → confident revive = a "Revived" task via the E2 `createLeadTaskCore` path; unsure/overflow → review tab (the `/leads?revival=true` predicate reusing `LeadsTable`). `ReviveLeadButton` (one component, two mounts). Folds into `/settings`. Layer over leads — never mutates lead status/columns. Full contract: `docs/modules/revival.md` |

**Current focus:** Elaya Phase 2 (agentic writes via `elaya_actions`, WhatsApp customer persona), client records (post-won flow).

**UI primitive rule (kept here because it's a live convention):** `Button` (CSS hover, zero Framer cost) for form submits and modal actions; `MotionButton + MOTION_BUTTON_DEFAULTS` for standalone primary CTAs that are pressed repeatedly (`AddLeadButton`, `TasksShell` header). Never add `MotionButton` to a form submit. Never merge the two.

---

## Before Writing Any Code — Mandatory Sequence

Every task, every time. No exceptions.

```text
1. Read the relevant authority files for this task:
   - CLAUDE.md (this file) and src/components/CLAUDE.md
   - docs/design/DESIGN-DNA.md for any visual/layout decision
   - src/styles/design-tokens.css for token values
   - The feature-area CLAUDE.md if one exists

2. Search the codebase for existing implementations of every
   named concept in this task. Search by behaviour, not filename:
   "date picker" not just "DatePicker"
   "format duration" not just "formatDuration"
   "round robin" not just "getNextRoundRobinAgent"
   Check the repeat-offender table in docs/rules/The_Rules.md §0 first.
   Document what you find. Only build what does not already exist. (R-01, formerly Q-12)

3. Only then write code.
```

This sequence is not optional. R-01 applies to components, hooks, utils,
service functions, constants, and Zod schemas. A duplicate created without
a prior search is a violation regardless of whether the names differ — and
copy-pasting an existing module as the base for a "new" one is the same
violation (R-03). Consolidated forks stay deleted (R-04).

---

## Pattern Notes

### `unstable_cache` — scoped keys (Q-16) and the `cookies()` constraint (P-09)

When wrapping a service function in `unstable_cache`, the cache key **must** include the caller's domain when the underlying query is domain-scoped. A manager in `concierge` must never receive a cached response intended for `finance`.

**P-09 comes first:** a service function that calls `createClient()` (which reads `cookies()`) can **never** be wrapped in `unstable_cache` — Next.js throws at runtime. Use React `cache()` for per-request memoisation instead. Full pattern + reference implementations: `src/lib/CLAUDE.md`.

```ts
// ✅ Correct
unstable_cache(() => queryFn(), ['tag', domain, JSON.stringify(filters)], { revalidate: 60, tags: ['tag'] })

// ✗ Wrong — omits domain, cross-domain cache hit possible
unstable_cache(() => queryFn(), ['tag'], { revalidate: 60, tags: ['tag'] })
```

Reference implementation: `getGroupTasks` in `src/lib/services/tasks-service.ts`.
Revalidation in Server Actions uses `revalidateTag(tag, { expire: 0 })` (Next.js 16 requires second arg).

---

### `void redis.del().catch()` in server actions is a bug, not a pattern

`void Promise.all([redis.del(key)]).catch(() => {})` is fire-and-forget. In a Next.js server
action, the action's return value unblocks the caller before the promise settles. `revalidatePath`
makes the RSC subtree immediately eligible for re-render — if any request hits the route before
the del completes, the service function will repopulate Redis from the DB, then the late del
evicts a fresh entry and extends the stale-serving window.

The correct pattern for any Redis del that must precede a cache revalidation:

```ts
// ✅ Correct — dels complete before revalidatePath fires
try {
  await Promise.all([
    redis.del(REDIS_KEYS.leadRowId(leadId)),
    redis.del(REDIS_KEYS.leadActivities(leadId)),
  ]);
} catch (e) {
  console.warn('[leads-action] redis del failed on status update', e);
}
revalidatePath(`/leads/${(lead.slug as string | null) ?? leadId}`);

// ✗ Wrong — del races against revalidatePath; can evict a fresh entry
void Promise.all([redis.del(REDIS_KEYS.leadRowId(leadId))]).catch(() => {});
revalidatePath(`/leads/${slug}`);
```

**Rule (P-08):** Every `redis.del` in a server action must be `await`-ed inside a `try/catch` that logs
a `[module-action]`-prefixed warning. The `try/catch` keeps Redis failure non-fatal. The `await`
ensures the cache layer is consistent before the RSC layer is told it can re-render. These two
requirements are not in conflict.

**Lead row dual-key invariant:** Lead rows are cached under two keys — `leadRowSlug(slug)`
(primary: hit on every slug-based dossier load) and `leadRowId(leadId)` (hit on UUID fallback
only). Any action that mutates the lead row must delete both when `slug` is non-null. Deleting
only `leadRowId` is a silent no-op on normal dossier traffic.

**Both contracts are now structural for lead actions:** call
`invalidateLeadCaches(site, { leadId, slug, domain }, scope)` from
`src/lib/services/lead-cache.ts` — it awaits everything inside the try/catch-warn convention
and `scope.row` always deletes both row keys. Never hand-assemble a `redis.del` block in a lead
action. Dashboard *volume* keys are deliberately not in any scope: their read-side keys embed an
ISO `from:to` range a del cannot enumerate — freshness is TTL-only (120s).

Reference implementation: `updateLeadStatus`, `addLeadCallNote`, `addLeadNote` in
`src/lib/actions/leads.ts` (all via `invalidateLeadCaches`).

---

### Outward network sends (WhatsApp/Gupshup) — `void fetch().catch()` is a bug on Vercel, use `after()` + `await`

On Vercel the serverless function is **frozen/killed the instant the HTTP response (or server-action
return) is flushed.** Any `void fetch().catch()` still in flight at that moment is orphaned —
the request to the external service is severed mid-execution and any follow-up work (e.g. a log
insert) never runs. This is silent, intermittent loss: a send survives only when the lambda
happens to stay warm, so a fraction get through and the rest vanish **with no error and no log row.**

This bit the WhatsApp notification pipeline (2026-06-08): every code path used `void send().catch()`
fire-and-forget. Most notifications were lost; the `whatsapp_notification_logs` table showed only
the lucky survivors, all `delivered: true` — the failures left no row at all (missing rows, not
error rows).

**The rule for any outward network send that must complete:**

```ts
import { after } from 'next/server';

// ✅ Correct — response flushes immediately; lambda stays alive until the send settles
after(
  notifyLeadAssigned({ ... }).catch((err) =>
    console.error('[module] notify failed (non-fatal):', err),
  ),
);
return NextResponse.json({ ... }, { status: 201 });

// ✗ Wrong — orphaned when the lambda freezes after the response; lost on Vercel
void notifyLeadAssigned({ ... }).catch(() => {});
return NextResponse.json({ ... }, { status: 201 });
```

- `after()` is the **only** construct that satisfies both constraints: a bare `await` would delay
  the response by the send time; a bare `void` loses the work on freeze.
- The function passed to `after()` (or its internals) **must actually `await`** the send — wrapping
  a function that itself uses `void` inside defeats the entire purpose. `notifyLeadAssigned` awaits
  its Gupshup sends via `Promise.allSettled`; the `logNotification` calls in each send's `finally`
  are `await`-ed so the log row is durably written before the send resolves.
- Routes whose `after()` carries network sends export `maxDuration` (60s on the lead + whatsapp
  webhooks) so the lambda isn't killed before the send completes.
- Code already running inside an `after()` (e.g. `processInboundMessage` under the whatsapp route)
  uses a plain `await` — a `void` there detaches the send from the tracked chain and freezes it out.

Reference implementations: `notifyLeadAssigned` (`src/lib/services/lead-assignment-notify.ts`),
the 4 call sites in `src/app/api/webhooks/leads/route.ts`, `src/lib/actions/leads.ts`
(`assignLead`, `createManualLead`), `src/lib/services/whatsapp-ingestion.ts`. Full rule in
`src/lib/actions/CLAUDE.md` and `src/lib/services/CLAUDE.md`.

---

### Confirm dialog stacking — `--z-overlay` backdrop, `--z-modal` panel

Standalone confirm dialogs (not nested inside another modal) use:

- Backdrop: `--z-overlay` (50)
- Panel: `--z-modal` (60)

This keeps the backdrop below the panel. **`--z-modal-overlay` (61) is reserved for the backdrop of a nested modal** that itself sits above an existing `--z-modal` surface (e.g. `AssigneePickerModal` above `SubTaskModal`).

The bug of backdrop covering the panel happens when `--z-modal-overlay` (61) is accidentally used for a standalone dialog backdrop — it then sits above the panel at `--z-modal` (60) and blocks all clicks.

**This contract is now structural: every standalone confirm composes `<ConfirmDialog>` from `src/components/ui/ConfirmDialog.tsx`** — it owns the backdrop/panel z-indices, the `document.body` portal, and the two-action layout. Never hand-roll a confirm dialog; never use `window.confirm`. Adopted in `GroupTasksTab`, `GroupTaskWorkspace`, `AdCreativesManager`.

---

### Framer Motion `transform` + `position: fixed` — portal escape

Framer Motion entrance animations apply CSS `transform` to the animated element. A `transform` on an ancestor creates a new **containing block** for `position: fixed` descendants and a new **stacking context**. This means:

- `position: fixed` children are no longer fixed to the viewport — they are fixed to the transformed ancestor's paint area.
- `z-index` on the fixed children is evaluated within the ancestor's stacking context, not the document root.

**Result:** dialogs and dropdowns rendered inside a `motion.div` card appear clipped, washed out, or unresponsive even with correct z-index values.

**Fix — structural, never re-implemented inline:** anchored panels use `usePortalAnchor()` (`src/hooks/usePortalAnchor.ts`) + `<FloatingPanel>` (`src/components/ui/FloatingPanel.tsx`) — the hook owns positioning/flip/outside-close/visualViewport correction, the component owns the `document.body` portal and chrome. Centered confirms use `<ConfirmDialog>`, which portals itself.

**Reference implementations:**

- `LeadsFilters.tsx` / `DealsFilters.tsx` / `CampaignFilters.tsx` / `TasksFilters.tsx` — all four compose `<FilterBar>` (`src/components/ui/FilterBar.tsx`), which owns the Range (presets) + Dates triggers + `usePortalAnchor` + `<FloatingPanel>` + `<DateRangePresetList>`/`<DateRangeFields>` internally (canonical)
- `GroupTasksTab.tsx` — ⋯ dropdown portaled; confirm delete via `<ConfirmDialog>`
- `GroupTaskWorkspace.tsx` — confirm delete via `<ConfirmDialog>`
- `DatePicker.tsx` / `TimePicker.tsx` / `FilterDropdown.tsx` — primitives still own a private copy of the mechanism (migrate onto `usePortalAnchor` last; do not fork a new copy from them)

---

## When in Doubt

1. Check `docs/design/DESIGN-DNA.md` for the full spec on any section.
2. Check `src/styles/design-tokens.css` for the exact token value.
3. Check `src/lib/constants/` for domain names, roles, and status values.
4. Never invent a value. If it doesn't exist in the token system, ask before adding it.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Read graphify-out/GRAPH_REPORT.md (god nodes + Claude-labelled community structure) only for broad architecture review or when query/path/explain do not surface enough context. There is no longer a curated wiki/ — the graph is the navigation layer.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost). To re-name communities after a re-cluster, run `graphify label . --backend claude` (uses the Claude API; ANTHROPIC_API_KEY is in .env.local). To regenerate the interactive visual, run `GRAPHIFY_VIZ_NODE_LIMIT=10000 graphify cluster-only .` (writes graphify-out/graph.html; the default 5000-node limit skips this repo's ~6.6k-node graph).
