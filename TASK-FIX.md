1. Data Flow Map
   Personal task list load (page render)
   page.tsx → TasksAsync (RSC) → getPersonalTasks(userId, {}) → get_personal_tasks RPC → returns PersonalTasksResult → serialised to TasksShell props

Personal task list reload (mount re-fetch)
PersonalTasksTab mount useEffect → getPersonalTasksAction({status:[...], limit:500}) + getPersonalTaskTagsAction() in Promise.all → action layer → getPersonalTasks / getPersonalTaskTags → DB

Group task list load (page render)
page.tsx → TasksAsync (RSC) → getGroupTasks({}) (React cache()) → get_group_task_summaries RPC → batch profiles query → returns TaskGroupRow[] → serialised to TasksShell props

Subtask load (first accordion expand)
GroupRow useEffect [isExpanded] → getGroupSubtasksAction(groupId) → getGroupSubtasks → tasks SELECT + profiles batch → SubtaskWithAssignee[]

Create subtask
GroupRow.handleAddSubtask → createSubtaskAction({group_id, title, priority, assigned_to}) → Zod → auth → group SELECT (domain check) → admin tasks INSERT → task_remarks (none) → revalidatePath('/tasks'); then setSubtasksLoaded(false) triggers another getGroupSubtasksAction call

Add remark
TaskRemarksPanel.postRemark → addTaskRemarkAction({taskId, content}) → Zod → auth → tasks SELECT (access check) → optionally updateTaskStatusAction → admin task_remarks INSERT → returns TaskRemark → optimistic row confirmed in state; Realtime echo arrives → seenIds dedup guard drops it

Personal tasks on quick-add save
handleQuickAddSave → createPersonalTaskAction({title, priority, due_at, assigned_to}) → Zod → auth → admin tasks INSERT; then second call: getPersonalTasksAction({status:[...], limit:500}) → getPersonalTasks RPC → full list reload

2. Sequential Round-Trip Violations
   File: src/lib/actions/tasks.ts Lines: 676–699 (addTaskRemarkAction)
   Current: updateTaskStatusAction called first (3 awaits inside it: profile, tasks SELECT, tasks UPDATE), then task_remarks INSERT — 4+ sequential awaits
   Cost: ~120–200ms at current latency (4 sequential DB round-trips when statusChange present)
   Fix: Single RPC wrapping status UPDATE + remark INSERT (same pattern as add_lead_call_note migration 0030)

File: src/lib/actions/tasks.ts Lines: 49–71 (canMutateTask)
Current: Called from updateTaskStatusAction (line 306), updateTaskAction (line 361), updateChecklistAction (line 509), updateTaskTagsAction (line 556) — each action issues 1× getCurrentProfile + 1× tasks SELECT + potentially 1× task_groups SELECT for manager role check = 3 sequential awaits per mutation
Cost: ~60–90ms per mutation just for the auth+fetch layer
Fix: Collapse into a single RPC that fetches task + group domain in one query, or batch getCurrentProfile with task fetch via Promise.all (they are independent)

File: src/lib/services/tasks-service.ts Lines: 329–343 (getTaskById)
Current: 2 sequential awaits — tasks SELECT, then getTaskRemarks (which itself does 2 awaits: remarks + profiles)
Cost: ~3 sequential DB round-trips
Fix: Promise.all([task fetch, getTaskRemarks(taskId)]) — they are fully independent

File: src/components/tasks/TaskRemarksPanel.tsx Lines: 116–131
Current: getTaskRemarksAction called in useEffect on mount — separate POST request after page paint
Cost: entire remarks timeline blank until mount + POST completes (~150–300ms after paint)
Fix: Pass initialRemarks from SubTaskModal (which already has the task) via server-prefetch, use the existing getTaskRemarksAction only for refresh

3. Repeated Action Calls
   getPersonalTasksAction fires on every mutation:

Location: PersonalTasksTab.tsx:322-327 — called inside handleQuickAddSave after createPersonalTaskAction succeeds, fetching the full list (limit 500) after every quick-add. This fires a full RPC call after every task creation instead of prepending the new task (the way CreatePersonalTaskModal.onCreated does it at line 1234).
Why: Inconsistency: CreatePersonalTaskModal prepends optimistically. Quick-add refetches. Both create the same type of task.
getPersonalTasksAction fires on mount AND receives initialResult from SSR:

Location: PersonalTasksTab.tsx:222-247 — useEffect on mount fires getPersonalTasksAction({status:[...], limit:500}) unconditionally, even though initialResult was already passed as a prop with up-to-date data from TasksAsync. The mount fetch immediately replaces the SSR data with an identical result.
Why: Mount useEffect has no awareness of initialResult — it always re-fetches.
getPersonalTaskTagsAction fires in pairs:

Location 1: PersonalTasksTab.tsx:232-233 — inside the mount Promise.all
Location 2: PersonalTasksTab.tsx:1239-1241 — inside CreatePersonalTaskModal.onCreated callback when task.tags.length > 0
Why: The second call is conditional on new tags being present, but the first call already fetched all tags. A tag created via quick-add (which always has tags: []) never triggers the second call, but a modal creation with tags fires both in the same mount lifecycle.
listAgentsForDomain fires repeatedly:

Location 1: PersonalTasksTab.tsx:253-268 — useEffect fires on mount for manager+ callers via dynamic import
Location 2: GroupTasksTab.tsx:157-170 (GroupRow) — fires on every accordion expansion that hasn't loaded assignableUsers yet, once per expanded GroupRow instance
Why: Each GroupRow instance maintains its own assignableUsers state and fetches independently. Six groups = potentially six sequential listAgentsForDomain calls if all are expanded in sequence. No domain-level agent cache exists.
getGroupSubtasksAction fires twice on subtask creation:

Location: GroupTasksTab.tsx:205-206 — after createSubtaskAction succeeds, setSubtasksLoaded(false) triggers the useEffect at line 138 which calls getGroupSubtasksAction again
Why: Instead of appending the new subtask to local state (as CreatePersonalTaskModal.onCreated does), the group tab resets subtasksLoaded to force a refetch. 4. Architecture Violations
P-01: useEffect used for data fetching

PersonalTasksTab.tsx:222-247 lines 222–247 — useEffect with Promise.all for initial active tasks + tags fetch on mount. This fires a full duplicate load after every render because initialResult is already provided via SSR.
PersonalTasksTab.tsx:249-268 lines 249–268 — useEffect for listAgentsForDomain on mount (manager+ only). Acceptable client-side secondary fetch, but uses dynamic import() inside useEffect unnecessarily.
GroupTasksTab.tsx:138-149 (GroupRow) lines 138–149 — useEffect [isExpanded] for subtask loading. This pattern is architecturally fine (lazy-load on expand) but the refetch pattern after mutation (item 3 above) compounds it.
TaskRemarksPanel.tsx:116-131 lines 116–131 — useEffect for full remarks load on mount. Panel has no initialRemarks prop even though SubTaskModal holds the task and could have fetched remarks via Promise.all.
A-06: Business logic inside UI components

PersonalTasksTab.tsx:346-358 lines 346–358 — tasksByPriority grouping loop with tag filter logic lives inside the component render path. This is a derived-data computation that belongs in a useMemo at minimum, but the tag filtering (selectedTags.every(t => task.tags.includes(t))) is not complex enough to warrant extraction.
SubTaskModal.tsx:552-558 lines 552–558 — canDelete authorization computed in the UI component. This duplicates authorization logic that already exists in deleteTaskAction. A UI component should not be computing access rules — the action handles it.
GroupRow component in GroupTasksTab.tsx:109-682 — GroupRow is a 573-line component that fetches its own data (subtasks, agents), manages modal state, handles form state, fires mutations, and renders UI. It violates "never create a component that both fetches data and renders UI" (CLAUDE.md Rules).
A-03: Raw Supabase calls in components

TaskRemarksPanel.tsx:143-198 lines 143–198 — createClient() called directly inside the component for Realtime subscription. This is sanctioned per the architecture (Realtime from client components is the established pattern), but the subscription setup bypasses the service layer.
Q-12: Duplicate functions

StatusIcon function defined twice: once in GroupTasksTab.tsx:83-94 lines 83–94, and once in SubTaskModal.tsx:112-123 lines 112–123. Identical signature and behaviour. Neither references the other.
STATUS_CONFIG / status→colour mappings defined independently in GroupTasksTab.tsx (line 72), TaskRemarksPanel.tsx (line 78), SubTaskModal.tsx (uses TASK_STATUS from constants — correct). The GroupTasksTab and TaskRemarksPanel each maintain their own status colour tables rather than using TASK_STATUS from src/lib/constants/task-constants.ts. 5. Component Structure Problems
PersonalTasksTab (PersonalTasksTab.tsx)

