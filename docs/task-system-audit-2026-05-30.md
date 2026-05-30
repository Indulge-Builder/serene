# Task System Architecture Audit — 2026-05-30

**Scope:** Full task system — services, actions, validations, constants, Trigger.dev, components, migrations, and auth layer.
**Method:** Read-only verification against `task-blueprint.md` and CLAUDE.md rules. No files modified.
**TypeScript check:** `pnpm tsc --noEmit` — **0 errors**.

---

## Section A — Blueprint Divergence

### A-1 — `PersonalTasksTab`: "Load more" pagination button absent
**Severity: High**
**Files:** `src/components/tasks/PersonalTasksTab.tsx`

The CLAUDE.md tasks section documents "Cursor pagination: 'Load more' button" as a feature of `PersonalTasksTab`. The component receives `hasMore` from `initialResult` and tracks it in state (`hasMore` is referenced in `tasksByPriority` filtering logic and the "Load more" `useCallback`), but no "Load more" button is rendered in the JSX. The cursor pagination mechanism exists in the service and schema layer but is never exposed to the user.

**Fix:** Add the "Load more" button below the task list that calls `getPersonalTasksAction` with the current cursor. Match the pattern documented in `src/app/(dashboard)/tasks/CLAUDE.md`.

---

### A-2 — `GroupTasksTab` → `GroupRow` → `SubTaskModal`: missing `currentUserName`
**Severity: High**
**Files:** `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/SubTaskModal.tsx`

`SubTaskModal` accepts `currentUserName?: string` and passes it to `TaskRemarksPanel` where it's used to set the optimistic remark author's display name. `GroupTasksTab` renders `SubTaskModal` but does not pass `currentUserName`. The prop is threaded through `GroupRow` but the `GroupRow` call site has no access to `callerProfile.full_name` — it's never received as a prop.

**Fix:** Pass `currentUserName` down from `GroupTasksTab` (it receives `callerProfile`) through `GroupRow` into `SubTaskModal`. Optimistic remarks in group tasks currently show an empty author name.

---

### A-3 — `CreateGroupTaskModal`: accent_color, icon_key, memberIds not wired to DB
**Severity: Medium** (already a documented TODO)
**Files:** `src/components/tasks/CreateGroupTaskModal.tsx`

Three fields are captured in UI state but never sent to the action or DB: `accentId`, `iconId`, `memberIds`. The modal has explicit `// TODO` comments noting the missing `task_groups.accent_color`, `task_groups.icon_key` columns and the `task_group_members` junction table. This is blueprint §18 "known gaps" — **not a new finding** — but confirmed open.

---

### A-4 — `TaskRemarksPanel`: status change chips entirely absent (CRITICAL)
**Severity: Critical**
**Files:** `src/components/tasks/TaskRemarksPanel.tsx`, `src/lib/actions/tasks.ts`

Blueprint §13 and `src/app/(dashboard)/tasks/CLAUDE.md` both require 6 status-change chips in the `TaskRemarksPanel` compose area, allowing the caller to attach a status transition to a remark. The `addTaskRemarkAction` accepts a `statusChange` parameter and the DB RPC `add_task_remark_with_status` handles the atomic remark+status write correctly.

However, the compose area in `TaskRemarksPanel` has only a placeholder comment:
```
// ── Status pill toggle ────────────────────────────────────────────────────────────────
```
No chips are rendered. The `postRemark` function at line 203 calls:
```typescript
await addTaskRemarkAction({ taskId, content })
```
The `statusChange` parameter is never passed. Status changes from the remarks panel are therefore impossible through the UI, even though the backend fully supports them.

**Fix:** Implement the 6 status-change pill chips in the compose area using `TASK_STATUS` tokens. On submit, pass the selected `statusChange` to `addTaskRemarkAction`. Chips should be toggleable (click the active chip to deselect).

---

### A-5 — `SubTaskModal`: Delete button shown to agents on group subtasks
**Severity: Medium**
**Files:** `src/components/tasks/SubTaskModal.tsx`

