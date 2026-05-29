# Eia — Changelog

All notable changes to the Eia platform are recorded here in reverse chronological order.
This is the **single source of truth** for all development changes.
Every meaningful change — feature, fix, refactor, migration, new package — must be logged here before or alongside the code that implements it.
Format: `[date] — [area] — [what changed]`

---

## 2026-05-29 — Settings page: Agent Roster + Shifts

New `/settings` route for manager/admin/founder — lead assignment configuration surface.

**No migration required.** `shift_start` and `shift_end` columns already existed on `agent_routing_config` (confirmed present in type definition).

**New type:**
- `src/lib/types/database.ts` — `AgentRosterRow` type: joined profile + routing config row returned by `getAgentRosterByDomain`

**Service extension:**
- `src/lib/services/agent-routing-service.ts` — `getAgentRosterByDomain(domain | '*')`: joins `profiles + agent_routing_config!inner`, adminClient, returns `AgentRosterRow[]`, ORDER BY domain ASC / full_name ASC
- `src/lib/services/agent-routing-service.ts` — `setAgentShift(agentId, shiftStart, shiftEnd)`: adminClient UPDATE on `agent_routing_config`

**Validation:**
- `src/lib/validations/agent-routing-schema.ts` — `SetAgentShiftSchema`: agentId uuid, shiftStart/shiftEnd regex `/^([01]\d|2[0-3]):([0-5]\d)$/` nullable, cross-field refine (end > start)

**Action extension:**
- `src/lib/actions/agent-routing.ts` — `setAgentShiftAction`: Zod → auth → manager domain check (getProfileById) → setAgentShift; revalidates `/settings`
- `src/lib/actions/agent-routing.ts` — `toggleAgentRouting`: now also revalidates `/settings` (added alongside admin/users revalidation)

**Page:**
- `src/app/(dashboard)/settings/page.tsx` — server component; agent/guest → redirect `/dashboard`; fetches `getAgentRosterByDomain`; page h1 with `page-title-dot`
- `src/app/(dashboard)/settings/SettingsShell.tsx` — `'use client'`; URL-param tab state (`?tab=roster|shifts`); `useTransition` + `router.replace`; renders `AgentRosterTab` or `AgentShiftsTab`

**Tab components:**
- `src/components/settings/AgentRosterTab.tsx` — agent card grid; domain filter pill bar (admin/founder only); `Toggle` for routing pool; optimistic update + toast.danger on error; `pendingIds` disable in-flight cards
- `src/components/settings/AgentShiftsTab.tsx` — table layout; `<input type="time">` for shift windows; blur-to-save when both fields valid; inline error for end≤start; inline hint when only one field filled; Clear button; `setAgentShiftAction`; `computeActiveHours` display

**Sidebar:**
- `src/components/layout/Sidebar.tsx` — "Settings" nav item (`Settings` lucide icon, `/settings`), visible to manager/admin/founder; under new "Configuration" section label

**CLAUDE.md updates:**
- `src/app/(dashboard)/settings/CLAUDE.md` — created
- `src/lib/CLAUDE.md` — services registry + actions registry updated

---

## 2026-05-29 — Gia SLA Engine (Phase 9)

Event-driven SLA enforcement for the Gia lead module. 8 SLA rules, IST business-hours math, auto-task creation on breach, two new notification types.

**Migrations:**
- `supabase/migrations/20260529000027_lead_sla_columns.sql` — adds `status_changed_at` + `last_activity_at` columns to `leads` (backfilled from `created_at`); extends `notifications` type CHECK to include `sla_breach_agent` + `sla_breach_manager`; documents `sla_breach` as valid `lead_activities.action_type`
- `supabase/migrations/20260529000028_lead_sla_timers.sql` — `lead_sla_timers` table with `lead_id`, `rule_code`, `scheduled_fire_at`, `trigger_run_id`, `status`, `fired_at`, `cancelled_at`; RLS scoped by role; no INSERT/UPDATE/DELETE policy for regular users — service role only; partial index on `status = 'pending'`

**Constants + utils:**
- `src/lib/constants/sla.ts` — `BUSINESS_HOURS` (IST, Mon–Sat, 09:00–19:00); `SLA_RULES` typed map of all 8 rule codes → config (statusTrigger, businessMinutes, recipient); `SLA_AUTO_TASK_TITLES` for agent rules; `getRulesForStatus()`, `getActivityRefreshRules()` helpers
- `src/lib/utils/sla.ts` — `nextBusinessDeadline(from, businessMinutes)`, `isWithinBusinessHours(ts)`, `businessMinutesBetween(start, end)`; all math anchored in Asia/Kolkata (IST)

**SLA rules:**
- `SLA-01A/B`: New lead — 15min (agent) / 30min (manager)
- `SLA-02A/B`: Touched lead — 1440min/24h (agent) / 2160min/36h (manager)
- `SLA-03A/B`: In-discussion lead — 1440min/24h (agent) / 2160min/36h (manager)
- `SLA-04A/B`: Active/nurturing lead — 5760min/4 biz-days (agent + manager)

**Types:**
- `src/lib/types/database.ts` — `SlaTimerStatus`, `LeadSlaTimer` types; `lead_sla_timers` Database table entry; `NotificationType` extended with `sla_breach_agent` + `sla_breach_manager`; `Lead` extended with `status_changed_at` + `last_activity_at`

**Trigger.dev:**
- `src/trigger/lead-sla.ts` — `fireLeadSlaTask` (Trigger.dev task; stale-fire guard; calls `fireSlaBreachAction`); `scheduleLeadSlasTask` (delayed job with idempotency key `lead-sla-${leadId}-${ruleCode}`, tag `lead-sla-${leadId}`); `cancelLeadSlasByLeadTask` (tag-based batch cancel)

**Service:**
- `src/lib/services/sla-service.ts` — `getSlaTimersForLead`, `getSlaTimerForLeadAndRule`, `createSlaTimer`, `updateSlaTimerRunId`, `cancelSlaTimersForLeadInDb`, `markSlaTimerFired`, `getOpenGiaFollowupTask`, `getManagersByDomain`

**Actions:**
- `src/lib/actions/sla.ts` — `scheduleSlaTimersForLead`, `cancelSlaTimersForLead`, `refreshActivitySlaTimers`, `fireSlaBreachAction` (Zod-validated Trigger.dev callback), `fireSlaBreachHandler` (8-step breach logic: stale-fire guard → call_count guard → recipient resolution → notification → auto-task dedup → activity log → timer mark fired)

**Hook points in `leads.ts`:**
- `assignLead` + `createManualLead` — after assignment: update `status_changed_at` + `last_activity_at`, schedule SLA-01 timers
- `updateLeadStatus` — after status write: update `status_changed_at`; terminal → cancel only; non-terminal → cancel + reschedule
- `addLeadCallNote` — after note write: update `last_activity_at`; auto-advanced new→touched → full SLA reset; else → refresh SLA-02/03 only

**UI:**
- `src/components/notifications/NotificationItem.tsx` — exhaustive switch extended: `sla_breach_agent` → `AlertTriangle` + `--color-warning-text`; `sla_breach_manager` → `AlertTriangle` + `--color-danger-text`

---

## 2026-05-29 — Group workspace page: Suspense streaming + WorkspaceSkeleton — perf

- `src/app/(dashboard)/tasks/[id]/page.tsx` — stripped to thin orchestrator; zero data-fetching; back link rendered immediately outside Suspense boundary
- `src/app/(dashboard)/tasks/[id]/WorkspaceAsync.tsx` — new async server component; `Promise.all([getTaskGroupById, getGroupSubtasks])`; null-group redirect lives here (not in page); passes serialisable plain objects to `GroupTaskWorkspace`
- `src/app/(dashboard)/tasks/[id]/WorkspaceSkeleton.tsx` — group header + view-toggle + 5 subtask row skeletons; stagger 0/80/160/240/320ms; `var(--theme-paper-subtle)` shimmer

---

## 2026-05-29 — Task system: getPersonalTasks unified onto single RPC (TD-003 resolved — priority sort consistent across all pages) — perf

- `supabase/migrations/20260529000026_get_personal_tasks_cursor.sql` — extends `get_personal_tasks` RPC with three cursor params (`p_cursor_id`, `p_cursor_due_at`, `p_cursor_has_due_at`); 4-case WHEN cursor WHERE clause handles all keyset pagination scenarios; sort order (`due_at ASC NULLS LAST → priority CASE → id ASC`) now identical on every page; drops old 6-param overload first to avoid creating a second overload
- `src/lib/services/tasks-service.ts` — split-path logic removed entirely; single unified RPC call path for both page 1 and pages 2+; no PostgREST query chain; no JS sort

---

## 2026-05-29 — Task system: DB index repair + query optimisation + Suspense streaming — Perf

Two-prompt performance hardening pass across the full task system stack.

### Prompt 1 — DB index repair + service query optimisation

- `supabase/migrations/20260529000025_task_performance_indexes.sql` — dropped and replaced `idx_tasks_assigned_to` and `idx_tasks_module` (both had `WHERE status = 'pending'` — invalid since migration 0017; fully inert); new conditions use `WHERE status NOT IN ('completed','cancelled','error')`; added `idx_tasks_agent_active` composite `(assigned_to, task_category, due_at ASC NULLS LAST)` covering the most frequent agent read; added `idx_tasks_tags_active` covering index `(assigned_to) INCLUDE (tags)` scoped to active personal tasks only; added `get_personal_tasks` RPC sorting `due_at ASC NULLS LAST → priority CASE (urgent=1,high=2,normal=3) → id ASC` at DB level (PostgREST cannot express `ORDER BY CASE`)
- `src/lib/services/tasks-service.ts` — `getPersonalTasks` JS `.sort()` removed; no-cursor path now calls `get_personal_tasks` RPC; cursor path retains PostgREST query; `getPersonalTaskTags` scoped to active tasks only (`.not('status','in','("completed","cancelled","error")')`); `getGroupTasks` wrapped in `unstable_cache` (60s TTL, cache tag `'group-tasks'`, domain in cache key — prevents cross-domain cache bleed)
- `src/lib/actions/tasks.ts` — `revalidateTag('group-tasks', { expire: 0 })` added to `createGroupTaskAction` and `createSubtaskAction` post-insert

### Prompt 2 — Tasks page Suspense streaming + deferred completed tasks

- `src/app/(dashboard)/tasks/page.tsx` — restructured as thin orchestrator; zero data-fetching in page body; `<Suspense fallback={<TasksSkeleton tab={tab}>}><TasksAsync /></Suspense>`
- `src/app/(dashboard)/tasks/TasksAsync.tsx` — new async server component; direct `<Suspense>` child; fetches active tab data only; passes serialisable plain objects to `TasksShell`
- `src/app/(dashboard)/tasks/TasksSkeleton.tsx` — two variants (personal: 3 priority headers + 5 rows each; group: 4 group cards); stagger 0/80/160/240/320ms per §11.4; `var(--theme-paper-subtle)` shimmer — zero hardcoded colour
- `src/components/tasks/PersonalTasksTab.tsx` — completed tasks no longer fetched on mount; `hasLoadedCompleted` ref set before action call fires (prevents double-fetch on rapid accordion toggle); loads lazily on first completed section expand only

---

## 2026-05-29 — Earth canvas: grain texture + radial washes

Earth canvas: grain texture + espresso/olive/umber radial washes. Base `#0d0c0a`. `.layout-canvas` class introduced.

- `src/styles/design-tokens.css` — `--theme-canvas` and `--theme-sidebar-bg` updated to `#0d0c0a` in `:root` and `[data-theme="earth"]`; Earth-specific `--theme-canvas-grain-opacity` and `--theme-canvas-gradient-*` tokens added (other themes omit these → flat canvas)
- `src/app/globals.css` — `html`/`body` base colour `#0d0c0a` to prevent load flash; `.layout-canvas` class with grain SVG data URI + theme-scoped gradient layers
- `src/app/(dashboard)/layout.tsx` — inline canvas background migrated to `.layout-canvas min-h-screen`
- `CLAUDE.md` + `.cursorrules` — File Locations, Theme Quick Reference, and Earth canvas enhancement phase entry
- `docs/design-dna.md` — Earth token map, §3.1 shell diagram, §3.5 canvas texture, §6.6 texture spec updated to `.layout-canvas`

---

## 2026-05-29 — Page title dot: blinking accent period on all primary nav pages

Introduced `eia-page-dot-blink` keyframe and `.page-title-dot` utility class as the standard for all primary navigation page titles. All existing pages retrofitted. Rule codified in CLAUDE.md, .cursorrules, and design-tokens.css.