OKIE,

Fetches its own data on mount (violation) despite receiving initialResult as a prop
Contains tag filter logic, optimistic state management, section collapse logic, quick-add form, modal orchestration — violates single responsibility
1,276 lines; the completed-task row markup (lines 1062–1200) is a near-duplicate of the active-task row markup (lines 476–658) with minor differences. Could be unified behind a shared TaskRow component.
Should be a Client Component (correct — needs Realtime, optimistic updates, modal state)
GroupRow (inside GroupTasksTab.tsx)

573 lines of mixed concerns: data fetching (subtasks, agents), form state (quick-add), modal state, mutation handlers, AND rendering
Violates CLAUDE.md rule: "never create a component that both fetches data and renders UI"
assignableUsers fetched per-instance — no sharing across instances
GroupTasksTab (GroupTasksTab.tsx)

The outer component is correctly structured (render-only)
Delegates correctly to GroupRow, but GroupRow embedded inside this file breaks the component boundary pattern
SubTaskModal (SubTaskModal.tsx)

Does not fetch its own data (correct)
Zone A + Zone B are both render-only (correct)
canDelete authorization logic should not be in the component (see A-06 above)
Embeds SortableChecklistItem as a local function component — acceptable given it's a contained pattern
TaskRemarksPanel (TaskRemarksPanel.tsx)

Self-sufficient: fetches its own remarks on mount via getTaskRemarksAction
The initialRemarks prop was stripped from the interface (confirmed by the Omit<..., 'initialRemarks'> at line 97) — meaning every modal open triggers a fresh POST request to load remarks, even though the parent could pre-fetch them
Realtime subscription correctly uses removeChannel pattern (compliant with lib/CLAUDE.md)
TasksShell (TasksShell.tsx)

Correctly structured: no data fetching, routing only
activeTab = initialTab (line 44) means the shell ignores the URL on client-side navigation; tab changes push a URL param and trigger a full RSC re-render via router.push. This is intentional (confirmed by CLAUDE.md) but means no optimistic tab switch 6. Database Layer
Function / Query Type Indexes used Issue
get_personal_tasks RPC RPC (SECURITY DEFINER) idx_tasks_tags_gin (partial, personal only), idx_tasks_assigned_to (inferred) None. Correctly handles all cursor cases.
get_group_task_summaries RPC RPC (SECURITY DEFINER) idx_tasks_group_id, idx_tasks_category None. Aggregation in Postgres, 2 round-trips total.
getGroupSubtasks Direct table query idx_tasks_group_id 2 sequential round-trips: tasks SELECT then profiles batch. Fine (established pattern).
getTaskRemarks Direct table query idx_task_remarks_task_id (ASC) 2 sequential round-trips: remarks SELECT then profiles batch. Sequential — could be Promise.all.
getTaskById Direct table query primary key 3 sequential round-trips: task SELECT, then getTaskRemarks (2 more). All independent — all could be parallel.
getPersonalTaskTags Direct table query idx_tasks_tags_active (partial: personal + not completed) Fetches all matching rows and reduces in JS — acceptable for current scale, but returns full tags arrays unnecessarily. A DB-level unnest + DISTINCT would be more efficient.
getTaskGroupById Direct table query primary key Single round-trip, correct.
canMutateTask (action helper) Direct table query primary key on task_groups 1 conditional extra round-trip for manager role domain check. Called from 4 separate actions — each mutation pays this cost.
updateTaskStatusAction Direct table queries primary key getCurrentProfile + task SELECT + canMutateTask = 3 sequential awaits before any write.
addTaskRemarkAction Direct table queries primary key getCurrentProfile + task SELECT + optional updateTaskStatusAction (3 more) + remarks INSERT = up to 6 sequential awaits.
Missing index check against stated list (idx_tasks_agent_active, idx_tasks_assigned_to, idx_tasks_category, idx_tasks_group_id, idx_tasks_module, idx_tasks_priority, idx_tasks_tags_active, idx_tasks_tags_gin):

