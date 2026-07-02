# Design Decision Log

> **Purpose:** dated record of every design decision — what was decided, why, and what it covers. The log the design audit asked for: decide once, log it, stop accreting one-off violations.
> **Audience:** designers + engineers. · **Source-of-truth scope:** design decisions only. Rule changes and architecture decisions live in `../rules/The_Rules.md` Decision Log. Entries before 2026-06-11 are back-filled from `The_Rules.md`, `src/components/CLAUDE.md`, and `docs/changelog.md` — original records remain where they were written.
> **Last verified:** 2026-07-02.

Format: one entry per decision — **Date · Decision · Rationale · Scope**. Newest first.
A design rule changed without an entry here is not a change — it is a violation (DNA §10.4).

---

## Decided

### 2026-07-02 - Theme retirement: Cosmos, Coffee, and Macha are gone; the live set is six

- **Decision:** the theme vocabulary is now **earth, air, water, fire, martini, candy**. Cosmos, Coffee, and Macha are retired. Migration 0156 moved every saved profile on a retired theme back to `earth`, then narrowed the `profiles_theme_check` CHECK to the six live values. `THEME_KEYS` in `src/lib/constants/themes.ts` is the SQL mirror; the two must stay in sync. A stale cookie or cached value on a retired theme fails `isThemeKey()` and falls back to the default. Never re-add a theme key without a CHECK-extending migration.
- **Rationale:** Coffee and Macha (added the same day, 0154/0155) did not earn their keep next to the two new pastels; Cosmos had the weakest identity of the original five. Six themes is the set the team actually uses. Retiring in a follow-on migration (rather than editing 0154/0155) keeps the migration sequence append-only.
- **Scope:** the whole theme system. The two pastel themes this batch settled (Martini, periwinkle on evening indigo; Candy, pink on dark plum, both added in 0155) carry a new theme-design law: a pastel accent can never hold white text, so `--theme-accent-fg` is dark ink (`#191a38` on Martini, `#2b1420` on Candy; the Earth precedent). Their palettes live in the semantic chips, never the surfaces; paper stays a near-white whisper (the Air pattern).

### 2026-07-02 - Resolved: `.layout-canvas` is mounted on the auth shell only

- **Decision:** the open question from design-audit H-02 / DOC-01 is settled in code and recorded here as of 2026-07-02: `.layout-canvas` (the full atmosphere class) is mounted on the auth shell (`src/app/(auth)/layout.tsx`) and nowhere else. The dashboard keeps the flat `.layout-shell`; never mount the atmosphere class on it.
- **Rationale:** the auth surface is the one canvas-dark-by-design surface, so it can carry the atmosphere without the Earth-bleed risk the dashboard mount had (non-Earth themes define flat canvases).
- **Scope:** shell classes in `globals.css`. Codified in the root `CLAUDE.md` registry row.

### 2026-06-15 — First-touch speed is bucketed in business minutes, in TS, with untouched leads counted separately

- **Decision:** the performance first-touch speed scorecard (`FirstTouchScorecard` under the
  `AgentDetailPanel` outcome donut) buckets each period-cohort lead by `< 15m / 15–30m / ≤ 1h /
  1–3h / 3h+`, where **first-touch = the earliest `lead_notes` row with `call_outcome IS NOT NULL`**
  and **elapsed = business minutes** from `leads.created_at` to that note, per the agent's shift
  (global `BUSINESS_HOURS` fallback when `shift_days` is NULL). The bucketing is **TS-only** — the
  RPC (`get_agent_first_touch_pairs`, 0123) returns raw `(lead_id, created_at, first_call_at)` pairs
  and the service mapper (`getAgentFirstTouchScorecard`, React `cache()`) runs
  `lib/utils/sla.businessMinutesBetween` per row. Leads with **no qualifying call yet** are a
  separate `untouched` count, never a speed bucket. Bucket edges + colours live once in
  `lib/constants/performance.ts`.
- **Rationale:** the buckets are *business* minutes per shift, and that calendar/shift ruler already
  exists in `lib/utils/sla` (the SLA engine). Re-deriving it in SQL would fork the ruler (R-01) and
  drift from the SLA deadlines agents are already held to. SQL therefore does only the per-lead MIN;
  the one place business-minute math lives stays the one place. Counting untouched leads separately
  (rather than dropping them or dumping them in `3h+`) keeps the bucket total honest —
  `leadsWithFirstCall + untouched = totalCohort` — and a never-called lead is not a slow first-touch.
- **Scope:** `/performance` `AgentDetailPanel` only (manager + founder). The aggregate is computed
  once per (agent, period) via React `cache()` — never per render — and the RPC is admin-client-only
  (scope-param, EXECUTE revoked, Q-13). The `FounderDrillDownDeck` card is deliberately excluded to
  preserve its zero-per-swipe-fetch invariant. Any future "speed/SLA-elapsed" metric reuses
  `businessMinutesBetween` + `buildAgentShiftOverride` — never a SQL calendar fork.

