# Design Decision Log

> **Purpose:** dated record of every design decision — what was decided, why, and what it covers. The log the design audit asked for: decide once, log it, stop accreting one-off violations.
> **Audience:** designers + engineers. · **Source-of-truth scope:** design decisions only. Rule changes and architecture decisions live in `../rules/The_Rules.md` Decision Log. Entries before 2026-06-11 are back-filled from `The_Rules.md`, `src/components/CLAUDE.md`, and `docs/changelog.md` — original records remain where they were written.
> **Last verified:** 2026-06-11.

Format: one entry per decision — **Date · Decision · Rationale · Scope**. Newest first.
A design rule changed without an entry here is not a change — it is a violation (DNA §10.4).

---

## Decided

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
| `.layout-canvas` mounting | Mount the atmosphere class on the dashboard shell (requires the four non-Earth themes to define canvas-atmosphere tokens first — Earth-bleed risk) or retire it. | design-audit H-02 / DOC-01 / §3 |
| `/dev/components` build trigger | Per the 2026-05-29 decision: build it at 40+ components or first production token regression. Component count is at/near the threshold. | `src/components/CLAUDE.md` |

*(The `height: auto`, width-fill, and M-05 re-timing questions were decided 2026-06-11 — see the entries above.)*