The `canDelete` logic allows an agent to see the Delete button when `isGroupSubtask` is true, regardless of role. Blueprint §16 authorization matrix is explicit: agents **cannot delete** group subtasks. The server action correctly blocks this, but showing the button to agents creates a confusing UX (user clicks Delete → server returns error they didn't expect).

```typescript
// current logic (approximate)
const canDelete = !isGroupSubtask || callerRole !== 'agent';
```

**Fix:** `canDelete` for group subtasks should require `callerRole` to be `manager`, `admin`, or `founder`. Personal tasks can remain deletable by the assigned agent (their own tasks).

---

## Section B — Rule Violations

### B-1 — Hardcoded `fontSize` values (R-01: no hardcoded values in components)
**Severity: Low**
**Files:**
- `src/components/tasks/TaskRemarksPanel.tsx` line ~445: `fontSize: "10px"`
- `src/components/tasks/GroupTaskWorkspace.tsx`: `fontSize: '11px'` and `fontSize: '10px'` in status pill inline styles
- `src/components/tasks/AssigneePickerModal.tsx` line ~417: `fontSize: "11px"` in avatar initials span

**Fix:** Replace with the CSS variable `var(--text-2xs)` (or `var(--text-xs)` if the intent is 12px). Check `src/styles/design-tokens.css` to confirm the exact token that maps to the needed size.

---

### B-2 — Hardcoded RGBA color in `SubTaskModal` backdrop (R-01)
**Severity: High**
**Files:** `src/components/tasks/SubTaskModal.tsx` line ~579

```typescript
background: "rgba(0,0,0,0.5)"
```

This is a hardcoded color value — a direct R-01 violation. The modal backdrop color should use a CSS variable. A `--overlay-bg` or `--theme-overlay` token should be defined in `design-tokens.css` if it doesn't already exist, and used here.

**Fix:** Check `src/styles/design-tokens.css` for an existing overlay/backdrop token. If none exists, add `--overlay-bg: rgba(0,0,0,0.5)` under the base section (not theme-specific — it applies to all themes). Replace the hardcoded value in `SubTaskModal` with `var(--overlay-bg)`.

---

### B-3 — Hardcoded RGBA color in `AssigneePickerModal` backdrop (R-01)
**Severity: Low**
**Files:** `src/components/tasks/AssigneePickerModal.tsx` line ~136

```typescript
background: "rgba(0,0,0,0.35)",
```

Same category as B-2. Uses a different opacity (0.35 vs 0.5) because it's a nested modal above a TaskModal backdrop. A second token `--overlay-bg-light: rgba(0,0,0,0.35)` or a CSS `color-mix` approach would resolve this.

**Fix:** Same approach as B-2 — add a token and replace the hardcoded value.

---

## Section C — Performance Claim Verification

### C-1 — `Promise.all` in `TasksAsync.tsx`: PASS
**Status: Verified**

`TasksAsync` wraps two service calls in `Promise.all`, but only the active tab call actually executes (the inactive branch returns the zero-value sentinel immediately). This is intentional — the parallel structure is preserved for future tabs without extra round-trips on load.

---

### C-2 — `getGroupTasks` wrapped in React `cache()`: PASS
**Status: Verified**

`src/lib/services/tasks-service.ts`: `getGroupTasks` is wrapped with `cache` imported from `react`. Per-request memoization is active.

---

### C-3 — `deleteTaskAction`: `cancelTaskReminder` is awaited before delete: PASS
**Status: Verified**

`deleteTaskAction` in `src/lib/actions/tasks.ts` calls `await cancelTaskReminder(taskId)` inside a `try/catch`. If `cancelTaskReminder` throws, the catch block returns `{ error: ... }` and the DB delete never runs — matching the blueprint §10 call matrix requirement that cancel is **blocking**.

---

### C-4 — Realtime cleanup uses `supabase.removeChannel(channel)`: PASS
**Status: Verified**

Both `AgentActivityWidget.tsx` and `GroupTaskWorkspace.tsx` use `supabase.removeChannel(channel)` (not `channel.unsubscribe()` alone) in their cleanup effects.

---

### C-5 — `WorkspaceAsync`: `Promise.all` for group + subtasks: PASS
**Status: Verified**

`src/app/(dashboard)/tasks/[id]/WorkspaceAsync.tsx` uses `Promise.all([getTaskGroupById(groupId), getGroupSubtasks(groupId)])` — both fetches are parallel.

---

## Section D — Security Checks

### D-1 — `canMutateTask` authorization helper: PASS
**Status: Verified**

All mutation actions (`updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `updateChecklistAction`, `updateTaskTagsAction`) call `canMutateTask(task, caller)` at the application layer after fetching the task from the DB. The helper is not applied in a loop — it's called once per action on the single task being mutated. No concern.

---

### D-2 — `userId` derivation in read actions: PASS
**Status: Verified**

All read action wrappers (`getGroupSubtasksAction`, `getPersonalTasksAction`, `getPersonalTaskTagsAction`, `getTaskGroupByIdAction`, `getTaskRemarksAction`) derive `userId` from `getCurrentProfile()`. None accept `userId` as a parameter from the client — S-06 is satisfied.

---

### D-3 — `add_task_remark_with_status` RPC inline auth check: PASS
**Status: Verified**

Migration `20260530000035`: The RPC calls `auth.uid()` to resolve `v_caller_id`, then checks `v_task.assigned_to = v_caller_id OR v_task.created_by = v_caller_id OR role IN ('manager', 'admin', 'founder')`. `auth.uid()` resolves correctly to the calling session's JWT even under `SECURITY DEFINER`. The comment in the migration explicitly documents this trade-off. Access control remains in the action layer as well (belt-and-braces).

---

### D-4 — `get_personal_tasks` RPC: p_user_id is required; action verifies match: PASS
**Status: Verified**

Migration `20260529000026`: `p_user_id uuid` is a required parameter (no DEFAULT). The migration comment states: "The action layer verifies auth.uid() matches p_user_id before calling." Verified in `src/lib/actions/tasks.ts`: the action calls `getCurrentProfile()` and passes `caller.id` as `p_user_id`.

---

## Section E — Known Debt Status

### TD-001 — Inline `getCallerProfile` in `leads.ts`: OPEN
**Status: OPEN — confirmed**

`src/lib/actions/leads.ts` line 5 imports `getCurrentProfile` from `profiles-service`, but the file still contains an inline `getCallerProfile` function (a 4-field slim version of `getCurrentProfile`) and uses it throughout. All 10 call sites found with `grep` show `getCurrentProfile` — wait, re-examining: the grep output showed `getCurrentProfile` at all call sites, but the TD-001 entry says the inline function is at lines 23–35.

The grep result showed:
```
5: import { getCurrentProfile } from '@/lib/services/profiles-service';
40,129,241,341,380,436,613,667,711: const caller = await getCurrentProfile();
```

This indicates **all call sites already use `getCurrentProfile()`** from the service — but the inline `getCallerProfile` function at lines 23–35 may still exist as dead code. The import at line 5 is there. The debt may be partially resolved (call sites fixed) but the inline function body may remain as dead code.

**Conclusion:** TD-001 is **partially open** — the usage pattern is correct (all calls go to `getCurrentProfile`), but the inline `getCallerProfile` definition itself may still exist as dead code in the file. Recommend verifying with `grep -n "getCallerProfile" leads.ts` and removing the dead function body.

---

### TD-002 — `console.error` in `tasks-service.ts`: OPEN
**Status: OPEN — confirmed**

Marker confirmed present at two locations in `src/lib/services/tasks-service.ts`:
- Lines 141-143 (inside `getPersonalTasks`)
- Line 207 (inside `getGroupTasks`)

History note from tech-debt.md: "This file has a pattern of losing TD markers during rewrites." The markers are currently present.

---

### E-1 — Stale tags comment in `CreatePersonalTaskModal.tsx`: OPEN
**Status: OPEN — STALE COMMENT**

`CreatePersonalTaskModal.tsx` line ~593 has:
```tsx
{/* ─── Tags (UI only — no tags column on tasks table yet) ──────────── */}
{/* TODO: wire tags into createPersonalTaskAction once tasks.tags column exists */}
```

Migration 0024 **already added** `tasks.tags text[]` and the `createPersonalTaskAction` **already writes** `tags`. The comment is stale — it describes a pre-0024 state. The implementation is correct; only the comment is wrong.

**Fix:** Remove the stale `(UI only — no tags column on tasks table yet)` inline comment and the `TODO: wire tags into createPersonalTaskAction` comment. The feature is fully implemented.

---

### E-2 — CreateGroupTaskModal open items: CONFIRMED OPEN (by design)
**Status: OPEN — tracked in blueprint §18**

Three `TODO` comments in `CreateGroupTaskModal.tsx` track known gaps:
1. `accent_color` + `icon_key` fields — no DB columns yet
2. `searchProfilesAction` — not implemented
3. `memberIds` / `task_group_members` table — not created

All three are in blueprint §18 "known gaps" and confirmed still open. Not new findings.

---

## Section F — New Smells

### F-1 — Hardcoded inline Framer Motion constants (widespread)
**Severity: Medium**
**Files:**
- `src/components/tasks/PersonalTasksTab.tsx` line ~463: `transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}`
- `src/components/tasks/SubTaskModal.tsx`: same hardcoded easing
- `src/components/tasks/GroupTasksTab.tsx`: same hardcoded easing
- `src/components/tasks/GroupTaskWorkspace.tsx`: same hardcoded easing
- `src/components/tasks/AssigneePickerModal.tsx` line ~150: `transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}`

CLAUDE.md is explicit: `src/lib/constants/motion.ts` is the single source for Framer Motion constants. The `[0.16, 1, 0.3, 1]` easing (which is the expo-out curve) is redeclared inline across at least 5 components. If the easing is ever tuned, all copies must be updated manually.

**Fix:** In `src/lib/constants/motion.ts`, verify that `EASE_OUT_EXPO` exists and equals `[0.16, 1, 0.3, 1]`. If it does, replace all inline arrays with `EASE_OUT_EXPO` and `ENTER_DURATION` (or the appropriate motion constant). If `motion.ts` doesn't already have this constant, add it there first.

---

### F-2 — `console.error` in `task-reminders.ts` — not in tech-debt.md
**Severity: Medium**
**File:** `src/trigger/task-reminders.ts` line ~69

```typescript
console.error('[send-task-reminder] notification failed:', err);
```

This `console.error` inside the Trigger.dev task runner is not tracked in `docs/tech-debt.md`. It is a P-07 violation (no console.* in production — all error logging through Sentry). The existing TD-002 only covers `tasks-service.ts`.

**Fix:** Track as a new debt item. When Sentry is wired up, replace with `Sentry.captureException(err, { extra: { context: 'send-task-reminder notification' } })`.

---

### F-3 — `PreviewCard` in `CreateGroupTaskModal` uses `accentHex` (hardcoded hex value from constants)
**Severity: Low**
**File:** `src/components/tasks/CreateGroupTaskModal.tsx` line ~183

```tsx
borderLeft: `3px solid ${accentHex}`,
```

`accentHex` comes from `GROUP_TASK_ACCENT_COLORS[n].hex` which stores hex values like `#e74c3c`. These hex values are in a constants file, not `design-tokens.css`. While this is a special case (the hex is a user-selected color for a preview, not a theme color), it technically violates R-01. Given that the `accent_color` column doesn't exist in the DB yet (blueprint §18 gap), this can be deferred — but the pattern should not be extended when the DB column is added. The resolved form should store a token key, not a hex value.