- `src/styles/design-tokens.css` — `@keyframes eia-page-dot-blink` (2.4s ease-in-out, opacity 1 → 0.2 → 1); `.page-title-dot { color: var(--theme-accent); animation: eia-page-dot-blink 2.4s ease-in-out infinite; }`; `.type-page-title` comment updated to reference dot requirement
- `src/app/(dashboard)/tasks/page.tsx` — existing inline dot replaced with `type-page-title` + `page-title-dot` classes
- `src/app/(dashboard)/leads/page.tsx` — dot added
- `src/app/(dashboard)/performance/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/campaigns/page.tsx` — dot added
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/profile/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/error-log/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/admin/users/page.tsx` — page-level `<h1>` added (previously absent); dot added; Add Member button moved to page header row
- `CLAUDE.md` + `.cursorrules` — "Page title dot" rule added to Component Quick Reference

**Rule:** Every primary navigation page `<h1>` ends with `<span className="page-title-dot">.</span>`. Use `className="type-page-title"` on the `<h1>`. Detail pages with back links (leads/[id], campaigns/[id], admin/users/[id]) are exempt.

---

## 2026-05-29 — TabSelector pill: dark canvas chip fill

Visual upgrade — zero structural changes. Active tab now renders as a dark canvas chip on the light tray, matching the sidebar/canvas aesthetic. All five themes correct — both `--theme-canvas` and `--theme-canvas-text` are theme-scoped tokens.

- `src/components/ui/TabSelector.tsx` — pill `motion.span`: `background` changed from `--theme-accent-surface` to `--theme-canvas`; `border` changed from `--theme-paper-border` to `--theme-sidebar-border`; `box-shadow` upgraded from `--shadow-1` to `--shadow-2`. Active text: changed from `--theme-accent` to `--theme-canvas-text`, moved onto an inner `<span style="position:relative; z-index:1">` content wrapper so the colour transition (`color var(--duration-fast) var(--ease-in-out)`) applies to the label only and doesn't colour the absolute pill element. Button root colour set to `transparent` for pill variant. `border-bottom` and `connected` variants, `TabsContent`, `TabsProps`, `TabsList`, `TabSelector` wrapper — all unchanged.
- `src/components/CLAUDE.md` — `TabSelector` row updated: pill canvas fill, `--theme-canvas-text` active label, z-index content span requirement documented.

---

## 2026-05-29 — TabSelector: compound component upgrade

TabSelector upgraded to compound component architecture. Controlled/uncontrolled support, `indicatorLayoutId`, `animatedContent`, and `forceMount` scroll preservation. `TabSelector` flat-prop wrapper retained for full backwards compatibility — all existing consumers unchanged.

- `src/components/ui/TabSelector.tsx` — exports `Tabs` (root), `TabsList`, `TabsTrigger`, `TabsContent` as named compound components. `TabsContext` provides `value`, `onValueChange`, `layoutId`, `animatedContent`, `variant` — children read from context, eliminating prop drilling. Controlled/uncontrolled pattern: `value` + `defaultValue` + `onValueChange`. `TabsContent` uses `display:none` (not unmount) to preserve scroll position per tab — `forceMount` behaviour. Inner `motion.div` rendered conditionally so `AnimatePresence mode="wait"` works correctly. Spring indicator uses `SPRING_CONFIG` from `motion.ts` — no hardcoded `stiffness`/`damping`. All three variants (`pill`, `border-bottom`, `connected`) preserved. `TabSelector` flat-prop wrapper composes the compound API internally — zero changes needed at existing call sites.
- `src/lib/constants/motion.ts` — `SPRING_CONFIG` added: `{ type: 'spring', stiffness: 400, damping: 30 }`. Shared by all tab indicator animations. No hardcoded spring values in components.
- `src/components/CLAUDE.md` — compound API documented: `Tabs` props, `indicatorLayoutId` collision warning, `forceMount` + Realtime subscription audit requirement, `AnimatePresence` behaviour.

---

## 2026-05-29 — BarChart `colorMap` prop added. ManagerCampaignWidget adopted wrapper. Flag 4 cleared.

- `src/components/ui/charts/useChartTokens.ts` — `resolveColorMap(map: Record<string, string>)` exported. Resolves CSS variable strings (e.g. `"var(--color-info)"`) to computed hex/rgb values via `getComputedStyle`. Required because SVG `fill`/`stroke` attributes do not resolve CSS custom properties in all browsers (notably older Safari). Re-export pattern is identical to what `useChartTokens` does internally.
- `src/components/ui/charts/BarChart.tsx` — `colorMap?: Record<string, string>` prop added. Values are resolved via `resolveColorMap` on mount and re-resolved on `data-theme` attribute change (same `MutationObserver` approach as `useChartTokens`). `colorMap[key] ?? positionalColor` fill logic — partial maps are valid; unmatched keys fall back to positional tokens. Built-in Recharts `<Legend>` is suppressed when `colorMap` is provided (caller owns the legend). Additional passthrough props added: `margin`, `barCategoryGap`, `xAxisProps`, `yAxisProps`, `tooltipProps`, `gridProps` — removes the need for split rendering (some Recharts primitives in wrapper, some inline).
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — inline Recharts import replaced with `ui/charts/BarChart`. `CHART_SERIES` static constant (7 statuses, labels from `LEAD_STATUS_LABELS`) defined above the component. `colorMap={STATUS_COLORS}` passed as bridge — `STATUS_COLORS` stays in the feature folder (domain knowledge). `stacked` prop preserves stacked layout. Inline legend unchanged — reads `STATUS_COLORS` directly, same source as `colorMap`; legend and bars always in sync. Zero `<Cell>` in migrated code — fill is on `<Bar>` via wrapper.
- `docs/component-sweep-flags.md` — Flag 4 marked resolved.
- `src/components/CLAUDE.md` — `BarChart` row updated with `colorMap` prop contract and `STATUS_COLORS` pattern. `resolveColorMap` documented on `useChartTokens` row.

---

## 2026-05-29 — InfoRow micro-sweep complete. Flag 7 cleared.

InfoRow micro-sweep complete. 10 replacements across 2 files. Flag 7 cleared.

- `src/components/leads/LeadInfoCard.tsx` — 8 contact-field rows migrated from local `DatumRow`/`DatumValue` to `InfoRow`. `DatumRow`, `DatumValue`, and `DATUM_ICON_STYLE` deleted (no other file imported them). Full Name row uses `style={{ gridColumn: '1 / -1' }}` on `InfoRow` root — verified `style` pass-through lands on root element, not inner wrapper.
- `src/components/tasks/SubTaskModal.tsx` — Deadline and Assigned To key-variable rows migrated to `InfoRow` with icon + `React.ReactNode` values (mono date, italic empty state, Avatar composite).
- `docs/component-sweep-flags.md` — Flag 7 marked resolved. 10 unsafe candidates documented (forms, dt/dd grid, attribution strip, metric cards, edit-mode fields).
- `src/components/CLAUDE.md` — `InfoRow` row updated: `value` accepts `React.ReactNode`; `style`/`className` root pass-through documented. Reference implementation updated from deleted `DatumRow` to `InfoRow`.

---

## 2026-05-29 — Tasks UI: contextual header button + SubTaskModal polish + bug fixes

- `src/app/(dashboard)/tasks/TasksShell.tsx` — `createTrigger: number` state added; header row now flex `space-between` with tabs on the left and a contextual `+ My Task` / `+ Group Task` accent button on the right; button label switches live with the active tab; button hidden on Group tab for agents (mirrors server-side auth guard); `useState`, `Plus` (lucide) imported.
- `src/components/tasks/PersonalTasksTab.tsx` — toolbar div (New Task button) removed; `createTrigger?: number` prop added; `useEffect` opens modal when `createTrigger > 0`; unused `Plus` import removed.
- `src/components/tasks/GroupTasksTab.tsx` — toolbar div (New Group Task button) removed; `createTrigger?: number` prop added; `useEffect` opens modal when `createTrigger > 0`.
- `src/components/tasks/SubTaskModal.tsx` — three non-existent CSS tokens fixed throughout: `--theme-surface` → `var(--theme-paper)` (4×), `--theme-surface-secondary` → `var(--theme-paper-subtle)` (8×), `--theme-border` → `var(--theme-paper-border)` (20×); `--theme-overlay` backdrop → `rgba(0,0,0,0.5)`; `backdropFilter: blur` removed (not a sanctioned surface); panel centering shifted to `left: 240px` so modal centers in the content area, not the full viewport including sidebar; `currentUserName` prop added and threaded to `TaskRemarksPanel`.
- `src/components/tasks/TaskRemarksPanel.tsx` — status-change pill row above composer removed (6 pills, grid layout, `ALL_STATUSES`, `TASK_STATUS` import, injected `<style>`, `statusChange` state, `handleStatusToggle`); panel header ("Updates" label) removed; message list redesigned as floating `var(--theme-paper)` cards with `var(--shadow-1)` per message; Zone B background transparent with two ambient CSS-only orbs (`trp-orb-a` / `trp-orb-b`) — GPU-only `transform + opacity` animation, `will-change`, `pointer-events: none`, `aria-hidden`; composer upgraded to `var(--theme-paper)` + `var(--shadow-2)` floating card; `seenIds` ref (seeded from `initialRemarks`) added as primary Realtime dedup guard — prevents Strict Mode double-mount from appending the same row twice regardless of content match; echo dedup changed from content-match to `author_id === currentUserId + any pending optimistic row` (content-match was broken because `sanitizeText` alters strings server-side); `TASK_STATUS` import removed.
- `src/components/tasks/GroupTaskWorkspace.tsx` — `currentUserName` prop now passed to `SubTaskModal`.

---

## 2026-05-29 — `MotionButton` wrapper shipped. `Button` converted to `forwardRef`. Flag 6 infrastructure complete.

- `src/components/ui/Button.tsx` — converted from plain function to `React.forwardRef`. Required by Framer Motion's `motion()` factory. Zero API changes — all existing call sites unaffected. `ref` forwarded to underlying `<button>`.
- `src/components/ui/MotionButton.tsx` — `motion(Button)` wrapper. Accepts all `ButtonProps` plus Framer Motion props (`whileHover`, `whileTap`, `animate`, `initial`, `exit`, `layoutId`). Exports `MOTION_BUTTON_DEFAULTS` for standard press-down feel: `whileTap: { scale: 0.97 }`, spring transition with `INSTANT_DURATION` (100ms). Zero Button internals duplicated.
- Full audit of `src/`: confirmed 1 actual `motion.button` instance (not 6 — original flag conflated raw `<button>` with `motion.button`). That instance (`GroupTasksTab` "Add subtask" trigger) is a full-width layout button that cannot map to `Button` variant props — documented as open sub-flag in `docs/component-sweep-flags.md`.
- `docs/component-sweep-flags.md` — Flag 6 marked partially resolved; sub-flag documented.
- `src/components/CLAUDE.md` — `MotionButton` and `Button` (forwardRef note) rows updated.

---

## 2026-05-29 — `TabSelector`: `connected` variant added. `CreateUserForm` adoption complete. Flag 3 cleared.

- `src/components/ui/TabSelector.tsx` — `connected` added to `TabSelectorVariant` union (`'pill' | 'border-bottom' | 'connected'`). Container: `border: 1px solid var(--theme-paper-border)`, `--radius-md`, `--theme-paper-subtle` bg, `2px` inset padding. Active tab: `motion.span layoutId="tab-connected"` slides via same spring (stiffness 400, damping 30) shared by all three variants. Active tab bg is `--theme-paper` + `--shadow-1`. Active text is `--theme-text-primary`; inactive is `--theme-text-secondary`. Tabs `flex: 1` inside connected container. `SPRING_TRANSITION` constant extracted at module level — all three `motion.span` indicators now share it.
- `src/components/admin/CreateUserForm.tsx` — inline 25-line mode-switcher (two raw `<button>` elements) removed. `TabSelector` imported. `MODE_TABS` constant (static `TabItem[]`) added above component. Call site: `<TabSelector variant="connected" tabs={MODE_TABS} activeTab={mode} onChange={(id) => setMode(id as ...)} />`. `useState<"password" | "invite">` preserved unchanged — no logic touched.
- `docs/component-sweep-flags.md` — Flag 3 marked resolved.
- `src/components/CLAUDE.md` — `TabSelector` row updated with `connected` variant description.

---

## 2026-05-29 — `AvatarStack` component shipped. `GroupTasksTab` adoption complete. Flag 1 cleared.

- `src/components/ui/AvatarStack.tsx` — new display-only component. Props: `users: AvatarStackUser[]`, `max?: number` (default 4), `size?: AvatarSize` (default `sm`), `overlap?: number` (default 8px). Separator ring on each avatar: `box-shadow: 0 0 0 2px var(--theme-paper)` — no layout shift. Overflow pill: `+N`, `--radius-full`, paper-subtle background, same `size` dimensions. Hover spread: Framer Motion `whileHover` + per-item `x` variant (`i * overlap/2`) — zero margin/padding animation (rule compliant). Overflow pill also spreads on hover.
- `src/components/ui/Avatar.tsx` — `box-shadow` composition fix: `callerShadow` and `selectedShadow` are comma-joined so `AvatarStack`'s separator ring and `selected` accent ring coexist. Neither overwrites the other. `style.boxShadow` destructured before spread; `restStyle` applied without conflict.
- `src/components/tasks/GroupTasksTab.tsx` — inline `AvatarStack` function (48 lines) removed. Import updated to `ui/AvatarStack`. `avatarExtra` computation removed. Call site maps `assignee_previews → AvatarStackUser[]` (`full_name → name`, `avatar_url → imageUrl`).
- `docs/component-sweep-flags.md` — Flag 1 marked resolved.
- `src/components/CLAUDE.md` — `AvatarStack` row added; `Avatar` row updated with composition rule note.

---

## 2026-05-29 — Avatar: `selected` prop + accent ring. ManagerLeadVolumeWidget: chart colour wired to `useChartTokens`. Flags 2 + 5 cleared.

- `src/components/ui/Avatar.tsx` — `selected?: boolean` added to `AvatarProps`. When `true`: `box-shadow: 0 0 0 2px var(--theme-paper), 0 0 0 4px var(--theme-accent)` ring rendered via CSS `box-shadow` (not `border`) — zero layout shift, ring paints outside the element. Animates via `transition: box-shadow var(--transition-interactive)`. No Framer Motion. No size change. Unblocks `AssigneePickerModal` migration (Flag 2 cleared).
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `useChartTokens()` called inside the component. `Line` `stroke` and `activeDot.fill` now use `chartColors[0]` (runtime-resolved `--theme-accent` hex via `getComputedStyle`). Fixes SVG attribute color resolution across browsers (SVG does not resolve CSS custom properties natively in all engines). Chart repaints on theme switch via the hook's `MutationObserver`. (Flag 5 cleared.)
- `docs/component-sweep-flags.md` — Flags 2 and 5 marked resolved with resolution notes.
- `src/components/CLAUDE.md` — `Avatar` row updated with `selected` prop description and ring pattern.

---

## 2026-05-29 — Component sweep — 33 safe inline UI patterns replaced with `src/components/ui/` library

Adoption sweep across all of `src/`. Zero functional changes. `pnpm tsc --noEmit` passes with zero errors after all replacements. 7 items flagged in `docs/component-sweep-flags.md`.

**Replacements made (33 total across 20 files):**

- `Spinner` adopted in: `CalledModal`, `AgentScratchpad`, `PersonalDetailsCard`, `ProfileAvatarSection` — all `Loader2` inline spinners removed
- `Button` adopted in: `login-form`, `forgot-password-form`, `update-password-form`, `CreateUserForm`, `EditAuthorizationForm`, `EditProfileForm`, `ProfileDetailsForm`, `PasswordChangeForm`, `CalledModal`, `StatusActionPanel`, `AddLeadModal`, `AddLeadButton`, `PersonalDetailsCard`, `AgentTasksWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` — all inline primary `<button>` elements removed
- `Toggle` adopted in: `NotificationPreferences`, `UserStatusControls` — custom `<button role="switch">` removed, helper functions `toggleStyle`/`thumbStyle` deleted
- `Avatar` adopted in: `TaskRemarksPanel`, `SubTaskModal`, `PersonalTasksTab`, `CreateGroupTaskModal`, `GroupTaskWorkspace`, `GroupTasksTab`, `UsersTable` — all local `getInitials()` helpers removed
- `SearchBar` adopted in: `UsersTable` — inline search `<input>` with manual icon positioning removed
- `Table` adopted in: `UsersTable` — raw `<table>/<thead>/<tbody>/<tr>/<td>` removed
- `TabSelector` (pill) adopted in: `ManagerLeadVolumeWidget`, `PerformancePeriodSelector` — inline period toggle buttons removed
- `TabSelector` (border-bottom) adopted in: `TasksShell` — custom underline tab bar with `onMouseEnter`/`onMouseLeave` imperative style mutations removed

**Flagged (7 items — not touched):** `AvatarStack` (no ui component), `AssigneePickerModal` selected avatar state, `CreateUserForm` connected-tab visual, `ManagerCampaignWidget` Recharts (7 semantic colors), `ManagerLeadVolumeWidget` Recharts (`--theme-accent` vs `--chart-1`), task icon-only `motion.button` instances (6 files), InfoRow candidates (not individually verified). See `docs/component-sweep-flags.md`.

---

## 2026-05-29 — Rule Q-12: mandatory codebase search before creating any code unit

- `docs/The_Rules.md` — Q-12 added to Section 6 (Code Quality): before creating any component, hook, util, or service function, search the codebase for an existing equivalent first; search by behaviour not filename; creating a duplicate is a violation regardless of whether names differ; applies to components, hooks, utils, service functions, constants, Zod schemas.
- `docs/The_Rules.md` — Section 8 (Never-Do List) updated: `NEVER create a component, hook, util, or service without first searching the codebase for an existing equivalent — search by behaviour, not filename (Q-12)`.
- `CLAUDE.md` + `.cursorrules` — new "Before Writing Any Code — Mandatory Sequence" block added above "When in Doubt": three-step order (read authority files → search by behaviour → write code). Replaces the implicit assumption that agents search before building.

---

## 2026-05-29 — UI-Foundation post-ship: useChartTokens MutationObserver + Table boundary docs

- `src/components/ui/charts/useChartTokens.ts` — `MutationObserver` added on `document.documentElement` watching `data-theme` attribute mutations. On every theme switch, `resolveTokens()` fires and all chart colours update immediately. No caller needs to pass `themeKey` in production — the hook is self-contained. `themeKey` prop kept as SSR/test escape hatch only. Observer cleaned up on unmount (`observer.disconnect()`).
- `src/components/ui/Table.tsx` — JSDoc added to `TableColumn<T>` clarifying the intended use boundary: Table<T> is for secondary/admin tables (audit logs, reporting grids). It is explicitly not intended to replace bespoke feature tables (LeadsTable, future task table) that need custom toolbars, column pickers, and drag-to-reorder. Prevents future misuse.
- `src/components/CLAUDE.md` — Three architectural decisions locked: (1) visual test surface = `/dev/components` route (no Storybook), (2) `useChartTokens` is MutationObserver-driven, (3) `Table<T>` vs bespoke feature table boundary.

---

## 2026-05-29 — Phase UI-Foundation — Component library shipped

Full display-only, token-compliant, theme-aware UI component library. All components live in `src/components/ui/`. All colours are CSS variables — zero hardcoded hex in any `.tsx` file. Zero business logic. Zero DB calls. `pnpm tsc --noEmit` passes with zero errors.

**New files:**

- `src/lib/constants/motion.ts` — shared Framer Motion constants (`ENTER_DURATION`, `EXIT_DURATION`, `EASE_OUT_EXPO`, `EASE_IN_EXPO`, `EASE_SPRING`, `EASE_IN_OUT`, `MODAL_VARIANTS`, `DROPDOWN_VARIANTS`, `FADE_VARIANTS`). All animation components import from here — never re-declare inline.
- `src/components/ui/Spinner.tsx` — three sizes (sm/md/lg); reuses `eia-spin` keyframe; canvas variant.
- `src/components/ui/Button.tsx` — five variants (primary/secondary/ghost/danger/success); four sizes; loading state; iconLeft/iconRight slots; `--theme-accent-fg` on primary (V-02 compliant).
- `src/components/ui/Avatar.tsx` — five sizes; square `--radius-md`; initials fallback with 6 semantic colour pairs from name hash (colour variety guaranteed); `loading="lazy"` (P-04).
- `src/components/ui/SearchBar.tsx` — controlled; Lucide Search icon; clear button; focus ring `--shadow-focus`; three sizes; `--theme-accent` border on focus.
- `src/components/ui/InfoRow.tsx` — label/value pair; optional icon; optional copy-to-clipboard; horizontal/stacked; border-bottom divider.
- `src/components/ui/TabSelector.tsx` — spring pill (Framer Motion `layoutId`); pill and border-bottom variants; count badge; `activeTab`/`onChange` API.
- `src/components/ui/Dialog.tsx` — Eia overlay (`--theme-canvas` at 0.72 opacity); `--theme-paper` surface; `--shadow-4`; `--radius-xl`; Framer Motion `AnimatePresence`; five sizes (sm/md/lg/xl/full); `--duration-enter`/`--duration-exit`; `EASE_OUT_EXPO`/`EASE_IN_EXPO`.
- `src/components/ui/FilterDropdown.tsx` — trigger with icon + label + chevron + active count badge; `--theme-paper` menu; `--shadow-3`; multi-select (checkbox) and single-select modes; `DROPDOWN_VARIANTS`.
- `src/components/ui/Table.tsx` — generic `TableColumn<T>` / `TableProps<T>`; sticky header option; `--theme-paper-subtle` header bg; selected row `--theme-accent-surface`; `virtualized` prop; dev-only `console.warn` when `rowCount > 100 && !virtualized` (P-03).
- `src/components/ui/ListRow.tsx` — left slot (avatar/icon), primary text, secondary text, right slot, optional chevron; `--theme-paper` bg; hover `--theme-paper-subtle`; `--radius-md`.
- `src/components/ui/ProgressBar.tsx` — auto-intent (value<33→danger, 33–66→warning, >66→success); `intent` override prop; Framer Motion fill animation (`--ease-spring`, `--duration-slow`); label slot.
- `src/components/ui/Toggle.tsx` — sm/md sizes; spring thumb animation; label + description slot; `--theme-accent` on track when checked.
- `src/components/ui/ChecklistItem.tsx` — `CheckSquare2`/`Square` icons; checked state: label strikethrough + `--color-success` icon.
- `src/components/ui/Checklist.tsx` — ordered list of `ChecklistItem`; `ProgressBar` at top; composes both without duplication.
- `src/components/ui/RadioGroup.tsx` — default and card variants; card fills `--theme-accent-surface` when selected; filled circle indicator.
- `src/components/ui/Calendar.tsx` — month grid; Framer Motion slide between months (`--ease-spring`); today underline dot; selected filled `--theme-accent`; range highlight `--theme-accent-surface`.
- `src/components/ui/DatePicker.tsx` — trigger + popover mounting `Calendar`; `DROPDOWN_VARIANTS`; focus ring `--shadow-focus`.
- `src/components/ui/EditButton.tsx` — icon-only Pencil button; ghost default; accent on hover; "Edit" tooltip; composes hover states without re-implementing Button internals.
- `src/components/ui/Accordion.tsx` — `ChevronDown` rotating 180° (`--ease-spring`); `AnimatePresence` height animate; single/multiple type; border `--theme-paper-border`; trigger bg `--theme-paper-subtle` when open.
- `src/components/ui/Modal.tsx` — semantic wrapper around `Dialog.tsx`; standard type exposes title/description/footer slots; `type="lia"` enforces exactly two actions (Approve + Dismiss) with `LiaGlyph` breathing; `maxWidth` prop for backward compat with existing callers.
- `src/components/ui/charts/useChartTokens.ts` — resolves 6 series colours + grid/axis/tooltip tokens from `getComputedStyle` at runtime; `themeKey` dep triggers re-resolve on theme switch; fallback values = Earth theme resolved values (only used SSR / before mount).
- `src/components/ui/charts/ChartSkeleton.tsx` — skeleton block matching chart dimensions; reuses `.skeleton` class (`eia-skeleton-pulse`).
- `src/components/ui/charts/LineChart.tsx` — Recharts `LineChart`; all colours via `useChartTokens`; `loading` → `ChartSkeleton`.
- `src/components/ui/charts/BarChart.tsx` — Recharts `BarChart`; stacked option; top-radius-only bars per §16.4; `Cell` per bar.
- `src/components/ui/charts/PieChart.tsx` — Recharts `PieChart`; token colours; legend.
- `src/components/ui/charts/DonutChart.tsx` — Recharts `PieChart` with `innerRadius`; optional `centerLabel` slot.
- `src/components/ui/charts/AreaChart.tsx` — Recharts `AreaChart`; gradient fill via `linearGradient` (token colour, not hex); stacked option.
- `src/components/ui/charts/ButterflyChart.tsx` — Recharts `BarChart` `layout="vertical"` with negative left series; axis formatter strips minus sign.

**Sign-off passed:**
- `pnpm tsc --noEmit` → 0 errors
- `grep` for `text-gray|bg-white|bg-black|text-white|#[hex]` in `src/components/ui/**/*.tsx` → 0 results
- Every component exports a named TypeScript interface for its props
- `Avatar` fallback: 6 semantic colour pairs derived from name hash — guaranteed variety
- `ProgressBar` auto-intent: 20→danger, 50→warning, 80→success ✓
- Charts: all colours resolved via `useChartTokens` at runtime — zero hardcoded hex passed to Recharts props ✓
- `Dialog` enter = `ENTER_DURATION` (400ms), exit = `EXIT_DURATION` (250ms) — matches tokens ✓
- `Table` logs dev-only `console.warn` when `rowCount > 100 && !virtualized` ✓
- No new Framer Motion keyframes — reuses `eia-spin`, `eia-skeleton-pulse` from `design-tokens.css` ✓
- No component imports from feature folders ✓
- No `useState` for data fetching in any component ✓

