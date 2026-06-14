# Shared toolbox — UI primitives, hooks, utils, constants

> **Purpose:** The reuse-first registry. Before building any component / hook / util / constant, find it
> here (search by **behaviour**, not name — R-01). Everything below already exists; extend it, never fork it.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## Load-bearing UI primitives (`src/components/ui/`)

Display-only (A-06), zero business logic, all colours from tokens.

| Primitive | Owns |
|---|---|
| `FilterBar` | Shared filter chrome: icon+badge, search, dropdowns, Range preset, Dates, Clear, trailing slot. Immediate-commit only. Composed by every filter bar |
| `FloatingPanel` + `usePortalAnchor` | Anchored dropdown portal: positioning, flip, outside-close, visualViewport |
| `ConfirmDialog` | Standalone confirm; `--z-overlay`/`--z-modal` contract; body portal; two actions. Never `window.confirm` |
| `EmptyState` | Hero (icon+serif italic) or inline variant; never "No data available" |
| `CollapseReveal` | Expand/collapse via grid-template-rows 0fr↔1fr (never height:0↔auto); render in `<AnimatePresence>` |
| `DictationButton` | Record→transcribe→append-draft cluster; 4 mounts; never auto-sends (see [voice-dictation.md](voice-dictation.md)) |
| `Carousel` | Controlled index + touch-swipe with axis-lock; transform/opacity only |
| `ChatMarkdown` | Model-text renderer (bold/italic/lists/links/code as React elements); SSE-safe, no `dangerouslySetInnerHTML` |
| `StatTile` | Labelled stat tile: `variant="card"` (metric cards) or `"cell"` (deals summary) |
| `DateRangeFields` / `DateRangePresetList` | The "Dates" From→To panel / the "Range" preset panel |
| `PageSkeletons` | `PageHeaderSkeleton`/`FilterBarSkeleton`/`SkeletonCard`/`Shimmer`/`skeletonStagger` — loading scaffold |
| `CartesianChartFrame` | `ChartFrame` + `cartesianDefaults(tokens)` for Area/Line/Bar |
| `TaskFormFields` | `FieldLabel`/`FieldError`/`PriorityChipRow`/`DueDateField`/`TaskTypeField` — all task-form fields |
| `useChartTokens` (`ui/charts/`) | Recharts colour bridge: resolves `var(--…)`→hex, re-resolves on theme change |

---

## Shared hooks (`src/hooks/`)

| Hook | Owns |
|---|---|
| `useWidgetData` | Dashboard widget lifecycle (RSC seed → skip mount fetch, deps auto-fetch, refetch, cohort apply) |
| `useUrlFilters` | URL-param filter plumbing (debounced search→push, batched `pushDebounced`, `clearAll`) + `useMultiSelectUrlParam` |
| `usePortalAnchor` | Floating-panel anchoring (pair with `FloatingPanel`) |
| `useMediaQuery` | Viewport conditions (`MQ.mobile`/`tabletDown`/`touch`); never raw `matchMedia` for layout |
| `useMountOnFirstOpen` | Mount latch for heavy `next/dynamic` modals (Dialog owns its own exit) |
| `useDebounce` | THE debounce utility |
| `useLeadColumnPreferences` | localStorage lead-table column order/visibility (userId-scoped) |
| `useAudioRecorder` | MediaRecorder plumbing (codec negotiation, 2-min stop, mic release) |
| `usePushSubscription` | Web Push subscribe/unsubscribe + iOS detection |
| `useNotifications` / `useNotificationSound` | Notification state + realtime + unread; notification sound |
| `useToast` | Toast queue (singleton `toast`) |
| `useDashboardLayout` | Widget canvas layout (localStorage `serene:dashboard:layout:${userId}:v…`) |
| `useDashboardCohortSync` | Multi-widget cohort sync via one URL range param |
| `useTaskCompletionToggle` | Optimistic task-complete toggle |
| `useCreateTriggerModal` | Add-entity modal open-state context |

---

## Shared utils (`src/lib/utils/`)

| File | Owns |
|---|---|
| `sanitize.ts` | `sanitizeText()` — the only sanitizer (before every DB write) |
| `phone.ts` | `normalizeToE164()` — the only phone normalizer |
| `dates.ts` | `formatDate()`, `toUTC()`, relative time |
| `ist.ts` | THE canonical IST math (day/week/month/prev-month boundaries) |
| `numbers.ts` | `formatCount()`, `formatCurrency()` (null → "—", never ₹0) |
| `strings.ts` | `getInitials()`, `hashString()` (initials + deterministic colour-pick) |
| `export.ts` | `buildCSV`/`buildLeadsCSV`/`buildXLSXWorkbook`/`triggerBrowserDownload` — CLIENT-ONLY |
| `scroll.ts` | `scrollToBottom`, `lockBodyScroll` → unlock fn (re-entrant) |
| `webhook.ts` | `readJsonBody`/`createRateLimiter`/`getClientIp`/`safeSecretCompare` — webhook guards |
| `rows.ts` | `mapRows<TRow,TOut>` — typed boundary for untyped joined/RPC results |
| `whatsapp-format.ts` | `markdownToWhatsApp()` — markdown → WhatsApp-native text |
| `campaigns.ts` | `normalizeCampaignKey` (DB-CHECK-critical), `beautifyCampaignTitle` (display-only) |
| `ad-spend-parse.ts` | `parseMetaSpendFile()` — CLIENT-ONLY Meta CSV/XLSX parser + grain guard |
| `route-access.ts` | `canAccessRoute` — pure route gate |
| `widget-scope.ts` | `resolveWidgetScope(role, mode)` |
| `sla.ts` | `nextBusinessDeadline`, `buildAgentShiftOverride` |
| `date-range.ts` / `whatsapp-period.ts` | Preset + period boundary math (IST-anchored) |

---

## Key constant tables (`src/lib/constants/`)

| File | Owns |
|---|---|
| `define-enum.ts` | `defineEnum([{ id, label }])` — factory for simple string-enum constants |
| `themes.ts` / `motion.ts` | Theme vocabulary / Framer Motion constants |
| `route-permissions.ts` | `ALWAYS_ALLOWED_PREFIXES`, `DOMAIN_ROUTE_MAP` |
| `domains.ts` / `roles.ts` | App/Gia domains + labels / user roles + manager roles |
| `lead-statuses.ts` / `call-outcomes.ts` / `lead-sources.ts` | Lead status badges / call outcomes / source vocab |
| `task-constants.ts` / `task-types.ts` | Task priority/status/category config / task types |
| `interests.ts` | Service categories + per-domain interests vocabulary |
| `domain-colors.ts` | `DOMAIN_LINE_COLORS` (resolved via `resolveColorMap` before Recharts) |
| `redis-keys.ts` | `REDIS_KEYS.*` key factories + `REDIS_TTL.*` (the ONLY place keys are defined) |
| `dashboard-widgets.ts` | Widget registry (pure data, no component refs) |
| `revival.ts` / `sla.ts` / `elaya.ts` | Subsystem constant tables (see each subsystem page) |
