# Component Sweep — Flagged Items

_Generated: 2026-05-29. These were not touched. Each needs a decision before adoption._

---

## ~~1. AvatarStack in `src/components/tasks/GroupTasksTab.tsx` (line ~455)~~ ✅ RESOLVED (2026-05-29)

**Pattern found:** `AvatarStack` — a horizontal stack of overlapping avatar thumbnails with an overflow count pill ("+N more"). Individual avatars have `zIndex` stacking and negative `marginLeft` overlap.

**Intended replacement:** No direct equivalent in `src/components/ui/`. Candidates: a new `AvatarStack` primitive in `ui/`, or compose from `Avatar` + count badge.

**Why flagged:** `ui/Avatar` handles a single avatar. There is no `AvatarStack` component in the library. While individual Avatar replacements inside the stack were made safe, the outer stacking container and overflow count pill would require a new component.

**Resolution:** `src/components/ui/AvatarStack.tsx` built. Props: `users: AvatarStackUser[]` (`id`, `name`, `imageUrl?`), `max` (default 4), `size` (default `sm`), `overlap` (default 8px). Separator rings via `box-shadow: 0 0 0 2px var(--theme-paper)` on each `Avatar`. Overflow pill is `+N` with `--radius-full`. Hover spread uses Framer Motion `x` transform — no margin animation. `GroupTasksTab` inline definition removed; call site maps `assignee_previews` to `AvatarStackUser` shape. Additionally: `Avatar` component updated to compose caller `style.boxShadow` and `selected` ring via comma-join so both layers coexist — resolves the pre-mortem conflict between separator ring and accent ring.

---

## ~~2. Assignee avatar with selected state in `src/components/tasks/AssigneePickerModal.tsx` (line ~410)~~ ✅ RESOLVED (2026-05-29)

**Pattern found:** Avatar circle inside a picker row. When selected, the container has `background: var(--theme-accent)`. The avatar initials `span` also changes to `var(--theme-accent-fg)` (inverted) when selected.

**Intended replacement:** `ui/Avatar`

**Resolution:** `ui/Avatar` now accepts `selected?: boolean`. When `true`, renders a `box-shadow: 0 0 0 2px var(--theme-paper), 0 0 0 4px var(--theme-accent)` ring with `transition: box-shadow var(--transition-interactive)`. No layout shift — `box-shadow` paints outside the element without affecting flow. `AssigneePickerModal` can now be migrated: pass `selected={isSelected}` to `<Avatar>` and remove the outer container's background mutation.

---

## ~~3. Mode-switcher tab bar in `src/components/admin/CreateUserForm.tsx` (line ~40)~~ ✅ RESOLVED (2026-05-29)

**Pattern found:** Two `<button>` elements styled as underline tabs switching between `"password"` and `"invite"` modes. The active mode sets `borderBottom: "1px solid var(--theme-paper)"` to visually merge with the panel below (a connected-tab pattern), not a standard pill or border-bottom variant.

**Intended replacement:** `ui/TabSelector` with `variant="border-bottom"`