---

## 2026-05-29 — SubTaskModal: fix transparent background (bogus tokens)

- `src/components/tasks/SubTaskModal.tsx` — three non-existent CSS tokens replaced throughout: `--theme-surface` → `var(--theme-paper)` (4 occurrences), `--theme-surface-secondary` → `var(--theme-paper-subtle)` (8 occurrences), `--theme-border` → `var(--theme-paper-border)` (20 occurrences); `--theme-overlay` (backdrop) → `rgba(0,0,0,0.5)` matching `ui/modal.tsx` canonical; `backdropFilter: blur(4px)` removed from backdrop per NEVER rule (blur only sanctioned on TopBar, mobile sidebar overlay, command palette).

---

## 2026-05-29 — Task tags: DB persistence + tag filter

- `supabase/migrations/20260529000024_task_tags.sql` — `tags text[] NOT NULL DEFAULT '{}'` added to `tasks`; GIN index `idx_tasks_tags_gin` (partial: `task_category='personal'`) for array containment queries.
- `src/lib/types/database.ts` — `Task.tags: string[]` added; `Insert` type updated to make `tags` optional.
- `src/lib/validations/task-schemas.ts` — `CreatePersonalTaskSchema` now includes `tags: z.array(...).max(10).default([])`; new `UpdateTaskTagsSchema` + `UpdateTaskTagsInput` exported.
- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.tags?: string[]` added; `getPersonalTasks` applies `.contains('tags', filters.tags)` when tags are provided; new `getPersonalTaskTags(userId)` returns sorted distinct tags for a user.
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction` now writes `tags` to DB; new `updateTaskTagsAction` (full replace, auth-gated); new `getPersonalTaskTagsAction` read action.
- `src/components/tasks/CreatePersonalTaskModal.tsx` — "Saved locally only (DB column pending)" stub removed; `tags` now passed to `createPersonalTaskAction` and included in `syntheticTask`; `useCallback` dep array updated.
- `src/components/tasks/PersonalTasksTab.tsx` — `availableTags` + `selectedTags` state added; tags loaded in parallel with tasks on mount; tag filter bar renders when tags exist (pill toggles, "Clear" link); `tasksByPriority` grouping filters by `selectedTags` client-side; empty state copy adapts to tag-filtered state.

---

## 2026-05-29 — Tasks ecosystem design polish

- `src/app/(dashboard)/tasks/page.tsx` — page `<h1>` converted from Tailwind `type-page-title` class to full inline token composition; accent period `<span style="color: var(--theme-accent)">.</span>` added per design-dna §03.
- `src/app/(dashboard)/tasks/TasksShell.tsx` — tab bar: tabs renamed "My Tasks" / "Group Tasks"; tab height set to 40px; `display: inline-flex` + `align-items: center` for correct vertical centering; font-weight upgraded to `--weight-medium` on inactive tabs; hover transition narrowed to `color + background` only; `transition: all` removed.
- `src/components/tasks/PersonalTasksTab.tsx` — "New Task" button: `--radius-md` → `--radius-sm` (§5.01 buttons always `--radius-sm`), fixed height 36px, opacity hover → `--theme-accent-hover` background per §5.01 state spec; completion circle and arrow button: `width/height '24px'` → `var(--space-6)`; assignee avatar: `'20px'` → `var(--space-5)`; task-count pill: `'1px'` padding → `var(--space-px)`; quick-add date input `'3px'` padding → `var(--space-1)`; assignee button `'28px'` → `var(--space-7)`; initials `'9px'` fontSize → `var(--text-2xs)`; cancel button `'24px'` → `var(--space-6)`.
- `src/components/tasks/GroupTasksTab.tsx` — "New Group Task" button: same fixes as above (radius, height, hover); AvatarStack: `'22px'` → `var(--space-6)`, `'8px'` fontSize → `var(--text-2xs)` throughout; group description `marginTop: '2px'` → `var(--space-px)`; "Open" link gap `'3px'` → `var(--space-1)`; group + subtask status pills: `'3px'/'2px'` padding → token equivalents, `'11px'` fontSize → `var(--text-xs)`, `'4px'` gap → `var(--space-1)`, `box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06)` added per §07 (pill shadow rule); subtask assignee avatar: `'20px'` → `var(--space-5)`, `'7px'` fontSize → `var(--text-2xs)`; add-subtask picker button `'26px'` → `var(--space-7)`, `'8px'` fontSize → `var(--text-2xs)`, save button `'2px'` padding → `var(--space-1)`; group empty state: card border + shadow added per §04 + §05.
- `src/components/tasks/CreateGroupTaskModal.tsx` — `max-w-3xl` → `max-w-2xl`; preview column 280px → 200px; two-column gap `--space-8` → `--space-6`; V-01 violations: `rgba(255,255,255,0.85)` swatch ring → CSS border/outline pattern; `'8px'/'9px'` fontSize → `var(--text-2xs)`; `'3px'` padding → token equivalents; `var(--space-9)` (non-existent) → `var(--space-8)`; icon buttons given fixed `height: 32` instead of bare padding; textarea `resize: none` → `resize: vertical`; `margin: '0 0'` on divider removed.

---

## 2026-05-29 — SubTaskModal + task attachments (checklist)

- `supabase/migrations/20260529000023_task_attachments.sql` — `ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'` to `tasks`; CHECK constraint `tasks_attachments_is_array` validates JSON array type; intentionally excluded from `log_task_changes()` trigger (auditing checklist toggles would flood `task_audit_log`).
- `src/lib/types/database.ts` — `ChecklistItem` type (`{ id, text, checked }`) added and exported; `Task.attachments: ChecklistItem[]` added.
- `src/lib/validations/task-schemas.ts` — `UpdateChecklistSchema` + `UpdateChecklistInput` added.
- `src/lib/actions/tasks.ts` — `updateChecklistAction` added: Zod → auth → RLS (user client) → application-layer canMutateTask → adminClient UPDATE; returns `ChecklistItem[]`.
- `src/components/tasks/SubTaskModal.tsx` — new `'use client'` component replacing `TaskModal.tsx`. Centered overlay (not bottom sheet). `max-width: 1100px`, `height: 90vh`. Scale entrance 0.96→1. Header: breadcrumb + status/priority inline dropdowns (optimistic) + edit pencil + ⋯ delete menu + ×. Zone A (38%): title, notes/objective, checklist with `@dnd-kit/sortable` in edit mode, key variables, metadata. Zone B (62%): `TaskRemarksPanel` with `composerPlaceholder` prop. Edit mode save calls `updateTaskAction` only — never inserts a remark. `AnimatePresence` must wrap conditional at call site.
- `src/components/tasks/TaskRemarksPanel.tsx` — `composerPlaceholder?: string` prop added (default `"Add an update…"`); textarea uses prop value.
- `src/components/tasks/TaskModal.tsx` — **deleted**. All call sites updated to `SubTaskModal`.
- `src/components/tasks/GroupTaskWorkspace.tsx`, `GroupTasksTab.tsx`, `PersonalTasksTab.tsx` — `TaskModal` import replaced with `SubTaskModal`; `AnimatePresence` wrapping added at call sites; props updated to new shape.
- `src/components/CLAUDE.md`, `src/app/(dashboard)/CLAUDE.md`, `supabase/migrations/CLAUDE.md` — updated to reflect SubTaskModal and migration 0023.