Read 20260529000025_task_performance_indexes.sql
Now I have the full picture, including the stale get_personal_tasks definition still in migration 0025 (superseded by migration 0026). The complete database layer picture is resolved.

6. Database Layer (continued)
   All 8 stated indexes exist and are correctly defined. One note: migration 0025 contains a superseded version of get_personal_tasks without cursor params. Migration 0026 dropped and recreated it with cursor params — the live function is correct.

getPersonalTaskTags DB efficiency: The query fetches full tags text[] arrays for all matching rows and reduces them in JavaScript. A SELECT DISTINCT unnest(tags) FROM tasks WHERE ... would return a flat string set from the DB, transferring far less data. Not a blocking issue at current scale, but the INCLUDE (tags) on idx_tasks_tags_active only helps if the planner chooses an index-only scan — for SELECT tags it likely does; for unnest(tags) it may not.

7. Priority Fix List
   Mount re-fetch duplicates SSR data — PersonalTasksTab.tsx:222-247 — wasted 500-row RPC call on every page load; user sees stale SSR data flash replaced by identical data — Expected gain: -1 RPC call per page load, eliminates loading flash — Effort: S

Quick-add uses refetch instead of prepend — PersonalTasksTab.tsx:322-327 — fires full 500-row RPC after every task creation; CreatePersonalTaskModal does it correctly with local prepend — Expected gain: -1 RPC call per creation, instant list update — Effort: S

TaskRemarksPanel has no initialRemarks; loads on every modal open — TaskRemarksPanel.tsx:116-131 — every click on a task row triggers a separate POST request before remarks appear — Expected gain: remarks render immediately on modal open for tasks pre-fetched at page load — Effort: M (requires threading initialRemarks from workspace/group tab down through SubTaskModal)

GroupRow fetches listAgentsForDomain per instance — GroupTasksTab.tsx:152-170 — N accordion expansions = N identical listAgentsForDomain calls — Expected gain: 1 call instead of N per session; eliminates duplicate agent fetches — Effort: S (hoist fetch to GroupTasksTab, pass as prop)

Subtask creation triggers full getGroupSubtasksAction refetch — GroupTasksTab.tsx:205-206 — setSubtasksLoaded(false) after creation causes a full reload when a local prepend would suffice — Expected gain: -1 RPC call per subtask creation — Effort: S

StatusIcon duplicated in GroupTasksTab and SubTaskModal — GroupTasksTab.tsx:83-94, SubTaskModal.tsx:112-123 — maintenance risk; status icon rendering will diverge silently — Expected gain: single source of truth — Effort: S (extract to src/components/tasks/TaskStatusIcon.tsx)

Status colour maps duplicated: GroupTasksTab.STATUS_CONFIG, TaskRemarksPanel.STATUS_CHIP_COLORS — GroupTasksTab.tsx:72-79, TaskRemarksPanel.tsx:78-85 — both should consume TASK_STATUS from src/lib/constants/task-constants.ts — Expected gain: single source of truth for status colours — Effort: S

addTaskRemarkAction has 6 sequential awaits when statusChange is present — tasks.ts:640-699 — ~200ms serialised latency on status-change remarks — Expected gain: ~120ms per status-change remark — Effort: L (requires new RPC migration)

canMutateTask fires 3 sequential awaits per mutation; called from 4 actions — tasks.ts:49-71 — auth check + task SELECT + optional group SELECT are all sequential; getCurrentProfile and task SELECT are independent — Expected gain: ~40ms per mutation — Effort: S (parallelise getCurrentProfile and task fetch with Promise.all)

getTaskById has 3 sequential round-trips — tasks-service.ts:329-343 — task SELECT → remarks SELECT → profiles SELECT, all independent — Expected gain: ~80ms — Effort: S (task and remarks fetched with Promise.all; profiles batch is already internal to getTaskRemarks)

GroupRow violates "never fetch + render in same component" — GroupTasksTab.tsx:109-682 — 573-line component owns fetching, form state, modal state, and rendering — Expected gain: cleaner architecture, easier testing, reuse — Effort: L (major refactor)

Completed task row markup duplicated inside PersonalTasksTab — PersonalTasksTab.tsx:1062-1200 — near-identical to active task rows 476–658 — Expected gain: ~130 lines removed, single TaskRow component — Effort: M
