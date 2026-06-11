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

The canonical task detail modal. Used for personal tasks, group subtasks, and (via `GiaTasksTab`) Gia follow-up tasks.

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

24px completion control. Used on My Tasks rows, group subtask rows, and Gia task rows.
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

---

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

### GiaTasksTab

`GiaTasksTab.tsx` — `'use client'`

Props:

```
initialTasks:          GiaTask[]      — pre-fetched by TasksAsync
currentUserId:         string
currentUserName:       string
callerRole:            UserRole
callerDomain:          AppDomain
createTrigger?:        number
onFilteredCountChange?: (count: number) => void
onTaskCreated:         (task: GiaTask) => void
```

Groups tasks by date bucket (Today / Tomorrow / future dates / Overdue / No Due Date) using
local-clock date keys (never `toISOString().slice(0,10)` — timezone-correct, same pattern as
`MyTasksCalendarView`). Completed tasks are hidden from date sections (same rule as calendar view).
Framer Motion staggered section entrance (opacity + y). Empty state: Playfair italic.
Uses `TaskCompletionCircle` + `useTaskCompletionToggle` — zero reimplementation.

---

### GiaTaskRow

`GiaTaskRow.tsx` — `'use client'`

Props:

```
task:            GiaTask
effectiveStatus: TaskStatus    — from useTaskCompletionToggle.getEffectiveStatus
onToggle:        (e, task: { id, status }) => void
currentUserId:   string
```

Single Gia task row: completion circle + task-type icon (accent colour) + lead name link +
type label + optional due time. Lead name links to `/leads/[slug ?? id]`.
Overdue `due_at` renders in `var(--color-danger-text)` via `formatTaskDueAt()`. Completed rows at `opacity: 0.5` + strikethrough.

---

### GiaDaySection

`GiaDaySection.tsx` — server-component-safe

Props: `label: string`, `children: ReactNode`

Date-group heading: `.label-micro` style (2xs, medium, uppercase, widest tracking, tertiary).
1px `--theme-paper-border` bottom rule. Same visual weight as `MyTasksCalendarView` date headers.

---

### CreateGiaTaskModal

`CreateGiaTaskModal.tsx` — `'use client'`

Props:

```
open:          boolean
onClose:       () => void
onTaskCreated: (task: GiaTask) => void
callerRole:    UserRole
```

Composes `src/components/ui/modal.tsx` with `maxWidth="max-w-md"`. Five fields (in order):

1. Lead search — 300ms debounced input calling `searchLeadsAction`, dropdown of results (name + phone + domain badge), selection locks the lead; scoped to caller's domain via action layer.
2. Task type — `TaskTypeField` from `ui/TaskFormFields.tsx` (same as `CreateLeadTaskModal`).
3. Priority — `PriorityChipRow` (Urgent / High / Normal), default Normal.
4. Due date + time — `DueDateField` (no presets) wrapping `DatePicker` with `showTime`.
5. Notes — optional `<textarea>` max 1000 chars.

Calls `createLeadTaskAction` from `lib/actions/leads.ts` — **no new action**. On success builds a
`GiaTask` shape by merging the returned `Task` with the selected lead's identity fields and calls
`onTaskCreated`.

**`AnimatePresence` required at call site** (in `TasksShell`) — not inside this component.

---

## Service dependency map

| Component           | Data source                                                  |
|---------------------|--------------------------------------------------------------|
| GiaTasksTab         | `GiaTask[]` via prop (fetched by `TasksAsync` → `getGiaTasksForUser`) |
| GiaTaskRow          | props only                                                   |
| GiaDaySection       | props only                                                   |
| CreateGiaTaskModal  | `searchLeadsAction` (lead picker), `createLeadTaskAction` (create) |
| MyTasksCalendarView | `getPersonalTasksAction`, `getPersonalTaskTagsAction` (assignable users via `initialAgents` prop) |
| GroupTasksTab       | `getGroupSubtasksAction`, `createSubtaskAction` (assignable users via `initialAgents` prop) |
| GroupTaskWorkspace  | `createSubtaskAction`, `getGroupSubtasksAction`, `getTaskRemarksAction` |
| SubTaskModal        | `addTaskRemarkAction`, `updateTaskAction`, `updateChecklistAction`, `deleteTaskAction` |
| CreatePersonalTaskModal | `createPersonalTaskAction`                               |
| CreateGroupTaskModal    | `createGroupTaskAction`                                  |