---

## 2026-05-29 — CreateGroupTaskModal

- `src/lib/constants/task-constants.ts` — `GROUP_TASK_ACCENT_COLORS` (10 muted hex colours with id/hex/label) and `GROUP_TASK_ICONS` (25 Lucide icon names as id/label pairs) added; both with TODO comments noting the DB columns they need.
- `src/components/tasks/CreateGroupTaskModal.tsx` — new `'use client'` modal composing `ui/modal.tsx` (`max-w-3xl`); two-column layout (280px preview + form, collapses to single-column at ≤640px); live preview card updates on every keystroke; fields: Title, Description, Domain (APP_DOMAINS select), Accent Colour swatches, Icon grid (dynamic Lucide lookup), Priority chips, Due Date, Add Members; accent_color/icon_key/memberIds are UI-only — no DB columns yet, NOT passed to `createGroupTaskAction`; member search stubs to empty until `searchProfilesAction` exists; `useTransition` + `isPending` guard; `onCreated` receives synthetic `TaskGroup` on success.
- `src/components/tasks/GroupTasksTab.tsx` — `groupRows` local state (initialized from `initialRows`); "New Group Task" toolbar button added (visible to manager/admin/founder only); `handleGroupCreated` converts `TaskGroup` → `TaskGroupRow` and prepends; empty-state copy updated to mention the button; `CreateGroupTaskModal` wired.
- `src/components/CLAUDE.md` — `CreateGroupTaskModal` contract section added.

---

## 2026-05-29 — CreatePersonalTaskModal

- `src/components/tasks/CreatePersonalTaskModal.tsx` — new `'use client'` modal composing `ui/modal.tsx`; fields: Title (autofocus, auto-grow 1→3 lines), Due date (Today/Tomorrow/Next week preset chips + specific `datetime-local` toggle; presets use IST end-of-day via explicit UTC+5:30 offset), Priority (Urgent/High/Normal single-select chips from `TASK_PRIORITY`; Normal is default/fallback), Tags (free-text chip input, Enter/comma to add, max 10; UI-only — `tasks.tags` column does not exist yet), Notes (collapsed "+ Add notes" toggle); client-side Zod validation before action call; `useTransition` + `isPending` guard; on success: `onCreated(syntheticTask)` fires so parent can prepend without re-fetch; on error: `toast.danger`, modal stays open.
- `src/components/tasks/PersonalTasksTab.tsx` — "New Task" header button now opens `CreatePersonalTaskModal` (was: inline quick-add row). Quick-add row is unchanged and independent. `onCreated` handler prepends the returned task to `activeTasks` state — no re-fetch needed. `createModalOpen` state added.
- `src/components/CLAUDE.md` — `CreatePersonalTaskModal` contract section added.

---

## 2026-05-29 — Group Task Workspace (`/tasks/[id]`)

- `src/lib/services/tasks-service.ts` — `getTaskGroupById(groupId): Promise<TaskGroup | null>` added; server Supabase client; RLS enforces domain-scoped access; null means no access or not found.
- `src/lib/actions/tasks.ts` — `getTaskGroupByIdAction(groupId)` added; thin wrapper; returns `ActionResult<TaskGroup>`.
- `src/app/(dashboard)/tasks/[id]/page.tsx` — new Server Component; fetches `getTaskGroupById` + `getGroupSubtasks` in parallel; null group → `redirect('/tasks?tab=group')` (no 404); passes data as props to `GroupTaskWorkspace`.
- `src/components/tasks/GroupTaskWorkspace.tsx` — new `'use client'` component; List view (priority DESC + due_at ASC) + Board view (5 columns: To Do, In Progress, In Review, Completed, Error/Cancelled); view persisted to `localStorage` at `eia:tasks:workspace-view:${groupId}` (default `'list'`, hydrated after mount — no SSR mismatch); Realtime subscription `workspace-subtasks-${groupId}-${mountId}`; click row/card → `TaskModal`; status changes re-sync via `getGroupSubtasksAction` on modal close; floating `+ Add subtask` FAB (title + assignee + priority + due date; `createSubtaskAction`; re-fetches on success); no drag-and-drop; no inline complete.
- `src/components/tasks/GroupTasksTab.tsx` — "Open" link added to each group header row; `Link href="/tasks/${group.id}"` with `e.stopPropagation()` on click/keydown to prevent accordion expand.
- `src/app/(dashboard)/CLAUDE.md` — Group Task Workspace route documented.
- `src/components/CLAUDE.md` — `GroupTaskWorkspace` contract section added.

---

## 2026-05-29 — PersonalTasksTab full redesign: priority sections + completion circles

- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.limit?: number` added (capped at 500 in service; default `PERSONAL_TASKS_PAGE_SIZE`); `getPersonalTasks` now derives `pageSize` from `filters.limit`, uses it for both the DB `.limit()` and the `hasMore` / `page.slice()` logic.
- `src/components/tasks/PersonalTasksTab.tsx` — **full rewrite**. Removed: filter bar (status pills, priority pills, due date range), cursor-stack pagination, `quickPriority` state. Added: three active priority sections (URGENT / HIGH / NORMAL) + COMPLETED section (collapsed by default, last 20); section collapse via `useRef` (never `useState`) so optimistic updates don't collapse sections; completion circle (24px) per row — own tasks clickable, assigned-to-other dashed non-interactive; optimistic status map keyed by `taskId` with rollback on error; due date chip (`var(--color-danger-text)` overdue / `var(--color-warning-text)` today / tertiary future); quick-add `useTransition` guard preserved from Problem 7; priority defaults to `'normal'` in quick-add; data fetched via parallel `Promise.all` on mount with `limit: 500` for active and `limit: 20` for completed.
- `src/components/CLAUDE.md` — `PersonalTasksTab` contract section added.

---

## 2026-05-29 — TaskModal redesign: TaskRemarksPanel replaces TaskChatPanel

- `src/components/tasks/TaskRemarksPanel.tsx` — new client component; replaces `TaskChatPanel`; timeline (oldest→newest, auto-scroll to bottom on mount/new remark); status chip per remark when `status_change` is set (colour-coded using `TASK_REMARK_STATUS_LABELS` + `STATUS_CHIP_COLORS`); suppressed-remark italic placeholder; Playfair italic empty state; compose area with textarea (auto-height, max 3 lines), 6 status-change toggle pills (3-col desktop, 2-col mobile via `.task-remarks-status-pills`), "Post update" button; `useTransition + isPending` guard; optimistic insert at 0.6 opacity confirmed on Realtime echo; channel name `task-remarks-${taskId}-${mountId}` (Strict Mode safe); exports `TaskRemarkWithAuthor` (re-exported from `tasks-service`).
- `src/components/tasks/TaskModal.tsx` — imports `TaskRemarksPanel`; `initialMessages` prop renamed to `initialRemarks`; both desktop and mobile sheet use `TaskRemarksPanel`.
- `src/components/tasks/TaskChatPanel.tsx` — **deleted**.
- `src/components/tasks/PersonalTasksTab.tsx` — import updated to `TaskRemarksPanel`; prop renamed `initialRemarks`.
- `src/components/tasks/GroupTasksTab.tsx` — prop renamed `initialRemarks`.
- `src/components/CLAUDE.md` — TaskModal and TaskRemarksPanel contracts updated; TaskChatPanel section removed.

---

## 2026-05-29 — Service + action layer for task_remarks

- `src/lib/validations/task-schemas.ts` — `AddTaskRemarkSchema` updated: `content` capped at 2000 chars; `statusChange: StatusEnum.optional()` field added.
- `src/lib/services/tasks-service.ts` — `getTaskMessages` replaced by `getTaskRemarks(taskId): Promise<TaskRemarkWithAuthor[]>`; queries `task_remarks` ordered ASC (oldest first); batch-resolves author profiles in one query (no N+1); `TaskRemarkWithAuthor` exported as the canonical type definition; `TaskWithMessages.messages` updated to `TaskRemarkWithAuthor[]`; `getTaskById` calls `getTaskRemarks`.
- `src/lib/actions/tasks.ts` — `addTaskMessageAction` replaced by `addTaskRemarkAction`: Zod → auth → task visibility check (assigned_to / created_by / manager+) → optional `updateTaskStatusAction` call (status logic not duplicated) → INSERT via adminClient; returns `ActionResult<TaskRemark>`. `suppressTaskMessageAction` replaced by `suppressTaskRemarkAction`: Zod → admin/founder guard → existence check (S-06) → idempotent suppression write; returns `ActionResult<{ remarkId }>`.
- `src/lib/constants/task-constants.ts` — `TASK_REMARK_STATUS_LABELS: Record<TaskStatus, string>` added; covers all 6 status values with past-tense labels for the timeline UI.
- `src/components/tasks/TaskChatPanel.tsx` — imports `addTaskRemarkAction`; imports and re-exports `TaskRemarkWithAuthor` from `tasks-service` (single canonical definition); `author` in optimistic insert now includes `id` field; deprecated `TaskMessageWithAuthor` alias removed.
- `src/lib/CLAUDE.md` — services/actions registry updated; `addTaskRemarkAction` and `suppressTaskRemarkAction` contract sections added.

---

## 2026-05-29 — Migration 0022: task_messages → task_remarks rename

- `supabase/migrations/20260529000022_task_remarks.sql` — Part A: `DROP TABLE task_messages CASCADE` (pre-production table, no data to preserve; CASCADE removes RLS policies, index, and Realtime publication entry automatically). Part B: creates `task_remarks` with all columns from `task_messages` plus `status_change text` (nullable, CHECK values mirror `tasks.status` CHECK — coupled, must stay in sync). RLS SELECT/INSERT mirror migration 0019 visibility rule (assigned_to, created_by, manager+); suppression UPDATE policy for admin/founder (row-level, column restriction enforced at action layer). `idx_task_remarks_task_id` on `(task_id, created_at ASC)` — ASC for oldest-first timeline. Realtime enabled on `task_remarks`.
- `src/lib/types/database.ts` — `TaskMessage` type removed; `TaskRemark` type added (adds `status_change: TaskStatus | null`); `task_messages` Database block removed; `task_remarks` Database block added with updated FK names.
- `src/lib/services/tasks-service.ts` — `getTaskMessages` now queries `task_remarks` with `ascending: true`; return type updated to `TaskRemark[]`; `TaskWithMessages.messages` updated accordingly.
- `src/lib/actions/tasks.ts` — `addTaskMessageAction` inserts into `task_remarks`; `suppressTaskMessageAction` reads/writes `task_remarks`; delete task comment updated.
- `src/lib/validations/task-schemas.ts` — `AddTaskMessageSchema` → `AddTaskRemarkSchema`; `SuppressTaskMessageSchema` → `SuppressTaskRemarkSchema`; input types renamed accordingly.
- `src/components/tasks/TaskChatPanel.tsx` — exports `TaskRemarkWithAuthor` (primary); `TaskMessageWithAuthor` kept as deprecated alias; Realtime channel renamed `task-remarks-${taskId}-${mountId}`; table filter updated to `task_remarks`; optimistic insert gains `status_change: null`.
- `src/components/tasks/TaskModal.tsx` — imports `TaskRemarkWithAuthor`; `initialMessages` prop type updated.
- `src/components/tasks/PersonalTasksTab.tsx` — imports `TaskRemarkWithAuthor`; `selectedTaskMessages` state renamed `selectedTaskRemarks` with correct type.
- `supabase/migrations/CLAUDE.md` — migration 0022 added to inventory; `task_remarks` append-only contract documented; `status_change` coupling warning added.
- `src/lib/CLAUDE.md` — service/action registry entries updated; `suppressTaskMessageAction` contract updated to reference `task_remarks`.
- `src/components/CLAUDE.md` — `TaskModal` and `TaskChatPanel` props updated; channel name and export updated.

---

## 2026-05-29 — Heap OOM fix: singleton browser client, Realtime teardown, dashboard hydration, tasks dual-fetch

- `src/lib/supabase/client.ts` — singleton pattern: module-level `_client` variable; `createClient()` returns same reference on every call; one WebSocket connection and channel registry across all components; `_resetClientForTests()` escape hatch gated to `NODE_ENV === 'test'`.
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Fix A: cleanup changed from `channel.unsubscribe()` to `supabase.removeChannel(channel)` to fully deregister from the singleton client's channel list. Fix B: channel name now includes `useId()` mount suffix (`agent-activity:${userId}:${mountId}`) to prevent Strict Mode double-mount from calling `.on()` on an already-subscribed channel.
- `src/hooks/useNotifications.ts` — audited; already uses `supabase.removeChannel(channel)` correctly; no change needed.
- `src/hooks/useDashboardLayout.ts` — hydration `useEffect` now calls `setStored` only when the persisted layout differs from the default already set synchronously; prevents full widget tree unmount/remount on every navigation.
- `src/components/dashboard/DashboardCanvas.tsx` — removed `isHydrated` skeleton gate; widgets render immediately with default layout; no layout shift on hydration because defaults and stored layout are often identical; `WidgetSkeleton` and `DEFAULT_LAYOUT_BY_ROLE` imports removed.
- `src/app/(dashboard)/tasks/page.tsx` — reads `searchParams.tab` and fetches only the active tab's data; inactive tab receives a zero-value sentinel; halves server work and RSC payload on every `/tasks` navigation.
- `src/lib/CLAUDE.md` — singleton contract and Realtime teardown pattern documented.
- `src/app/(dashboard)/CLAUDE.md` — hydration rule and tasks single-fetch rule updated.

## 2026-05-28 — Migration 0021: task_messages suppression + task_audit_log

- `supabase/migrations/20260528000021_task_suppression_audit.sql` — Part A: adds `is_suppressed` (bool NOT NULL DEFAULT false), `suppressed_by` (uuid FK → profiles ON DELETE SET NULL), `suppressed_at` (timestamptz) columns to `task_messages`; adds `task_messages_suppression_update` RLS UPDATE policy for admin/founder (row-level only — column restriction at action layer). Part B: creates `task_audit_log` append-only table (id, task_id, changed_by, field_name, old_value, new_value, changed_at) with `idx_task_audit_log_task_id` index; RLS SELECT for manager/admin/founder; no INSERT/UPDATE/DELETE policies; `log_task_changes()` SECURITY DEFINER trigger fires AFTER UPDATE on tasks, logs six fields (title, description, status, priority, due_at, assigned_to).
- `src/lib/types/database.ts` — `TaskMessage` type updated with suppression fields; `TaskAuditLog` type added; `task_messages` Database entry updated (Insert/Update types narrowed); `task_audit_log` Database entry added.
- `src/lib/validations/task-schemas.ts` — `SuppressTaskMessageSchema` + `SuppressTaskMessageInput` added.
- `src/lib/actions/tasks.ts` — `suppressTaskMessageAction` added: Zod → admin/founder guard → message existence check (S-06) → idempotent suppression write via adminClient.
- `src/components/tasks/TaskChatPanel.tsx` — suppressed messages render as "This message was removed." (tertiary italic, same row height); original content never shown for any role; optimistic inserts carry `is_suppressed: false`.

---

## 2026-05-28 — PersonalTasksTab: replace unbounded append with page-replace pagination (Fix — P-03)

Option A chosen: `@tanstack/virtual` was not in `package.json`; no new dependency added.

- `src/components/tasks/PersonalTasksTab.tsx` — `handleLoadMore` (append) removed; replaced with `handleNextPage` (replaces task list, pushes previous cursor onto `cursorStack`) and `handlePrevPage` (pops `cursorStack`, re-fetches that page); DOM is always max 50 rows; "Load more" button replaced with Previous/Next pagination footer showing current page number; filter-change `useEffect` resets to page 1 when `cursorStack.length > 0` so client-side filters apply against the first page (full dataset entry point) rather than a mid-stack page

---

## 2026-05-28 — TaskChatPanel: fix Realtime "cannot add callbacks after subscribe()" (Fix)

Root cause: `createBrowserClient` (Supabase SSR) is a singleton — same client instance on every call. The Supabase JS client reuses channel objects by name from an internal registry. React 18 StrictMode double-invokes effects: mount → cleanup → mount again. The first cleanup called `removeChannel` (async, not awaited), but by the time the second mount ran, the channel by the same name was still present in the registry in `SUBSCRIBED` or `LEAVING` state. Calling `.on()` on it threw `"cannot add postgres_changes callbacks after subscribe()"`.

Fix: `useId()` produces a stable, mount-scoped nonce that is unique across mounts. The channel name becomes `task-messages-${taskId}-${mountId}`, making each mount's channel name distinct. StrictMode's first cleanup fully removes its channel; the second mount creates a new channel under a different name and never collides with the prior one.

- `src/components/tasks/TaskChatPanel.tsx` — `useId` added to React import; `mountId = useId()` ref added; channel name changed from `` `task-messages-${taskId}` `` to `` `task-messages-${taskId}-${mountId}` ``

---

## 2026-05-28 — GroupTasksTab / PersonalTasksTab: fix server module in client bundle (Fix)

Root cause: both `'use client'` components imported value symbols directly from `src/lib/services/tasks-service.ts`, which calls `createClient()` from `src/lib/supabase/server.ts`, which imports `next/headers`. Next.js rejects any client bundle that transitively reaches `next/headers`.

Rule A-03: all DB queries go through `lib/services/`; but the service layer is server-only. Client components must use server actions as the boundary — never import service modules directly.

- `src/lib/actions/tasks.ts` — `getGroupSubtasksAction(groupId)` and `getPersonalTasksAction(filters?)` added; both call the service, verify session, and return `ActionResult<T>`; `userId` is derived from `getCurrentProfile()` server-side so the client never needs to supply it
- `src/components/tasks/GroupTasksTab.tsx` — `import { getGroupSubtasks } from '…/tasks-service'` replaced with `import { …, getGroupSubtasksAction } from '…/actions/tasks'`; call site updated; `cancelled` flag added (matches widget pattern)
- `src/components/tasks/PersonalTasksTab.tsx` — `import { getPersonalTasks } from '…/tasks-service'` removed; `getPersonalTasksAction` imported from actions; all three call sites (`handleNextPage`, `handlePrevPage`, filter-reset `useEffect`) updated

---

## 2026-05-28 — Migrations 0018/0019/0020: fix app_domain = text type error (Fix)

Root cause: `get_user_domain()` returns `app_domain` (enum). `task_groups.domain` is `text`. PostgreSQL will not implicitly cast enum → text — `ERROR 42883: operator does not exist: app_domain = text`. All three migrations built in the same session carried the same uncast comparison. The correct pattern (already in migration 0003) is `get_user_domain()::text`.

- `supabase/migrations/20260528000018_task_groups_rls_domain.sql` — `get_user_domain() = domain` → `get_user_domain()::text = domain` in both SELECT and UPDATE policies (3 occurrences); type-note comment added
- `supabase/migrations/20260528000019_task_messages_rls_creator.sql` — `tg.domain = get_user_domain()` → `tg.domain = get_user_domain()::text` in both SELECT and INSERT policies (2 occurrences); type-note comment added
- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` — `tg.domain = get_user_domain()` → `tg.domain = get_user_domain()::text` (1 occurrence)