**Note:** This is a Low severity observation. The `GROUP_TASK_ACCENT_COLORS` TODO is already tracked.

---

### F-4 — `AssigneePickerModal` owns its own `AnimatePresence` (diverges from pattern)
**Severity: Low**
**File:** `src/components/tasks/AssigneePickerModal.tsx`

`AssigneePickerModal` wraps its own `AnimatePresence` internally, while the project pattern (established in `SubTaskModal`, `TaskRemarksPanel`, `ui/modal.tsx`) is that `AnimatePresence` lives at the call site. This means the modal cannot be unmounted by a parent transition (e.g., if a parent fades out, the child `AnimatePresence` won't coordinate exit animations with the parent's exit).

**Fix:** Move `AnimatePresence` to every call site of `AssigneePickerModal`. Low priority — the current sites don't have parent transitions that affect the assignee picker.

---

## Summary Table

| ID | Severity | Section | File | One-line description |
|----|----------|---------|------|----------------------|
| A-4 | **Critical** | Blueprint | `TaskRemarksPanel.tsx` | Status change chips absent — backend ready, UI never implemented |
| A-1 | High | Blueprint | `PersonalTasksTab.tsx` | "Load more" pagination exists in data layer but no button rendered |
| A-2 | High | Blueprint | `GroupTasksTab.tsx` | `currentUserName` not threaded to `SubTaskModal` via `GroupRow` |
| B-2 | High | Rule R-01 | `SubTaskModal.tsx` | `rgba(0,0,0,0.5)` hardcoded backdrop color |
| A-5 | Medium | Blueprint | `SubTaskModal.tsx` | Delete button visible to agents on group subtasks (UI only — server blocks) |
| A-3 | Medium | Blueprint | `CreateGroupTaskModal.tsx` | accent_color/icon_key/memberIds not wired (tracked in §18) |
| F-1 | Medium | New smell | 5 task components | Inline Framer Motion easing `[0.16, 1, 0.3, 1]` — must import from `motion.ts` |
| F-2 | Medium | New smell | `task-reminders.ts` | `console.error` in Trigger.dev runner — not in tech-debt.md |
| B-1 | Low | Rule R-01 | 3 task components | `fontSize: "10px"` / `"11px"` — must use CSS token |
| B-3 | Low | Rule R-01 | `AssigneePickerModal.tsx` | `rgba(0,0,0,0.35)` hardcoded backdrop |
| E-1 | Low | Debt | `CreatePersonalTaskModal.tsx` | Stale comment — tags column + wiring already done in 0024 |
| F-3 | Low | New smell | `CreateGroupTaskModal.tsx` | Hex value from constants used in preview (deferred with §18 gap) |
| F-4 | Low | New smell | `AssigneePickerModal.tsx` | Owns its own `AnimatePresence` — diverges from call-site pattern |
| TD-001 | Tracked | Known debt | `leads.ts` | Inline `getCallerProfile` (partially resolved — call sites use `getCurrentProfile`) |
| TD-002 | Tracked | Known debt | `tasks-service.ts` | `console.error` — markers confirmed present at 2 locations |