**Why flagged:** The connected-tab visual trick (active tab's bottom border dissolves into the card below it) is a custom variant not in `TabSelector`. Swapping would lose the visual affordance that the tab merges with the form below it. The `TabSelector` border-bottom variant adds a 2px accent line; it doesn't do the "connected" trick.

**Resolution:** `variant="connected"` added to `TabSelector`. Container: `border: 1px solid var(--theme-paper-border)`, `--radius-md`, `--theme-paper-subtle` background, `2px` inset padding. Active tab: `motion.span` with `layoutId="tab-connected"` slides between tabs using the same spring (stiffness 400, damping 30) as pill and border-bottom variants. Active tab bg is `--theme-paper` + `--shadow-1`. Active text is `--theme-text-primary`. `CreateUserForm` inline 25-line mode-switcher removed; replaced with `<TabSelector variant="connected" tabs={MODE_TABS} activeTab={mode} onChange={(id) => setMode(id as ...)} />`. Mode state (`useState<"password" | "invite">`) is preserved unchanged — `onChange` fires the tab id string directly.

---

## ~~4. Recharts direct import in `src/components/dashboard/widgets/ManagerCampaignWidget.tsx`~~ ✅ RESOLVED (2026-05-29)

**Pattern found:** Direct `import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts'`. Uses 7 status-specific colors via a `STATUS_COLORS` map (one color per lead status value). Each `<Bar>` gets a specific color via `<Cell fill={STATUS_COLORS[status]} />`.

**Intended replacement:** `src/components/ui/charts/BarChart.tsx`

**Why flagged:** The `ui/charts/BarChart` uses a generic 6-series `getChartTokens()` color palette (`--chart-1` through `--chart-6`). This widget uses 7 semantically-named colors (`--color-success`, `--color-danger`, etc.) tied to lead statuses. Reshaping the data to fit the wrapper would destroy the semantic color contract and violate the "zero functional changes" constraint. The wrapper's `series[]` prop does not support per-bar Cell-level overrides.

**Resolution:**
- `useChartTokens.ts` — `resolveColorMap(map: Record<string, string>)` exported. Resolves CSS variable strings (e.g. `"var(--color-info)"`) to computed hex/rgb values via `getComputedStyle` — same pattern as the hook itself. Required because SVG `fill` does not resolve CSS custom properties in all browsers (notably older Safari).
- `BarChart.tsx` — `colorMap?: Record<string, string>` prop added. Values are resolved via `resolveColorMap` at mount and re-resolved on theme switch via `MutationObserver` (same approach as `useChartTokens`). `colorMap[key] ?? positionalColor` — partial maps are valid; unmatched keys fall back to positional tokens. Built-in Recharts `<Legend>` is suppressed when `colorMap` is provided (caller owns legend). Additional passthrough props added: `margin`, `barCategoryGap`, `xAxisProps`, `yAxisProps`, `tooltipProps`, `gridProps`.
- `ManagerCampaignWidget.tsx` — inline Recharts import replaced with `ui/charts/BarChart`. `CHART_SERIES` constant (all 7 statuses with labels) defined above the component. `colorMap={STATUS_COLORS}` passed directly — `STATUS_COLORS` stays in the feature folder (domain knowledge). `stacked` prop preserves the stacked layout. Inline legend unchanged — reads from `STATUS_COLORS` directly, same source as `colorMap`. No `<Cell>` in migrated code — fill goes on `<Bar>` via the wrapper. `pnpm tsc --noEmit` — 0 errors.

---

## ~~5. Recharts direct import in `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx`~~ ✅ RESOLVED (2026-05-29)

**Pattern found:** Direct `import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'`. Single-series line chart. Color resolved manually: `color: getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim()`.

**Intended replacement:** `src/components/ui/charts/LineChart.tsx`

**Why flagged:** The `ui/charts/LineChart` uses `useChartTokens()` internally and maps series keys to `--chart-N` tokens. This widget has a single bespoke series whose color is `--theme-accent` (not `--chart-1`). Migrating would require either verifying `--chart-1` maps to `--theme-accent` (it does not — they are different tokens) or extending `LineChart` to accept a `seriesColors?: Record<string, string>` override.

**Resolution:** The widget was not migrated to `ui/charts/LineChart` (that remains a future task). Instead, the root problem was fixed directly: `useChartTokens()` is now called inside `ManagerLeadVolumeWidget`. The `Line` `stroke` and `activeDot.fill` now use `chartColors[0]` — the runtime-resolved `--theme-accent` hex value — instead of the raw `"var(--theme-accent)"` string. SVG attributes do not resolve CSS custom properties in all browsers; `getComputedStyle` via `useChartTokens` is the correct bridge. The chart now repaints correctly on theme switch via the hook's `MutationObserver`.

---

## ~~6. Icon-only action buttons in task components (multiple files)~~ ✅ PARTIALLY RESOLVED (2026-05-29)

**Pattern found:** Multiple `<button>` elements used as icon-only action triggers inside complex task UIs — status pickers, assignee pickers, priority selectors, delete/archive icons, expand/collapse toggles. They have custom `width`/`height` (20–32px), bespoke hover states using `onMouseEnter`/`onMouseLeave` imperative style mutations, and tight coupling with Framer Motion `motion.button` wrappers.

**Resolution — `MotionButton` infrastructure:**
- `src/components/ui/Button.tsx` — converted to `React.forwardRef` (required by `motion()` factory).
- `src/components/ui/MotionButton.tsx` — `motion(Button)` wrapper built. Accepts all `ButtonProps` plus Framer Motion props (`whileHover`, `whileTap`, `animate`, `initial`, `exit`, `layoutId`). Exports `MOTION_BUTTON_DEFAULTS` (`whileTap: { scale: 0.97 }`, spring transition using `INSTANT_DURATION`). Zero Button internals duplicated.
- Full-width audit of `src/` confirmed **one** actual `motion.button` instance (not 6) — the original flag conflated raw `<button>` instances with `motion.button` instances.

**Remaining open sub-flag — `GroupTasksTab.tsx` "Add subtask" trigger (line ~614):**

The one real `motion.button` is a full-width, left-aligned fade-in/fade-out trigger button. It **cannot** be expressed via `Button` or `MotionButton` without a new layout variant because:
1. `width: 100%` + `textAlign: left` — `Button` is always inline-flex centered.
2. `padding: var(--space-2) var(--space-8)` — matches the group card's indent, not a button padding.
3. `borderTop` conditional on subtask count — structural, not stylistic.
4. `onMouseEnter` color change (`text-tertiary → accent`) — not a standard hover variant.

**What needs to happen first:** Add a `layout="full-width"` or `align="start"` prop to `Button`, or keep this one `motion.button` as-is (it is self-contained and correct). The `MotionButton` infrastructure is ready for all future cases where `Button` props do map cleanly.

---

## ~~7. Inline label+value pairs (InfoRow candidates)~~ ✅ RESOLVED (2026-05-29)

**Pattern found:** Numerous `<div>/<span>` pairs rendering a muted label above or beside a value — in `LeadInfoCard.tsx`, `SubTaskModal.tsx`, `PersonalDetailsCard.tsx`, and similar dossier-style layouts.

**Intended replacement:** `src/components/ui/InfoRow.tsx`

**Resolution:** Per-instance audit completed. **10 replacements** across **2 files** (`LeadInfoCard.tsx`, `SubTaskModal.tsx`). Local `DatumRow` / `DatumValue` helpers deleted from `LeadInfoCard.tsx` — no other file imported them. `InfoRow` `style` prop confirmed on root element; `gridColumn: '1 / -1'` on Full Name row verified safe.

**Remaining unsafe (not touched):** `PersonalDetailsCard.tsx` (edit/view form grid), `DynamicFormResponses.tsx` (dt/dd grid), `LeadInfoCard` attribution strip (interactive values + custom horizontal layout), `SubTaskModal` Title/Notes (edit-mode toggle), metric/stat cards (`CampaignMetricsStrip`, `CoreFourGrid`, `EffortGrid`), all form field labels.

---

## Summary

| # | Component | File | Status |
|---|-----------|------|--------|
| 1 | AvatarStack | GroupTasksTab | ✅ **Resolved** — `ui/AvatarStack` built; inline definition removed |
| 2 | Avatar (selected state) | AssigneePickerModal | ✅ **Resolved** — `selected` prop added to `ui/Avatar` |
| 3 | Tab mode-switcher | CreateUserForm | ✅ **Resolved** — `connected` variant added to `TabSelector` |
| 4 | BarChart direct Recharts | ManagerCampaignWidget | ✅ **Resolved** — `colorMap` prop added to wrapper; `STATUS_COLORS` passed as bridge |
| 5 | LineChart direct Recharts | ManagerLeadVolumeWidget | ✅ **Resolved** — `useChartTokens` wired; color resolves at runtime |
| 6 | Icon-only action buttons | Task components | ✅ **Partially resolved** — `MotionButton` infrastructure built; 1 `motion.button` sub-flag remains (full-width layout, see above) |
| 7 | InfoRow candidates | Multiple dossier layouts | ✅ **Resolved** — 10 replacements in 2 files; DatumRow deleted |