All three files were edited in-place: they had never successfully applied to the database (each failed at the type-mismatch error before any DDL committed).

---

## 2026-05-28 — AssigneePickerModal: fix z-index arithmetic V-05 violation (Fix)

- `src/styles/design-tokens.css` — `--z-modal-overlay: 61` and `--z-modal-nested: 62` added to the z-index scale; nested modal layering now has named tokens instead of arithmetic
- `src/components/tasks/AssigneePickerModal.tsx` — `calc(var(--z-modal) + 10)` → `var(--z-modal-overlay)`; `calc(var(--z-modal) + 11)` → `var(--z-modal-nested)`; file-header comment updated
- `src/components/CLAUDE.md` — AssigneePickerModal entry updated to reference new token names

No `--color-*` violations were found in `src/components/tasks/` — those tokens are legitimately defined in `design-tokens.css` (section 7) and are correct per the Surface Contract. The actual violation was V-05 (z-index arithmetic), not V-01.

---

## 2026-05-28 — PersonalTasksTab: fix duplicate task creation on fast Enter (Fix)

- `src/components/tasks/PersonalTasksTab.tsx` — `useTransition` now destructures `isPending`; `handleQuickAddSave` guards with `if (isPending) return` as first statement, making all subsequent Enter presses a no-op until the transition completes; `isSavingQuickAdd` boolean state removed entirely; title input gains `disabled={isPending}` + `opacity: isPending ? 0.6 : 1`; Save button uses `isPending` for `disabled`, `cursor`, `opacity`, and label text ("Saving…")

---

## 2026-05-28 — getPersonalTasks: fix NULL due_at cursor pagination bug (Fix)

- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.cursor` changed from `string | null` to composite `PersonalTaskCursor = { due_at: string | null, id: string } | null`; `PersonalTasksResult.nextCursor` updated to the same composite type; `getPersonalTasks` now sorts by `due_at ASC NULLS LAST, id ASC` and uses a `.or()` condition covering all four cases of the composite continuation predicate; tasks with no deadline (`due_at IS NULL`) are now visible on every page after the first
- `src/components/tasks/PersonalTasksTab.tsx` — `cursor` state typed as `PersonalTaskCursor | null`; `PersonalTaskCursor` imported from service
- `src/lib/CLAUDE.md` — composite cursor pattern documented under a new "Composite cursor pattern for nullable sort columns" section

---

## 2026-05-28 — get_group_task_summaries: fix SECURITY DEFINER domain bypass (Security)

### What was wrong

Migration 0020's initial `get_group_task_summaries` RPC accepted `p_domain text` as a caller-supplied parameter and used it in `WHERE tg.domain = p_domain`. The comment incorrectly stated "the function does NOT bypass RLS — it runs as the calling user's session." Both claims were wrong: SECURITY DEFINER always runs as the function owner (postgres), which bypasses RLS entirely. Any authenticated caller could pass any domain value and receive results from that domain — the RLS domain guard was effectively off.

### What changed

- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` rewritten (migration had not yet run in production): `p_domain` parameter removed; WHERE clause now replicates the `task_groups_select` policy from migration 0018 explicitly using `get_user_role()` and `get_user_domain()` (agent: created_by = auth.uid(); manager: domain = get_user_domain(); admin/founder: all); comment corrected to accurately describe SECURITY DEFINER behaviour
- `src/lib/services/tasks-service.ts` — `getGroupTasks` signature changed from `(domain: string, filters?)` to `(filters?)` — domain is no longer accepted or forwarded; scoping is fully server-enforced
- `src/app/(dashboard)/tasks/page.tsx` — call site updated from `getGroupTasks(profile.domain)` to `getGroupTasks()`
- `src/app/(dashboard)/CLAUDE.md` — updated to reflect the new signature and explain why domain is not passed
- `src/lib/CLAUDE.md` — RPC pattern rules updated: documents that SECURITY DEFINER bypasses RLS, that access control must be replicated in the WHERE clause, and that caller-supplied domain parameters must never be trusted for scoping

### Verified

- `pnpm tsc --noEmit` passes with zero errors
- Domain scoping is now enforced inside the RPC body, not by a caller-supplied parameter
- Comment accurately describes SECURITY DEFINER semantics

---

## 2026-05-28 — getGroupTasks: replace in-memory aggregation with Postgres RPC (Performance)

`getGroupTasks` previously fetched all subtask rows for every group in the domain and aggregated counts in Node. At scale (500 groups × 50 subtasks = 25 000 rows) this would transfer 25 000 rows to render a count badge and 4 avatars.

**Modified files:**

- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` — `get_group_task_summaries(p_status, p_priority)` RPC; GROUP BY on `task_groups` LEFT JOIN `tasks`; returns `subtask_total`, `subtask_completed`, `assignee_ids uuid[]` per group; `SECURITY DEFINER SET search_path = public`; access control replicated in WHERE clause
- `src/lib/services/tasks-service.ts` — `getGroupTasks` rewritten: one RPC call + one batch profile fetch = exactly 2 DB round-trips; zero subtask rows transferred; `subtask_total`/`subtask_completed` cast with `Number()` (Q-09); `assignee_ids` sliced to max 4 in service layer; `GroupTaskSummaryRaw` internal type defined; `any` cast on `.rpc()` because generated types predate the migration
- `src/lib/CLAUDE.md` — RPC aggregation pattern documented for future reference

**Verified:** `pnpm tsc --noEmit` passes; `getGroupTasks` makes exactly 2 DB round-trips; no subtask rows fetched; `GroupTasksTab` component unchanged.

---

## 2026-05-28 — Trigger.dev reminder race window: documented as closed by SDK idempotency guarantee (A-12)

### Modified files
- `src/trigger/task-reminders.ts` — added a detailed comment block at the top of the file documenting the Trigger.dev v3 idempotency key deduplication guarantee for DELAYED runs; confirms the list-snapshot race described in A-12 is structurally impossible because `tasks.trigger()` with an idempotency key matching an existing DELAYED run returns the existing run handle (`isCached: true`) rather than creating a second distinct run; evidence cited from `@trigger.dev/core@4.4.6` apiClient types (line 55) and SDK shared.js (lines 1063–1110); no code change to scheduling or cancellation logic required; no migration required

### Decision log
- Approach chosen: document guarantee (not store-run-ID-in-DB), because the SDK evidence confirms deduplication makes a second concurrent DELAYED run with the same idempotency key impossible. The store-run-ID path would have required migration 0020 + adminClient write in scheduleTaskReminder — complexity not warranted when the race window does not exist.

---

## 2026-05-28 — Tech debt register created; TD-001 logged for leads.ts

### New files
- `docs/tech-debt.md` — tech debt register; tracks pre-existing violations identified but not fixed in the current session; each item has file, rule, what, fix, and logged date

### TD-001 logged
- `src/lib/actions/leads.ts` — inline `getCallerProfile()` is a Rule A-03 / Rule 04 duplicate of `getCurrentProfile()` from `profiles-service.ts`; inline comment added at the violation site referencing TD-001; fix path documented (delete inline fn, import canonical, replace 8 call sites); must be resolved when `leads.ts` is next touched for any reason

---

## 2026-05-28 — tasks.ts: replace local getCallerProfile duplicate with canonical getCurrentProfile (Rule 03/04)

### Modified files
- `src/lib/actions/tasks.ts` — removed local `getCallerProfile()` inline definition (was duplicating `getCurrentProfile` from `profiles-service.ts`); replaced with `import { getCurrentProfile } from '@/lib/services/profiles-service'`; all 7 call sites updated to `getCurrentProfile()`; `createClient` import retained because `canMutateTask` still uses it for the manager domain lookup (user-scoped client, not admin)

---

## 2026-05-28 — Security fix: updateTaskStatusAction + updateTaskAction missing application-layer auth (A-09/S-06)

### Modified files
- `src/lib/actions/tasks.ts` — added `canMutateTask(caller, task)` helper that explicitly enforces the same access rules as the tasks RLS UPDATE policy (agent: `assigned_to OR created_by`; manager: same OR group subtask in caller's domain via `task_groups` join; admin/founder: unrestricted); wired into `updateTaskStatusAction` (step 4 — was entirely absent) and `updateTaskAction` (step 4 — replaced the agent-only check that left managers unguarded); both actions now fetch `group_id` in their task select to support the manager domain check; both fetches still use the user client (RLS layer 1) before the `adminClient` write

---

## 2026-05-28 — Security fix: task_messages RLS creator visibility + manager domain scope (A-09)

### Migration 0019
- `supabase/migrations/20260528000019_task_messages_rls_creator.sql` — drops the A-09-violating `task_messages_select` and `task_messages_insert` policies from migration 0017; replaces both with three-tier visibility: (1) assignee or creator of the task — any role, always visible; (2) manager whose domain matches the parent `task_groups.domain` for `group_subtask` tasks; (3) admin/founder unrestricted; fixes two bugs: task creator locked out of own chat thread, and manager cross-domain message leak

---

## 2026-05-28 — Security fix: task_groups RLS domain enforcement (A-09)

### Migration 0018
- `supabase/migrations/20260528000018_task_groups_rls_domain.sql` — drops the A-09-violating `task_groups_select` and `task_groups_update` policies from migration 0017; replaces both with domain-scoped versions: `created_by = auth.uid() OR get_user_role() IN ('admin', 'founder') OR (get_user_role() = 'manager' AND get_user_domain() = domain)`; managers can no longer read or mutate task_groups rows belonging to a different domain

---

## 2026-05-28 — Tasks Page (Personal + Group tabs)

### New files
- `src/app/(dashboard)/tasks/page.tsx` — Server Component; fetches `getPersonalTasks` + `getGroupTasks` in `Promise.all`; passes data as props to `TasksShell`; guest → redirect `/dashboard`
- `src/app/(dashboard)/tasks/TasksShell.tsx` — `'use client'` tab shell; two tabs: "Personal" + "Group"; active tab persisted to `?tab=personal|group` URL param via `useSearchParams` + `useTransition` + `router.push`; browser back/forward works
- `src/components/tasks/PersonalTasksTab.tsx` — filter bar (Status multi-select pills, Priority multi-select pills, due date range); quick-add inline row (priority selector + title input + due date + assignee picker, Enter=save, Esc=cancel); task list rows with 3px priority left border, title, due date, status pill; click row → `TaskModal`; "Load more" cursor pagination; `AssigneePickerModal` portaled to `document.body`; Playfair italic empty state
- `src/components/tasks/GroupTasksTab.tsx` — accordion group list; one group expanded at a time (no conflicting Framer Motion); group row: title, priority border, status pill, due date, subtask count + progress%, member avatar stack (max 4 + overflow); subtask rows: title + status pill + assignee avatar; subtask add row at bottom of expanded group with assignee picker; click subtask → `TaskModal`; `AssigneePickerModal` portaled to `document.body`

### Modified files
- `src/lib/services/tasks-service.ts` — `getPersonalTasks` now returns `PersonalTasksResult = { tasks, hasMore, nextCursor }`; LIMIT 50 + 1 (detects `hasMore` without COUNT query); cursor pagination via `due_at > cursor`; new exports: `PersonalTasksResult`, `PERSONAL_TASKS_PAGE_SIZE`
- `src/components/layout/Sidebar.tsx` — "Tasks" nav item added (`CheckSquare`, `/tasks`); position: between Leads and Performance in `MAIN_NAV`

### Contracts established
- `getPersonalTasks` always returns `PersonalTasksResult` — never `Task[]` alone
- `hasMore` is detected by fetching `LIMIT + 1` rows — never a separate COUNT query
- Accordion: `expandedGroupId` state is a single `string | null` — guarantees only one group expanded at a time
- `AssigneePickerModal` always portals to `document.body` when rendered inside a scroll container (never inline)
- Tasks page data is fetched server-side on load — `TasksShell` does not re-fetch on tab switch

### Sign-off
- ✓ `pnpm tsc --noEmit` passes with zero errors
- ✓ `?tab=` URL param persists on browser back/forward
- ✓ `getPersonalTasks` uses cursor pagination — no unbounded SELECT
- ✓ `AssigneePickerModal` portals to `document.body`
- ✓ Only one group task row expanded at a time (accordion)
- ✗ Tasks not fetched client-side on tab switch — data is passed from the Server Component

---

## 2026-05-28 — Task Modal + Chat Panel (Prompt 3)

### New files
- `src/components/tasks/TaskModal.tsx` — two-column task detail modal (55% details / 45% chat); inline title + description editing with 400ms debounce, flushed synchronously on close; 6-state segmented status control (2-col grid at ≤480px to prevent overflow); 3-pill priority selector; assignee avatar + meta fields; Framer Motion entrance 200ms ease-out-expo; mobile full-screen bottom sheet with swipe-down-to-dismiss; no `<form>` tag, no internal data fetching
- `src/components/tasks/TaskChatPanel.tsx` — scrollable message list with auto-scroll; Realtime subscription on `task_messages` filtered by `task_id`, channel `task-messages-${taskId}`; optimistic inserts confirmed on Realtime echo, rolled back + `toast.danger` on error; growing textarea (1–3 lines), Enter to send, Shift+Enter newline; Playfair italic empty state; exports `TaskMessageWithAuthor` type
- `src/components/tasks/AssigneePickerModal.tsx` — nested modal (`z-index: var(--z-modal) + 11`); domain tabs (only populated domains shown); client-side search; avatar + role badge per user row; single select + Confirm; exports `AssignableUser` type

### Contracts established
- `TaskChatPanel` channel name must always be `task-messages-${taskId}` — never bare `task-messages`
- `TaskModal` never fetches its own data — receives `task`, `assignee`, `initialMessages` as props
- Debounced inline edits (title/description) are always flushed synchronously in `flushAndClose` before unmounting — no silent data loss on quick close

### Sign-off
- ✓ `pnpm tsc --noEmit` passes with zero errors
- ✓ Realtime channel uses `taskId` in name
- ✓ Debounced saves flush on modal close
- ✓ All colours reference CSS token vars — zero hex values
- ✓ Mobile status grid uses 2-col at ≤480px
- ✗ No `<form>` tags used anywhere in the three components

---

## 2026-05-28 — OS Tasks: service + action layer

### New files
- `src/lib/constants/task-constants.ts` — `TASK_PRIORITY`, `TASK_STATUS`, `TASK_CATEGORY` typed const objects; labels, colors as CSS token names (never hex), sort order
- `src/lib/validations/task-schemas.ts` — `CreatePersonalTaskSchema`, `CreateGroupTaskSchema`, `CreateSubtaskSchema`, `UpdateTaskSchema`, `UpdateTaskStatusSchema`, `AddTaskMessageSchema`, `DeleteTaskSchema` + inferred input types; priority/status as inline `z.enum`; all text fields run through `sanitizeText`
- `src/lib/services/tasks-service.ts` — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks`, `getTaskById`, `getTaskMessages`; `getGroupTasks` uses a single flat query + in-memory aggregation to avoid N+1; batch profile fetch for assignee avatars; composite types: `TaskGroupRow`, `SubtaskWithAssignee`, `TaskWithMessages`, `AssigneeSlim`
- `src/trigger/task-reminders.ts` — `scheduleTaskReminder(taskId, dueAt, assignedTo)` one-time delayed job; `cancelTaskReminder(taskId)` finds and cancels by tag (`task-reminder-${taskId}`); past-date guard: no-op when `dueAt - 30min < now()`; `sendTaskReminderTask` exported for Trigger.dev scan
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskMessageAction`; all actions: Zod first, `{ data, error }` return, no throws; `deleteTaskAction` cancels Trigger.dev reminder **before** DB delete — if cancel throws, delete is aborted

### Package added
- `@trigger.dev/sdk@4.4.6` — async job scheduling for task reminders; one-time delayed jobs via `tasks.trigger()` with `delay: Date`; cancellation via `runs.cancel()` using tag-based run discovery

### Updated docs
- `src/lib/CLAUDE.md` — services registry, actions registry, Trigger.dev jobs section, `createNotification` call sites for tasks

### Pre-mortem invariants met
- `getGroupTasks`: zero N+1 — one group query + one subtask query + one profile query, then O(subtasks) aggregation in memory
- `scheduleTaskReminder`: no-op guard when `dueAt - 30min <= now()`; never errors on past dates
- `deleteTaskAction`: Trigger.dev cancel precedes DB delete; cancel failure aborts delete
- All `TASK_STATUS` colors reference CSS token names (`var(--theme-accent)` etc.) — no hex values

---

## 2026-05-28 — Migration 0017: OS Tasks schema (task_groups, task_messages, tasks core upgrade)

### Migration `20260528000017_os_tasks.sql`

**Part A — tasks core table extended:**
- `title text NOT NULL` added; existing rows backfilled with `'(untitled)'`
- `description text` added (nullable)
- `priority text NOT NULL DEFAULT 'normal'` added; CHECK `IN ('urgent','high','normal')`
- `task_category text NOT NULL DEFAULT 'personal'` added; CHECK `IN ('personal','group_subtask','gia_followup')`; backfilled: rows with a `task_gia_meta` match → `'gia_followup'`, others → `'personal'`
- `group_id uuid` added; FK → `task_groups(id) ON DELETE CASCADE`; nullable
- Status enum migrated: `'pending'` → `'to_do'`, `'done'` → `'completed'`; new CHECK: `to_do | in_progress | in_review | completed | error | cancelled`
- New indexes: `idx_tasks_category`, `idx_tasks_group_id`, `idx_tasks_priority`

**Part B — `task_groups` table created:**
- Full RLS: SELECT (owner or manager+), INSERT (any authed), UPDATE (owner or manager+), DELETE (admin/founder)
- `update_updated_at()` trigger reused (not recreated)
- Indexes: `idx_task_groups_domain` (partial), `idx_task_groups_created_by`

**Part C — `task_messages` table created (append-only):**
- No UPDATE or DELETE RLS policies — enforced at policy level (rule A-11)
- SELECT/INSERT RLS mirrors tasks visibility via indexed EXISTS subquery (no full table scan)
- Realtime enabled: `ALTER PUBLICATION supabase_realtime ADD TABLE task_messages`

**Part D — notifications type expanded:**
- `task_assigned` added to `notifications_type_check` CHECK constraint

### TypeScript (`src/lib/types/database.ts`)
- `TaskStatus` updated: `to_do | in_progress | in_review | completed | error | cancelled`
- `TaskPriority` type added: `urgent | high | normal`
- `TaskCategory` type added: `personal | group_subtask | gia_followup`
- `Task` type extended: `title`, `description`, `priority`, `task_category`, `group_id` added
- `TaskGroup` type added
- `TaskMessage` type added
- `NotificationType` extended: `task_assigned` added
- `Database` tables: `task_groups` and `task_messages` entries added; `tasks` Insert type updated

### Components
- `src/components/notifications/NotificationItem.tsx` — `task_assigned` case added to exhaustive switch (maps to `CheckSquare` icon); `task_due` was already present; Q-11 still satisfied

---

## 2026-05-28 — assertNever moved to shared util

- `src/lib/utils/assert-never.ts` — created. Single export, three lines. `assertNever(x: never): never` is now the canonical exhaustive-switch helper for the entire codebase. Use it as the final return of any `switch` over a union type — TypeScript errors at build time if any case is unhandled.
- `src/components/notifications/NotificationItem.tsx` — inline `assertNever` definition removed. Now imports from `@/lib/utils/assert-never`. `default: return Bell` branch removed — the switch is fully exhaustive over `NotificationType`.
- `docs/The_Rules.md` — Q-11 added: exhaustive switches must use `assertNever` from `lib/utils/assert-never.ts`. No `default` branch on union-type switches.

---

## 2026-05-28 — Phase 9 post-ship: toast store hardening + exhaustive notification icon map

- `src/lib/toast.ts` — `_update()` now patches items in `_queue` as well as `_toasts`. A `toast.resolve(id)` called while the loading toast is still queued (3 other toasts visible) no longer silently drops the patch — the resolved state is carried into the item when it promotes to visible. `subscribeQueue` removed from public API; `"queue"` renamed to `"_queue_internal"` to prevent external listeners from registering without cleanup.
- `src/components/ui/toast-provider.tsx` — `useEffect` made explicit: `unsubscribe` assigned to a named const before return, plus `setToasts(toastStore.getToasts())` on mount to sync any toasts fired before the provider mounted (hot reload edge case).
- `src/components/notifications/NotificationItem.tsx` — `default: return Bell` branch replaced with `return assertNever(type)`. Adding a new `NotificationType` to `database.ts` without updating the icon map now fails at build time, not silently at runtime.

---

## 2026-05-28 — Phase 9 — Toast system + Persistent notification inbox shipped

### Part A — Toast System (ephemeral, client-only, no DB)

- `src/lib/toast.ts` — singleton store with pub/sub via `EventTarget` (no React dependency, no zustand). Exports `toast.success/danger/warning/info/loading/lia/resolve/dismiss/dismissAll`. `danger` duration = 0 (never auto-dismisses). `loading` duration = 0 (lives until `resolve()`). `resolve()` patches in-place by same id — no flicker.
- `src/components/ui/toast-item.tsx` — single toast card. Section 13.2 anatomy. 3px living bar via `eia-toast-bar-breathe` CSS keyframe (fires once; `lia` type uses continuous `eia-lia-breathe`). Warning depletion bar via new `toast-deplete` CSS keyframe (linear timing — intentional). Icon crossfade on loading→resolved via `AnimatePresence mode="wait"`. Hover/focus pauses dismiss timer; leaving resumes remaining time.
- `src/components/ui/toast-provider.tsx` — subscribes to toast store. Max 3 in DOM, queue the rest. Section 13.6 stagger: scale 1.0/0.95/0.90, translateY 0/−8px/−14px. Desktop: bottom-right. Mobile: bottom full-width, clears 80px nav.
- `src/hooks/useToast.ts` — thin re-export of `toast` singleton for React consumers.
- `src/app/(dashboard)/layout.tsx` — `<ToastProvider />` added after `<Sidebar />`, outside scroll container.
- `src/styles/design-tokens.css` — `toast-deplete` keyframe added (Section 15, after existing animations).

### Part B — Persistent Notification Inbox (DB + Realtime + Bell UI)

- Migration `20260528000016_notifications.sql` — `notifications` table; `recipient_id` FK → `profiles(id)` ON DELETE CASCADE; `action_url` CHECK constraint rejects absolute URLs; partial index on unread; full index on all; RLS: SELECT own only, UPDATE own only (mark read), no INSERT policy (service-role only), no DELETE; `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`.
- `src/lib/types/database.ts` — `NotificationType`, `Notification` types added.
- `src/lib/services/notifications-service.ts` — `getUnreadNotifications`, `getNotifications`, `markNotificationRead`, `markAllNotificationsRead` (server client); `createNotification` (admin/service-role client only).
- `src/lib/actions/notifications.ts` — `markNotificationReadAction(id)`, `markAllReadAction()`. Both begin with Zod. Both return `{ data, error }`.
- `src/hooks/useNotifications.ts` — THE single owner of notification state. Seeds from server prop. Realtime subscription filtered strictly at channel level by `recipient_id=eq.${userId}`. Optimistic updates for markRead/markAllRead. Unsubscribes on unmount.
- `src/components/notifications/NotificationBell.tsx` — bell icon, single unread dot (never a number badge), wraps panel.
- `src/components/notifications/NotificationPanel.tsx` — dropdown 380px, scrollable list 420px max, empty state Playfair italic, header + mark-all-read, entrance 150ms ease-out-expo.
- `src/components/notifications/NotificationItem.tsx` — unread dot (always rendered, transparent when read), type icon, title/body/timestamp (`formatRelativeTime`). Validates `action_url` as relative path before `router.push`.
- `src/lib/utils/dates.ts` — `formatRelativeTime()` added.
- `src/components/layout/Sidebar.tsx` — stub bell replaced with `<NotificationBell>`. Accepts `initialNotifications` prop.
- `src/app/(dashboard)/layout.tsx` — fetches `getNotifications(profile.id)` and passes as `initialNotifications` to Sidebar.
- `src/lib/actions/leads.ts` — `createNotification` wired: `updateLeadStatus` → `won` notifies domain managers; `assignLead` → notifies receiving agent; `createManualLead` → notifies assigned agent when different from caller.
- `src/components/CLAUDE.md` — Toast system and Notification components documented.
- `src/components/notifications/CLAUDE.md` — created.
- `src/lib/CLAUDE.md` — `createNotification()` call sites and action patterns documented.

---

## 2026-05-28 — Performance page — fix: all_time delta arrows verified as "—", agentCount and mean-of-means documented

- `src/lib/services/performance-service.ts` — comments added: unweighted mean-of-means is intentional (each agent counts equally regardless of lead volume); `agentCount` is roster-based not activity-based; both design decisions documented with guidance on how to change them if ever needed
- `src/app/(dashboard)/performance/CLAUDE.md` — same two contracts documented: averaging method and agentCount distinction
- Verified (no code change needed): `all_time` period renders `"—"` on all four delta arrows. Chain: `getPreviousPeriodDateRange('all_time') → null` → `getPreviousPeriodCoreMetrics` returns `null` without querying → `CoreFourGrid` receives `previous={null}` → all four `delta:` entries short-circuit to `null` → `MetricCard` renders `"—"` in `--theme-text-tertiary`

---

## 2026-05-28 — Number formatting cleanup — formatCompact/formatPercent applied across 5 widget and campaign components — 2026-05-28

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — `tasks.length` and `newLeadsCount` wrapped with `formatCompact()`
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — `grandTotal`, `t.count` (legend), `agent.total` (per-agent row) wrapped with `formatCompact()`
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `total` stat display wrapped with `formatCompact()`; `tickFormatter={(v) => formatCompact(v)}` added to `<YAxis>`
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — `tickFormatter={(v) => formatCompact(v)}` added to `<YAxis>`
- `src/components/campaigns/CampaignCard.tsx` — `{count}` in `MetricPill` wrapped with `formatCompact(count)`

---

## 2026-05-28 — Campaign detail: metrics strip (6 stat cards + agent distribution) — Phase 8

- Migration `20260528000015_campaign_detail_metrics.sql` — `get_campaign_detail_metrics` RPC (status/outcome counts + `avg_hours_to_first_touch` via lateral join to `lead_activities`); `get_campaign_agent_distribution` RPC (single `GROUP BY assigned_to` join to `profiles` — never N+1)
- `src/lib/utils/numbers.ts` — `formatCompact`, `formatPercent`, `formatCount`, `formatCurrency` fully implemented per design-dna §8.2 (were stubs previously)
- `src/lib/types/database.ts` — `CampaignDetailMetrics` (extends `CampaignMetrics` + `avg_hours_to_first_touch: number | null`) and `AgentDistributionRow` types added
- `src/lib/services/leads-service.ts` — `getCampaignDetailMetrics(campaignName, filters)` and `getCampaignAgentDistribution(campaignName, filters)` added; both cast `bigint → Number()` per Q-09; both silently return null/[] on RPC error
- `src/components/campaigns/CampaignMetricsStrip.tsx` — server component; 6 stat cards (Total Leads, Won + conv. rate, Active Pipeline, Junk Rate, RNR, Avg. First Touch); division-by-zero guarded on all rate fields; all colours CSS tokens
- `src/components/campaigns/AgentDistributionBar.tsx` — `'use client'`; stacked bar `h-2 radius-full`; Framer Motion `layoutId` + `animate={{ width }}` per segment (never CSS width transition); legend with colour dots + name + count; hidden when `distribution.length <= 1`
- `src/components/campaigns/CampaignMetricsStripSkeleton.tsx` — 6 skeleton stat cards per §11.3; stagger 0→320ms per §11.4
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — two independent Suspense boundaries (metrics + table stream separately); `CampaignMetricsAsync` runs `Promise.all([getCampaignDetailMetrics, getCampaignAgentDistribution])` in parallel; `campaignName` decoded once and used identically for both RPCs and the leads query (no mismatch)
- `src/app/(dashboard)/campaigns/CLAUDE.md` — updated: detail page architecture, two new RPCs, Promise.all contract, division-by-zero guard, agent distribution bar rule

---

## 2026-05-28 — Campaign analytics command center — list + detail pages, get_campaign_metrics RPC, two indexes — Phase 8

- Migration `20260528000014_campaign_analytics.sql` — two partial indexes (`idx_leads_campaign_domain`, `idx_leads_campaign_status`); `get_campaign_metrics` SQL function (STABLE SECURITY DEFINER) using conditional `COUNT(*) FILTER (WHERE ...)` aggregates — one round trip regardless of campaign count; `p_domain`, `p_date_from`, `p_date_to` params
- `src/lib/types/database.ts` — `CampaignMetrics` type added; `CampaignFilters` type added
- `src/lib/services/leads-service.ts` — `getCampaignMetrics(role, callerDomain, filters)` added; manager domain constraint enforced before RPC call; RPC column names mapped to clean `CampaignMetrics` shape; `bigint` → `number` cast
- `src/components/campaigns/CampaignFilters.tsx` — `'use client'`; Domain (single select, hidden for manager), Date range; `useTransition` on all navigations; Clear button when any filter active
- `src/components/campaigns/CampaignCard.tsx` — interactive card per §5.04; hover `--shadow-2 + translateY(-1px)`; left: campaign name + domain badge; right: 7 metric pills (total/won/in_discussion/nurturing/lost/junk/rnr); Framer Motion staggered entrance §11.4; `router.push('/campaigns/[encodedName]')` on click
- `src/components/campaigns/CampaignListSkeleton.tsx` — 5 skeleton rows; card shell + name/domain-pill + 7 metric-pill skeletons; stagger 0/80/160/240/320ms §11.4
- `src/components/campaigns/CampaignListAsync.tsx` — async server component; direct child of Suspense; calls `getCampaignMetrics`; Playfair italic empty state
- `src/app/(dashboard)/campaigns/page.tsx` — server component; agent/guest → redirect `/dashboard`; manager domain pre-locked; `<CampaignFilters>` + `<Suspense><CampaignListAsync /></Suspense>`
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — server component; `id` = `encodeURIComponent(utm_campaign)`; `decodeURIComponent` on params; calls `getLeadsByRoleCached` with `{ campaign: decodedName }`; renders existing `<LeadsTable>` + `<LeadsPagination>`
- `src/components/layout/Sidebar.tsx` — "Campaigns" nav item added (`TrendingUp` icon, `/campaigns` route); visible for manager + admin + founder; "Analytics" section label added
- `src/app/(dashboard)/campaigns/CLAUDE.md` — created: RPC pattern, campaign id encoding contract, domain-lock rule, URL param keys

---

## 2026-05-28 — Performance page — team benchmarks layer (domain avg. touch rate, response time, conversion rate; agentCount guard; accent pip for above-average metrics) — Phase 9

- `src/lib/services/performance-service.ts` — `TeamBenchmarks` type exported; `getTeamBenchmarks(callerDomain, period)` added: 1 query for peer agent IDs, 3 flat queries scoped to `assigned_to IN (agentIds)` (never N queries); `agentCount < 2` guard returns all nulls; `leadsWon` intentionally excluded
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — sixth call added to `Promise.all`; `domain` prop added (server-side from `profile.domain`, never a URL param); `benchmarks` passed to `CoreFourGrid`
- `src/app/(dashboard)/performance/page.tsx` — `domain={profile.domain}` passed to `PerformanceAsync`
- `src/components/performance/CoreFourGrid.tsx` — `TeamBenchmarks` type imported; `benchmarks: TeamBenchmarks | null` prop added; benchmark line renders below delta per card (absent not "—" when null); accent pip on above-average metrics; response time uses inverse comparison (lower is better)
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — two extra skeleton lines added to Touch Rate, Avg Response Time, Conversion Rate cards; Leads Won card unchanged
- `src/app/(dashboard)/performance/CLAUDE.md` — updated with `getTeamBenchmarks` signature, `TeamBenchmarks` type, agentCount guard rule, benchmark null contract (absent vs "—")

---

## 2026-05-28 — Performance page — agent self-view (Core Four metrics, effort layer, call outcome breakdown, period selector) — Phase 8

- Migration `20260528000013_performance_indexes.sql` — three partial indexes: `idx_lead_activities_actor_status`, `idx_lead_notes_author_outcome`, `idx_leads_assigned_status_created`
- `src/lib/services/performance-service.ts` — new dedicated service; `getCoreFourMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`, `getPreviousPeriodCoreMetrics`, `getPeriodDateRange`, `getPreviousPeriodDateRange`, `_getCoreFourMetricsForRange`; IST-correct period boundaries; null contract for `avgResponseTimeMinutes` and `conversionRate`
- `src/lib/utils/dates.ts` — `formatDuration(minutes: number | null)` added: null → "—", < 60m → "48m", ≥ 60m → "2h 34m"
- `src/app/(dashboard)/performance/page.tsx` — agent-only server component; non-agent roles redirect to `/dashboard`; reads `searchParams.period`; Suspense boundary around `PerformanceAsync`; `PerformanceMotivationalFooter` (Playfair italic, Lia's voice)
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — async server component; direct child of Suspense; calls all 5 service functions in `Promise.all`
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — 2×2 Tier-1 + 4 compact Tier-2 + 1 wide Tier-3; stagger 0/80/160/240ms per §11.4
- `src/components/performance/PerformancePeriodSelector.tsx` — `'use client'`; URL param only; `useTransition` on all pushes; tab-style ghost buttons
- `src/components/performance/CoreFourGrid.tsx` — `'use client'`; 2×2 grid; Playfair serif primary values; unicode delta arrows (↑ ↓); success/danger text colours; null → "—"
- `src/components/performance/EffortGrid.tsx` — `'use client'`; 4-col compact cards; live-state dots on in_discussion (info) and nurturing (warning); sans-serif numbers
- `src/components/performance/CallOutcomeBar.tsx` — `'use client'`; horizontal segmented bar; all CSS variable colours; Playfair italic empty state per V-09
- `src/components/layout/Sidebar.tsx` — Performance nav item added (BarChart2, below Leads)
- `src/app/(dashboard)/performance/CLAUDE.md` — created

---

## 2026-05-28 — Dashboard widgets — fix: startTransition called during render

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — initial data fetch moved from render-phase guard (`if (!loaded && !isPending)`) into `useEffect`; `cancelled` flag prevents state update on unmounted component
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — same fix applied
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — same fix applied

Root cause: `startTransition` is a side effect and cannot be called during the render phase. React throws "Cannot call startTransition while rendering." All three widgets now use the same `useEffect` + `startTransition` pattern already present in `AgentActivityWidget` and `ManagerLeadVolumeWidget`.

---

## 2026-05-28 — Dashboard widget system: canvas, registry, useDashboardLayout hook, 5 Gia widgets (agent tasks, agent activity, manager status, manager volume, manager campaigns) — Phase 7

- `src/lib/constants/dashboard-widgets.ts` — widget registry: 5 entries with id, label, description, roles, domains, defaultSize, module; `DEFAULT_LAYOUT_BY_ROLE` per role; `WIDGET_MAP`, `isValidWidgetId`
- `src/hooks/useDashboardLayout.ts` — localStorage layout hook; key `eia:dashboard:layout:${userId}:v1`; validates ids against registry; hydrates after mount; returns layout + CRUD operations
- `src/components/dashboard/WidgetSkeleton.tsx` — size-aware shimmer skeleton
- `src/components/dashboard/DashboardWidgetSlot.tsx` — Suspense boundary; static `React.lazy` import map; 150ms min skeleton; edit mode chrome
- `src/components/dashboard/DashboardCanvas.tsx` — 2-col grid; `@dnd-kit/sortable` drag; edit mode toggle; hydration-safe full-canvas skeleton
- `src/lib/services/dashboard-service.ts` — dedicated dashboard queries; never mixed into `leads-service.ts`
- `src/lib/actions/dashboard.ts` — 5 server actions; all re-verify via `getCurrentProfile()`
- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — overdue + today tasks + new leads count
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Realtime subscription filtered by actor_id; Framer Motion slide-in on new items; subscription cleaned up on unmount
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — stacked bar pipeline + per-agent breakdown
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — Recharts LineChart; period toggle; all colours CSS vars
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — Recharts stacked BarChart per utm_campaign
- `src/app/(dashboard)/dashboard/page.tsx` — replaced placeholder with `<DashboardCanvas>`
- `src/app/(dashboard)/CLAUDE.md` — created: full widget system documentation
- `recharts@3.8.1` — added (Q-05: first chart package; dashboard widgets only; Recharts not imported at page level — only inside widget components that use it)

---

## 2026-05-28 — Gia — Campaign ad video preview modal — Phase 6

Click `utm_campaign` on the lead dossier to play the Meta ad creative that generated the lead. If no creative row exists the field renders as plain static text — zero visual change.

- Migration 0012: `ad_creatives` table — `campaign_key` (UNIQUE, normalised via CHECK constraint), `video_url`, `thumbnail_url`, `ad_name`, `notes`; RLS: SELECT open to all authenticated, INSERT/UPDATE/DELETE admin/founder only; `idx_ad_creatives_campaign_key` index
- `src/lib/types/database.ts` — `AdCreative` type added; `ad_creatives` table added to `Database.public.Tables`
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativeForCampaign(campaignName)`: normalises input (toLowerCase + trim), queries `ad_creatives` by `campaign_key`, returns `AdCreative | null`, never throws
- `src/components/leads/CampaignVideoModal.tsx` — new modal composing `ui/modal.tsx`; `max-w-2xl`; native `<video>` with `autoPlay muted playsInline controls`; video.play() via ref after mount with silent `NotAllowedError` catch; Framer Motion entrance from `ui/modal.tsx` (350ms ease-out-expo)
- `src/components/leads/LeadInfoCard.tsx` — converted to `'use client'`; accepts `adCreative?: AdCreative | null` prop; `AttributionTrigger` sub-component added; campaign field renders as interactive trigger (cursor-pointer, hover → `--theme-accent` + underline, 150ms transition) when creative exists; `ad_name` field also interactive when `adCreative.ad_name === lead.ad_name`; `CampaignVideoModal` rendered conditionally
- `src/app/(dashboard)/leads/[id]/page.tsx` — `getAdCreativeForCampaign(lead.utm_campaign)` added to existing `Promise.all` block; skipped (returns null) when `lead.utm_campaign` is null; result passed as `adCreative` prop to `LeadInfoCard`