### 2026-06-15 — A deal's type is derived from its domain, never free-picked

- **Decision:** `deals.deal_type` is determined by the deal's Gia domain, not chosen independently — `onboarding → membership`, `shop → retail`, `house/legacy → sale`. Retail deals additionally require a product `deal_category`. The mapping lives once in `DOMAIN_DEAL_CONFIG` (`src/lib/constants/deal-types.ts`, the `DOMAIN_INTERESTS` pattern) and drives the form, the action's cross-field validation, the filter items, and is mirrored by the DB CHECKs (migration 0122: `deals_deal_type_check` admits `sale`; `deals_retail_category_check` couples `retail ⇔ category`). The type is derived **server-side** in both write paths (`recordDeal` from the lead's domain, `createWalkInDeal` from the server-forced deal domain) — a client-sent `deal_type` is ignored (the field was removed from both Zod schemas).
- **Rationale:** allowing domain and type to be picked independently produced contradictory rows (an `onboarding` deal typed `retail`). Domain already carries the business meaning of the deal, so the type is a pure function of it — encoding that removes a whole class of data-integrity bugs and keeps the type/category vocabularies single-sourced (R-01).
- **Scope:** all deal creation (`NewDealModal` walk-ins + the lead→won `WonDealModal` path) and the `/deals` filter. The category filter surfaces only inside the `shop` domain slice. Adding a Gia domain or a retail category is one edit to `DOMAIN_DEAL_CONFIG` + one CHECK-extending migration.

### 2026-06-12 — D-01 carve-out: raw audio to Deepgram for voice-note transcription

- **Decision:** voice-note dictation sends raw recorded audio to Deepgram (Nova-2, `hi-Latn` for Hinglish — Roman-script Hindi) under their no-training / zero-retention API terms. This is a logged, scoped carve-out from D-01 ("no raw PII reaches an external AI model — pseudonymise first"). (Originally Nova-3 `language=multi`; the production model was later narrowed to Nova-2 `hi-Latn` — the carve-out itself is unchanged.)
- **Rationale:** audio cannot be pseudonymised — speech *is* the payload. The exposure is bounded: audio is transcribed in-memory and discarded (never written to Storage, disk, or DB); the transcript enters the system only as a human-reviewed editable draft saved through the existing sanitised `addLeadNote` path; the Deepgram key is server-only (`transcription-service.ts` is the sole call site).
- **Scope:** `src/lib/services/transcription-service.ts` only. Any future voice surface (Elaya's voice channel) must route through the same service and inherits the same no-storage contract. Transcripts containing client data are never logged (D-05).

### 2026-06-12 — Responsive implementation contract (audit: `docs/audits/2026-06-responsive-audit.md`)

The responsive *law* already existed (DNA §2.7 / §9 / §12); the code was desktop-only. Five implementation decisions, decided once:

- **D-1 — Breakpoint scale: Tailwind v4 defaults, no custom tokens.** The defaults equal DNA §2.7 (`sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`). `--bp-*` in `design-tokens.css` are documentation-only — custom properties cannot appear in `@media` preludes (note added at the token block). Components use `md:` utilities; component-free CSS writes the raw pixel with a `/* --bp-* */` comment; client JS uses `useMediaQuery(MQ.…)` from `src/hooks/useMediaQuery.ts` — never raw `matchMedia` or `window.innerWidth` snapshots for layout.
- **D-2 — Dense tables become card stacks below `md`, owned by the table component.** DNA R-05 made structural: the table renders a `hidden md:block` table + `md:hidden` card stack (CSS toggle, SSR-safe, zero JS). The card stack renders a fixed mobile field set and deliberately ignores stored column preferences — persisted desktop shapes never drive narrow rendering. `md`–`lg` keeps container (not body) horizontal scroll. Reference: `LeadsTable.tsx`.
- **D-3 — Sidebar three modes:** `lg+` 240px full · `md` 64px icon rail (labels hidden, `title` tooltips) · `<md` off-canvas drawer (transform+visibility only) + the V-06-sanctioned blur backdrop, opened from a mobile top strip (hamburger + wordmark) that exists only `<md`. DNA §12's bottom nav bar is optional and deferred. Shell column-stacks `<md`; paper goes full-bleed (no gutter/radius).
- **D-4 — Fluid type for the page-title tier only:** `.type-page-title` = `clamp(var(--text-xl), 1.05rem + 1.6vw, var(--text-2xl))` (24→30px). Body/label/data text stays on the fixed scale.
- **D-5 — Responsiveness lives in shared primitives** (FilterBar wrap/scroll, table card-stack, `.serene-dossier-grid`, `.serene-shell*`), never per-page class sprinkle; page-level responsive classes are allowed for page chrome (padding/heading) only.

**Rationale:** only 10 of ~200 component files used a responsive prefix; the sanctioned mobile sidebar overlay didn't exist; two arbitrary breakpoints (820px bento, 767px raw matchMedia) had crept in. One contract stops per-surface improvisation.
**Scope shipped 2026-06-12:** foundation (`useMediaQuery`+`MQ`, `body` dvh, bento 820→md, fluid H1) + shell (Sidebar modes, drawer, mobile strip, `.serene-shell*`) + `/leads` reference (padding ladder, toolbar wrap, card stack, `.serene-dossier-grid` on the dossier). Remaining surfaces: follow-up phases F1–F5 in the audit doc.

### 2026-06-11 — `height: 0 ↔ auto` collapse is the one sanctioned layout-property animation

- **Decision:** `AnimatePresence` collapse/expand of variable-height sections may animate `height: 0 ↔ 'auto'` when all three hold: (a) the animated element carries `overflow: hidden`, (b) duration ≤ 250 ms (`EXIT_DURATION`), (c) it is paired with an opacity fade. Every other fill/progress/distribution animation stays transform-only: `scaleX` on a full-width inner element with `transformOrigin: 'left center'`.
- **Rationale:** `height: 0 → auto` is the one pattern Framer Motion cannot express via transform; the codebase had accreted unsanctioned copies. Decide once, log it, stop the drift. Audit items M-03 / M-04.
- **Scope:** GroupTasksTab (group expand re-timed 0.28 s → `EXIT_DURATION`, add-subtask row), MyTasksCalendarView (section body, quick-add), SubTaskModal (delete-confirm banner). `scaleX` adopted in `ProgressBar`, `EffortGrid`, `SubTaskModal` checklist fill; `AgentDistributionBar` segments are static flex-basis slices behind one container `scaleX`. Legacy unmounted `PersonalTasksTab.tsx` deleted (also cleared L-02). Mirrored as a rule-change row in `../rules/The_Rules.md` Decision Log.

### 2026-06-11 — The 500 ms animation ceiling has exactly three sanctioned exception classes

- **Decision:** DNA §10.1 #05 ("no animation above 500 ms") now names its exceptions explicitly: (a) `liaBreathe` (3 s, ambient), (b) the route-progress crawl phase (§14.3, 800 ms — progress indication while waiting on the network), (c) chart entrance draws (§16.7, 600–800 ms — data-draw choreography).
- **Rationale:** the document contradicted its own ceiling (design-audit DOC-06); the contradiction made every long animation look arguably sanctioned. Naming the exception classes closes that door.
- **Scope:** ~~documentary reconciliation only — M-05 remains open~~ **Closed later the same day (design-audit Phase 3):** the four 0.9 s performance refetch bars and the two 0.6 s fills are re-timed to the new `PAGE_DURATION` (0.5 s) export in `motion.ts`; they are in-panel component animation, not the route progress bar, so they need no exception. Inline spring/easing constants swept onto `motion.ts` in the same pass (`SPRING_CONFIG`, new `SPRING_BOUNCE` 400/20, `EASE_IN_OUT`, `EASE_OUT_EXPO`; toast bar CSS string → `var(--ease-out-expo)`) — audit item L-01.

### 2026-06-11 — Overlay/backdrop contract: one darkening strategy per job

- **Decision:** full-screen modal backdrops use `color-mix(in srgb, var(--theme-canvas) 72%, transparent)` (Dialog's theme-tinted formula); lighter panel/sheet backdrops use `--overlay-bg-light`; image scrims use `--overlay-scrim` (rgba 0,0,0,0.52). `--theme-overlay` does not exist — never reference it. No `backdrop-filter` on any of these (V-06).
- **Rationale:** five different darkening strategies existed for the same job, two hardcoded `rgba(0,0,0,…)`. Audit items M-02 / L-06 / DOC-02.
- **Scope:** adopted in `Dialog`, `SubTaskModal`, `ConfirmDialog`, `AssigneePickerModal`, `NotificationPanel` (mobile), `ProfileAvatarSection`. Contract table also in `src/components/CLAUDE.md` (Overlays).

### 2026-06-11 — `--color-{success,warning,danger}-fg` is THE label colour on saturated semantic fills

- **Decision:** new semantic tier `--color-*-fg: #ffffff` in `design-tokens.css`. The `-text` tier is the label colour on a `-light` fill only; `--theme-text-inverse` is never valid for this job. The old `var(--color-danger-fg, #fff)` token-with-fallback form is retired.
- **Rationale:** two call sites had independently invented the fallback form; the junk-revive button had a real contrast failure (dark-amber-on-amber). Audit items H-03 / L-03 / M-08.
- **Scope:** `ConfirmDialog`, `SubTaskModal` delete button, `StatusActionPanel` (success + revive confirm), `WonDealModal`. `Button.tsx`'s danger/success hover `--theme-text-inverse` stays as documented grandfathered drift.

### 2026-06-11 — Saturated per-status fills are tokens: `--status-{name}-solid`

- **Decision:** the seven saturated lead-status fill colours live in `design-tokens.css` as `--status-{name}-solid`. Any per-status pipeline bar references these tokens — never raw hex. This **supersedes** the 2026-06-04 `BAR_COLORS` hex exception.
- **Rationale:** the 2026-06-04 exception's justification was factually wrong — the bar segments are HTML `div`s where `var(--…)` resolves natively. The design need (distinct saturated fills at small widths) was a token gap, not a hex licence. Audit item H-01.
- **Scope:** `ManagerLeadStatusWidget` migrated; same hex values, zero visual change. V-01 now has exactly one sanctioned hex exception (the `useChartTokens` `FALLBACK` pre-paint palette).

### 2026-06-11 — Categorical data never wears semantic colours

- **Decision:** the agent-distribution segment palette switched from the semantic cycle (`accent → info → success → warning → danger`) to non-semantic `--domain-*` mid-tones. Semantic colours are reserved for data with good/bad meaning.
- **Rationale:** agent #5 rendering in danger red was a false signal — agents are categorical data, like domains. Audit item M-09.
- **Scope:** `AgentDistributionBar`; rule applies to any future categorical series.

### 2026-06-11 — `--shadow-gold-shimmer` is Earth-only

- **Decision:** defined under `[data-theme="earth"]` with a `none` default on `:root`.
- **Rationale:** an Earth-specific gold shadow was leaking to all themes, contradicting DNA §2. Audit item L-04.
- **Scope:** token sheet only; zero consumers today — any future non-Earth consumer degrades to no shadow.

### 2026-06-09 — Sanctioned hardcoded-colour exceptions are one explicit block

- **Decision:** all V-01 exceptions live in one discoverable block in `The_Rules.md` §5; V-12 points at the live colour bridge `src/components/ui/charts/useChartTokens.ts` (`useChartTokens()` + `resolveColorMap()`); the dead `src/lib/utils/chart-tokens.ts` stub is flagged (since deleted).
- **Rationale:** the real hardcoded-colour surface was wider than documented and V-12 referenced a `Not implemented` stub.
- **Scope:** documentation contract; the exception list grows only via an entry here.

### 2026-06-01 — One dropdown contract: `FilterDropdown`

- **Decision:** `ComboboxDropdown` deleted; every searchable single-select surface composes `FilterDropdown` (`multi={false}`). Dossier inline fields use `InlineSelectField`.
- **Rationale:** duplicate primitive; one contract reduces maintenance and keeps behaviour predictable.
- **Scope:** all filter bars and modals.

### 2026-05-29 — No Storybook; `/dev/components` is the visual test surface

- **Decision:** a single authenticated, role-gated page rendering every UI component in all variants, instead of Storybook.
- **Rationale:** lives in the codebase, updates automatically as tokens change, whole team can open it in a browser.
- **Scope:** to be built before the library reaches 40+ components or immediately after the first token regression in production — whichever comes first. **Not built yet.**

### 2026-05-29 — `useChartTokens` re-resolves via `MutationObserver`, not a `themeKey` prop

- **Decision:** the hook observes `data-theme` on `<html>` and re-resolves all chart colour tokens on theme change; `themeKey` survives only as an SSR/test escape hatch.
- **Rationale:** every chart on every authenticated page gets theme reactivity with zero wiring.
- **Scope:** all Recharts surfaces.

### 2026-05-29 — `Table<T>` vs bespoke feature tables

- **Decision:** `Table<T>` is for secondary/admin grids. Tables needing column visibility + drag-to-reorder clone the `LeadsTable` + `useLeadColumnPreferences` pattern; `LeadsTable` will never adopt `Table<T>`.
- **Rationale:** the bespoke leads table's column registry, toolbar, and per-cell overrides are intentional, not debt.
- **Scope:** all future tables.

---

## Open — decisions this log is waiting on

| Item | Question | Source |
| ---- | -------- | ------ |
| `/dev/components` build trigger | Per the 2026-05-29 decision: build it at 40+ components or first production token regression. The threshold is passed: `src/components/ui/` alone holds 37 files, and counting feature primitives the library is past 40. The decision is overdue. | `src/components/CLAUDE.md` |

*(The `.layout-canvas` mounting question was resolved; see the 2026-07-02 entry above: mounted on the auth shell only.)*

*(The `height: auto`, width-fill, and M-05 re-timing questions were decided 2026-06-11 — see the entries above.)*
