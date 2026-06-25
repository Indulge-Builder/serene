# src/components/tasks — CLAUDE.md

All components in this folder are **display-only**. They receive data via props.
Zero DB calls. Zero business logic. Zero service imports.

Cross-feature data flows through `lib/` only.
Every modal composes `src/components/ui/modal.tsx` — never reimplements chrome.
Every create-task form composes `src/components/ui/TaskFormFields.tsx`
(`FieldLabel`, `FieldError`, `PriorityChipRow`, `DueDateField` + `resolveDueAt`,
`TaskTypeField`) — never re-express a priority chip, due-preset chip, or
task-type radio list inline (dry-audit H-3 + L-4).

---

## Component inventory

### SubTaskModal

`SubTaskModal.tsx` — `'use client'`

The canonical task detail modal. Used for personal tasks and group subtasks. A lead follow-up is just a `personal` task that carries a `task_gia_meta` row (the meta table is the task→lead link), so those open through the same modal — surfaced in My Tasks and on the lead dossier card, never a separate Gia tab.

Props: `open`, `onClose`, `task`, `group?`, `assignee?`, `initialRemarks`, `callerProfile`, `currentUserName?`, `onTaskUpdated?`, `onTaskDeleted?`

`AnimatePresence` is required at the **call site** — the modal does not wrap its own.

**Loaded via `next/dynamic` at every call site** (perf audit G-1 — GroupTasksTab, MyTasksCalendarView, GroupTaskWorkspace). Never statically import the component; `SubTaskModalTaskUpdate` stays an `import type`. See `src/components/CLAUDE.md` "Heavy modal loading rule".

---

### TaskRemarksPanel

`TaskRemarksPanel.tsx` — `'use client'`

Props: `taskId`, `currentUserId`, `currentUserName`, `initialRemarks`, `composerPlaceholder?`

Seeded from `initialRemarks` — no mount fetch. Call sites must fetch remarks via `getTaskRemarksAction` before opening the modal. Realtime channel: `task-remarks-${taskId}-${mountId}`.

---

### TaskCompletionCircle

`TaskCompletionCircle.tsx` — `'use client'`

Props: `checked`, `disabled?`, `highlighted?`, `onToggle`

24px completion control. Used on My Tasks rows and group subtask rows.
**Always pair with `useTaskCompletionToggle` — never re-implement the toggle logic.**

---

### AssigneePickerModal

`AssigneePickerModal.tsx` — `'use client'`

Nested modal (`--z-modal-nested`). Portaled to `document.body`. Domain tabs + client search.

---

### CreatePersonalTaskModal

`CreatePersonalTaskModal.tsx` — `'use client'`

Composes `modal.tsx`. Fields: title, due presets, priority, tags, notes.
`onCreated(task)` — parent prepends synthetic task to active list.

---

### CreateGroupTaskModal

`CreateGroupTaskModal.tsx` — `'use client'`

Composes `modal.tsx` (`max-w-3xl`). Left live-preview + right form fields.
`onCreated(group)` — parent converts to `TaskGroupRow` and prepends.

Loaded via `next/dynamic` in `GroupTasksTab` behind `useMountOnFirstOpen` (perf G-1); `GroupTaskWithMeta` stays an `import type`.

---

### MyTasksCalendarView

`MyTasksCalendarView.tsx` — `'use client'`

The My Tasks tab UI. Two-column layout: `Calendar` (280px sticky left) + date-grouped sections (right).
Mounted from `TasksShell` when `tab=personal`.

Task rows render through the module-scope **`CalendarTaskRow`** (`memo`, perf G-4): hover lives in the parent (`hoveredTaskId`), so the row receives a primitive `highlighted` flag plus `isLast`/`showDue`/`effectiveStatus`/`canComplete` primitives and `useCallback`'d handlers (`handleRowClick`, `setHoveredTaskId`, `handleToggle`). Keep new row props primitive/stable — never re-inline the row JSX.

**Calendar dots = actionable-only (single predicate).** A dot means a day has at least one task still to do. `buildTaskDots` and `groupTasksByDate` (the click filter) both gate on the shared module-scope `isTaskActionable(task, optimisticStatus)` — effective status (optimistic toggle honoured) neither `completed` nor `cancelled`. Both receive `optimisticStatus`. Never give the two functions separate completed-checks: that drift is what caused the phantom-dot bug (a day whose tasks were all done showed a dot but clicked to an empty list). A just-completed task drops its dot immediately because the predicate reads optimistic status. **The old pagination-blindness limitation is GONE (2026-06-25):** the view auto-drains every page of `get_personal_tasks` on mount (the `useEffect` that re-fires while `hasMore && nextCursor`, replacing the manual "Load more" button), so dots/sections reflect the user's FULL active set, not just page 1. The paged RPC stays (LIMIT 51/page, composite cursor) — only the consumption changed. Active tasks are few (completed/cancelled excluded) so the drain is short; a `Loading your tasks…` row shows while it runs. Date-grain keys stay `localKey`/`taskLocalKey` — never `toISOString().slice(0,10)`.

---

### CompletedTasksModal / CompletedTasksButton

`CompletedTasksModal.tsx` + `CompletedTasksButton.tsx` — `'use client'` (2026-06-25)

THE completed-tasks history view. `CompletedTasksButton` (in the `/tasks` header) owns the open state and loads `CompletedTasksModal` via `next/dynamic` on intent (Heavy-modal rule G-1), gated on `open`. The modal composes `ui/modal.tsx`, lists a person's completed **personal tasks AND group subtasks** in one recent-first list with a `Button`-driven keyset "Load more". A `FilterDropdown` person picker shows for manager+ only (agent sees their own, no picker). Display-only rows: `TaskStatusIcon` + title + a Personal/group-title context label + `formatDate(completed_at)`. Read-only — a row does NOT open `SubTaskModal` in v1. Empty via `<EmptyState variant="inline">`. Scope is enforced in the action, not here.

### GroupTasksTab

`GroupTasksTab.tsx` — `'use client'`

Accordion group list. Subtasks lazy-loaded on first expand.
`assignableUsers` fetched **once** at tab level — never per-group.

`GroupRow` is `memo()`-ised (perf G-4): `onToggle` is `(groupId: string) => void` — the parent passes the one stable `useCallback`'d `toggleGroup`, never a per-row arrow. Keep new `GroupRow` props primitive/stable. `SubTaskModal` + `CreateGroupTaskModal` load via `next/dynamic` (the create modal behind `useMountOnFirstOpen`).

---

### GroupTaskWorkspace

`GroupTaskWorkspace.tsx` — `'use client'`

List/board views for a single group. Realtime subscription on tasks for the group.
FAB add-subtask panel. No drag-and-drop.

---

## Service dependency map

| Component           | Data source                                                  |
|---------------------|--------------------------------------------------------------|
| MyTasksCalendarView | `getPersonalTasksAction`, `getPersonalTaskTagsAction` (assignable users via `initialAgents` prop) |
| GroupTasksTab       | `getGroupSubtasksAction`, `createSubtaskAction` (assignable users via `initialAgents` prop) |
| GroupTaskWorkspace  | `createSubtaskAction`, `getGroupSubtasksAction`, `getTaskRemarksAction` |
| SubTaskModal        | `addTaskRemarkAction`, `updateTaskAction`, `updateChecklistAction`, `deleteTaskAction` |
| CreatePersonalTaskModal | `createPersonalTaskAction`                               |
| CreateGroupTaskModal    | `createGroupTaskAction`                                  |
| CompletedTasksModal     | `getCompletedTasksAction`, `getAssignableUsersAction`    |