---

## 2026-05-28 — Gia — Won action restored on lead dossier (In Discussion)

`StatusActionPanel` — Won button + confirm modal when status is `in_discussion`; calls existing `updateLeadStatus('won')`. Restores spec behaviour removed during the Level Up refactor.

---

## 2026-05-28 — Gia — Leads table Assigned To column shows agent name

`getLeadsByRole` now joins `profiles!leads_assigned_to_fkey(full_name)` in the same query; `LeadWithAssignee` type added. `LeadsTable` Assigned To cell renders `assignee.full_name` instead of the raw UUID.

---

## 2026-05-28 — Layout — Sidebar logo: remove domain module label

Removed the italic module name (Gia, Hia, Sia, etc.) below the sidebar logo. Deleted unused `DOMAIN_MODULE_NAMES` from `src/lib/constants/domains.ts`.

---

## 2026-05-28 — Gia — Fix getNextLeadTask broken filter (Phase 6)

Inverted join direction in `getNextLeadTask` — now starts from `tasks` with `!inner` on `task_gia_meta` to filter by `lead_id`. Previous version started from `task_gia_meta` and used dot-notation (`.eq('tasks.status', ...)`, `.order('tasks.due_at', ...)`) which PostgREST / Supabase JS client silently drops, causing the status filter and ordering to be no-ops and `.limit(1)` to return an arbitrary row. Native column filters (`status`, `due_at`) are now applied directly on the root `tasks` table. Return type `Task | null` and `LeadDossierTasksAsync` unchanged.

---

## 2026-05-28 — Gia — Fix N+1 queries on lead dossier (Phase 6)

Repaired `Relationships` arrays in `database.ts` for `lead_notes`, `lead_activities`, `tasks`, and `task_gia_meta` — all were `[]` despite FK constraints existing in Postgres. Collapsed `getLeadNotesFull`, `getLeadActivitiesFull`, and `getNextLeadTask` from 5 sequential round trips to 3 parallel single-query joins using inline FK disambiguators. `getProfileNameMap` is no longer called from any lead service function (marked for future removal). Updated `LeadNoteWithAuthor` (`author.full_name`) and `LeadActivityWithActor` (`actor?.full_name`) types and all consumers (`LeadNotesSection`, `LeadActivityLog`). `pnpm tsc --noEmit` passes with zero errors.

---

## 2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

---

## 2026-05-28 — Gia — Leads page header: serif title + status summary pills

2026-05-28 — Gia — Leads page header: serif title + status summary pills (eyebrow removed per product)

---

## 2026-05-28 — Gia — LeadInfoCard contact fields redesign

LeadInfoCard contact fields redesigned — labelled datum row pattern with consistent icon rail, mono phone, micro-label typography; 2026-05-28, Phase 6.

---

## 2026-05-28 — Gia — Leads: server-side search, pagination, phone text index