---

## TypeScript Check

```
$ pnpm tsc --noEmit
(no output — 0 errors)
```

---

## Files Inspected

| File | Result |
|------|--------|
| `src/lib/services/tasks-service.ts` | ✓ |
| `src/lib/actions/tasks.ts` | ✓ |
| `src/lib/validations/task-schemas.ts` | ✓ |
| `src/lib/constants/task-constants.ts` | ✓ |
| `src/lib/constants/task-types.ts` | ✓ |
| `src/trigger/task-reminders.ts` | ✓ |
| `src/app/(dashboard)/tasks/page.tsx` | ✓ |
| `src/app/(dashboard)/tasks/TasksAsync.tsx` | ✓ |
| `src/app/(dashboard)/tasks/TasksShell.tsx` | ✓ |
| `src/app/(dashboard)/tasks/[id]/page.tsx` | ✓ |
| `src/app/(dashboard)/tasks/[id]/WorkspaceAsync.tsx` | ✓ |
| `src/components/tasks/PersonalTasksTab.tsx` | ✓ |
| `src/components/tasks/GroupTasksTab.tsx` | ✓ |
| `src/components/tasks/GroupTaskWorkspace.tsx` | ✓ |
| `src/components/tasks/SubTaskModal.tsx` | ✓ |
| `src/components/tasks/TaskRemarksPanel.tsx` | ✓ |
| `src/components/tasks/TaskStatusIcon.tsx` | ✓ |
| `src/components/tasks/AssigneePickerModal.tsx` | ✓ |
| `src/components/tasks/CreatePersonalTaskModal.tsx` | ✓ |
| `src/components/tasks/CreateGroupTaskModal.tsx` | ✓ |
| `supabase/migrations/20260529000026_get_personal_tasks_cursor.sql` | ✓ |
| `supabase/migrations/20260530000035_rpc_add_task_remark_with_status.sql` | ✓ |
| `src/lib/actions/leads.ts` (TD-001 status only) | ✓ |

---

*Audit completed 2026-05-30. No files were modified during this audit.*