Leads — server-side search (ilike across name/phone/email), pagination (50/page, URL-param driven), migration 0011 phone text index; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000011_lead_search_index.sql` — `idx_leads_phone_text` on `leads(phone text_pattern_ops) WHERE archived_at IS NULL`; enables ILIKE substring search without sequential scan.
- `src/components/leads/LeadsPagination.tsx` — `'use client'` component; "Showing X–Y of Z leads" count; Prev/Next buttons with `ChevronLeft`/`ChevronRight`; `useTransition` on all navigation; `pointer-events: none` on disabled state (not just `opacity`); rendered only when `totalCount > pageSize`.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters.search: string | null` added.
- `src/lib/services/leads-service.ts` — `getLeadsByRole` return type changed from `Lead[]` to `LeadsResult = { leads, totalCount }`. Count obtained via `{ count: 'exact', head: false }` on the same query builder — one round trip. Search applied as `.or(first_name.ilike.%term%,...,email.ilike.%term%)` after role constraints, before `.range()`. Term trimmed and lowercased in service.
- `src/components/leads/LeadsFilters.tsx` — search input added to filter bar (Section 5.10 spec); 500ms debounce via `useEffect`+`setTimeout`, no library; clear X button; `search` counted in active filter badge; `buildParams` deletes `page` on every change → automatic page-1 reset; `clearAll` clears search local state and URL simultaneously.
- `src/components/leads/LeadsTable.tsx` — all client-side search code removed (`useState`, `useMemo`, `Search` icon, search input, `filtered` variable). Table is now display-only — it renders what the server returned.
- `src/components/leads/LeadsTableAsync.tsx` — destructures `{ leads, totalCount }` from `getLeadsByRole`; renders `LeadsTable` + `LeadsPagination` (conditional on `totalCount > pageSize`); `search` filter included in `hasActiveFilters` check.
- `src/components/leads/LeadsTableSkeleton.tsx` — skeleton rows increased from 5 to 50 (matches `pageSize`); prevents layout height jump between skeleton and real content during pagination navigation.
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` now includes `search: getString('search')`.
- `src/app/(dashboard)/leads/CLAUDE.md` — updated with server-side search spec, `LeadsResult` return shape, pagination render condition, 500ms debounce rule, and page-reset contract.

---

## 2026-05-28 — Gia — Leads filter: Suspense-split architecture + server-side URL-param filters

Leads filter — Suspense-split architecture, server-side URL-param filters (status, outcome, source, campaign, agent, date range), migration 0010 indexes; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000010_lead_filter_indexes.sql` — three partial indexes on `leads`: `idx_leads_utm_source`, `idx_leads_utm_campaign`, `idx_leads_last_call_outcome` (all `WHERE archived_at IS NULL`). `IF NOT EXISTS` on indexes only — no RLS changes.
- `src/lib/constants/lead-sources.ts` — `LEAD_SOURCES`, `LeadSource`, `LEAD_SOURCE_LABELS` constants. Values: `meta | google | website`. No inline literals in components.
- `src/components/leads/LeadsFilters.tsx` — `'use client'` filter bar. Reads/writes URL params only. Six controls: Status (multi), Outcome (multi), Source (single), Campaign (single, server prop), Agent (single, server prop, absent for `agent` role), Date range. Active filter badge. `useTransition` on all `router.push` calls. Never fetches data.
- `src/components/leads/LeadsTableAsync.tsx` — async server component. Calls `getLeadsByRole` with `LeadFilters`. Renders `<LeadsTable>`. No UI of its own. Direct child of `<Suspense>` in `page.tsx`.
- `src/app/(dashboard)/leads/CLAUDE.md` — documents the three-component split, `LeadFilters` type location, `showAgentFilter` contract, `date_to` end-of-day rule, `getLeadFilterOptions` call location, and `page`/`pageSize` pagination readiness.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters` type added (status, last_call_outcome, agent_id, source, campaign, date_from, date_to, page, pageSize).
- `src/lib/services/leads-service.ts` — `getLeadsByRole` extended to accept `LeadFilters`; builds a single chained Supabase query; `.range()` always applied (never conditional); agent role constraint enforced before `LeadFilters.agent_id`; `date_to` end-of-day transform (`T23:59:59.999Z`) in service, not component. New `getLeadFilterOptions(role, domain)` returns `{ campaigns, agents }` — called once at page level.
- `src/components/leads/LeadsTable.tsx` — accepts `hasActiveFilters` prop; internal `statusFilter` state removed (server-side now); Framer Motion entrance `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}` per Section 11.5 (250ms, 100ms delay, ease-out-expo); empty state updated to "Nothing matches these filters." (Section 8.6).
- `src/components/leads/LeadsTableSkeleton.tsx` — rebuilt to spec: 5 rows (Section 11.3), staggered pulse per Section 11.4 (0/80/160/240/320ms), column widths match spec.
- `src/app/(dashboard)/leads/page.tsx` — restructured as thin orchestrator: fetches `filterOptions` once, parses `searchParams` into `LeadFilters`, renders `<LeadsFilters>` (stable) + `<Suspense><LeadsTableAsync /></Suspense>`.

---

## 2026-05-28 — Gia — LeadInfoCard AttributionStrip

LeadInfoCard: UTM section redesigned as AttributionStrip with accent-tone treatment and campaign repatriated — 2026-05-28, Phase 6

---

## 2026-05-28 — Gia — Leads table column visibility picker + drag-to-reorder

### New packages (Q-05)

- `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` — drag-to-reorder in the column picker. Selected over `react-beautiful-dnd` (unmaintained) and hand-rolled pointer listeners (no accessible keyboard support). `@dnd-kit` is now the **canonical drag library for all of Eia** (see rule Q-07).

### Files added

- `src/lib/constants/lead-columns.ts` — column registry: 11 columns, each with a stable `id` (localStorage key — never rename after shipping), `label`, `defaultVisible`, `locked`. `status` and `name` are locked always-visible.
- `src/hooks/useLeadColumnPreferences.ts` — `useLeadColumnPreferences(userId)` reads/writes `localStorage` at `eia:leads:columns:${userId}:v1`; validates stored ids against registry on load (unrecognised ids silently dropped); locked columns always enforced in `visibleColumns`; hydrates after mount (no SSR mismatch). Returns `{ visibleColumns, columnOrder, toggleColumn, reorderColumns, resetToDefaults }`. This hook is the **canonical pattern** for per-user table column preferences across Eia (see rule Q-08).
- `src/components/leads/LeadColumnPicker.tsx` — popover panel (not a modal); `@dnd-kit/sortable` for visible-column drag-to-reorder; locked rows show `Lock` icon and are excluded from the drag context; hidden columns shown below a divider, non-draggable; "Reset to defaults" footer; 200ms `opacity/y` entrance animation matching dropdown spec from design-dna.md §5.09.

### Files modified

- `src/components/leads/LeadsTable.tsx` — accepts `userId` prop; "Columns" ghost button (`Columns` lucide icon, `w-4 h-4`, stroke `1.5`) opens picker before filter controls; table renders only `orderedVisible` columns in stored order via a `LeadCell` switch covering all 11 ids; no Supabase re-query on toggle — purely presentational.
- `src/app/(dashboard)/leads/page.tsx` — passes `profile.id` as `userId` to `LeadsTable`.

### Conventions locked in

- Rule Q-07 added to `The_Rules.md`: `@dnd-kit` is the only drag library permitted in Eia.
- Rule Q-08 added to `The_Rules.md`: column preference hooks always follow the `useLeadColumnPreferences` signature and `eia:[module]:columns:${userId}:v1` key format.

## 2026-05-28 — Gia — Add Lead modal: removed E.164 hint and intent chips; added Source field (WhatsApp, Website, Meta, Google, Referral, YPO, Events) stored in form_data.manual_source

---

## 2026-05-28 — Gia — Add Lead modal: manual lead creation with phone dedup, domain enforcement, and agent assignment

---

## 2026-05-28 — Documentation

README.md created at repo root — project overview, phase status, stack, RBAC, planned modules. 2026-05-28.

---

## 2026-05-27 — Phase 6 complete

### `ui/Modal` primitive + modal refactor

- `src/components/ui/modal.tsx` — chrome-only Modal primitive: backdrop (`fixed inset-0`, `rgba(0,0,0,0.5)`, `backdrop-blur-sm`, `z-[--z-overlay]`), container (`bg var(--theme-paper)`, `radius-lg`, `shadow-3`, `z-[--z-modal]`), header, body slot, footer slot; Framer Motion `AnimatePresence` — enter `{ opacity:0, y:10, scale:0.98 }→{ opacity:1, y:0, scale:1 }` at 350ms `ease-out-expo`, exit `{ opacity:0, scale:0.97 }` at 150ms; Escape key listener; backdrop click → `onClose`; `role="dialog"` + `aria-modal="true"` + `aria-labelledby` via `useId()`; zero hardcoded colour values
- `CalledModal`, `ConfirmModal`, `ReasonModal` refactored to compose `Modal`; own chrome deleted; hardcoded `#fff`/`#ffffff` violations replaced with CSS tokens
- `src/components/CLAUDE.md` updated with props contract and the rule that every future modal composes the primitive

Props: `open: boolean`, `onClose: () => void`, `title: string`, `children: React.ReactNode`, `footer: React.ReactNode`, `maxWidth?: string` (default `max-w-lg`)

---

## 2026-05-27

### Personal details card on lead dossier

#### Personal details enrichment (Migration 0009)

- `personal_details JSONB` column added to `leads` — stores agent-collected enrichment keyed by field name; existing RLS covers it; no extra policies needed
- `Lead.personal_details: Record<string, string> | null` added to `database.ts`
- `UpdatePersonalDetailsSchema` added to `lead-schema.ts` — five fields (company, occupation, interests, city, notes); each passes through `sanitizeText()`
- `updatePersonalDetails` server action in `leads.ts` — Zod → auth → two-layer access check → merge into existing JSONB (preserves prior keys, strips empty strings)
- `PersonalDetailsCard` — inline card on the dossier left column; dormant read-only view until user clicks a field; 2-col grid (Company, Occupation, Interests, City) + full-width Details textarea; Save + Cancel footer appears only when active; follows `AgentScratchpad` card pattern
- Card is visible to all roles with dossier access; editable by assigned agent, manager (domain), admin, founder

---

### Post-Phase 5 hardening

#### Atomic round-robin agent assignment (Migration 0007)

- Replaced three-query application-layer round-robin with a single `get_next_round_robin_agent()` SECURITY DEFINER function
- `SELECT FOR UPDATE SKIP LOCKED` on `agent_routing_config` — two concurrent webhook calls cannot pick the same agent
- O(agents) not O(leads) — `MAX(assigned_at) GROUP BY` subquery, not a full table scan
- Two-step fallback for agents without a routing config row
- Added `idx_leads_assigned_to_assigned_at` partial index

#### Lead deduplication by phone (Migration 0008)

- Phone is the dedup key. Active lead (`new | touched | in_discussion | nurturing`) → log `duplicate_submission` activity, return existing lead, no new row created
- Terminal lead (`lost | junk | won`) → create new lead, set `previous_lead_id` FK to predecessor
- `get_active_lead_by_phone()` SECURITY DEFINER function with `idx_leads_phone_active` partial index
- `previous_lead_id` self-referential FK added to `leads` table (`ON DELETE RESTRICT`)
- `duplicate_submission` registered as valid `action_type` on `lead_activities`
- `Lead.previous_lead_id` and `duplicate_submission` added to `database.ts` types
- `IngestionResult` union extended with `duplicate: boolean` flag

#### Activity log — assignee name resolution

- `LeadActivityWithActor` type extended with `assignee_name: string | null`
- `getLeadActivitiesFull()` now batch-resolves `details.assigned_to` UUIDs alongside `actor_id` in a single `getProfileNameMap` call — zero extra DB queries
- `LeadActivityLog` component: `lead_created` now reads "Lead entered the system"; `agent_assigned` now reads "Assigned to [Name]"

---

## 2026-05-27 — Phase 5 complete

### Profile page + theme system

- `GET /profile` — server component; 6 card sections (avatar, details, theme, password, notifications)
- `ProfileAvatarSection` — click-to-upload via Supabase Storage `avatars` bucket; initials fallback; role/domain badges
- `ThemeSelector` — 5 swatches; instant DOM switch + async DB persist; no flash on load
- `PasswordChangeForm` — re-authenticates before `updateUser`; live 4-step strength bar
- `NotificationPreferences` — stubbed; "Coming soon"
- Inline `<script>` in dashboard layout sets `data-theme` synchronously before paint
- Sidebar footer → `<Link href="/profile">` with active-state styling

---

## 2026-05-27 — Raw payload logging

- Migration 0004: `lead_raw_payloads` table — immutable JSONB log; `lead_id` backfilled after insert; admin/founder only
- Migration 0005: `ingestion_error` column on `lead_raw_payloads` — marks failed ingestions for the error log
- `lead-ingestion.ts` — logs raw payload as step 1; logging failure is non-fatal
- `adapters.ts` — `adaptMeta` handles three payload shapes: Meta native, Pabbly, flat top-level keys; multi-key fallback for phone/email/ad fields
- `GET /error-log` — admin/founder page showing all errored raw payloads

---

## 2026-05-27 — Phase 4 complete

### Lead dossier + full lifecycle

- `GET /leads/[id]` — server component; parallel fetches; page-level access gate mirrors action-level
- `LeadInfoCard` — contact fields, UTM params, domain/platform/intent
- `StatusActionPanel` — Called/Won/Nurturing/Lost/Junk actions; owns CalledModal + ConfirmModal + ReasonModal
- `CalledModal` — call outcome dropdown + required note; auto-advances `new → touched`
- `AgentScratchpad` — debounced auto-save (1s); assigned agent + admin only
- `LeadNotesSection` — chronological notes timeline with author names + call outcome badges
- `LeadJourneyTimeline` — visual 4-stage path (`new → touched → in_discussion → won`); dwell times; resolution badge
- `LeadActivityLog` — append-only activity history; newest first
- `LeadDossierTasksAsync` — async server component; next pending task; overdue state highlighted

---

## 2026-05-27 — Phase 3 complete

### Gia module: lead ingestion, assignment, lead list

- Migration 0003: `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` with full RLS
- Webhook `POST /api/webhooks/leads` — Bearer auth + in-memory rate limiting
- `ingestLead()` — validate → sanitize → resolve domain → round-robin assign → insert → log activities
- `LeadsTable` — client-side status filter + search; role-aware (agent/manager/admin/founder)
- Sidebar: Leads nav link added

---

## 2026-05-27 — Phase 2 complete

### User management + agent routing

- `agent_routing_config` table; auto-created on `role=agent` via trigger
- `toggleAgentRouting` server action (manager/admin/founder)
- `inviteUser` action — magic-link invite via `inviteUserByEmail`
- `UsersTable` — client-side filters (role, domain, search)
- `EditProfileForm`, `EditAuthorizationForm`, `UserStatusControls`
- `GET /admin/users/[id]` — user detail page

---

## 2026-05-26 — Phase 1 complete

### Profiles system + user creation

- Migration 0001: `user_role` and `app_domain` enums
- Migration 0002: `profiles` table; RLS; `get_user_role()` / `get_user_domain()`; `on_auth_user_created` trigger; `profile_audit_log`
- `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive` server actions
- Dashboard layout; Sidebar; TopBar
- `GET /admin/users` — user list
- `GET /admin/users/new` — create user form

---

## 2026-05-26 — Phase 0 complete

### Foundation

- Next.js 16 App Router scaffolded; Supabase connected; Tailwind v4; shadcn/ui
- `design-tokens.css` — all CSS variables; five themes (Earth, Air, Water, Fire, Cosmos)
- Supabase client files: `client.ts`, `server.ts`, `middleware.ts`
- Auth pages: login, forgot-password, update-password
- Shared utilities: `sanitize.ts`, `phone.ts`, `dates.ts`, `numbers.ts`, `chart-tokens.ts`, `scroll.ts`
